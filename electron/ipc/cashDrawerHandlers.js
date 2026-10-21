import { ipcMain } from 'electron'
import { cashDrawerRepository } from '../db/repositories/cashDrawerRepository.js'
import { authRepository } from '../db/repositories/authRepository.js'
import { getDb } from '../db/index.js'

function getActiveBranchId(providedBranchId) {
  if (providedBranchId) return providedBranchId
  const session = authRepository.getCurrentSession()
  if (session?.branchId) return session.branchId
  const db = getDb()
  return db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
}

function getActiveUserId() {
  const session = authRepository.getCurrentSession()
  return session?.id || null
}

export function registerCashDrawerIpcHandlers() {
  ipcMain.handle('cash:get-current-session', async (_event, params = {}) => {
    const branchId = getActiveBranchId(params.branchId)
    const userId = params.userId || getActiveUserId()
    return cashDrawerRepository.getCurrentSession(branchId, userId)
  })

  ipcMain.handle('cash:open-session', async (_event, data = {}) => {
    const branchId = getActiveBranchId(data.branchId)
    const userId = data.userId || getActiveUserId()
    return cashDrawerRepository.openSession({
      ...data,
      branchId,
      userId,
    })
  })

  ipcMain.handle('cash:record-movement', async (_event, data) => {
    return cashDrawerRepository.recordMovement(data)
  })

  ipcMain.handle('cash:get-x-report', async (_event, sessionId) => {
    return cashDrawerRepository.getXReport(sessionId)
  })

  ipcMain.handle('cash:close-session', async (_event, data) => {
    return cashDrawerRepository.closeSession(data)
  })

  ipcMain.handle('cash:get-history', async (_event, params = {}) => {
    const branchId = getActiveBranchId(params.branchId)
    return cashDrawerRepository.getSessionHistory(branchId, params)
  })

  ipcMain.handle('cash:get-details', async (_event, sessionId) => {
    return cashDrawerRepository.getSessionDetails(sessionId)
  })
}
