import type {
  AnimeSearchResult,
  EpisodeInfo,
  EpisodeSourceInfo,
  VideoQualityInfo,
} from '../../../shared/animeTypes'
import type { AnimeSourcePlugin, SourceRequestOptions } from '../../../shared/sourcePlugin'
import { ensureWarmedUp } from '../hiddenBrowser'
import { extractAniboomVideos, isAniboomUrl } from '../players/aniboom'
import { extractKodikVideos, isKodikUrl } from '../players/kodik'
import { extractSibnetVideos, isSibnetUrl } from '../players/sibnet'

// animelib.org (часть экосистемы Lib вместе с MangaLib/HentaiLib) — Vue SPA,
// весь контент подгружается JS-ом через отдельный API-хост
// hapi.hentaicdn.org (найден вживую перехватом сетевых запросов реального
// браузерного рендеринга страницы тайтла — в JS-бандле сайта адрес API нигде
// не лежит открытым текстом). anicli_api сайт не описывает — разбирался с
// нуля.
//
// API-хост защищён DDoS-Guard (аналог Cloudflare managed challenge) — прямой
// fetch/curl получает 403, а прямая навигация headless-браузера СРАЗУ на
// hapi.hentaicdn.org — тоже 403. Прогрев работает иначе, чем у astar.bz:
// достаточно один раз загрузить обычную страницу animelib.org (защита выдаёт
// cookie на весь домен .hentaicdn.org через сам факт легитимной навигации
// Chromium, без интерактивной JS-загадки) — дальше все fetch к API из того же
// скрытого окна проходят сразу, без поллинга title. Общая инфраструктура
// (одно скрытое окно на процесс, кеш прогрева по origin) вынесена в
// hiddenBrowser.ts вместе с astar.bz — второй сайт с такой же проблемой.
//
// Формат API (Laravel, судя по structure — {data, links, meta}):
//   GET /api/anime?q=<query>                — поиск, {data:[{id,slug_url,name,rus_name}]}
//   GET /api/episodes?anime_id=<slug_url>    — список серий тайтла целиком,
//                                              без пагинации на проверенном тайтле
//   GET /api/episodes/<id>                   — одна серия, {data:{...,players:[...]}}
// Самое ценное: у каждой серии — массив players, где на каждую озвучку/
// студию/сабы отдельная запись {player, team:{name}, translation_type:{label},
// src}. На проверенном тайтле (Mashle, 20630) — 31 запись на серию, БОЛЬШЕ,
// чем у любого уже реализованного источника (ani_media — 15-18). Все 31 —
// поле player:"Kodik" со ссылкой вида kodikplayer.com/seria/<id>/<hash>/720p —
// уже поддержанный в проекте формат (players/kodik.ts понимает путь /seria/
// без единой правки, отдал реальный 360/480/720p m3u8_native с первой
// попытки). Готовим код и на другие плееры (Sibnet, AniBoom) на случай, если
// у других тайтлов встретятся не только Kodik — сам сайт вживую под каждый
// не проверялся, только Mashle.
const DEFAULT_BASE_URL = 'https://animelib.org'
const API_BASE_URL = 'https://hapi.hentaicdn.org/api'

interface AnimeLibSearchItem {
  id: number
  slug_url: string
  name: string
  rus_name: string | null
}

interface AnimeLibEpisodeListItem {
  id: number
  name: string | null
  number: string
  season: string
}

interface AnimeLibTeam {
  name: string
}

interface AnimeLibPlayer {
  id: number
  player: string
  translation_type: { label: string }
  team: AnimeLibTeam | null
  src: string
}

interface AnimeLibEpisodeDetail {
  id: number
  name: string | null
  number: string
  season: string
  players: AnimeLibPlayer[]
}

function resolveBaseUrl(options: SourceRequestOptions): string {
  return options.baseUrl || DEFAULT_BASE_URL
}

async function libFetchJson<T>(url: string, timeoutMs: number, baseUrl: string): Promise<T> {
  const win = await Promise.race([
    ensureWarmedUp(API_BASE_URL, (w) => w.loadURL(`${baseUrl}/ru`)),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('animelib.org: превышено время ожидания прохождения DDoS-Guard')), timeoutMs),
    ),
  ])

  const script = `fetch(${JSON.stringify(url)}).then(r => r.json())`
  return Promise.race([
    win.webContents.executeJavaScript(script) as Promise<T>,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('animelib.org: превышено время ожидания запроса')), timeoutMs),
    ),
  ])
}

function normalizeUrl(url: string): string {
  return url.startsWith('//') ? `https:${url}` : url
}

function dubLabel(player: AnimeLibPlayer): string {
  return player.team?.name ?? player.translation_type.label
}

function episodeTitle(episode: { name: string | null; number: string; season: string }, hasMultipleSeasons: boolean): string {
  const label = episode.name || `Серия ${episode.number}`
  return hasMultipleSeasons ? `Сезон ${episode.season}, ${label}` : label
}

async function fetchEpisodeList(
  animeId: string,
  baseUrl: string,
  timeoutMs: number,
): Promise<{ items: AnimeLibEpisodeListItem[]; hasMultipleSeasons: boolean }> {
  const resp = await libFetchJson<{ data: AnimeLibEpisodeListItem[] }>(
    `${API_BASE_URL}/episodes?anime_id=${encodeURIComponent(animeId)}`,
    timeoutMs,
    baseUrl,
  )
  const seasons = new Set(resp.data.map((item) => item.season))
  return { items: resp.data, hasMultipleSeasons: seasons.size > 1 }
}

async function fetchEpisodeDetail(
  episodeId: number,
  baseUrl: string,
  timeoutMs: number,
): Promise<AnimeLibEpisodeDetail> {
  const resp = await libFetchJson<{ data: AnimeLibEpisodeDetail }>(
    `${API_BASE_URL}/episodes/${episodeId}`,
    timeoutMs,
    baseUrl,
  )
  return resp.data
}

function unsupportedPlayerError(player: string): Error {
  return new Error(
    `Плеер "${player}" пока не поддержан — реализованы Kodik, Sibnet и AniBoom.`,
  )
}

async function extractProviderVideos(playerUrl: string, timeoutMs: number): Promise<VideoQualityInfo[]> {
  const url = normalizeUrl(playerUrl)
  if (isKodikUrl(url)) return extractKodikVideos(url, timeoutMs)
  if (isSibnetUrl(url)) return extractSibnetVideos(url, timeoutMs)
  if (isAniboomUrl(url)) return extractAniboomVideos(url, timeoutMs)
  throw unsupportedPlayerError(url)
}

export const animelibPlugin: AnimeSourcePlugin = {
  id: 'animelib',
  name: 'AnimeLib',

  async search(query, options): Promise<AnimeSearchResult[]> {
    const resp = await libFetchJson<{ data: AnimeLibSearchItem[] }>(
      `${API_BASE_URL}/anime?q=${encodeURIComponent(query)}`,
      options.timeoutMs,
      resolveBaseUrl(options),
    )
    return resp.data.map((item) => ({ id: item.slug_url, title: item.rus_name || item.name }))
  },

  async getEpisodes(animeId, options): Promise<EpisodeInfo[]> {
    const { items, hasMultipleSeasons } = await fetchEpisodeList(animeId, resolveBaseUrl(options), options.timeoutMs)
    return items.map((item, index) => ({ index, title: episodeTitle(item, hasMultipleSeasons) }))
  },

  async getSources(animeId, episodeIndex, options): Promise<EpisodeSourceInfo[]> {
    const baseUrl = resolveBaseUrl(options)
    const { items } = await fetchEpisodeList(animeId, baseUrl, options.timeoutMs)
    const episodeRef = items[episodeIndex]
    if (!episodeRef) {
      throw new Error(`Эпизод с индексом ${episodeIndex} не найден`)
    }
    const episode = await fetchEpisodeDetail(episodeRef.id, baseUrl, options.timeoutMs)
    return episode.players.map((player, index) => ({
      index,
      title: dubLabel(player),
      domain: player.player,
    }))
  },

  async getQualities(animeId, episodeIndex, sourceIndex, options): Promise<VideoQualityInfo[]> {
    const baseUrl = resolveBaseUrl(options)
    const { items } = await fetchEpisodeList(animeId, baseUrl, options.timeoutMs)
    const episodeRef = items[episodeIndex]
    if (!episodeRef) {
      throw new Error(`Эпизод с индексом ${episodeIndex} не найден`)
    }
    const episode = await fetchEpisodeDetail(episodeRef.id, baseUrl, options.timeoutMs)
    const player = episode.players[sourceIndex]
    if (!player) {
      throw new Error(`Озвучка с индексом ${sourceIndex} не найдена`)
    }
    return extractProviderVideos(player.src, options.timeoutMs)
  },

  async getVideoUrls(animeId, episodeIndexes, sourceIndex, options): Promise<VideoQualityInfo[][]> {
    const baseUrl = resolveBaseUrl(options)
    const { items } = await fetchEpisodeList(animeId, baseUrl, options.timeoutMs)
    const results: VideoQualityInfo[][] = []

    for (const episodeIndex of episodeIndexes) {
      const episodeRef = items[episodeIndex]
      if (!episodeRef) {
        results.push([])
        continue
      }
      try {
        const episode = await fetchEpisodeDetail(episodeRef.id, baseUrl, options.timeoutMs)
        const player = episode.players[sourceIndex]
        results.push(player ? await extractProviderVideos(player.src, options.timeoutMs) : [])
      } catch {
        results.push([])
      }
    }

    return results
  },
}
