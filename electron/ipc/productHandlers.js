import { ipcMain } from 'electron'
import { productRepository } from '../db/repositories/productRepository.js'
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

export function registerProductIpcHandlers() {
  // Categories
  ipcMain.handle('product:get-categories', async (_event, branchId) => {
    return productRepository.getCategories(getActiveBranchId(branchId))
  })

  ipcMain.handle('product:create-category', async (_event, data) => {
    assertPermission('menu:manage')
    return productRepository.createCategory({
      ...data,
      branchId: getActiveBranchId(data.branchId),
    })
  })

  ipcMain.handle('product:update-category', async (_event, { id, ...data }) => {
    assertPermission('menu:manage')
    return productRepository.updateCategory(id, data)
  })

  ipcMain.handle('product:delete-category', async (_event, id) => {
    assertPermission('menu:manage')
    return productRepository.deleteCategory(id)
  })

  // Products
  ipcMain.handle('product:get-products', async (_event, { branchId, categoryId, searchQuery, includeInactive } = {}) => {
    return productRepository.getProducts(getActiveBranchId(branchId), categoryId, searchQuery, includeInactive)
  })

  ipcMain.handle('product:get-product-details', async (_event, productId) => {
    return productRepository.getProductDetails(productId)
  })

  ipcMain.handle('product:create-product', async (_event, productData) => {
    assertPermission('menu:manage')
    return productRepository.createProduct({
      ...productData,
      branchId: getActiveBranchId(productData.branchId),
    })
  })

  ipcMain.handle('product:update-product', async (_event, { id, ...productData }) => {
    assertPermission('menu:manage')
    return productRepository.updateProduct(id, {
      ...productData,
      branchId: getActiveBranchId(productData.branchId),
    })
  })

  ipcMain.handle('product:toggle-availability', async (_event, { id, isAvailable }) => {
    assertPermission('menu:manage')
    return productRepository.toggleProductAvailability(id, isAvailable)
  })

  ipcMain.handle('product:archive-product', async (_event, id) => {
    assertPermission('menu:manage')
    return productRepository.archiveProduct(id)
  })

  // Combos & Deals
  ipcMain.handle('product:get-combos', async (_event, branchId) => {
    return productRepository.getCombos(getActiveBranchId(branchId))
  })

  ipcMain.handle('product:create-combo', async (_event, comboData) => {
    assertPermission('menu:manage')
    return productRepository.createCombo({
      ...comboData,
      branchId: getActiveBranchId(comboData.branchId),
    })
  })

  ipcMain.handle('product:update-combo', async (_event, { id, ...comboData }) => {
    assertPermission('menu:manage')
    return productRepository.updateCombo(id, comboData)
  })

  ipcMain.handle('product:toggle-combo-availability', async (_event, { id, isAvailable }) => {
    assertPermission('menu:manage')
    return productRepository.toggleComboAvailability(id, isAvailable)
  })

  ipcMain.handle('product:archive-combo', async (_event, id) => {
    assertPermission('menu:manage')
    return productRepository.archiveCombo(id)
  })
}
