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
    console.error('[Reservation Audit Log Error]:', err)
  }
}

export const reservationRepository = {
  /**
   * Get list of reservations
   */
  getReservations: ({ branchId, date = null, status = null, search = '' } = {}) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, branchId)

    let sql = `
      SELECT r.*,
             t.table_number, t.capacity as table_capacity,
             f.name as floor_name,
             c.tag as customer_tag, c.email as customer_email, c.loyalty_points
      FROM reservations r
      LEFT JOIN dining_tables t ON r.table_id = t.id
      LEFT JOIN floors f ON t.floor_id = f.id
      LEFT JOIN customers c ON r.customer_id = c.id
      WHERE r.branch_id = ?
    `
    const params = [validBranchId]

    if (date) {
      sql += ' AND (r.reservation_date = ? OR r.reservation_time LIKE ?)'
      params.push(date, `${date}%`)
    }

    if (status && status !== 'ALL') {
      sql += ' AND r.status = ?'
      params.push(status)
    }

    if (search && search.trim() !== '') {
      sql += ' AND (r.customer_name LIKE ? OR r.customer_phone LIKE ? OR t.table_number LIKE ?)'
      const term = `%${search.trim()}%`
      params.push(term, term, term)
    }

    sql += ' ORDER BY r.reservation_date ASC, r.reservation_time ASC'
    return db.prepare(sql).all(...params)
  },

  /**
   * Get single reservation by ID
   */
  getReservationById: (id) => {
    const db = getDb()
    return db.prepare(`
      SELECT r.*,
             t.table_number, t.capacity as table_capacity,
             f.name as floor_name,
             c.tag as customer_tag, c.email as customer_email
      FROM reservations r
      LEFT JOIN dining_tables t ON r.table_id = t.id
      LEFT JOIN floors f ON t.floor_id = f.id
      LEFT JOIN customers c ON r.customer_id = c.id
      WHERE r.id = ?
    `).get(id)
  },

  /**
   * Create new reservation with double-booking prevention
   */
  createReservation: (data) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, data.branchId)
    const reservationId = uuid()
    const now = new Date().toISOString()

    const createTx = db.transaction(() => {
      const resDate = data.reservationDate || data.reservationTime.slice(0, 10)
      const resTime = data.reservationTime // e.g. "2026-10-21T19:00:00" or "19:00"
      const durationMins = data.durationMinutes || 90

      // Double-booking check: If table is assigned, ensure no overlapping reservation
      if (data.tableId) {
        const existingBookings = db.prepare(`
          SELECT id, customer_name, reservation_time, duration_minutes
          FROM reservations
          WHERE table_id = ? AND (reservation_date = ? OR reservation_time LIKE ?)
            AND status IN ('CONFIRMED', 'PENDING', 'SEATED')
        `).all(data.tableId, resDate, `${resDate}%`)

        for (const b of existingBookings) {
          // Check timestamp overlap if full ISO timestamps
          const existingStart = new Date(b.reservation_time).getTime()
          const newStart = new Date(resTime).getTime()

          if (!isNaN(existingStart) && !isNaN(newStart)) {
            const existingEnd = existingStart + (b.duration_minutes || 90) * 60 * 1000
            const newEnd = newStart + durationMins * 60 * 1000

            // Overlap condition
            if (newStart < existingEnd && newEnd > existingStart) {
              const table = db.prepare('SELECT table_number FROM dining_tables WHERE id = ?').get(data.tableId)
              throw new Error(
                `Table ${table?.table_number || ''} is already booked by "${b.customer_name}" during this time window.`
              )
            }
          }
        }
      }

      // Check or create customer link
      let linkedCustomerId = data.customerId || null
      if (!linkedCustomerId && data.customerPhone) {
        const cust = db.prepare('SELECT id FROM customers WHERE phone = ?').get(data.customerPhone.trim())
        if (cust) linkedCustomerId = cust.id
      }

      const initialStatus = data.status || 'CONFIRMED'

      db.prepare(`
        INSERT INTO reservations (
          id, branch_id, customer_id, table_id, customer_name, customer_phone,
          party_size, reservation_date, reservation_time, duration_minutes,
          status, deposit_cents, deposit_payment_method, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reservationId,
        validBranchId,
        linkedCustomerId,
        data.tableId || null,
        data.customerName.trim(),
        data.customerPhone.trim(),
        parseInt(data.partySize, 10) || 2,
        resDate,
        resTime,
        durationMins,
        initialStatus,
        Math.max(0, parseInt(data.depositCents, 10) || 0),
        data.depositPaymentMethod || null,
        data.notes || null,
        now,
        now
      )

      // If reservation is for today and table is assigned, mark table as RESERVED
      const today = now.slice(0, 10)
      if (resDate === today && data.tableId && initialStatus === 'CONFIRMED') {
        db.prepare("UPDATE dining_tables SET status = 'RESERVED', updated_at = ? WHERE id = ? AND status = 'AVAILABLE'")
          .run(now, data.tableId)
      }

      logAudit(validBranchId, 'CREATE_RESERVATION', 'RESERVATION', reservationId, {
        customerName: data.customerName,
        partySize: data.partySize,
        reservationDate: resDate,
        tableId: data.tableId,
      })

      return reservationRepository.getReservationById(reservationId)
    })

    return createTx()
  },

  /**
   * Update reservation status (Seated, Cancelled, Completed, No-Show)
   */
  updateReservationStatus: (id, status) => {
    const db = getDb()
    const res = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id)
    if (!res) throw new Error('Reservation not found.')

    const now = new Date().toISOString()
    const normalizedStatus = status.toUpperCase()

    const updateTx = db.transaction(() => {
      db.prepare('UPDATE reservations SET status = ?, updated_at = ? WHERE id = ?')
        .run(normalizedStatus, now, id)

      // Synchronize Table Status
      if (res.table_id) {
        if (normalizedStatus === 'SEATED') {
          db.prepare("UPDATE dining_tables SET status = 'OCCUPIED', updated_at = ? WHERE id = ?")
            .run(now, res.table_id)
        } else if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(normalizedStatus)) {
          // Free table back to AVAILABLE if not occupied by active order
          db.prepare(`
            UPDATE dining_tables
            SET status = 'AVAILABLE', updated_at = ?
            WHERE id = ? AND status = 'RESERVED'
          `).run(now, res.table_id)
        }
      }

      logAudit(res.branch_id, `RESERVATION_${normalizedStatus}`, 'RESERVATION', id, {
        previousStatus: res.status,
        newStatus: normalizedStatus,
      })

      return reservationRepository.getReservationById(id)
    })

    return updateTx()
  },

  /**
   * Check Table Availability for a given date, time and party size
   */
  checkAvailability: ({ branchId, date, time, partySize, durationMinutes = 90 }) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, branchId)

    const requiredCap = parseInt(partySize, 10) || 1
    const targetStart = new Date(`${date}T${time}`).getTime()
    const targetEnd = targetStart + durationMinutes * 60 * 1000

    // Get all active tables with capacity >= partySize
    const eligibleTables = db.prepare(`
      SELECT t.*, f.name as floor_name
      FROM dining_tables t
      JOIN floors f ON t.floor_id = f.id
      WHERE t.branch_id = ? AND t.is_active = 1 AND t.capacity >= ?
      ORDER BY t.capacity ASC, t.table_number ASC
    `).all(validBranchId, requiredCap)

    // Check reservations on this date
    const dayBookings = db.prepare(`
      SELECT table_id, reservation_time, duration_minutes
      FROM reservations
      WHERE branch_id = ? AND (reservation_date = ? OR reservation_time LIKE ?)
        AND status IN ('CONFIRMED', 'PENDING', 'SEATED') AND table_id IS NOT NULL
    `).all(validBranchId, date, `${date}%`)

    const bookedTableIds = new Set()
    for (const b of dayBookings) {
      const bStart = new Date(b.reservation_time).getTime()
      if (!isNaN(bStart) && !isNaN(targetStart)) {
        const bEnd = bStart + (b.duration_minutes || 90) * 60 * 1000
        if (targetStart < bEnd && targetEnd > bStart) {
          bookedTableIds.add(b.table_id)
        }
      }
    }

    return eligibleTables.map((t) => ({
      ...t,
      isAvailable: !bookedTableIds.has(t.id),
    }))
  },
}
