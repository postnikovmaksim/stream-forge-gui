import type { AnimeSourcePlugin } from '../../shared/sourcePlugin'
import type { SourceConfig } from '../../shared/sourceConfig'
import { DEFAULT_SOURCES } from '../../shared/sourceConfig'
import { anilibriaPlugin } from './sites/anilibria'
import { aniMediaPlugin } from './sites/aniMedia'
import { animegoPlugin } from './sites/animego'
import { animelibPlugin } from './sites/animelib'
import { astarPlugin } from './sites/astar'
import { dreamcastPlugin } from './sites/dreamcast'
import { shizaProjectPlugin } from './sites/shizaProject'
import { yummyAnimePlugin } from './sites/yummyAnime'

function notImplementedPlugin(id: string, name: string): AnimeSourcePlugin {
  const message = `Источник "${name}" ещё не реализован в новой версии`

  return {
    id,
    name,
    async search() {
      throw new Error(message)
    },
    async getEpisodes() {
      throw new Error(message)
    },
    async getSources() {
      throw new Error(message)
    },
    async getQualities() {
      throw new Error(message)
    },
    async getVideoUrls() {
      throw new Error(message)
    },
  }
}

const implementedPlugins: Record<string, AnimeSourcePlugin> = {
  anilibria: anilibriaPlugin,
  ani_media: aniMediaPlugin,
  animego: animegoPlugin,
  animelib: animelibPlugin,
  astar: astarPlugin,
  dreamcast: dreamcastPlugin,
  shiza_project: shizaProjectPlugin,
  yummy_anime: yummyAnimePlugin,
}

const builtinPlugins = new Map<string, AnimeSourcePlugin>(
  DEFAULT_SOURCES.map((source) => [
    source.id,
    implementedPlugins[source.id] ?? notImplementedPlugin(source.id, source.name),
  ]),
)

export function getPlugin(id: string): AnimeSourcePlugin | undefined {
  return builtinPlugins.get(id)
}

export function getEnabledPlugins(config: SourceConfig[]): AnimeSourcePlugin[] {
  return config
    .filter((source) => source.enabled)
    .map((source) => builtinPlugins.get(source.id))
    .filter((plugin): plugin is AnimeSourcePlugin => plugin !== undefined)
}
