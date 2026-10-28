import { getDb } from '../index.js'
import crypto from 'node:crypto'
import { authRepository } from './authRepository.js'

function uuid() {
  return crypto.randomUUID()
}

function resolveValidBranchId(db, branchId) {
  if (branchId) {
    const b = db.prepare('SELECT id FROM branches WHERE id = ?').get(branchId)
    if (b) return b.id
  }
  const session = authRepository.getCurrentSession()
  if (session?.branchId) {
    const b = db.prepare('SELECT id FROM branches WHERE id = ?').get(session.branchId)
    if (b) return b.id
  }
  const fallback = db.prepare('SELECT id FROM branches LIMIT 1').get()
  return fallback?.id || null
}

function resolveValidUserId(db, userId) {
  if (userId) {
    const u = db.prepare('SELECT id FROM users WHERE id = ?').get(userId)
    if (u) return u.id
  }
  const session = authRepository.getCurrentSession()
  if (session?.id) {
    const u = db.prepare('SELECT id FROM users WHERE id = ?').get(session.id)
    if (u) return u.id
  }
  const fallback = db.prepare('SELECT id FROM users WHERE is_active = 1 LIMIT 1').get()
  return fallback?.id || null
}

function logAudit(branchId, action, entityType, entityId, details) {
  try {
    const db = getDb()
    const validUserId = resolveValidUserId(db, null)
    const validBranchId = resolveValidBranchId(db, branchId)
    db.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid(),
      validBranchId,
      validUserId,
      action,
      entityType,
      entityId,
      JSON.stringify(details),
      new Date().toISOString()
    )
  } catch (err) {
    console.error('[Customer Audit Log Error]:', err)
  }
}

export const customerRepository = {
  getCustomers: (branchId, searchQuery = '', limit = 50, tag = null) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, branchId)

    let sql = `
      SELECT id, branch_id, name, phone, email, address, tag,
             credit_balance_cents, loyalty_points, order_count, total_spent_cents,
             notes, birth_date, is_active, created_at, updated_at
      FROM customers
      WHERE (branch_id = ? OR branch_id IS NULL)
    `
    const params = [validBranchId]

    if (tag && tag !== 'ALL') {
      sql += ' AND tag = ?'
      params.push(tag)
    }

    if (searchQuery && searchQuery.trim() !== '') {
      sql += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)'
      const term = `%${searchQuery.trim()}%`
      params.push(term, term, term)
    }

    sql += ' ORDER BY name ASC LIMIT ?'
    params.push(limit)

    return db.prepare(sql).all(...params)
  },

  getCustomerById: (id) => {
    const db = getDb()
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id)
    if (!customer) return null

    const recentOrders = db.prepare(`
      SELECT id, order_number, order_type, total_cents, status, created_at
      FROM orders
      WHERE customer_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(id)

    const loyaltyHistory = db.prepare(`
      SELECT * FROM loyalty_transactions
      WHERE customer_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(id)

    return { ...customer, recentOrders, loyaltyHistory }
  },

  createCustomer: ({ branchId, name, phone, email, address, tag = 'REGULAR', birthDate = null, notes = null, imageUrl = null }) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, branchId)
    const now = new Date().toISOString()
    const id = uuid()

    // Check duplicate phone if phone is provided
    if (phone && phone.trim() !== '') {
      const existing = db.prepare('SELECT id, name FROM customers WHERE phone = ?').get(phone.trim())
      if (existing) {
        throw new Error(`Customer with phone "${phone.trim()}" already exists (${existing.name}).`)
      }
    }

    db.prepare(`
      INSERT INTO customers (
        id, branch_id, name, phone, email, address, tag, birth_date,
        notes, image_url, loyalty_points, credit_balance_cents, total_spent_cents,
        order_count, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 1, ?, ?)
    `).run(
      id,
      validBranchId,
      name.trim(),
      phone ? phone.trim() : null,
      email ? email.trim() : null,
      address ? address.trim() : null,
      tag || 'REGULAR',
      birthDate || null,
      notes ? notes.trim() : null,
      imageUrl || null,
      now,
      now
    )

    logAudit(validBranchId, 'CREATE_CUSTOMER', 'CUSTOMER', id, { name, phone, tag })
    return customerRepository.getCustomerById(id)
  },

  updateCustomer: (id, { name, phone, email, address, tag, birthDate, notes, isActive, imageUrl }) => {
    const db = getDb()
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(id)
    if (!existing) throw new Error('Customer not found.')

    // Check duplicate phone if changed
    if (phone && phone.trim() !== '' && phone.trim() !== existing.phone) {
      const duplicate = db.prepare('SELECT id, name FROM customers WHERE phone = ? AND id != ?').get(phone.trim(), id)
      if (duplicate) {
        throw new Error(`Another customer with phone "${phone.trim()}" already exists (${duplicate.name}).`)
      }
    }

    const now = new Date().toISOString()

    db.prepare(`
      UPDATE customers
      SET name = ?,
          phone = ?,
          email = ?,
          address = ?,
          tag = ?,
          birth_date = ?,
          notes = ?,
          image_url = ?,
          is_active = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      name !== undefined ? name.trim() : existing.name,
      phone !== undefined ? (phone ? phone.trim() : null) : existing.phone,
      email !== undefined ? (email ? email.trim() : null) : existing.email,
      address !== undefined ? (address ? address.trim() : null) : existing.address,
      tag !== undefined ? tag : existing.tag,
      birthDate !== undefined ? birthDate : existing.birth_date,
      notes !== undefined ? (notes ? notes.trim() : null) : existing.notes,
      imageUrl !== undefined ? imageUrl : existing.image_url,
      isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active,
      now,
      id
    )

    logAudit(existing.branch_id, 'UPDATE_CUSTOMER', 'CUSTOMER', id, { name, phone, tag })
    return customerRepository.getCustomerById(id)
  },

  /**
   * Adjust or award/redeem loyalty points
   */
  adjustLoyaltyPoints: ({ customerId, branchId, orderId = null, pointsChanged, transactionType = 'ADJUSTMENT', notes = null }) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, branchId)

    const adjustTx = db.transaction(() => {
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId)
      if (!customer) throw new Error('Customer not found.')

      const currentPoints = customer.loyalty_points || 0
      const delta = parseInt(pointsChanged, 10) || 0
      const balanceAfter = Math.max(0, currentPoints + delta)

      const txId = uuid()
      const now = new Date().toISOString()

      db.prepare(`
        INSERT INTO loyalty_transactions (
          id, customer_id, branch_id, order_id, points_changed,
          transaction_type, balance_after, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        txId,
        customerId,
        validBranchId,
        orderId,
        delta,
        transactionType.toUpperCase(),
        balanceAfter,
        notes || `Points ${delta >= 0 ? 'earned' : 'redeemed'}`,
        now
      )

      db.prepare('UPDATE customers SET loyalty_points = ?, updated_at = ? WHERE id = ?')
        .run(balanceAfter, now, customerId)

      logAudit(validBranchId, 'ADJUST_LOYALTY_POINTS', 'CUSTOMER', customerId, {
        pointsChanged: delta,
        balanceAfter,
        transactionType,
      })

      return {
        customerId,
        pointsChanged: delta,
        balanceAfter,
      }
    })

    return adjustTx()
  },

  /**
   * Get CRM Analytics Summary
   */
  getCrmSummary: (branchId) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, branchId)

    const stats = db.prepare(`
      SELECT COUNT(*) as total_customers,
             COALESCE(SUM(total_spent_cents), 0) as total_revenue_cents,
             COALESCE(SUM(order_count), 0) as total_orders,
             COALESCE(SUM(loyalty_points), 0) as total_active_points,
             COUNT(CASE WHEN tag = 'VIP' THEN 1 END) as vip_count,
             COUNT(CASE WHEN tag = 'REGULAR' THEN 1 END) as regular_count,
             COUNT(CASE WHEN tag = 'CORPORATE' THEN 1 END) as corporate_count
      FROM customers
      WHERE branch_id = ? OR branch_id IS NULL
    `).get(validBranchId)

    return stats
  },
}
