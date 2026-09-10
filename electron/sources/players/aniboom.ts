import type { VideoQualityInfo } from '../../../shared/animeTypes'
import { fetchText } from '../httpClient'

// AniBoom (aniboom.one) — плеер, которым исторически владеет сама команда
// animego. Проще Kodik: страница отдаёт <video id="video" data-parameters="...">
// с HTML-экранированным JSON прямо в атрибуте — ссылки на hls/dash лежат в нём
// без дополнительного шифрования. Для скачивания (не только для получения
// ссылки) нужны конкретные заголовки, иначе CDN может вернуть 403 —
// подтверждено исходниками anicli_api (player/aniboom.py), даже если конкретно
// в момент портирования 403 без них не воспроизвёлся.
// Разобрано по актуальным исходникам anicli_api как справочнику:
//   https://github.com/vypivshiy/anicli-api/blob/master/anicli_api/player/aniboom.py
//   https://github.com/vypivshiy/anicli-api/blob/master/anicli_api/player/parsers/aniboom_parser.py
// Подтверждено на практике то, о чём предупреждает anicli_api: сайт
// непредсказуемо отдаёт hls/dash то как вложенный JSON-объект, то как
// JSON-строку с этим же объектом внутри (поймал оба варианта на одном и том
// же эпизоде в двух соседних запросах) — код ниже понимает оба.

const _URL_PATTERN = /^https:\/\/(www\.)?aniboom\.one\//

const VIDEO_HEADERS: Record<string, string> = {
  Referer: 'https://aniboom.one/',
  'Accept-Language': 'ru-RU',
  Origin: 'https://aniboom.one',
}

interface AniboomStreamSrc {
  src: string
  type: string
}

interface AniboomDataParameters {
  hls?: AniboomStreamSrc | string
  dash?: AniboomStreamSrc | string
}

function normalizePlayerUrl(url: string): string {
  return url.startsWith('//') ? `https:${url}` : url
}

export function isAniboomUrl(url: string): boolean {
  return _URL_PATTERN.test(normalizePlayerUrl(url))
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function parseStreamField(value: AniboomStreamSrc | string | undefined): AniboomStreamSrc | null {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value) as AniboomStreamSrc
  } catch {
    return null
  }
}

export async function extractAniboomVideos(
  playerUrl: string,
  timeoutMs: number,
): Promise<VideoQualityInfo[]> {
  const html = await fetchText(normalizePlayerUrl(playerUrl), timeoutMs, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: 'https://animego.me/',
    },
  })

  const match = html.match(/id="video"[\s\S]*?data-parameters="([^"]*)"/)
  if (!match) {
    throw new Error('AniBoom: не найден блок с параметрами видео на странице плеера')
  }

  let data: AniboomDataParameters
  try {
    data = JSON.parse(decodeHtmlEntities(match[1])) as AniboomDataParameters
  } catch {
    throw new Error('AniBoom: не удалось разобрать параметры видео (сайт мог измениться)')
  }

  const hls = parseStreamField(data.hls)
  const dash = parseStreamField(data.dash)

  // AniBoom обычно отдаёт единственное качество 1080p и в hls, и в dash
  // одновременно — берём hls (проверенный путь в этом приложении, как у
  // anilibria/Kodik), dash оставляем только как запасной вариант, чтобы не
  // плодить две записи с одинаковым quality="1080" в списке качеств.
  if (hls?.src) {
    return [{ quality: '1080', type: 'm3u8', url: hls.src, headers: VIDEO_HEADERS }]
  }
  if (dash?.src) {
    return [{ quality: '1080', type: 'mpd', url: dash.src, headers: VIDEO_HEADERS }]
  }

  throw new Error('AniBoom: плеер не вернул ни hls, ни dash ссылку на видео')
}
