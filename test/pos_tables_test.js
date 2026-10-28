import path from 'node:path'
import fs from 'node:fs'
import { initDatabase, closeDatabase, getDb } from '../electron/db/index.js'
import { orderRepository } from '../electron/db/repositories/orderRepository.js'
import { tableRepository } from '../electron/db/repositories/tableRepository.js'
import { customerRepository } from '../electron/db/repositories/customerRepository.js'
import { productRepository } from '../electron/db/repositories/productRepository.js'
import { authRepository } from '../electron/db/repositories/authRepository.js'

async function runPosAndTableTests() {
  console.log('====================================================')
  console.log('🧪 Starting Phase 5: POS, Orders & Table Map Test Suite')
  console.log('====================================================')

  const testDir = path.resolve(process.cwd(), 'test_pos_scratch')
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true })
  const testDbPath = path.join(testDir, 'test_pos.sqlite')

  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath)
  if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`)
  if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`)

  // 1. Initialize DB with Seeds
  console.log('\n--- Test 1: Initialize Database & Seed Operational Data ---')
  const db = initDatabase({ dbPath: testDbPath, seed: true })
  const branch = db.prepare('SELECT id FROM branches LIMIT 1').get()
  const admin = authRepository.loginWithPassword('admin', 'admin123')
  console.log(`✓ Database initialized at Schema Version 3, Authenticated as: ${admin.displayName}`)

  // 2. Floors & Tables Verification
  console.log('\n--- Test 2: Floor & Table Roster ---')
  const floors = tableRepository.getFloorsWithTables(branch.id)
  console.log(`✓ Retrieved ${floors.length} Floors:`)
  for (const f of floors) {
    console.log(`   - Floor: ${f.name} (${f.tables.length} tables)`)
  }
  if (floors.length < 2) throw new Error('Expected at least 2 seeded floors!')

  const table1 = floors[0].tables[0] // e.g. T-01
  const table2 = floors[0].tables[1] // e.g. T-02
  console.log(`✓ Selected Test Tables: ${table1.table_number} (Cap: ${table1.capacity}) and ${table2.table_number}`)

  // 3. Customer Creation & Search
  console.log('\n--- Test 3: Customer Management & CRM ---')
  const newCustomer = customerRepository.createCustomer({
    branchId: branch.id,
    name: 'Alice Cooper',
    phone: '+1 555-7788',
    email: 'alice@example.com',
    address: '742 Evergreen Terrace',
    notes: 'Likes corner table',
  })
  console.log(`✓ Created Customer: ${newCustomer.name} (Phone: ${newCustomer.phone})`)

  const searched = customerRepository.getCustomers(branch.id, '7788')
  if (searched.length === 0 || searched[0].name !== 'Alice Cooper') {
    throw new Error('Customer search by phone failed!')
  }
  console.log(`✓ Customer Search Verification: Found ${searched[0].name}`)

  // 4. Create Dine-In Order with Variations & Modifiers
  console.log('\n--- Test 4: Transactional Dine-In Order Creation ---')
  const sampleProducts = db.prepare('SELECT id, name, base_price_cents FROM products LIMIT 2').all()

  const orderData = {
    branchId: branch.id,
    orderNumber: 'ORD-TEST-001',
    orderType: 'DINE_IN',
    tableId: table1.id,
    customerId: newCustomer.id,
    cashierId: admin.id,
    subtotalCents: 2450,
    discountCents: 200,
    discountReason: 'Welcome coupon',
    taxCents: 112,
    serviceChargeCents: 100,
    deliveryChargeCents: 0,
    totalCents: 2462, // 24.50 - 2.00 + 1.12 + 1.00 = 24.62
    notes: 'Please bring food together',
    items: [
      {
        productId: sampleProducts[0].id,
        name: sampleProducts[0].name,
        quantity: 2,
        unitPriceCents: 950,
        discountCents: 0,
        totalCents: 1900,
        notes: 'Well done',
        modifiers: [
          { name: 'Extra Cheddar Cheese', priceCents: 150 },
          { name: 'Grilled Mushrooms', priceCents: 200 },
        ],
      },
      {
        productId: sampleProducts[1].id,
        name: sampleProducts[1].name,
        quantity: 1,
        unitPriceCents: 550,
        discountCents: 0,
        totalCents: 550,
        notes: 'Less ice',
      },
    ],
  }

  const createdOrder = orderRepository.createOrder(orderData)
  console.log(`✓ Created Order ${createdOrder.order_number}: $${(createdOrder.total_cents / 100).toFixed(2)} (${createdOrder.items.length} items)`)
  console.log(`   - Item 1 Modifiers (${createdOrder.items[0].modifiers.length}): ${createdOrder.items[0].modifiers.map(m => m.name).join(', ')}`)

  // Check Table 1 status is OCCUPIED
  const updatedTable1 = db.prepare('SELECT status, current_order_id FROM dining_tables WHERE id = ?').get(table1.id)
  console.log(`✓ Table ${table1.table_number} status updated to: ${updatedTable1.status} (Order: ${updatedTable1.current_order_id})`)
  if (updatedTable1.status !== 'OCCUPIED' || updatedTable1.current_order_id !== createdOrder.id) {
    throw new Error('Table was not marked OCCUPIED!')
  }

  // 5. Table Transfer Workflow
  console.log('\n--- Test 5: Table Transfer Workflow ---')
  const transferRes = tableRepository.transferTable({
    fromTableId: table1.id,
    toTableId: table2.id,
    reason: 'Guest requested larger booth',
  })
  console.log(`✓ Order transferred from ${transferRes.fromTableNumber} to ${transferRes.toTableNumber}`)

  const t1Check = db.prepare('SELECT status, current_order_id FROM dining_tables WHERE id = ?').get(table1.id)
  const t2Check = db.prepare('SELECT status, current_order_id FROM dining_tables WHERE id = ?').get(table2.id)
  console.log(`✓ Table ${table1.table_number} is now: ${t1Check.status} (Order: ${t1Check.current_order_id || 'None'})`)
  console.log(`✓ Table ${table2.table_number} is now: ${t2Check.status} (Order: ${t2Check.current_order_id})`)
  if (t1Check.status !== 'AVAILABLE' || t2Check.status !== 'OCCUPIED') {
    throw new Error('Table transfer failed to update table statuses properly!')
  }

  // 6. Hold & Recall Order
  console.log('\n--- Test 6: Hold & Recall Order Workflow ---')
  const heldOrder = orderRepository.holdOrder({
    branchId: branch.id,
    orderNumber: 'ORD-HELD-001',
    orderType: 'TAKEAWAY',
    cashierId: admin.id,
    subtotalCents: 1500,
    totalCents: 1500,
    notes: 'Customer stepped out for cash',
    items: [
      {
        productId: sampleProducts[0].id,
        name: sampleProducts[0].name,
        quantity: 1,
        unitPriceCents: 1500,
        totalCents: 1500,
      },
    ],
  })
  console.log(`✓ Saved Held Order: ${heldOrder.order_number} (Status: ${heldOrder.status})`)

  const heldList = orderRepository.getHeldOrders(branch.id)
  console.log(`✓ Retrieved ${heldList.length} Held Orders. Found: ${heldList[0].order_number}`)
  if (heldList.length === 0 || heldList[0].status !== 'DRAFT') {
    throw new Error('Hold order list failed to retrieve draft order!')
  }

  // 7. Multi-Tender Split Payment & Table Release
  console.log('\n--- Test 7: Multi-Tender Split Payment & Table Release ---')
  // Order 1 is on Table 2, total = $24.62
  // We pay $10.00 in Cash (tendered $20.00, change $10.00) + $14.62 by Card
  const paymentRes = orderRepository.processPayment({
    orderId: createdOrder.id,
    branchId: branch.id,
    cashierId: admin.id,
    tenderedCents: 2000, // $20.00
    changeCents: 1000,   // $10.00 change
    payments: [
      { paymentMethod: 'CASH', amountCents: 1000 },
      { paymentMethod: 'CARD', amountCents: 1462, referenceNumber: 'AUTH-VISA-9871' },
    ],
  })

  console.log(`✓ Processed Split Payment: Total Paid $${(paymentRes.paid_cents / 100).toFixed(2)}, Status: ${paymentRes.status}`)
  console.log(`   - Payment 1: ${paymentRes.payments[0].payment_method} $${(paymentRes.payments[0].amount_cents / 100).toFixed(2)} (Change: $${(paymentRes.payments[0].change_cents / 100).toFixed(2)})`)
  console.log(`   - Payment 2: ${paymentRes.payments[1].payment_method} $${(paymentRes.payments[1].amount_cents / 100).toFixed(2)} (Ref: ${paymentRes.payments[1].reference_number})`)
  if (paymentRes.status !== 'COMPLETED' || paymentRes.paid_cents !== 2462) {
    throw new Error('Order was not marked COMPLETED with full payment!')
  }

  // Verify Table 2 is now released back to AVAILABLE
  const t2Final = db.prepare('SELECT status, current_order_id FROM dining_tables WHERE id = ?').get(table2.id)
  console.log(`✓ Table ${table2.table_number} after settlement released to: ${t2Final.status} (Order: ${t2Final.current_order_id || 'None'})`)
  if (t2Final.status !== 'AVAILABLE') throw new Error('Table was not freed after payment!')

  // 8. Order Cancellation Workflow
  console.log('\n--- Test 8: Order Cancellation Workflow ---')
  const orderToCancel = orderRepository.createOrder({
    branchId: branch.id,
    orderNumber: 'ORD-CANCEL-001',
    orderType: 'DINE_IN',
    tableId: table1.id,
    cashierId: admin.id,
    subtotalCents: 1200,
    totalCents: 1200,
    items: [{ productId: sampleProducts[0].id, name: sampleProducts[0].name, quantity: 1, unitPriceCents: 1200, totalCents: 1200 }],
  })
  console.log(`✓ Created Order for cancellation: ${orderToCancel.order_number} on Table ${table1.table_number}`)

  orderRepository.cancelOrder(orderToCancel.id, 'Customer changed mind and walked out', admin.id)
  const cancelledCheck = db.prepare('SELECT status, notes FROM orders WHERE id = ?').get(orderToCancel.id)
  console.log(`✓ Order Status is now: ${cancelledCheck.status}`)
  console.log(`   - Notes: ${cancelledCheck.notes}`)
  if (cancelledCheck.status !== 'CANCELLED') throw new Error('Order cancellation failed!')

  const t1AfterCancel = db.prepare('SELECT status FROM dining_tables WHERE id = ?').get(table1.id)
  console.log(`✓ Table ${table1.table_number} released back to: ${t1AfterCancel.status}`)
  if (t1AfterCancel.status !== 'AVAILABLE') throw new Error('Table was not released after order cancellation!')

  console.log('\n--- Test 9: Duplicate payment blocked + refund ---')
  let duplicateBlocked = false
  try {
    orderRepository.processPayment({
      orderId: paymentRes.id,
      branchId: branch.id,
      cashierId: admin.id,
      payments: [{ paymentMethod: 'CASH', amountCents: 100 }],
    })
  } catch (e) {
    duplicateBlocked = true
    console.log(`✓ Duplicate completion blocked: ${e.message}`)
  }
  if (!duplicateBlocked) throw new Error('Duplicate sale completion was not blocked!')

  const refunded = orderRepository.refundOrder({
    orderId: paymentRes.id,
    amountCents: 2462,
    reason: 'Quality complaint',
    restock: true,
    cashierId: admin.id,
  })
  console.log(`✓ Refund posted, status=${refunded.status}, refunded_cents=${refunded.refunded_cents}`)
  if (refunded.status !== 'REFUNDED') throw new Error('Full refund did not mark order REFUNDED')

  console.log('\n--- Test 10: Merge occupied tables ---')
  const mergeA = orderRepository.createOrder({
    branchId: branch.id,
    orderNumber: 'ORD-MERGE-A',
    orderType: 'DINE_IN',
    tableId: table1.id,
    cashierId: admin.id,
    subtotalCents: 500,
    totalCents: 500,
    items: [{ productId: sampleProducts[0].id, name: sampleProducts[0].name, quantity: 1, unitPriceCents: 500, totalCents: 500 }],
  })
  const mergeB = orderRepository.createOrder({
    branchId: branch.id,
    orderNumber: 'ORD-MERGE-B',
    orderType: 'DINE_IN',
    tableId: table2.id,
    cashierId: admin.id,
    subtotalCents: 700,
    totalCents: 700,
    items: [{ productId: sampleProducts[0].id, name: sampleProducts[0].name, quantity: 1, unitPriceCents: 700, totalCents: 700 }],
  })
  tableRepository.updateTableStatus(table1.id, 'OCCUPIED', mergeA.id)
  tableRepository.updateTableStatus(table2.id, 'OCCUPIED', mergeB.id)
  const mergeRes = tableRepository.mergeTables({
    sourceTableId: table1.id,
    targetTableId: table2.id,
    reason: 'Same party',
  })
  console.log(`✓ Merged into order ${mergeRes.survivingOrderId}`)
  const sourceAfterMerge = db.prepare('SELECT status FROM orders WHERE id = ?').get(mergeA.id)
  const targetAfterMerge = db.prepare('SELECT total_cents FROM orders WHERE id = ?').get(mergeB.id)
  if (sourceAfterMerge.status !== 'CANCELLED') throw new Error('Source merge order should be cancelled')
  if (targetAfterMerge.total_cents !== 1200) throw new Error(`Expected merged total 1200, got ${targetAfterMerge.total_cents}`)

  // Clean up
  closeDatabase()
  try {
    fs.rmSync(testDir, { recursive: true, force: true })
    console.log('✓ Cleaned up test artifacts.')
  } catch (e) {}

  console.log('\n====================================================')
  console.log('🎉 ALL PHASE 5 POS, ORDER & TABLE TESTS PASSED!')
  console.log('====================================================')
  process.exit(0)
}

runPosAndTableTests().catch((err) => {
  console.error('\n❌ Test failed with error:', err)
  process.exit(1)
})
