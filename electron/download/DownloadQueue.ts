import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import type { AppSettings } from '../../shared/appSettings'
import type { DownloadEvent, DownloadJobRequest } from '../../shared/download'
import { getYtDlpPath } from '../ytdlp/paths'
import { buildSocks5Url } from './proxyUrl'

export class DownloadQueue {
  private readonly pending: { id: string; request: DownloadJobRequest }[] = []
  private readonly running = new Map<string, ChildProcess>()

  constructor(
    private readonly getSettings: () => AppSettings,
    private readonly emit: (event: DownloadEvent) => void,
  ) {}

  enqueue(request: DownloadJobRequest): string {
    const id = randomUUID()
    this.pending.push({ id, request })
    this.pump()
    return id
  }

  kill(jobId: string): void {
    this.running.get(jobId)?.kill()
  }

  private pump(): void {
    const settings = this.getSettings()

    while (this.running.size < settings.parallelDownloads && this.pending.length > 0) {
      const job = this.pending.shift()
      if (job) {
        this.start(job.id, job.request, settings)
      }
    }
  }

  private start(id: string, request: DownloadJobRequest, settings: AppSettings): void {
    const args: string[] = []

    if (settings.proxy.enabled) {
      args.push('--proxy', buildSocks5Url(settings.proxy))
    }

    args.push('--no-part', '--continue')

    if (request.isM3u8) {
      args.push('--merge-output-format', 'mp4')
    }

    args.push('-o', request.outputTemplate, request.url)

    const child = spawn(getYtDlpPath(), args)
    this.running.set(id, child)

    child.stdout.on('data', (chunk: Buffer) => {
      this.emit({ type: 'log', jobId: id, stream: 'stdout', text: chunk.toString('utf-8') })
    })

    child.stderr.on('data', (chunk: Buffer) => {
      this.emit({ type: 'log', jobId: id, stream: 'stderr', text: chunk.toString('utf-8') })
    })

    child.on('close', (code) => {
      this.running.delete(id)
      this.emit({ type: 'exit', jobId: id, success: code === 0 })
      this.pump()
    })
  }
}
