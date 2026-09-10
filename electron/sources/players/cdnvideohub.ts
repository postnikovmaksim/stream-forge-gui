import type { VideoQualityInfo } from '../../../shared/animeTypes'
import { fetchJson } from '../httpClient'

// CDNVideoHub — сторонний видео-агрегатор, встраиваемый через кастомный тег
// <video-player data-publisher-id="..." data-title-id="..." data-aggregator="...">.
// Двухшаговый REST JSON API (см. anicli_api/player/cdnvideohub.py и
// cdnvideohub_parser.py как эталон формы ответов — сверено вживую):
//   1) playlist по (pub, aggr, id) — плоский список пар (серия, озвучка);
//   2) video/{vkId} — прямые ссылки на конкретное видео.
// Само видео хостится на CDN VK/Odnoklassniki (*.vkuser.net, *.okcdn.ru).
//
// ВАЖНО: этот CDN блокирует запросы с браузероподобным User-Agent (реальный
// Chrome/Firefox/... UA-строка) — отдаёт 400 Bad Request даже на совершенно
// свежую, ещё ни разу не запрошенную подписанную ссылку. При этом ЛЮБОЙ
// не-браузерный UA (curl/*, пустой, python-requests/* и т.д.) проходит
// нормально. Проверено вживую многократно на свежих ссылках: дело именно в
// значении заголовка User-Agent, а не в устаревании/одноразовости ссылки,
// не в TLS-фингерпринте (curl_cffi с имперсонацией Chrome тоже получает 400)
// и не в рейт-лимите (bare curl сразу после проваленного запроса с тем же
// URL получает 200). Поэтому здесь и передаём этот заголовок вместе со
// ссылками — DownloadQueue уже умеет прокидывать per-quality headers в
// yt-dlp через --add-header.
const NON_BROWSER_USER_AGENT = 'curl/8.7.1'

export interface CdnVideoHubItem {
  cvhId: string
  vkId: string
  voiceStudio?: string
  voiceType: string
  season: number
  episode: number
}

interface CdnVideoHubPlaylistResponse {
  titleName: string
  isSerial: boolean
  items: CdnVideoHubItem[]
}

interface CdnVideoHubVideoResponse {
  sources: Record<string, string>
}

// Соответствие ключей ответа /video/{vkId} качеству в "p" — как в anicli_api.
const QUALITY_FIELDS: { field: string; quality: string }[] = [
  { field: 'mpeg4kUrl', quality: '4096' },
  { field: 'mpeg2kUrl', quality: '2048' },
  { field: 'mpegQhdUrl', quality: '1440' },
  { field: 'mpegFullHdUrl', quality: '1080' },
  { field: 'mpegHighUrl', quality: '720' },
  { field: 'mpegMediumUrl', quality: '480' },
  { field: 'mpegLowUrl', quality: '360' },
  { field: 'mpegLowestUrl', quality: '240' },
  { field: 'mpegTinyUrl', quality: '144' },
]

export function dubLabel(item: CdnVideoHubItem): string {
  return item.voiceStudio ?? item.voiceType
}

export async function fetchCdnVideoHubPlaylist(
  pub: string,
  aggr: string,
  id: string,
  timeoutMs: number,
): Promise<CdnVideoHubItem[]> {
  const resp = await fetchJson<CdnVideoHubPlaylistResponse>(
    `https://plapi.cdnvideohub.com/api/v1/player/sv/playlist?pub=${pub}&aggr=${aggr}&id=${id}`,
    timeoutMs,
  )
  return resp.items
}

export async function fetchCdnVideoHubQualities(
  vkId: string,
  timeoutMs: number,
): Promise<VideoQualityInfo[]> {
  const resp = await fetchJson<CdnVideoHubVideoResponse>(
    `https://plapi.cdnvideohub.com/api/v1/player/sv/video/${vkId}`,
    timeoutMs,
  )

  const qualities: VideoQualityInfo[] = []
  for (const { field, quality } of QUALITY_FIELDS) {
    const url = resp.sources[field]
    if (url) {
      qualities.push({ quality, type: 'mp4', url, headers: { 'User-Agent': NON_BROWSER_USER_AGENT } })
    }
  }

  if (qualities.length === 0) {
    throw new Error('CDNVideoHub: не найдено ни одной ссылки на видео')
  }

  return qualities
}
