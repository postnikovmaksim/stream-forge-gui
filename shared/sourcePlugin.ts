import type {
  AnimeSearchResult,
  EpisodeInfo,
  EpisodeSourceInfo,
  VideoQualityInfo,
} from './animeTypes'
import type { ProxySettings } from './appSettings'

export interface SourceRequestOptions {
  baseUrl: string
  timeoutMs: number
  proxy: ProxySettings
}

/**
 * Контракт источника парсинга. Один плагин = один сайт.
 * Методы повторяют смысл функций старого backend.py (search_anime,
 * get_episodes, get_sources, get_video_qualities, get_videos_urls),
 * чтобы миграция логики шла 1:1.
 */
export interface AnimeSourcePlugin {
  id: string
  name: string

  search(query: string, options: SourceRequestOptions): Promise<AnimeSearchResult[]>

  getEpisodes(animeId: string, options: SourceRequestOptions): Promise<EpisodeInfo[]>

  getSources(
    animeId: string,
    episodeIndex: number,
    options: SourceRequestOptions,
  ): Promise<EpisodeSourceInfo[]>

  getQualities(
    animeId: string,
    episodeIndex: number,
    sourceIndex: number,
    options: SourceRequestOptions,
  ): Promise<VideoQualityInfo[]>

  getVideoUrls(
    animeId: string,
    episodeIndexes: number[],
    sourceIndex: number,
    options: SourceRequestOptions,
  ): Promise<VideoQualityInfo[][]>
}
