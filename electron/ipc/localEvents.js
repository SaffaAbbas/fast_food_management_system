import { BrowserWindow } from 'electron'

/**
 * Push a local event to every open renderer window.
 * Used for kitchen tickets, POS status, and inventory alerts without cloud.
 */
export function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}
