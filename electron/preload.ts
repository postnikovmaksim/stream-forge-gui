import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings } from '../shared/appSettings'
import type { SourceConfig } from '../shared/sourceConfig'
import type { EnsureYtDlpResult } from '../shared/ytdlpStatus'
import type {
  AnimeSearchResult,
  EpisodeInfo,
  EpisodeSourceInfo,
  VideoQualityInfo,
} from '../shared/animeTypes'

contextBridge.exposeInMainWorld('animedl', {
  appSettings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('app-settings:get'),
    save: (settings: AppSettings): Promise<AppSettings> =>
      ipcRenderer.invoke('app-settings:save', settings),
    getDefaultDownloadPath: (): Promise<string> =>
      ipcRenderer.invoke('app-settings:default-download-path'),
  },
  dialog: {
    chooseDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke('dialog:choose-directory'),
  },
  ytdlp: {
    ensure: (): Promise<EnsureYtDlpResult> => ipcRenderer.invoke('ytdlp:ensure'),
  },
  sources: {
    get: (): Promise<SourceConfig[]> => ipcRenderer.invoke('sources:get'),
    save: (sources: SourceConfig[]): Promise<SourceConfig[]> =>
      ipcRenderer.invoke('sources:save', sources),
  },
  anime: {
    listEnabledSources: (): Promise<{ id: string; name: string }[]> =>
      ipcRenderer.invoke('anime:list-enabled-sources'),
    search: (sourceId: string, query: string): Promise<AnimeSearchResult[]> =>
      ipcRenderer.invoke('anime:search', sourceId, query),
    getEpisodes: (sourceId: string, animeId: string): Promise<EpisodeInfo[]> =>
      ipcRenderer.invoke('anime:episodes', sourceId, animeId),
    getSources: (
      sourceId: string,
      animeId: string,
      episodeIndex: number,
    ): Promise<EpisodeSourceInfo[]> =>
      ipcRenderer.invoke('anime:sources', sourceId, animeId, episodeIndex),
    getQualities: (
      sourceId: string,
      animeId: string,
      episodeIndex: number,
      sourceIndex: number,
    ): Promise<VideoQualityInfo[]> =>
      ipcRenderer.invoke('anime:qualities', sourceId, animeId, episodeIndex, sourceIndex),
    getVideoUrls: (
      sourceId: string,
      animeId: string,
      episodeIndexes: number[],
      sourceIndex: number,
    ): Promise<VideoQualityInfo[][]> =>
      ipcRenderer.invoke('anime:video-urls', sourceId, animeId, episodeIndexes, sourceIndex),
  },
})
