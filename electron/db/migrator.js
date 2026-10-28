import { migration001 } from './migrations/001_initial_schema.js'
import { migration002 } from './migrations/002_combos_schema.js'
import { migration003 } from './migrations/003_catalog_enhancements_schema.js'
import { migration004 } from './migrations/004_kitchen_stations_schema.js'
import { migration005 } from './migrations/005_inventory_recipe_purchases_schema.js'
import { migration006 } from './migrations/006_shifts_staff_attendance_schema.js'
import { migration007 } from './migrations/007_crm_loyalty_reservations_schema.js'
import { migration008 } from './migrations/008_delivery_dispatch_riders_schema.js'
import { migration009 } from './migrations/009_refunds_financial_integrity.js'
import { migration010 } from './migrations/010_sync_outbox_and_permissions.js'
import { migration011 } from './migrations/011_media_and_report_columns.js'
import { migration012 } from './migrations/012_roles_image_url.js'

const MIGRATIONS = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
  migration012,
]

/**
 * Execute all pending versioned migrations in transaction
 * @param {import('better-sqlite3').Database} db 
 * @returns {{ appliedCount: number, currentVersion: number }}
 */
export function runMigrations(db) {
  // Ensure schema_migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)

  const appliedRows = db.prepare('SELECT version FROM schema_migrations ORDER BY version ASC').all()
  const appliedSet = new Set(appliedRows.map((r) => r.version))

  let appliedCount = 0
  let currentVersion = appliedRows.length > 0 ? appliedRows[appliedRows.length - 1].version : 0

  for (const migration of MIGRATIONS) {
    if (!appliedSet.has(migration.version)) {
      console.log(`[Database Migration] Applying v${migration.version}: ${migration.name}...`)

      const runMigrationTx = db.transaction(() => {
        migration.up(db)
        db.prepare(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
        ).run(migration.version, migration.name, new Date().toISOString())
      })

      runMigrationTx()
      appliedCount++
      currentVersion = migration.version
      console.log(`[Database Migration] Successfully applied v${migration.version}: ${migration.name}`)
    }
  }

  return {
    appliedCount,
    currentVersion,
  }
}
