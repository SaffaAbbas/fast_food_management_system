import { ipcMain } from 'electron'
import { staffRepository } from '../db/repositories/staffRepository.js'
import { authRepository } from '../db/repositories/authRepository.js'
import { getDb } from '../db/index.js'

function getActiveBranchId(providedBranchId) {
  if (providedBranchId) return providedBranchId
  const session = authRepository.getCurrentSession()
  if (session?.branchId) return session.branchId
  const db = getDb()
  return db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
}

function assertManagerOrAdmin() {
  const session = authRepository.getCurrentSession()
  if (session && !['super_admin', 'branch_admin', 'manager'].includes(session.roleCode)) {
    throw new Error('Unauthorized: Manager or Admin role required.')
  }
}

export function registerStaffIpcHandlers() {
  // ==========================================
  // EMPLOYEE ROSTER
  // ==========================================
  ipcMain.handle('staff:get-employees', async (_event, params = {}) => {
    const branchId = getActiveBranchId(params.branchId)
    return staffRepository.getEmployees({ ...params, branchId })
  })

  ipcMain.handle('staff:get-employee-by-id', async (_event, employeeId) => {
    return staffRepository.getEmployeeById(employeeId)
  })

  ipcMain.handle('staff:create-employee', async (_event, data) => {
    assertManagerOrAdmin()
    const branchId = getActiveBranchId(data.branchId)
    return staffRepository.createEmployee({ ...data, branchId })
  })

  ipcMain.handle('staff:update-employee', async (_event, { id, data }) => {
    assertManagerOrAdmin()
    return staffRepository.updateEmployee(id, data)
  })

  // ==========================================
  // ATTENDANCE & CLOCK-IN / OUT
  // ==========================================
  ipcMain.handle('staff:clock-in', async (_event, data) => {
    const branchId = getActiveBranchId(data.branchId)
    return staffRepository.clockIn({ ...data, branchId })
  })

  ipcMain.handle('staff:clock-out', async (_event, data) => {
    return staffRepository.clockOut(data)
  })

  ipcMain.handle('staff:get-attendance-logs', async (_event, params = {}) => {
    const branchId = getActiveBranchId(params.branchId)
    return staffRepository.getAttendanceLogs({ ...params, branchId })
  })

  // ==========================================
  // SHIFTS & PERFORMANCE
  // ==========================================
  ipcMain.handle('staff:get-shifts', async (_event, branchId) => {
    return staffRepository.getShifts(getActiveBranchId(branchId))
  })

  ipcMain.handle('staff:save-shift', async (_event, shiftData) => {
    assertManagerOrAdmin()
    const branchId = getActiveBranchId(shiftData.branchId)
    return staffRepository.saveShift({ ...shiftData, branchId })
  })

  ipcMain.handle('staff:get-performance', async (_event, params = {}) => {
    const branchId = getActiveBranchId(params.branchId)
    return staffRepository.getStaffPerformance({ ...params, branchId })
  })

  // ==========================================
  // USER ADMINISTRATION (Manager View)
  // ==========================================
  ipcMain.handle('staff:get-users', async (_event, branchId) => {
    assertManagerOrAdmin()
    return staffRepository.getUsers(getActiveBranchId(branchId))
  })

  ipcMain.handle('staff:get-roles', async () => {
    return staffRepository.getRoles()
  })

  ipcMain.handle('staff:create-user', async (_event, userData) => {
    assertManagerOrAdmin()
    const branchId = getActiveBranchId(userData.branchId)
    return staffRepository.createUser({ ...userData, branchId })
  })

  ipcMain.handle('staff:update-user', async (_event, { id, data }) => {
    assertManagerOrAdmin()
    return staffRepository.updateUser(id, data)
  })
}
