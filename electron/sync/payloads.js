import { getDb } from '../db/index.js'

export function buildEntityPayload(entityType, entityId) {
  const db = getDb()
  const type = String(entityType || '').toUpperCase()

  if (type === 'ORDER') {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(entityId)
    if (!order) return null
    return {
      order,
      items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(entityId),
      payments: db.prepare('SELECT * FROM payments WHERE order_id = ?').all(entityId),
    }
  }

  if (type === 'PRODUCT') {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(entityId)
    if (!product) return null
    return {
      product,
      variations: db.prepare('SELECT * FROM product_variations WHERE product_id = ?').all(entityId),
    }
  }

  if (type === 'CUSTOMER') {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(entityId)
    return customer ? { customer } : null
  }

  if (type === 'CATEGORY') {
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(entityId)
    return category ? { category } : null
  }

  return null
}
