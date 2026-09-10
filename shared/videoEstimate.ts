// Результат оценки качества видео через ffprobe (см. electron/ffprobe/estimate.ts).
// Любое поле может быть null — не все контейнеры/сегменты отдают все параметры
// (например, HLS-манифест без BANDWIDTH не содержит битрейт видео напрямую).
export interface VideoQualityEstimate {
  fileSizeBytes: number | null
  durationSeconds: number | null
  videoBitrateKbps: number | null
  audioBitrateKbps: number | null
  videoCodec: string | null
  audioCodec: string | null
  width: number | null
  height: number | null
}
