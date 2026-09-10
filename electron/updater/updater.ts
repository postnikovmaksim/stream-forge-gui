import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdaterEvent } from '../../shared/updater'

// Автообновление через electron-updater + GitHub Releases — использует тот
// же "publish" из package.json ("build"), что и electron-builder при сборке
// (провайдер/owner/repo совпадают, отдельно настраивать не нужно). Работает
// только для запакованной сборки (app.isPackaged) — в dev-режиме нет
// app-update.yml, который electron-builder генерирует только при упаковке.
//
// autoDownload выключен намеренно: пользователь явно просит "предлагай
// скачать" — значит сначала показываем, что есть новая версия, и скачиваем
// только по явному клику, а не тихо в фоне.
//
// Платформенные ограничения (задокументированы и в README):
// - macOS: реальная установка обновления (quitAndInstall) у electron-updater
//   штатно требует подписанное приложение (Squirrel.Mac) — у нас пока нет
//   Developer ID сертификата, так что на macOS до появления подписи это,
//   вероятно, будет работать не до конца бесшовно.
// - Linux: авто-обновление у electron-updater поддержано только для
//   AppImage (подменяет файл на месте) — .deb-инсталляция обновляется через
//   штатный apt/dpkg-механизм ОС, не через это приложение.
let emit: ((event: UpdaterEvent) => void) | null = null

export function initUpdater(emitEvent: (event: UpdaterEvent) => void): void {
  emit = emitEvent

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => emit?.({ type: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    emit?.({ type: 'available', info: { version: info.version } }),
  )
  autoUpdater.on('update-not-available', (info) =>
    emit?.({ type: 'not-available', info: { version: info.version } }),
  )
  autoUpdater.on('download-progress', (progress) =>
    emit?.({ type: 'progress', percent: Math.round(progress.percent) }),
  )
  autoUpdater.on('update-downloaded', (info) =>
    emit?.({ type: 'downloaded', info: { version: info.version } }),
  )
  autoUpdater.on('error', (error: Error) => emit?.({ type: 'error', message: error.message }))
}

export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) {
    emit?.({
      type: 'error',
      message: 'Проверка обновлений недоступна в режиме разработки (нужна упакованная сборка).',
    })
    return
  }
  await autoUpdater.checkForUpdates()
}

export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate()
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
