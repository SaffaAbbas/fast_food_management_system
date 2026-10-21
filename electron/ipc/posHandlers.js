import { ipcMain } from 'electron'
import { orderRepository } from '../db/repositories/orderRepository.js'
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

export function registerPosIpcHandlers() {
  ipcMain.handle('pos:create-order', async (_event, orderData) => {
    assertPermission('pos:create_order')
    const branchId = getActiveBranchId(orderData.branchId)
    const session = authRepository.getCurrentSession()
    return orderRepository.createOrder({
      ...orderData,
      branchId,
      cashierId: orderData.cashierId || session?.id || null,
    })
  })

  ipcMain.handle('pos:get-order', async (_event, orderId) => {
    return orderRepository.getOrderDetails(orderId)
  })

  ipcMain.handle('pos:process-payment', async (_event, paymentData) => {
    assertPermission('pos:create_order')
    const branchId = getActiveBranchId(paymentData.branchId)
    const session = authRepository.getCurrentSession()
    return orderRepository.processPayment({
      ...paymentData,
      branchId,
      cashierId: paymentData.cashierId || session?.id || null,
    })
  })

  ipcMain.handle('pos:hold-order', async (_event, orderData) => {
    assertPermission('pos:create_order')
    const branchId = getActiveBranchId(orderData.branchId)
    const session = authRepository.getCurrentSession()
    return orderRepository.holdOrder({
      ...orderData,
      branchId,
      cashierId: orderData.cashierId || session?.id || null,
    })
  })

  ipcMain.handle('pos:get-held-orders', async (_event, branchId) => {
    return orderRepository.getHeldOrders(getActiveBranchId(branchId))
  })

  ipcMain.handle('pos:cancel-order', async (_event, { orderId, reason }) => {
    assertPermission('pos:create_order')
    const session = authRepository.getCurrentSession()
    return orderRepository.cancelOrder(orderId, reason, session?.id || null)
  })

  ipcMain.handle('pos:get-orders', async (_event, params = {}) => {
    return orderRepository.getOrders({
      ...params,
      branchId: getActiveBranchId(params.branchId),
    })
  })
}
