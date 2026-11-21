import crypto from 'node:crypto'
import { getDb } from '../index.js'
import { sanitizeDetails } from '../auditLog.js'
import { settingsRepository } from './settingsRepository.js'
import { getPublicMailStatus, sendSignupOtpEmail } from '../../mail/otpMailer.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000
const OTP_TTL_MS = 10 * 60 * 1000
const OTP_MAX_ATTEMPTS = 5
const OTP_RESEND_COOLDOWN_MS = 30 * 1000

const USER_SQL = `
  SELECT u.id, u.branch_id, u.role_id, u.username, u.display_name, u.email,
         u.password_hash, u.pin_hash, u.is_active,
         COALESCE(r.code, 'cashier') as role_code,
         COALESCE(r.name, 'Staff Member') as role_name
  FROM users u
  LEFT JOIN roles r ON u.role_id = r.id
`

let currentSession = null
let lastSessionState = 'none'
let sendSignupOtp = sendSignupOtpEmail

export function setSignupMailer(fn) {
  sendSignupOtp = fn || sendSignupOtpEmail
}

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
  } catch {
    return false
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0')
}

export const authRepository = {
  getLastSessionState: () => lastSessionState,

  getCurrentSession: (token) => {
    const explicitEmpty = token === null || token === ''
    return resolveSession(explicitEmpty ? '' : token, { allowMemory: !explicitEmpty })
  },

  logout: (token) => {
    const db = getDb()
    const now = new Date().toISOString()
    const raw = typeof token === 'string' && token ? token : currentSession?.token
    if (raw) {
      db.prepare(`
        UPDATE auth_sessions
        SET revoked_at = ?
        WHERE token_hash = ? AND revoked_at IS NULL
      `).run(now, hashToken(raw))
    }
    const actor = currentSession && (!raw || currentSession.token === raw) ? currentSession : null
    if (actor) {
      try {
        db.prepare(`
          INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
          VALUES (?, ?, ?, 'LOGOUT', 'USER', ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          actor.branchId || null,
          actor.id,
          actor.id,
          JSON.stringify({ username: actor.username }),
          now
        )
      } catch (err) {
        console.error('[Auth] Failed to record logout:', err.message)
      }
    }
    if (!currentSession || !raw || currentSession.token === raw) {
      currentSession = null
      lastSessionState = 'none'
    }
    return { success: true }
  },

  loginWithPassword: (username, password) => {
    const db = getDb()
    const user = db.prepare(`
      ${USER_SQL}
      WHERE LOWER(u.username) = LOWER(?) AND u.is_active = 1
    `).get(String(username || '').trim())

    if (!user || !user.password_hash || !verifySecret(password, user.password_hash)) {
      logAudit(user?.branch_id || null, 'FAILED_LOGIN', 'USER', user?.id || null, {
        reason: 'Password mismatch',
        username: String(username || '').trim(),
      })
      throw new Error('Invalid username or password.')
    }

    return issueSession(user, 'PASSWORD')
  },

  /**
   * Kept for existing staff PIN checks and tests. The sign-in screen does not use it.
   */
  loginWithPin: (pin, userId = null, username = null) => {
    const db = getDb()
    let query = `${USER_SQL} WHERE u.is_active = 1`
    const params = []

    if (userId || username) {
      const cleanUser = (userId || '').replace(/^usr-/, '')
      query += ' AND (u.id = ? OR LOWER(u.username) = LOWER(?) OR LOWER(u.username) = LOWER(?))'
      params.push(userId || '', username || userId || '', cleanUser)
    }

    const users = db.prepare(query).all(...params)
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

    return issueSession(authenticatedUser, 'PIN')
  },

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

  listRoles: () => {
    const db = getDb()
    return db.prepare(`
      SELECT id, code, name, description
      FROM roles
      ORDER BY name ASC
    `).all()
  },

  getMailStatus: () => getPublicMailStatus(),

  saveMailConfig: ({ host, port, user, pass, from }) => {
    const cleanHost = String(host || '').trim()
    const cleanUser = String(user || '').trim()
    const cleanFrom = String(from || '').trim()
    const cleanPort = Number(port || 587)
    const existingPass = settingsRepository.get('smtp_pass') || ''
    const cleanPass = String(pass || '') || existingPass
    if (!cleanHost || !cleanUser || !cleanFrom || !cleanPass) {
      throw new Error('Email server host, username, password, and from address are required.')
    }
    if (!EMAIL_RE.test(cleanFrom)) {
      throw new Error('From address must be a valid email.')
    }
    if (!Number.isInteger(cleanPort) || cleanPort < 1 || cleanPort > 65535) {
      throw new Error('Email server port must be between 1 and 65535.')
    }
    settingsRepository.set('smtp_host', cleanHost, 'EMAIL')
    settingsRepository.set('smtp_port', String(cleanPort), 'EMAIL')
    settingsRepository.set('smtp_user', cleanUser, 'EMAIL')
    settingsRepository.set('smtp_pass', cleanPass, 'EMAIL')
    settingsRepository.set('smtp_from', cleanFrom, 'EMAIL')
    logAudit(null, 'UPDATE_SETTINGS', 'SETTINGS', 'smtp', { smtp_host: cleanHost, smtp_user: cleanUser })
    return getPublicMailStatus()
  },

  signup: (input) => {
    const { username, displayName, email, password, roleId } = validateSignup(input)
    const db = getDb()
    const role = db.prepare('SELECT id FROM roles WHERE id = ?').get(roleId)
    if (!role) throw new Error('Select a valid role.')
    assertIdentityAvailable(db, username, email)

    const now = new Date().toISOString()
    const userId = crypto.randomUUID()
    const create = db.transaction(() => {
      const branchId = ensureBranch(db, now)
      db.prepare(`
        INSERT INTO users (
          id, branch_id, role_id, username, display_name, email, email_verified,
          password_hash, pin_hash, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL, 1, ?, ?)
      `).run(
        userId,
        branchId,
        roleId,
        username,
        displayName,
        email,
        hashSecret(password),
        now,
        now
      )
    })
    try {
      create()
    } catch (err) {
      const message = String(err?.message || '')
      if (/idx_users_email_lower|users\.email/i.test(message)) throw new Error('Email already registered.')
      if (/unique/i.test(message) && /username/i.test(message)) throw new Error('That username is already in use.')
      throw err
    }
    logAudit(null, 'CREATE_USER', 'USER', userId, { username, email, roleId, via: 'signup' })
    return { ok: true, username }
  },

  requestSignup: async (input) => {
    const { username, displayName, email, password, roleId } = validateSignup(input)
    const db = getDb()
    const role = db.prepare('SELECT id, name FROM roles WHERE id = ?').get(roleId)
    if (!role) throw new Error('Select a valid role.')
    assertIdentityAvailable(db, username, email)

    const now = new Date()
    const code = generateOtp()
    const id = crypto.randomUUID()
    db.prepare('DELETE FROM signup_otps WHERE email = ? OR username = ?').run(email, username)
    db.prepare(`
      INSERT INTO signup_otps (
        id, username, display_name, email, password_hash, role_id, otp_hash, expires_at, attempts, created_at, resend_available_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      id,
      username,
      displayName,
      email,
      hashSecret(password),
      roleId,
      hashSecret(code),
      new Date(now.getTime() + OTP_TTL_MS).toISOString(),
      now.toISOString(),
      new Date(now.getTime() + OTP_RESEND_COOLDOWN_MS).toISOString()
    )

    try {
      await sendSignupOtp({ to: email, code, username: displayName })
    } catch (err) {
      db.prepare('DELETE FROM signup_otps WHERE id = ?').run(id)
      throw err
    }

    logAudit(null, 'SIGNUP_OTP', 'USER', null, { email, username })
    return { ok: true, email, expiresInSeconds: OTP_TTL_MS / 1000, delivered: true }
  },

  resendSignupOtp: async ({ email }) => {
    const cleanEmail = String(email || '').trim().toLowerCase()
    if (!EMAIL_RE.test(cleanEmail)) throw new Error('Enter a valid email address.')
    const db = getDb()
    const pending = db.prepare('SELECT * FROM signup_otps WHERE email = ?').get(cleanEmail)
    if (!pending) throw new Error('No verification is waiting for this email. Sign up again.')
    if (new Date(pending.resend_available_at).getTime() > Date.now()) {
      throw new Error('Please wait before requesting another code.')
    }

    const now = new Date()
    const code = generateOtp()
    db.prepare(`
      UPDATE signup_otps
      SET otp_hash = ?, expires_at = ?, attempts = 0, created_at = ?, resend_available_at = ?
      WHERE id = ?
    `).run(
      hashSecret(code),
      new Date(now.getTime() + OTP_TTL_MS).toISOString(),
      now.toISOString(),
      new Date(now.getTime() + OTP_RESEND_COOLDOWN_MS).toISOString(),
      pending.id
    )

    try {
      await sendSignupOtp({ to: cleanEmail, code, username: pending.display_name || pending.username })
    } catch (err) {
      db.prepare(`
        UPDATE signup_otps
        SET otp_hash = ?, expires_at = ?, attempts = ?, created_at = ?, resend_available_at = ?
        WHERE id = ?
      `).run(
        pending.otp_hash,
        pending.expires_at,
        pending.attempts,
        pending.created_at,
        pending.resend_available_at,
        pending.id
      )
      throw err
    }
    return { ok: true, email: cleanEmail, expiresInSeconds: OTP_TTL_MS / 1000, delivered: true }
  },

  verifySignupOtp: ({ email, otp }) => {
    const cleanEmail = String(email || '').trim().toLowerCase()
    const code = String(otp || '').trim()
    if (!EMAIL_RE.test(cleanEmail)) throw new Error('Enter a valid email address.')
    if (!/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit code from your email.')

    const db = getDb()
    const pending = db.prepare('SELECT * FROM signup_otps WHERE email = ?').get(cleanEmail)
    if (!pending) throw new Error('No verification is waiting for this email. Sign up again.')
    if (new Date(pending.expires_at).getTime() <= Date.now()) {
      db.prepare('DELETE FROM signup_otps WHERE id = ?').run(pending.id)
      throw new Error('That code has expired. Request a new code.')
    }
    if (pending.attempts >= OTP_MAX_ATTEMPTS) {
      throw new Error('Too many attempts. Request a new code.')
    }
    if (!verifySecret(code, pending.otp_hash)) {
      db.prepare('UPDATE signup_otps SET attempts = attempts + 1 WHERE id = ?').run(pending.id)
      const attempts = pending.attempts + 1
      if (attempts >= OTP_MAX_ATTEMPTS) throw new Error('Too many attempts. Request a new code.')
      throw new Error('That code is incorrect.')
    }

    const now = new Date().toISOString()
    const userId = crypto.randomUUID()
    const create = db.transaction(() => {
      assertIdentityAvailable(db, pending.username, pending.email)
      const role = db.prepare('SELECT id FROM roles WHERE id = ?').get(pending.role_id)
      if (!role) throw new Error('That role is no longer available. Sign up again.')
      const branchId = ensureBranch(db, now)
      db.prepare(`
        INSERT INTO users (
          id, branch_id, role_id, username, display_name, email, email_verified,
          password_hash, pin_hash, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, NULL, 1, ?, ?)
      `).run(
        userId,
        branchId,
        pending.role_id,
        pending.username,
        pending.display_name || pending.username,
        pending.email,
        pending.password_hash,
        now,
        now
      )
      db.prepare('DELETE FROM signup_otps WHERE id = ?').run(pending.id)
    })
    create()
    logAudit(null, 'CREATE_USER', 'USER', userId, {
      username: pending.username,
      email: pending.email,
      roleId: pending.role_id,
      via: 'signup_otp',
    })
    return { ok: true, username: pending.username }
  },

  hasPermission: (permissionCode) => {
    const session = authRepository.getCurrentSession()
    if (!session) return false
    if (session.roleCode === 'super_admin') return true
    return session.permissions.includes(permissionCode)
  },

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

  setUserPin: (userId, newPin) => {
    const db = getDb()
    const now = new Date().toISOString()
    const hashed = hashSecret(newPin)
    db.prepare('UPDATE users SET pin_hash = ?, updated_at = ? WHERE id = ?').run(hashed, now, userId)
    return true
  },

  needsSetup: () => {
    const db = getDb()
    const count = db.prepare('SELECT COUNT(*) as count FROM users').get().count
    return count === 0
  },

  completeInitialSetup: ({ restaurantName, username, displayName, password, pin }) => {
    const db = getDb()
    if (authRepository.needsSetup() === false) {
      throw new Error('Initial setup is already complete. Sign in with an existing administrator account.')
    }
    if (!username?.trim() || !password || password.length < 8) {
      throw new Error('Administrator username and a password of at least 8 characters are required.')
    }
    if (!pin || !/^\d{4,6}$/.test(String(pin))) {
      throw new Error('A 4 to 6 digit PIN is required for terminal unlocking.')
    }

    const now = new Date().toISOString()
    const setupTx = db.transaction(() => {
      let branch = db.prepare('SELECT id FROM branches LIMIT 1').get()
      if (!branch) {
        const branchId = crypto.randomUUID()
        db.prepare(`
          INSERT INTO branches (id, name, code, phone, email, address, city, currency_code, currency_symbol, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
          branchId,
          (restaurantName || 'My Restaurant').trim(),
          'BR-01',
          '',
          '',
          '',
          '',
          'USD',
          '$',
          now,
          now
        )
        branch = { id: branchId }
      } else if (restaurantName?.trim()) {
        db.prepare('UPDATE branches SET name = ?, updated_at = ? WHERE id = ?')
          .run(restaurantName.trim(), now, branch.id)
      }

      let role = db.prepare("SELECT id FROM roles WHERE code = 'super_admin'").get()
      if (!role) {
        const roleId = crypto.randomUUID()
        db.prepare('INSERT INTO roles (id, code, name, description, is_system, created_at) VALUES (?, ?, ?, ?, 1, ?)')
          .run(roleId, 'super_admin', 'Super Administrator', 'Full system access', now)
        role = { id: roleId }
      }

      const userId = crypto.randomUUID()
      db.prepare(`
        INSERT INTO users (id, branch_id, role_id, username, display_name, password_hash, pin_hash, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        userId,
        branch.id,
        role.id,
        username.trim().toLowerCase(),
        (displayName || username).trim(),
        hashSecret(password),
        hashSecret(String(pin)),
        now,
        now
      )

      db.prepare(`
        INSERT INTO system_settings (setting_key, setting_value, category, updated_at)
        VALUES ('setup_completed', '1', 'SECURITY', ?)
        ON CONFLICT(setting_key) DO UPDATE SET
          setting_value = excluded.setting_value,
          updated_at = excluded.updated_at
      `).run(now)
    })

    setupTx()
    return authRepository.loginWithPassword(username.trim().toLowerCase(), password)
  },

  setUserPassword: (userId, newPassword) => {
    const db = getDb()
    const now = new Date().toISOString()
    const hashed = hashSecret(newPassword)
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashed, now, userId)
    return true
  },
}

function validateSignup(input = {}) {
  const usernameRaw = String(input.username || '').trim()
  const email = String(input.email || '').trim().toLowerCase()
  const password = String(input.password || '')
  const confirmPassword = String(input.confirmPassword ?? '')
  const roleId = String(input.roleId || '').trim()
  if (!USERNAME_RE.test(usernameRaw)) {
    throw new Error('Username must be 3–32 characters and use only letters, numbers, and underscores.')
  }
  if (!EMAIL_RE.test(email)) throw new Error('Enter a valid email address.')
  if (password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('Password must be at least 8 characters and include a letter and a number.')
  }
  if (password !== confirmPassword) throw new Error('Passwords do not match.')
  if (!roleId) throw new Error('Select a role.')
  return { username: usernameRaw.toLowerCase(), displayName: usernameRaw, email, password, roleId }
}

function assertIdentityAvailable(db, username, email) {
  const usernameTaken = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username)
  if (usernameTaken) throw new Error('That username is already in use.')
  const emailTaken = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email)
  if (emailTaken) throw new Error('Email already registered.')
}

function ensureBranch(db, now) {
  const existing = db.prepare('SELECT id FROM branches WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1').get()
    || db.prepare('SELECT id FROM branches ORDER BY created_at ASC LIMIT 1').get()
  if (existing) return existing.id
  const branchId = crypto.randomUUID()
  db.prepare(`
    INSERT INTO branches (id, name, code, phone, email, address, city, currency_code, currency_symbol, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(branchId, 'My Restaurant', 'BR-01', '', '', '', '', 'USD', '$', now, now)
  return branchId
}

function issueSession(user, method) {
  const db = getDb()
  const now = new Date()
  const nowIso = now.toISOString()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString()
  const token = crypto.randomBytes(32).toString('hex')
  const sessionId = crypto.randomUUID()

  db.prepare(`
    UPDATE auth_sessions
    SET revoked_at = ?
    WHERE user_id = ? AND revoked_at IS NULL
  `).run(nowIso, user.id)
  db.prepare(`
    INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, revoked_at, created_at, last_seen_at, method)
    VALUES (?, ?, ?, ?, NULL, ?, ?, ?)
  `).run(sessionId, user.id, hashToken(token), expiresAt, nowIso, nowIso, method)

  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso, user.id)
  currentSession = buildSession(user, { token, expiresAt, sessionId, method, loginAt: nowIso })
  lastSessionState = 'ok'
  logAudit(currentSession.branchId, 'LOGIN', 'USER', user.id, { method, role: user.role_code })
  return currentSession
}

function resolveSession(token, { allowMemory }) {
  const raw = typeof token === 'string' && token ? token : (allowMemory ? currentSession?.token : '')
  if (!raw) {
    if (!allowMemory) currentSession = null
    lastSessionState = 'none'
    return null
  }

  const db = getDb()
  const row = db.prepare('SELECT * FROM auth_sessions WHERE token_hash = ?').get(hashToken(raw))
  if (!row || row.revoked_at) {
    if (!currentSession || currentSession.token === raw) currentSession = null
    lastSessionState = row?.revoked_at ? 'revoked' : 'none'
    return null
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare(`
      UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL
    `).run(new Date().toISOString(), row.id)
    if (!currentSession || currentSession.token === raw) currentSession = null
    lastSessionState = 'expired'
    return null
  }

  if (Date.now() - new Date(row.last_seen_at).getTime() > 60000) {
    db.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), row.id)
  }

  if (currentSession?.sessionId === row.id && currentSession.token === raw) {
    lastSessionState = 'ok'
    return currentSession
  }

  const user = db.prepare(`${USER_SQL} WHERE u.id = ?`).get(row.user_id)
  if (!user || !user.is_active) {
    currentSession = null
    lastSessionState = 'none'
    return null
  }
  currentSession = buildSession(user, {
    token: raw,
    expiresAt: row.expires_at,
    sessionId: row.id,
    method: row.method || 'PASSWORD',
    loginAt: row.created_at,
  })
  lastSessionState = 'ok'
  return currentSession
}

function buildSession(user, extra) {
  const db = getDb()
  const permissions = db.prepare(`
    SELECT p.code
    FROM permissions p
    JOIN role_permissions rp ON p.id = rp.permission_id
    WHERE rp.role_id = ?
  `).all(user.role_id).map((r) => r.code)

  const branch = user.branch_id
    ? db.prepare('SELECT id, name, code, currency_symbol FROM branches WHERE id = ?').get(user.branch_id)
    : db.prepare('SELECT id, name, code, currency_symbol FROM branches LIMIT 1').get()

  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    email: user.email || null,
    roleId: user.role_id,
    roleCode: user.role_code,
    roleName: user.role_name,
    branchId: branch?.id,
    branchName: branch?.name,
    currencySymbol: branch?.currency_symbol || '$',
    permissions,
    loginAt: extra.loginAt,
    expiresAt: extra.expiresAt,
    token: extra.token,
    sessionId: extra.sessionId,
    method: extra.method,
  }
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
      JSON.stringify(sanitizeDetails(details || {})),
      new Date().toISOString()
    )
  } catch (e) {
    console.error('[Audit Log] Failed to record audit:', e)
  }
}
