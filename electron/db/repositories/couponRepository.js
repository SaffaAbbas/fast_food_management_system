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

export const couponRepository = {
  getCoupons: (branchId) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, branchId)
    return db.prepare(`
      SELECT * FROM coupons
      WHERE branch_id = ? OR branch_id IS NULL
      ORDER BY is_active DESC, created_at DESC
    `).all(validBranchId)
  },

  createCoupon: (data) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, data.branchId)
    const id = uuid()
    const now = new Date().toISOString()
    const cleanCode = data.code.trim().toUpperCase()

    // Check unique code
    const existing = db.prepare('SELECT id FROM coupons WHERE code = ?').get(cleanCode)
    if (existing) throw new Error(`Coupon code "${cleanCode}" already exists.`)

    db.prepare(`
      INSERT INTO coupons (
        id, branch_id, code, title, discount_type, discount_value,
        min_order_cents, max_discount_cents, start_date, end_date,
        usage_limit, times_used, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(
      id,
      validBranchId,
      cleanCode,
      data.title.trim(),
      data.discountType || 'PERCENTAGE',
      parseInt(data.discountValue, 10) || 10,
      Math.max(0, parseInt(data.minOrderCents, 10) || 0),
      data.maxDiscountCents ? parseInt(data.maxDiscountCents, 10) : null,
      data.startDate || null,
      data.endDate || null,
      parseInt(data.usageLimit, 10) || 0,
      data.isActive !== false ? 1 : 0,
      now,
      now
    )

    return db.prepare('SELECT * FROM coupons WHERE id = ?').get(id)
  },

  updateCoupon: (id, data) => {
    const db = getDb()
    const existing = db.prepare('SELECT * FROM coupons WHERE id = ?').get(id)
    if (!existing) throw new Error('Coupon not found.')

    const now = new Date().toISOString()
    db.prepare(`
      UPDATE coupons
      SET title = ?,
          discount_type = ?,
          discount_value = ?,
          min_order_cents = ?,
          max_discount_cents = ?,
          start_date = ?,
          end_date = ?,
          usage_limit = ?,
          is_active = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      data.title !== undefined ? data.title.trim() : existing.title,
      data.discountType !== undefined ? data.discountType : existing.discount_type,
      data.discountValue !== undefined ? parseInt(data.discountValue, 10) : existing.discount_value,
      data.minOrderCents !== undefined ? parseInt(data.minOrderCents, 10) : existing.min_order_cents,
      data.maxDiscountCents !== undefined ? (data.maxDiscountCents ? parseInt(data.maxDiscountCents, 10) : null) : existing.max_discount_cents,
      data.startDate !== undefined ? data.startDate : existing.start_date,
      data.endDate !== undefined ? data.endDate : existing.end_date,
      data.usageLimit !== undefined ? parseInt(data.usageLimit, 10) : existing.usage_limit,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : existing.is_active,
      now,
      id
    )

    return db.prepare('SELECT * FROM coupons WHERE id = ?').get(id)
  },

  /**
   * Validate coupon and calculate discount amount
   */
  validateCoupon: ({ branchId, code, orderTotalCents = 0 }) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, branchId)
    const cleanCode = (code || '').trim().toUpperCase()

    const coupon = db.prepare(`
      SELECT * FROM coupons
      WHERE code = ? AND (branch_id = ? OR branch_id IS NULL)
    `).get(cleanCode, validBranchId)

    if (!coupon) {
      throw new Error(`Invalid promo code "${cleanCode}".`)
    }

    if (!coupon.is_active) {
      throw new Error(`Promo code "${cleanCode}" is no longer active.`)
    }

    const today = new Date().toISOString().slice(0, 10)
    if (coupon.start_date && today < coupon.start_date) {
      throw new Error(`Promo code "${cleanCode}" is not active yet (starts ${coupon.start_date}).`)
    }
    if (coupon.end_date && today > coupon.end_date) {
      throw new Error(`Promo code "${cleanCode}" has expired (ended ${coupon.end_date}).`)
    }

    if (coupon.usage_limit > 0 && coupon.times_used >= coupon.usage_limit) {
      throw new Error(`Promo code "${cleanCode}" has reached its maximum usage limit.`)
    }

    if (orderTotalCents < coupon.min_order_cents) {
      const minDollars = (coupon.min_order_cents / 100).toFixed(2)
      throw new Error(`Coupon "${cleanCode}" requires a minimum spend of $${minDollars}.`)
    }

    let discountCents = 0
    if (coupon.discount_type === 'PERCENTAGE') {
      discountCents = Math.round((orderTotalCents * coupon.discount_value) / 100)
      if (coupon.max_discount_cents && discountCents > coupon.max_discount_cents) {
        discountCents = coupon.max_discount_cents
      }
    } else {
      discountCents = Math.min(orderTotalCents, coupon.discount_value)
    }

    return {
      valid: true,
      code: coupon.code,
      title: coupon.title,
      discountType: coupon.discount_type,
      discountCents,
      coupon,
    }
  },
}
