import crypto from 'node:crypto'
import { getDb } from './index.js'

const SECRET_KEY = /password|passwd|pin|secret|token|apikey|api_key|supabase_key|private_key|hash/i
const SENSITIVE_ACTIONS = new Set(['FAILED_LOGIN', 'UPDATE_SETTINGS', 'CREATE_USER', 'UPDATE_USER'])

export function sanitizeDetails(details) {
  if (details == null) return null
  let value = details
  if (typeof details === 'string') {
    try {
      value = JSON.parse(details)
    } catch {
      return details
    }
  }
  if (typeof value !== 'object') return value
  const out = Array.isArray(value) ? [] : {}
  for (const [key, val] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) {
      out[key] = val ? '[redacted]' : null
      continue
    }
    if (val && typeof val === 'object') {
      out[key] = sanitizeDetails(val)
    } else {
      out[key] = val
    }
  }
  return out
}

export function writeAudit({ branchId, action, entityType, entityId, details, userId } = {}) {
  try {
    const db = getDb()
    let actorId = userId || null
    if (actorId) {
      const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(actorId)
      if (!exists) actorId = null
    }
    db.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      branchId || null,
      actorId,
      action,
      entityType || null,
      entityId || null,
      JSON.stringify(sanitizeDetails(details || {})),
      new Date().toISOString()
    )
  } catch (e) {
    console.error('[Audit Log] Failed to record audit:', e)
  }
}

export function redactAuditRow(row, { fullAccess = false } = {}) {
  if (!row) return row
  const copy = { ...row }
  let details = null
  try {
    details = copy.details_json ? JSON.parse(copy.details_json) : null
  } catch {
    details = null
  }
  details = sanitizeDetails(details)
  if (!fullAccess && SENSITIVE_ACTIONS.has(copy.action)) {
    copy.details_json = JSON.stringify({ note: 'Details restricted' })
    return copy
  }
  copy.details_json = details ? JSON.stringify(details) : null
  return copy
}
