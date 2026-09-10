import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_APP_SETTINGS, type AppSettings } from '../shared/appSettings'

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'app-settings.json')
}

export function getDefaultDownloadPath(): string {
  return path.join(app.getPath('downloads'), 'Anime')
}

export function loadAppSettings(): AppSettings {
  const configPath = getConfigPath()

  if (!fs.existsSync(configPath)) {
    return DEFAULT_APP_SETTINGS
  }

  try {
    return { ...DEFAULT_APP_SETTINGS, ...JSON.parse(fs.readFileSync(configPath, 'utf-8')) }
  } catch {
    return DEFAULT_APP_SETTINGS
  }
}

export function saveAppSettings(settings: AppSettings): void {
  const configPath = getConfigPath()
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), 'utf-8')
}
