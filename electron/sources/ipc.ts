import { ipcMain } from 'electron'
import type { AnimeSourcePlugin, SourceRequestOptions } from '../../shared/sourcePlugin'
import { loadSourcesConfig } from '../sourceConfigStore'
import { withTimeout } from '../timeout'
import { getEnabledPlugins, getPlugin } from './registry'

function resolveSource(sourceId: string): {
  plugin: AnimeSourcePlugin
  options: SourceRequestOptions
} {
  const config = loadSourcesConfig()
  const sourceConfig = config.find((source) => source.id === sourceId)

  if (!sourceConfig) {
    throw new Error(`Источник "${sourceId}" не найден в конфиге`)
  }
  if (!sourceConfig.enabled) {
    throw new Error(`Источник "${sourceConfig.name}" выключен в настройках`)
  }

  const plugin = getPlugin(sourceId)
  if (!plugin) {
    throw new Error(`Источник "${sourceId}" не зарегистрирован`)
  }

  return {
    plugin,
    options: { baseUrl: sourceConfig.baseUrl, timeoutMs: sourceConfig.timeoutMs },
  }
}

export function registerAnimeIpcHandlers(): void {
  ipcMain.handle('anime:list-enabled-sources', () => {
    const config = loadSourcesConfig()
    return getEnabledPlugins(config).map((plugin) => ({ id: plugin.id, name: plugin.name }))
  })

  ipcMain.handle('anime:search', async (_event, sourceId: string, query: string) => {
    const { plugin, options } = resolveSource(sourceId)
    return withTimeout(plugin.search(query, options), options.timeoutMs, 'Поиск')
  })

  ipcMain.handle('anime:episodes', async (_event, sourceId: string, animeId: string) => {
    const { plugin, options } = resolveSource(sourceId)
    return withTimeout(plugin.getEpisodes(animeId, options), options.timeoutMs, 'Поиск эпизодов')
  })

  ipcMain.handle(
    'anime:sources',
    async (_event, sourceId: string, animeId: string, episodeIndex: number) => {
      const { plugin, options } = resolveSource(sourceId)
      return withTimeout(
        plugin.getSources(animeId, episodeIndex, options),
        options.timeoutMs,
        'Поиск озвучек',
      )
    },
  )

  ipcMain.handle(
    'anime:qualities',
    async (
      _event,
      sourceId: string,
      animeId: string,
      episodeIndex: number,
      sourceIndex: number,
    ) => {
      const { plugin, options } = resolveSource(sourceId)
      return withTimeout(
        plugin.getQualities(animeId, episodeIndex, sourceIndex, options),
        options.timeoutMs,
        'Поиск качеств',
      )
    },
  )

  ipcMain.handle(
    'anime:video-urls',
    async (
      _event,
      sourceId: string,
      animeId: string,
      episodeIndexes: number[],
      sourceIndex: number,
    ) => {
      const { plugin, options } = resolveSource(sourceId)
      return withTimeout(
        plugin.getVideoUrls(animeId, episodeIndexes, sourceIndex, options),
        options.timeoutMs,
        'Получение ссылок на видео',
      )
    },
  )
}
