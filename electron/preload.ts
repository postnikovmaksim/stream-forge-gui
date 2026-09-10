import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings } from '../shared/appSettings'
import type { DownloadEvent, DownloadJobRequest } from '../shared/download'
import type { SourceConfig } from '../shared/sourceConfig'
import type { EnsureYtDlpResult } from '../shared/ytdlpStatus'
import type { VideoQualityEstimate } from '../shared/videoEstimate'
import type { UpdaterEvent } from '../shared/updater'
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
  ffprobe: {
    estimate: (quality: VideoQualityInfo): Promise<VideoQualityEstimate> =>
      ipcRenderer.invoke('ffprobe:estimate', quality),
  },
  updater: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
    getPlatform: (): Promise<string> => ipcRenderer.invoke('app:platform'),
    check: (): Promise<void> => ipcRenderer.invoke('updater:check'),
    download: (): Promise<void> => ipcRenderer.invoke('updater:download'),
    install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
    openReleasePage: (): Promise<void> => ipcRenderer.invoke('updater:open-release-page'),
    onEvent: (callback: (event: UpdaterEvent) => void): (() => void) => {
      const listener = (_event: unknown, payload: UpdaterEvent) => callback(payload)
      ipcRenderer.on('updater:event', listener)
      return () => ipcRenderer.removeListener('updater:event', listener)
    },
  },
  download: {
    start: (request: DownloadJobRequest): Promise<string> =>
      ipcRenderer.invoke('download:start', request),
    kill: (jobId: string): Promise<void> => ipcRenderer.invoke('download:kill', jobId),
    onEvent: (callback: (event: DownloadEvent) => void): (() => void) => {
      const listener = (_event: unknown, payload: DownloadEvent) => callback(payload)
      ipcRenderer.on('download:event', listener)
      return () => ipcRenderer.removeListener('download:event', listener)
    },
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
