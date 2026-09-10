export interface SourceConfig {
  id: string
  name: string
  enabled: boolean
  baseUrl: string
  timeoutMs: number
}

export const DEFAULT_SOURCES: SourceConfig[] = [
  { id: 'anilibria', name: 'AniLibria', enabled: true, baseUrl: '', timeoutMs: 20000 },
  { id: 'animego', name: 'AnimeGo', enabled: true, baseUrl: '', timeoutMs: 20000 },
  { id: 'animevost', name: 'AnimeVost', enabled: true, baseUrl: '', timeoutMs: 20000 },
  { id: 'dreamcast', name: 'DreamCast', enabled: true, baseUrl: '', timeoutMs: 20000 },
  { id: 'sameband', name: 'SameBand', enabled: true, baseUrl: '', timeoutMs: 20000 },
  { id: 'yummy_anime', name: 'Yummy Anime', enabled: true, baseUrl: '', timeoutMs: 20000 },
]
