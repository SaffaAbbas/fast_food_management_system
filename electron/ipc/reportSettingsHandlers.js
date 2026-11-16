import { ipcMain } from 'electron'
import crypto from 'node:crypto'
import { reportsRepository } from '../db/repositories/reportsRepository.js'
import { settingsRepository } from '../db/repositories/settingsRepository.js'
import { getDb } from '../db/index.js'
import { requirePermission, requireAnyPermission, requireSession, getActiveBranchId } from './authGuard.js'

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

  ipcMain.handle('reports:get-audit-logs', async (_event, params = {}) => {
    const session = requireAnyPermission(['audit:view', 'settings:manage'])
    const fullAccess = session.roleCode === 'super_admin' || session.permissions?.includes('audit:view') || session.permissions?.includes('settings:manage')
    return reportsRepository.getAuditLogs(getActiveBranchId(params.branchId), {
      ...params,
      fullAccess,
    })
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

  ipcMain.handle('reports:get-inventory-report', async (_event, { branchId, filter } = {}) => {
    requirePermission('reports:view')
    return reportsRepository.getInventoryReport(getActiveBranchId(branchId), filter)
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

  ipcMain.handle('reports:get-food-cost', async (_event, { branchId, filter } = {}) => {
    requirePermission('reports:view')
    return reportsRepository.getFoodCostReport(getActiveBranchId(branchId), filter)
  })

  ipcMain.handle('reports:get-purchase-report', async (_event, { branchId, filter } = {}) => {
    requirePermission('reports:view')
    return reportsRepository.getPurchaseReport(getActiveBranchId(branchId), filter)
  })

  ipcMain.handle('reports:get-vendor-statement', async (_event, { branchId, filter } = {}) => {
    requirePermission('reports:view')
    return reportsRepository.getVendorStatementReport(getActiveBranchId(branchId), filter)
  })

  ipcMain.handle('reports:get-cashier-report', async (_event, { branchId, filter } = {}) => {
    requirePermission('reports:view')
    return reportsRepository.getCashierReport(getActiveBranchId(branchId), filter)
  })

  ipcMain.handle('reports:get-branch-comparison', async (_event, { filter } = {}) => {
    requirePermission('reports:view')
    return reportsRepository.getBranchComparison(filter)
  })

  ipcMain.handle('reports:get-lookups', async () => {
    requirePermission('reports:view')
    return reportsRepository.getLookups()
  })

  ipcMain.handle('settings:get-all', async () => {
    const session = requireSession()
    const all = settingsRepository.getAll()
    const canSecrets = session.roleCode === 'super_admin' || session.permissions?.includes('settings:manage')
    if (!canSecrets) {
      delete all.supabase_key
      delete all.supabase_anon_key
    }
    return all
  })

  ipcMain.handle('settings:get', async (_event, key) => {
    const session = requireSession()
    if (/key|secret|token|password/i.test(String(key || '')) && session.roleCode !== 'super_admin' && !session.permissions?.includes('settings:manage')) {
      return null
    }
    return settingsRepository.get(key)
  })

  ipcMain.handle('settings:save-batch', async (_event, settingsObj) => {
    const session = requireAnyPermission(['settings:manage', 'settings:branch'])
    const locked = ['supabase_url', 'supabase_key', 'cloud_sync_enabled']
    for (const [key, val] of Object.entries(settingsObj || {})) {
      if (locked.includes(key) && session.roleCode !== 'super_admin' && !session.permissions?.includes('settings:manage')) {
        continue
      }
      settingsRepository.set(key, String(val))
    }
    const db = getDb()
    db.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, 'UPDATE_SETTINGS', 'SETTINGS', 'batch', ?, ?)
    `).run(
      crypto.randomUUID(),
      session.branchId || null,
      session.id,
      JSON.stringify({ keys: Object.keys(settingsObj || {}), username: session.username }),
      new Date().toISOString()
    )
    return settingsRepository.getAll()
  })
}
