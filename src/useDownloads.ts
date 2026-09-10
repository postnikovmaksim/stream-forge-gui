import { useCallback, useEffect, useState } from 'react'
import type { DownloadJobRequest } from '../shared/download'

const MAX_LOG_LINES = 300

export interface DownloadJobState {
  id: string
  title: string
  status: 'running' | 'done' | 'failed'
  logs: string[]
}

export function useDownloads() {
  const [jobs, setJobs] = useState<DownloadJobState[]>([])

  useEffect(() => {
    return window.animedl.download.onEvent((event) => {
      setJobs((prev) =>
        prev.map((job) => {
          if (job.id !== event.jobId) return job

          if (event.type === 'log') {
            const logs = [...job.logs, event.text].slice(-MAX_LOG_LINES)
            return { ...job, logs }
          }

          return { ...job, status: event.success ? 'done' : 'failed' }
        }),
      )
    })
  }, [])

  const startDownload = useCallback(async (request: DownloadJobRequest) => {
    const id = await window.animedl.download.start(request)
    setJobs((prev) => [...prev, { id, title: request.title, status: 'running', logs: [] }])
  }, [])

  const killDownload = useCallback((jobId: string) => {
    window.animedl.download.kill(jobId)
  }, [])

  return { jobs, startDownload, killDownload }
}
