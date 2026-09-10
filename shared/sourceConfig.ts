export interface SourceConfig {
  id: string
  name: string
  enabled: boolean
  baseUrl: string
  timeoutMs: number
}

export const DEFAULT_SOURCES: SourceConfig[] = [
  // У astar.bz таймаут больше остальных: первый запрос "прогревает" скрытое
  // окно и проходит Cloudflare-проверку (до ~20 сек сама по себе), это
  // помимо времени на сетевые запросы.
  { id: 'astar', name: 'AStar', enabled: true, baseUrl: '', timeoutMs: 40000 },
  { id: 'anilibria', name: 'AniLibria', enabled: true, baseUrl: '', timeoutMs: 20000 },
  { id: 'ani_media', name: 'AniMedia Online', enabled: true, baseUrl: '', timeoutMs: 20000 },
  { id: 'animego', name: 'AnimeGo', enabled: true, baseUrl: '', timeoutMs: 20000 },
  // animelib.org за DDoS-Guard — прогрев скрытого окна быстрее, чем у astar.bz
  // (без поллинга challenge), но всё равно требует реальной навигации.
  { id: 'animelib', name: 'AnimeLib', enabled: true, baseUrl: '', timeoutMs: 30000 },
  { id: 'animevost', name: 'AnimeVost', enabled: true, baseUrl: '', timeoutMs: 20000 },
  { id: 'dreamcast', name: 'DreamCast', enabled: true, baseUrl: '', timeoutMs: 20000 },
  { id: 'sameband', name: 'SameBand', enabled: true, baseUrl: '', timeoutMs: 20000 },
  { id: 'shiza_project', name: 'SHIZA-Project', enabled: true, baseUrl: '', timeoutMs: 20000 },
  { id: 'yummy_anime', name: 'Yummy Anime', enabled: true, baseUrl: '', timeoutMs: 20000 },
]
