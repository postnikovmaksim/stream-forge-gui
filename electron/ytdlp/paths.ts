import { app } from 'electron'
import path from 'node:path'

export function getYtDlpDir(): string {
  return path.join(app.getPath('userData'), 'bin')
}

export function getYtDlpBinaryName(): string {
  return process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
}

export function getYtDlpPath(): string {
  return path.join(getYtDlpDir(), getYtDlpBinaryName())
}

export function getYtDlpDownloadUrl(): string {
  const base = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'

  switch (process.platform) {
    case 'win32':
      return `${base}/yt-dlp.exe`
    case 'darwin':
      return `${base}/yt-dlp_macos`
    default:
      return `${base}/yt-dlp_linux`
  }
}
