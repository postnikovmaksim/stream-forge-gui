import { useEffect, useState } from 'react'
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
    return <p>Нет включённых источников — включите хотя бы один во вкладке "Источники".</p>
  }

  if (selectedAnime) {
    return (
      <div>
        <button onClick={() => setSelectedAnime(null)}>← Назад к поиску</button>
        <EpisodeBrowser
          key={selectedAnime.id}
          sourceId={sourceId}
          animeId={selectedAnime.id}
          animeTitle={selectedAnime.title}
          onStartDownload={onStartDownload}
        />
      </div>
    )
  }

  return (
    <div>
      <h2>Поиск</h2>
      <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
        {sources.map((source) => (
          <option key={source.id} value={source.id}>
            {source.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={query}
        placeholder="Название аниме"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
      />
      <button onClick={handleSearch} disabled={status === 'loading'}>
        Искать
      </button>

      {status === 'loading' && <p>Поиск...</p>}
      {status === 'error' && <p role="alert">Ошибка: {errorMessage}</p>}

      <ul>
        {results.map((result) => (
          <li key={result.id}>
            <button onClick={() => setSelectedAnime(result)}>{result.title}</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default AnimeSearch
