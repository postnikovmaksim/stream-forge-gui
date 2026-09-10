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
