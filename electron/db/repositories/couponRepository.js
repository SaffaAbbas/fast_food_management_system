import { getDb } from '../index.js'
import crypto from 'node:crypto'
import { authRepository } from './authRepository.js'
import { writeAudit } from '../auditLog.js'

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

function padTime(value) {
  if (!value) return null
  const s = String(value).trim()
  if (s.length === 5) return s
  if (s.length >= 8) return s.slice(0, 5)
  return s
}

function nowParts() {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return {
    iso: d.toISOString(),
    date: d.toISOString().slice(0, 10),
    time: `${hh}:${mm}`,
    day: String(d.getDay()),
  }
}

function inDateWindow(coupon, now) {
  const start = coupon.start_date ? String(coupon.start_date) : null
  const end = coupon.end_date ? String(coupon.end_date) : null
  if (start) {
    const cmp = start.length > 10 ? now.iso : now.date
    const startKey = start.length > 10 ? start : start.slice(0, 10)
    if (cmp < startKey) return `not active yet (starts ${start.slice(0, 16)})`
  }
  if (end) {
    const cmp = end.length > 10 ? now.iso : now.date
    const endKey = end.length > 10 ? end : end.slice(0, 10)
    if (cmp > endKey) return `has expired (ended ${end.slice(0, 16)})`
  }
  return null
}

function inTimeWindow(coupon, now) {
  const start = padTime(coupon.start_time)
  const end = padTime(coupon.end_time)
  if (!start && !end) return null
  const t = now.time
  if (start && end && start > end) {
    if (!(t >= start || t <= end)) return `only valid ${start}–${end}`
    return null
  }
  if (start && t < start) return `only valid from ${start}`
  if (end && t > end) return `only valid until ${end}`
  return null
}

function inDaysWindow(coupon, now) {
  if (!coupon.days_of_week) return null
  const days = String(coupon.days_of_week)
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean)
  if (days.length === 0) return null
  if (!days.includes(now.day)) return 'not valid today'
  return null
}

function eligibleItems(coupon, items = []) {
  const list = Array.isArray(items) ? items : []
  const applies = coupon.applies_to || 'ALL'
  return list.filter((it) => {
    if (it.isDiscountEligible === 0 || it.is_discount_eligible === 0) return false
    if (applies === 'CATEGORY') return (it.categoryId || it.category_id) === coupon.target_id
    if (applies === 'PRODUCT') return (it.productId || it.product_id) === coupon.target_id
    if (applies === 'COMBO') return (it.comboId || it.combo_id) === coupon.target_id
    return true
  })
}

function itemQty(it) {
  return Math.max(0, parseInt(it.quantity, 10) || 0)
}

function itemUnit(it) {
  return Math.max(0, parseInt(it.unitPriceCents ?? it.unit_price_cents, 10) || 0)
}

function itemTotal(it) {
  const explicit = parseInt(it.totalCents ?? it.total_cents, 10)
  if (!Number.isNaN(explicit) && explicit > 0) return explicit
  return itemQty(it) * itemUnit(it)
}

function computeDiscountCents(coupon, { orderTotalCents = 0, items = [] }) {
  const eligible = eligibleItems(coupon, items)
  const scopedSubtotal = eligible.length > 0
    ? eligible.reduce((sum, it) => sum + itemTotal(it), 0)
    : (coupon.applies_to && coupon.applies_to !== 'ALL' ? 0 : orderTotalCents)
  const base = coupon.applies_to && coupon.applies_to !== 'ALL' ? scopedSubtotal : (orderTotalCents || scopedSubtotal)

  if (coupon.discount_type === 'BOGO') {
    const buyQty = Math.max(1, parseInt(coupon.buy_qty, 10) || 1)
    const getQty = Math.max(1, parseInt(coupon.get_qty, 10) || 1)
    const buyId = coupon.target_id
    const getId = coupon.get_product_id || coupon.target_id
    const buyCount = items
      .filter((it) => (it.productId || it.product_id) === buyId)
      .reduce((s, it) => s + itemQty(it), 0)
    const getLines = items.filter((it) => (it.productId || it.product_id) === getId)
    const getCount = getLines.reduce((s, it) => s + itemQty(it), 0)
    const freeUnits = Math.min(Math.floor(buyCount / buyQty) * getQty, getCount)
    if (freeUnits <= 0) return 0
    const cheapest = [...getLines].sort((a, b) => itemUnit(a) - itemUnit(b))[0]
    return freeUnits * itemUnit(cheapest)
  }

  let discountCents = 0
  if (coupon.discount_type === 'PERCENTAGE') {
    discountCents = Math.round((base * coupon.discount_value) / 100)
  } else {
    discountCents = Math.min(base, coupon.discount_value)
  }
  if (coupon.max_discount_cents && discountCents > coupon.max_discount_cents) {
    discountCents = coupon.max_discount_cents
  }
  return Math.max(0, Math.min(discountCents, orderTotalCents || base || discountCents))
}

function couponRowPayload(data, existing = {}) {
  return {
    title: data.title !== undefined ? String(data.title).trim() : existing.title,
    discountType: data.discountType !== undefined ? data.discountType : existing.discount_type,
    discountValue: data.discountValue !== undefined ? parseInt(data.discountValue, 10) : existing.discount_value,
    minOrderCents: data.minOrderCents !== undefined ? parseInt(data.minOrderCents, 10) || 0 : existing.min_order_cents,
    maxDiscountCents: data.maxDiscountCents !== undefined
      ? (data.maxDiscountCents ? parseInt(data.maxDiscountCents, 10) : null)
      : existing.max_discount_cents,
    startDate: data.startDate !== undefined ? data.startDate || null : existing.start_date,
    endDate: data.endDate !== undefined ? data.endDate || null : existing.end_date,
    usageLimit: data.usageLimit !== undefined ? parseInt(data.usageLimit, 10) || 0 : existing.usage_limit,
    isActive: data.isActive !== undefined ? (data.isActive ? 1 : 0) : existing.is_active,
    customerId: data.customerId !== undefined || data.customer_id !== undefined
      ? (data.customerId || data.customer_id || null)
      : existing.customer_id,
    appliesTo: data.appliesTo !== undefined ? data.appliesTo : (existing.applies_to || 'ALL'),
    targetId: data.targetId !== undefined ? data.targetId || null : existing.target_id,
    buyQty: data.buyQty !== undefined ? parseInt(data.buyQty, 10) || 0 : (existing.buy_qty || 0),
    getQty: data.getQty !== undefined ? parseInt(data.getQty, 10) || 0 : (existing.get_qty || 0),
    getProductId: data.getProductId !== undefined ? data.getProductId || null : existing.get_product_id,
    startTime: data.startTime !== undefined ? data.startTime || null : existing.start_time,
    endTime: data.endTime !== undefined ? data.endTime || null : existing.end_time,
    daysOfWeek: data.daysOfWeek !== undefined ? data.daysOfWeek || null : existing.days_of_week,
    customerSegment: data.customerSegment !== undefined ? data.customerSegment || 'ALL' : (existing.customer_segment || 'ALL'),
    isAutoApply: data.isAutoApply !== undefined ? (data.isAutoApply ? 1 : 0) : (existing.is_auto_apply || 0),
    perCustomerLimit: data.perCustomerLimit !== undefined
      ? parseInt(data.perCustomerLimit, 10) || 0
      : (existing.per_customer_limit || 0),
  }
}

function assertCouponUsable(db, coupon, { customerId, orderTotalCents = 0, items = [], now = nowParts() }) {
  if (!coupon.is_active) throw new Error(`Promo code "${coupon.code}" is no longer active.`)

  const dateErr = inDateWindow(coupon, now)
  if (dateErr) throw new Error(`Promo code "${coupon.code}" ${dateErr}.`)
  const timeErr = inTimeWindow(coupon, now)
  if (timeErr) throw new Error(`Promo code "${coupon.code}" ${timeErr}.`)
  const dayErr = inDaysWindow(coupon, now)
  if (dayErr) throw new Error(`Promo code "${coupon.code}" is ${dayErr}.`)

  if (coupon.usage_limit > 0 && coupon.times_used >= coupon.usage_limit) {
    throw new Error(`Promo code "${coupon.code}" has reached its maximum usage limit.`)
  }

  if (coupon.customer_id && customerId && coupon.customer_id !== customerId) {
    throw new Error(`Promo code "${coupon.code}" is assigned to another customer.`)
  }
  if (coupon.customer_id && !customerId) {
    throw new Error(`Promo code "${coupon.code}" requires the assigned customer on this order.`)
  }

  const segment = coupon.customer_segment && coupon.customer_segment !== 'ALL' ? coupon.customer_segment : null
  if (segment) {
    if (!customerId) throw new Error(`Promo code "${coupon.code}" is for ${segment} customers only.`)
    const customer = db.prepare('SELECT tag FROM customers WHERE id = ?').get(customerId)
    if (!customer || String(customer.tag || '').toUpperCase() !== String(segment).toUpperCase()) {
      throw new Error(`Promo code "${coupon.code}" is for ${segment} customers only.`)
    }
  }

  if (coupon.per_customer_limit > 0) {
    if (!customerId) throw new Error(`Promo code "${coupon.code}" requires a customer on this order.`)
    const used = db.prepare(
      'SELECT COUNT(*) as n FROM coupon_redemptions WHERE coupon_id = ? AND customer_id = ?'
    ).get(coupon.id, customerId)?.n || 0
    if (used >= coupon.per_customer_limit) {
      throw new Error(`Promo code "${coupon.code}" has already been used by this customer.`)
    }
  }

  if (orderTotalCents < (coupon.min_order_cents || 0)) {
    const minDollars = ((coupon.min_order_cents || 0) / 100).toFixed(2)
    throw new Error(`Coupon "${coupon.code}" requires a minimum spend of $${minDollars}.`)
  }

  const discountCents = computeDiscountCents(coupon, { orderTotalCents, items })
  if (discountCents <= 0) {
    if (coupon.discount_type === 'BOGO') {
      throw new Error(`Promo "${coupon.code}" needs ${coupon.buy_qty} qualifying items in the cart.`)
    }
    if (coupon.applies_to && coupon.applies_to !== 'ALL') {
      throw new Error(`Promo "${coupon.code}" does not apply to items on this order.`)
    }
  }

  return discountCents
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
    const row = couponRowPayload(data, {
      discount_type: 'PERCENTAGE',
      discount_value: 10,
      min_order_cents: 0,
      max_discount_cents: null,
      usage_limit: 0,
      is_active: 1,
      applies_to: 'ALL',
      customer_segment: 'ALL',
    })

    const existing = db.prepare('SELECT id FROM coupons WHERE code = ?').get(cleanCode)
    if (existing) throw new Error(`Coupon code "${cleanCode}" already exists.`)

    db.prepare(`
      INSERT INTO coupons (
        id, branch_id, code, title, discount_type, discount_value,
        min_order_cents, max_discount_cents, start_date, end_date,
        usage_limit, times_used, is_active, customer_id, applies_to, target_id,
        buy_qty, get_qty, get_product_id, start_time, end_time, days_of_week,
        customer_segment, is_auto_apply, per_customer_limit, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      validBranchId,
      cleanCode,
      row.title,
      row.discountType || 'PERCENTAGE',
      row.discountValue || 0,
      row.minOrderCents || 0,
      row.maxDiscountCents,
      row.startDate,
      row.endDate,
      row.usageLimit || 0,
      row.isActive,
      row.customerId,
      row.appliesTo || 'ALL',
      row.targetId,
      row.buyQty || 0,
      row.getQty || 0,
      row.getProductId,
      row.startTime,
      row.endTime,
      row.daysOfWeek,
      row.customerSegment || 'ALL',
      row.isAutoApply ? 1 : 0,
      row.perCustomerLimit || 0,
      now,
      now
    )

    writeAudit({
      branchId: validBranchId,
      userId: authRepository.getCurrentSession()?.id,
      action: 'CREATE_COUPON',
      entityType: 'COUPON',
      entityId: id,
      details: { code: cleanCode, title: row.title, discountType: row.discountType },
    })
    return db.prepare('SELECT * FROM coupons WHERE id = ?').get(id)
  },

  updateCoupon: (id, data) => {
    const db = getDb()
    const existing = db.prepare('SELECT * FROM coupons WHERE id = ?').get(id)
    if (!existing) throw new Error('Coupon not found.')
    const now = new Date().toISOString()
    const row = couponRowPayload(data, existing)

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
          customer_id = ?,
          applies_to = ?,
          target_id = ?,
          buy_qty = ?,
          get_qty = ?,
          get_product_id = ?,
          start_time = ?,
          end_time = ?,
          days_of_week = ?,
          customer_segment = ?,
          is_auto_apply = ?,
          per_customer_limit = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      row.title,
      row.discountType,
      row.discountValue,
      row.minOrderCents,
      row.maxDiscountCents,
      row.startDate,
      row.endDate,
      row.usageLimit,
      row.isActive,
      row.customerId,
      row.appliesTo,
      row.targetId,
      row.buyQty,
      row.getQty,
      row.getProductId,
      row.startTime,
      row.endTime,
      row.daysOfWeek,
      row.customerSegment,
      row.isAutoApply ? 1 : 0,
      row.perCustomerLimit,
      now,
      id
    )

    writeAudit({
      branchId: existing.branch_id,
      userId: authRepository.getCurrentSession()?.id,
      action: existing.is_active && !row.isActive ? 'ARCHIVE_COUPON' : 'UPDATE_COUPON',
      entityType: 'COUPON',
      entityId: id,
      details: { code: existing.code, title: row.title },
    })
    return db.prepare('SELECT * FROM coupons WHERE id = ?').get(id)
  },

  validateCoupon: ({ branchId, code, orderTotalCents = 0, orderSubtotalCents, customerId = null, items = [], now } = {}) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, branchId)
    const cleanCode = (code || '').trim().toUpperCase()
    const total = orderSubtotalCents ?? orderTotalCents ?? 0

    const coupon = db.prepare(`
      SELECT * FROM coupons
      WHERE code = ? AND (branch_id = ? OR branch_id IS NULL)
    `).get(cleanCode, validBranchId)

    if (!coupon) {
      throw new Error(`Invalid promo code "${cleanCode}".`)
    }

    const discountCents = assertCouponUsable(db, coupon, {
      customerId,
      orderTotalCents: total,
      items,
      now: now || nowParts(),
    })

    return {
      valid: true,
      code: coupon.code,
      title: coupon.title,
      discountType: coupon.discount_type,
      discountCents,
      coupon,
    }
  },

  evaluateAutoPromotions: ({ branchId, orderTotalCents = 0, customerId = null, items = [], now } = {}) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, branchId)
    const clock = now || nowParts()
    const autos = db.prepare(`
      SELECT * FROM coupons
      WHERE is_active = 1 AND is_auto_apply = 1 AND (branch_id = ? OR branch_id IS NULL)
    `).all(validBranchId)

    let best = null
    for (const coupon of autos) {
      try {
        const discountCents = assertCouponUsable(db, coupon, {
          customerId,
          orderTotalCents,
          items,
          now: clock,
        })
        if (discountCents > 0 && (!best || discountCents > best.discountCents)) {
          best = {
            valid: true,
            code: coupon.code,
            title: coupon.title,
            discountType: coupon.discount_type,
            discountCents,
            coupon,
          }
        }
      } catch {
        // skip ineligible auto promo
      }
    }
    return best
  },

  recordRedemption: ({ couponId, couponCode, orderId, customerId = null, discountCents = 0, status = 'CONFIRMED' }) => {
    if (status === 'DRAFT' || status === 'CANCELLED') return null
    const db = getDb()
    let coupon = null
    if (couponId) coupon = db.prepare('SELECT * FROM coupons WHERE id = ?').get(couponId)
    if (!coupon && couponCode) {
      coupon = db.prepare('SELECT * FROM coupons WHERE code = ?').get(String(couponCode).trim().toUpperCase())
    }
    if (!coupon) return null

    const existing = orderId
      ? db.prepare('SELECT id FROM coupon_redemptions WHERE order_id = ? AND coupon_id = ?').get(orderId, coupon.id)
      : null
    if (existing) return existing.id

    const id = uuid()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO coupon_redemptions (id, coupon_id, order_id, customer_id, discount_cents, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, coupon.id, orderId || null, customerId || null, discountCents || 0, now)
    db.prepare('UPDATE coupons SET times_used = times_used + 1, updated_at = ? WHERE id = ?').run(now, coupon.id)
    return id
  },
}
