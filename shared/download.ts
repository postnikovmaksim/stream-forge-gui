export interface DownloadJobRequest {
  title: string
  url: string
  outputTemplate: string
  isM3u8: boolean
  headers?: Record<string, string>
}

export interface DownloadLogEvent {
  type: 'log'
  jobId: string
  stream: 'stdout' | 'stderr'
  text: string
}

export interface DownloadExitEvent {
  type: 'exit'
  jobId: string
  success: boolean
}

export type DownloadEvent = DownloadLogEvent | DownloadExitEvent
