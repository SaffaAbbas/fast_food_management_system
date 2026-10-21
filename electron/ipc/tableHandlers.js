import { ipcMain } from 'electron'
import { tableRepository } from '../db/repositories/tableRepository.js'
import { authRepository } from '../db/repositories/authRepository.js'
import { getDb } from '../db/index.js'

function getActiveBranchId(providedBranchId) {
  if (providedBranchId) return providedBranchId
  const session = authRepository.getCurrentSession()
  if (session?.branchId) return session.branchId
  const db = getDb()
  return db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
}

function assertPermission(permCode) {
  const session = authRepository.getCurrentSession()
  if (session && session.roleCode !== 'super_admin' && !session.permissions?.includes(permCode)) {
    throw new Error(`Unauthorized: Requires '${permCode}' permission.`)
  }
}

export function registerTableIpcHandlers() {
  ipcMain.handle('table:get-floors-tables', async (_event, branchId) => {
    return tableRepository.getFloorsWithTables(getActiveBranchId(branchId))
  })

  ipcMain.handle('table:update-status', async (_event, { tableId, status, currentOrderId }) => {
    assertPermission('pos:create_order')
    return tableRepository.updateTableStatus(tableId, status, currentOrderId)
  })

  ipcMain.handle('table:transfer-table', async (_event, transferData) => {
    assertPermission('pos:create_order')
    return tableRepository.transferTable(transferData)
  })

  ipcMain.handle('table:create-floor', async (_event, floorData) => {
    assertPermission('settings:manage')
    const branchId = getActiveBranchId(floorData.branchId)
    return tableRepository.createFloor({ ...floorData, branchId })
  })

  ipcMain.handle('table:update-floor', async (_event, { id, ...floorData }) => {
    assertPermission('settings:manage')
    return tableRepository.updateFloor(id, floorData)
  })

  ipcMain.handle('table:create-table', async (_event, tableData) => {
    assertPermission('settings:manage')
    const branchId = getActiveBranchId(tableData.branchId)
    return tableRepository.createTable({ ...tableData, branchId })
  })

  ipcMain.handle('table:update-table', async (_event, { id, ...tableData }) => {
    assertPermission('settings:manage')
    return tableRepository.updateTable(id, tableData)
  })

  ipcMain.handle('table:archive-table', async (_event, id) => {
    assertPermission('settings:manage')
    return tableRepository.archiveTable(id)
  })
}
