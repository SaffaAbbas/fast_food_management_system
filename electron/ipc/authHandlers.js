import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels.js'
import { authRepository } from '../db/repositories/authRepository.js'
import { dashboardRepository } from '../db/repositories/dashboardRepository.js'

export function registerAuthAndDashboardHandlers() {
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (_event, credentials = {}) => {
    try {
      const username = credentials?.username
      const password = credentials?.password
      if (!username || !password) {
        throw new Error('Enter your username and password.')
      }
      return authRepository.loginWithPassword(username, password)
    } catch (err) {
      console.error('[IPC auth:login] Error:', err.message)
      throw err
    }
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async (_event, token) => {
    return authRepository.logout(typeof token === 'string' ? token : undefined)
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_CURRENT_USER, async (_event, token) => {
    if (typeof token === 'string') return authRepository.getCurrentSession(token)
    return authRepository.getCurrentSession()
  })

  ipcMain.handle('auth:get-login-users', async () => {
    return authRepository.getLoginUsers()
  })

  ipcMain.handle('auth:list-roles', async () => {
    return authRepository.listRoles()
  })

  ipcMain.handle('auth:mail-status', async () => {
    return authRepository.getMailStatus()
  })

  ipcMain.handle('auth:save-mail-config', async (_event, payload) => {
    return authRepository.saveMailConfig(payload || {})
  })

  ipcMain.handle('auth:signup', async (_event, payload) => {
    return authRepository.signup(payload || {})
  })

  ipcMain.handle('auth:request-signup', async (_event, payload) => {
    return authRepository.requestSignup(payload || {})
  })

  ipcMain.handle('auth:resend-signup-otp', async (_event, payload) => {
    return authRepository.resendSignupOtp(payload || {})
  })

  ipcMain.handle('auth:verify-signup', async (_event, payload) => {
    return authRepository.verifySignupOtp(payload || {})
  })

  ipcMain.handle('auth:needs-setup', async () => {
    return authRepository.needsSetup()
  })

  ipcMain.handle('auth:complete-setup', async (_event, payload) => {
    return authRepository.completeInitialSetup(payload || {})
  })

  ipcMain.handle('dashboard:get-metrics', async (_event, payload = {}) => {
    try {
      const session = authRepository.getCurrentSession()
      if (!session) {
        const state = authRepository.getLastSessionState()
        if (state === 'expired') throw new Error('Session expired. Please sign in again.')
        if (state === 'revoked') throw new Error('Your session has ended. Please sign in again.')
        throw new Error('Unauthorized: Please sign in.')
      }
      if (session.roleCode !== 'super_admin' && !session.permissions?.includes('dashboard:view')) {
        throw new Error("Unauthorized: Requires 'dashboard:view' permission.")
      }
      const activeBranchId = session.roleCode === 'super_admin'
        ? (payload.branchId || session.branchId)
        : session.branchId
      return dashboardRepository.getMetrics(activeBranchId, payload.rangeType || 'today', payload)
    } catch (err) {
      console.error('[IPC dashboard:get-metrics] Error:', err.message)
      throw err
    }
  })

  ipcMain.handle('dashboard:list-branches', async () => {
    const session = authRepository.getCurrentSession()
    if (!session) {
      const state = authRepository.getLastSessionState()
      if (state === 'expired') throw new Error('Session expired. Please sign in again.')
      if (state === 'revoked') throw new Error('Your session has ended. Please sign in again.')
      throw new Error('Unauthorized: Please sign in.')
    }
    if (session.roleCode !== 'super_admin') {
      return session.branchId
        ? [{ id: session.branchId, name: session.branchName, code: null, currency_symbol: session.currencySymbol }]
        : []
    }
    return dashboardRepository.listBranches()
  })
}
