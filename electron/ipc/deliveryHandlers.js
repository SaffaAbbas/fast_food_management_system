import { ipcMain } from 'electron'
import { deliveryRepository } from '../db/repositories/deliveryRepository.js'
import { authRepository } from '../db/repositories/authRepository.js'

export function registerDeliveryHandlers() {
  // Zones
  ipcMain.handle('delivery:get-zones', async (_event, branchId) => {
    return deliveryRepository.getZones(branchId)
  })

  ipcMain.handle('delivery:create-zone', async (_event, data) => {
    return deliveryRepository.createZone(data)
  })

  ipcMain.handle('delivery:update-zone', async (_event, { id, data }) => {
    return deliveryRepository.updateZone(id, data)
  })

  // Riders
  ipcMain.handle('delivery:get-riders', async (_event, { branchId, status } = {}) => {
    return deliveryRepository.getRiders(branchId, status)
  })

  ipcMain.handle('delivery:get-rider-by-id', async (_event, id) => {
    return deliveryRepository.getRiderById(id)
  })

  ipcMain.handle('delivery:create-rider', async (_event, data) => {
    return deliveryRepository.createRider(data)
  })

  ipcMain.handle('delivery:update-rider', async (_event, { id, data }) => {
    return deliveryRepository.updateRider(id, data)
  })

  ipcMain.handle('delivery:update-rider-status', async (_event, { id, status }) => {
    return deliveryRepository.updateRiderStatus(id, status)
  })

  // Deliveries / Dispatches
  ipcMain.handle('delivery:get-deliveries', async (_event, { branchId, filters } = {}) => {
    return deliveryRepository.getDeliveries(branchId, filters)
  })

  ipcMain.handle('delivery:get-delivery-by-id', async (_event, id) => {
    return deliveryRepository.getDeliveryById(id)
  })

  ipcMain.handle('delivery:create-delivery', async (_event, data) => {
    return deliveryRepository.createDelivery(data)
  })

  ipcMain.handle('delivery:assign-rider', async (_event, { deliveryId, riderId }) => {
    return deliveryRepository.assignRider(deliveryId, riderId)
  })

  ipcMain.handle('delivery:dispatch', async (_event, deliveryId) => {
    return deliveryRepository.dispatchDelivery(deliveryId)
  })

  ipcMain.handle('delivery:complete', async (_event, { deliveryId, codCollectedCents }) => {
    return deliveryRepository.completeDelivery(deliveryId, { codCollectedCents })
  })

  ipcMain.handle('delivery:fail', async (_event, { deliveryId, reason }) => {
    return deliveryRepository.failDelivery(deliveryId, reason)
  })

  // Cash On Delivery (COD) Settlements
  ipcMain.handle('delivery:get-rider-pending-cod', async (_event, riderId) => {
    return deliveryRepository.getRiderPendingCod(riderId)
  })

  ipcMain.handle('delivery:settle-rider-cod', async (_event, { branchId, riderId, notes }) => {
    const session = authRepository.getCurrentSession()
    const settledByUserId = session?.userId
    if (!settledByUserId) throw new Error('Authentication required to settle rider funds.')
    return deliveryRepository.settleRiderCod({
      branchId,
      riderId,
      settledByUserId,
      notes,
    })
  })

  ipcMain.handle('delivery:get-settlement-history', async (_event, { branchId, params } = {}) => {
    return deliveryRepository.getSettlementHistory(branchId, params)
  })

  // Summary Metrics
  ipcMain.handle('delivery:get-summary', async (_event, branchId) => {
    return deliveryRepository.getSummary(branchId)
  })
}
