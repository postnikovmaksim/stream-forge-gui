import type {
  AnimeSearchResult,
  EpisodeInfo,
  EpisodeSourceInfo,
  VideoQualityInfo,
} from '../../../shared/animeTypes'
import type { AnimeSourcePlugin, SourceRequestOptions } from '../../../shared/sourcePlugin'
import { cfFetch, encodeWin1251Percent } from '../cloudflareBrowser'

// astar.bz (AniStar) — за Cloudflare managed challenge (обычный fetch/curl
// получает 403 "Just a moment..." — JS-загадку решает только реальный
// браузерный движок), поэтому здесь используется отдельный модуль
// cloudflareBrowser.ts (скрытое BrowserWindow) вместо общего httpClient.ts.
// Сайт на DataLife Engine, отдаёт всё в windows-1251 (не UTF-8) — учтено и в
// кодировании поискового запроса, и в декодировании ответов.
// anicli_api этот сайт не описывает — разбирался с нуля.
//
// Сам сайт видео не хостит напрямую в смысле "чужого embed-плеера": плеер
// свой (`/test/player2/videoas.php?id=<id>&hash=<hash>`), но конкретные
// ссылки на видео в его JS (`var playlst=[...]`) — это СТАРЫЕ, уже
// просроченные значения (закешированы на момент генерации страницы). Реально
// рабочую, свежую ссылку отдаёт только повторный запрос
// `/test/player2/playlist_hls.php?360=...&720=...&type=.mp4` (те же query-
// параметры передаются туда же, куда были встроены в playlst) — он
// перевыпускает подписанные URL с новым `key=`/`end=` и отдаёт готовый
// master-плейлист (`#EXTM3U`/`#EXT-X-STREAM-INF`).
//
// 720p сознательно не поддержан: CDN для него (sfv.an-media.org) отдаёт
// "Wrong key" (403) даже на свежайший, только что перевыпущенный ключ,
// запрошенный из того же браузерного контекста, что его выпустил (проверено
// вживую — не аутентификация/IP, что-то в самой схеме подписи для этого
// конкретного CDN-хоста). 360p (sf2.an-media.org) при этом работает
// стабильно и без сюрпризов — им и ограничиваемся, как yummy_anime
// сознательно пропускает Alloha.
const DEFAULT_BASE_URL = 'https://v19.astar.bz'

interface AstarPlaylistItem {
  title: string
  mediaId: string
  file: string
}

interface AstarEpisodeGroup {
  label: string
  items: AstarPlaylistItem[]
}

function resolveBaseUrl(options: SourceRequestOptions): string {
  return options.baseUrl || DEFAULT_BASE_URL
}

function extractSearchResults(html: string, baseUrl: string): AnimeSearchResult[] {
  const seen = new Map<string, string>()
  const re = /<a href="(https:\/\/v19\.astar\.bz\/\d+-[^"]*\.html)"[^>]*>(.*?)<\/a>/gs
  let match: RegExpExecArray | null

  while ((match = re.exec(html))) {
    const [, url, inner] = match
    const title = inner
      .replace(/<[^>]+>/g, '')
      .trim()
    if (!title || title === 'Смотреть') continue
    if (!seen.has(url)) seen.set(url, title)
  }

  return Array.from(seen.entries()).map(([url, title]) => ({
    id: url.replace(baseUrl, ''),
    title,
  }))
}

function extractPlayerUrl(pageHtml: string, baseUrl: string): string {
  const m = pageHtml.match(/\/test\/player2\/videoas\.php\?id=\d+&hash=[a-f0-9]+/)
  if (!m) {
    throw new Error('astar.bz: не найден блок плеера на странице тайтла')
  }
  return `${baseUrl}${m[0]}`
}

function parsePlaylist(playerHtml: string): AstarPlaylistItem[] {
  const startIdx = playerHtml.indexOf('var playlst=[')
  if (startIdx === -1) {
    throw new Error('astar.bz: не найден плейлист на странице плеера')
  }
  const endIdx = playerHtml.indexOf('];', startIdx)
  const block = playerHtml.slice(startIdx, endIdx === -1 ? undefined : endIdx + 2)

  const items: AstarPlaylistItem[] = []
  const entryRe = /title:"([^"]*)"[\s\S]*?media_id:"(\d+)"[\s\S]*?\bfile:"([^"]*)"/g
  let match: RegExpExecArray | null

  while ((match = entryRe.exec(block))) {
    const [, title, mediaId, file] = match
    items.push({ title, mediaId, file: file.replace(/\\\//g, '/') })
  }

  return items
}

// "Серия N" и "Серия N Многоголосая озвучка" — одна и та же серия, две
// озвучки. Группируем по общему префиксу (без суффикса озвучки).
function groupByEpisode(items: AstarPlaylistItem[]): AstarEpisodeGroup[] {
  const order: string[] = []
  const groups = new Map<string, AstarPlaylistItem[]>()

  for (const item of items) {
    const label = item.title.replace(/\s+Многоголосая озвучка$/, '')
    if (!groups.has(label)) {
      groups.set(label, [])
      order.push(label)
    }
    groups.get(label)?.push(item)
  }

  return order.map((label) => ({ label, items: groups.get(label) ?? [] }))
}

function dubName(item: AstarPlaylistItem, group: AstarEpisodeGroup): string {
  return item.title === group.label ? 'Официальная' : item.title.slice(group.label.length).trim()
}

async function fetchGroups(
  animeId: string,
  baseUrl: string,
  timeoutMs: number,
): Promise<{ groups: AstarEpisodeGroup[]; playerUrl: string }> {
  const pageUrl = `${baseUrl}${animeId}`
  const pageResp = await cfFetch(pageUrl, {}, timeoutMs)
  const playerUrl = extractPlayerUrl(pageResp.text, baseUrl)

  const playerResp = await cfFetch(playerUrl, { headers: { Referer: pageUrl } }, timeoutMs)
  const items = parsePlaylist(playerResp.text)
  return { groups: groupByEpisode(items), playerUrl }
}

async function fetchQuality(
  item: AstarPlaylistItem,
  baseUrl: string,
  playerUrl: string,
  timeoutMs: number,
): Promise<VideoQualityInfo[]> {
  const playlistUrl = `${baseUrl}${item.file}`
  const resp = await cfFetch(playlistUrl, { headers: { Referer: playerUrl } }, timeoutMs)

  const url360Match = resp.text.match(/https:\/\/sf2\.an-media\.org\/[^\s]+/)
  if (!url360Match) {
    throw new Error('astar.bz: не найдена 360p-ссылка в свежем плейлисте')
  }

  return [
    {
      quality: '360',
      type: 'm3u8',
      url: url360Match[0],
      headers: { Referer: `${baseUrl}/` },
    },
  ]
}

export const astarPlugin: AnimeSourcePlugin = {
  id: 'astar',
  name: 'AStar',

  async search(query, options): Promise<AnimeSearchResult[]> {
    const baseUrl = resolveBaseUrl(options)
    const body = `do=search&subaction=search&story=${encodeWin1251Percent(query)}`
    const resp = await cfFetch(
      `${baseUrl}/`,
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
      options.timeoutMs,
    )
    return extractSearchResults(resp.text, baseUrl)
  },

  async getEpisodes(animeId, options): Promise<EpisodeInfo[]> {
    const baseUrl = resolveBaseUrl(options)
    const { groups } = await fetchGroups(animeId, baseUrl, options.timeoutMs)
    return groups.map((group, index) => ({ index, title: group.label }))
  },

  async getSources(animeId, episodeIndex, options): Promise<EpisodeSourceInfo[]> {
    const baseUrl = resolveBaseUrl(options)
    const { groups } = await fetchGroups(animeId, baseUrl, options.timeoutMs)
    const group = groups[episodeIndex]
    if (!group) {
      throw new Error(`Эпизод с индексом ${episodeIndex} не найден`)
    }
    return group.items.map((item, index) => ({
      index,
      title: dubName(item, group),
      domain: '',
    }))
  },

  async getQualities(animeId, episodeIndex, sourceIndex, options): Promise<VideoQualityInfo[]> {
    const baseUrl = resolveBaseUrl(options)
    const { groups, playerUrl } = await fetchGroups(animeId, baseUrl, options.timeoutMs)
    const item = groups[episodeIndex]?.items[sourceIndex]
    if (!item) {
      throw new Error(`Озвучка с индексом ${sourceIndex} не найдена`)
    }
    return fetchQuality(item, baseUrl, playerUrl, options.timeoutMs)
  },

  async getVideoUrls(
    animeId,
    episodeIndexes,
    sourceIndex,
    options,
  ): Promise<VideoQualityInfo[][]> {
    const baseUrl = resolveBaseUrl(options)
    const { groups, playerUrl } = await fetchGroups(animeId, baseUrl, options.timeoutMs)
    const results: VideoQualityInfo[][] = []

    for (const episodeIndex of episodeIndexes) {
      const item = groups[episodeIndex]?.items[sourceIndex]
      if (!item) {
        results.push([])
        continue
      }
      try {
        results.push(await fetchQuality(item, baseUrl, playerUrl, options.timeoutMs))
      } catch {
        results.push([])
      }
    }

    return results
  },
}
