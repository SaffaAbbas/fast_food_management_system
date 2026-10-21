import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels.js'
import { getDb, resolveDatabasePath, backupDatabase, restoreDatabase } from '../db/index.js'
import { settingsRepository } from '../db/repositories/settingsRepository.js'
import { productRepository } from '../db/repositories/productRepository.js'
import { tableRepository } from '../db/repositories/tableRepository.js'
import { orderRepository } from '../db/repositories/orderRepository.js'

export function registerDatabaseIpcHandlers() {
  // Database status and diagnostics
  ipcMain.handle(IPC_CHANNELS.DB_STATUS, async () => {
    try {
      const db = getDb()
      const versionRow = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get()
      const tablesCount = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count
      const fk = db.prepare('PRAGMA foreign_keys').get()
      const journal = db.prepare('PRAGMA journal_mode').get()
      const integrity = db.prepare('PRAGMA integrity_check').get()

      const branch = db.prepare('SELECT id, name, code, currency_symbol FROM branches LIMIT 1').get()
      const productCount = db.prepare('SELECT count(*) as count FROM products WHERE is_active = 1').get().count
      const tableCount = db.prepare('SELECT count(*) as count FROM dining_tables WHERE is_active = 1').get().count
      const orderCount = db.prepare('SELECT count(*) as count FROM orders').get().count

      return {
        initialized: true,
        driver: 'better-sqlite3',
        schemaVersion: versionRow?.version || 1,
        tablesCount,
        databasePath: resolveDatabasePath(),
        foreignKeys: fk.foreign_keys === 1,
        journalMode: journal.journal_mode,
        integrity: integrity.integrity_check,
        branch,
        stats: {
          products: productCount,
          tables: tableCount,
          orders: orderCount,
        },
      }
    } catch (err) {
      console.error('[IPC db:status] Error:', err)
      return {
        initialized: false,
        error: err.message,
      }
    }
  })

  // Settings
  ipcMain.handle('db:get-settings', async () => {
    return settingsRepository.getAll()
  })

  // Products & Menu
  ipcMain.handle('db:get-categories', async (_event, branchId) => {
    const db = getDb()
    const activeBranchId = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    return productRepository.getCategories(activeBranchId)
  })

  ipcMain.handle('db:get-products', async (_event, { branchId, categoryId, searchQuery }) => {
    const db = getDb()
    const activeBranchId = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    return productRepository.getProducts(activeBranchId, categoryId, searchQuery)
  })

  // Floors & Tables
  ipcMain.handle('db:get-tables', async (_event, branchId) => {
    const db = getDb()
    const activeBranchId = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    return tableRepository.getFloorsWithTables(activeBranchId)
  })

  // Orders
  ipcMain.handle('db:create-order', async (_event, orderData) => {
    const db = getDb()
    const activeBranchId = orderData.branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    return orderRepository.createOrder({
      ...orderData,
      branchId: activeBranchId,
    })
  })

  ipcMain.handle('db:get-recent-orders', async (_event, { branchId, limit } = {}) => {
    const db = getDb()
    const activeBranchId = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    return orderRepository.getRecentOrders(activeBranchId, limit || 20)
  })

  // Backup & Restore
  ipcMain.handle(IPC_CHANNELS.DB_BACKUP, async (_event, destinationPath) => {
    return backupDatabase(destinationPath)
  })

  ipcMain.handle(IPC_CHANNELS.DB_RESTORE, async (_event, backupFilePath) => {
    return restoreDatabase(backupFilePath)
  })
}
