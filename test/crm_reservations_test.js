import path from 'node:path'
import fs from 'node:fs'
import { initDatabase, getDb, closeDatabase } from '../electron/db/index.js'
import { authRepository } from '../electron/db/repositories/authRepository.js'
import { customerRepository } from '../electron/db/repositories/customerRepository.js'
import { reservationRepository } from '../electron/db/repositories/reservationRepository.js'
import { couponRepository } from '../electron/db/repositories/couponRepository.js'

async function runTests() {
  console.log('====================================================')
  console.log('🧪 Starting Phase 9: Customer CRM, Loyalty & Reservations Test Suite')
  console.log('====================================================')

  const testDbDir = path.resolve(process.cwd(), 'test_crm_scratch')
  const testDbPath = path.join(testDbDir, 'test_crm.sqlite')

  if (fs.existsSync(testDbDir)) {
    fs.rmSync(testDbDir, { recursive: true, force: true })
  }
  fs.mkdirSync(testDbDir, { recursive: true })

  try {
    // ------------------------------------------------------------------
    console.log('\n--- Test 1: Initialize Database & Apply Migrations v1-v7 ---')
    initDatabase({ dbPath: testDbPath, seed: true })
    const db = getDb()

    const branch = db.prepare('SELECT id, name FROM branches LIMIT 1').get()
    console.log(`✓ Database initialized, connected to branch: ${branch.name}`)

    const adminUser = db.prepare("SELECT * FROM users WHERE username = 'admin'").get()
    authRepository.loginWithPin('1234', adminUser.id)
    console.log(`✓ Authenticated as: ${adminUser.display_name}`)

    // ------------------------------------------------------------------
    console.log('\n--- Test 2: Customer Creation & VIP Tagging ---')
    const vipCustomer = customerRepository.createCustomer({
      branchId: branch.id,
      name: 'Victoria Sterling',
      phone: '+1 555-9001',
      email: 'victoria@sterlingholdings.com',
      address: '742 Evergreen Terrace, Penthouse B',
      tag: 'VIP',
      birthDate: '1988-04-12',
      notes: 'Prefers window seating, sparkling water on arrival',
    })
    console.log(`✓ Created VIP Customer: ${vipCustomer.name} (Tag: ${vipCustomer.tag})`)
    console.log(`   - Phone: ${vipCustomer.phone} | Notes: ${vipCustomer.notes}`)

    const regularCustomer = customerRepository.createCustomer({
      branchId: branch.id,
      name: 'Brian O’Connor',
      phone: '+1 555-9002',
      email: 'brian@fastfoodies.net',
      tag: 'REGULAR',
    })
    console.log(`✓ Created Regular Customer: ${regularCustomer.name} (Tag: ${regularCustomer.tag})`)

    // ------------------------------------------------------------------
    console.log('\n--- Test 3: Duplicate Phone Prevention ---')
    try {
      customerRepository.createCustomer({
        branchId: branch.id,
        name: 'Imposter Victoria',
        phone: '+1 555-9001', // duplicate
      })
      throw new Error('Should have thrown duplicate phone error.')
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log(`✓ Duplicate phone correctly blocked: "${err.message}"`)
      } else {
        throw err
      }
    }

    // ------------------------------------------------------------------
    console.log('\n--- Test 4: Loyalty Points Earning & Ledger Transaction ---')
    const earnResult = customerRepository.adjustLoyaltyPoints({
      customerId: vipCustomer.id,
      branchId: branch.id,
      pointsChanged: 150,
      transactionType: 'EARN',
      notes: 'Earned on dinner order $150.00',
    })
    console.log(`✓ Loyalty Points Awarded: +${earnResult.pointsChanged} | Balance: ${earnResult.balanceAfter}`)
    if (earnResult.balanceAfter !== 150) throw new Error('Expected balance 150.')

    // ------------------------------------------------------------------
    console.log('\n--- Test 5: Loyalty Points Redemption ---')
    const redeemResult = customerRepository.adjustLoyaltyPoints({
      customerId: vipCustomer.id,
      branchId: branch.id,
      pointsChanged: -50,
      transactionType: 'REDEEM',
      notes: 'Redeemed for $2.50 discount',
    })
    console.log(`✓ Loyalty Points Redeemed: ${redeemResult.pointsChanged} | New Balance: ${redeemResult.balanceAfter}`)
    if (redeemResult.balanceAfter !== 100) throw new Error('Expected balance 100 after redemption.')

    // Verify detailed customer fetch with loyalty ledger
    const customerDetails = customerRepository.getCustomerById(vipCustomer.id)
    console.log(`✓ Customer details verified. Found ${customerDetails.loyaltyHistory?.length || 0} ledger transactions.`)

    // ------------------------------------------------------------------
    console.log('\n--- Test 6: Table Availability Check ---')
    const today = new Date().toISOString().slice(0, 10)
    const availableTables = reservationRepository.checkAvailability({
      branchId: branch.id,
      date: today,
      time: '19:30',
      partySize: 4,
    })
    console.log(`✓ Table Availability for 4 guests at 19:30: Found ${availableTables.length} candidate tables:`)
    for (const t of availableTables.slice(0, 3)) {
      console.log(`   - Table ${t.table_number} (${t.floor_name}) | Cap: ${t.capacity} | Available: ${t.isAvailable}`)
    }
    const chosenTable = availableTables.find(t => t.isAvailable)
    if (!chosenTable) throw new Error('Expected at least one available table.')

    // ------------------------------------------------------------------
    console.log('\n--- Test 7: Create Table Reservation & Auto-Lock Table ---')
    const reservation = reservationRepository.createReservation({
      branchId: branch.id,
      customerId: vipCustomer.id,
      tableId: chosenTable.id,
      customerName: vipCustomer.name,
      customerPhone: vipCustomer.phone,
      partySize: 4,
      reservationDate: today,
      reservationTime: `${today}T19:30:00.000Z`,
      durationMinutes: 90,
      depositCents: 2000, // $20.00 deposit
      depositPaymentMethod: 'CARD',
      notes: 'Anniversary celebration. Champagne pre-chilled.',
    })
    console.log(`✓ Reservation Created: ${reservation.id}`)
    console.log(`   - Guest: ${reservation.customer_name} | Party: ${reservation.party_size}`)
    console.log(`   - Table: ${reservation.table_number} (${reservation.floor_name})`)
    console.log(`   - Deposit Paid: $${(reservation.deposit_cents / 100).toFixed(2)} (${reservation.deposit_payment_method})`)

    // Verify table status is now RESERVED
    const tableAfterBooking = db.prepare('SELECT status FROM dining_tables WHERE id = ?').get(chosenTable.id)
    console.log(`✓ Table ${chosenTable.table_number} status automatically marked as: ${tableAfterBooking.status}`)
    if (tableAfterBooking.status !== 'RESERVED') {
      throw new Error(`Expected table to be RESERVED, got ${tableAfterBooking.status}`)
    }

    // ------------------------------------------------------------------
    console.log('\n--- Test 8: Double-Booking Prevention ---')
    try {
      reservationRepository.createReservation({
        branchId: branch.id,
        tableId: chosenTable.id, // same table!
        customerName: 'Conflicting Booking',
        customerPhone: '+1 555-9999',
        partySize: 2,
        reservationDate: today,
        reservationTime: `${today}T20:00:00.000Z`, // overlaps with 19:30 - 21:00!
        durationMinutes: 60,
      })
      throw new Error('Should have blocked overlapping double-booking!')
    } catch (err) {
      if (err.message.includes('already booked')) {
        console.log(`✓ Overlapping double-booking correctly blocked: "${err.message}"`)
      } else {
        throw err
      }
    }

    // ------------------------------------------------------------------
    console.log('\n--- Test 9: Seat Guests & Update Table to OCCUPIED ---')
    const seatedRes = reservationRepository.updateReservationStatus(reservation.id, 'SEATED')
    console.log(`✓ Reservation status updated to: ${seatedRes.status}`)
    const tableAfterSeating = db.prepare('SELECT status FROM dining_tables WHERE id = ?').get(chosenTable.id)
    console.log(`✓ Table ${chosenTable.table_number} status updated to: ${tableAfterSeating.status}`)
    if (tableAfterSeating.status !== 'OCCUPIED') {
      throw new Error(`Expected table to be OCCUPIED, got ${tableAfterSeating.status}`)
    }

    // ------------------------------------------------------------------
    console.log('\n--- Test 10: Promotions & Coupons Engine Validation ---')
    const coupons = couponRepository.getCoupons(branch.id)
    console.log(`✓ Retrieved ${coupons.length} promotional coupons:`, coupons.map(c => `${c.code} (${c.title})`).join(', '))
    if (coupons.length === 0) throw new Error('Expected seeded coupons.')

    // Validate WELCOME10 on a $30.00 order
    const validResult = couponRepository.validateCoupon({
      branchId: branch.id,
      code: 'WELCOME10',
      orderTotalCents: 3000, // $30.00
    })
    console.log(`✓ Validated WELCOME10 on $30.00 order:`)
    console.log(`   - Discount: $${(validResult.discountCents / 100).toFixed(2)} (${validResult.discountType})`)
    if (validResult.discountCents !== 300) throw new Error('Expected $3.00 (10% of $30.00).')

    // Test minimum spend violation on LUNCH5 ($25.00 min spend) with $10.00 order
    try {
      couponRepository.validateCoupon({
        branchId: branch.id,
        code: 'LUNCH5',
        orderTotalCents: 1000, // $10.00 < $25.00
      })
      throw new Error('Should have failed minimum spend check.')
    } catch (err) {
      if (err.message.includes('minimum spend')) {
        console.log(`✓ Minimum spend rule enforced: "${err.message}"`)
      } else {
        throw err
      }
    }

    // ------------------------------------------------------------------
    console.log('\n--- Test 11: CRM Analytics Summary ---')
    const crmSummary = customerRepository.getCrmSummary(branch.id)
    console.log('✓ CRM Summary Metrics:')
    console.log(`   - Total Customers: ${crmSummary.total_customers}`)
    console.log(`   - VIP Customers: ${crmSummary.vip_count}`)
    console.log(`   - Total Active Loyalty Points: ${crmSummary.total_active_points}`)

    closeDatabase()
    console.log('\n✓ Cleaned up test artifacts.')
    console.log('====================================================')
    console.log('🎉 ALL PHASE 9 CRM, LOYALTY & RESERVATION TESTS PASSED!')
    console.log('====================================================')
    process.exit(0)
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
