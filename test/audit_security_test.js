import path from 'node:path'
import fs from 'node:fs'
import { initDatabase, getDb, closeDatabase } from '../electron/db/index.js'
import { authRepository } from '../electron/db/repositories/authRepository.js'
import { reportsRepository } from '../electron/db/repositories/reportsRepository.js'
import { orderRepository } from '../electron/db/repositories/orderRepository.js'
import { staffRepository } from '../electron/db/repositories/staffRepository.js'
import { sanitizeDetails, redactAuditRow } from '../electron/db/auditLog.js'

async function run() {
  const dir = path.resolve(process.cwd(), 'test_audit_scratch')
  const dbPath = path.join(dir, 'audit.sqlite')
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })

  try {
    initDatabase({ dbPath, seed: true })
    const db = getDb()
    const version = db.prepare('SELECT MAX(version) as v FROM schema_migrations').get()
    if (version.v < 19) throw new Error(`Expected v19+, got ${version.v}`)
    const admin = db.prepare("SELECT * FROM users WHERE username = 'admin'").get()
    authRepository.loginWithPin('1234', admin.id)
    const branch = db.prepare('SELECT id FROM branches LIMIT 1').get()

    const login = db.prepare("SELECT * FROM audit_logs WHERE action = 'LOGIN' ORDER BY created_at DESC LIMIT 1").get()
    if (!login || !login.user_id || !login.created_at) throw new Error('LOGIN must record user and timestamp')
    console.log('✓ login recorded')

    authRepository.logout()
    const logout = db.prepare("SELECT * FROM audit_logs WHERE action = 'LOGOUT' ORDER BY created_at DESC LIMIT 1").get()
    if (!logout) throw new Error('LOGOUT missing')
    console.log('✓ logout recorded')

    authRepository.loginWithPin('1234', admin.id)
    const product = db.prepare('SELECT * FROM products LIMIT 1').get()
    orderRepository.createOrder({
      branchId: branch.id,
      cashierId: admin.id,
      orderType: 'TAKEAWAY',
      status: 'CONFIRMED',
      subtotalCents: 2000,
      discountCents: 200,
      discountReason: 'Manager override',
      taxCents: 0,
      totalCents: 1800,
      paidCents: 1800,
      items: [{ productId: product.id, name: product.name, quantity: 1, unitPriceCents: 2000, totalCents: 2000 }],
    })
    const disc = db.prepare("SELECT * FROM audit_logs WHERE action = 'DISCOUNT_OVERRIDE' ORDER BY created_at DESC LIMIT 1").get()
    if (!disc || !disc.entity_id) throw new Error('discount override not logged')
    console.log('✓ discount override recorded')

    const dirty = sanitizeDetails({ password: 'secret', pin: '1234', amount: 5 })
    if (dirty.password !== '[redacted]' || dirty.pin !== '[redacted]' || dirty.amount !== 5) {
      throw new Error('sanitizeDetails failed')
    }
    const restricted = redactAuditRow({ action: 'FAILED_LOGIN', details_json: JSON.stringify({ username: 'x' }) }, { fullAccess: false })
    if (!String(restricted.details_json).includes('restricted')) throw new Error('failed login details leaked')
    console.log('✓ secrets redacted without audit permission')

    const role = db.prepare("SELECT id FROM roles WHERE code = 'cashier'").get()
    const user = db.prepare("SELECT * FROM users WHERE username = 'admin'").get()
    if (role) {
      staffRepository.updateUser(user.id, {
        displayName: user.display_name,
        roleId: user.role_id,
        isActive: true,
      })
    }
    const logs = reportsRepository.getAuditLogs(branch.id, { fullAccess: true, limit: 20 })
    const sample = logs[0]
    if (!sample.action || !sample.created_at) throw new Error('audit row missing action/timestamp')
    console.log(`✓ audit list ${logs.length} rows with user/action/time`)

    console.log('All audit/security checks passed.')
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  } finally {
    closeDatabase()
  }
}

run()
