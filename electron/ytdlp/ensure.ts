import fs from 'node:fs'
import type { EnsureYtDlpResult } from '../../shared/ytdlpStatus'
import { downloadFile } from './download'
import { getYtDlpDir, getYtDlpDownloadUrl, getYtDlpPath } from './paths'

export async function ensureYtDlp(): Promise<EnsureYtDlpResult> {
  const ytDlpPath = getYtDlpPath()

  if (fs.existsSync(ytDlpPath)) {
    return { path: ytDlpPath, downloaded: false }
  }

  fs.mkdirSync(getYtDlpDir(), { recursive: true })

  const tmpPath = `${ytDlpPath}.download`
  await downloadFile(getYtDlpDownloadUrl(), tmpPath)
  fs.renameSync(tmpPath, ytDlpPath)

  if (process.platform !== 'win32') {
    fs.chmodSync(ytDlpPath, 0o755)
  }

  return { path: ytDlpPath, downloaded: true }
}
