import { ipcMain } from 'electron'
import { inventoryRepository } from '../db/repositories/inventoryRepository.js'
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

export function registerInventoryIpcHandlers() {
  // ==========================================
  // INVENTORY ITEMS & STOCK
  // ==========================================
  ipcMain.handle('inventory:get-units', async () => {
    return inventoryRepository.getUnits()
  })

  ipcMain.handle('inventory:create-unit', async (_event, data) => {
    assertPermission('inventory:manage')
    return inventoryRepository.createUnit(data)
  })

  ipcMain.handle('inventory:get-items', async (_event, params = {}) => {
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
    assertPermission('inventory:manage')
    const session = authRepository.getCurrentSession()
    return inventoryRepository.adjustStock({
      ...data,
      branchId: getActiveBranchId(data.branchId),
      userId: session?.id || null,
    })
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
    assertPermission('reports:view')
    return inventoryRepository.getExpenses({
      ...params,
      branchId: getActiveBranchId(params.branchId),
    })
  })

  ipcMain.handle('expense:create', async (_event, data) => {
    assertPermission('reports:view')
    const session = authRepository.getCurrentSession()
    return inventoryRepository.createExpense({
      ...data,
      branchId: getActiveBranchId(data.branchId),
      userId: session?.id || null,
    })
  })

  ipcMain.handle('expense:get-summary', async (_event, params = {}) => {
    assertPermission('reports:view')
    return inventoryRepository.getExpenseSummary({
      ...params,
      branchId: getActiveBranchId(params.branchId),
    })
  })
}
