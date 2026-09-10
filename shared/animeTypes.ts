export interface AnimeSearchResult {
  id: string
  title: string
}

export interface EpisodeInfo {
  index: number
  title: string
}

export interface EpisodeSourceInfo {
  index: number
  title: string
  domain: string
}

export interface VideoQualityInfo {
  quality: string
  type: string
  url: string
}
