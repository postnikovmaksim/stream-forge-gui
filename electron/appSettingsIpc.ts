import { ipcMain } from 'electron'
import type { AppSettings } from '../shared/appSettings'
import { getDefaultDownloadPath, loadAppSettings, saveAppSettings } from './appSettingsStore'

export function registerAppSettingsIpcHandlers(): void {
  ipcMain.handle('app-settings:get', () => loadAppSettings())

  ipcMain.handle('app-settings:save', (_event, settings: AppSettings) => {
    saveAppSettings(settings)
    return settings
  })

  ipcMain.handle('app-settings:default-download-path', () => getDefaultDownloadPath())
}
