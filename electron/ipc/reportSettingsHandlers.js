import { ipcMain } from 'electron'
import { reportsRepository } from '../db/repositories/reportsRepository.js'
import { settingsRepository } from '../db/repositories/settingsRepository.js'

export function registerReportSettingsHandlers() {
  // Reports & Analytics
  ipcMain.handle('reports:get-sales-summary', async (_event, { branchId, filter } = {}) => {
    return reportsRepository.getSalesSummary(branchId, filter)
  })

  ipcMain.handle('reports:get-product-performance', async (_event, { branchId, filter } = {}) => {
    return reportsRepository.getProductPerformance(branchId, filter)
  })

  ipcMain.handle('reports:get-hourly-breakdown', async (_event, { branchId, filter } = {}) => {
    return reportsRepository.getHourlyBreakdown(branchId, filter)
  })

  ipcMain.handle('reports:get-profit-and-loss', async (_event, { branchId, filter } = {}) => {
    return reportsRepository.getProfitAndLoss(branchId, filter)
  })

  ipcMain.handle('reports:get-void-audits', async (_event, { branchId, filter } = {}) => {
    return reportsRepository.getVoidAndRefundAudits(branchId, filter)
  })

  ipcMain.handle('reports:get-audit-logs', async (_event, { branchId, limit } = {}) => {
    return reportsRepository.getAuditLogs(branchId, limit)
  })

  // System Settings
  ipcMain.handle('settings:get-all', async () => {
    return settingsRepository.getAll()
  })

  ipcMain.handle('settings:get', async (_event, key) => {
    return settingsRepository.get(key)
  })

  ipcMain.handle('settings:save-batch', async (_event, settingsObj) => {
    for (const [key, val] of Object.entries(settingsObj)) {
      settingsRepository.set(key, String(val))
    }
    return settingsRepository.getAll()
  })
}
