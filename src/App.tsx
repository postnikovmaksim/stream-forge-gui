import { useState } from 'react'
import AnimeSearch from './AnimeSearch'
import AppSettingsForm from './AppSettingsForm'
import SourcesSettings from './SourcesSettings'

type Tab = 'search' | 'sources' | 'settings'

function App() {
  const [tab, setTab] = useState<Tab>('search')

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
      </nav>
      {tab === 'search' && <AnimeSearch />}
      {tab === 'sources' && <SourcesSettings />}
      {tab === 'settings' && <AppSettingsForm />}
    </div>
  )
}

export default App
