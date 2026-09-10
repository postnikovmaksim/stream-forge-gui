import { app, ipcMain, type WebContents } from 'electron'
import {
  checkForUpdates,
  downloadUpdate,
  initUpdater,
  openReleasePage,
  quitAndInstall,
} from './updater'

export function registerUpdaterIpcHandlers(getWebContents: () => WebContents | null): void {
  initUpdater((event) => {
    getWebContents()?.send('updater:event', event)
  })

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:platform', () => process.platform)
  ipcMain.handle('updater:check', () => checkForUpdates())
  ipcMain.handle('updater:download', () => downloadUpdate())
  ipcMain.handle('updater:install', () => quitAndInstall())
  ipcMain.handle('updater:open-release-page', () => openReleasePage())
}
