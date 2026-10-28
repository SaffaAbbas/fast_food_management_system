import { ipcMain, dialog } from 'electron'
import fs from 'node:fs'
import { IPC_CHANNELS } from './channels.js'
import { getDb, resolveDatabasePath, backupDatabase, restoreDatabase } from '../db/index.js'
import { settingsRepository } from '../db/repositories/settingsRepository.js'
import { productRepository } from '../db/repositories/productRepository.js'
import { tableRepository } from '../db/repositories/tableRepository.js'
import { orderRepository } from '../db/repositories/orderRepository.js'
import { requirePermission, requireSession, getActiveBranchId } from './authGuard.js'

function assertSqliteBackup(filePath) {
  if (!filePath) throw new Error('Backup file path is required.')
  if (!fs.existsSync(filePath)) throw new Error(`Backup file not found at: ${filePath}`)
  const fd = fs.openSync(filePath, 'r')
  try {
    const header = Buffer.alloc(16)
    fs.readSync(fd, header, 0, 16, 0)
    if (header.toString('utf8') !== 'SQLite format 3\0') {
      throw new Error('The selected file is not a valid SQLite database backup.')
    }
  } finally {
    fs.closeSync(fd)
  }
}

export function registerDatabaseIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.DB_STATUS, async () => {
    requireSession()
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
        dbPath: resolveDatabasePath(),
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

  ipcMain.handle('db:get-settings', async () => {
    requireSession()
    return settingsRepository.getAll()
  })

  ipcMain.handle('db:get-categories', async (_event, branchId) => {
    requireSession()
    return productRepository.getCategories(getActiveBranchId(branchId))
  })

  ipcMain.handle('db:get-products', async (_event, { branchId, categoryId, searchQuery } = {}) => {
    requireSession()
    return productRepository.getProducts(getActiveBranchId(branchId), categoryId, searchQuery)
  })

  ipcMain.handle('db:get-tables', async (_event, branchId) => {
    requireSession()
    return tableRepository.getFloorsWithTables(getActiveBranchId(branchId))
  })

  ipcMain.handle('db:create-order', async (_event, orderData) => {
    requirePermission('pos:create_order')
    return orderRepository.createOrder({
      ...orderData,
      branchId: getActiveBranchId(orderData.branchId),
    })
  })

  ipcMain.handle('db:get-recent-orders', async (_event, { branchId, limit } = {}) => {
    requireSession()
    return orderRepository.getRecentOrders(getActiveBranchId(branchId), limit || 20)
  })

  ipcMain.handle(IPC_CHANNELS.DB_BACKUP, async (_event, destinationPath) => {
    requirePermission('settings:manage')
    return backupDatabase(destinationPath)
  })

  ipcMain.handle('db:choose-backup-file', async () => {
    requirePermission('settings:manage')
    const result = await dialog.showOpenDialog({
      title: 'Select SQLite Backup',
      properties: ['openFile'],
      filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db', 'sqlite3'] }],
    })
    if (result.canceled || !result.filePaths?.[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.DB_RESTORE, async (_event, backupFilePath) => {
    requirePermission('settings:manage')
    assertSqliteBackup(backupFilePath)
    return restoreDatabase(backupFilePath)
  })
}
