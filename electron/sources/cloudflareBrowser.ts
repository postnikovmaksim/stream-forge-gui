import type { BrowserWindow } from 'electron'
import { ensureWarmedUp } from './hiddenBrowser'

// astar.bz защищён Cloudflare managed challenge — обычный fetch() получает
// 403 с JS-загадкой, которую решает только реальный браузерный движок.
// Обычный curl/undici этого не могут в принципе. Прогрев скрытого окна и
// кеширование прогретой сессии между запросами — общая инфраструктура в
// hiddenBrowser.ts (используется также animelib.org, у которого другая
// защита — DDoS-Guard — и более простой прогрев без поллинга).
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

const CHALLENGE_POLL_INTERVAL_MS = 500
const CHALLENGE_MAX_WAIT_MS = 20000

async function waitForChallengeToClear(win: BrowserWindow): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < CHALLENGE_MAX_WAIT_MS) {
    const title = await win.webContents.executeJavaScript('document.title').catch(() => '')
    if (!/just a moment/i.test(title) && title.length > 0) return
    await new Promise((resolve) => setTimeout(resolve, CHALLENGE_POLL_INTERVAL_MS))
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
  const origin = new URL(url).origin

  const win = await Promise.race([
    ensureWarmedUp(origin, async (w) => {
      await w.loadURL(origin)
      await waitForChallengeToClear(w)
    }),
    new Promise<never>((_, reject) =>
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
