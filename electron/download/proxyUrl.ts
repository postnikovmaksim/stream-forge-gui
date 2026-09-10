import type { ProxySettings } from '../../shared/appSettings'

export function buildSocks5Url(proxy: ProxySettings): string {
  const auth = proxy.user ? `${proxy.user}:${proxy.password}@` : ''
  return `socks5h://${auth}${proxy.host}:${proxy.port}`
}
