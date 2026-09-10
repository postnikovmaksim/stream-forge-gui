import type {
  AnimeSearchResult,
  EpisodeInfo,
  EpisodeSourceInfo,
  VideoQualityInfo,
} from '../../shared/animeTypes'
import type { AnimeSourcePlugin, SourceRequestOptions } from '../../shared/sourcePlugin'
import { fetchJson } from './httpClient'
import { extractAniboomVideos, isAniboomUrl } from './players/aniboom'
import { extractKodikVideos, isKodikUrl } from './players/kodik'
import { extractSibnetVideos, isSibnetUrl } from './players/sibnet'

// shiza-project.com — Nuxt-сайт с GraphQL API (чтение без авторизации).
// Introspection на проде выключен, но SSR встраивает в HTML полный дамп
// Apollo-кеша (script#__NUXT_DATA__), а точные тексты запросов нашлись в
// JS-бандле сайта (там они лежат как AST graphql-codegen — распечатаны
// обратно в текст скриптом). Оба пути сверены между собой и проверены вживую
// реальными запросами при портировании. anicli_api этот сайт не описывает
// вообще — разбирался с нуля, без справочника.
//
// Само видео сайт не хостит — как и animego, агрегирует ссылки на чужие
// embed-плееры (видел только Kodik и SibNet у реальных тайтлов, но в схеме
// video.embedSource — это enum, других значений вживую не встречал).
// Переиспользует уже готовые экстракторы этого проекта. Единственное отличие
// Kodik-ссылок здесь — путь /uv/<id>/<hash>/<quality>p вместо привычных
// /video|film|serial|season/ — страница и API у этого пути идентичны, просто
// другое значение vInfo.type; пришлось расширить KODIK_URL_PATTERN в
// players/kodik.ts под этот путь.
//
// У сайта нет отдельного выбора озвучки на уровне эпизода/видео — только
// translationType на весь релиз целиком. Поэтому, как и у AniLibria/
// Dreamcast, "озвучка" здесь фиктивная (getSources всегда группирует под
// одним названием), а реальный выбор пользователя — это плеер.
const DEFAULT_BASE_URL = 'https://shiza-project.com/graphql'

const FETCH_RELEASE_QUERY = `
  query fetchRelease($slug: String!) {
    release(slug: $slug) {
      slug
      name
      episodes {
        name
        number
        videos {
          embedSource
          embedUrl
        }
      }
    }
  }
`

const SEARCH_QUERY = `
  query search($query: String!, $type: SearchType!) {
    search(query: $query, type: $type, first: 20) {
      edges {
        node {
          ... on Release {
            slug
            name
            originalName
          }
        }
      }
    }
  }
`

interface ShizaVideo {
  embedSource: string
  embedUrl: string
}

interface ShizaEpisode {
  name: string | null
  number: number
  videos: ShizaVideo[]
}

interface ShizaRelease {
  slug: string
  name: string
  episodes: ShizaEpisode[]
}

interface SearchNode {
  slug?: string
  name?: string
  originalName?: string
}

interface GraphqlResponse<T> {
  data?: T
  errors?: { message: string }[]
}

function resolveBaseUrl(options: SourceRequestOptions): string {
  return options.baseUrl || DEFAULT_BASE_URL
}

async function graphqlRequest<T>(
  baseUrl: string,
  query: string,
  variables: Record<string, unknown>,
  timeoutMs: number,
): Promise<T> {
  const response = await fetchJson<GraphqlResponse<T>>(baseUrl, timeoutMs, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (response.errors?.length) {
    throw new Error(`SHIZA-Project: ${response.errors.map((error) => error.message).join('; ')}`)
  }
  if (!response.data) {
    throw new Error('SHIZA-Project: пустой ответ GraphQL')
  }
  return response.data
}

async function fetchRelease(
  slug: string,
  baseUrl: string,
  timeoutMs: number,
): Promise<ShizaRelease> {
  const data = await graphqlRequest<{ release: ShizaRelease | null }>(
    baseUrl,
    FETCH_RELEASE_QUERY,
    { slug },
    timeoutMs,
  )
  if (!data.release) {
    throw new Error(`SHIZA-Project: релиз "${slug}" не найден`)
  }
  return data.release
}

function normalizeUrl(url: string): string {
  return url.startsWith('//') ? `https:${url}` : url
}

function extractDomain(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname
  } catch {
    return ''
  }
}

// Порядок видео от API не гарантирован стабильным между сериями — сортируем
// по embedSource, чтобы одинаковый sourceIndex указывал на один и тот же
// плеер на разных сериях (как и у остальных агрегаторов в проекте).
function sortedVideos(videos: ShizaVideo[]): ShizaVideo[] {
  return [...videos].sort((a, b) => a.embedSource.localeCompare(b.embedSource))
}

async function extractProviderVideos(
  embedUrl: string,
  timeoutMs: number,
): Promise<VideoQualityInfo[]> {
  const url = normalizeUrl(embedUrl)
  if (isKodikUrl(url)) return extractKodikVideos(url, timeoutMs)
  if (isSibnetUrl(url)) return extractSibnetVideos(url, timeoutMs)
  if (isAniboomUrl(url)) return extractAniboomVideos(url, timeoutMs)
  throw new Error(`Плеер "${extractDomain(url)}" пока не поддержан`)
}

export const shizaProjectPlugin: AnimeSourcePlugin = {
  id: 'shiza_project',
  name: 'SHIZA-Project',

  async search(query, options): Promise<AnimeSearchResult[]> {
    const baseUrl = resolveBaseUrl(options)
    const data = await graphqlRequest<{ search: { edges: { node: SearchNode }[] } }>(
      baseUrl,
      SEARCH_QUERY,
      { query, type: 'RELEASE' },
      options.timeoutMs,
    )
    return data.search.edges
      .map((edge) => edge.node)
      .filter((node) => typeof node.slug === 'string')
      .map((node) => ({ id: node.slug as string, title: node.name || node.originalName || '' }))
  },

  async getEpisodes(animeId, options): Promise<EpisodeInfo[]> {
    const baseUrl = resolveBaseUrl(options)
    const release = await fetchRelease(animeId, baseUrl, options.timeoutMs)
    return release.episodes.map((episode, index) => ({
      index,
      title: episode.name || `Серия ${episode.number}`,
    }))
  },

  async getSources(animeId, episodeIndex, options): Promise<EpisodeSourceInfo[]> {
    const baseUrl = resolveBaseUrl(options)
    const release = await fetchRelease(animeId, baseUrl, options.timeoutMs)
    const episode = release.episodes[episodeIndex]
    if (!episode) {
      throw new Error(`Эпизод с индексом ${episodeIndex} не найден`)
    }
    return sortedVideos(episode.videos).map((video, index) => ({
      index,
      title: 'SHIZA-Project',
      domain: extractDomain(video.embedUrl),
    }))
  },

  async getQualities(animeId, episodeIndex, sourceIndex, options): Promise<VideoQualityInfo[]> {
    const baseUrl = resolveBaseUrl(options)
    const release = await fetchRelease(animeId, baseUrl, options.timeoutMs)
    const video = sortedVideos(release.episodes[episodeIndex]?.videos ?? [])[sourceIndex]
    if (!video) {
      throw new Error(`Плеер с индексом ${sourceIndex} не найден`)
    }
    return extractProviderVideos(video.embedUrl, options.timeoutMs)
  },

  async getVideoUrls(
    animeId,
    episodeIndexes,
    sourceIndex,
    options,
  ): Promise<VideoQualityInfo[][]> {
    const baseUrl = resolveBaseUrl(options)
    const release = await fetchRelease(animeId, baseUrl, options.timeoutMs)
    const results: VideoQualityInfo[][] = []

    for (const episodeIndex of episodeIndexes) {
      const video = sortedVideos(release.episodes[episodeIndex]?.videos ?? [])[sourceIndex]
      if (!video) {
        results.push([])
        continue
      }
      try {
        results.push(await extractProviderVideos(video.embedUrl, options.timeoutMs))
      } catch {
        results.push([])
      }
    }

    return results
  },
}
