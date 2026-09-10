import { app, shell } from 'electron'
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
// macOS: quitAndInstall() НЕ вызывается никогда — проверено вживую (полный
// цикл включая сам клик "Установить"): нативный шаг применения обновления
// (Squirrel.Mac/ShipIt) всегда проверяет цифровую подпись нового .app перед
// подменой старого и без Developer ID сертификата падает с
// `SQRLCodeSignatureErrorDomain` ("Code signature ... did not pass
// validation"). Это ограничение самой macOS, а не что-то, что можно
// обойти в коде — без платного Apple Developer аккаунта эта проверка не
// пройдёт никогда, при любом качестве сборки. Поэтому на macOS честно
// не претендуем на бесшовность: после скачивания сразу предлагаем открыть
// страницу релиза для ручной переустановки (см. UpdateControl.tsx,
// разветвление по platform === 'darwin').
//
// Linux: авто-обновление у electron-updater поддержано только для AppImage
// (подменяет файл на месте) — .deb-инсталляция обновляется через штатный
// apt/dpkg-механизм ОС, не через это приложение.
const RELEASES_URL = 'https://github.com/postnikovmaksim/stream-forge-gui/releases/latest'

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

export function openReleasePage(): Promise<void> {
  return shell.openExternal(RELEASES_URL)
}
