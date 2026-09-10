import type { VideoQualityInfo } from '../../../shared/animeTypes'
import { fetchText } from '../httpClient'

// SibNet (video.sibnet.ru) — простейший из плееров: прямая ссылка на mp4 лежит
// прямо в JS-инициализации videojs на странице плеера, без всякого шифрования.
// Нужен только Referer при скачивании, иначе сервер отдаёт 403.
// Разобрано по актуальным исходникам anicli_api как справочнику:
//   https://github.com/vypivshiy/anicli-api/blob/master/anicli_api/player/sibnet.py
// Проверено вживую реальным запросом при портировании.

const _URL_PATTERN = /^https?:\/\/(www\.)?video\.sibnet/

export function isSibnetUrl(url: string): boolean {
  return _URL_PATTERN.test(url)
}

export async function extractSibnetVideos(
  playerUrl: string,
  timeoutMs: number,
): Promise<VideoQualityInfo[]> {
  const html = await fetchText(playerUrl, timeoutMs)

  const match = html.match(/"(\/v\/.*?\.mp4)"/)
  if (!match) {
    throw new Error('SibNet: не найдена ссылка на видео на странице плеера')
  }

  const url = `https://video.sibnet.ru${match[1]}`
  return [{ quality: '480', type: 'mp4', url, headers: { Referer: playerUrl } }]
}
