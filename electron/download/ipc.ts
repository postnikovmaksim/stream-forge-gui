import { ipcMain, type WebContents } from 'electron'
import type { DownloadJobRequest } from '../../shared/download'
import { loadAppSettings } from '../appSettingsStore'
import { DownloadQueue } from './DownloadQueue'

export function registerDownloadIpcHandlers(getWebContents: () => WebContents | null): DownloadQueue {
  const queue = new DownloadQueue(loadAppSettings, (event) => {
    getWebContents()?.send('download:event', event)
  })

  ipcMain.handle('download:start', (_event, request: DownloadJobRequest) => queue.enqueue(request))
  ipcMain.handle('download:kill', (_event, jobId: string) => queue.kill(jobId))

  return queue
}
