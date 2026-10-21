import path from 'node:path'
import fs from 'node:fs'
import { initDatabase, closeDatabase, getDb, backupDatabase, restoreDatabase } from '../electron/db/index.js'
import { productRepository } from '../electron/db/repositories/productRepository.js'
import { tableRepository } from '../electron/db/repositories/tableRepository.js'
import { orderRepository } from '../electron/db/repositories/orderRepository.js'
import { settingsRepository } from '../electron/db/repositories/settingsRepository.js'

async function runTests() {
  console.log('====================================================')
  console.log('🧪 Starting SQLite Database & Repositories Test Suite')
  console.log('====================================================')

  const testDir = path.resolve(process.cwd(), 'database_test_scratch')
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true })
  const testDbPath = path.join(testDir, 'test_restaurant.sqlite')

  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath)
  if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`)
  if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`)

  // 1. Initialization & Pragmas
  console.log('\n--- Test 1: Initialize Database & Verify Pragmas ---')
  const db = initDatabase({ dbPath: testDbPath, seed: true })
  
  const fkCheck = db.prepare('PRAGMA foreign_keys').get()
  const journalCheck = db.prepare('PRAGMA journal_mode').get()
  console.log(`✓ Foreign Keys enabled: ${fkCheck.foreign_keys === 1}`)
  console.log(`✓ Journal Mode: ${journalCheck.journal_mode}`)
  if (fkCheck.foreign_keys !== 1) throw new Error('Foreign keys are NOT enabled!')
  if (journalCheck.journal_mode.toLowerCase() !== 'wal') throw new Error('WAL mode is NOT enabled!')

  // 2. Migration Check
  console.log('\n--- Test 2: Verify Schema Migrations Table ---')
  const migrationRow = db.prepare('SELECT version, name, applied_at FROM schema_migrations').get()
  console.log(`✓ Migration v${migrationRow.version} '${migrationRow.name}' applied at ${migrationRow.applied_at}`)

  // 3. Table Counts
  console.log('\n--- Test 3: Core Tables Verification ---')
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC").all()
  console.log(`✓ Total Tables Created: ${tables.length}`)
  const requiredTables = [
    'branches', 'users', 'roles', 'permissions', 'role_permissions',
    'floors', 'dining_tables', 'categories', 'products', 'product_variations',
    'modifier_groups', 'modifiers', 'customers', 'orders', 'order_items',
    'order_status_history', 'payments', 'cash_sessions', 'cash_movements',
    'inventory_units', 'inventory_items', 'recipes', 'recipe_ingredients',
    'stock_movements', 'suppliers', 'purchase_orders', 'expenses',
    'reservations', 'system_settings', 'audit_logs', 'sync_outbox'
  ]
  for (const t of requiredTables) {
    if (!tables.some((r) => r.name === t)) {
      throw new Error(`Missing expected table: ${t}`)
    }
  }
  console.log(`✓ All ${requiredTables.length} core tables successfully verified!`)

  // 4. Seed Data Verification
  console.log('\n--- Test 4: Seed Data Verification ---')
  const branch = db.prepare('SELECT * FROM branches LIMIT 1').get()
  console.log(`✓ Default Branch: ${branch.name} (${branch.code}), Currency: ${branch.currency_symbol}`)

  const roles = db.prepare('SELECT code, name FROM roles').all()
  console.log(`✓ Roles Seeded (${roles.length}): ${roles.map((r) => r.code).join(', ')}`)

  const products = productRepository.getProducts(branch.id)
  console.log(`✓ Products Seeded (${products.length}): sample '${products[0].name}' at $${(products[0].base_price_cents / 100).toFixed(2)}`)

  const floors = tableRepository.getFloorsWithTables(branch.id)
  const totalTables = floors.reduce((acc, f) => acc + f.tables.length, 0)
  console.log(`✓ Floors (${floors.length}) with Total Dining Tables: ${totalTables}`)

  const settings = settingsRepository.getAll()
  console.log(`✓ Business Settings: '${settings.business_name}', Tax: ${settings.tax_rate_percentage}%`)

  // 5. Foreign Key Enforcement Test
  console.log('\n--- Test 5: Foreign Key Enforcement Constraint ---')
  let fkErrorCaught = false
  try {
    db.prepare(`
      INSERT INTO orders (id, branch_id, order_number, order_type, status, subtotal_cents, total_cents, created_at, updated_at)
      VALUES ('invalid-uuid', 'non-existent-branch', 'ORD-ERR', 'DINE_IN', 'CONFIRMED', 1000, 1000, 'now', 'now')
    `).run()
  } catch (err) {
    fkErrorCaught = true
    console.log(`✓ Foreign key correctly rejected invalid branch_id: ${err.message}`)
  }
  if (!fkErrorCaught) throw new Error('Foreign key enforcement failed to reject invalid branch_id!')

  // 6. Transactional Order Creation
  console.log('\n--- Test 6: Transactional Order Creation with Items & Table Update ---')
  const table = floors[0].tables[0]
  const newOrder = orderRepository.createOrder({
    branchId: branch.id,
    tableId: table.id,
    orderType: 'DINE_IN',
    subtotalCents: 1800,
    taxCents: 90,
    totalCents: 1890,
    notes: 'Table 1 order - extra crispy',
    items: [
      { productId: products[0].id, name: products[0].name, quantity: 2, unitPriceCents: products[0].base_price_cents, totalCents: products[0].base_price_cents * 2 },
    ],
  })
  console.log(`✓ Order Created: ${newOrder.orderNumber} (ID: ${newOrder.id}), Total: $${(newOrder.totalCents / 100).toFixed(2)}`)

  // Verify Table status updated to OCCUPIED
  const updatedTable = db.prepare('SELECT status, current_order_id FROM dining_tables WHERE id = ?').get(table.id)
  console.log(`✓ Table ${table.table_number} status updated to: ${updatedTable.status} (linked order: ${updatedTable.current_order_id})`)
  if (updatedTable.status !== 'OCCUPIED') throw new Error('Table status was not updated to OCCUPIED!')

  // Verify Sync Outbox queued
  const outboxEntry = db.prepare('SELECT entity_type, operation, status FROM sync_outbox WHERE entity_id = ?').get(newOrder.id)
  console.log(`✓ Future Sync Outbox Record: [${outboxEntry.entity_type}] ${outboxEntry.operation} (${outboxEntry.status})`)
  if (!outboxEntry) throw new Error('Order was not recorded in sync_outbox!')

  // 7. Hot Backup & Restore Test
  console.log('\n--- Test 7: Hot Backup & Safe Restore Test ---')
  const backupFile = path.join(testDir, 'backup_test.sqlite')
  if (fs.existsSync(backupFile)) fs.unlinkSync(backupFile)

  const backupRes = await backupDatabase(backupFile)
  console.log(`✓ Hot Backup Completed: ${backupRes.destination} (${backupRes.bytes} bytes)`)

  const restoreRes = await restoreDatabase(backupFile)
  console.log(`✓ Restore Completed & Integrity Checked: ${restoreRes.message}`)

  // Clean up
  closeDatabase()
  try {
    fs.rmSync(testDir, { recursive: true, force: true })
    console.log('✓ Cleaned up temporary test artifacts.')
  } catch (e) {}

  console.log('\n====================================================')
  console.log('🎉 ALL PHASE 2 SQLITE TESTS PASSED SUCCESSFULLY!')
  console.log('====================================================')
}

runTests().then(() => {
  process.exit(0)
}).catch((err) => {
  console.error('\n❌ Test failed with error:', err)
  process.exit(1)
})

