import { getDb } from '../index.js'
import crypto from 'node:crypto'
import { authRepository } from './authRepository.js'

function uuid() {
  return crypto.randomUUID()
}

function logAudit(branchId, action, entityType, entityId, details) {
  try {
    const db = getDb()
    const session = authRepository.getCurrentSession()
    let validUserId = null
    if (session?.id) {
      const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(session.id)
      if (exists) validUserId = session.id
    }
    db.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid(),
      branchId || session?.branchId || null,
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

export const tableRepository = {
  getFloorsWithTables: (branchId) => {
    const db = getDb()
    const floors = db.prepare(`
      SELECT id, name, display_order, is_active
      FROM floors
      WHERE (branch_id = ? OR branch_id IS NULL) AND is_active = 1
      ORDER BY display_order ASC, name ASC
    `).all(branchId)

    const tables = db.prepare(`
      SELECT t.id, t.floor_id, t.table_number, t.capacity, t.status, t.current_order_id, t.is_active,
             o.order_number as current_order_number,
             o.total_cents as current_order_total_cents,
             o.order_type as current_order_type,
             o.created_at as current_order_created_at,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as current_order_item_count
      FROM dining_tables t
      LEFT JOIN orders o ON t.current_order_id = o.id AND o.status != 'COMPLETED' AND o.status != 'CANCELLED'
      WHERE (t.branch_id = ? OR t.branch_id IS NULL) AND t.is_active = 1
      ORDER BY t.table_number ASC
    `).all(branchId)

    const now = Date.now()
    const tableMap = {}
    for (const t of tables) {
      let occupancyMinutes = 0
      if (t.current_order_created_at) {
        occupancyMinutes = Math.max(0, Math.floor((now - new Date(t.current_order_created_at).getTime()) / 60000))
      }
      const enrichedTable = {
        ...t,
        occupancyMinutes,
      }
      if (!tableMap[t.floor_id]) tableMap[t.floor_id] = []
      tableMap[t.floor_id].push(enrichedTable)
    }

    return floors.map((f) => ({
      ...f,
      tables: tableMap[f.id] || [],
    }))
  },

  updateTableStatus: (tableId, status, currentOrderId = null) => {
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare(`
      UPDATE dining_tables
      SET status = ?, current_order_id = ?, updated_at = ?
      WHERE id = ?
    `).run(status, currentOrderId, now, tableId)
    return true
  },

  createFloor: ({ branchId, name, displayOrder = 0 }) => {
    const db = getDb()
    const id = uuid()
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO floors (id, branch_id, name, display_order, is_active, created_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(id, branchId || null, name.trim(), displayOrder, now)

    logAudit(branchId, 'CREATE_FLOOR', 'FLOOR', id, { name })
    return { id, name, displayOrder, is_active: 1 }
  },

  updateFloor: (id, { name, displayOrder = 0 }) => {
    const db = getDb()
    db.prepare(`
      UPDATE floors SET name = ?, display_order = ? WHERE id = ?
    `).run(name.trim(), displayOrder, id)

    logAudit(null, 'UPDATE_FLOOR', 'FLOOR', id, { name })
    return true
  },

  createTable: ({ branchId, floorId, tableNumber, capacity = 4 }) => {
    const db = getDb()
    const id = uuid()
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO dining_tables (id, branch_id, floor_id, table_number, capacity, status, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'AVAILABLE', 1, ?, ?)
    `).run(id, branchId || null, floorId, tableNumber.trim(), capacity, now, now)

    logAudit(branchId, 'CREATE_TABLE', 'TABLE', id, { tableNumber, capacity })
    return { id, floorId, tableNumber, capacity, status: 'AVAILABLE', is_active: 1 }
  },

  updateTable: (id, { floorId, tableNumber, capacity, status }) => {
    const db = getDb()
    const now = new Date().toISOString()

    db.prepare(`
      UPDATE dining_tables
      SET floor_id = COALESCE(?, floor_id),
          table_number = COALESCE(?, table_number),
          capacity = COALESCE(?, capacity),
          status = COALESCE(?, status),
          updated_at = ?
      WHERE id = ?
    `).run(floorId || null, tableNumber ? tableNumber.trim() : null, capacity || null, status || null, now, id)

    logAudit(null, 'UPDATE_TABLE', 'TABLE', id, { tableNumber, capacity, status })
    return true
  },

  archiveTable: (id) => {
    const db = getDb()
    const now = new Date().toISOString()
    const table = db.prepare('SELECT status, current_order_id FROM dining_tables WHERE id = ?').get(id)
    if (table?.status === 'OCCUPIED' && table?.current_order_id) {
      throw new Error('Cannot archive an occupied table with an active dining order.')
    }
    db.prepare('UPDATE dining_tables SET is_active = 0, updated_at = ? WHERE id = ?').run(now, id)
    logAudit(null, 'ARCHIVE_TABLE', 'TABLE', id, {})
    return true
  },

  transferTable: ({ fromTableId, toTableId, reason = 'Customer request' }) => {
    const db = getDb()
    const now = new Date().toISOString()

    const transferTx = db.transaction(() => {
      const fromTable = db.prepare('SELECT * FROM dining_tables WHERE id = ?').get(fromTableId)
      if (!fromTable) throw new Error('Source table not found.')
      if (!fromTable.current_order_id) throw new Error(`Table ${fromTable.table_number} does not have an active order to transfer.`)

      const toTable = db.prepare('SELECT * FROM dining_tables WHERE id = ?').get(toTableId)
      if (!toTable) throw new Error('Target table not found.')
      if (toTable.status === 'OCCUPIED' && toTable.current_order_id) {
        throw new Error(`Target table ${toTable.table_number} is already occupied.`)
      }

      const activeOrderId = fromTable.current_order_id

      // 1. Move order reference to target table
      db.prepare('UPDATE orders SET table_id = ?, updated_at = ? WHERE id = ?')
        .run(toTableId, now, activeOrderId)

      // 2. Free source table
      db.prepare("UPDATE dining_tables SET status = 'AVAILABLE', current_order_id = NULL, updated_at = ? WHERE id = ?")
        .run(now, fromTableId)

      // 3. Occupy target table
      db.prepare("UPDATE dining_tables SET status = 'OCCUPIED', current_order_id = ?, updated_at = ? WHERE id = ?")
        .run(activeOrderId, now, toTableId)

      // 4. Record in order status history
      db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, 'OCCUPIED', 'TRANSFER', NULL, ?, ?)
      `).run(uuid(), activeOrderId, `Table transferred from ${fromTable.table_number} to ${toTable.table_number}. Reason: ${reason}`, now)

      // 5. Audit log
      logAudit(fromTable.branch_id, 'TRANSFER_TABLE', 'TABLE', activeOrderId, {
        fromTable: fromTable.table_number,
        toTable: toTable.table_number,
        reason,
      })

      return {
        orderId: activeOrderId,
        fromTableNumber: fromTable.table_number,
        toTableNumber: toTable.table_number,
      }
    })

    return transferTx()
  },

  mergeTables: ({ sourceTableId, targetTableId, reason = 'Combine party' }) => {
    const db = getDb()
    const now = new Date().toISOString()

    const mergeTx = db.transaction(() => {
      const source = db.prepare('SELECT * FROM dining_tables WHERE id = ?').get(sourceTableId)
      const target = db.prepare('SELECT * FROM dining_tables WHERE id = ?').get(targetTableId)
      if (!source || !target) throw new Error('Source or target table was not found.')
      if (!source.current_order_id) throw new Error(`Table ${source.table_number} has no active order to merge.`)
      if (!target.current_order_id) throw new Error(`Table ${target.table_number} has no active order to receive the merge.`)
      if (source.current_order_id === target.current_order_id) {
        throw new Error('Both tables already share the same order.')
      }

      const sourceOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(source.current_order_id)
      const targetOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(target.current_order_id)
      if (!sourceOrder || !targetOrder) throw new Error('One of the table orders could not be loaded.')
      if (['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(sourceOrder.status) ||
          ['COMPLETED', 'CANCELLED', 'REFUNDED'].includes(targetOrder.status)) {
        throw new Error('Cannot merge completed, cancelled, or refunded orders.')
      }

      const sourceItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(sourceOrder.id)
      for (const item of sourceItems) {
        db.prepare('UPDATE order_items SET order_id = ? WHERE id = ?').run(targetOrder.id, item.id)
      }

      db.prepare(`
        UPDATE orders
        SET subtotal_cents = COALESCE(subtotal_cents, 0) + ?,
            discount_cents = COALESCE(discount_cents, 0) + ?,
            tax_cents = COALESCE(tax_cents, 0) + ?,
            service_charge_cents = COALESCE(service_charge_cents, 0) + ?,
            total_cents = COALESCE(total_cents, 0) + ?,
            paid_cents = COALESCE(paid_cents, 0) + ?,
            notes = TRIM(COALESCE(notes, '') || char(10) || 'Merged from table ' || ? || ' (' || ? || ')'),
            updated_at = ?
        WHERE id = ?
      `).run(
        sourceOrder.subtotal_cents || 0,
        sourceOrder.discount_cents || 0,
        sourceOrder.tax_cents || 0,
        sourceOrder.service_charge_cents || 0,
        sourceOrder.total_cents || 0,
        sourceOrder.paid_cents || 0,
        source.table_number,
        sourceOrder.order_number,
        now,
        targetOrder.id
      )

      db.prepare(`
        UPDATE orders
        SET status = 'CANCELLED',
            notes = TRIM(COALESCE(notes, '') || char(10) || '[Merged into ' || ? || ']'),
            updated_at = ?
        WHERE id = ?
      `).run(targetOrder.order_number, now, sourceOrder.id)

      db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, ?, 'CANCELLED', NULL, ?, ?)
      `).run(uuid(), sourceOrder.id, sourceOrder.status, `Merged into ${targetOrder.order_number}. ${reason}`, now)

      db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, ?, ?, NULL, ?, ?)
      `).run(uuid(), targetOrder.id, targetOrder.status, targetOrder.status, `Merged table ${source.table_number} into this order. ${reason}`, now)

      db.prepare("UPDATE dining_tables SET status = 'AVAILABLE', current_order_id = NULL, updated_at = ? WHERE id = ?")
        .run(now, sourceTableId)

      logAudit(target.branch_id, 'MERGE_TABLES', 'TABLE', targetOrder.id, {
        sourceTable: source.table_number,
        targetTable: target.table_number,
        sourceOrder: sourceOrder.order_number,
        targetOrder: targetOrder.order_number,
        reason,
      })

      return {
        survivingOrderId: targetOrder.id,
        sourceTableNumber: source.table_number,
        targetTableNumber: target.table_number,
      }
    })

    return mergeTx()
  },
}
