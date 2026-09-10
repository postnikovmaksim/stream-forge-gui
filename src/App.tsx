import { useState } from 'react'
import AnimeSearch from './AnimeSearch'
import SourcesSettings from './SourcesSettings'

type Tab = 'search' | 'sources'

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
      </nav>
      {tab === 'search' ? <AnimeSearch /> : <SourcesSettings />}
    </div>
  )
}

export default App
