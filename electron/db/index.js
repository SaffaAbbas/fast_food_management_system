import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { runMigrations } from './migrator.js'
import { seedDatabase } from './seeds.js'

let dbInstance = null
let dbPath = null

/**
 * Resolve the target SQLite database path.
 * In Electron, it resolves to app.getPath('userData').
 * In Node/CLI/Test mode, it resolves to a persistent local path or env var.
 * @param {string} [customPath]
 * @returns {string}
 */
export function resolveDatabasePath(customPath) {
  if (customPath) return customPath
  if (process.env.DB_PATH) return process.env.DB_PATH

  try {
    // Attempt to resolve Electron app userData path if in Electron environment
    const electron = require('electron')
    const app = electron.app || electron.remote?.app
    if (app) {
      return path.join(app.getPath('userData'), 'restaurant_pos.sqlite')
    }
  } catch (e) {
    // Not running inside Electron runtime
  }

  // Fallback for standalone/test environment
  const fallbackDir = path.resolve(process.cwd(), 'database_storage')
  if (!fs.existsSync(fallbackDir)) {
    fs.mkdirSync(fallbackDir, { recursive: true })
  }
  return path.join(fallbackDir, 'restaurant_pos.sqlite')
}

/**
 * Initialize and open the SQLite database with robust PRAGMAs and migrations.
 * @param {object} [options]
 * @param {string} [options.dbPath]
 * @param {boolean} [options.seed]
 * @returns {Database.Database}
 */
export function initDatabase(options = {}) {
  if (dbInstance && dbInstance.open) {
    return dbInstance
  }

  dbPath = resolveDatabasePath(options.dbPath)
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  console.log(`[Database] Connecting to SQLite persistent store at: ${dbPath}`)

  dbInstance = new Database(dbPath, {
    verbose: process.env.DB_DEBUG ? console.log : null,
    fileMustExist: false,
    timeout: 5000,
  })

  // Enforce critical SQLite pragmas for relational integrity and fast WAL operations
  dbInstance.pragma('foreign_keys = ON')
  dbInstance.pragma('journal_mode = WAL')
  dbInstance.pragma('synchronous = NORMAL')
  dbInstance.pragma('busy_timeout = 5000')

  // Run migrations
  const migrationResult = runMigrations(dbInstance)
  console.log(`[Database] Migrations applied: ${migrationResult.appliedCount}, Current Version: ${migrationResult.currentVersion}`)

  // Seed default data if requested or if fresh database
  if (options.seed !== false && migrationResult.appliedCount > 0) {
    seedDatabase(dbInstance)
  }

  // Self-healing database integrity check & index repair
  try {
    const check = dbInstance.prepare('PRAGMA quick_check').get()
    if (check?.quick_check !== 'ok') {
      console.warn('[Database] PRAGMA quick_check detected issues, executing REINDEX...')
      dbInstance.prepare('REINDEX').run()
    }
    const activeBranch = dbInstance.prepare('SELECT id FROM branches LIMIT 1').get()
    if (activeBranch) {
      dbInstance.prepare(`
        UPDATE users 
        SET branch_id = ? 
        WHERE branch_id IS NOT NULL AND branch_id NOT IN (SELECT id FROM branches)
      `).run(activeBranch.id)
    }
  } catch (err) {
    console.warn('[Database] Self-healing maintenance check:', err)
  }

  return dbInstance
}

/**
 * Get active database instance
 * @returns {Database.Database}
 */
export function getDb() {
  if (!dbInstance || !dbInstance.open) {
    return initDatabase()
  }
  return dbInstance
}

/**
 * Close database connection safely
 */
export function closeDatabase() {
  if (dbInstance && dbInstance.open) {
    dbInstance.close()
    dbInstance = null
    console.log('[Database] Closed connection successfully.')
  }
}

/**
 * Create a live, crash-consistent hot backup of the SQLite database using SQLite's backup API.
 * @param {string} [destinationPath]
 * @returns {Promise<{ success: boolean, destination: string, bytes: number }>}
 */
export async function backupDatabase(destinationPath) {
  const db = getDb()
  const defaultDir = path.dirname(dbPath)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = destinationPath || path.join(defaultDir, `restaurant_backup_${timestamp}.sqlite`)

  await db.backup(target)
  const stats = fs.statSync(target)

  return {
    success: true,
    destination: target,
    bytes: stats.size,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Safely restore the database from a backup file.
 * Creates an emergency pre-restore recovery snapshot first.
 * @param {string} backupFilePath
 * @returns {Promise<{ success: boolean, message: string, preRestoreBackup: string }>}
 */
export async function restoreDatabase(backupFilePath, targetDbPath = null) {
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup file not found at: ${backupFilePath}`)
  }

  // 1. Create safety recovery backup first
  const currentDbPath = resolveDatabasePath(targetDbPath || dbPath)
  const preRestoreDir = path.dirname(currentDbPath)
  const preRestoreBackup = path.join(preRestoreDir, `pre_restore_safety_${Date.now()}.sqlite`)

  if (fs.existsSync(currentDbPath)) {
    await backupDatabase(preRestoreBackup)
  }

  // 2. Close active connection
  closeDatabase()

  // 3. Copy backup file over current database
  fs.copyFileSync(backupFilePath, currentDbPath)

  // Remove stale WAL/SHM companion files if present
  const walPath = `${currentDbPath}-wal`
  const shmPath = `${currentDbPath}-shm`
  if (fs.existsSync(walPath)) {
    try { fs.unlinkSync(walPath) } catch (e) { /* ignore locked companion */ }
  }
  if (fs.existsSync(shmPath)) {
    try { fs.unlinkSync(shmPath) } catch (e) { /* ignore locked companion */ }
  }

  // 4. Reopen and verify database
  const db = initDatabase({ dbPath: currentDbPath, seed: false })
  const check = db.prepare('PRAGMA integrity_check').get()

  if (check.integrity_check !== 'ok') {
    // Revert to safety snapshot
    closeDatabase()
    fs.copyFileSync(preRestoreBackup, currentDbPath)
    initDatabase({ seed: false })
    throw new Error(`Restore failed integrity check: ${check.integrity_check}. Reverted to safety backup.`)
  }

  return {
    success: true,
    message: 'Database restored and verified successfully.',
    preRestoreBackup,
  }
}
