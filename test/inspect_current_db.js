import path from 'node:path'
import { initDatabase, getDb, closeDatabase } from '../electron/db/index.js'

function inspect() {
  const dbPath = path.resolve(process.cwd(), 'database_storage', 'restaurant_pos.sqlite')
  console.log('--- Inspecting Database at:', dbPath)
  initDatabase({ dbPath, seed: false })
  const db = getDb()

  const tables = [
    'branches',
    'users',
    'roles',
    'floors',
    'dining_tables',
    'kitchen_stations',
    'categories',
    'products',
    'product_variations',
    'modifier_groups',
    'modifiers',
    'combos',
    'combo_items',
    'inventory_units',
    'inventory_items',
    'recipes',
    'recipe_ingredients',
    'suppliers',
    'purchase_orders',
    'purchase_order_items',
    'vendor_payments',
    'expense_categories',
    'expenses',
    'customers',
    'loyalty_transactions',
    'coupons',
    'reservations',
    'staff_shifts',
    'employees',
    'staff_attendance',
    'cash_sessions',
    'cash_movements',
    'cash_drawer_denominations',
    'delivery_zones',
    'riders',
    'orders',
    'order_items',
    'payments',
    'deliveries',
    'system_settings',
  ]

  console.log('\n--- Live SQLite Database Row Verification ---')
  for (const t of tables) {
    try {
      const row = db.prepare(`SELECT count(*) as count FROM ${t}`).get()
      console.log(`${t.padEnd(28)} : ${row.count} rows`)
    } catch (e) {
      console.log(`${t.padEnd(28)} : [ERROR: ${e.message}]`)
    }
  }

  closeDatabase()
  process.exit(0)
}

inspect()
