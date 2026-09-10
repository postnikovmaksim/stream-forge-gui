import type {
  AnimeSearchResult,
  EpisodeInfo,
  EpisodeSourceInfo,
  VideoQualityInfo,
} from '../../shared/animeTypes'
import type { AnimeSourcePlugin, SourceRequestOptions } from '../../shared/sourcePlugin'
import { fetchJson } from './httpClient'

// API описан здесь: https://anilibria.top/api/docs/v1
// (домен сайта — anilibria.top, сам API отдаётся с aniliberty.top; оба варианта
// исторически всплывали в описаниях библиотеки anicli_api, проверено вживую
// curl'ом при портировании).
const DEFAULT_BASE_URL = 'https://aniliberty.top/api/v1'

interface AniLibertySearchItem {
  id: number
  name: { main: string; english: string | null }
}

interface AniLibertyEpisode {
  name: string | null
  ordinal: number
  hls_480: string | null
  hls_720: string | null
  hls_1080: string | null
}

interface AniLibertyRelease {
  episodes: AniLibertyEpisode[]
}

function resolveBaseUrl(options: SourceRequestOptions): string {
  return options.baseUrl || DEFAULT_BASE_URL
}

function episodeQualities(episode: AniLibertyEpisode): VideoQualityInfo[] {
  const qualities: VideoQualityInfo[] = []
  if (episode.hls_480) qualities.push({ quality: '480', type: 'm3u8', url: episode.hls_480 })
  if (episode.hls_720) qualities.push({ quality: '720', type: 'm3u8', url: episode.hls_720 })
  if (episode.hls_1080) qualities.push({ quality: '1080', type: 'm3u8', url: episode.hls_1080 })
  return qualities
}

async function fetchRelease(animeId: string, options: SourceRequestOptions) {
  const url = `${resolveBaseUrl(options)}/anime/releases/${animeId}`
  return fetchJson<AniLibertyRelease>(url, options.timeoutMs)
}

export const anilibriaPlugin: AnimeSourcePlugin = {
  id: 'anilibria',
  name: 'AniLibria',

  async search(query, options): Promise<AnimeSearchResult[]> {
    const url = `${resolveBaseUrl(options)}/app/search/releases?query=${encodeURIComponent(query)}`
    const items = await fetchJson<AniLibertySearchItem[]>(url, options.timeoutMs)
    return items.map((item) => ({ id: String(item.id), title: item.name.main }))
  },

  async getEpisodes(animeId, options): Promise<EpisodeInfo[]> {
    const release = await fetchRelease(animeId, options)
    return release.episodes.map((episode, index) => ({
      index,
      title: episode.name ?? `Серия ${episode.ordinal}`,
    }))
  },

  async getSources(): Promise<EpisodeSourceInfo[]> {
    // У AniLibria одна собственная озвучка — выбора студии/плеера здесь нет,
    // в отличие от агрегаторов вроде AnimeGo.
    return [{ index: 0, title: 'AniLibria', domain: '' }]
  },

  async getQualities(animeId, episodeIndex, _sourceIndex, options): Promise<VideoQualityInfo[]> {
    const release = await fetchRelease(animeId, options)
    const episode = release.episodes[episodeIndex]
    if (!episode) {
      throw new Error(`Эпизод с индексом ${episodeIndex} не найден`)
    }
    return episodeQualities(episode)
  },

  async getVideoUrls(
    animeId,
    episodeIndexes,
    _sourceIndex,
    options,
  ): Promise<VideoQualityInfo[][]> {
    const release = await fetchRelease(animeId, options)
    return episodeIndexes.map((index) => {
      const episode = release.episodes[index]
      return episode ? episodeQualities(episode) : []
    })
  },
}
