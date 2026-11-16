import { ipcMain } from 'electron'
import { tableRepository } from '../db/repositories/tableRepository.js'
import { requirePermission, requireAnyPermission, requireSession, getActiveBranchId } from './authGuard.js'

function assertPermission(permCode) {
  return requirePermission(permCode)
}

export function registerTableIpcHandlers() {
  ipcMain.handle('table:get-floors-tables', async (_event, branchId) => {
    requireSession()
    return tableRepository.getFloorsWithTables(getActiveBranchId(branchId))
  })

  ipcMain.handle('table:update-status', async (_event, { tableId, status, currentOrderId }) => {
    requireAnyPermission(['pos:create_order', 'tables:view', 'tables:manage'])
    return tableRepository.updateTableStatus(tableId, status, currentOrderId)
  })

  ipcMain.handle('table:transfer-table', async (_event, transferData) => {
    assertPermission('pos:create_order')
    return tableRepository.transferTable(transferData)
  })

  ipcMain.handle('table:create-floor', async (_event, floorData) => {
    requireAnyPermission(['tables:manage', 'settings:branch', 'settings:manage'])
    const branchId = getActiveBranchId(floorData.branchId)
    return tableRepository.createFloor({ ...floorData, branchId })
  })

  ipcMain.handle('table:update-floor', async (_event, { id, ...floorData }) => {
    requireAnyPermission(['tables:manage', 'settings:branch', 'settings:manage'])
    return tableRepository.updateFloor(id, floorData)
  })

  ipcMain.handle('table:create-table', async (_event, tableData) => {
    requireAnyPermission(['tables:manage', 'settings:branch', 'settings:manage'])
    const branchId = getActiveBranchId(tableData.branchId)
    return tableRepository.createTable({ ...tableData, branchId })
  })

  ipcMain.handle('table:update-table', async (_event, { id, ...tableData }) => {
    requireAnyPermission(['tables:manage', 'settings:branch', 'settings:manage'])
    return tableRepository.updateTable(id, tableData)
  })

  ipcMain.handle('table:archive-table', async (_event, id) => {
    requireAnyPermission(['tables:manage', 'settings:branch', 'settings:manage'])
    return tableRepository.archiveTable(id)
  })

  ipcMain.handle('table:merge-tables', async (_event, data) => {
    requirePermission('pos:create_order')
    return tableRepository.mergeTables(data)
  })

  ipcMain.handle('table:split-bill', async (_event, data) => {
    requirePermission('pos:create_order')
    return tableRepository.splitBill(data)
  })
}
