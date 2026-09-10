import { useEffect, useState } from 'react'
import type { SourceConfig } from '../shared/sourceConfig'

function SourcesSettings() {
  const [sources, setSources] = useState<SourceConfig[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'saved'>('loading')

  useEffect(() => {
    window.animedl.sources.get().then((loaded) => {
      setSources(loaded)
      setStatus('idle')
    })
  }, [])

  function updateSource(id: string, patch: Partial<SourceConfig>) {
    setSources((prev) =>
      prev.map((source) => (source.id === id ? { ...source, ...patch } : source)),
    )
    setStatus('idle')
  }

  async function handleSave() {
    setStatus('saving')
    await window.animedl.sources.save(sources)
    setStatus('saved')
  }

  if (status === 'loading') {
    return <p>Загрузка конфига источников...</p>
  }

  return (
    <div>
      <h2>Источники</h2>
      <table>
        <thead>
          <tr>
            <th>Вкл.</th>
            <th>Название</th>
            <th>Базовый URL</th>
            <th>Таймаут, мс</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => (
            <tr key={source.id}>
              <td>
                <input
                  type="checkbox"
                  checked={source.enabled}
                  onChange={(e) => updateSource(source.id, { enabled: e.target.checked })}
                />
              </td>
              <td>{source.name}</td>
              <td>
                <input
                  type="text"
                  value={source.baseUrl}
                  placeholder="определяется источником по умолчанию"
                  onChange={(e) => updateSource(source.id, { baseUrl: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={source.timeoutMs}
                  onChange={(e) =>
                    updateSource(source.id, { timeoutMs: Number(e.target.value) })
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={handleSave} disabled={status === 'saving'}>
        Сохранить
      </button>
      {status === 'saved' && <span> Сохранено</span>}
    </div>
  )
}

export default SourcesSettings
