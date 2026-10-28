import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels.js'
import { authRepository } from '../db/repositories/authRepository.js'
import { dashboardRepository } from '../db/repositories/dashboardRepository.js'

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

  ipcMain.handle('auth:needs-setup', async () => {
    return authRepository.needsSetup()
  })

  ipcMain.handle('auth:complete-setup', async (_event, payload) => {
    return authRepository.completeInitialSetup(payload || {})
  })

  // Dashboard Metrics
  ipcMain.handle('dashboard:get-metrics', async (_event, { branchId, rangeType } = {}) => {
    try {
      const session = authRepository.getCurrentSession()
      if (!session) throw new Error('Unauthorized: Please sign in.')
      if (session.roleCode !== 'super_admin' && !session.permissions?.includes('dashboard:view')) {
        throw new Error("Unauthorized: Requires 'dashboard:view' permission.")
      }
      const activeBranchId = session.roleCode === 'super_admin'
        ? (branchId || session.branchId)
        : session.branchId
      return dashboardRepository.getMetrics(activeBranchId, rangeType || 'today')
    } catch (err) {
      console.error('[IPC dashboard:get-metrics] Error:', err.message)
      throw err
    }
  })
}
