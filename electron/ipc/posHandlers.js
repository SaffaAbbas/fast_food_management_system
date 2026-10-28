import { ipcMain } from 'electron'
import { orderRepository } from '../db/repositories/orderRepository.js'
import { requirePermission, requireSession, getActiveBranchId } from './authGuard.js'
import { broadcast } from './localEvents.js'

export function registerPosIpcHandlers() {
  ipcMain.handle('pos:create-order', async (_event, orderData) => {
    requirePermission('pos:create_order')
    const branchId = getActiveBranchId(orderData.branchId)
    const session = requireSession()
    const order = orderRepository.createOrder({
      ...orderData,
      branchId,
      cashierId: orderData.cashierId || session.id,
    })
    if (order?.status && order.status !== 'DRAFT') {
      broadcast('kitchen:new-order', { orderId: order.id, orderNumber: order.orderNumber || order.order_number })
    }
    return order
  })

  ipcMain.handle('pos:get-order', async (_event, orderId) => {
    requireSession()
    return orderRepository.getOrderDetails(orderId)
  })

  ipcMain.handle('pos:process-payment', async (_event, paymentData) => {
    requirePermission('pos:create_order')
    const branchId = getActiveBranchId(paymentData.branchId)
    const session = requireSession()
    const result = orderRepository.processPayment({
      ...paymentData,
      branchId,
      cashierId: paymentData.cashierId || session.id,
    })
    broadcast('pos:status-change', { orderId: paymentData.orderId, status: result?.status })
    return result
  })

  ipcMain.handle('pos:hold-order', async (_event, orderData) => {
    requirePermission('pos:create_order')
    const branchId = getActiveBranchId(orderData.branchId)
    const session = requireSession()
    return orderRepository.holdOrder({
      ...orderData,
      branchId,
      cashierId: orderData.cashierId || session.id,
    })
  })

  ipcMain.handle('pos:get-held-orders', async (_event, branchId) => {
    requireSession()
    return orderRepository.getHeldOrders(getActiveBranchId(branchId))
  })

  ipcMain.handle('pos:cancel-order', async (_event, { orderId, reason }) => {
    requirePermission('pos:create_order')
    const session = requireSession()
    const result = orderRepository.cancelOrder(orderId, reason, session.id)
    broadcast('kitchen:order-update', { orderId, status: 'CANCELLED' })
    return result
  })

  ipcMain.handle('pos:refund-order', async (_event, data) => {
    requirePermission('pos:process_refund')
    const session = requireSession()
    const result = orderRepository.refundOrder({
      ...data,
      cashierId: session.id,
    })
    broadcast('pos:status-change', { orderId: data.orderId, status: result?.status })
    return result
  })

  ipcMain.handle('pos:get-orders', async (_event, params = {}) => {
    requireSession()
    return orderRepository.getOrders({
      ...params,
      branchId: getActiveBranchId(params.branchId),
    })
  })
}
