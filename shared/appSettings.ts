export interface ProxySettings {
  enabled: boolean
  host: string
  port: string
  user: string
  password: string
}

export interface AppSettings {
  downloadPath: string
  parallelDownloads: number
  proxy: ProxySettings
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  downloadPath: '',
  parallelDownloads: 1,
  proxy: {
    enabled: false,
    host: '',
    port: '',
    user: '',
    password: '',
  },
}
