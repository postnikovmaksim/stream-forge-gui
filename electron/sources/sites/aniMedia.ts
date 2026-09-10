import type {
  AnimeSearchResult,
  EpisodeInfo,
  EpisodeSourceInfo,
  VideoQualityInfo,
} from '../../../shared/animeTypes'
import type { AnimeSourcePlugin, SourceRequestOptions } from '../../../shared/sourcePlugin'
import { fetchText } from '../httpClient'
import {
  dubLabel,
  fetchCdnVideoHubPlaylist,
  fetchCdnVideoHubQualities,
  type CdnVideoHubItem,
} from '../players/cdnvideohub'

// ani-media.online — как и astar.bz, движок DataLife Engine, но БЕЗ
// Cloudflare (обычный fetch работает, кодировка страниц — UTF-8), поэтому
// используется общий httpClient.ts, а не cloudflareBrowser.ts.
//
// Видео сайт сам не хостит — единственный (главный) плеер на странице
// тайтла — сторонний агрегатор CDNVideoHub, встроенный кастомным тегом
// <video-player data-publisher-id="..." data-title-id="..." data-aggregator="...">.
// Есть ещё Kodik как альтернативный плеер (подгружается лениво по клику на
// вкладку), но CDNVideoHub уже даёт 15-18 озвучек на серию и явно заявлен
// сайтом как "Главный плеер" — Kodik сознательно не подключаем, аналогично
// тому как yummy_anime пропускает Alloha.
//
// anicli_api не описывает ani-media.online как источник, зато описывает сам
// плеер CDNVideoHub (anicli_api/player/cdnvideohub.py) — использован как
// эталон формы API, детали и UA-особенность CDN описаны в players/cdnvideohub.ts.
const DEFAULT_BASE_URL = 'https://ani-media.online'

interface AniMediaEpisodeGroup {
  label: string
  items: CdnVideoHubItem[]
}

function resolveBaseUrl(options: SourceRequestOptions): string {
  return options.baseUrl || DEFAULT_BASE_URL
}

function extractSearchResults(html: string): AnimeSearchResult[] {
  const seen = new Map<string, string>()
  const re = /<a href="(https:\/\/ani-media\.online\/anime-seriali\/[^"]+)" class="new-anime__link" title="([^"]*)">/g
  let match: RegExpExecArray | null

  while ((match = re.exec(html))) {
    const [, url, title] = match
    if (!seen.has(url)) seen.set(url, title)
  }

  return Array.from(seen.entries()).map(([url, title]) => ({
    id: url.replace(DEFAULT_BASE_URL, ''),
    title,
  }))
}

function extractVideoPlayerIds(html: string): { pub: string; aggr: string; id: string } {
  const tagMatch = html.match(/<video-player\b[^>]*>/)
  if (!tagMatch) {
    throw new Error('ani-media.online: на странице тайтла не найден тег video-player (CDNVideoHub)')
  }
  const tag = tagMatch[0]

  const pub = tag.match(/data-publisher-id="(\d+)"/)?.[1]
  const aggr = tag.match(/data-aggregator="(\w+)"/)?.[1]
  const id = tag.match(/data-title-id="(\d+)"/)?.[1]

  if (!pub || !aggr || !id) {
    throw new Error('ani-media.online: не удалось разобрать атрибуты тега video-player')
  }

  return { pub, aggr, id }
}

function groupByEpisode(items: CdnVideoHubItem[]): AniMediaEpisodeGroup[] {
  const seasons = new Set(items.map((item) => item.season))
  const order: string[] = []
  const groups = new Map<string, CdnVideoHubItem[]>()

  const keyOf = (item: CdnVideoHubItem) => `${item.season}:${item.episode}`
  const labelOf = (item: CdnVideoHubItem) =>
    seasons.size > 1 ? `Сезон ${item.season}, серия ${item.episode}` : `Серия ${item.episode}`

  for (const item of items) {
    const key = keyOf(item)
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)?.push(item)
  }

  return order
    .sort((a, b) => {
      const [aSeason, aEpisode] = a.split(':').map(Number)
      const [bSeason, bEpisode] = b.split(':').map(Number)
      return aSeason - bSeason || aEpisode - bEpisode
    })
    .map((key) => {
      const groupItems = groups.get(key) ?? []
      return { label: labelOf(groupItems[0]), items: groupItems }
    })
}

async function fetchGroups(
  animeId: string,
  baseUrl: string,
  timeoutMs: number,
): Promise<AniMediaEpisodeGroup[]> {
  const pageHtml = await fetchText(`${baseUrl}${animeId}`, timeoutMs)
  const { pub, aggr, id } = extractVideoPlayerIds(pageHtml)
  const items = await fetchCdnVideoHubPlaylist(pub, aggr, id, timeoutMs)
  return groupByEpisode(items)
}

export const aniMediaPlugin: AnimeSourcePlugin = {
  id: 'ani_media',
  name: 'AniMedia Online',

  async search(query, options): Promise<AnimeSearchResult[]> {
    const baseUrl = resolveBaseUrl(options)
    const body = `do=search&subaction=search&story=${encodeURIComponent(query)}`
    const html = await fetchText(`${baseUrl}/`, options.timeoutMs, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    return extractSearchResults(html)
  },

  async getEpisodes(animeId, options): Promise<EpisodeInfo[]> {
    const baseUrl = resolveBaseUrl(options)
    const groups = await fetchGroups(animeId, baseUrl, options.timeoutMs)
    return groups.map((group, index) => ({ index, title: group.label }))
  },

  async getSources(animeId, episodeIndex, options): Promise<EpisodeSourceInfo[]> {
    const baseUrl = resolveBaseUrl(options)
    const groups = await fetchGroups(animeId, baseUrl, options.timeoutMs)
    const group = groups[episodeIndex]
    if (!group) {
      throw new Error(`Эпизод с индексом ${episodeIndex} не найден`)
    }
    return group.items.map((item, index) => ({
      index,
      title: dubLabel(item),
      domain: '',
    }))
  },

  async getQualities(animeId, episodeIndex, sourceIndex, options): Promise<VideoQualityInfo[]> {
    const baseUrl = resolveBaseUrl(options)
    const groups = await fetchGroups(animeId, baseUrl, options.timeoutMs)
    const item = groups[episodeIndex]?.items[sourceIndex]
    if (!item) {
      throw new Error(`Озвучка с индексом ${sourceIndex} не найдена`)
    }
    return fetchCdnVideoHubQualities(item.vkId, options.timeoutMs)
  },

  async getVideoUrls(animeId, episodeIndexes, sourceIndex, options): Promise<VideoQualityInfo[][]> {
    const baseUrl = resolveBaseUrl(options)
    const groups = await fetchGroups(animeId, baseUrl, options.timeoutMs)
    const results: VideoQualityInfo[][] = []

    for (const episodeIndex of episodeIndexes) {
      const item = groups[episodeIndex]?.items[sourceIndex]
      if (!item) {
        results.push([])
        continue
      }
      try {
        results.push(await fetchCdnVideoHubQualities(item.vkId, options.timeoutMs))
      } catch {
        results.push([])
      }
    }

    return results
  },
}
