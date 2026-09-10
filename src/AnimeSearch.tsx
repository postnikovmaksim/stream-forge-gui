import { useEffect, useState } from 'react'
import { Alert, Button, Card, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconAlertCircle, IconSearch } from '@tabler/icons-react'
import type { DownloadJobRequest } from '../shared/download'
import type { AnimeSearchResult } from '../shared/animeTypes'
import EpisodeBrowser from './EpisodeBrowser'

function AnimeSearch({
  onStartDownload,
}: {
  onStartDownload: (request: DownloadJobRequest) => void
}) {
  const [sources, setSources] = useState<{ id: string; name: string }[]>([])
  const [sourceId, setSourceId] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AnimeSearchResult[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedAnime, setSelectedAnime] = useState<AnimeSearchResult | null>(null)

  useEffect(() => {
    window.animedl.anime.listEnabledSources().then((loaded) => {
      setSources(loaded)
      setSourceId((current) => current || (loaded[0]?.id ?? ''))
    })
  }, [])

  async function handleSearch() {
    if (!sourceId || !query.trim()) return

    setStatus('loading')
    setErrorMessage('')
    setSelectedAnime(null)

    try {
      const found = await window.animedl.anime.search(sourceId, query.trim())
      setResults(found)
      setStatus('idle')
    } catch (error) {
      setResults([])
      setErrorMessage(error instanceof Error ? error.message : String(error))
      setStatus('error')
    }
  }

  if (sources.length === 0) {
    return (
      <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
        Нет включённых источников — включите хотя бы один во вкладке «Источники».
      </Alert>
    )
  }

  if (selectedAnime) {
    return (
      <Stack>
        <Button variant="subtle" onClick={() => setSelectedAnime(null)} w="fit-content" px={0}>
          ← Назад к поиску
        </Button>
        <EpisodeBrowser
          key={selectedAnime.id}
          sourceId={sourceId}
          animeId={selectedAnime.id}
          animeTitle={selectedAnime.title}
          onStartDownload={onStartDownload}
        />
      </Stack>
    )
  }

  return (
    <Stack>
      <Title order={2}>Поиск</Title>
      <Group align="flex-end">
        <Select
          label="Источник"
          data={sources.map((source) => ({ value: source.id, label: source.name }))}
          value={sourceId}
          onChange={(value) => value && setSourceId(value)}
          allowDeselect={false}
        />
        <TextInput
          label="Название аниме"
          placeholder="Например, One Punch Man"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          style={{ flex: 1 }}
        />
        <Button leftSection={<IconSearch size={16} />} onClick={handleSearch} loading={status === 'loading'}>
          Искать
        </Button>
      </Group>

      {status === 'error' && (
        <Alert color="red" icon={<IconAlertCircle size={16} />} title="Ошибка поиска">
          {errorMessage}
        </Alert>
      )}

      <Stack gap="xs">
        {results.map((result) => (
          <Card
            key={result.id}
            withBorder
            padding="sm"
            component="button"
            onClick={() => setSelectedAnime(result)}
            style={{ textAlign: 'left', cursor: 'pointer' }}
          >
            <Text>{result.title}</Text>
          </Card>
        ))}
      </Stack>
    </Stack>
  )
}

export default AnimeSearch
