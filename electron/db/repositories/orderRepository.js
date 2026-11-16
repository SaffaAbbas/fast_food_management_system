import { getDb } from '../index.js'
import crypto from 'node:crypto'
import { authRepository } from './authRepository.js'
import { inventoryRepository } from './inventoryRepository.js'
import { customerRepository } from './customerRepository.js'
import { couponRepository } from './couponRepository.js'
import { enqueueOutbox } from '../outbox.js'

function uuid() {
  return crypto.randomUUID()
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
    console.error('[Audit Log Error]:', err)
  }
}

export const orderRepository = {
  replaceOpenOrder: (orderData) => {
    const db = getDb()
    const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderData.id)
    if (!existing) throw new Error('Order not found.')
    if ((existing.paid_cents || 0) > 0) {
      throw new Error('Paid orders cannot be rewritten from POS. Use refund or a new ticket.')
    }
    if (!['DRAFT', 'CONFIRMED'].includes(existing.status)) {
      throw new Error('Only held or unconfirmed tickets can be edited.')
    }

    const now = new Date().toISOString()
    const status = orderData.status || existing.status
    const orderType = orderData.orderType || existing.order_type
    const cashierId = resolveValidUserId(db, orderData.cashierId)

    const rewriteTx = db.transaction(() => {
      if (existing.stock_posted !== 1) {
        inventoryRepository.releaseReservedStockForOrder(existing.id)
      }
      const itemIds = db.prepare('SELECT id FROM order_items WHERE order_id = ?').all(existing.id)
      for (const row of itemIds) {
        db.prepare('DELETE FROM order_item_modifiers WHERE order_item_id = ?').run(row.id)
      }
      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(existing.id)

      db.prepare(`
        UPDATE orders SET
          order_type = ?, status = ?, table_id = ?, customer_id = ?,
          subtotal_cents = ?, discount_cents = ?, discount_reason = ?,
          tax_cents = ?, service_charge_cents = ?, delivery_charge_cents = ?,
          total_cents = ?, notes = ?, kitchen_accepted_at = ?,
          coupon_id = ?, coupon_code = ?, updated_at = ?
        WHERE id = ?
      `).run(
        orderType,
        status,
        orderData.tableId || null,
        orderData.customerId || null,
        orderData.subtotalCents || 0,
        orderData.discountCents || 0,
        orderData.discountReason || null,
        orderData.taxCents || 0,
        orderData.serviceChargeCents || 0,
        orderData.deliveryChargeCents || 0,
        orderData.totalCents || 0,
        orderData.notes || null,
        status === 'CONFIRMED' ? (existing.kitchen_accepted_at || now) : null,
        orderData.couponId || existing.coupon_id || null,
        orderData.couponCode || existing.coupon_code || null,
        now,
        existing.id
      )

      if (Array.isArray(orderData.items)) {
        for (const item of orderData.items) {
          const itemId = uuid()
          db.prepare(`
            INSERT INTO order_items (
              id, order_id, product_id, variation_id, item_name,
              quantity, unit_price_cents, discount_cents, total_cents,
              kitchen_status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
          `).run(
            itemId,
            existing.id,
            item.productId,
            item.variationId || null,
            item.name || item.itemName || 'Menu Item',
            item.quantity,
            item.unitPriceCents,
            item.discountCents || 0,
            item.totalCents,
            item.notes || null
          )
          if (Array.isArray(item.modifiers)) {
            for (const mod of item.modifiers) {
              db.prepare(`
                INSERT INTO order_item_modifiers (id, order_item_id, modifier_id, name, price_cents)
                VALUES (?, ?, ?, ?, ?)
              `).run(uuid(), itemId, mod.id || null, mod.name, (mod.priceCents || 0) * (mod.quantity || 1))
            }
          }
        }
      }

      if (existing.status !== status) {
        db.prepare(`
          INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(uuid(), existing.id, existing.status, status, cashierId, 'POS ticket updated', now)
      }

      if (orderType === 'DINE_IN' && orderData.tableId) {
        db.prepare('UPDATE dining_tables SET status = ?, current_order_id = ?, updated_at = ? WHERE id = ?')
          .run('OCCUPIED', existing.id, now, orderData.tableId)
      }

      logAudit(existing.branch_id, 'UPDATE_ORDER', 'ORDER', existing.id, {
        orderNumber: existing.order_number,
        status,
      })
      if ((orderData.discountCents || 0) > 0) {
        logAudit(existing.branch_id, 'DISCOUNT_OVERRIDE', 'ORDER', existing.id, {
          orderNumber: existing.order_number,
          discountCents: orderData.discountCents,
          reason: orderData.discountReason || null,
          couponCode: orderData.couponCode || null,
        })
      }

      if (status === 'CONFIRMED' && existing.stock_posted !== 1) {
        inventoryRepository.reserveRecipeStockForOrder(existing.id)
      }

      couponRepository.recordRedemption({
        couponId: orderData.couponId || existing.coupon_id,
        couponCode: orderData.couponCode || existing.coupon_code,
        orderId: existing.id,
        customerId: orderData.customerId || existing.customer_id,
        discountCents: orderData.discountCents || existing.discount_cents || 0,
        status,
      })
    })

    rewriteTx()
    const created = orderRepository.getOrderDetails(existing.id)
    return { ...created, orderNumber: created.order_number, totalCents: created.total_cents }
  },

  createOrder: (orderData) => {
    if (orderData.id) {
      return orderRepository.replaceOpenOrder(orderData)
    }
    const db = getDb()
    const now = new Date().toISOString()
    const orderId = uuid()
    const orderNumber = orderData.orderNumber || (() => {
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      let prefixKey = 'ORD'
      try {
        const row = db.prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'order_number_prefix'").get()
        if (row?.setting_value) prefixKey = String(row.setting_value).replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'ORD'
      } catch (e) {}
      const prefix = `${prefixKey}-${day}-`
      const last = db.prepare('SELECT order_number FROM orders WHERE order_number LIKE ? ORDER BY order_number DESC LIMIT 1').get(`${prefix}%`)
      let seq = 1
      if (last?.order_number) {
        const n = parseInt(String(last.order_number).slice(prefix.length), 10)
        if (!Number.isNaN(n)) seq = n + 1
      }
      return `${prefix}${String(seq).padStart(4, '0')}`
    })()
    const status = orderData.status || 'CONFIRMED'
    const orderType = orderData.orderType || 'DINE_IN'

    const createOrderTx = db.transaction(() => {
      const branchId = resolveValidBranchId(db, orderData.branchId)
      const cashierId = resolveValidUserId(db, orderData.cashierId)

      // 1. Insert order
      db.prepare(`
        INSERT INTO orders (
          id, branch_id, order_number, order_type, order_source, status,
          table_id, customer_id, reservation_id, cashier_id, subtotal_cents, discount_cents,
          discount_reason, tax_cents, service_charge_cents, delivery_charge_cents,
          total_cents, paid_cents, notes, kitchen_accepted_at, coupon_id, coupon_code, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?
        )
      `).run(
        orderId,
        branchId,
        orderNumber,
        orderType,
        orderData.orderSource || 'POS',
        status,
        orderData.tableId || null,
        orderData.customerId || null,
        orderData.reservationId || null,
        cashierId,
        orderData.subtotalCents || 0,
        orderData.discountCents || 0,
        orderData.discountReason || null,
        orderData.taxCents || 0,
        orderData.serviceChargeCents || 0,
        orderData.deliveryChargeCents || 0,
        orderData.totalCents || 0,
        orderData.paidCents || 0,
        orderData.notes || null,
        status === 'CONFIRMED' ? now : null,
        orderData.couponId || null,
        orderData.couponCode || null,
        now,
        now
      )

      // 2. Insert items & modifiers
      if (Array.isArray(orderData.items)) {
        for (const item of orderData.items) {
          const itemId = uuid()
          let stationId = item.kitchenStationId || null
          if (!stationId && item.productId) {
            try {
              const prod = db.prepare('SELECT kitchen_station_id FROM products WHERE id = ?').get(item.productId)
              if (prod?.kitchen_station_id) stationId = prod.kitchen_station_id
            } catch (e) {}
          }

          db.prepare(`
            INSERT INTO order_items (
              id, order_id, product_id, variation_id, item_name,
              quantity, unit_price_cents, discount_cents, total_cents,
              kitchen_station_id, kitchen_status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
          `).run(
            itemId,
            orderId,
            item.productId,
            item.variationId || null,
            item.name || item.itemName || 'Menu Item',
            item.quantity,
            item.unitPriceCents,
            item.discountCents || 0,
            item.totalCents,
            stationId,
            item.notes || null
          )

          // Insert modifiers if any
          if (Array.isArray(item.modifiers)) {
            for (const mod of item.modifiers) {
              db.prepare(`
                INSERT INTO order_item_modifiers (id, order_item_id, modifier_id, name, price_cents)
                VALUES (?, ?, ?, ?, ?)
              `).run(uuid(), itemId, mod.id || null, mod.name, mod.priceCents || 0)
            }
          }
        }
      }

      // 3. Status history entry
      db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, NULL, ?, ?, 'Order created via POS', ?)
      `).run(uuid(), orderId, status, cashierId, now)

      // 4. Update table status if dine-in (even for draft orders, marks table occupied/held)
      if (orderType === 'DINE_IN' && orderData.tableId && status !== 'COMPLETED' && status !== 'CANCELLED') {
        db.prepare('UPDATE dining_tables SET status = ?, current_order_id = ?, updated_at = ? WHERE id = ?')
          .run('OCCUPIED', orderId, now, orderData.tableId)
      }

      // Loyalty and customer spend are posted only when the sale is fully paid.

      // 6. Future sync outbox entry
      db.prepare(`
        INSERT INTO sync_outbox (id, entity_type, entity_id, operation, payload_json, status, created_at)
        VALUES (?, 'ORDER', ?, 'INSERT', ?, 'PENDING', ?)
      `).run(uuid(), orderId, JSON.stringify({ id: orderId, orderNumber, totalCents: orderData.totalCents }), now)

      logAudit(orderData.branchId, 'CREATE_ORDER', 'ORDER', orderId, {
        orderNumber,
        orderType,
        totalCents: orderData.totalCents,
        status,
      })
      if ((orderData.discountCents || 0) > 0) {
        logAudit(orderData.branchId, 'DISCOUNT_OVERRIDE', 'ORDER', orderId, {
          orderNumber,
          discountCents: orderData.discountCents,
          reason: orderData.discountReason || null,
          couponCode: orderData.couponCode || null,
        })
      }

      if (status === 'CONFIRMED') {
        inventoryRepository.reserveRecipeStockForOrder(orderId)
      }

      couponRepository.recordRedemption({
        couponId: orderData.couponId,
        couponCode: orderData.couponCode,
        orderId,
        customerId: orderData.customerId,
        discountCents: orderData.discountCents || 0,
        status,
      })
      if (orderData.reservationId) {
        db.prepare("UPDATE reservations SET status = 'SEATED', updated_at = ? WHERE id = ?")
          .run(now, orderData.reservationId)
      }

      const created = orderRepository.getOrderDetails(orderId)
      return {
        ...created,
        orderNumber: created.order_number,
        totalCents: created.total_cents,
      }
    })

    return createOrderTx()
  },

  getOrderDetails: (orderId) => {
    const db = getDb()
    const order = db.prepare(`
      SELECT o.*,
             c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
             t.table_number, f.name as floor_name,
             u.display_name as cashier_name
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN dining_tables t ON o.table_id = t.id
      LEFT JOIN floors f ON t.floor_id = f.id
      LEFT JOIN users u ON o.cashier_id = u.id
      WHERE o.id = ?
    `).get(orderId)

    if (!order) return null

    // Get Items
    const items = db.prepare(`
      SELECT oi.*, p.sku as product_sku, v.name as variation_name
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      LEFT JOIN product_variations v ON oi.variation_id = v.id
      WHERE oi.order_id = ?
    `).all(orderId)

    for (const item of items) {
      item.modifiers = db.prepare(`
        SELECT id, name, price_cents
        FROM order_item_modifiers
        WHERE order_item_id = ?
      `).all(item.id)
    }

    // Get Payments
    const payments = db.prepare(`
      SELECT p.*, u.display_name as cashier_name
      FROM payments p
      LEFT JOIN users u ON p.cashier_id = u.id
      WHERE p.order_id = ?
      ORDER BY p.created_at ASC
    `).all(orderId)

    // Get Status History
    const statusHistory = db.prepare(`
      SELECT h.*, u.display_name as changed_by
      FROM order_status_history h
      LEFT JOIN users u ON h.changed_by_user_id = u.id
      WHERE h.order_id = ?
      ORDER BY h.created_at ASC
    `).all(orderId)

    const refunds = db.prepare(`
      SELECT r.*, u.display_name as cashier_name
      FROM refunds r
      LEFT JOIN users u ON r.cashier_id = u.id
      WHERE r.order_id = ?
      ORDER BY r.created_at ASC
    `).all(orderId)

    return {
      ...order,
      items,
      payments,
      refunds,
      statusHistory,
    }
  },

  processPayment: ({ orderId, branchId, cashierId, payments, tenderedCents = 0, changeCents = 0 }) => {
    const db = getDb()
    const now = new Date().toISOString()

    const paymentTx = db.transaction(() => {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
      if (!order) throw new Error('Order not found.')
      if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
        throw new Error('Cannot process payment on a cancelled or refunded order.')
      }
      if (order.status === 'COMPLETED' && (order.paid_cents || 0) >= (order.total_cents || 0)) {
        throw new Error('This sale is already fully paid. Duplicate completion was blocked.')
      }

      const validBranchId = resolveValidBranchId(db, branchId || order.branch_id)
      const validCashierId = resolveValidUserId(db, cashierId || order.cashier_id)

      let totalPaymentCents = 0
      for (const p of payments) {
        totalPaymentCents += p.amountCents || 0
      }

      const remainingDue = Math.max(0, (order.total_cents || 0) - (order.paid_cents || 0))
      if (!Array.isArray(payments) || payments.length === 0) {
        throw new Error('At least one payment method is required.')
      }
      if (totalPaymentCents <= 0) {
        throw new Error('Payment amount must be greater than zero.')
      }
      if (totalPaymentCents < remainingDue) {
        throw new Error(`Payment is short. Remaining due is $${(remainingDue / 100).toFixed(2)}.`)
      }
      for (const p of payments) {
        const method = String(p.paymentMethod || '').toUpperCase()
        if (!p.amountCents || p.amountCents <= 0) {
          throw new Error('Each payment line must have an amount greater than zero.')
        }
        if (method !== 'CASH' && !String(p.referenceNumber || '').trim()) {
          throw new Error(`Reference / auth number is required for ${method.replace('_', ' ')} payments.`)
        }
      }

      // Record each payment tender (split tender support)
      for (const p of payments) {
        db.prepare(`
          INSERT INTO payments (
            id, branch_id, order_id, cashier_id, payment_method,
            amount_cents, tendered_cents, change_cents, reference_number, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?)
        `).run(
          uuid(),
          validBranchId,
          orderId,
          validCashierId,
          p.paymentMethod.toUpperCase(),
          p.amountCents,
          p.paymentMethod.toUpperCase() === 'CASH' ? tenderedCents : p.amountCents,
          p.paymentMethod.toUpperCase() === 'CASH' ? changeCents : 0,
          p.referenceNumber || null,
          now
        )
      }

      const newPaidCents = (order.paid_cents || 0) + totalPaymentCents
      const isFullyPaid = newPaidCents >= order.total_cents
      // Payment must not hide the ticket from kitchen. Keep cooking status until bump.
      let nextStatus = order.status
      if (isFullyPaid) {
        if (order.status === 'DRAFT') nextStatus = 'CONFIRMED'
        else if (order.status === 'SERVED' || order.kitchen_completed_at) nextStatus = 'COMPLETED'
      }

      // Update Order
      db.prepare(`
        UPDATE orders
        SET paid_cents = ?, status = ?, updated_at = ?
        WHERE id = ?
      `).run(newPaidCents, nextStatus, now, orderId)

      // Add status history
      db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuid(),
        orderId,
        order.status,
        nextStatus,
        validCashierId,
        `Payment of $${(totalPaymentCents / 100).toFixed(2)} received (${payments.map(p => p.paymentMethod).join(', ')})`,
        now
      )

      // If fully settled and was DINE_IN, free table
      if (isFullyPaid && order.table_id) {
        db.prepare(`
          UPDATE dining_tables
          SET status = 'AVAILABLE', current_order_id = NULL, updated_at = ?
          WHERE id = ?
        `).run(now, order.table_id)
        if (order.reservation_id) {
          db.prepare("UPDATE reservations SET status = 'COMPLETED', updated_at = ? WHERE id = ?")
            .run(now, order.reservation_id)
        }
      }

      if (isFullyPaid) {
        inventoryRepository.deductRecipeStockForOrder(orderId)

        if (order.customer_id && order.loyalty_awarded !== 1) {
          const earnRow = db.prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'loyalty_earn_per_dollar'").get()
          const earnRate = Math.max(0, parseFloat(earnRow?.setting_value || '1') || 1)
          const points = Math.max(0, Math.floor(((order.total_cents || 0) / 100) * earnRate))
          if (points > 0) {
            customerRepository.adjustLoyaltyPoints({
              customerId: order.customer_id,
              branchId: validBranchId,
              orderId,
              pointsChanged: points,
              transactionType: 'EARN',
              notes: `Loyalty earned for ${order.order_number}`,
            })
            db.prepare('UPDATE orders SET loyalty_awarded = 1, updated_at = ? WHERE id = ?').run(now, orderId)
          }
        }
      }

      logAudit(branchId || order.branch_id, 'PROCESS_PAYMENT', 'ORDER', orderId, {
        orderNumber: order.order_number,
        totalPaymentCents,
        newPaidCents,
        isFullyPaid,
      })

      enqueueOutbox('ORDER', orderId, isFullyPaid ? 'SALE_COMPLETED' : 'PAYMENT_RECORDED', {
        orderNumber: order.order_number,
        totalPaymentCents,
        isFullyPaid,
      })

      return orderRepository.getOrderDetails(orderId)
    })

    return paymentTx()
  },

  holdOrder: (orderData) => {
    return orderRepository.createOrder({
      ...orderData,
      status: 'DRAFT',
    })
  },

  getHeldOrders: (branchId) => {
    const db = getDb()
    return db.prepare(`
      SELECT o.id, o.order_number, o.order_type, o.status, o.total_cents, o.subtotal_cents,
             o.created_at, o.notes,
             t.table_number, f.name as floor_name,
             c.name as customer_name, c.phone as customer_phone,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count
      FROM orders o
      LEFT JOIN dining_tables t ON o.table_id = t.id
      LEFT JOIN floors f ON t.floor_id = f.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE (o.branch_id = ? OR o.branch_id IS NULL) AND o.status = 'DRAFT'
      ORDER BY o.created_at DESC
    `).all(branchId)
  },

  cancelOrder: (orderId, reason, cancelledByUserId = null) => {
    const db = getDb()
    const now = new Date().toISOString()

    const cancelTx = db.transaction(() => {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
      if (!order) throw new Error('Order not found.')
      if (order.status === 'CANCELLED') throw new Error('Order is already cancelled.')
      if (!reason || reason.trim() === '') throw new Error('Cancellation reason is required.')

      // Update order status
      db.prepare(`
        UPDATE orders
        SET status = 'CANCELLED', notes = COALESCE(notes || '\n[Cancelled: ' || ? || ']', '[Cancelled: ' || ? || ']'), updated_at = ?
        WHERE id = ?
      `).run(reason.trim(), reason.trim(), now, orderId)

      const validCancelledBy = resolveValidUserId(db, cancelledByUserId)

      // Add to status history
      db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, ?, 'CANCELLED', ?, ?, ?)
      `).run(uuid(), orderId, order.status, validCancelledBy, `Cancelled: ${reason.trim()}`, now)

      if (order.table_id) {
        db.prepare("UPDATE dining_tables SET status = 'AVAILABLE', current_order_id = NULL, updated_at = ? WHERE id = ?")
          .run(now, order.table_id)
      }

      if (order.stock_posted === 1) {
        inventoryRepository.reverseRecipeStockForOrder(orderId, `Void restock: ${reason.trim()}`)
      } else {
        inventoryRepository.releaseReservedStockForOrder(orderId)
      }

      logAudit(order.branch_id, 'CANCEL_ORDER', 'ORDER', orderId, {
        orderNumber: order.order_number,
        reason: reason.trim(),
      })
      enqueueOutbox('ORDER', orderId, 'CANCELLED', { reason: reason.trim() })

      return true
    })

    return cancelTx()
  },

  getOrders: ({ branchId, status = null, orderType = null, search = '', limit = 50, offset = 0 } = {}) => {
    const db = getDb()
    let sql = `
      SELECT o.id, o.order_number, o.order_type, o.status, o.total_cents, o.paid_cents,
             o.discount_cents, o.tax_cents, o.created_at, o.notes,
             t.table_number, f.name as floor_name,
             c.name as customer_name, c.phone as customer_phone,
             u.display_name as cashier_name,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count
      FROM orders o
      LEFT JOIN dining_tables t ON o.table_id = t.id
      LEFT JOIN floors f ON t.floor_id = f.id
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN users u ON o.cashier_id = u.id
      WHERE (o.branch_id = ? OR o.branch_id IS NULL)
    `
    const params = [branchId]

    if (status && status !== 'ALL') {
      sql += ' AND o.status = ?'
      params.push(status)
    }

    if (orderType && orderType !== 'ALL') {
      sql += ' AND o.order_type = ?'
      params.push(orderType)
    }

    if (search && search.trim() !== '') {
      sql += ' AND (o.order_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR t.table_number LIKE ?)'
      const term = `%${search.trim()}%`
      params.push(term, term, term, term)
    }

    sql += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    return db.prepare(sql).all(...params)
  },

  getRecentOrders: (branchId, limit = 20) => {
    return orderRepository.getOrders({ branchId, limit })
  },

  refundOrder: ({ orderId, amountCents, reason, restock = true, cashierId = null, refundMethod = null, items = [] }) => {
    const db = getDb()
    const now = new Date().toISOString()

    const refundTx = db.transaction(() => {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
      if (!order) throw new Error('Order not found.')
      if (order.status === 'CANCELLED') throw new Error('Cannot refund a cancelled order. Use a void/cancel record instead.')
      if (!reason || !String(reason).trim()) throw new Error('Refund reason is required.')

      const amount = Math.round(Number(amountCents) || 0)
      if (amount <= 0) throw new Error('Refund amount must be greater than zero.')

      const alreadyRefunded = order.refunded_cents || 0
      const maxRefundable = Math.max(0, (order.paid_cents || 0) - alreadyRefunded)
      if (amount > maxRefundable) {
        throw new Error(`Refund exceeds remaining paid amount ($${(maxRefundable / 100).toFixed(2)}).`)
      }

      const validCashierId = resolveValidUserId(db, cashierId)
      const refundId = uuid()

      const originalPay = db.prepare(`
        SELECT payment_method FROM payments WHERE order_id = ? AND status = 'COMPLETED' ORDER BY created_at DESC LIMIT 1
      `).get(orderId)
      const method = String(refundMethod || originalPay?.payment_method || 'CASH').toUpperCase()

      db.prepare(`
        INSERT INTO refunds (id, branch_id, order_id, payment_id, cashier_id, amount_cents, reason, restock, created_at, refund_method)
        VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
      `).run(
        refundId,
        order.branch_id,
        orderId,
        validCashierId,
        amount,
        String(reason).trim(),
        restock ? 1 : 0,
        now,
        method
      )

      if (Array.isArray(items)) {
        for (const line of items) {
          if (!line.orderItemId || !line.quantity) continue
          db.prepare(`
            INSERT INTO refund_items (id, refund_id, order_item_id, quantity, amount_cents, reason)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(uuid(), refundId, line.orderItemId, parseFloat(line.quantity), parseInt(line.amountCents || 0, 10), line.reason || reason)
        }
      }

      const newRefunded = alreadyRefunded + amount
      const fullyRefunded = newRefunded >= (order.paid_cents || 0)
      const nextStatus = fullyRefunded ? 'REFUNDED' : order.status

      db.prepare(`
        UPDATE orders
        SET refunded_cents = ?, status = ?, updated_at = ?
        WHERE id = ?
      `).run(newRefunded, nextStatus, now, orderId)

      db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuid(),
        orderId,
        order.status,
        nextStatus,
        validCashierId,
        `Refund $${(amount / 100).toFixed(2)}: ${String(reason).trim()}`,
        now
      )

      const openSession = db.prepare(`
        SELECT id FROM cash_sessions
        WHERE branch_id = ? AND status = 'OPEN'
        ORDER BY opened_at DESC LIMIT 1
      `).get(order.branch_id)
      if (openSession && method === 'CASH') {
        db.prepare(`
          UPDATE cash_sessions
          SET total_refunds_cents = COALESCE(total_refunds_cents, 0) + ?
          WHERE id = ?
        `).run(amount, openSession.id)
      }

      if (restock && fullyRefunded && order.stock_posted === 1) {
        inventoryRepository.reverseRecipeStockForOrder(orderId, `Refund restock: ${String(reason).trim()}`)
      }

      if (fullyRefunded && order.loyalty_awarded === 1 && order.customer_id) {
        const points = Math.max(0, Math.floor((order.total_cents || 0) / 100))
        if (points > 0) {
          customerRepository.adjustLoyaltyPoints({
            customerId: order.customer_id,
            branchId: order.branch_id,
            orderId,
            pointsChanged: -points,
            transactionType: 'ADJUSTMENT',
            notes: `Loyalty reversal for refunded ${order.order_number}`,
          })
          db.prepare('UPDATE orders SET loyalty_awarded = 0, updated_at = ? WHERE id = ?').run(now, orderId)
        }
      }

      logAudit(order.branch_id, 'REFUND_ORDER', 'ORDER', orderId, {
        orderNumber: order.order_number,
        amountCents: amount,
        restock: Boolean(restock),
        reason: String(reason).trim(),
      })
      enqueueOutbox('ORDER', orderId, 'REFUNDED', { amountCents: amount, fullyRefunded })

      return orderRepository.getOrderDetails(orderId)
    })

    return refundTx()
  },
}
