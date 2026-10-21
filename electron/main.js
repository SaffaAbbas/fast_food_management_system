import { app, BrowserWindow, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { registerIpcHandlers } from './ipc/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win = null

function createWindow() {
  win = new BrowserWindow({
    title: 'Restaurant & Fast Food Management System',
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false, // Show gracefully when ready
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for better-sqlite3 native IPC communication if needed
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  // Register main process secure IPC handlers
  registerIpcHandlers(win)

  // Show window gracefully when ready-to-show
  win.once('ready-to-show', () => {
    win.show()
  })

  // Prevent navigation to unapproved external URLs
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Open external web links in OS default browser rather than inside desktop Electron
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)
    // Only permit local dev server or local file navigation
    if (VITE_DEV_SERVER_URL) {
      const devServerOrigin = new URL(VITE_DEV_SERVER_URL).origin
      if (parsedUrl.origin !== devServerOrigin) {
        event.preventDefault()
      }
    } else if (parsedUrl.protocol !== 'file:') {
      event.preventDefault()
    }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Global exception handling
process.on('uncaughtException', (error) => {
  console.error('[Electron Main] Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[Electron Main] Unhandled Rejection:', reason)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)
