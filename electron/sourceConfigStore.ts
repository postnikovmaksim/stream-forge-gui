import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_SOURCES, type SourceConfig } from '../shared/sourceConfig'

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'sources.json')
}

export function loadSourcesConfig(): SourceConfig[] {
  const configPath = getConfigPath()

  if (!fs.existsSync(configPath)) {
    saveSourcesConfig(DEFAULT_SOURCES)
    return DEFAULT_SOURCES
  }

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as SourceConfig[]
  } catch {
    return DEFAULT_SOURCES
  }
}

export function saveSourcesConfig(sources: SourceConfig[]): void {
  const configPath = getConfigPath()
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(sources, null, 2), 'utf-8')
}
