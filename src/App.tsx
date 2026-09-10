import { useState } from 'react'
import AnimeSearch from './AnimeSearch'
import AppSettingsForm from './AppSettingsForm'
import DownloadsPanel from './DownloadsPanel'
import SourcesSettings from './SourcesSettings'
import { useDownloads } from './useDownloads'

type Tab = 'search' | 'sources' | 'settings' | 'downloads'

function App() {
  const [tab, setTab] = useState<Tab>('search')
  const { jobs, startDownload, killDownload } = useDownloads()
  const hasRunning = jobs.some((job) => job.status === 'running')

  return (
    <div className="app">
      <h1>AnimeDL</h1>
      <nav>
        <button onClick={() => setTab('search')} disabled={tab === 'search'}>
          Поиск
        </button>
        <button onClick={() => setTab('sources')} disabled={tab === 'sources'}>
          Источники
        </button>
        <button onClick={() => setTab('settings')} disabled={tab === 'settings'}>
          Настройки
        </button>
        <button onClick={() => setTab('downloads')} disabled={tab === 'downloads'}>
          Загрузки{hasRunning ? ' •' : ''}
        </button>
      </nav>

      <div style={{ display: tab === 'search' ? 'block' : 'none' }}>
        <AnimeSearch onStartDownload={startDownload} />
      </div>
      <div style={{ display: tab === 'sources' ? 'block' : 'none' }}>
        <SourcesSettings />
      </div>
      <div style={{ display: tab === 'settings' ? 'block' : 'none' }}>
        <AppSettingsForm />
      </div>
      <div style={{ display: tab === 'downloads' ? 'block' : 'none' }}>
        <DownloadsPanel jobs={jobs} onKill={killDownload} />
      </div>
    </div>
  )
}

export default App
