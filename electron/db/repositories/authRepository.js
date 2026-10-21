import crypto from 'node:crypto'
import { getDb } from '../index.js'

let currentSession = null

/**
 * Timing-safe scrypt hashing for passwords and PINs
 */
export function hashSecret(secret) {
  if (!secret) return null
  const salt = crypto.randomBytes(16).toString('hex')
  const derivedKey = crypto.scryptSync(secret, salt, 64)
  return `${salt}:${derivedKey.toString('hex')}`
}

/**
 * Timing-safe verification of password or PIN
 */
export function verifySecret(secret, storedHash) {
  if (!secret || !storedHash || !storedHash.includes(':')) return false
  try {
    const [salt, key] = storedHash.split(':')
    const keyBuffer = Buffer.from(key, 'hex')
    const derivedKey = crypto.scryptSync(secret, salt, 64)
    if (keyBuffer.length !== derivedKey.length) return false
    return crypto.timingSafeEqual(keyBuffer, derivedKey)
  } catch (err) {
    return false
  }
}

export const authRepository = {
  /**
   * Get active user session
   */
  getCurrentSession: () => {
    return currentSession
  },

  /**
   * Clear active user session (Logout)
   */
  logout: () => {
    if (currentSession) {
      const db = getDb()
      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
        VALUES (?, ?, ?, 'LOGOUT', 'USER', ?, ?, ?)
      `).run(crypto.randomUUID(), currentSession.branchId, currentSession.id, currentSession.id, JSON.stringify({ username: currentSession.username }), now)
    }
    currentSession = null
    return { success: true }
  },

  /**
   * Authenticate user via username and password
   */
  loginWithPassword: (username, password) => {
    const db = getDb()
    const now = new Date().toISOString()

    const user = db.prepare(`
      SELECT u.id, u.branch_id, u.role_id, u.username, u.display_name,
             u.password_hash, u.pin_hash, u.is_active,
             COALESCE(r.code, 'cashier') as role_code,
             COALESCE(r.name, 'Staff Member') as role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE LOWER(u.username) = LOWER(?) AND u.is_active = 1
    `).get(username)

    if (!user) {
      logAudit(null, 'FAILED_LOGIN', 'USER', null, { reason: 'User not found', username })
      throw new Error('Invalid username or credentials.')
    }

    // Verify password hash
    const isValid = verifySecret(password, user.password_hash)
    if (!isValid) {
      logAudit(user.branch_id, 'FAILED_LOGIN', 'USER', user.id, { reason: 'Password mismatch', username })
      throw new Error('Invalid password.')
    }

    return createSessionForUser(user, 'PASSWORD')
  },

  /**
   * Quick-PIN login (fast cashier / waiter authentication)
   */
  loginWithPin: (pin, userId = null, username = null) => {
    const db = getDb()

    let query = `
      SELECT u.id, u.branch_id, u.role_id, u.username, u.display_name,
             u.password_hash, u.pin_hash, u.is_active,
             COALESCE(r.code, 'cashier') as role_code,
             COALESCE(r.name, 'Staff Member') as role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.is_active = 1
    `
    const params = []

    if (userId || username) {
      const cleanUser = (userId || '').replace(/^usr-/, '')
      query += ' AND (u.id = ? OR LOWER(u.username) = LOWER(?) OR LOWER(u.username) = LOWER(?))'
      params.push(userId || '', username || userId || '', cleanUser)
    }

    let users = db.prepare(query).all(...params)

    // Fallback: If no user found by ID/username, check all active users by PIN
    if (users.length === 0) {
      users = db.prepare(`
        SELECT u.id, u.branch_id, u.role_id, u.username, u.display_name,
               u.password_hash, u.pin_hash, u.is_active,
               COALESCE(r.code, 'cashier') as role_code,
               COALESCE(r.name, 'Staff Member') as role_name
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.is_active = 1
      `).all()
    }

    let authenticatedUser = null
    for (const u of users) {
      if (verifySecret(pin, u.pin_hash)) {
        authenticatedUser = u
        break
      }
    }

    if (!authenticatedUser) {
      logAudit(null, 'FAILED_LOGIN', 'USER', null, { reason: 'Invalid PIN' })
      throw new Error('Invalid PIN code.')
    }

    return createSessionForUser(authenticatedUser, 'PIN')
  },

  /**
   * Get all active users with their roles (for switch user / fast PIN login UI)
   */
  getLoginUsers: () => {
    const db = getDb()
    return db.prepare(`
      SELECT u.id, u.username, u.display_name as displayName,
             COALESCE(r.code, 'cashier') as role_code,
             COALESCE(r.name, 'Staff Member') as role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.is_active = 1
      ORDER BY u.display_name ASC
    `).all()
  },

  /**
   * Check if a specific permission is granted to current user
   */
  hasPermission: (permissionCode) => {
    if (!currentSession) return false
    if (currentSession.roleCode === 'super_admin') return true
    return currentSession.permissions.includes(permissionCode)
  },

  /**
   * Create a new staff user with hashed credentials
   */
  createUser: ({ branchId, roleId, username, displayName, password, pin }) => {
    const db = getDb()
    const now = new Date().toISOString()
    const userId = crypto.randomUUID()

    const passwordHash = password ? hashSecret(password) : null
    const pinHash = pin ? hashSecret(pin) : null

    db.prepare(`
      INSERT INTO users (id, branch_id, role_id, username, display_name, password_hash, pin_hash, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(userId, branchId, roleId, username, displayName, passwordHash, pinHash, now, now)

    logAudit(branchId, 'CREATE_USER', 'USER', userId, { username, roleId })

    return { id: userId, username, displayName }
  },

  /**
   * Set user PIN (hashed)
   */
  setUserPin: (userId, newPin) => {
    const db = getDb()
    const now = new Date().toISOString()
    const hashed = hashSecret(newPin)
    db.prepare('UPDATE users SET pin_hash = ?, updated_at = ? WHERE id = ?').run(hashed, now, userId)
    return true
  },

  /**
   * Set user Password (hashed)
   */
  setUserPassword: (userId, newPassword) => {
    const db = getDb()
    const now = new Date().toISOString()
    const hashed = hashSecret(newPassword)
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashed, now, userId)
    return true
  },
}

function createSessionForUser(user, method) {
  const db = getDb()
  const now = new Date().toISOString()

  // Fetch all granted permission codes for this role
  const permissions = db.prepare(`
    SELECT p.code
    FROM permissions p
    JOIN role_permissions rp ON p.id = rp.permission_id
    WHERE rp.role_id = ?
  `).all(user.role_id).map((r) => r.code)

  // Update last_login_at
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, user.id)

  // Branch info
  const branch = user.branch_id
    ? db.prepare('SELECT id, name, code, currency_symbol FROM branches WHERE id = ?').get(user.branch_id)
    : db.prepare('SELECT id, name, code, currency_symbol FROM branches LIMIT 1').get()

  currentSession = {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    roleId: user.role_id,
    roleCode: user.role_code,
    roleName: user.role_name,
    branchId: branch?.id,
    branchName: branch?.name,
    currencySymbol: branch?.currency_symbol || '$',
    permissions,
    loginAt: now,
    method,
  }

  logAudit(branch?.id, 'LOGIN', 'USER', user.id, { method, role: user.role_code })

  return currentSession
}

function logAudit(branchId, action, entityType, entityId, details) {
  try {
    const db = getDb()
    let validUserId = null
    if (currentSession?.id) {
      const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(currentSession.id)
      if (exists) validUserId = currentSession.id
    }
    db.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      branchId || null,
      validUserId,
      action,
      entityType,
      entityId,
      JSON.stringify(details),
      new Date().toISOString()
    )
  } catch (e) {
    console.error('[Audit Log] Failed to record audit:', e)
  }
}
