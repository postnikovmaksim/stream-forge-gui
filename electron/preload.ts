import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('animedl', {
  // сюда будут добавлены методы IPC (поиск, скачивание, настройки)
  // по мере переноса логики из старого backend.py
})
