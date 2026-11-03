import { getDb } from '../db/index.js'

const TABLES = new Set(['orders', 'order_items', 'payments', 'products', 'customers', 'categories', 'product_variations'])

function upsertRow(db, table, row) {
  if (!TABLES.has(table) || !row?.id) return
  const keys = Object.keys(row).filter((key) => row[key] !== undefined)
  if (!keys.length) return
  const placeholders = keys.map(() => '?').join(', ')
  const updates = keys.filter((key) => key !== 'id').map((key) => `${key} = excluded.${key}`).join(', ')
  const sql = updates
    ? `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`
    : `INSERT OR IGNORE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`
  db.prepare(sql).run(...keys.map((key) => row[key]))
}

export function hasPendingOutbox(entityType, entityId) {
  const db = getDb()
  const row = db.prepare(`
    SELECT id FROM sync_outbox
    WHERE entity_type = ? AND entity_id = ? AND status = 'PENDING'
    LIMIT 1
  `).get(entityType, entityId)
  return Boolean(row)
}

export function applyRemoteRecord(record) {
  const type = String(record.entity_type || '').toUpperCase()
  const payload = record.payload || {}
  if (hasPendingOutbox(type, record.entity_id)) return { skipped: true, reason: 'local_pending' }

  const db = getDb()
  const applyTx = db.transaction(() => {
    if (type === 'CATEGORY' && payload.category) {
      upsertRow(db, 'categories', payload.category)
    }
    if (type === 'PRODUCT' && payload.product) {
      upsertRow(db, 'products', payload.product)
      if (Array.isArray(payload.variations)) {
        db.prepare('DELETE FROM product_variations WHERE product_id = ?').run(payload.product.id)
        for (const variation of payload.variations) {
          upsertRow(db, 'product_variations', variation)
        }
      }
    }
    if (type === 'CUSTOMER' && payload.customer) {
      upsertRow(db, 'customers', payload.customer)
    }
    if (type === 'ORDER' && payload.order) {
      const missingProduct = (payload.items || []).find(
        (item) => item.product_id && !db.prepare('SELECT id FROM products WHERE id = ?').get(item.product_id)
      )
      if (missingProduct) {
        throw new Error('PRODUCT_MISSING')
      }
      upsertRow(db, 'orders', payload.order)
      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(payload.order.id)
      for (const item of payload.items || []) {
        upsertRow(db, 'order_items', item)
      }
      db.prepare('DELETE FROM payments WHERE order_id = ?').run(payload.order.id)
      for (const payment of payload.payments || []) {
        upsertRow(db, 'payments', payment)
      }
    }
  })

  try {
    applyTx()
    return { applied: true }
  } catch (err) {
    if (err.message === 'PRODUCT_MISSING') return { skipped: true, reason: 'product_missing' }
    throw err
  }
}
