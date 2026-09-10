import { ipcMain } from 'electron'
import type { SourceConfig } from '../shared/sourceConfig'
import { loadSourcesConfig, saveSourcesConfig } from './sourceConfigStore'

export function registerSourceConfigIpcHandlers(): void {
  ipcMain.handle('sources:get', () => loadSourcesConfig())

  ipcMain.handle('sources:save', (_event, sources: SourceConfig[]) => {
    saveSourcesConfig(sources)
    return sources
  })
}
