import path from 'node:path'
import fs from 'node:fs'
import { initDatabase, getDb, closeDatabase } from '../electron/db/index.js'
import { authRepository } from '../electron/db/repositories/authRepository.js'
import { reportsRepository } from '../electron/db/repositories/reportsRepository.js'
import { settingsRepository } from '../electron/db/repositories/settingsRepository.js'
import { orderRepository } from '../electron/db/repositories/orderRepository.js'

async function runTests() {
  console.log('====================================================')
  console.log('🧪 Starting Phase 11: Reports, Analytics & Settings Test Suite')
  console.log('====================================================')

  const testDbDir = path.resolve(process.cwd(), 'test_reports_scratch')
  const testDbPath = path.join(testDbDir, 'test_reports.sqlite')

  if (fs.existsSync(testDbDir)) {
    fs.rmSync(testDbDir, { recursive: true, force: true })
  }
  fs.mkdirSync(testDbDir, { recursive: true })

  try {
    // ------------------------------------------------------------------
    console.log('\n--- Test 1: Initialize Database & Seed Operational Data ---')
    initDatabase({ dbPath: testDbPath, seed: true })
    const db = getDb()

    const branch = db.prepare('SELECT id, name FROM branches LIMIT 1').get()
    console.log(`✓ Database connected to branch: ${branch.name}`)

    const adminUser = db.prepare("SELECT * FROM users WHERE username = 'admin'").get()
    authRepository.loginWithPin('1234', adminUser.id)
    console.log(`✓ Authenticated as: ${adminUser.display_name}`)

    // Create a sample completed order to ensure report data
    const product = db.prepare('SELECT * FROM products LIMIT 1').get()
    const orderData = {
      branchId: branch.id,
      cashierId: adminUser.id,
      orderNumber: `ORD-REP-${Date.now().toString().slice(-4)}`,
      orderType: 'DINE_IN',
      orderSource: 'POS',
      items: [
        {
          productId: product.id,
          name: product.name,
          quantity: 3,
          unitPriceCents: product.base_price_cents,
          totalCents: product.base_price_cents * 3,
        },
      ],
      subtotalCents: product.base_price_cents * 3,
      discountCents: 200,
      discountReason: 'Loyalty Promo',
      taxCents: Math.round((product.base_price_cents * 3 * 0.05)),
      totalCents: (product.base_price_cents * 3) - 200 + Math.round((product.base_price_cents * 3 * 0.05)),
      paidCents: (product.base_price_cents * 3) - 200 + Math.round((product.base_price_cents * 3 * 0.05)),
      status: 'COMPLETED',
    }
    const testOrder = orderRepository.createOrder(orderData)

    // Record payment
    db.prepare(`
      INSERT INTO payments (
        id, order_id, branch_id, cashier_id, payment_method,
        amount_cents, status, created_at
      ) VALUES (?, ?, ?, ?, 'CASH', ?, 'COMPLETED', ?)
    `).run(
      crypto.randomUUID(),
      testOrder.id,
      branch.id,
      adminUser.id,
      testOrder.total_cents,
      new Date().toISOString()
    )

    console.log(`✓ Sample completed order created: ${testOrder.order_number} ($${(testOrder.total_cents / 100).toFixed(2)})`)

    // ------------------------------------------------------------------
    console.log('\n--- Test 2: Sales Summary Report ---')
    const summary = reportsRepository.getSalesSummary(branch.id)
    console.log(`✓ Sales Summary:`)
    console.log(`   - Total Orders: ${summary.overall.total_orders}`)
    console.log(`   - Total Sales: $${(summary.overall.total_sales_cents / 100).toFixed(2)}`)
    console.log(`   - Average Order: $${(summary.overall.average_order_cents / 100).toFixed(2)}`)
    console.log(`   - Total Discounts: $${(summary.overall.total_discount_cents / 100).toFixed(2)}`)
    if (summary.overall.total_orders === 0) throw new Error('Expected at least 1 order.')

    // ------------------------------------------------------------------
    console.log('\n--- Test 3: Product Performance & Category Breakdown ---')
    const prodPerf = reportsRepository.getProductPerformance(branch.id)
    console.log(`✓ Product Performance: Found ${prodPerf.items.length} sold items`)
    prodPerf.items.forEach((item) => {
      console.log(`   - ${item.item_name} | Qty Sold: ${item.total_quantity_sold} | Revenue: $${(item.total_revenue_cents / 100).toFixed(2)}`)
    })
    console.log(`✓ Category Breakdown: Found ${prodPerf.categoryBreakdown.length} categories`)

    // ------------------------------------------------------------------
    console.log('\n--- Test 4: Hourly Rush Breakdown ---')
    const hourly = reportsRepository.getHourlyBreakdown(branch.id)
    console.log(`✓ Hourly Breakdown: 24 slots generated (Slots with sales: ${hourly.filter(h => h.orderCount > 0).length})`)
    if (hourly.length !== 24) throw new Error('Expected 24 hour slots.')

    // ------------------------------------------------------------------
    console.log('\n--- Test 5: Profit & Loss Statement ---')
    const pnl = reportsRepository.getProfitAndLoss(branch.id)
    console.log(`✓ Profit & Loss:`)
    console.log(`   - Gross Revenue: $${(pnl.revenueCents / 100).toFixed(2)}`)
    console.log(`   - Cost of Goods Sold (COGS): $${(pnl.cogsCents / 100).toFixed(2)}`)
    console.log(`   - Operating Expenses: $${(pnl.expensesCents / 100).toFixed(2)}`)
    console.log(`   - Net Profit: $${(pnl.netProfitCents / 100).toFixed(2)} (Margin: ${pnl.marginPercent}%)`)

    // ------------------------------------------------------------------
    console.log('\n--- Test 6: Void & Discount Audit Logs ---')
    const audits = reportsRepository.getVoidAndRefundAudits(branch.id)
    console.log(`✓ Audits: Discounted Orders: ${audits.discountedOrders.length} | Void Orders: ${audits.voidOrders.length}`)
    if (audits.discountedOrders.length === 0) throw new Error('Expected at least 1 discounted order.')

    // ------------------------------------------------------------------
    console.log('\n--- Test 7: System Settings Read & Batch Update ---')
    const initialSettings = settingsRepository.getAll()
    console.log(`✓ System Settings loaded: ${Object.keys(initialSettings).length} settings keys present`)

    settingsRepository.set('tax_rate_percentage', '7.5', 'FINANCIAL')
    settingsRepository.set('receipt_footer_msg', 'Thank you for dining at Gourmet Plaza!', 'RECEIPT')
    const updatedTax = settingsRepository.get('tax_rate_percentage')
    console.log(`✓ Updated tax_rate_percentage: ${updatedTax}%`)
    if (updatedTax !== '7.5') throw new Error('Expected tax rate 7.5.')

    // ------------------------------------------------------------------
    console.log('\n--- Test 8: System Audit Logs ---')
    const auditLogs = reportsRepository.getAuditLogs(branch.id, 10)
    console.log(`✓ Audit Logs: Retrieved ${auditLogs.length} audit entries`)

    console.log('\n====================================================')
    console.log('🎉 ALL PHASE 11 REPORTS, ANALYTICS & SETTINGS TESTS PASSED!')
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
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err)
  process.exit(1)
})
