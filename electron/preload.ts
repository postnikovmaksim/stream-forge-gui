import { contextBridge, ipcRenderer } from 'electron'
import type { SourceConfig } from '../shared/sourceConfig'

contextBridge.exposeInMainWorld('animedl', {
  sources: {
    get: (): Promise<SourceConfig[]> => ipcRenderer.invoke('sources:get'),
    save: (sources: SourceConfig[]): Promise<SourceConfig[]> =>
      ipcRenderer.invoke('sources:save', sources),
  },
})
