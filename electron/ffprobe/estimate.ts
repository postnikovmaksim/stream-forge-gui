import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { VideoQualityInfo } from '../../shared/animeTypes'
import type { VideoQualityEstimate } from '../../shared/videoEstimate'
import { fetchBuffer, fetchTextWithUrl } from '../sources/httpClient'

// Оценка "веса" видео и битрейта по требованию пользователя (кнопка "Оценить
// качество" на шаге выбора качества), а не заранее для всех вариантов — сама
// оценка требует реальной сетевой активности и внешнего инструмента (ffprobe
// из состава FFmpeg), это не бесплатная операция.
//
// Почему нельзя просто спросить у манифеста: у HLS-плееров этого проекта
// (Kodik/AniBoom/Dreamcast) ссылка на m3u8 — это уже готовый медиа-плейлист
// конкретного качества, а не master-плейлист с несколькими вариантами и их
// BANDWIDTH — битрейт нигде не объявлен, его физически неоткуда прочитать без
// разбора самого видео (проверено вживую: yt-dlp -J отдаёт tbr/vbr/abr как
// null, ffprobe по всей remote-ссылке при дефолтных настройках тоже не
// вычисляет per-stream bit_rate для этих HLS-потоков).
//
// Рабочий способ, тоже проверенный вживую: у HLS каждое качество кодируется
// на +/- постоянный битрейт всю дорожку — значит, чтобы оценить его, не нужно
// скачивать весь файл. Достаточно скачать ОДИН сегмент (несколько секунд,
// сотни КБ, не гигабайты серии), прогнать ffprobe по нему локально (тогда он
// честно считает bit_rate, а не гадает по сетевому потоку), и отмасштабировать
// оценку размера на полную длительность, которую сам плейлист объявляет
// бесплатно (сумма #EXTINF).
//
// Для прямых файлов (SibNet, .mp4) всё проще и точнее: ffprobe читает
// контейнер прямо по сети (обычно без скачивания всего файла — только
// заголовки/moov) и честно отдаёт формат.size (точный, не оценка) и
// per-stream bit_rate.
//
// Требует, чтобы ffprobe (часть FFmpeg) был в PATH — так же, как yt-dlp уже
// неявно требует ffmpeg для склейки HLS в один mp4 (--merge-output-format),
// просто раньше эта зависимость нигде не была объявлена явно. Авто-скачивание
// ffmpeg сюда сознательно не добавлено — это отдельное архитектурное решение
// (бинарь на порядок больше yt-dlp), не часть этой задачи.

interface FfprobeStream {
  codec_name?: string
  codec_type?: string
  width?: number
  height?: number
  bit_rate?: string
}

interface FfprobeFormat {
  duration?: string
  size?: string
  bit_rate?: string
}

interface FfprobeResult {
  streams?: FfprobeStream[]
  format?: FfprobeFormat
}

interface PlaylistSegment {
  url: string
  duration: number
}

const FFPROBE_ENTRIES =
  'format=duration,size,bit_rate:stream=codec_name,codec_type,width,height,bit_rate'

function buildHeaderBlock(headers?: Record<string, string>): string | null {
  if (!headers || Object.keys(headers).length === 0) return null
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}\r\n`)
    .join('')
}

function runFfprobe(args: string[], timeoutMs: number): Promise<FfprobeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', args)
    let stdout = ''
    let stderr = ''

    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('ffprobe: превышено время ожидания'))
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })

    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      if (error.code === 'ENOENT') {
        reject(
          new Error(
            'ffprobe не найден. Установите FFmpeg и добавьте его в PATH, чтобы оценивать качество видео.',
          ),
        )
        return
      }
      reject(error)
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(`ffprobe завершился с ошибкой: ${stderr.trim() || `код ${code}`}`))
        return
      }
      try {
        resolve(JSON.parse(stdout) as FfprobeResult)
      } catch {
        reject(new Error('ffprobe: не удалось разобрать вывод'))
      }
    })
  })
}

async function probeUrl(
  url: string,
  headers: Record<string, string> | undefined,
  timeoutMs: number,
): Promise<FfprobeResult> {
  const args = ['-v', 'error']
  const headerBlock = buildHeaderBlock(headers)
  if (headerBlock) {
    args.push('-headers', headerBlock)
  }
  args.push('-show_entries', FFPROBE_ENTRIES, '-of', 'json', url)
  return runFfprobe(args, timeoutMs)
}

// ffprobe умеет честно посчитать format.size/format.bit_rate только когда
// видит настоящий файл с известным размером — через stdin (pipe:0) эти поля
// остаются пустыми, проверено вживую. Поэтому сегмент сначала пишем во
// временный файл и уже его отдаём ffprobe, а не пайпим буфер напрямую.
async function probeBuffer(buffer: Buffer, timeoutMs: number): Promise<FfprobeResult> {
  const tmpPath = path.join(os.tmpdir(), `animedl-probe-${randomUUID()}.ts`)
  await fs.writeFile(tmpPath, buffer)
  try {
    const args = ['-v', 'error', '-show_entries', FFPROBE_ENTRIES, '-of', 'json', tmpPath]
    return await runFfprobe(args, timeoutMs)
  } finally {
    await fs.unlink(tmpPath).catch(() => {})
  }
}

function deriveBitrates(probe: FfprobeResult): {
  videoBitrateKbps: number | null
  audioBitrateKbps: number | null
} {
  const streams = probe.streams ?? []
  const videoStream = streams.find((stream) => stream.codec_type === 'video')
  const audioStream = streams.find((stream) => stream.codec_type === 'audio')
  const audioBitrateBps = audioStream?.bit_rate ? Number(audioStream.bit_rate) : null
  let videoBitrateBps = videoStream?.bit_rate ? Number(videoStream.bit_rate) : null

  // per-stream bit_rate есть не всегда (например, video/h264 в MPEG-TS часто
  // без него) — тогда досчитываем видео как "общий минус аудио".
  if (videoBitrateBps === null) {
    const totalBitrateBps = probe.format?.bit_rate ? Number(probe.format.bit_rate) : null
    if (totalBitrateBps !== null && audioBitrateBps !== null) {
      videoBitrateBps = totalBitrateBps - audioBitrateBps
    }
  }

  return {
    videoBitrateKbps: videoBitrateBps !== null ? Math.round(videoBitrateBps / 1000) : null,
    audioBitrateKbps: audioBitrateBps !== null ? Math.round(audioBitrateBps / 1000) : null,
  }
}

function toEstimate(probe: FfprobeResult): VideoQualityEstimate {
  const streams = probe.streams ?? []
  const videoStream = streams.find((stream) => stream.codec_type === 'video')
  const audioStream = streams.find((stream) => stream.codec_type === 'audio')
  const format = probe.format ?? {}
  const { videoBitrateKbps, audioBitrateKbps } = deriveBitrates(probe)

  return {
    fileSizeBytes: format.size ? Number(format.size) : null,
    durationSeconds: format.duration ? Number(format.duration) : null,
    videoBitrateKbps,
    audioBitrateKbps,
    videoCodec: videoStream?.codec_name ?? null,
    audioCodec: audioStream?.codec_name ?? null,
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null,
  }
}

function resolveUrl(maybeRelative: string, base: string): string {
  return new URL(maybeRelative, base).href
}

function isMasterPlaylist(text: string): boolean {
  return text.includes('#EXT-X-STREAM-INF')
}

function extractFirstVariantUrl(text: string, base: string): string {
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('#EXT-X-STREAM-INF')) {
      const next = lines[i + 1]?.trim()
      if (next && !next.startsWith('#')) {
        return resolveUrl(next, base)
      }
    }
  }
  throw new Error('HLS: не найден вариант в master-плейлисте')
}

function parseMediaPlaylist(
  text: string,
  base: string,
): { segments: PlaylistSegment[]; totalDurationSeconds: number } {
  const lines = text.split(/\r?\n/)
  const segments: PlaylistSegment[] = []
  let totalDurationSeconds = 0
  let pendingDuration = 0

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.startsWith('#EXTINF:')) {
      const match = line.match(/#EXTINF:([\d.]+)/)
      pendingDuration = match ? Number(match[1]) : 0
      continue
    }
    if (!line || line.startsWith('#')) continue

    totalDurationSeconds += pendingDuration
    segments.push({ url: resolveUrl(line, base), duration: pendingDuration })
    pendingDuration = 0
  }

  return { segments, totalDurationSeconds }
}

async function estimateDirect(
  url: string,
  headers: Record<string, string> | undefined,
  timeoutMs: number,
): Promise<VideoQualityEstimate> {
  const probe = await probeUrl(url, headers, timeoutMs)
  return toEstimate(probe)
}

async function estimateHls(
  url: string,
  headers: Record<string, string> | undefined,
  timeoutMs: number,
): Promise<VideoQualityEstimate> {
  const first = await fetchTextWithUrl(url, timeoutMs, { headers })
  let playlistText = first.text
  let base = first.finalUrl

  if (isMasterPlaylist(playlistText)) {
    const variantUrl = extractFirstVariantUrl(playlistText, base)
    const variant = await fetchTextWithUrl(variantUrl, timeoutMs, { headers })
    playlistText = variant.text
    base = variant.finalUrl
  }

  const { segments, totalDurationSeconds } = parseMediaPlaylist(playlistText, base)
  if (segments.length === 0) {
    throw new Error('HLS: в плейлисте нет сегментов')
  }

  const segmentBuffer = await fetchBuffer(segments[0].url, timeoutMs, { headers })
  const probe = await probeBuffer(segmentBuffer, timeoutMs)
  const estimate = toEstimate(probe)

  const sampleDurationSeconds = estimate.durationSeconds || segments[0].duration
  const sampleBitrateBps =
    sampleDurationSeconds > 0 ? (segmentBuffer.length * 8) / sampleDurationSeconds : null

  return {
    ...estimate,
    durationSeconds: totalDurationSeconds || estimate.durationSeconds,
    fileSizeBytes:
      sampleBitrateBps !== null && totalDurationSeconds > 0
        ? Math.round((sampleBitrateBps * totalDurationSeconds) / 8)
        : null,
  }
}

export async function estimateVideoQuality(
  quality: VideoQualityInfo,
  timeoutMs: number,
): Promise<VideoQualityEstimate> {
  if (quality.type === 'm3u8') {
    return estimateHls(quality.url, quality.headers, timeoutMs)
  }
  return estimateDirect(quality.url, quality.headers, timeoutMs)
}
