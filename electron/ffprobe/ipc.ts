import { ipcMain } from 'electron'
import type { VideoQualityInfo } from '../../shared/animeTypes'
import { withTimeout } from '../timeout'
import { estimateVideoQuality } from './estimate'

const ESTIMATE_TIMEOUT_MS = 30000

export function registerFfprobeIpcHandlers(): void {
  ipcMain.handle('ffprobe:estimate', (_event, quality: VideoQualityInfo) => {
    return withTimeout(
      estimateVideoQuality(quality, ESTIMATE_TIMEOUT_MS),
      ESTIMATE_TIMEOUT_MS,
      'Оценка качества',
    )
  })
}
