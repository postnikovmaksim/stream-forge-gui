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
import { IconAlertCircle, IconDownload, IconGauge } from '@tabler/icons-react'
import type { DownloadJobRequest } from '../shared/download'
import type { EpisodeInfo, EpisodeSourceInfo, VideoQualityInfo } from '../shared/animeTypes'
import type { VideoQualityEstimate } from '../shared/videoEstimate'

type QualityEstimateState =
  | { status: 'loading' }
  | { status: 'done'; data: VideoQualityEstimate }
  | { status: 'error'; message: string }

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} ГБ`
  return `${mb.toFixed(0)} МБ`
}

function formatTrack(codec: string | null, bitrateKbps: number | null): string | null {
  const label = [codec, bitrateKbps !== null ? `${bitrateKbps} кбит/с` : null]
    .filter(Boolean)
    .join(' ')
  return label || null
}

function formatEstimate(data: VideoQualityEstimate): string {
  const parts: string[] = []
  if (data.fileSizeBytes !== null) parts.push(`≈${formatBytes(data.fileSizeBytes)}`)

  const video = formatTrack(data.videoCodec, data.videoBitrateKbps)
  if (video) parts.push(video)

  const audio = formatTrack(data.audioCodec, data.audioBitrateKbps)
  if (audio) parts.push(audio)

  return parts.length > 0 ? parts.join(' · ') : 'Не удалось определить параметры'
}

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
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null)

  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [sources, setSources] = useState<EpisodeSourceInfo[]>([])
  const [selectedDubbing, setSelectedDubbing] = useState<string | null>(null)
  const [sourceIndex, setSourceIndex] = useState<number | null>(null)
  const [qualities, setQualities] = useState<VideoQualityInfo[]>([])
  const [selectedQuality, setSelectedQuality] = useState<string | null>(null)
  const [stepError, setStepError] = useState('')
  const [estimates, setEstimates] = useState<Record<string, QualityEstimateState>>({})

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

  function handleEpisodeMouseDown(index: number, shiftKey: boolean) {
    // Shift+клик — как в файловых менеджерах: расширяет выбор от последнего
    // обычного клика (anchorIndex) до текущей серии, без протягивания мышью.
    if (shiftKey && anchorIndex !== null) {
      selectRange(anchorIndex, index)
      handlePreview(index)
      return
    }

    setAnchorIndex(index)
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

    // Если под эту озвучку есть только один плеер — шаг всё равно показываем
    // (видно, какой именно плеер используется), но выбираем его сразу, не
    // заставляя лишний раз кликать.
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
    setEstimates({})
    setStepError('')

    window.animedl.anime.getQualities(sourceId, animeId, previewIndex, index).then(
      (loaded) => setQualities(loaded),
      (error: Error) => setStepError(error.message),
    )
  }

  async function handleEstimateQuality(quality: VideoQualityInfo) {
    setEstimates((prev) => ({ ...prev, [quality.quality]: { status: 'loading' } }))
    try {
      const data = await window.animedl.ffprobe.estimate(quality)
      setEstimates((prev) => ({ ...prev, [quality.quality]: { status: 'done', data } }))
    } catch (error) {
      setEstimates((prev) => ({
        ...prev,
        [quality.quality]: {
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        },
      }))
    }
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
            onMouseDown={(e) => handleEpisodeMouseDown(episode.index, e.shiftKey)}
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
                <Chip
                  key={name}
                  value={name}
                  style={{ width: '100%' }}
                  styles={{ label: { width: '100%', justifyContent: 'center' } }}
                >
                  {name}
                </Chip>
              ))}
            </SimpleGrid>
          </Chip.Group>
        </Stack>
      )}

      {selectedDubbing !== null && playersForDubbing.length > 0 && (
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
            <Stack gap="xs">
              {qualities.map((quality) => {
                const estimate = estimates[quality.quality]
                return (
                  <Group key={quality.quality} gap="xs" wrap="wrap">
                    <Chip value={quality.quality}>
                      {quality.quality}p ({quality.type})
                    </Chip>
                    <Button
                      size="xs"
                      variant="subtle"
                      leftSection={<IconGauge size={14} />}
                      loading={estimate?.status === 'loading'}
                      onClick={() => handleEstimateQuality(quality)}
                    >
                      Оценить качество
                    </Button>
                    {estimate?.status === 'done' && (
                      <Text size="xs" c="dimmed">
                        {formatEstimate(estimate.data)}
                      </Text>
                    )}
                    {estimate?.status === 'error' && (
                      <Text size="xs" c="red">
                        {estimate.message}
                      </Text>
                    )}
                  </Group>
                )
              })}
            </Stack>
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
