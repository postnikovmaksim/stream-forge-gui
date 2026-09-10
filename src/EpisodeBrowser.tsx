import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { IconAlertCircle, IconDownload } from '@tabler/icons-react'
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
    <Stack>
      <Title order={3}>{animeTitle}</Title>

      {episodesError && (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          {episodesError}
        </Alert>
      )}

      {episodes.length === 0 && !episodesError && <Loader size="sm" />}

      <ScrollArea.Autosize mah={320}>
        <Stack gap={4}>
          {episodes.map((episode) => (
            <Paper key={episode.index} withBorder p="xs" radius="sm">
              <Group gap="xs" wrap="nowrap">
                <Checkbox
                  checked={checked.has(episode.index)}
                  onChange={() => toggleChecked(episode.index)}
                />
                <Text
                  onClick={() => handlePreview(episode.index)}
                  style={{ cursor: 'pointer' }}
                  fw={previewIndex === episode.index ? 700 : 400}
                >
                  {episode.title}
                </Text>
              </Group>
            </Paper>
          ))}
        </Stack>
      </ScrollArea.Autosize>

      {stepError && (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          {stepError}
        </Alert>
      )}

      {previewIndex !== null && (
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Источник/озвучка
          </Text>
          <Chip.Group
            value={sourceIndex !== null ? String(sourceIndex) : null}
            onChange={(value) => typeof value === 'string' && handleSelectSource(Number(value))}
          >
            <Group gap="xs">
              {sources.map((source) => (
                <Chip key={source.index} value={String(source.index)}>
                  {source.title}
                  {source.domain ? ` [плеер] ${source.domain}` : ''}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </Stack>
      )}

      {sourceIndex !== null && (
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Качество
          </Text>
          <Chip.Group
            value={selectedQuality}
            onChange={(value) => typeof value === 'string' && setSelectedQuality(value)}
          >
            <Group gap="xs">
              {qualities.map((quality) => (
                <Chip key={quality.quality} value={quality.quality}>
                  {quality.quality}p ({quality.type})
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </Stack>
      )}

      <Button
        leftSection={<IconDownload size={16} />}
        onClick={handleDownload}
        disabled={checked.size === 0 || !selectedQuality}
        w="fit-content"
      >
        Скачать выбранные ({checked.size})
      </Button>
    </Stack>
  )
}

export default EpisodeBrowser
