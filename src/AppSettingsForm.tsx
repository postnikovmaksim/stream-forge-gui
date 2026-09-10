import { useEffect, useState } from 'react'
import type { AppSettings } from '../shared/appSettings'

function AppSettingsForm() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [defaultPath, setDefaultPath] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    Promise.all([
      window.animedl.appSettings.get(),
      window.animedl.appSettings.getDefaultDownloadPath(),
    ]).then(([loaded, defaultDownloadPath]) => {
      setSettings(loaded)
      setDefaultPath(defaultDownloadPath)
    })
  }, [])

  async function handleBrowse() {
    const dir = await window.animedl.dialog.chooseDirectory()
    if (dir && settings) {
      setSettings({ ...settings, downloadPath: dir })
      setStatus('idle')
    }
  }

  async function handleSave() {
    if (!settings) return
    setStatus('saving')
    await window.animedl.appSettings.save(settings)
    setStatus('saved')
  }

  if (!settings) {
    return <p>Загрузка настроек...</p>
  }

  return (
    <div>
      <h2>Настройки</h2>

      <div>
        <label>Папка скачивания</label>
        <input
          type="text"
          value={settings.downloadPath}
          placeholder={defaultPath}
          onChange={(e) => {
            setSettings({ ...settings, downloadPath: e.target.value })
            setStatus('idle')
          }}
        />
        <button onClick={handleBrowse}>Обзор...</button>
      </div>

      <div>
        <label>
          <input
            type="checkbox"
            checked={settings.proxy.enabled}
            onChange={(e) => {
              setSettings({ ...settings, proxy: { ...settings.proxy, enabled: e.target.checked } })
              setStatus('idle')
            }}
          />
          Использовать SOCKS5-прокси
        </label>
      </div>

      <div>
        <input
          type="text"
          placeholder="IP"
          value={settings.proxy.host}
          onChange={(e) => {
            setSettings({ ...settings, proxy: { ...settings.proxy, host: e.target.value } })
            setStatus('idle')
          }}
        />
        <input
          type="text"
          placeholder="Порт"
          value={settings.proxy.port}
          onChange={(e) => {
            setSettings({ ...settings, proxy: { ...settings.proxy, port: e.target.value } })
            setStatus('idle')
          }}
        />
        <input
          type="text"
          placeholder="Логин"
          value={settings.proxy.user}
          onChange={(e) => {
            setSettings({ ...settings, proxy: { ...settings.proxy, user: e.target.value } })
            setStatus('idle')
          }}
        />
        <input
          type="password"
          placeholder="Пароль"
          value={settings.proxy.password}
          onChange={(e) => {
            setSettings({ ...settings, proxy: { ...settings.proxy, password: e.target.value } })
            setStatus('idle')
          }}
        />
      </div>

      <div>
        <label>Параллельных загрузок</label>
        <input
          type="number"
          min={1}
          max={10}
          value={settings.parallelDownloads}
          onChange={(e) => {
            setSettings({ ...settings, parallelDownloads: Number(e.target.value) })
            setStatus('idle')
          }}
        />
      </div>

      <button onClick={handleSave} disabled={status === 'saving'}>
        Сохранить
      </button>
      {status === 'saved' && <span> Сохранено</span>}
    </div>
  )
}

export default AppSettingsForm
