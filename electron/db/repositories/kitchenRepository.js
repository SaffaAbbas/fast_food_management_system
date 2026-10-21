import { getDb } from '../index.js'
import crypto from 'node:crypto'

function uuid() {
  return crypto.randomUUID()
}

/**
 * Kitchen Display System (KDS) Repository
 * Manages kitchen stations, real-time ticket statuses, preparation tracking, and KOT generation.
 */
export const kitchenRepository = {
  /**
   * Retrieve active kitchen stations for a branch
   */
  getStations: (branchId) => {
    const db = getDb()
    const targetBranchId = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    return db.prepare(`
      SELECT * FROM kitchen_stations
      WHERE branch_id = ? AND is_active = 1
      ORDER BY display_order ASC, name ASC
    `).all(targetBranchId)
  },

  /**
   * Create a new kitchen station
   */
  createStation: (stationData) => {
    const db = getDb()
    const id = stationData.id || uuid()
    const now = new Date().toISOString()
    const targetBranchId = stationData.branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    db.prepare(`
      INSERT INTO kitchen_stations (id, branch_id, name, code, color_code, display_order, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      id,
      targetBranchId,
      stationData.name,
      (stationData.code || stationData.name.slice(0, 5)).toUpperCase(),
      stationData.colorCode || '#f97316',
      stationData.displayOrder || 0,
      now
    )

    return db.prepare('SELECT * FROM kitchen_stations WHERE id = ?').get(id)
  },

  /**
   * Update an existing kitchen station
   */
  updateStation: (id, stationData) => {
    const db = getDb()
    const existing = db.prepare('SELECT * FROM kitchen_stations WHERE id = ?').get(id)
    if (!existing) throw new Error(`Kitchen station with ID "${id}" not found.`)

    db.prepare(`
      UPDATE kitchen_stations
      SET name = COALESCE(?, name),
          code = COALESCE(?, code),
          color_code = COALESCE(?, color_code),
          display_order = COALESCE(?, display_order),
          is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).run(
      stationData.name ?? null,
      stationData.code ? stationData.code.toUpperCase() : null,
      stationData.colorCode ?? null,
      stationData.displayOrder ?? null,
      stationData.isActive ?? null,
      id
    )

    return db.prepare('SELECT * FROM kitchen_stations WHERE id = ?').get(id)
  },

  /**
   * Get active kitchen orders and tickets
   * @param {object} params
   * @param {string} [params.branchId]
   * @param {string} [params.stationId] - Filter by station ID or 'ALL'
   * @param {string} [params.statusFilter] - 'ACTIVE' | 'READY' | 'COMPLETED' | 'ALL'
   */
  getKitchenOrders: (params = {}) => {
    const db = getDb()
    const branchId = params.branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const statusFilter = params.statusFilter || 'ACTIVE' // ACTIVE includes CONFIRMED, PREPARING, READY

    let statusCondition = ''
    if (statusFilter === 'ACTIVE') {
      statusCondition = "o.status IN ('CONFIRMED', 'PREPARING', 'READY')"
    } else if (statusFilter === 'READY') {
      statusCondition = "o.status = 'READY'"
    } else if (statusFilter === 'COMPLETED') {
      // Completed in the last 60 minutes
      statusCondition = "o.status IN ('SERVED', 'COMPLETED') AND datetime(o.updated_at) >= datetime('now', '-60 minutes')"
    } else if (statusFilter !== 'ALL') {
      statusCondition = `o.status = '${statusFilter}'`
    } else {
      statusCondition = "o.status NOT IN ('DRAFT', 'CANCELLED')"
    }

    const query = `
      SELECT o.id, o.branch_id, o.order_number, o.order_type, o.status,
             o.table_id, o.customer_id, o.cashier_id, o.notes as order_notes,
             o.created_at, o.updated_at,
             o.kitchen_accepted_at, o.kitchen_ready_at, o.kitchen_completed_at,
             COALESCE(o.target_prep_minutes, 15) as target_prep_minutes,
             t.table_number, f.name as floor_name,
             c.name as customer_name, c.phone as customer_phone
      FROM orders o
      LEFT JOIN dining_tables t ON o.table_id = t.id
      LEFT JOIN floors f ON t.floor_id = f.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.branch_id = ? AND ${statusCondition}
      ORDER BY 
        CASE o.status
          WHEN 'CONFIRMED' THEN 1
          WHEN 'PREPARING' THEN 2
          WHEN 'READY' THEN 3
          ELSE 4
        END,
        o.created_at ASC
    `

    const orders = db.prepare(query).all(branchId)
    const nowMs = Date.now()

    // Fetch items and modifiers for each order
    const enrichedOrders = []

    for (const ord of orders) {
      const itemsQuery = `
        SELECT oi.*, 
               p.name as catalog_product_name,
               ks.id as station_id,
               ks.name as station_name,
               ks.code as station_code,
               ks.color_code as station_color
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        LEFT JOIN kitchen_stations ks ON COALESCE(oi.kitchen_station_id, p.kitchen_station_id) = ks.id
        WHERE oi.order_id = ?
        ORDER BY oi.id ASC
      `

      let items = db.prepare(itemsQuery).all(ord.id)

      // Attach modifiers for each item
      items = items.map((item) => {
        const modifiers = db.prepare(`
          SELECT * FROM order_item_modifiers WHERE order_item_id = ?
        `).all(item.id)

        return {
          ...item,
          modifiers,
        }
      })

      // If filtering by station, check if order has items for this station
      if (params.stationId && params.stationId !== 'ALL') {
        const hasStationItem = items.some((it) => it.station_id === params.stationId)
        if (!hasStationItem) continue
      }

      // Calculate elapsed time in minutes
      const orderCreatedMs = new Date(ord.created_at).getTime()
      const elapsedMinutes = Math.max(0, Math.floor((nowMs - orderCreatedMs) / 60000))

      // Delay status
      let delayStatus = 'NORMAL' // < 10 mins
      if (elapsedMinutes >= ord.target_prep_minutes) {
        delayStatus = 'DELAYED' // Urgent alert
      } else if (elapsedMinutes >= Math.floor(ord.target_prep_minutes * 0.65)) {
        delayStatus = 'WARNING' // Approaching target
      }

      const totalItemsCount = items.reduce((acc, it) => acc + (it.quantity || 1), 0)
      const readyItemsCount = items.filter((it) => it.kitchen_status === 'READY').reduce((acc, it) => acc + (it.quantity || 1), 0)
      const isAllItemsReady = items.length > 0 && items.every((it) => it.kitchen_status === 'READY')

      enrichedOrders.push({
        ...ord,
        elapsedMinutes,
        delayStatus,
        totalItemsCount,
        readyItemsCount,
        isAllItemsReady,
        items,
      })
    }

    return enrichedOrders
  },

  /**
   * Update individual order item kitchen status
   * Transitions: PENDING -> PREPARING -> READY -> SERVED
   */
  updateOrderItemStatus: ({ orderItemId, status, userId }) => {
    const db = getDb()
    const allowed = ['PENDING', 'PREPARING', 'READY', 'SERVED']
    if (!allowed.includes(status)) {
      throw new Error(`Invalid item status "${status}". Allowed: ${allowed.join(', ')}`)
    }

    const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(orderItemId)
    if (!item) throw new Error(`Order item with ID "${orderItemId}" not found.`)

    const now = new Date().toISOString()

    const updateItemTx = db.transaction(() => {
      let startedCooking = item.started_cooking_at
      let completedCooking = item.completed_cooking_at

      if (status === 'PREPARING' && !startedCooking) {
        startedCooking = now
      } else if (status === 'READY' && !completedCooking) {
        completedCooking = now
      }

      db.prepare(`
        UPDATE order_items
        SET kitchen_status = ?,
            started_cooking_at = ?,
            completed_cooking_at = ?
        WHERE id = ?
      `).run(status, startedCooking, completedCooking, orderItemId)

      // Check all sibling items for the parent order
      const siblingItems = db.prepare('SELECT kitchen_status FROM order_items WHERE order_id = ?').all(item.order_id)
      const allReady = siblingItems.every((si) => si.kitchen_status === 'READY')
      const anyPreparing = siblingItems.some((si) => si.kitchen_status === 'PREPARING' || si.kitchen_status === 'READY')

      const parentOrder = db.prepare('SELECT id, status, branch_id, order_number FROM orders WHERE id = ?').get(item.order_id)

      if (allReady && parentOrder && parentOrder.status !== 'READY' && parentOrder.status !== 'COMPLETED' && parentOrder.status !== 'SERVED') {
        // Auto-promote order to READY!
        db.prepare(`
          UPDATE orders
          SET status = 'READY',
              kitchen_ready_at = ?,
              updated_at = ?
          WHERE id = ?
        `).run(now, now, item.order_id)

        db.prepare(`
          INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
          VALUES (?, ?, ?, 'READY', ?, 'All kitchen items prepared and ready', ?)
        `).run(uuid(), item.order_id, parentOrder.status, userId || null, now)
      } else if (anyPreparing && parentOrder && parentOrder.status === 'CONFIRMED') {
        // Promote order to PREPARING
        db.prepare(`
          UPDATE orders
          SET status = 'PREPARING',
              kitchen_accepted_at = COALESCE(kitchen_accepted_at, ?),
              updated_at = ?
          WHERE id = ?
        `).run(now, now, item.order_id)

        db.prepare(`
          INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
          VALUES (?, ?, 'CONFIRMED', 'PREPARING', ?, 'Kitchen started preparation', ?)
        `).run(uuid(), item.order_id, userId || null, now)
      }

      return db.prepare('SELECT * FROM order_items WHERE id = ?').get(orderItemId)
    })

    return updateItemTx()
  },

  /**
   * Update full order status in Kitchen workflow
   * @param {object} params
   * @param {string} params.orderId
   * @param {string} params.status - 'PREPARING' | 'READY' | 'SERVED' | 'COMPLETED'
   * @param {string} [params.userId]
   * @param {string} [params.notes]
   */
  updateOrderStatus: ({ orderId, status, userId, notes }) => {
    const db = getDb()
    const allowed = ['CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED']
    if (!allowed.includes(status)) {
      throw new Error(`Invalid status "${status}". Allowed: ${allowed.join(', ')}`)
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
    if (!order) throw new Error(`Order with ID "${orderId}" not found.`)

    const now = new Date().toISOString()

    const updateOrderTx = db.transaction(() => {
      let kitchenAcceptedAt = order.kitchen_accepted_at
      let kitchenReadyAt = order.kitchen_ready_at
      let kitchenCompletedAt = order.kitchen_completed_at

      if (status === 'PREPARING' && !kitchenAcceptedAt) {
        kitchenAcceptedAt = now
      } else if (status === 'READY' && !kitchenReadyAt) {
        kitchenReadyAt = now
      } else if ((status === 'SERVED' || status === 'COMPLETED') && !kitchenCompletedAt) {
        kitchenCompletedAt = now
      }

      db.prepare(`
        UPDATE orders
        SET status = ?,
            kitchen_accepted_at = ?,
            kitchen_ready_at = ?,
            kitchen_completed_at = ?,
            updated_at = ?
        WHERE id = ?
      `).run(status, kitchenAcceptedAt, kitchenReadyAt, kitchenCompletedAt, now, orderId)

      // Cascade status to items
      if (status === 'PREPARING') {
        db.prepare(`
          UPDATE order_items
          SET kitchen_status = 'PREPARING',
              started_cooking_at = COALESCE(started_cooking_at, ?)
          WHERE order_id = ? AND kitchen_status = 'PENDING'
        `).run(now, orderId)
      } else if (status === 'READY') {
        db.prepare(`
          UPDATE order_items
          SET kitchen_status = 'READY',
              completed_cooking_at = COALESCE(completed_cooking_at, ?)
          WHERE order_id = ? AND kitchen_status != 'READY'
        `).run(now, orderId)
      }

      // Record in status history
      db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuid(), orderId, order.status, status, userId || null, notes || `Status updated to ${status}`, now)

      // Audit log
      db.prepare(`
        INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
        VALUES (?, ?, ?, 'UPDATE_KITCHEN_STATUS', 'ORDER', ?, ?, ?)
      `).run(
        uuid(),
        order.branch_id,
        userId || null,
        orderId,
        JSON.stringify({ from: order.status, to: status, orderNumber: order.order_number }),
        now
      )

      return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
    })

    return updateOrderTx()
  },

  /**
   * Get KDS summary metrics (Active orders, Preparing, Ready, Delayed count, Avg cook time)
   */
  getKitchenMetrics: (branchId) => {
    const db = getDb()
    const targetBranchId = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    const activeTickets = db.prepare(`
      SELECT COUNT(*) as count FROM orders
      WHERE branch_id = ? AND status IN ('CONFIRMED', 'PREPARING', 'READY')
    `).get(targetBranchId).count

    const preparingTickets = db.prepare(`
      SELECT COUNT(*) as count FROM orders
      WHERE branch_id = ? AND status = 'PREPARING'
    `).get(targetBranchId).count

    const readyTickets = db.prepare(`
      SELECT COUNT(*) as count FROM orders
      WHERE branch_id = ? AND status = 'READY'
    `).get(targetBranchId).count

    const completedToday = db.prepare(`
      SELECT COUNT(*) as count FROM orders
      WHERE branch_id = ? AND status IN ('SERVED', 'COMPLETED')
        AND date(created_at) = date('now')
    `).get(targetBranchId).count

    // Calculate count of delayed orders
    const activeOrders = db.prepare(`
      SELECT created_at, COALESCE(target_prep_minutes, 15) as target_prep_minutes
      FROM orders
      WHERE branch_id = ? AND status IN ('CONFIRMED', 'PREPARING')
    `).all(targetBranchId)

    const nowMs = Date.now()
    let delayedCount = 0
    for (const o of activeOrders) {
      const elapsed = (nowMs - new Date(o.created_at).getTime()) / 60000
      if (elapsed >= o.target_prep_minutes) delayedCount++
    }

    return {
      activeTickets,
      preparingTickets,
      readyTickets,
      delayedCount,
      completedToday,
    }
  },
}
