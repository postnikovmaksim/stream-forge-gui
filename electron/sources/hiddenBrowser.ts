import { BrowserWindow } from 'electron'

// Общая инфраструктура для сайтов за анти-бот защитой (Cloudflare managed
// challenge у astar.bz, DDoS-Guard у animelib.org и т.п.), которым обычный
// fetch()/curl не может пройти в принципе. Держим одно скрытое BrowserWindow
// на весь процесс приложения — первый запрос к origin "прогревает" его через
// настоящую навигацию (конкретный смысл прогрева у каждой защиты свой, задаётся
// вызывающим кодом), все последующие запросы идут через in-page fetch уже
// внутри прогретой сессии (cookies), без повторного прохождения защиты.
//
// Выделено в отдельный модуль при портировании animelib.org — второй сайт с
// такой же проблемой (в этот раз DDoS-Guard, а не Cloudflare), но с более
// простым прогревом (без поллинга — достаточно дождаться загрузки страницы).

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

let windowPromise: Promise<BrowserWindow> | null = null

async function getHiddenWindow(): Promise<BrowserWindow> {
  if (!windowPromise) {
    windowPromise = (async () => {
      const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
      win.webContents.setUserAgent(USER_AGENT)
      return win
    })()
  }
  return windowPromise
}

// Промисы, а не просто Set<string> — несколько параллельных запросов (тот же
// источник может дёрнуться дважды почти одновременно, например из React
// StrictMode в dev) не должны каждый по отдельности звать loadURL на одном и
// том же окне: второй loadURL обрывает первый (ERR_ABORTED) — проверено
// вживую на astar.bz. Конкурентные вызовы должны ждать ОДИН и тот же прогрев.
const warmupPromises = new Map<string, Promise<void>>()

// warmup вызывается не более одного раза на origin (пока не провалится) —
// конкретную логику прогрева (простая навигация, ожидание конкретного
// challenge и т.п.) задаёт вызывающая сторона.
export async function ensureWarmedUp(
  origin: string,
  warmup: (win: BrowserWindow) => Promise<void>,
): Promise<BrowserWindow> {
  const win = await getHiddenWindow()

  let promise = warmupPromises.get(origin)
  if (!promise) {
    promise = warmup(win)
    warmupPromises.set(origin, promise)
  }
  try {
    await promise
  } catch (error) {
    // не кешируем неудачный прогрев — следующий вызов попробует заново
    warmupPromises.delete(origin)
    throw error
  }
  return win
}
