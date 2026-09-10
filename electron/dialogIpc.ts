import { BrowserWindow, dialog, ipcMain } from 'electron'

export function registerDialogIpcHandlers(): void {
  ipcMain.handle('dialog:choose-directory', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
    }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })
}
