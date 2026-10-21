import { ipcMain } from 'electron'
import { customerRepository } from '../db/repositories/customerRepository.js'
import { reservationRepository } from '../db/repositories/reservationRepository.js'
import { couponRepository } from '../db/repositories/couponRepository.js'
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

export function registerCustomerIpcHandlers() {
  // ==========================================
  // CUSTOMER CRM & LOYALTY
  // ==========================================
  ipcMain.handle('customer:get-customers', async (_event, params = {}) => {
    return customerRepository.getCustomers(
      getActiveBranchId(params.branchId),
      params.searchQuery,
      params.limit,
      params.tag
    )
  })

  ipcMain.handle('customer:get-details', async (_event, id) => {
    return customerRepository.getCustomerById(id)
  })

  ipcMain.handle('customer:create', async (_event, customerData) => {
    const branchId = getActiveBranchId(customerData.branchId)
    return customerRepository.createCustomer({
      ...customerData,
      branchId,
    })
  })

  ipcMain.handle('customer:update', async (_event, { id, data }) => {
    return customerRepository.updateCustomer(id, data || {})
  })

  ipcMain.handle('customer:adjust-loyalty', async (_event, data) => {
    const branchId = getActiveBranchId(data.branchId)
    return customerRepository.adjustLoyaltyPoints({ ...data, branchId })
  })

  ipcMain.handle('customer:get-summary', async (_event, branchId) => {
    return customerRepository.getCrmSummary(getActiveBranchId(branchId))
  })

  // ==========================================
  // TABLE RESERVATIONS
  // ==========================================
  ipcMain.handle('reservation:get-reservations', async (_event, params = {}) => {
    const branchId = getActiveBranchId(params.branchId)
    return reservationRepository.getReservations({ ...params, branchId })
  })

  ipcMain.handle('reservation:create', async (_event, data) => {
    const branchId = getActiveBranchId(data.branchId)
    return reservationRepository.createReservation({ ...data, branchId })
  })

  ipcMain.handle('reservation:update-status', async (_event, { id, status }) => {
    return reservationRepository.updateReservationStatus(id, status)
  })

  ipcMain.handle('reservation:check-availability', async (_event, params = {}) => {
    const branchId = getActiveBranchId(params.branchId)
    return reservationRepository.checkAvailability({ ...params, branchId })
  })

  // ==========================================
  // PROMOTIONS & COUPONS
  // ==========================================
  ipcMain.handle('coupon:get-coupons', async (_event, branchId) => {
    return couponRepository.getCoupons(getActiveBranchId(branchId))
  })

  ipcMain.handle('coupon:create', async (_event, data) => {
    const branchId = getActiveBranchId(data.branchId)
    return couponRepository.createCoupon({ ...data, branchId })
  })

  ipcMain.handle('coupon:update', async (_event, { id, data }) => {
    return couponRepository.updateCoupon(id, data)
  })

  ipcMain.handle('coupon:validate', async (_event, data) => {
    const branchId = getActiveBranchId(data.branchId)
    return couponRepository.validateCoupon({ ...data, branchId })
  })
}
