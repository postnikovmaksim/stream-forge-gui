import type { SourceConfig } from '../shared/sourceConfig'

export {}

declare global {
  interface Window {
    animedl: {
      sources: {
        get: () => Promise<SourceConfig[]>
        save: (sources: SourceConfig[]) => Promise<SourceConfig[]>
      }
    }
  }
}
