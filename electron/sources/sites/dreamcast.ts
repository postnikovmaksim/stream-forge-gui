import type {
  AnimeSearchResult,
  EpisodeInfo,
  EpisodeSourceInfo,
  VideoQualityInfo,
} from '../../../shared/animeTypes'
import type { AnimeSourcePlugin, SourceRequestOptions } from '../../../shared/sourcePlugin'
import { fetchJson, fetchText } from '../httpClient'
import { extractPlaylist, type DreamcastPlaylist } from '../players/dreamcastChipers'

// dreamerscast.com — сайт со своим собственным (не сторонним) плеером: нет
// выбора озвучки или отдельных плееров, один эпизод = один adaptive-манифест
// (hls+dash в одном) без выбора конкретного числового качества. Поиск и
// онгоинг — обычный REST JSON (POST с form-data), а вот извлечение самого
// плейлиста требует полного реверса обфускации плеера — см.
// players/dreamcastChipers.ts. Разобрано по актуальным исходникам anicli_api
// как справочнику:
//   https://github.com/vypivshiy/anicli-api/blob/master/anicli_api/source/dreamcast.py
// `id` в AnimeSearchResult — это относительный путь страницы тайтла
// (например "/home/release/554-..."), а не числовой id: детальная страница
// на этом сайте открывается только по полному slug-пути, отдельного REST по
// числовому id нет.
const DEFAULT_BASE_URL = 'https://dreamerscast.com'

interface ReleaseJson {
  id: number
  russian: string | null
  original: string
  url: string
}

interface DreamCastResponseJson {
  releases: ReleaseJson[]
}

function resolveBaseUrl(options: SourceRequestOptions): string {
  return options.baseUrl || DEFAULT_BASE_URL
}

async function searchOrOngoing(
  query: string,
  baseUrl: string,
  timeoutMs: number,
): Promise<ReleaseJson[]> {
  const data = await fetchJson<DreamCastResponseJson>(`${baseUrl}/`, timeoutMs, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: baseUrl,
      Referer: `${baseUrl}/`,
    },
    body: new URLSearchParams({ search: query, status: '', pageSize: '16', pageNumber: '1' }),
  })
  return data.releases
}

function extractPlayerJsEncoded(html: string): string {
  const match = html.match(/new Playerjs\("(.*?)"\)/)
  if (!match) {
    throw new Error('Dreamcast: не найден блок плеера на странице аниме')
  }
  return match[1]
}

function extractPlayerJsUrl(html: string, baseUrl: string): string {
  const match = html.match(/<script[^>]+src="(\/js\/playerjs.*?)"/)
  if (!match) {
    throw new Error('Dreamcast: не найден путь до playerjs на странице аниме')
  }
  return `${baseUrl}${match[1]}`
}

async function fetchPlaylist(
  urlPath: string,
  baseUrl: string,
  timeoutMs: number,
): Promise<DreamcastPlaylist> {
  const html = await fetchText(`${baseUrl}${urlPath}`, timeoutMs, {
    headers: { Referer: `${baseUrl}/` },
  })
  const playerEncoded = extractPlayerJsEncoded(html)
  const playerJsUrl = extractPlayerJsUrl(html, baseUrl)
  const playerJs = await fetchText(playerJsUrl, timeoutMs)
  return extractPlaylist(playerJs, playerEncoded)
}

function pickVideoQuality(file: string): VideoQualityInfo {
  const candidates = file.split(' or ').map((url) => url.trim())
  const hls = candidates.find((url) => url.includes('.m3u8'))
  const dash = candidates.find((url) => url.includes('.mpd'))
  const chosen = hls ?? dash ?? candidates[0]
  return {
    quality: 'auto',
    type: chosen.includes('.m3u8') ? 'm3u8' : 'mpd',
    url: chosen,
  }
}

export const dreamcastPlugin: AnimeSourcePlugin = {
  id: 'dreamcast',
  name: 'DreamCast',

  async search(query, options): Promise<AnimeSearchResult[]> {
    const baseUrl = resolveBaseUrl(options)
    const releases = await searchOrOngoing(query, baseUrl, options.timeoutMs)
    return releases.map((release) => ({ id: release.url, title: release.russian || release.original }))
  },

  async getEpisodes(animeId, options): Promise<EpisodeInfo[]> {
    const baseUrl = resolveBaseUrl(options)
    const playlist = await fetchPlaylist(animeId, baseUrl, options.timeoutMs)
    return playlist.file.map((item, index) => ({ index, title: item.title }))
  },

  async getSources(): Promise<EpisodeSourceInfo[]> {
    return [{ index: 0, title: 'DreamCast', domain: 'dreamerscast.com' }]
  },

  async getQualities(
    animeId,
    episodeIndex,
    _sourceIndex,
    options,
  ): Promise<VideoQualityInfo[]> {
    const baseUrl = resolveBaseUrl(options)
    const playlist = await fetchPlaylist(animeId, baseUrl, options.timeoutMs)
    const item = playlist.file[episodeIndex]
    if (!item) {
      throw new Error(`Эпизод с индексом ${episodeIndex} не найден`)
    }
    return [pickVideoQuality(item.file)]
  },

  async getVideoUrls(
    animeId,
    episodeIndexes,
    _sourceIndex,
    options,
  ): Promise<VideoQualityInfo[][]> {
    const baseUrl = resolveBaseUrl(options)
    const playlist = await fetchPlaylist(animeId, baseUrl, options.timeoutMs)
    return episodeIndexes.map((episodeIndex) => {
      const item = playlist.file[episodeIndex]
      return item ? [pickVideoQuality(item.file)] : []
    })
  },
}
