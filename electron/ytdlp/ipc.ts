import { ipcMain } from 'electron'
import type { EnsureYtDlpResult } from '../../shared/ytdlpStatus'
import { ensureYtDlp } from './ensure'

export function registerYtDlpIpcHandlers(): void {
  ipcMain.handle('ytdlp:ensure', (): Promise<EnsureYtDlpResult> => ensureYtDlp())
}
