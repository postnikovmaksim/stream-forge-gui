import { useEffect, useState } from 'react'
import type { AnimeSearchResult } from '../shared/animeTypes'

function AnimeSearch() {
  const [sources, setSources] = useState<{ id: string; name: string }[]>([])
  const [sourceId, setSourceId] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AnimeSearchResult[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

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
          <li key={result.id}>{result.title}</li>
        ))}
      </ul>
    </div>
  )
}

export default AnimeSearch
