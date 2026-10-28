import { ipcMain } from 'electron'
import { reportsRepository } from '../db/repositories/reportsRepository.js'
import { settingsRepository } from '../db/repositories/settingsRepository.js'
import { requirePermission, requireSession, getActiveBranchId } from './authGuard.js'

export function registerReportSettingsHandlers() {
  ipcMain.handle('reports:get-sales-summary', async (_event, { branchId, filter } = {}) => {
    requirePermission('reports:view')
    return reportsRepository.getSalesSummary(getActiveBranchId(branchId), filter)
  })

  ipcMain.handle('reports:get-product-performance', async (_event, { branchId, filter } = {}) => {
    requirePermission('reports:view')
    return reportsRepository.getProductPerformance(getActiveBranchId(branchId), filter)
  })

  ipcMain.handle('reports:get-hourly-breakdown', async (_event, { branchId, filter } = {}) => {
    requirePermission('reports:view')
    return reportsRepository.getHourlyBreakdown(getActiveBranchId(branchId), filter)
  })

  ipcMain.handle('reports:get-profit-and-loss', async (_event, { branchId, filter } = {}) => {
    requirePermission('reports:view')
    return reportsRepository.getProfitAndLoss(getActiveBranchId(branchId), filter)
  })

  ipcMain.handle('reports:get-void-audits', async (_event, { branchId, filter } = {}) => {
    requirePermission('reports:view')
    return reportsRepository.getVoidAndRefundAudits(getActiveBranchId(branchId), filter)
  })

  ipcMain.handle('reports:get-audit-logs', async (_event, { branchId, limit } = {}) => {
    requirePermission('reports:view')
    return reportsRepository.getAuditLogs(getActiveBranchId(branchId), limit)
  })

  ipcMain.handle('reports:get-staff-sales', async (_event, { branchId, filter } = {}) => {
    requirePermission('reports:view')
    return reportsRepository.getStaffSales(getActiveBranchId(branchId), filter)
  })

  ipcMain.handle('reports:get-customer-report', async (_event, { branchId, filter } = {}) => {
    requirePermission('reports:view')
    return reportsRepository.getCustomerReport(getActiveBranchId(branchId), filter)
  })

  ipcMain.handle('reports:get-kitchen-report', async (_event, { branchId, filter } = {}) => {
    requirePermission('reports:view')
    return reportsRepository.getKitchenReport(getActiveBranchId(branchId), filter)
  })

  ipcMain.handle('reports:get-delivery-report', async (_event, { branchId, filter } = {}) => {
    requirePermission('reports:view')
    return reportsRepository.getDeliveryReport(getActiveBranchId(branchId), filter)
  })

  ipcMain.handle('reports:get-inventory-report', async (_event, { branchId } = {}) => {
    requirePermission('reports:view')
    return reportsRepository.getInventoryReport(getActiveBranchId(branchId))
  })

  ipcMain.handle('reports:get-expense-report', async (_event, { branchId, filter } = {}) => {
    requirePermission('reports:view')
    return reportsRepository.getExpenseReport(getActiveBranchId(branchId), filter)
  })

  ipcMain.handle('reports:get-reservation-report', async (_event, { branchId, filter } = {}) => {
    requirePermission('reports:view')
    return reportsRepository.getReservationReport(getActiveBranchId(branchId), filter)
  })

  ipcMain.handle('reports:get-refund-report', async (_event, { branchId, filter } = {}) => {
    requirePermission('reports:view')
    return reportsRepository.getRefundReport(getActiveBranchId(branchId), filter)
  })

  ipcMain.handle('settings:get-all', async () => {
    requireSession()
    return settingsRepository.getAll()
  })

  ipcMain.handle('settings:get', async (_event, key) => {
    requireSession()
    return settingsRepository.get(key)
  })

  ipcMain.handle('settings:save-batch', async (_event, settingsObj) => {
    requirePermission('settings:manage')
    for (const [key, val] of Object.entries(settingsObj || {})) {
      settingsRepository.set(key, String(val))
    }
    return settingsRepository.getAll()
  })
}
