import type { AppSettings } from '../shared/appSettings'
import type { SourceConfig } from '../shared/sourceConfig'
import type {
  AnimeSearchResult,
  EpisodeInfo,
  EpisodeSourceInfo,
  VideoQualityInfo,
} from '../shared/animeTypes'

export {}

declare global {
  interface Window {
    animedl: {
      appSettings: {
        get: () => Promise<AppSettings>
        save: (settings: AppSettings) => Promise<AppSettings>
        getDefaultDownloadPath: () => Promise<string>
      }
      dialog: {
        chooseDirectory: () => Promise<string | null>
      }
      sources: {
        get: () => Promise<SourceConfig[]>
        save: (sources: SourceConfig[]) => Promise<SourceConfig[]>
      }
      anime: {
        listEnabledSources: () => Promise<{ id: string; name: string }[]>
        search: (sourceId: string, query: string) => Promise<AnimeSearchResult[]>
        getEpisodes: (sourceId: string, animeId: string) => Promise<EpisodeInfo[]>
        getSources: (
          sourceId: string,
          animeId: string,
          episodeIndex: number,
        ) => Promise<EpisodeSourceInfo[]>
        getQualities: (
          sourceId: string,
          animeId: string,
          episodeIndex: number,
          sourceIndex: number,
        ) => Promise<VideoQualityInfo[]>
        getVideoUrls: (
          sourceId: string,
          animeId: string,
          episodeIndexes: number[],
          sourceIndex: number,
        ) => Promise<VideoQualityInfo[][]>
      }
    }
  }
}
