import { ipcMain } from 'electron'
import { kitchenRepository } from '../db/repositories/kitchenRepository.js'
import { requirePermission, requireSession, getActiveBranchId } from './authGuard.js'
import { authRepository } from '../db/repositories/authRepository.js'
import { broadcast } from './localEvents.js'

function assertPermission(permCode) {
  return requirePermission(permCode)
}

export function registerKitchenIpcHandlers() {
  // Get active kitchen orders
  ipcMain.handle('kitchen:get-orders', async (_event, params = {}) => {
    assertPermission('kitchen:view')
    const branchId = getActiveBranchId(params.branchId)
    return kitchenRepository.getKitchenOrders({
      ...params,
      branchId,
    })
  })

  // Update item status (Pending -> Preparing -> Ready -> Served)
  ipcMain.handle('kitchen:update-item-status', async (_event, { orderItemId, status }) => {
    assertPermission('kitchen:view')
    const session = authRepository.getCurrentSession()
    const result = kitchenRepository.updateOrderItemStatus({
      orderItemId,
      status,
      userId: session?.id || null,
    })
    broadcast('kitchen:order-update', { orderItemId, status })
    return result
  })

  // Update whole order status (e.g. Preparing -> Ready -> Completed)
  ipcMain.handle('kitchen:update-order-status', async (_event, { orderId, status, notes }) => {
    assertPermission('kitchen:view')
    const session = authRepository.getCurrentSession()
    const result = kitchenRepository.updateOrderStatus({
      orderId,
      status,
      userId: session?.id || null,
      notes,
    })
    broadcast('kitchen:order-update', { orderId, status })
    broadcast('pos:status-change', { orderId, status })
    return result
  })

  // Get active stations
  ipcMain.handle('kitchen:get-stations', async (_event, branchId) => {
    requireSession()
    return kitchenRepository.getStations(getActiveBranchId(branchId))
  })

  // Create station
  ipcMain.handle('kitchen:create-station', async (_event, stationData) => {
    assertPermission('settings:manage')
    const branchId = getActiveBranchId(stationData.branchId)
    return kitchenRepository.createStation({
      ...stationData,
      branchId,
    })
  })

  // Update station
  ipcMain.handle('kitchen:update-station', async (_event, { id, data }) => {
    assertPermission('settings:manage')
    return kitchenRepository.updateStation(id, data)
  })

  // Get summary metrics for KDS header
  ipcMain.handle('kitchen:get-metrics', async (_event, branchId) => {
    assertPermission('kitchen:view')
    return kitchenRepository.getKitchenMetrics(getActiveBranchId(branchId))
  })
}
