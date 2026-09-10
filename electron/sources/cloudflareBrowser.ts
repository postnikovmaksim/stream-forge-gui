import { BrowserWindow } from 'electron'

// astar.bz (и потенциально другие сайты в будущем) защищён Cloudflare
// managed challenge — обычный fetch() получает 403 с JS-загадкой, которую
// решает только реальный браузерный движок. Обычный curl/undici этого не
// могут в принципе, поэтому держим одно скрытое BrowserWindow на весь
// процесс приложения: первый запрос "прогревает" его (реальная навигация +
// ожидание, пока Cloudflare не пропустит), а все последующие используют уже
// авторизованную сессию (cookies) через обычный in-page fetch — быстро, без
// повторного прохождения challenge.
//
// Важно: fetch().text() в Chromium ВСЕГДА декодирует тело как UTF-8,
// игнорируя заголовок Content-Type с другой кодировкой (это ограничение
// самого Fetch API, не баг) — основные страницы astar.bz (DLE-движок) отдают
// windows-1251, но свой плеер (/test/player2/...) внутри того же домена
// отдаёт UTF-8 — разные подсистемы, разная кодировка (проверено вживую:
// заголовок Content-Type у плеера — "charset=UTF-8", у остальных страниц —
// "charset=windows-1251"). Поэтому здесь везде декодируем вручную через
// TextDecoder по ArrayBuffer, но кодировку берём из заголовка САМОГО ответа,
// а не жёстко фиксируем одну на весь сайт.

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

const CHALLENGE_POLL_INTERVAL_MS = 500
const CHALLENGE_MAX_WAIT_MS = 20000

let windowPromise: Promise<BrowserWindow> | null = null
// Промисы, а не просто Set<string> — несколько параллельных запросов (тот же
// источник может дёрнуться дважды почти одновременно, например из
// React StrictMode в dev) не должны каждый по отдельности звать loadURL на
// одном и том же окне: второй loadURL обрывает первый (ERR_ABORTED),
// проверено вживую. Конкурентные вызовы должны ждать ОДИН и тот же прогрев.
const warmupPromises = new Map<string, Promise<void>>()

async function getWindow(): Promise<BrowserWindow> {
  if (!windowPromise) {
    windowPromise = (async () => {
      const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
      win.webContents.setUserAgent(USER_AGENT)
      return win
    })()
  }
  return windowPromise
}

async function waitForChallengeToClear(win: BrowserWindow): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < CHALLENGE_MAX_WAIT_MS) {
    const title = await win.webContents.executeJavaScript('document.title').catch(() => '')
    if (!/just a moment/i.test(title) && title.length > 0) return
    await new Promise((resolve) => setTimeout(resolve, CHALLENGE_POLL_INTERVAL_MS))
  }
}

async function ensureWarmedUp(win: BrowserWindow, origin: string): Promise<void> {
  let promise = warmupPromises.get(origin)
  if (!promise) {
    promise = (async () => {
      await win.loadURL(origin)
      await waitForChallengeToClear(win)
    })()
    warmupPromises.set(origin, promise)
  }
  try {
    await promise
  } catch (error) {
    // не кешируем неудачный прогрев — следующий вызов попробует заново
    warmupPromises.delete(origin)
    throw error
  }
}

export interface CfFetchOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
}

export interface CfFetchResult {
  status: number
  text: string
}

// windows-1251 не поддержан TextEncoder (только UTF-8 на encode), поэтому
// для отправки кириллицы в теле запроса (например, поискового) кодируем
// вручную по таблице символов, которую реально использует astar.bz/DLE.
export function encodeWin1251Percent(str: string): string {
  let out = ''
  for (const ch of str) {
    const code = ch.codePointAt(0) ?? 0
    let byte: number
    if (code < 0x80) {
      if (/[A-Za-z0-9_.\-~]/.test(ch)) {
        out += ch
        continue
      }
      byte = code
    } else if (code === 0x401) {
      byte = 0xa8 // Ё
    } else if (code === 0x451) {
      byte = 0xb8 // ё
    } else if (code >= 0x410 && code <= 0x44f) {
      byte = code - 0x410 + 0xc0 // А-я
    } else {
      byte = 0x3f // не поддержанный символ — '?'
    }
    out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }
  return out
}

export async function cfFetch(
  url: string,
  options: CfFetchOptions,
  timeoutMs: number,
): Promise<CfFetchResult> {
  const win = await getWindow()
  const origin = new URL(url).origin

  await Promise.race([
    ensureWarmedUp(win, origin),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Cloudflare: превышено время ожидания прохождения проверки')), timeoutMs),
    ),
  ])

  const script = `
    (async function() {
      const resp = await fetch(${JSON.stringify(url)}, {
        method: ${JSON.stringify(options.method ?? 'GET')},
        headers: ${JSON.stringify(options.headers ?? {})},
        body: ${options.body !== undefined ? JSON.stringify(options.body) : 'undefined'},
      });
      const buf = await resp.arrayBuffer();
      const contentType = resp.headers.get('content-type') || '';
      const charsetMatch = contentType.match(/charset=([^;]+)/i);
      const charset = charsetMatch ? charsetMatch[1].trim() : 'windows-1251';
      const text = new TextDecoder(charset).decode(buf);
      return { status: resp.status, text };
    })()
  `

  return Promise.race([
    win.webContents.executeJavaScript(script) as Promise<CfFetchResult>,
    new Promise<CfFetchResult>((_, reject) =>
      setTimeout(() => reject(new Error('astar.bz: превышено время ожидания запроса')), timeoutMs),
    ),
  ])
}
