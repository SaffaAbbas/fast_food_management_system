import crypto from 'node:crypto'
import { getDb } from './index.js'

let flushHook = null

export function setOutboxFlushHook(fn) {
  flushHook = typeof fn === 'function' ? fn : null
}

function requestFlush() {
  try {
    flushHook?.()
  } catch {
    /* sync engine optional during tests */
  }
}

/**
 * Durable local outbox. POS writes here immediately; the sync engine
 * pushes PENDING rows to Supabase when the network is available.
 */
export function enqueueIfNeeded(entityType, entityId, operation, payload = {}) {
  const db = getDb()
  const existing = db.prepare(`
    SELECT id FROM sync_outbox
    WHERE entity_type = ? AND entity_id = ? AND status IN ('PENDING', 'SYNCED')
    LIMIT 1
  `).get(entityType, entityId)
  if (existing) return
  enqueueOutbox(entityType, entityId, operation, payload)
}

export function queueLocalSnapshot() {
  const db = getDb()
  for (const row of db.prepare('SELECT id, name FROM categories').all()) {
    enqueueIfNeeded('CATEGORY', row.id, 'UPSERT', { id: row.id, name: row.name })
  }
  for (const row of db.prepare('SELECT id, name FROM products').all()) {
    enqueueIfNeeded('PRODUCT', row.id, 'UPSERT', { id: row.id, name: row.name })
  }
  for (const row of db.prepare('SELECT id, name FROM customers').all()) {
    enqueueIfNeeded('CUSTOMER', row.id, 'UPSERT', { id: row.id, name: row.name })
  }
  for (const row of db.prepare('SELECT id, order_number FROM orders').all()) {
    enqueueIfNeeded('ORDER', row.id, 'UPSERT', { id: row.id, orderNumber: row.order_number })
  }
}

export function enqueueOutbox(entityType, entityId, operation, payload = {}) {
  try {
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO sync_outbox (id, entity_type, entity_id, operation, payload_json, status, retry_count, created_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?)
    `).run(
      crypto.randomUUID(),
      entityType,
      entityId,
      operation,
      JSON.stringify(payload),
      now
    )
    requestFlush()
  } catch (err) {
    console.warn('[Outbox] Could not enqueue:', err.message)
  }
}
