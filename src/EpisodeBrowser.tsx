import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Chip,
  Group,
  Loader,
  Paper,
  SimpleGrid,
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
  const [dragAnchor, setDragAnchor] = useState<number | null>(null)

  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [sources, setSources] = useState<EpisodeSourceInfo[]>([])
  const [selectedDubbing, setSelectedDubbing] = useState<string | null>(null)
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

  // Пока зажата кнопка мыши (dragAnchor задан), протягивание по другим сериям
  // расширяет диапазон выбора. Слушаем mouseup на всём окне — отпустить кнопку
  // можно и вне списка серий.
  useEffect(() => {
    if (dragAnchor === null) return

    function handleMouseUp() {
      setDragAnchor(null)
    }

    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [dragAnchor])

  function selectRange(from: number, to: number) {
    const start = Math.min(from, to)
    const end = Math.max(from, to)
    const next = new Set<number>()
    for (let i = start; i <= end; i++) next.add(i)
    setChecked(next)
  }

  function handleEpisodeMouseDown(index: number) {
    setDragAnchor(index)
    selectRange(index, index)
    handlePreview(index)
  }

  function handleEpisodeMouseEnter(index: number) {
    if (dragAnchor === null) return
    selectRange(dragAnchor, index)
  }

  function handlePreview(index: number) {
    setPreviewIndex(index)
    setSources([])
    setSelectedDubbing(null)
    setSourceIndex(null)
    setQualities([])
    setSelectedQuality(null)
    setStepError('')

    window.animedl.anime.getSources(sourceId, animeId, index).then(
      (loaded) => setSources(loaded),
      (error: Error) => setStepError(error.message),
    )
  }

  function handleSelectDubbing(dubbing: string) {
    setSelectedDubbing(dubbing)
    setSourceIndex(null)
    setQualities([])
    setSelectedQuality(null)
    setStepError('')

    // Если под эту озвучку есть только один плеер — нет смысла заставлять
    // выбирать его отдельным шагом, выбираем сразу.
    const matches = sources.filter((source) => source.title === dubbing)
    if (matches.length === 1) {
      handleSelectSource(matches[0].index)
    }
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
        headers: match.headers,
      })
    })
  }

  const dubbingNames = Array.from(new Set(sources.map((source) => source.title))).sort((a, b) =>
    a.localeCompare(b, 'ru'),
  )
  const playersForDubbing = sources.filter((source) => source.title === selectedDubbing)

  return (
    <Stack>
      <Title order={3}>{animeTitle}</Title>

      {episodesError && (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          {episodesError}
        </Alert>
      )}

      {episodes.length === 0 && !episodesError && <Loader size="sm" />}

      <Stack gap={4} style={{ userSelect: 'none' }}>
        {episodes.map((episode) => (
          <Paper
            key={episode.index}
            withBorder
            p="xs"
            radius="sm"
            onMouseDown={() => handleEpisodeMouseDown(episode.index)}
            onMouseEnter={() => handleEpisodeMouseEnter(episode.index)}
            style={{
              cursor: 'pointer',
              backgroundColor: checked.has(episode.index)
                ? 'var(--mantine-color-blue-light)'
                : undefined,
            }}
          >
            <Text fw={previewIndex === episode.index ? 700 : 400}>{episode.title}</Text>
          </Paper>
        ))}
      </Stack>

      {stepError && (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          {stepError}
        </Alert>
      )}

      {previewIndex !== null && sources.length > 0 && (
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Озвучка
          </Text>
          <Chip.Group
            value={selectedDubbing}
            onChange={(value) => typeof value === 'string' && handleSelectDubbing(value)}
          >
            <SimpleGrid cols={3} spacing="xs">
              {dubbingNames.map((name) => (
                <Chip key={name} value={name}>
                  {name}
                </Chip>
              ))}
            </SimpleGrid>
          </Chip.Group>
        </Stack>
      )}

      {selectedDubbing !== null && playersForDubbing.length > 1 && (
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Плеер
          </Text>
          <Chip.Group
            value={sourceIndex !== null ? String(sourceIndex) : null}
            onChange={(value) => typeof value === 'string' && handleSelectSource(Number(value))}
          >
            <Group gap="xs">
              {playersForDubbing.map((source) => (
                <Chip key={source.index} value={String(source.index)}>
                  {source.domain || source.title}
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
