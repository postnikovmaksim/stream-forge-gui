import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerAppSettingsIpcHandlers } from './appSettingsIpc'
import { registerDialogIpcHandlers } from './dialogIpc'
import { registerDownloadIpcHandlers } from './download/ipc'
import { registerFfprobeIpcHandlers } from './ffprobe/ipc'
import { registerSourceConfigIpcHandlers } from './sourceConfigIpc'
import { registerAnimeIpcHandlers } from './sources/ipc'
import { checkForUpdates } from './updater/updater'
import { registerUpdaterIpcHandlers } from './updater/ipc'
import { ensureYtDlp } from './ytdlp/ensure'
import { registerYtDlpIpcHandlers } from './ytdlp/ipc'

// Electron по умолчанию берёт app.name (и вместе с ним userData-путь) из поля
// "name" в package.json — при ребрендинге в StreamForge оно сменилось на
// "stream-forge-gui", и без этой строки уже сохранённые локально настройки/
// sources.json в папке "animedl" осиротели бы (проверено вживую: появляется
// новая пустая папка "stream-forge-gui" вместо существующей "animedl").
// Явно фиксируем старое имя, чтобы ребрендинг был чисто визуальным.
app.setName('animedl')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  // Проверяем обновления только после did-finish-load — события идут через
  // webContents.send, а до этого момента renderer ещё не подписался на них
  // (onEvent вызывается в useEffect после маунта), события бы просто терялись.
  win.webContents.once('did-finish-load', () => {
    checkForUpdates().catch((error: unknown) => {
      console.error('Не удалось проверить обновления:', error)
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

registerAppSettingsIpcHandlers()
registerDialogIpcHandlers()
registerSourceConfigIpcHandlers()
registerAnimeIpcHandlers()
registerYtDlpIpcHandlers()
registerFfprobeIpcHandlers()
registerDownloadIpcHandlers(() => win?.webContents ?? null)
registerUpdaterIpcHandlers(() => win?.webContents ?? null)

app.whenReady().then(() => {
  createWindow()
  ensureYtDlp().catch((error: unknown) => {
    console.error('Не удалось подготовить yt-dlp:', error)
  })
})
