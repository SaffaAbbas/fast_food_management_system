import crypto from 'node:crypto'
import { getDb } from './index.js'

/**
 * Durable local outbox. Records are never sent to the cloud in this phase.
 * Schema matches the sync_outbox table created in migration 001.
 */
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
  } catch (err) {
    console.warn('[Outbox] Could not enqueue:', err.message)
  }
}
