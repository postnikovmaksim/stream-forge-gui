export interface DownloadJobRequest {
  title: string
  url: string
  outputTemplate: string
  isM3u8: boolean
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
