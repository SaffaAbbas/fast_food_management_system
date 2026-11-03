import { ipcMain } from 'electron'
import { requirePermission } from './authGuard.js'
import { getSyncConfig, saveSyncConfig } from '../sync/config.js'
import { getSyncStatus, runSyncCycle } from '../sync/engine.js'

export function registerSyncHandlers() {
  ipcMain.handle('sync:get-status', async () => getSyncStatus())

  ipcMain.handle('sync:get-config', async () => {
    requirePermission('settings:manage')
    const cfg = getSyncConfig()
    return {
      enabled: cfg.enabled,
      url: cfg.url,
      hasKey: cfg.hasKey,
      deviceId: cfg.deviceId,
      lastSyncedAt: cfg.lastSyncedAt,
    }
  })

  ipcMain.handle('sync:save-config', async (_event, payload = {}) => {
    requirePermission('settings:manage')
    const saved = saveSyncConfig(payload)
    await runSyncCycle()
    return {
      enabled: saved.enabled,
      url: saved.url,
      hasKey: saved.hasKey,
      status: getSyncStatus(),
    }
  })

  ipcMain.handle('sync:run-now', async () => runSyncCycle({ retryFailed: true }))
}
