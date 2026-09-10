import type {
  AnimeSearchResult,
  EpisodeInfo,
  EpisodeSourceInfo,
  VideoQualityInfo,
} from '../../shared/animeTypes'
import type { AnimeSourcePlugin, SourceRequestOptions } from '../../shared/sourcePlugin'
import { fetchJson, fetchText } from './httpClient'
import { extractAniboomVideos, isAniboomUrl } from './players/aniboom'
import { extractKodikVideos, isKodikUrl } from './players/kodik'

// animego.me — агрегатор: сам не хранит видео, а собирает ссылки на сторонние
// встраиваемые плееры (Kodik, AniBoom, свой cdn-iframe) по каждой озвучке.
// У сайта нет публичного API — списки серий/озвучек подгружаются на страницу
// отдельными AJAX-запросами (проверено вживую curl'ом и разбором JS-бандла
// сайта при портировании, endpoints нигде не документированы):
//   GET /search/all?type=small&q=<query>        — HTML страница результатов
//   GET /anime/<slug>                            — HTML страницы тайтла,
//                                                   содержит числовой id тайтла
//   GET /player/<id>/episodes                    — JSON {data:{content: html}}
//                                                   со списком серий
//   GET /player/videos/<episodeId>                — JSON {data:{content: html}}
//                                                   со списком озвучек/плееров
//                                                   (там же лежат iframe-ссылки)
const DEFAULT_BASE_URL = 'https://animego.me'

function unsupportedPlayerError(domain: string): Error {
  return new Error(
    `Плеер "${domain}" пока не поддержан — реализованы Kodik и AniBoom. ` +
      'Собственный cdn-iframe animego отдаёт iframe со встроенным плеером ' +
      'без прямой ссылки на файл, для него нужен отдельный разбор ' +
      '(проверено: yt-dlp тоже не умеет их скачивать напрямую).',
  )
}

async function extractProviderVideos(
  playerUrl: string,
  timeoutMs: number,
): Promise<VideoQualityInfo[]> {
  if (isKodikUrl(playerUrl)) {
    return extractKodikVideos(playerUrl, timeoutMs)
  }
  if (isAniboomUrl(playerUrl)) {
    return extractAniboomVideos(playerUrl, timeoutMs)
  }
  throw unsupportedPlayerError(extractDomain(playerUrl))
}

interface AjaxContentResponse {
  status: string
  data: { content: string }
}

function resolveBaseUrl(options: SourceRequestOptions): string {
  return options.baseUrl || DEFAULT_BASE_URL
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function extractAttr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}="([^"]*)"`))
  return match ? decodeHtmlEntities(match[1]) : null
}

function extractDomain(url: string): string {
  try {
    return new URL(url.startsWith('//') ? `https:${url}` : url).hostname
  } catch {
    return ''
  }
}

function ajaxHeaders(referer: string): Record<string, string> {
  return {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: referer,
  }
}

function extractSearchResults(html: string): AnimeSearchResult[] {
  const results: AnimeSearchResult[] = []
  const titleBlockRe = /ani-grid__item-title[^"]*"[^>]*>\s*<a[^>]*href="\/anime\/([^"]+)"[^>]*>([^<]+)<\/a>/g
  let match: RegExpExecArray | null

  while ((match = titleBlockRe.exec(html))) {
    results.push({ id: match[1], title: decodeHtmlEntities(match[2]).trim() })
  }

  return results
}

async function resolveNumericId(
  animeId: string,
  baseUrl: string,
  timeoutMs: number,
): Promise<string> {
  const html = await fetchText(`${baseUrl}/anime/${animeId}`, timeoutMs)
  const match = html.match(/data-anime-player-loader-url-value="\/player\/(\d+)"/)
  if (!match) {
    throw new Error(`Не удалось определить внутренний id тайтла "${animeId}" на animego`)
  }
  return match[1]
}

interface EpisodeRow {
  index: number
  number: string
  episodeId: string
}

async function fetchEpisodeRows(
  animeId: string,
  numericId: string,
  baseUrl: string,
  timeoutMs: number,
): Promise<EpisodeRow[]> {
  const referer = `${baseUrl}/anime/${animeId}`
  const response = await fetchJson<AjaxContentResponse>(
    `${baseUrl}/player/${numericId}/episodes`,
    timeoutMs,
    { headers: ajaxHeaders(referer) },
  )
  const content = response.data.content

  const numbers = [...content.matchAll(/data-episode-number="(\d+)"/g)].map((m) => m[1])
  const indexes = [...content.matchAll(/data-episode-index="(\d+)"/g)].map((m) => Number(m[1]))
  const ids = [...content.matchAll(/data-episode="(\d+)"/g)].map((m) => m[1])

  return indexes.map((index, i) => ({ index, number: numbers[i], episodeId: ids[i] }))
}

interface ProviderRow {
  title: string
  domain: string
  playerUrl: string
}

function extractProviders(html: string): ProviderRow[] {
  const buttonRe = /<button\b[^>]*data-player="([^"]*)"[^>]*>/g
  const providers: ProviderRow[] = []
  let match: RegExpExecArray | null

  while ((match = buttonRe.exec(html))) {
    const tag = match[0]
    const playerUrl = decodeHtmlEntities(match[1])
    const translationTitle = extractAttr(tag, 'data-translation-title') ?? ''
    providers.push({ title: translationTitle, domain: extractDomain(playerUrl), playerUrl })
  }

  return providers
}

async function fetchProviders(
  animeId: string,
  episodeId: string,
  baseUrl: string,
  timeoutMs: number,
): Promise<ProviderRow[]> {
  const referer = `${baseUrl}/anime/${animeId}`
  const response = await fetchJson<AjaxContentResponse>(
    `${baseUrl}/player/videos/${episodeId}`,
    timeoutMs,
    { headers: ajaxHeaders(referer) },
  )
  return extractProviders(response.data.content)
}

async function resolveProvider(
  animeId: string,
  episodeIndex: number,
  sourceIndex: number,
  baseUrl: string,
  timeoutMs: number,
): Promise<ProviderRow | null> {
  const numericId = await resolveNumericId(animeId, baseUrl, timeoutMs)
  const rows = await fetchEpisodeRows(animeId, numericId, baseUrl, timeoutMs)
  const row = rows[episodeIndex]
  if (!row) return null

  const providers = await fetchProviders(animeId, row.episodeId, baseUrl, timeoutMs)
  return providers[sourceIndex] ?? null
}

export const animegoPlugin: AnimeSourcePlugin = {
  id: 'animego',
  name: 'AnimeGo',

  async search(query, options): Promise<AnimeSearchResult[]> {
    const baseUrl = resolveBaseUrl(options)
    const html = await fetchText(
      `${baseUrl}/search/all?type=small&q=${encodeURIComponent(query)}`,
      options.timeoutMs,
    )
    return extractSearchResults(html)
  },

  async getEpisodes(animeId, options): Promise<EpisodeInfo[]> {
    const baseUrl = resolveBaseUrl(options)
    const numericId = await resolveNumericId(animeId, baseUrl, options.timeoutMs)
    const rows = await fetchEpisodeRows(animeId, numericId, baseUrl, options.timeoutMs)
    return rows.map((row) => ({ index: row.index, title: `Серия ${row.number}` }))
  },

  async getSources(animeId, episodeIndex, options): Promise<EpisodeSourceInfo[]> {
    const baseUrl = resolveBaseUrl(options)
    const numericId = await resolveNumericId(animeId, baseUrl, options.timeoutMs)
    const rows = await fetchEpisodeRows(animeId, numericId, baseUrl, options.timeoutMs)
    const row = rows[episodeIndex]
    if (!row) {
      throw new Error(`Эпизод с индексом ${episodeIndex} не найден`)
    }

    const providers = await fetchProviders(animeId, row.episodeId, baseUrl, options.timeoutMs)
    return providers.map((provider, index) => ({
      index,
      title: provider.title,
      domain: provider.domain,
    }))
  },

  async getQualities(
    animeId,
    episodeIndex,
    sourceIndex,
    options,
  ): Promise<VideoQualityInfo[]> {
    const baseUrl = resolveBaseUrl(options)
    const provider = await resolveProvider(
      animeId,
      episodeIndex,
      sourceIndex,
      baseUrl,
      options.timeoutMs,
    )
    if (!provider) {
      throw new Error(`Озвучка/плеер с индексом ${sourceIndex} не найдены`)
    }
    return extractProviderVideos(provider.playerUrl, options.timeoutMs)
  },

  async getVideoUrls(
    animeId,
    episodeIndexes,
    sourceIndex,
    options,
  ): Promise<VideoQualityInfo[][]> {
    const baseUrl = resolveBaseUrl(options)
    const results: VideoQualityInfo[][] = []

    for (const episodeIndex of episodeIndexes) {
      const provider = await resolveProvider(
        animeId,
        episodeIndex,
        sourceIndex,
        baseUrl,
        options.timeoutMs,
      )
      if (!provider) {
        results.push([])
        continue
      }
      try {
        results.push(await extractProviderVideos(provider.playerUrl, options.timeoutMs))
      } catch {
        // неподдержанный плеер для конкретной серии — пропускаем её, а не
        // валим всю пачку скачивания остальных
        results.push([])
      }
    }

    return results
  },
}
