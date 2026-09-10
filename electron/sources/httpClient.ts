async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'User-Agent': 'animedl', ...init?.headers },
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return response
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchJson<T>(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<T> {
  const response = await fetchWithTimeout(url, timeoutMs, init)
  return (await response.json()) as T
}

export async function fetchText(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<string> {
  const response = await fetchWithTimeout(url, timeoutMs, init)
  return await response.text()
}

// Возвращает и тело, и финальный URL после редиректов — нужно там, где дальше
// приходится резолвить относительные ссылки (например, сегменты HLS-плейлиста
// заданы относительно адреса, на который сайт мог сделать 302-редирект).
export async function fetchTextWithUrl(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<{ text: string; finalUrl: string }> {
  const response = await fetchWithTimeout(url, timeoutMs, init)
  return { text: await response.text(), finalUrl: response.url || url }
}

export async function fetchBuffer(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<Buffer> {
  const response = await fetchWithTimeout(url, timeoutMs, init)
  return Buffer.from(await response.arrayBuffer())
}
