import path from 'node:path'
import { initDatabase, getDb } from '../electron/db/index.js'
import { orderRepository } from '../electron/db/repositories/orderRepository.js'

async function debug() {
  const dbPath = path.resolve(process.cwd(), 'database_storage', 'restaurant_pos.sqlite')
  console.log('Connecting to:', dbPath)
  initDatabase({ dbPath })
  const db = getDb()

  const branch = db.prepare('SELECT id, name FROM branches LIMIT 1').get()
  const table = db.prepare('SELECT id, table_number, branch_id FROM dining_tables LIMIT 1').get()
  const user = db.prepare('SELECT id, username, branch_id FROM users LIMIT 1').get()
  const product = db.prepare('SELECT id, name, branch_id FROM products LIMIT 1').get()

  console.log('Orders SQL:', db.prepare("SELECT sql FROM sqlite_master WHERE name = 'orders'").get()?.sql)
  console.log('Users SQL:', db.prepare("SELECT sql FROM sqlite_master WHERE name = 'users'").get()?.sql)
  console.log('FK list for orders:', db.prepare("PRAGMA foreign_key_list('orders')").all())
  console.log('Running REINDEX...')
  db.prepare('REINDEX users').run()
  db.prepare('REINDEX').run()
  const currentBranchId = db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
  db.prepare('UPDATE users SET branch_id = ?').run(currentBranchId)
  console.log('Database integrity check after REINDEX:', db.prepare("PRAGMA integrity_check").all())
  console.log('Database foreign_key_check after fix:', db.prepare("PRAGMA foreign_key_check").all())

  console.log('\n--- Testing individual inserts ---')
  try {
    db.prepare(`
      INSERT INTO orders (id, branch_id, order_number, order_type, status, subtotal_cents, total_cents, created_at, updated_at)
      VALUES (?, ?, 'TEST-ORD-1', 'DINE_IN', 'CONFIRMED', 100, 100, datetime('now'), datetime('now'))
    `).run('test-1', branch.id)
    console.log('1. Order with only branch_id: SUCCESS')
    db.prepare('DELETE FROM orders WHERE id = ?').run('test-1')
  } catch (e) {
    console.error('1. Order with only branch_id FAILED:', e.message)
  }

  try {
    db.prepare(`
      INSERT INTO orders (id, branch_id, table_id, order_number, order_type, status, subtotal_cents, total_cents, created_at, updated_at)
      VALUES (?, ?, ?, 'TEST-ORD-2', 'DINE_IN', 'CONFIRMED', 100, 100, datetime('now'), datetime('now'))
    `).run('test-2', branch.id, table.id)
    console.log('2. Order with table_id: SUCCESS')
    db.prepare('DELETE FROM orders WHERE id = ?').run('test-2')
  } catch (e) {
    console.error('2. Order with table_id FAILED:', e.message)
  }

  try {
    db.prepare(`
      INSERT INTO orders (id, branch_id, cashier_id, order_number, order_type, status, subtotal_cents, total_cents, created_at, updated_at)
      VALUES (?, ?, ?, 'TEST-ORD-3', 'DINE_IN', 'CONFIRMED', 100, 100, datetime('now'), datetime('now'))
    `).run('test-3', branch.id, user?.id)
    console.log('3. Order with cashier_id: SUCCESS')
    db.prepare('DELETE FROM orders WHERE id = ?').run('test-3')
  } catch (e) {
    console.error('3. Order with cashier_id FAILED:', e.message)
  }

  console.log('\n--- Testing orderRepository.createOrder ---')
  try {
    const created = orderRepository.createOrder({
      branchId: branch.id,
      tableId: table.id,
      cashierId: user?.id,
      orderType: 'DINE_IN',
      items: [
        {
          productId: product.id,
          name: product.name,
          quantity: 1,
          unitPriceCents: 950,
          totalCents: 950
        }
      ],
      subtotalCents: 950,
      taxCents: 48,
      totalCents: 998
    })
    console.log('orderRepository.createOrder: SUCCESS! Created order id:', created.id)
  } catch (e) {
    console.error('orderRepository.createOrder FAILED:', e)
  }
}

debug().catch(console.error).finally(() => process.exit(0))
