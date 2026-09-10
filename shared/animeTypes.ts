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
  // Некоторым плеерам (AniBoom, SibNet) нужны конкретные заголовки
  // (Referer/Origin/Accept-Language) не только чтобы получить ссылку, но и
  // чтобы её потом скачать — без них yt-dlp получит 403.
  headers?: Record<string, string>
}
