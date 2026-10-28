import { ipcMain } from 'electron'
import { deliveryRepository } from '../db/repositories/deliveryRepository.js'
import { requirePermission, requireAnyPermission, requireSession, getActiveBranchId } from './authGuard.js'

export function registerDeliveryHandlers() {
  ipcMain.handle('delivery:get-zones', async (_event, branchId) => {
    requireSession()
    return deliveryRepository.getZones(getActiveBranchId(branchId))
  })

  ipcMain.handle('delivery:create-zone', async (_event, data) => {
    requirePermission('delivery:manage')
    return deliveryRepository.createZone({ ...data, branchId: getActiveBranchId(data.branchId) })
  })

  ipcMain.handle('delivery:update-zone', async (_event, { id, data }) => {
    requirePermission('delivery:manage')
    return deliveryRepository.updateZone(id, data)
  })

  ipcMain.handle('delivery:get-riders', async (_event, { branchId, status } = {}) => {
    requireSession()
    return deliveryRepository.getRiders(getActiveBranchId(branchId), status)
  })

  ipcMain.handle('delivery:get-rider-by-id', async (_event, id) => {
    requireSession()
    return deliveryRepository.getRiderById(id)
  })

  ipcMain.handle('delivery:create-rider', async (_event, data) => {
    requirePermission('delivery:manage')
    return deliveryRepository.createRider({ ...data, branchId: getActiveBranchId(data.branchId) })
  })

  ipcMain.handle('delivery:update-rider', async (_event, { id, data }) => {
    requirePermission('delivery:manage')
    return deliveryRepository.updateRider(id, data)
  })

  ipcMain.handle('delivery:update-rider-status', async (_event, { id, status }) => {
    requireAnyPermission(['delivery:manage', 'pos:create_order'])
    return deliveryRepository.updateRiderStatus(id, status)
  })

  ipcMain.handle('delivery:get-deliveries', async (_event, { branchId, filters } = {}) => {
    requireSession()
    return deliveryRepository.getDeliveries(getActiveBranchId(branchId), filters)
  })

  ipcMain.handle('delivery:get-delivery-by-id', async (_event, id) => {
    requireSession()
    return deliveryRepository.getDeliveryById(id)
  })

  ipcMain.handle('delivery:create-delivery', async (_event, data) => {
    requireAnyPermission(['delivery:manage', 'pos:create_order'])
    return deliveryRepository.createDelivery({ ...data, branchId: getActiveBranchId(data.branchId) })
  })

  ipcMain.handle('delivery:assign-rider', async (_event, { deliveryId, riderId }) => {
    requireAnyPermission(['delivery:manage', 'pos:create_order'])
    return deliveryRepository.assignRider(deliveryId, riderId)
  })

  ipcMain.handle('delivery:dispatch', async (_event, deliveryId) => {
    requireAnyPermission(['delivery:manage', 'pos:create_order'])
    return deliveryRepository.dispatchDelivery(deliveryId)
  })

  ipcMain.handle('delivery:complete', async (_event, { deliveryId, codCollectedCents }) => {
    requireAnyPermission(['delivery:manage', 'pos:create_order'])
    return deliveryRepository.completeDelivery(deliveryId, { codCollectedCents })
  })

  ipcMain.handle('delivery:fail', async (_event, { deliveryId, reason }) => {
    requireAnyPermission(['delivery:manage', 'pos:create_order'])
    return deliveryRepository.failDelivery(deliveryId, reason)
  })

  ipcMain.handle('delivery:get-rider-pending-cod', async (_event, riderId) => {
    requireSession()
    return deliveryRepository.getRiderPendingCod(riderId)
  })

  ipcMain.handle('delivery:settle-rider-cod', async (_event, { branchId, riderId, notes }) => {
    const session = requireAnyPermission(['delivery:manage', 'cash:manage', 'pos:create_order'])
    return deliveryRepository.settleRiderCod({
      branchId: getActiveBranchId(branchId),
      riderId,
      settledByUserId: session.id,
      notes,
    })
  })

  ipcMain.handle('delivery:get-settlement-history', async (_event, { branchId, params } = {}) => {
    requireSession()
    return deliveryRepository.getSettlementHistory(getActiveBranchId(branchId), params)
  })

  ipcMain.handle('delivery:get-summary', async (_event, branchId) => {
    requireSession()
    return deliveryRepository.getSummary(getActiveBranchId(branchId))
  })
}
