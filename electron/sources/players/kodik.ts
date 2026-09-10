import type { VideoQualityInfo } from '../../../shared/animeTypes'
import { fetchJson, fetchText } from '../httpClient'

// Kodik (kodikplayer.com и алиасы вроде kodik.info) — самый массовый embed-плеер
// на русскоязычных сайтах с аниме/сериалами, используется не только animego.
// Сам не отдаёт прямую ссылку на видео: страница плеера несёт подписанные
// antihotlink-параметры (d/d_sign/pd/pd_sign/ref/ref_sign — HMAC, привязаны к
// referrer'у и времени), которые нужно вернуть его же API вместе с type/hash/id
// самого видео. Путь до API лежит в base64 внутри JS-бандла плеера и время от
// времени меняется. Ответ API несёт ссылки на m3u8, зашифрованные кастомным
// ROT18-шифром + base64.
//
// Полностью реверс-инжинирено не с нуля, а по актуальным исходникам
// anicli_api (справочник для портирования, не сам код):
//   https://github.com/vypivshiy/anicli-api/blob/master/anicli_api/player/kodik.py
//   https://github.com/vypivshiy/anicli-api/blob/master/anicli_api/player/parsers/kodik_parser.py
// Каждый шаг перепроверен вживую реальными запросами при портировании
// (включая финальную проверку, что yt-dlp распознаёт итоговый m3u8 как
// m3u8_native, а не просто валидный JSON).

// Тот же критерий, что использует сам anicli_api (URL_RULE в kodik.py) —
// по структуре пути, а не по конкретному домену: у Kodik много доменов-зеркал,
// но путь /serial|season|video|film/<id>/<hash>/<quality>p всегда одинаковый.
// "uv" добавлен сверх anicli_api — найден вживую на shiza-project.com
// (kodikplayer.com/uv/<id>/<hash>/720p, страница с той же структурой
// vInfo.type/hash/id, что и остальные — просто другое значение vInfo.type).
const KODIK_URL_PATTERN =
  /^https:\/\/(www\.)?[\w-]{5,32}\.\w{2,6}\/(?:serial?|season|video|film|uv)\/\d+\/\w+\/\d{3,4}p/

interface KodikPagePayload {
  d: string
  d_sign: string
  pd: string
  pd_sign: string
  ref: string
  ref_sign: string
  type: string
  hash: string
  id: string
}

interface KodikApiResponse {
  links?: Record<string, { src: string }[]>
}

function normalizePlayerUrl(url: string): string {
  return url.startsWith('//') ? `https:${url}` : url
}

export function isKodikUrl(url: string): boolean {
  return KODIK_URL_PATTERN.test(normalizePlayerUrl(url))
}

function matchOrThrow(html: string, pattern: RegExp, label: string): string {
  const match = html.match(pattern)
  if (!match) {
    throw new Error(`Kodik: не найден параметр "${label}" на странице плеера`)
  }
  return match[1]
}

function extractPagePayload(html: string): KodikPagePayload {
  return {
    d: matchOrThrow(html, /var\s*domain\s+=\s+['"](.*?)['"];/, 'domain'),
    d_sign: matchOrThrow(html, /var\s*d_sign\s+=\s+['"](.*?)['"];/, 'd_sign'),
    pd: matchOrThrow(html, /var\s*pd\s+=\s+['"](.*?)['"];/, 'pd'),
    pd_sign: matchOrThrow(html, /var\s*pd_sign\s+=\s+['"](.*?)['"];/, 'pd_sign'),
    ref: matchOrThrow(html, /var\s*ref\s+=\s+['"](.*?)['"];/, 'ref'),
    ref_sign: matchOrThrow(html, /var\s*ref_sign\s+=\s+['"](.*?)['"];/, 'ref_sign'),
    type: matchOrThrow(html, /vInfo\.type = ['"](.*?)['"];/, 'type'),
    hash: matchOrThrow(html, /vInfo\.hash = ['"](.*?)['"];/, 'hash'),
    id: matchOrThrow(html, /vInfo\.id = ['"](.*?)['"];/, 'id'),
  }
}

function extractPlayerJsPath(html: string): string {
  const match = html.match(/<script[^>]+src="([^"]*assets\/js[^"]*)"/)
  if (!match) {
    throw new Error('Kodik: не найден путь до JS-плеера на странице')
  }
  return match[1]
}

async function resolveApiPath(playerJsUrl: string, timeoutMs: number): Promise<string> {
  const js = await fetchText(playerJsUrl, timeoutMs)
  const match = js.match(/\$\.ajax[^)]+atob\(["'](\w+=)["']\)/)
  if (!match) {
    throw new Error('Kodik: не найден путь до API внутри JS-плеера (сайт мог измениться)')
  }
  return Buffer.from(match[1], 'base64').toString('utf-8')
}

function decryptRot18(value: string): string {
  let result = ''
  for (const char of value) {
    const code = char.charCodeAt(0)
    if (char >= 'A' && char <= 'Z') {
      result += String.fromCharCode(((code - 65 + 18) % 26) + 65)
    } else if (char >= 'a' && char <= 'z') {
      result += String.fromCharCode(((code - 97 + 18) % 26) + 97)
    } else {
      result += char
    }
  }
  return result
}

function decodeVideoUrl(encoded: string): string {
  if (encoded.endsWith('.m3u8')) {
    return encoded.startsWith('https') ? encoded : `https:${encoded}`
  }

  let base64 = decryptRot18(encoded)
  while (base64.length % 4 !== 0) base64 += '='

  const decoded = Buffer.from(base64, 'base64').toString('utf-8')
  return decoded.startsWith('https') ? decoded : `https:${decoded}`
}

export async function extractKodikVideos(
  playerUrl: string,
  timeoutMs: number,
): Promise<VideoQualityInfo[]> {
  const url = normalizePlayerUrl(playerUrl)
  const netloc = new URL(url).host

  const pageHtml = await fetchText(url, timeoutMs)

  if (pageHtml.includes('Видео не найдено')) {
    throw new Error('Kodik: видео удалено или не найдено')
  }

  const payload = extractPagePayload(pageHtml)
  const playerJsPath = extractPlayerJsPath(pageHtml)
  const apiPath = await resolveApiPath(`https://${netloc}${playerJsPath}`, timeoutMs)

  const body = new URLSearchParams({
    ...payload,
    bad_user: 'false',
    info: '{}',
    cdn_is_working: 'true',
  })

  const response = await fetchJson<KodikApiResponse>(`https://${netloc}${apiPath}`, timeoutMs, {
    method: 'POST',
    body,
    headers: {
      origin: `https://${netloc}`,
      referer: url,
      accept: 'application/json, text/javascript, */*; q=0.01',
    },
  })

  const links = response.links
  if (!links) {
    throw new Error('Kodik: API не вернул ссылки на видео')
  }

  const qualities: VideoQualityInfo[] = []

  if (links['360']?.[0]) {
    qualities.push({ quality: '360', type: 'm3u8', url: decodeVideoUrl(links['360'][0].src) })
  }
  if (links['480']?.[0]) {
    qualities.push({ quality: '480', type: 'm3u8', url: decodeVideoUrl(links['480'][0].src) })
  }
  if (links['720']?.[0]) {
    // у Kodik ключ "720" исторически отдаёт ссылку на 480p-файл — чинится
    // заменой сегмента имени файла (так же делает anicli_api).
    const url720 = decodeVideoUrl(links['720'][0].src).replace('/480.mp4:', '/720.mp4:')
    qualities.push({ quality: '720', type: 'm3u8', url: url720 })
  }

  return qualities
}
