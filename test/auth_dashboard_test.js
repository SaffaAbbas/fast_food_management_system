import path from 'node:path'
import fs from 'node:fs'
import { initDatabase, closeDatabase, getDb } from '../electron/db/index.js'
import { authRepository, hashSecret, verifySecret, setSignupMailer } from '../electron/db/repositories/authRepository.js'
import { requireSession } from '../electron/ipc/authGuard.js'
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

  console.log('\n--- Test 8: Initial setup cannot be repeated ---')
  let setupBlocked = false
  try {
    authRepository.completeInitialSetup({
      restaurantName: 'Hacked',
      username: 'hacker',
      displayName: 'Hacker',
      password: 'password123',
      pin: '9999',
    })
  } catch (e) {
    setupBlocked = true
    console.log(`✓ Repeat setup blocked: ${e.message}`)
  }
  if (!setupBlocked) throw new Error('Initial setup was allowed after users already exist!')

  console.log('\n--- Test 9: Email signup, OTP, session token, logout, and expiry ---')
  let mailed = null
  setSignupMailer(async (message) => {
    mailed = message
  })
  const cashierRole = db.prepare("SELECT id FROM roles WHERE code = 'cashier'").get()
  let rejected = false
  try {
    await authRepository.requestSignup({
      username: 'ab',
      email: 'not-an-email',
      password: 'short',
      confirmPassword: 'short',
      roleId: cashierRole.id,
    })
  } catch (err) {
    rejected = true
    console.log(`✓ Signup validation rejected bad input: ${err.message}`)
  }
  if (!rejected) throw new Error('Invalid signup was accepted')

  const signup = await authRepository.requestSignup({
    username: 'NewCashier',
    email: 'new.cashier@example.com',
    password: 'cashier123',
    confirmPassword: 'cashier123',
    roleId: cashierRole.id,
  })
  if (!signup.delivered || !mailed?.code) throw new Error('Signup did not send a verification code')
  console.log(`✓ OTP prepared for ${signup.email}`)

  let wrongOtp = false
  try {
    authRepository.verifySignupOtp({ email: signup.email, otp: mailed.code === '000000' ? '111111' : '000000' })
  } catch (err) {
    wrongOtp = true
  }
  if (!wrongOtp) throw new Error('Wrong OTP was accepted')

  const verified = authRepository.verifySignupOtp({ email: signup.email, otp: mailed.code })
  if (verified.username !== 'newcashier') throw new Error('Verified username was not normalized')
  if (authRepository.getCurrentSession()) throw new Error('OTP verification should not sign the user in')
  console.log('✓ OTP verified and account created without a session')

  const signedIn = authRepository.loginWithPassword('newcashier', 'cashier123')
  if (!signedIn.token || !signedIn.expiresAt) throw new Error('Login did not issue an expiring token')
  if (signedIn.roleCode !== 'cashier') throw new Error('Signup role was not applied')
  const restored = authRepository.getCurrentSession(signedIn.token)
  if (restored?.id !== signedIn.id) throw new Error('Token did not restore the session')
  console.log(`✓ Session token expires at ${signedIn.expiresAt}`)

  db.prepare('UPDATE auth_sessions SET expires_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', signedIn.sessionId)
  let expired = false
  try {
    requireSession()
  } catch (err) {
    expired = /session expired/i.test(err.message)
    console.log(`✓ Expired token rejected: ${err.message}`)
  }
  if (!expired) throw new Error('Expired session was still accepted')

  const again = authRepository.loginWithPassword('newcashier', 'cashier123')
  authRepository.logout(again.token)
  if (authRepository.getCurrentSession(again.token)) throw new Error('Logged-out token was still accepted')
  console.log('✓ Logout revoked the session token')

  console.log('\n--- Test 10: Password signup without OTP ---')
  const waiterRole = db.prepare("SELECT id FROM roles WHERE code = 'waiter'").get()
  const created = authRepository.signup({
    username: 'FloorWaiter',
    email: 'floor.waiter@example.com',
    password: 'waiter123',
    confirmPassword: 'waiter123',
    roleId: waiterRole.id,
  })
  if (created.username !== 'floorwaiter') throw new Error('Direct signup did not create the username')
  if (authRepository.getCurrentSession()) throw new Error('Direct signup must not sign the user in')
  const waiterSession = authRepository.loginWithPassword('floorwaiter', 'waiter123')
  if (waiterSession.roleCode !== 'waiter') throw new Error('Direct signup role was not applied')
  authRepository.logout(waiterSession.token)
  console.log('✓ Password signup created the account and login worked')

  let duplicateEmail = false
  try {
    authRepository.signup({
      username: 'AnotherWaiter',
      email: 'Floor.Waiter@example.com',
      password: 'waiter123',
      confirmPassword: 'waiter123',
      roleId: waiterRole.id,
    })
  } catch (err) {
    duplicateEmail = err.message === 'Email already registered.'
    console.log(`✓ Duplicate email rejected: ${err.message}`)
  }
  if (!duplicateEmail) throw new Error('Duplicate email was not rejected')

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

