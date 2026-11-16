import { ipcMain } from 'electron'
import { inventoryRepository } from '../db/repositories/inventoryRepository.js'
import { authRepository } from '../db/repositories/authRepository.js'
import { requirePermission, requireAnyPermission, requireSession, getActiveBranchId } from './authGuard.js'
import { broadcast } from './localEvents.js'

function emitLowStock(branchId) {
  try {
    const alerts = inventoryRepository.getLowStockAlerts(branchId)
    if (alerts.length) {
      broadcast('inventory:low-stock', {
        count: alerts.length,
        items: alerts.slice(0, 20).map((i) => ({
          id: i.id,
          name: i.name,
          available: i.available_stock,
          reorderLevel: i.reorder_level,
          unit: i.unit_abbr,
          isOutOfStock: i.isOutOfStock,
        })),
      })
    }
  } catch (e) {}
}

function assertPermission(permCode) {
  return requirePermission(permCode)
}

export function registerInventoryIpcHandlers() {
  // ==========================================
  // INVENTORY ITEMS & STOCK
  // ==========================================
  ipcMain.handle('inventory:get-units', async () => {
    requireSession()
    return inventoryRepository.getUnits()
  })

  ipcMain.handle('inventory:create-unit', async (_event, data) => {
    assertPermission('inventory:manage')
    return inventoryRepository.createUnit(data)
  })

  ipcMain.handle('inventory:get-items', async (_event, params = {}) => {
    requireSession()
    return inventoryRepository.getItems({
      ...params,
      branchId: getActiveBranchId(params.branchId),
    })
  })

  ipcMain.handle('inventory:get-item', async (_event, id) => {
    return inventoryRepository.getItemById(id)
  })

  ipcMain.handle('inventory:create-item', async (_event, data) => {
    assertPermission('inventory:manage')
    return inventoryRepository.createItem({
      ...data,
      branchId: getActiveBranchId(data.branchId),
    })
  })

  ipcMain.handle('inventory:update-item', async (_event, { id, data }) => {
    assertPermission('inventory:manage')
    return inventoryRepository.updateItem(id, data)
  })

  ipcMain.handle('inventory:adjust-stock', async (_event, data) => {
    requireAnyPermission(['inventory:manage', 'inventory:adjust'])
    const session = authRepository.getCurrentSession()
    const result = inventoryRepository.adjustStock({
      ...data,
      branchId: getActiveBranchId(data.branchId),
      userId: session?.id || null,
    })
    emitLowStock(getActiveBranchId(data.branchId))
    return result
  })

  ipcMain.handle('inventory:transfer-stock', async (_event, data) => {
    requireAnyPermission(['inventory:manage', 'inventory:adjust'])
    const session = authRepository.getCurrentSession()
    const result = inventoryRepository.transferStock({
      ...data,
      userId: session?.id || null,
    })
    emitLowStock(getActiveBranchId(data.branchId))
    return result
  })

  ipcMain.handle('inventory:get-alerts', async (_event, params = {}) => {
    requireSession()
    return inventoryRepository.getLowStockAlerts(getActiveBranchId(params.branchId))
  })

  ipcMain.handle('inventory:get-branches', async () => {
    requireSession()
    return inventoryRepository.getBranches()
  })

  ipcMain.handle('inventory:get-movements', async (_event, params = {}) => {
    assertPermission('inventory:manage')
    return inventoryRepository.getStockMovements({
      ...params,
      branchId: getActiveBranchId(params.branchId),
    })
  })

  // ==========================================
  // RECIPES & FOOD COST
  // ==========================================
  ipcMain.handle('recipe:get-recipes', async (_event, params = {}) => {
    return inventoryRepository.getRecipes({
      ...params,
      branchId: getActiveBranchId(params.branchId),
    })
  })

  ipcMain.handle('recipe:get-recipe', async (_event, { productId, variationId }) => {
    return inventoryRepository.getRecipeForProduct(productId, variationId)
  })

  ipcMain.handle('recipe:save-recipe', async (_event, recipeData) => {
    assertPermission('inventory:manage')
    return inventoryRepository.saveRecipe(recipeData)
  })

  ipcMain.handle('recipe:set-active', async (_event, { id, isActive }) => {
    assertPermission('inventory:manage')
    return inventoryRepository.setRecipeActive(id, isActive)
  })

  ipcMain.handle('recipe:get-versions', async (_event, recipeId) => {
    requireSession()
    return inventoryRepository.getRecipeVersions(recipeId)
  })

  // ==========================================
  // SUPPLIERS & PURCHASES
  // ==========================================
  ipcMain.handle('supplier:get-suppliers', async (_event, branchId) => {
    return inventoryRepository.getSuppliers(getActiveBranchId(branchId))
  })

  ipcMain.handle('supplier:create', async (_event, data) => {
    assertPermission('inventory:manage')
    return inventoryRepository.createSupplier({
      ...data,
      branchId: getActiveBranchId(data.branchId),
    })
  })

  ipcMain.handle('supplier:update', async (_event, { id, data }) => {
    assertPermission('inventory:manage')
    return inventoryRepository.updateSupplier(id, data)
  })

  ipcMain.handle('purchase:get-orders', async (_event, params = {}) => {
    assertPermission('inventory:manage')
    return inventoryRepository.getPurchaseOrders({
      ...params,
      branchId: getActiveBranchId(params.branchId),
    })
  })

  ipcMain.handle('purchase:create-order', async (_event, orderData) => {
    assertPermission('inventory:manage')
    return inventoryRepository.createPurchaseOrder({
      ...orderData,
      branchId: getActiveBranchId(orderData.branchId),
    })
  })

  ipcMain.handle('purchase:receive-order', async (_event, data) => {
    assertPermission('inventory:manage')
    const session = authRepository.getCurrentSession()
    return inventoryRepository.receivePurchaseOrder({
      ...data,
      userId: session?.id || null,
    })
  })

  ipcMain.handle('purchase:return-items', async (_event, data) => {
    assertPermission('inventory:manage')
    const session = authRepository.getCurrentSession()
    return inventoryRepository.returnPurchaseItems({
      ...data,
      userId: session?.id || null,
    })
  })

  ipcMain.handle('purchase:vendor-statement', async (_event, params = {}) => {
    assertPermission('inventory:manage')
    return inventoryRepository.getVendorStatement({
      ...params,
      branchId: getActiveBranchId(params.branchId),
    })
  })

  ipcMain.handle('purchase:record-payment', async (_event, paymentData) => {
    assertPermission('inventory:manage')
    return inventoryRepository.recordVendorPayment({
      ...paymentData,
      branchId: getActiveBranchId(paymentData.branchId),
    })
  })

  // ==========================================
  // EXPENSES
  // ==========================================
  ipcMain.handle('expense:get-categories', async () => {
    return inventoryRepository.getExpenseCategories()
  })

  ipcMain.handle('expense:get-expenses', async (_event, params = {}) => {
    requireAnyPermission(['reports:view', 'expenses:manage'])
    return inventoryRepository.getExpenses({
      ...params,
      branchId: getActiveBranchId(params.branchId),
    })
  })

  ipcMain.handle('expense:create', async (_event, data) => {
    requireAnyPermission(['reports:view', 'expenses:manage'])
    const session = authRepository.getCurrentSession()
    return inventoryRepository.createExpense({
      ...data,
      branchId: getActiveBranchId(data.branchId),
      userId: session?.id || null,
    })
  })

  ipcMain.handle('expense:approve', async (_event, id) => {
    requireAnyPermission(['expenses:manage', 'staff:manage'])
    const session = authRepository.getCurrentSession()
    return inventoryRepository.approveExpense(id, session?.id)
  })

  ipcMain.handle('expense:cancel', async (_event, { id, reason }) => {
    requireAnyPermission(['expenses:manage', 'staff:manage'])
    const session = authRepository.getCurrentSession()
    return inventoryRepository.cancelExpense(id, reason, session?.id)
  })

  ipcMain.handle('expense:get-summary', async (_event, params = {}) => {
    requireAnyPermission(['reports:view', 'expenses:manage'])
    return inventoryRepository.getExpenseSummary({
      ...params,
      branchId: getActiveBranchId(params.branchId),
    })
  })
}
