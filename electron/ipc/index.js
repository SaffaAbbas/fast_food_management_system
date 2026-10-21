import { ipcMain, app } from 'electron'
import { IPC_CHANNELS } from './channels.js'
import { registerDatabaseIpcHandlers } from './dbHandlers.js'
import { registerAuthAndDashboardHandlers } from './authHandlers.js'
import { registerProductIpcHandlers } from './productHandlers.js'
import { registerPosIpcHandlers } from './posHandlers.js'
import { registerTableIpcHandlers } from './tableHandlers.js'
import { registerCustomerIpcHandlers } from './customerHandlers.js'
import { registerKitchenIpcHandlers } from './kitchenHandlers.js'
import { registerInventoryIpcHandlers } from './inventoryHandlers.js'
import { registerCashDrawerIpcHandlers } from './cashDrawerHandlers.js'
import { registerStaffIpcHandlers } from './staffHandlers.js'
import { registerDeliveryHandlers } from './deliveryHandlers.js'
import { registerReportSettingsHandlers } from './reportSettingsHandlers.js'
import os from 'node:os'

/**
 * Register all secure IPC handlers in the Electron main process
 * @param {import('electron').BrowserWindow} mainWindow 
 */
export function registerIpcHandlers(mainWindow) {
  // App Info & System Status
  ipcMain.handle(IPC_CHANNELS.APP_GET_INFO, async () => {
    return {
      appName: 'Restaurant & Fast Food Management System',
      version: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      userDataPath: app.getPath('userData'),
      appPath: app.getAppPath(),
      isPackaged: app.isPackaged,
      mode: process.env.NODE_ENV || 'production',
      offlineOnly: true,
      timestamp: new Date().toISOString(),
    }
  })

  ipcMain.handle(IPC_CHANNELS.APP_PING, async (_event, payload) => {
    return {
      pong: true,
      received: payload,
      time: Date.now(),
    }
  })

  // Window Controls
  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize()
    }
  })

  ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
      } else {
        mainWindow.maximize()
      }
    }
  })

  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close()
    }
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      return mainWindow.isMaximized()
    }
    return false
  })

  // Register real SQLite database handlers
  registerDatabaseIpcHandlers()

  // Register Authentication & Dashboard handlers
  registerAuthAndDashboardHandlers()

  // Register Product, Category & Combo handlers
  registerProductIpcHandlers()

  // Register POS & Orders handlers (Phase 5)
  registerPosIpcHandlers()

  // Register Tables & Floor Layout handlers (Phase 5)
  registerTableIpcHandlers()

  // Register Customer CRM handlers (Phase 5 & 8)
  registerCustomerIpcHandlers()

  // Register Kitchen Display (KDS) handlers (Phase 6)
  registerKitchenIpcHandlers()

  // Register Inventory, Recipes, Purchases & Expenses handlers (Phase 7)
  registerInventoryIpcHandlers()

  // Register Cash Drawer & Shift handlers (Phase 8)
  registerCashDrawerIpcHandlers()

  // Register Staff, Shifts & Attendance handlers (Phase 8)
  registerStaffIpcHandlers()

  // Register Delivery & Dispatch handlers (Phase 10)
  registerDeliveryHandlers()

  // Register Reports, Analytics & Settings handlers (Phase 11)
  registerReportSettingsHandlers()
}
