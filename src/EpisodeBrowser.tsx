import { useEffect, useState } from 'react'
import type { DownloadJobRequest } from '../shared/download'
import type { EpisodeInfo, EpisodeSourceInfo, VideoQualityInfo } from '../shared/animeTypes'

function EpisodeBrowser({
  sourceId,
  animeId,
  animeTitle,
  onStartDownload,
}: {
  sourceId: string
  animeId: string
  animeTitle: string
  onStartDownload: (request: DownloadJobRequest) => void
}) {
  const [episodes, setEpisodes] = useState<EpisodeInfo[]>([])
  const [episodesError, setEpisodesError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [sources, setSources] = useState<EpisodeSourceInfo[]>([])
  const [sourceIndex, setSourceIndex] = useState<number | null>(null)
  const [qualities, setQualities] = useState<VideoQualityInfo[]>([])
  const [selectedQuality, setSelectedQuality] = useState<string | null>(null)
  const [stepError, setStepError] = useState('')

  useEffect(() => {
    window.animedl.anime.getEpisodes(sourceId, animeId).then(
      (loaded) => setEpisodes(loaded),
      (error: Error) => setEpisodesError(error.message),
    )
  }, [sourceId, animeId])

  function toggleChecked(index: number) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  function handlePreview(index: number) {
    setPreviewIndex(index)
    setSources([])
    setSourceIndex(null)
    setQualities([])
    setSelectedQuality(null)
    setStepError('')

    window.animedl.anime.getSources(sourceId, animeId, index).then(
      (loaded) => setSources(loaded),
      (error: Error) => setStepError(error.message),
    )
  }

  function handleSelectSource(index: number) {
    if (previewIndex === null) return
    setSourceIndex(index)
    setQualities([])
    setSelectedQuality(null)
    setStepError('')

    window.animedl.anime.getQualities(sourceId, animeId, previewIndex, index).then(
      (loaded) => setQualities(loaded),
      (error: Error) => setStepError(error.message),
    )
  }

  async function handleDownload() {
    if (checked.size === 0 || sourceIndex === null || !selectedQuality) return

    const indexes = Array.from(checked).sort((a, b) => a - b)
    const [results, settings, defaultPath] = await Promise.all([
      window.animedl.anime.getVideoUrls(sourceId, animeId, indexes, sourceIndex),
      window.animedl.appSettings.get(),
      window.animedl.appSettings.getDefaultDownloadPath(),
    ])
    const baseDir = settings.downloadPath || defaultPath
    const sourceTitle = sources[sourceIndex]?.title ?? ''

    indexes.forEach((episodeIndex, i) => {
      const match = results[i]?.find((q) => q.quality === selectedQuality)
      if (!match) return

      const episodeNumber = episodeIndex + 1
      const outputTemplate = `${baseDir}/${animeTitle}/[${sourceTitle}] ${episodeNumber}. ${selectedQuality} ${animeTitle}.%(ext)s`

      onStartDownload({
        title: `ep ${episodeNumber} | ${animeTitle} | ${selectedQuality}`,
        url: match.url,
        outputTemplate,
        isM3u8: match.type === 'm3u8',
      })
    })
  }

  return (
    <div>
      <h3>{animeTitle}</h3>

      {episodesError && <p role="alert">Ошибка: {episodesError}</p>}

      <ul>
        {episodes.map((episode) => (
          <li key={episode.index}>
            <input
              type="checkbox"
              checked={checked.has(episode.index)}
              onChange={() => toggleChecked(episode.index)}
            />
            <button onClick={() => handlePreview(episode.index)}>{episode.title}</button>
          </li>
        ))}
      </ul>

      {stepError && <p role="alert">Ошибка: {stepError}</p>}

      {previewIndex !== null && (
        <div>
          <h4>Источник/озвучка</h4>
          <ul>
            {sources.map((source) => (
              <li key={source.index}>
                <button onClick={() => handleSelectSource(source.index)}>
                  {source.title}
                  {source.domain ? ` [плеер] ${source.domain}` : ''}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sourceIndex !== null && (
        <div>
          <h4>Качество</h4>
          <ul>
            {qualities.map((quality) => (
              <li key={quality.quality}>
                <button onClick={() => setSelectedQuality(quality.quality)}>
                  {quality.quality}p ({quality.type})
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button onClick={handleDownload} disabled={checked.size === 0 || !selectedQuality}>
        Скачать выбранные ({checked.size})
      </button>
    </div>
  )
}

export default EpisodeBrowser
