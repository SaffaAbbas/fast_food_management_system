import { ipcMain } from 'electron'
import { cashDrawerRepository } from '../db/repositories/cashDrawerRepository.js'
import { requireAnyPermission, requireSession, getActiveBranchId } from './authGuard.js'

export function registerCashDrawerIpcHandlers() {
  ipcMain.handle('cash:get-current-session', async (_event, params = {}) => {
    const session = requireSession()
    const branchId = getActiveBranchId(params.branchId)
    const userId = params.userId || session.id
    return cashDrawerRepository.getCurrentSession(branchId, userId)
  })

  ipcMain.handle('cash:open-session', async (_event, data = {}) => {
    const session = requireAnyPermission(['cash:manage', 'pos:create_order'])
    const branchId = getActiveBranchId(data.branchId)
    return cashDrawerRepository.openSession({
      ...data,
      branchId,
      userId: data.userId || session.id,
    })
  })

  ipcMain.handle('cash:record-movement', async (_event, data) => {
    requireAnyPermission(['cash:manage', 'pos:create_order'])
    return cashDrawerRepository.recordMovement(data)
  })

  ipcMain.handle('cash:get-x-report', async (_event, sessionId) => {
    requireSession()
    return cashDrawerRepository.getXReport(sessionId)
  })

  ipcMain.handle('cash:close-session', async (_event, data) => {
    requireAnyPermission(['cash:manage', 'pos:create_order'])
    return cashDrawerRepository.closeSession(data)
  })

  ipcMain.handle('cash:get-history', async (_event, params = {}) => {
    requireSession()
    const branchId = getActiveBranchId(params.branchId)
    return cashDrawerRepository.getSessionHistory(branchId, params)
  })

  ipcMain.handle('cash:get-details', async (_event, sessionId) => {
    requireSession()
    return cashDrawerRepository.getSessionDetails(sessionId)
  })
}
