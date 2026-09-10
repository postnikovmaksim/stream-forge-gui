import { useState } from 'react'
import type { DownloadJobState } from './useDownloads'

const STATUS_LABEL: Record<DownloadJobState['status'], string> = {
  running: '⏳',
  done: '✔',
  failed: '✖',
}

function DownloadsPanel({
  jobs,
  onKill,
}: {
  jobs: DownloadJobState[]
  onKill: (jobId: string) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = jobs.find((job) => job.id === selectedId) ?? null

  if (jobs.length === 0) {
    return <p>Загрузок пока нет.</p>
  }

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <ul style={{ minWidth: 240 }}>
        {jobs.map((job) => (
          <li key={job.id}>
            <button onClick={() => setSelectedId(job.id)}>
              {STATUS_LABEL[job.status]} {job.title}
            </button>
            {job.status === 'running' && (
              <button onClick={() => onKill(job.id)}>Остановить</button>
            )}
          </li>
        ))}
      </ul>
      <pre
        style={{
          flex: 1,
          whiteSpace: 'pre-wrap',
          background: '#1114',
          padding: 8,
          minHeight: 200,
          maxHeight: 400,
          overflow: 'auto',
        }}
      >
        {selected ? selected.logs.join('') : 'Выберите загрузку, чтобы посмотреть лог'}
      </pre>
    </div>
  )
}

export default DownloadsPanel
