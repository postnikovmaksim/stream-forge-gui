export interface UpdateInfo {
  version: string
}

export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; info: UpdateInfo }
  | { type: 'not-available'; info: UpdateInfo }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; info: UpdateInfo }
  | { type: 'error'; message: string }
