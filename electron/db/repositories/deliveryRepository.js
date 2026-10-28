import crypto from 'node:crypto'
import { getDb } from '../index.js'

function uuid() {
  return crypto.randomUUID()
}

export const deliveryRepository = {
  // =========================================================================
  // 1. DELIVERY ZONES
  // =========================================================================
  getZones(branchId) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    return db
      .prepare(`
        SELECT * FROM delivery_zones
        WHERE branch_id = ?
        ORDER BY delivery_charge_cents ASC
      `)
      .all(targetBranch)
  },

  createZone(data) {
    const db = getDb()
    const branchId = data.branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const id = uuid()
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO delivery_zones (
        id, branch_id, name, delivery_charge_cents, min_order_cents,
        estimated_minutes, description, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id,
      branchId,
      data.name.trim(),
      parseInt(data.deliveryChargeCents, 10) || 0,
      parseInt(data.minOrderCents, 10) || 0,
      parseInt(data.estimatedMinutes, 10) || 30,
      data.description || null,
      now,
      now
    )

    return db.prepare('SELECT * FROM delivery_zones WHERE id = ?').get(id)
  },

  updateZone(id, data) {
    const db = getDb()
    const fields = []
    const params = []

    if (data.name !== undefined) {
      fields.push('name = ?')
      params.push(data.name.trim())
    }
    if (data.deliveryChargeCents !== undefined) {
      fields.push('delivery_charge_cents = ?')
      params.push(parseInt(data.deliveryChargeCents, 10))
    }
    if (data.minOrderCents !== undefined) {
      fields.push('min_order_cents = ?')
      params.push(parseInt(data.minOrderCents, 10))
    }
    if (data.estimatedMinutes !== undefined) {
      fields.push('estimated_minutes = ?')
      params.push(parseInt(data.estimatedMinutes, 10))
    }
    if (data.description !== undefined) {
      fields.push('description = ?')
      params.push(data.description)
    }
    if (data.isActive !== undefined) {
      fields.push('is_active = ?')
      params.push(data.isActive ? 1 : 0)
    }

    if (fields.length === 0) return db.prepare('SELECT * FROM delivery_zones WHERE id = ?').get(id)

    fields.push('updated_at = ?')
    params.push(new Date().toISOString())
    params.push(id)

    db.prepare(`UPDATE delivery_zones SET ${fields.join(', ')} WHERE id = ?`).run(...params)
    return db.prepare('SELECT * FROM delivery_zones WHERE id = ?').get(id)
  },

  // =========================================================================
  // 2. RIDERS FLEET
  // =========================================================================
  getRiders(branchId, status = null) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    let query = `
      SELECT r.*,
        (SELECT COUNT(*) FROM deliveries d WHERE d.rider_id = r.id AND d.status = 'OUT_FOR_DELIVERY') as active_deliveries_count,
        (SELECT SUM(d.cod_collected_cents) FROM deliveries d WHERE d.rider_id = r.id AND d.status = 'DELIVERED' AND d.cod_settled = 0) as unsettled_cod_cents
      FROM riders r
      WHERE r.branch_id = ? AND r.is_active = 1
    `
    const params = [targetBranch]

    if (status) {
      query += ' AND r.status = ?'
      params.push(status)
    }

    query += ' ORDER BY r.name ASC'
    return db.prepare(query).all(...params)
  },

  getRiderById(id) {
    const db = getDb()
    return db
      .prepare(`
        SELECT r.*,
          (SELECT COUNT(*) FROM deliveries d WHERE d.rider_id = r.id AND d.status = 'OUT_FOR_DELIVERY') as active_deliveries_count,
          (SELECT SUM(d.cod_collected_cents) FROM deliveries d WHERE d.rider_id = r.id AND d.status = 'DELIVERED' AND d.cod_settled = 0) as unsettled_cod_cents
        FROM riders r
        WHERE r.id = ?
      `)
      .get(id)
  },

  createRider(data) {
    const db = getDb()
    const branchId = data.branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const id = uuid()
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO riders (
        id, branch_id, employee_id, name, phone, vehicle_type,
        license_plate, status, image_url, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', ?, 1, ?, ?)
    `).run(
      id,
      branchId,
      data.employeeId || null,
      data.name.trim(),
      data.phone.trim(),
      data.vehicleType || 'MOTORCYCLE',
      data.licensePlate ? data.licensePlate.trim() : null,
      data.imageUrl || data.image_url || null,
      now,
      now
    )

    return this.getRiderById(id)
  },

  updateRider(id, data) {
    const db = getDb()
    const fields = []
    const params = []

    if (data.name !== undefined) {
      fields.push('name = ?')
      params.push(data.name.trim())
    }
    if (data.phone !== undefined) {
      fields.push('phone = ?')
      params.push(data.phone.trim())
    }
    if (data.vehicleType !== undefined) {
      fields.push('vehicle_type = ?')
      params.push(data.vehicleType)
    }
    if (data.licensePlate !== undefined) {
      fields.push('license_plate = ?')
      params.push(data.licensePlate)
    }
    if (data.status !== undefined) {
      fields.push('status = ?')
      params.push(data.status)
    }
    if (data.isActive !== undefined) {
      fields.push('is_active = ?')
      params.push(data.isActive ? 1 : 0)
    }
    if (data.imageUrl !== undefined || data.image_url !== undefined) {
      fields.push('image_url = ?')
      params.push(data.imageUrl !== undefined ? data.imageUrl : data.image_url)
    }

    if (fields.length === 0) return this.getRiderById(id)

    fields.push('updated_at = ?')
    params.push(new Date().toISOString())
    params.push(id)

    db.prepare(`UPDATE riders SET ${fields.join(', ')} WHERE id = ?`).run(...params)
    return this.getRiderById(id)
  },

  updateRiderStatus(id, status) {
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare('UPDATE riders SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id)
    return this.getRiderById(id)
  },

  // =========================================================================
  // 3. DISPATCH & DELIVERIES
  // =========================================================================
  getDeliveries(branchId, filters = {}) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    let query = `
      SELECT
        d.*,
        o.order_number,
        o.total_cents as order_total_cents,
        o.paid_cents as order_paid_cents,
        o.status as order_status,
        z.name as zone_name,
        z.delivery_charge_cents,
        z.estimated_minutes,
        r.name as rider_name,
        r.phone as rider_phone,
        r.vehicle_type as rider_vehicle
      FROM deliveries d
      JOIN orders o ON d.order_id = o.id
      LEFT JOIN delivery_zones z ON d.zone_id = z.id
      LEFT JOIN riders r ON d.rider_id = r.id
      WHERE d.branch_id = ?
    `
    const params = [targetBranch]

    if (filters.status) {
      query += ' AND d.status = ?'
      params.push(filters.status)
    }

    if (filters.riderId) {
      query += ' AND d.rider_id = ?'
      params.push(filters.riderId)
    }

    if (filters.date) {
      query += ' AND d.created_at LIKE ?'
      params.push(`${filters.date}%`)
    }

    query += ' ORDER BY d.created_at DESC'
    return db.prepare(query).all(...params)
  },

  getDeliveryById(id) {
    const db = getDb()
    return db
      .prepare(`
        SELECT
          d.*,
          o.order_number,
          o.total_cents as order_total_cents,
          o.paid_cents as order_paid_cents,
          o.status as order_status,
          z.name as zone_name,
          r.name as rider_name,
          r.phone as rider_phone,
          r.vehicle_type as rider_vehicle
        FROM deliveries d
        JOIN orders o ON d.order_id = o.id
        LEFT JOIN delivery_zones z ON d.zone_id = z.id
        LEFT JOIN riders r ON d.rider_id = r.id
        WHERE d.id = ?
      `)
      .get(id)
  },

  createDelivery(data) {
    const db = getDb()
    const branchId = data.branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const id = uuid()
    const now = new Date().toISOString()

    // Retrieve order
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(data.orderId)
    if (!order) throw new Error(`Order not found: ${data.orderId}`)

    // Compute COD balance (unpaid balance)
    const codAmountCents = data.codAmountCents !== undefined
      ? parseInt(data.codAmountCents, 10)
      : Math.max(0, order.total_cents - (order.paid_cents || 0))

    db.prepare(`
      INSERT INTO deliveries (
        id, order_id, branch_id, zone_id, rider_id,
        customer_name, customer_phone, delivery_address,
        delivery_instructions, status, cod_amount_cents,
        cod_collected_cents, cod_settled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, 0, 0, ?, ?)
    `).run(
      id,
      data.orderId,
      branchId,
      data.zoneId || null,
      data.riderId || null,
      data.customerName.trim(),
      data.customerPhone.trim(),
      data.deliveryAddress.trim(),
      data.deliveryInstructions || null,
      codAmountCents,
      now,
      now
    )

    // If rider was directly supplied, assign them
    if (data.riderId) {
      this.assignRider(id, data.riderId)
    }

    return this.getDeliveryById(id)
  },

  assignRider(deliveryId, riderId) {
    const db = getDb()
    const now = new Date().toISOString()

    const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId)
    if (!delivery) throw new Error('Delivery not found.')

    const rider = db.prepare('SELECT * FROM riders WHERE id = ?').get(riderId)
    if (!rider) throw new Error('Rider not found.')

    const assignTx = db.transaction(() => {
      // Update delivery record
      db.prepare(`
        UPDATE deliveries
        SET rider_id = ?, status = 'ASSIGNED', updated_at = ?
        WHERE id = ?
      `).run(riderId, now, deliveryId)

      // Update rider status
      db.prepare(`
        UPDATE riders
        SET status = 'ASSIGNED', current_delivery_id = ?, updated_at = ?
        WHERE id = ?
      `).run(deliveryId, now, riderId)
    })

    assignTx()
    return this.getDeliveryById(deliveryId)
  },

  dispatchDelivery(deliveryId) {
    const db = getDb()
    const now = new Date().toISOString()

    const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId)
    if (!delivery) throw new Error('Delivery not found.')
    if (!delivery.rider_id) throw new Error('Cannot dispatch without an assigned rider.')

    const dispatchTx = db.transaction(() => {
      // Update delivery
      db.prepare(`
        UPDATE deliveries
        SET status = 'OUT_FOR_DELIVERY', dispatched_at = ?, updated_at = ?
        WHERE id = ?
      `).run(now, now, deliveryId)

      // Update rider
      db.prepare(`
        UPDATE riders
        SET status = 'OUT_FOR_DELIVERY', updated_at = ?
        WHERE id = ?
      `).run(now, delivery.rider_id)

      // Update parent order
      db.prepare(`
        UPDATE orders
        SET status = 'OUT_FOR_DELIVERY', updated_at = ?
        WHERE id = ?
      `).run(now, delivery.order_id)
    })

    dispatchTx()
    return this.getDeliveryById(deliveryId)
  },

  completeDelivery(deliveryId, { codCollectedCents = null } = {}) {
    const db = getDb()
    const now = new Date().toISOString()

    const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId)
    if (!delivery) throw new Error('Delivery not found.')

    const collected = codCollectedCents !== null
      ? parseInt(codCollectedCents, 10)
      : delivery.cod_amount_cents

    const completeTx = db.transaction(() => {
      // Update delivery
      db.prepare(`
        UPDATE deliveries
        SET status = 'DELIVERED', delivered_at = ?, cod_collected_cents = ?, updated_at = ?
        WHERE id = ?
      `).run(now, collected, now, deliveryId)

      // If rider has no other active deliveries, set status to AVAILABLE
      if (delivery.rider_id) {
        const remainingOut = db
          .prepare("SELECT COUNT(*) as count FROM deliveries WHERE rider_id = ? AND status = 'OUT_FOR_DELIVERY' AND id != ?")
          .get(delivery.rider_id, deliveryId)?.count || 0

        const newRiderStatus = remainingOut > 0 ? 'OUT_FOR_DELIVERY' : 'AVAILABLE'
        db.prepare(`
          UPDATE riders
          SET status = ?, current_delivery_id = NULL, updated_at = ?
          WHERE id = ?
        `).run(newRiderStatus, now, delivery.rider_id)
      }

      // Update order to DELIVERED
      db.prepare(`
        UPDATE orders
        SET status = 'DELIVERED', paid_cents = total_cents, updated_at = ?
        WHERE id = ?
      `).run(now, delivery.order_id)
    })

    completeTx()
    return this.getDeliveryById(deliveryId)
  },

  failDelivery(deliveryId, reason) {
    const db = getDb()
    const now = new Date().toISOString()

    const delivery = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(deliveryId)
    if (!delivery) throw new Error('Delivery not found.')

    const failTx = db.transaction(() => {
      db.prepare(`
        UPDATE deliveries
        SET status = 'FAILED', failed_reason = ?, updated_at = ?
        WHERE id = ?
      `).run(reason || 'Customer unavailable', now, deliveryId)

      if (delivery.rider_id) {
        db.prepare(`
          UPDATE riders
          SET status = 'AVAILABLE', current_delivery_id = NULL, updated_at = ?
          WHERE id = ?
        `).run(now, delivery.rider_id)
      }
    })

    failTx()
    return this.getDeliveryById(deliveryId)
  },

  // =========================================================================
  // 4. CASH-ON-DELIVERY (COD) SETTLEMENT
  // =========================================================================
  getRiderPendingCod(riderId) {
    const db = getDb()
    const row = db
      .prepare(`
        SELECT
          COUNT(*) as delivered_orders_count,
          COALESCE(SUM(cod_collected_cents), 0) as pending_cod_cents
        FROM deliveries
        WHERE rider_id = ? AND status = 'DELIVERED' AND cod_settled = 0
      `)
      .get(riderId)

    const pendingDeliveries = db
      .prepare(`
        SELECT d.*, o.order_number
        FROM deliveries d
        JOIN orders o ON d.order_id = o.id
        WHERE d.rider_id = ? AND d.status = 'DELIVERED' AND d.cod_settled = 0
        ORDER BY d.delivered_at ASC
      `)
      .all(riderId)

    return {
      riderId,
      deliveredOrdersCount: row?.delivered_orders_count || 0,
      pendingCodCents: row?.pending_cod_cents || 0,
      deliveries: pendingDeliveries,
    }
  },

  settleRiderCod({ branchId, riderId, settledByUserId, notes = '' }) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const now = new Date().toISOString()
    const settlementId = uuid()

    const pending = this.getRiderPendingCod(riderId)
    if (pending.deliveredOrdersCount === 0 || pending.pendingCodCents === 0) {
      throw new Error('No pending Cash-on-Delivery funds to settle for this rider.')
    }

    const settleTx = db.transaction(() => {
      // 1. Record Settlement
      db.prepare(`
        INSERT INTO rider_settlements (
          id, branch_id, rider_id, settled_by_user_id,
          total_collected_cents, orders_count, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        settlementId,
        targetBranch,
        riderId,
        settledByUserId,
        pending.pendingCodCents,
        pending.deliveredOrdersCount,
        notes || null,
        now
      )

      // 2. Mark deliveries as settled
      db.prepare(`
        UPDATE deliveries
        SET cod_settled = 1, settlement_id = ?, settled_at = ?, updated_at = ?
        WHERE rider_id = ? AND status = 'DELIVERED' AND cod_settled = 0
      `).run(settlementId, now, now, riderId)
    })

    settleTx()

    return {
      settlementId,
      riderId,
      totalSettledCents: pending.pendingCodCents,
      ordersSettledCount: pending.deliveredOrdersCount,
      settledAt: now,
    }
  },

  getSettlementHistory(branchId, { riderId = null, date = null } = {}) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    let query = `
      SELECT
        s.*,
        r.name as rider_name,
        r.phone as rider_phone,
        u.display_name as settled_by_name
      FROM rider_settlements s
      JOIN riders r ON s.rider_id = r.id
      JOIN users u ON s.settled_by_user_id = u.id
      WHERE s.branch_id = ?
    `
    const params = [targetBranch]

    if (riderId) {
      query += ' AND s.rider_id = ?'
      params.push(riderId)
    }

    if (date) {
      query += ' AND s.created_at LIKE ?'
      params.push(`${date}%`)
    }

    query += ' ORDER BY s.created_at DESC'
    return db.prepare(query).all(...params)
  },

  // =========================================================================
  // 5. SUMMARY METRICS
  // =========================================================================
  getSummary(branchId) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    const totalRiders = db.prepare('SELECT COUNT(*) as count FROM riders WHERE branch_id = ? AND is_active = 1').get(targetBranch)?.count || 0
    const availableRiders = db.prepare("SELECT COUNT(*) as count FROM riders WHERE branch_id = ? AND is_active = 1 AND status = 'AVAILABLE'").get(targetBranch)?.count || 0
    const onTripRiders = db.prepare("SELECT COUNT(*) as count FROM riders WHERE branch_id = ? AND is_active = 1 AND status = 'OUT_FOR_DELIVERY'").get(targetBranch)?.count || 0

    const todayDate = new Date().toISOString().slice(0, 10)
    const pendingDispatches = db.prepare("SELECT COUNT(*) as count FROM deliveries WHERE branch_id = ? AND status IN ('PENDING', 'ASSIGNED')").get(targetBranch)?.count || 0
    const outForDelivery = db.prepare("SELECT COUNT(*) as count FROM deliveries WHERE branch_id = ? AND status = 'OUT_FOR_DELIVERY'").get(targetBranch)?.count || 0
    const deliveredToday = db.prepare("SELECT COUNT(*) as count FROM deliveries WHERE branch_id = ? AND status = 'DELIVERED' AND created_at LIKE ?").get(targetBranch, `${todayDate}%`)?.count || 0
    const pendingCodCents = db.prepare("SELECT COALESCE(SUM(cod_collected_cents), 0) as total FROM deliveries WHERE branch_id = ? AND status = 'DELIVERED' AND cod_settled = 0").get(targetBranch)?.total || 0

    return {
      totalRiders,
      availableRiders,
      onTripRiders,
      pendingDispatches,
      outForDelivery,
      deliveredToday,
      pendingCodCents,
    }
  },
}
