import path from 'node:path'
import fs from 'node:fs'
import { initDatabase, closeDatabase, getDb } from '../electron/db/index.js'
import { authRepository, hashSecret, verifySecret } from '../electron/db/repositories/authRepository.js'
import { dashboardRepository } from '../electron/db/repositories/dashboardRepository.js'
import { orderRepository } from '../electron/db/repositories/orderRepository.js'

async function runAuthAndDashboardTests() {
  console.log('====================================================')
  console.log('🧪 Starting Phase 3: Auth, RBAC & Dashboard Test Suite')
  console.log('====================================================')

  const testDir = path.resolve(process.cwd(), 'test_auth_scratch')
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true })
  const testDbPath = path.join(testDir, 'test_auth.sqlite')

  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath)
  if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`)
  if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`)

  // 1. Initialize DB with Seeds
  console.log('\n--- Test 1: Initialize Database & Verify Seeded Users ---')
  const db = initDatabase({ dbPath: testDbPath, seed: true })
  const users = authRepository.getLoginUsers()
  console.log(`✓ Seeded Staff Users (${users.length}): ${users.map((u) => `${u.displayName} (${u.role_code})`).join(', ')}`)
  if (users.length < 4) throw new Error('Expected at least 4 seeded staff users!')

  // 2. Timing-Safe Hashing Test
  console.log('\n--- Test 2: Password and PIN Scrypt Hashing ---')
  const testSecret = 'superSecretPin99'
  const hashed = hashSecret(testSecret)
  console.log(`✓ Generated Scrypt Hash: ${hashed.slice(0, 30)}...`)
  if (!verifySecret(testSecret, hashed)) throw new Error('Valid secret verification failed!')
  if (verifySecret('wrongSecret', hashed)) throw new Error('Invalid secret falsely succeeded!')
  console.log('✓ Timing-safe hash validation passed successfully')

  // 3. Password Login Test (Super Admin)
  console.log('\n--- Test 3: Password Authentication for Administrator ---')
  const adminSession = authRepository.loginWithPassword('admin', 'admin123')
  console.log(`✓ Admin Logged In: ${adminSession.displayName}, Role: ${adminSession.roleCode}`)
  console.log(`✓ Super Admin Permissions Count: ${adminSession.permissions.length}`)
  if (adminSession.roleCode !== 'super_admin') throw new Error('Role mismatch for admin!')
  if (!authRepository.hasPermission('settings:manage')) throw new Error('Admin should have settings:manage!')

  // 4. Failed Login Protection
  console.log('\n--- Test 4: Password Mismatch Rejection ---')
  let loginFailed = false
  try {
    authRepository.loginWithPassword('admin', 'wrong_password')
  } catch (e) {
    loginFailed = true
    console.log(`✓ Rejected wrong password: ${e.message}`)
  }
  if (!loginFailed) throw new Error('Wrong password was not rejected!')

  // 5. Quick PIN Login Test (Cashier)
  console.log('\n--- Test 5: Quick-PIN Authentication (Cashier) ---')
  const cashierUser = users.find((u) => u.role_code === 'cashier')
  const cashierSession = authRepository.loginWithPin('0000', cashierUser.id)
  console.log(`✓ Cashier Logged In via PIN: ${cashierSession.displayName}, Role: ${cashierSession.roleCode}`)
  if (!authRepository.hasPermission('pos:create_order')) throw new Error('Cashier should have pos:create_order!')
  if (authRepository.hasPermission('settings:manage')) throw new Error('Cashier should NOT have settings:manage!')

  // 6. Audit Logging Verification
  console.log('\n--- Test 6: Audit Log Recording ---')
  authRepository.logout()
  const auditEntries = db.prepare('SELECT action, entity_type, details_json, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 5').all()
  console.log(`✓ Recent Audit Logs (${auditEntries.length}):`)
  for (const a of auditEntries) {
    console.log(`   - [${a.action}] on ${a.entity_type}: ${a.details_json}`)
  }
  if (!auditEntries.some((a) => a.action === 'LOGIN') || !auditEntries.some((a) => a.action === 'LOGOUT')) {
    throw new Error('Audit logs missing login or logout entries!')
  }

  // 7. Dashboard Real Metrics Aggregation
  console.log('\n--- Test 7: Dashboard Real SQLite Metrics Calculation ---')
  const branch = db.prepare('SELECT id FROM branches LIMIT 1').get()
  const product = db.prepare('SELECT id, name, base_price_cents FROM products LIMIT 1').get()
  const table = db.prepare('SELECT id FROM dining_tables LIMIT 1').get()

  // Create 2 test orders in SQLite
  orderRepository.createOrder({
    branchId: branch.id,
    tableId: table.id,
    orderType: 'DINE_IN',
    subtotalCents: 2000,
    taxCents: 100,
    totalCents: 2100,
    items: [{ productId: product.id, name: product.name, quantity: 2, unitPriceCents: product.base_price_cents, totalCents: 2000 }],
  })

  orderRepository.createOrder({
    branchId: branch.id,
    orderType: 'TAKEAWAY',
    subtotalCents: 1500,
    taxCents: 75,
    totalCents: 1575,
    items: [{ productId: product.id, name: product.name, quantity: 1, unitPriceCents: product.base_price_cents, totalCents: 1500 }],
  })

  const metrics = dashboardRepository.getMetrics(branch.id, 'today')
  console.log(`✓ Today Total Orders: ${metrics.sales.totalOrders}`)
  console.log(`✓ Gross Sales: $${(metrics.sales.grossSalesCents / 100).toFixed(2)}`)
  console.log(`✓ Average Order Value: $${(metrics.sales.avgOrderCents / 100).toFixed(2)}`)
  console.log(`✓ Dine-In Orders: ${metrics.ordersByType.DINE_IN.count}, Takeaway: ${metrics.ordersByType.TAKEAWAY.count}`)
  console.log(`✓ Top Product: ${metrics.topProducts[0]?.name} (${metrics.topProducts[0]?.total_quantity} sold)`)

  if (metrics.sales.totalOrders !== 2) throw new Error(`Expected 2 orders, got ${metrics.sales.totalOrders}`)
  if (metrics.sales.grossSalesCents !== 3675) throw new Error(`Expected gross sales 3675, got ${metrics.sales.grossSalesCents}`)

  // Clean up
  closeDatabase()
  try {
    fs.rmSync(testDir, { recursive: true, force: true })
    console.log('✓ Cleaned up test artifacts.')
  } catch (e) {}

  console.log('\n====================================================')
  console.log('🎉 ALL PHASE 3 AUTH & DASHBOARD TESTS PASSED!')
  console.log('====================================================')
}

runAuthAndDashboardTests().then(() => {
  process.exit(0)
}).catch((err) => {
  console.error('\n❌ Test failed with error:', err)
  process.exit(1)
})

