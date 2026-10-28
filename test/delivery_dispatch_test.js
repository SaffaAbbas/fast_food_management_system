import path from 'node:path'
import fs from 'node:fs'
import { initDatabase, getDb, closeDatabase } from '../electron/db/index.js'
import { authRepository } from '../electron/db/repositories/authRepository.js'
import { deliveryRepository } from '../electron/db/repositories/deliveryRepository.js'
import { orderRepository } from '../electron/db/repositories/orderRepository.js'

async function runTests() {
  console.log('====================================================')
  console.log('🧪 Starting Phase 10: Delivery, Riders & Dispatch Test Suite')
  console.log('====================================================')

  const testDbDir = path.resolve(process.cwd(), 'test_delivery_scratch')
  const testDbPath = path.join(testDbDir, 'test_delivery.sqlite')

  if (fs.existsSync(testDbDir)) {
    fs.rmSync(testDbDir, { recursive: true, force: true })
  }
  fs.mkdirSync(testDbDir, { recursive: true })

  try {
    // ------------------------------------------------------------------
    console.log('\n--- Test 1: Initialize Database & Apply Migrations v1-v8 ---')
    initDatabase({ dbPath: testDbPath, seed: true })
    const db = getDb()

    const branch = db.prepare('SELECT id, name FROM branches LIMIT 1').get()
    console.log(`✓ Database initialized, connected to branch: ${branch.name}`)

    const adminUser = db.prepare("SELECT * FROM users WHERE username = 'admin'").get()
    authRepository.loginWithPin('1234', adminUser.id)
    console.log(`✓ Authenticated as: ${adminUser.display_name}`)

    // ------------------------------------------------------------------
    console.log('\n--- Test 2: Delivery Zones Verification & Custom Zone ---')
    const initialZones = deliveryRepository.getZones(branch.id)
    console.log(`✓ Retrieved ${initialZones.length} seeded delivery zones:`)
    initialZones.forEach((z) => {
      console.log(`   - ${z.name} | Fee: $${(z.delivery_charge_cents / 100).toFixed(2)} | Min Order: $${(z.min_order_cents / 100).toFixed(2)} | Est: ${z.estimated_minutes}m`)
    })
    if (initialZones.length < 3) throw new Error('Expected at least 3 seeded delivery zones.')

    const customZone = deliveryRepository.createZone({
      branchId: branch.id,
      name: 'Zone D - Tech Park Special',
      deliveryChargeCents: 450, // $4.50
      minOrderCents: 2500, // $25.00
      estimatedMinutes: 40,
      description: 'Corporate tech offices & business parks',
    })
    console.log(`✓ Created Custom Delivery Zone: ${customZone.name} ($${(customZone.delivery_charge_cents / 100).toFixed(2)})`)

    // ------------------------------------------------------------------
    console.log('\n--- Test 3: Riders Fleet Management ---')
    const riders = deliveryRepository.getRiders(branch.id)
    console.log(`✓ Retrieved ${riders.length} seeded fleet riders:`)
    riders.forEach((r) => {
      console.log(`   - ${r.name} (${r.phone}) | Vehicle: ${r.vehicle_type} (${r.license_plate || 'No plate'}) | Status: ${r.status}`)
    })
    if (riders.length < 3) throw new Error('Expected at least 3 seeded riders.')

    const newRider = deliveryRepository.createRider({
      branchId: branch.id,
      name: 'Gabriel Santos',
      phone: '+1 555-7788',
      vehicleType: 'MOTORCYCLE',
      licensePlate: 'MOTO-9901',
    })
    console.log(`✓ Registered new fleet rider: ${newRider.name} [${newRider.status}]`)

    // ------------------------------------------------------------------
    console.log('\n--- Test 4: Create Delivery Order in POS ---')
    const product = db.prepare("SELECT * FROM products WHERE is_available = 1 LIMIT 1").get()
    const orderData = {
      branchId: branch.id,
      cashierId: adminUser.id,
      orderNumber: `DELIV-${Date.now().toString().slice(-5)}`,
      orderType: 'DELIVERY',
      orderSource: 'POS',
      items: [
        {
          productId: product.id,
          name: product.name,
          quantity: 2,
          unitPriceCents: product.base_price_cents,
          totalCents: product.base_price_cents * 2,
        },
      ],
      subtotalCents: product.base_price_cents * 2,
      discountCents: 0,
      taxCents: Math.round((product.base_price_cents * 2 * 0.05)),
      deliveryChargeCents: 300, // $3.00
      totalCents: (product.base_price_cents * 2) + Math.round((product.base_price_cents * 2 * 0.05)) + 300,
      paidCents: 0, // Unpaid = COD Cash on Delivery
      customerInfo: {
        name: 'Rachel Adams',
        phone: '+1 555-3211',
        address: '450 Innovation Way, Suite 800',
      },
      notes: 'Please leave with reception if ringing unanswered',
    }

    const createdOrder = orderRepository.createOrder(orderData)
    console.log(`✓ Created POS Delivery Order: ${createdOrder.order_number}`)
    console.log(`   - Total: $${(createdOrder.total_cents / 100).toFixed(2)} | Delivery Fee: $${(createdOrder.delivery_charge_cents / 100).toFixed(2)}`)

    // ------------------------------------------------------------------
    console.log('\n--- Test 5: Dispatch Creation & Rider Assignment ---')
    const delivery = deliveryRepository.createDelivery({
      branchId: branch.id,
      orderId: createdOrder.id,
      zoneId: customZone.id,
      customerName: 'Rachel Adams',
      customerPhone: '+1 555-3211',
      deliveryAddress: '450 Innovation Way, Suite 800',
      deliveryInstructions: 'Call upon arrival at security barrier',
    })
    console.log(`✓ Dispatch Record Created: ${delivery.id}`)
    console.log(`   - Status: ${delivery.status} | COD To Collect: $${(delivery.cod_amount_cents / 100).toFixed(2)}`)
    if (delivery.status !== 'PENDING') throw new Error('Expected status PENDING.')

    // Assign rider
    const assigned = deliveryRepository.assignRider(delivery.id, newRider.id)
    console.log(`✓ Rider Assigned: ${assigned.rider_name} -> Status: ${assigned.status}`)
    const riderAfterAssign = deliveryRepository.getRiderById(newRider.id)
    if (riderAfterAssign.status !== 'ASSIGNED') throw new Error('Rider status should be ASSIGNED.')

    // ------------------------------------------------------------------
    console.log('\n--- Test 6: Dispatch Order to Trip (OUT_FOR_DELIVERY) ---')
    const dispatched = deliveryRepository.dispatchDelivery(delivery.id)
    console.log(`✓ Order Dispatched: Status: ${dispatched.status} at ${dispatched.dispatched_at}`)
    const riderOnTrip = deliveryRepository.getRiderById(newRider.id)
    if (riderOnTrip.status !== 'OUT_FOR_DELIVERY') throw new Error('Rider status should be OUT_FOR_DELIVERY.')

    const orderDuringTrip = db.prepare('SELECT status FROM orders WHERE id = ?').get(createdOrder.id)
    console.log(`✓ Parent order synchronized status: ${orderDuringTrip.status}`)
    if (orderDuringTrip.status !== 'OUT_FOR_DELIVERY') throw new Error('Order status should be OUT_FOR_DELIVERY.')

    // ------------------------------------------------------------------
    console.log('\n--- Test 7: Complete Delivery & Collect Cash on Delivery ---')
    const completed = deliveryRepository.completeDelivery(delivery.id, {
      codCollectedCents: delivery.cod_amount_cents,
    })
    console.log(`✓ Delivery Completed! Delivered at: ${completed.delivered_at}`)
    console.log(`   - Cash Collected by Rider: $${(completed.cod_collected_cents / 100).toFixed(2)}`)
    if (completed.status !== 'DELIVERED') throw new Error('Expected status DELIVERED.')

    const riderReturned = deliveryRepository.getRiderById(newRider.id)
    console.log(`✓ Rider ${riderReturned.name} automatically returned to status: ${riderReturned.status}`)
    if (riderReturned.status !== 'AVAILABLE') throw new Error('Rider should be AVAILABLE after trip.')

    const orderCompleted = db.prepare('SELECT status, paid_cents, total_cents FROM orders WHERE id = ?').get(createdOrder.id)
    console.log(`✓ Order finalized as: ${orderCompleted.status} (Paid: $${(orderCompleted.paid_cents / 100).toFixed(2)} / $${(orderCompleted.total_cents / 100).toFixed(2)})`)
    if (orderCompleted.status !== 'DELIVERED') throw new Error('Order should be DELIVERED.')

    // ------------------------------------------------------------------
    console.log('\n--- Test 8: Cash-On-Delivery (COD) Pending Remittance ---')
    const pendingCod = deliveryRepository.getRiderPendingCod(newRider.id)
    console.log(`✓ Rider Pending Remittance:`)
    console.log(`   - Delivered Unsettled Orders: ${pendingCod.deliveredOrdersCount}`)
    console.log(`   - Pending COD Cash: $${(pendingCod.pendingCodCents / 100).toFixed(2)}`)
    if (pendingCod.pendingCodCents !== delivery.cod_amount_cents) {
      throw new Error(`Expected pending COD $${(delivery.cod_amount_cents / 100).toFixed(2)}, got $${(pendingCod.pendingCodCents / 100).toFixed(2)}`)
    }

    // ------------------------------------------------------------------
    console.log('\n--- Test 9: Settle Rider Remittance to Cashier ---')
    const settlementResult = deliveryRepository.settleRiderCod({
      branchId: branch.id,
      riderId: newRider.id,
      settledByUserId: adminUser.id,
      notes: 'Evening shift delivery cash settlement',
    })
    console.log(`✓ COD Settlement Committed: ID: ${settlementResult.settlementId}`)
    console.log(`   - Amount Remitted: $${(settlementResult.totalSettledCents / 100).toFixed(2)}`)
    console.log(`   - Orders Cleared: ${settlementResult.ordersSettledCount}`)

    const pendingAfterSettle = deliveryRepository.getRiderPendingCod(newRider.id)
    console.log(`✓ Pending COD after settlement: $${(pendingAfterSettle.pendingCodCents / 100).toFixed(2)}`)
    if (pendingAfterSettle.pendingCodCents !== 0) throw new Error('Pending COD must be $0 after settlement.')

    // Verify settlement history
    const history = deliveryRepository.getSettlementHistory(branch.id, { riderId: newRider.id })
    console.log(`✓ Retrieved ${history.length} settlement audit history records for ${newRider.name}`)
    if (history.length === 0) throw new Error('Expected at least 1 settlement audit record.')

    // ------------------------------------------------------------------
    console.log('\n--- Test 10: Delivery Summary Analytics ---')
    const summary = deliveryRepository.getSummary(branch.id)
    console.log(`✓ Delivery Dispatch Metrics Summary:`)
    console.log(`   - Total Active Riders: ${summary.totalRiders}`)
    console.log(`   - Available Riders: ${summary.availableRiders}`)
    console.log(`   - Delivered Today: ${summary.deliveredToday}`)
    console.log(`   - Pending COD in Fleet: $${(summary.pendingCodCents / 100).toFixed(2)}`)

    console.log('\n====================================================')
    console.log('🎉 ALL PHASE 10 DELIVERY, RIDERS & DISPATCH TESTS PASSED!')
    console.log('====================================================')
  } finally {
    closeDatabase()
    try {
      if (fs.existsSync(testDbDir)) {
        fs.rmSync(testDbDir, { recursive: true, force: true })
        console.log('✓ Cleaned up test artifacts.')
      }
    } catch (e) {}
  }
  process.exit(0)
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err)
  process.exit(1)
})
