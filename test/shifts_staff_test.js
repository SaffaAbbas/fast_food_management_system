import path from 'node:path'
import fs from 'node:fs'
import { initDatabase, getDb, closeDatabase } from '../electron/db/index.js'
import { authRepository } from '../electron/db/repositories/authRepository.js'
import { cashDrawerRepository } from '../electron/db/repositories/cashDrawerRepository.js'
import { staffRepository } from '../electron/db/repositories/staffRepository.js'
import { orderRepository } from '../electron/db/repositories/orderRepository.js'

async function runTests() {
  console.log('====================================================')
  console.log('🧪 Starting Phase 8: Cash Drawer Shifts & Staff Attendance Test Suite')
  console.log('====================================================')

  const testDbDir = path.resolve(process.cwd(), 'test_shifts_scratch')
  const testDbPath = path.join(testDbDir, 'test_shifts.sqlite')

  if (fs.existsSync(testDbDir)) {
    fs.rmSync(testDbDir, { recursive: true, force: true })
  }
  fs.mkdirSync(testDbDir, { recursive: true })

  try {
    // ------------------------------------------------------------------
    console.log('\n--- Test 1: Initialize Database & Apply Migrations v1-v6 ---')
    initDatabase({ dbPath: testDbPath, seed: true })
    const db = getDb()

    const branch = db.prepare('SELECT id, name FROM branches LIMIT 1').get()
    console.log(`✓ Database initialized, connected to branch: ${branch.name}`)

    // Authenticate as Cashier (pin is 0000)
    const cashierUser = db.prepare("SELECT * FROM users WHERE username = 'cashier1'").get()
    authRepository.loginWithPin('0000', cashierUser.id)
    console.log(`✓ Authenticated as: ${cashierUser.display_name} (${cashierUser.username})`)

    // ------------------------------------------------------------------
    console.log('\n--- Test 2: Verify Initial Seeded Shifts & Employees ---')
    const shifts = staffRepository.getShifts(branch.id)
    console.log(`✓ Retrieved ${shifts.length} shifts:`, shifts.map(s => `${s.name} (${s.start_time}-${s.end_time})`).join(', '))
    if (shifts.length < 3) throw new Error('Expected at least 3 default shifts.')

    const employees = staffRepository.getEmployees({ branchId: branch.id })
    console.log(`✓ Retrieved ${employees.length} seeded employees. Sample: ${employees[0].first_name} ${employees[0].last_name} (${employees[0].designation})`)
    if (employees.length === 0) throw new Error('Expected seeded employees.')

    // ------------------------------------------------------------------
    console.log('\n--- Test 3: Open Cash Drawer Shift Session ---')
    const openedSession = cashDrawerRepository.openSession({
      branchId: branch.id,
      userId: cashierUser.id,
      openingBalanceCents: 15000, // $150.00 starting float
      notes: 'Morning shift opening float verified by cashier',
    })
    console.log(`✓ Opened Cash Session: ${openedSession.id}`)
    console.log(`   - Opening Float: $${(openedSession.opening_balance_cents / 100).toFixed(2)}`)
    console.log(`   - Status: ${openedSession.status}`)

    // Verify current active session query
    const currentActive = cashDrawerRepository.getCurrentSession(branch.id, cashierUser.id)
    if (!currentActive || currentActive.id !== openedSession.id) {
      throw new Error('getCurrentSession failed to retrieve newly opened session.')
    }
    console.log('✓ Verified getCurrentSession successfully retrieves active shift.')

    // ------------------------------------------------------------------
    console.log('\n--- Test 4: Process Cash & Card Sales within Shift ---')
    const product = db.prepare('SELECT id, name FROM products LIMIT 1').get()

    // 1st Order - Paid with Cash $25.00
    const order1 = orderRepository.createOrder({
      branchId: branch.id,
      cashierId: cashierUser.id,
      orderType: 'TAKEAWAY',
      items: [{ productId: product.id, name: product.name, quantity: 2, unitPriceCents: 1000, totalCents: 2000 }],
      subtotalCents: 2000,
      taxCents: 100,
      totalCents: 2100,
    })
    orderRepository.processPayment({
      orderId: order1.id,
      branchId: branch.id,
      cashierId: cashierUser.id,
      payments: [{ paymentMethod: 'CASH', amountCents: 2100 }],
      tenderedCents: 2500,
      changeCents: 400,
    })
    console.log('✓ Order 1 settled via CASH ($21.00)')

    // 2nd Order - Paid with Card $35.00
    const order2 = orderRepository.createOrder({
      branchId: branch.id,
      cashierId: cashierUser.id,
      orderType: 'TAKEAWAY',
      items: [{ productId: product.id, name: product.name, quantity: 3, unitPriceCents: 1000, totalCents: 3000 }],
      subtotalCents: 3000,
      taxCents: 150,
      totalCents: 3150,
    })
    orderRepository.processPayment({
      orderId: order2.id,
      branchId: branch.id,
      cashierId: cashierUser.id,
      payments: [{ paymentMethod: 'CARD', amountCents: 3150, referenceNumber: 'TX-CARD-9001' }],
    })
    console.log('✓ Order 2 settled via CARD ($31.50)')

    // ------------------------------------------------------------------
    console.log('\n--- Test 5: Record Cash In & Cash Out (Petty Cash Movements) ---')
    const cashInRes = cashDrawerRepository.recordMovement({
      sessionId: openedSession.id,
      movementType: 'CASH_IN',
      amountCents: 5000, // $50.00
      reason: 'Additional change coins from safe',
    })
    console.log(`✓ Recorded CASH_IN: +$50.00 (${cashInRes.reason})`)

    const cashOutRes = cashDrawerRepository.recordMovement({
      sessionId: openedSession.id,
      movementType: 'CASH_OUT',
      amountCents: 1500, // $15.00
      reason: 'Purchased emergency cleaning supplies',
    })
    console.log(`✓ Recorded CASH_OUT: -$15.00 (${cashOutRes.reason})`)

    // ------------------------------------------------------------------
    console.log('\n--- Test 6: Instantaneous Mid-Shift X-Report Verification ---')
    const xReport = cashDrawerRepository.getXReport(openedSession.id)
    console.log('✓ Live X-Report Summary:')
    console.log(`   - Opening Float: $${(xReport.metrics.openingBalanceCents / 100).toFixed(2)}`)
    console.log(`   - Total Cash Sales: $${(xReport.metrics.totalCashSalesCents / 100).toFixed(2)}`)
    console.log(`   - Total Card Sales: $${(xReport.metrics.totalCardSalesCents / 100).toFixed(2)}`)
    console.log(`   - Total Gross Sales: $${(xReport.metrics.totalGrossSalesCents / 100).toFixed(2)}`)
    console.log(`   - Total Cash In: +$${(xReport.metrics.totalCashInCents / 100).toFixed(2)}`)
    console.log(`   - Total Cash Out: -$${(xReport.metrics.totalCashOutCents / 100).toFixed(2)}`)
    console.log(`   - Expected Cash in Drawer: $${(xReport.metrics.expectedCashCents / 100).toFixed(2)}`)

    // Expected: 15000 (Float) + 2100 (Cash sales) + 5000 (Cash In) - 1500 (Cash Out) = 20600 ($206.00)
    if (xReport.metrics.expectedCashCents !== 20600) {
      throw new Error(`Expected cash mismatch. Expected 20600 cents ($206.00), got ${xReport.metrics.expectedCashCents}`)
    }
    console.log('✓ Mathematical calculation of Expected Cash verified (20600 cents == $206.00)!')

    // ------------------------------------------------------------------
    console.log('\n--- Test 7: End of Shift Z-Report & Cash Reconciliation ---')
    // Cashier counts $205.00 (a small $1.00 shortage)
    const denominations = [
      { denominationCents: 10000, count: 1, totalCents: 10000 }, // $100 x 1
      { denominationCents: 5000, count: 2, totalCents: 10000 },  // $50 x 2
      { denominationCents: 500, count: 1, totalCents: 500 },     // $5 x 1
    ] // Total: $205.00 = 20500 cents

    const zReport = cashDrawerRepository.closeSession({
      sessionId: openedSession.id,
      countedCashCents: 20500,
      closingNotes: 'Shift concluded. Minor $1 variance due to round-off.',
      denominations,
    })

    console.log('✓ Shift Closed & Z-Report Generated:')
    console.log(`   - Counted Cash: $${(zReport.countedCashCents / 100).toFixed(2)}`)
    console.log(`   - Expected Cash: $${(zReport.expectedCashCents / 100).toFixed(2)}`)
    console.log(`   - Variance: $${(zReport.varianceCents / 100).toFixed(2)} (Shortage: ${zReport.varianceCents < 0})`)
    if (zReport.varianceCents !== -100) {
      throw new Error(`Variance mismatch! Expected -100 cents (-$1.00), got ${zReport.varianceCents}`)
    }
    console.log('✓ Variance correctly computed as -$1.00 shortage!')

    // ------------------------------------------------------------------
    console.log('\n--- Test 8: Employee Profile Creation & Management ---')
    const newEmployee = staffRepository.createEmployee({
      branchId: branch.id,
      firstName: 'Samantha',
      lastName: 'Miller',
      email: 'samantha.miller@restaurant.local',
      phone: '+1 555-8899',
      designation: 'Sous Chef',
      salaryType: 'HOURLY',
      baseRateCents: 2200, // $22.00/hr
      hireDate: '2026-03-15',
      emergencyContact: 'John Miller (+1 555-9900)',
    })
    console.log(`✓ Created Employee: ${newEmployee.employee_code} - ${newEmployee.first_name} ${newEmployee.last_name}`)
    console.log(`   - Designation: ${newEmployee.designation}`)
    console.log(`   - Pay Rate: $${(newEmployee.base_rate_cents / 100).toFixed(2)} / ${newEmployee.salary_type}`)

    // ------------------------------------------------------------------
    console.log('\n--- Test 9: Employee Clock-In & Clock-Out Workflow ---')
    const clockInRecord = staffRepository.clockIn({
      employeeId: newEmployee.id,
      branchId: branch.id,
      shiftId: shifts[0].id,
      notes: 'Clocked in on time for morning kitchen prep',
    })
    console.log(`✓ Clock-In Success for ${newEmployee.first_name} at: ${clockInRecord.clock_in}`)
    console.log(`   - Status: ${clockInRecord.status}`)

    // Simulate clock out
    const clockOutRecord = staffRepository.clockOut({
      attendanceId: clockInRecord.id,
      breakMinutes: 30, // 30 min lunch break
      notes: 'Completed full prep shift cleanly',
    })
    console.log(`✓ Clock-Out Success at: ${clockOutRecord.clock_out}`)
    console.log(`   - Break Minutes: ${clockOutRecord.break_minutes} mins`)
    console.log(`   - Total Worked Minutes recorded: ${clockOutRecord.total_work_minutes} mins`)

    // ------------------------------------------------------------------
    console.log('\n--- Test 10: Staff Performance & Sales Ranking ---')
    const performance = staffRepository.getStaffPerformance({ branchId: branch.id })
    console.log('✓ Staff Performance Data Retrieved:')
    for (const c of performance.cashierPerformance) {
      if (c.orders_handled > 0) {
        console.log(`   - Cashier: ${c.display_name} | Orders: ${c.orders_handled} | Total Collected: $${(c.total_collected_cents / 100).toFixed(2)} (Cash: $${(c.cash_collected_cents / 100).toFixed(2)}, Card: $${(c.card_collected_cents / 100).toFixed(2)})`)
      }
    }

    closeDatabase()
    console.log('\n✓ Cleaned up test artifacts.')
    console.log('====================================================')
    console.log('🎉 ALL PHASE 8 CASH DRAWER & STAFF ATTENDANCE TESTS PASSED!')
    console.log('====================================================')
  } catch (err) {
    console.error('❌ Test suite failed:', err)
    process.exit(1)
  } finally {
    if (fs.existsSync(testDbDir)) {
      try {
        fs.rmSync(testDbDir, { recursive: true, force: true })
      } catch (e) {}
    }
  }
}

runTests()
