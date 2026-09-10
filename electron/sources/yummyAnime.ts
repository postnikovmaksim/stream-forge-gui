import type {
  AnimeSearchResult,
  EpisodeInfo,
  EpisodeSourceInfo,
  VideoQualityInfo,
} from '../../shared/animeTypes'
import type { AnimeSourcePlugin, SourceRequestOptions } from '../../shared/sourcePlugin'
import { fetchJson } from './httpClient'
import { extractKodikVideos, isKodikUrl } from './players/kodik'
import { extractSibnetVideos, isSibnetUrl } from './players/sibnet'

// site.yummyani.me — реальный API живёт на отдельном домене api.yani.tv
// (нашлось только по разбору исходников anicli_api, на самом сайте нигде не
// описано). Чистый JSON REST, без скрейпинга HTML:
//   GET /anime?q=<query>&offset=&limit=      — поиск
//   GET /anime/<id>/videos                   — все видео тайтла разом (не по
//                                               сериям — их ещё нужно
//                                               сгруппировать по полю number)
// Проверено вживую реальными запросами при портировании.
const DEFAULT_BASE_URL = 'https://api.yani.tv'

interface SearchItem {
  anime_id: number
  title: string
}

interface SearchResponse {
  response: SearchItem[]
}

interface VideoItem {
  data: { player: string; dubbing: string; player_id: number }
  number: string
  iframe_url: string
}

interface VideosResponse {
  response: VideoItem[]
}

interface EpisodeGroup {
  number: string
  items: VideoItem[]
}

function resolveBaseUrl(options: SourceRequestOptions): string {
  return options.baseUrl || DEFAULT_BASE_URL
}

function normalizeUrl(url: string): string {
  return url.startsWith('//') ? `https:${url}` : url
}

function extractDomain(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname
  } catch {
    return ''
  }
}

async function fetchVideos(
  animeId: string,
  baseUrl: string,
  timeoutMs: number,
): Promise<VideoItem[]> {
  const response = await fetchJson<VideosResponse>(
    `${baseUrl}/anime/${animeId}/videos`,
    timeoutMs,
    { headers: { Accept: 'application/json' } },
  )
  return response.response
}

function groupEpisodes(videos: VideoItem[]): EpisodeGroup[] {
  const order: string[] = []
  const groups = new Map<string, VideoItem[]>()

  for (const item of videos) {
    // Alloha — слишком сложный разбор, сам anicli_api его тоже не реализует
    // ("not implemented player (too complex reverse)").
    if (item.iframe_url.includes('alloha')) continue

    if (!groups.has(item.number)) {
      groups.set(item.number, [])
      order.push(item.number)
    }
    groups.get(item.number)?.push(item)
  }

  return order.map((number) => ({ number, items: groups.get(number) ?? [] }))
}

async function extractProviderVideos(
  iframeUrl: string,
  timeoutMs: number,
): Promise<VideoQualityInfo[]> {
  const url = normalizeUrl(iframeUrl)
  if (isKodikUrl(url)) {
    return extractKodikVideos(url, timeoutMs)
  }
  if (isSibnetUrl(url)) {
    return extractSibnetVideos(url, timeoutMs)
  }
  throw new Error(
    `Плеер "${extractDomain(url)}" пока не поддержан — реализованы Kodik и SibNet. ` +
      'Alloha не реализован нигде, включая справочный anicli_api — слишком сложный разбор.',
  )
}

export const yummyAnimePlugin: AnimeSourcePlugin = {
  id: 'yummy_anime',
  name: 'Yummy Anime',

  async search(query, options): Promise<AnimeSearchResult[]> {
    const baseUrl = resolveBaseUrl(options)
    const url = `${baseUrl}/anime?q=${encodeURIComponent(query)}&offset=0&limit=20`
    const data = await fetchJson<SearchResponse>(url, options.timeoutMs, {
      headers: { Accept: 'application/json' },
    })
    return data.response.map((item) => ({ id: String(item.anime_id), title: item.title }))
  },

  async getEpisodes(animeId, options): Promise<EpisodeInfo[]> {
    const baseUrl = resolveBaseUrl(options)
    const videos = await fetchVideos(animeId, baseUrl, options.timeoutMs)
    const groups = groupEpisodes(videos)
    return groups.map((group, index) => ({ index, title: `Серия ${group.number}` }))
  },

  async getSources(animeId, episodeIndex, options): Promise<EpisodeSourceInfo[]> {
    const baseUrl = resolveBaseUrl(options)
    const videos = await fetchVideos(animeId, baseUrl, options.timeoutMs)
    const group = groupEpisodes(videos)[episodeIndex]
    if (!group) {
      throw new Error(`Эпизод с индексом ${episodeIndex} не найден`)
    }
    return group.items.map((item, index) => ({
      index,
      title: item.data.dubbing,
      domain: extractDomain(item.iframe_url),
    }))
  },

  async getQualities(animeId, episodeIndex, sourceIndex, options): Promise<VideoQualityInfo[]> {
    const baseUrl = resolveBaseUrl(options)
    const videos = await fetchVideos(animeId, baseUrl, options.timeoutMs)
    const item = groupEpisodes(videos)[episodeIndex]?.items[sourceIndex]
    if (!item) {
      throw new Error(`Озвучка/плеер с индексом ${sourceIndex} не найдены`)
    }
    return extractProviderVideos(item.iframe_url, options.timeoutMs)
  },

  async getVideoUrls(
    animeId,
    episodeIndexes,
    sourceIndex,
    options,
  ): Promise<VideoQualityInfo[][]> {
    const baseUrl = resolveBaseUrl(options)
    const videos = await fetchVideos(animeId, baseUrl, options.timeoutMs)
    const groups = groupEpisodes(videos)
    const results: VideoQualityInfo[][] = []

    for (const episodeIndex of episodeIndexes) {
      const item = groups[episodeIndex]?.items[sourceIndex]
      if (!item) {
        results.push([])
        continue
      }
      try {
        results.push(await extractProviderVideos(item.iframe_url, options.timeoutMs))
      } catch {
        results.push([])
      }
    }

    return results
  },
}
