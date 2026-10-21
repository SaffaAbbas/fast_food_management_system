import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels.js'
import { authRepository } from '../db/repositories/authRepository.js'
import { dashboardRepository } from '../db/repositories/dashboardRepository.js'
import { getDb } from '../db/index.js'

export function registerAuthAndDashboardHandlers() {
  // Login with Password
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (_event, credentials) => {
    try {
      if (credentials.pin) {
        return authRepository.loginWithPin(credentials.pin, credentials.userId, credentials.username)
      } else if (credentials.username && credentials.password) {
        return authRepository.loginWithPassword(credentials.username, credentials.password)
      } else {
        throw new Error('Must provide PIN or username and password.')
      }
    } catch (err) {
      console.error('[IPC auth:login] Error:', err.message)
      throw err
    }
  })

  // Logout
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
    return authRepository.logout()
  })

  // Get Current Session
  ipcMain.handle(IPC_CHANNELS.AUTH_CURRENT_USER, async () => {
    return authRepository.getCurrentSession()
  })

  // Get users for Quick PIN screen
  ipcMain.handle('auth:get-login-users', async () => {
    return authRepository.getLoginUsers()
  })

  // Dashboard Metrics
  ipcMain.handle('dashboard:get-metrics', async (_event, { branchId, rangeType } = {}) => {
    try {
      const db = getDb()
      const session = authRepository.getCurrentSession()
      const activeBranchId = branchId || session?.branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
      return dashboardRepository.getMetrics(activeBranchId, rangeType || 'today')
    } catch (err) {
      console.error('[IPC dashboard:get-metrics] Error:', err.message)
      throw err
    }
  })
}
