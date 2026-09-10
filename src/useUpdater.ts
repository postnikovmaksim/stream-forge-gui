import { useCallback, useEffect, useState } from 'react'
import type { UpdaterEvent } from '../shared/updater'

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdaterState {
  version: string
  platform: string | null
  status: UpdaterStatus
  latestVersion: string | null
  progress: number | null
  errorMessage: string | null
}

export function useUpdater() {
  const [state, setState] = useState<UpdaterState>({
    version: '',
    platform: null,
    status: 'idle',
    latestVersion: null,
    progress: null,
    errorMessage: null,
  })

  useEffect(() => {
    window.animedl.updater.getVersion().then((version) => {
      setState((prev) => ({ ...prev, version }))
    })
    window.animedl.updater.getPlatform().then((platform) => {
      setState((prev) => ({ ...prev, platform }))
    })
  }, [])

  useEffect(() => {
    return window.animedl.updater.onEvent((event: UpdaterEvent) => {
      setState((prev) => {
        switch (event.type) {
          case 'checking':
            return { ...prev, status: 'checking', errorMessage: null }
          case 'available':
            return { ...prev, status: 'available', latestVersion: event.info.version }
          case 'not-available':
            return { ...prev, status: 'not-available', latestVersion: null }
          case 'progress':
            return { ...prev, status: 'downloading', progress: event.percent }
          case 'downloaded':
            return {
              ...prev,
              status: 'downloaded',
              latestVersion: event.info.version,
              progress: 100,
            }
          case 'error':
            return { ...prev, status: 'error', errorMessage: event.message }
        }
      })
    })
  }, [])

  const check = useCallback(() => {
    setState((prev) => ({ ...prev, status: 'checking', errorMessage: null }))
    window.animedl.updater.check()
  }, [])

  const download = useCallback(() => {
    window.animedl.updater.download()
  }, [])

  const install = useCallback(() => {
    window.animedl.updater.install()
  }, [])

  const openReleasePage = useCallback(() => {
    window.animedl.updater.openReleasePage()
  }, [])

  return { ...state, check, download, install, openReleasePage }
}
