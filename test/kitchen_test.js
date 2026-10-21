/**
 * Phase 6: Kitchen Display System (KDS) & Operations Integration Test Suite
 * Validates:
 * - Migration 004 schema application and default kitchen stations
 * - Multi-station routing (Grill, Pizza, Bar, Expo)
 * - Real-time kitchen order queue and ticket details
 * - Item-level cooking transitions (PENDING -> PREPARING -> READY)
 * - Automatic order promotion to READY when all items are ready
 * - Whole ticket status update and bumping
 * - Kitchen performance metrics
 * - Audit logs for kitchen status updates
 */

import { initDatabase, closeDatabase } from '../electron/db/index.js'
import { authRepository } from '../electron/db/repositories/authRepository.js'
import { kitchenRepository } from '../electron/db/repositories/kitchenRepository.js'
import { orderRepository } from '../electron/db/repositories/orderRepository.js'
import { tableRepository } from '../electron/db/repositories/tableRepository.js'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'

const TEST_DIR = path.resolve(process.cwd(), 'test_kitchen_scratch')
const TEST_DB_PATH = path.join(TEST_DIR, 'test_kitchen.sqlite')

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
  }
}

async function runTestSuite() {
  console.log('\n====================================================')
  console.log('🧪 Starting Phase 6: Kitchen Display System (KDS) Test Suite')
  console.log('====================================================\n')

  cleanup()
  fs.mkdirSync(TEST_DIR, { recursive: true })

  // 1. Initialize DB with Migration 004
  console.log('--- Test 1: Initialize Database & Run Migration 004 ---')
  const db = initDatabase({ dbPath: TEST_DB_PATH, seed: true })

  const versionRow = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get()
  assert.strictEqual(versionRow.version >= 4, true, 'Schema version must be at least 4')
  console.log(`✓ Database initialized at Schema Version: ${versionRow.version}`)

  // 2. Kitchen Stations Verification
  console.log('\n--- Test 2: Kitchen Stations Roster & Management ---')
  const stations = kitchenRepository.getStations()
  assert.strictEqual(stations.length >= 4, true, 'Must have at least 4 default stations')
  console.log(`✓ Retrieved ${stations.length} Default Kitchen Stations:`)
  stations.forEach((s) => console.log(`   - [${s.code}] ${s.name} (Color: ${s.color_code})`))

  // Create a custom station
  const newStation = kitchenRepository.createStation({
    name: 'Salad & Cold Station',
    code: 'SALAD',
    colorCode: '#84cc16',
    displayOrder: 5,
  })
  assert.strictEqual(newStation.name, 'Salad & Cold Station')
  console.log(`✓ Created Custom Kitchen Station: ${newStation.name}`)

  // 3. User Authentication for Audit Trail
  console.log('\n--- Test 3: Authenticate Kitchen Staff ---')
  const chefUser = db.prepare("SELECT * FROM users WHERE username = 'chef1'").get()
  assert.ok(chefUser, 'Chef user must exist')
  const session = authRepository.loginWithPin('2222', chefUser.id)
  console.log(`✓ Authenticated as: ${session.displayName} (Role: ${session.roleCode})`)

  // 4. Create Multi-Item Order with Station Routing
  console.log('\n--- Test 4: Create POS Order with Station Routing ---')
  const branch = db.prepare('SELECT id FROM branches LIMIT 1').get()
  const table = db.prepare("SELECT id, table_number FROM dining_tables WHERE status = 'AVAILABLE' LIMIT 1").get()
  assert.ok(table, 'Available table must exist')

  const grillStation = stations.find((s) => s.code === 'GRILL')
  const pizzaStation = stations.find((s) => s.code === 'PIZZA')
  const barStation = stations.find((s) => s.code === 'DRINKS')

  const burgerProduct = db.prepare("SELECT id, name FROM products WHERE name LIKE '%Burger%' LIMIT 1").get()
  const pizzaProduct = db.prepare("SELECT id, name FROM products WHERE name LIKE '%Pizza%' LIMIT 1").get()
  const drinkProduct = db.prepare("SELECT id, name FROM products WHERE name LIKE '%Lemonade%' OR name LIKE '%Latte%' LIMIT 1").get()

  // Link products to stations
  if (burgerProduct && grillStation) {
    db.prepare('UPDATE products SET kitchen_station_id = ? WHERE id = ?').run(grillStation.id, burgerProduct.id)
  }
  if (pizzaProduct && pizzaStation) {
    db.prepare('UPDATE products SET kitchen_station_id = ? WHERE id = ?').run(pizzaStation.id, pizzaProduct.id)
  }
  if (drinkProduct && barStation) {
    db.prepare('UPDATE products SET kitchen_station_id = ? WHERE id = ?').run(barStation.id, drinkProduct.id)
  }

  const orderData = {
    branchId: branch.id,
    orderNumber: 'KDS-ORD-001',
    orderType: 'DINE_IN',
    tableId: table.id,
    subtotalCents: 2600,
    totalCents: 2730,
    notes: 'Customer requested crispy fries and well-done burger',
    cashierId: session.id,
    items: [
      {
        productId: burgerProduct.id,
        name: burgerProduct.name,
        quantity: 2,
        unitPriceCents: 950,
        totalCents: 1900,
        notes: 'Well done, extra napkins',
        kitchenStationId: grillStation.id,
        modifiers: [{ name: 'Extra Cheddar', priceCents: 150 }],
      },
      {
        productId: pizzaProduct.id,
        name: pizzaProduct.name,
        quantity: 1,
        unitPriceCents: 1250,
        totalCents: 1250,
        notes: 'Thin crust',
        kitchenStationId: pizzaStation.id,
      },
      {
        productId: drinkProduct.id,
        name: drinkProduct.name,
        quantity: 1,
        unitPriceCents: 350,
        totalCents: 350,
        notes: 'No ice',
        kitchenStationId: barStation.id,
      },
    ],
  }

  const createdOrder = orderRepository.createOrder(orderData)
  assert.strictEqual(createdOrder.order_number, 'KDS-ORD-001')
  console.log(`✓ Order Created in POS: ${createdOrder.order_number} (Status: ${createdOrder.status})`)

  // 5. Query Kitchen Queue
  console.log('\n--- Test 5: Fetch Active Kitchen Orders ---')
  const activeOrders = kitchenRepository.getKitchenOrders({ branchId: branch.id, statusFilter: 'ACTIVE' })
  assert.strictEqual(activeOrders.length >= 1, true, 'Order must appear in active kitchen queue')
  const kdsTicket = activeOrders.find((o) => o.order_number === 'KDS-ORD-001')
  assert.ok(kdsTicket, 'Created order ticket must be present')
  assert.strictEqual(kdsTicket.table_number, table.table_number)
  assert.strictEqual(kdsTicket.items.length, 3, 'Must have 3 items')
  console.log(`✓ KDS Queue received ticket: ${kdsTicket.order_number} for Table ${kdsTicket.table_number}`)
  console.log(`   - Items count: ${kdsTicket.items.length}`)
  console.log(`   - Delay status: ${kdsTicket.delayStatus} (Elapsed: ${kdsTicket.elapsedMinutes}m)`)

  // Station Filter Check
  const grillOnlyOrders = kitchenRepository.getKitchenOrders({ branchId: branch.id, stationId: grillStation.id })
  assert.strictEqual(grillOnlyOrders.some((o) => o.order_number === 'KDS-ORD-001'), true)
  console.log(`✓ Station filtering verified: Grill station displays ${grillOnlyOrders.length} ticket(s)`)

  // 6. Item Status Updates & Automatic Order Promotion
  console.log('\n--- Test 6: Item-Level Status Transitions & Auto-Promotion ---')
  const item1 = kdsTicket.items[0]
  const item2 = kdsTicket.items[1]
  const item3 = kdsTicket.items[2]

  // Transition Item 1 to PREPARING
  const updatedItem1 = kitchenRepository.updateOrderItemStatus({
    orderItemId: item1.id,
    status: 'PREPARING',
    userId: session.id,
  })
  assert.strictEqual(updatedItem1.kitchen_status, 'PREPARING')
  assert.ok(updatedItem1.started_cooking_at, 'started_cooking_at must be populated')

  // Check parent order is now PREPARING
  let orderAfterItemPrep = db.prepare('SELECT status FROM orders WHERE id = ?').get(createdOrder.id)
  assert.strictEqual(orderAfterItemPrep.status, 'PREPARING', 'Order must be promoted to PREPARING')
  console.log(`✓ Item "${item1.item_name}" marked PREPARING -> Parent Order promoted to: PREPARING`)

  // Mark all items READY one by one
  kitchenRepository.updateOrderItemStatus({ orderItemId: item1.id, status: 'READY', userId: session.id })
  kitchenRepository.updateOrderItemStatus({ orderItemId: item2.id, status: 'READY', userId: session.id })

  let orderMidReady = db.prepare('SELECT status FROM orders WHERE id = ?').get(createdOrder.id)
  assert.strictEqual(orderMidReady.status, 'PREPARING', 'Order should stay PREPARING until all items are ready')

  // Mark last item READY
  kitchenRepository.updateOrderItemStatus({ orderItemId: item3.id, status: 'READY', userId: session.id })
  let orderAllReady = db.prepare('SELECT status, kitchen_ready_at FROM orders WHERE id = ?').get(createdOrder.id)
  assert.strictEqual(orderAllReady.status, 'READY', 'Order must automatically promote to READY when all items are ready')
  assert.ok(orderAllReady.kitchen_ready_at, 'kitchen_ready_at must be stamped')
  console.log(`✓ All items marked READY -> Parent Order automatically promoted to: READY`)

  // 7. Bump / Complete Order
  console.log('\n--- Test 7: Bump / Complete Order from KDS ---')
  const bumpedOrder = kitchenRepository.updateOrderStatus({
    orderId: createdOrder.id,
    status: 'COMPLETED',
    userId: session.id,
    notes: 'Order collected by waiter Jordan',
  })
  assert.strictEqual(bumpedOrder.status, 'COMPLETED')
  assert.ok(bumpedOrder.kitchen_completed_at, 'kitchen_completed_at must be stamped')
  console.log(`✓ Order bumped to: COMPLETED (Completed at: ${bumpedOrder.kitchen_completed_at})`)

  // 8. Kitchen Metrics
  console.log('\n--- Test 8: Kitchen Summary Metrics ---')
  const metrics = kitchenRepository.getKitchenMetrics(branch.id)
  assert.strictEqual(typeof metrics.activeTickets, 'number')
  assert.strictEqual(typeof metrics.completedToday, 'number')
  assert.strictEqual(metrics.completedToday >= 1, true, 'Completed today must be at least 1')
  console.log(`✓ Kitchen Metrics Verified:`)
  console.log(`   - Active Tickets: ${metrics.activeTickets}`)
  console.log(`   - Preparing Tickets: ${metrics.preparingTickets}`)
  console.log(`   - Ready Tickets: ${metrics.readyTickets}`)
  console.log(`   - Delayed Tickets: ${metrics.delayedCount}`)
  console.log(`   - Completed Today: ${metrics.completedToday}`)

  // 9. Audit Log Check
  console.log('\n--- Test 9: Audit Trail Verification ---')
  const auditLogs = db.prepare("SELECT * FROM audit_logs WHERE action = 'UPDATE_KITCHEN_STATUS'").all()
  assert.strictEqual(auditLogs.length >= 1, true, 'Kitchen status updates must be logged')
  console.log(`✓ Captured ${auditLogs.length} KDS Audit Log(s). Sample: ${auditLogs[0].details_json}`)

  // Clean up
  closeDatabase()
  cleanup()
  console.log('✓ Cleaned up test artifacts.')

  console.log('\n====================================================')
  console.log('🎉 ALL PHASE 6 KITCHEN DISPLAY SYSTEM TESTS PASSED!')
  console.log('====================================================\n')
}

runTestSuite().catch((err) => {
  console.error('\n❌ KITCHEN TEST SUITE FAILED:', err)
  closeDatabase()
  cleanup()
  process.exit(1)
})
