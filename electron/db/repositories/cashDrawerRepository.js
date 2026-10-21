import { getDb } from '../index.js'
import crypto from 'node:crypto'
import { authRepository } from './authRepository.js'

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
    console.error('[Cash Drawer Audit Log Error]:', err)
  }
}

export const cashDrawerRepository = {
  /**
   * Get currently active open session for user/branch
   */
  getCurrentSession: (branchId, userId = null) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, branchId)
    const validUserId = resolveValidUserId(db, userId)

    let session = null
    if (validUserId) {
      session = db.prepare(`
        SELECT cs.*, u.display_name as cashier_name, u.username as cashier_username
        FROM cash_sessions cs
        JOIN users u ON cs.user_id = u.id
        WHERE cs.branch_id = ? AND cs.user_id = ? AND cs.status = 'OPEN'
        ORDER BY cs.opened_at DESC LIMIT 1
      `).get(validBranchId, validUserId)
    }

    if (!session) {
      session = db.prepare(`
        SELECT cs.*, u.display_name as cashier_name, u.username as cashier_username
        FROM cash_sessions cs
        JOIN users u ON cs.user_id = u.id
        WHERE cs.branch_id = ? AND cs.status = 'OPEN'
        ORDER BY cs.opened_at DESC LIMIT 1
      `).get(validBranchId)
    }

    if (!session) return null

    // Compute live instantaneous X-Report figures
    const liveMetrics = cashDrawerRepository.calculateSessionMetrics(session.id)
    return {
      ...session,
      liveMetrics,
    }
  },

  /**
   * Open a new cash drawer session
   */
  openSession: ({ branchId, userId, openingBalanceCents = 0, notes = null }) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, branchId)
    const validUserId = resolveValidUserId(db, userId)

    if (!validBranchId) throw new Error('Valid branch is required to open shift.')
    if (!validUserId) throw new Error('Valid cashier is required to open shift.')

    // Check if user already has an active open session
    const existing = db.prepare(`
      SELECT id FROM cash_sessions
      WHERE branch_id = ? AND user_id = ? AND status = 'OPEN'
    `).get(validBranchId, validUserId)

    if (existing) {
      throw new Error('An active cash shift session is already open for this user. Please close it first.')
    }

    const sessionId = uuid()
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO cash_sessions (
        id, branch_id, user_id, opened_at, opening_balance_cents,
        expected_cash_cents, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)
    `).run(
      sessionId,
      validBranchId,
      validUserId,
      now,
      Math.max(0, parseInt(openingBalanceCents, 10) || 0),
      Math.max(0, parseInt(openingBalanceCents, 10) || 0),
      notes || null
    )

    logAudit(validBranchId, 'OPEN_CASH_SESSION', 'CASH_SESSION', sessionId, {
      openingBalanceCents,
      userId: validUserId,
    })

    return cashDrawerRepository.getSessionDetails(sessionId)
  },

  /**
   * Record Cash In or Cash Out (Petty Cash movement)
   */
  recordMovement: ({ sessionId, movementType, amountCents, reason }) => {
    const db = getDb()
    const session = db.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(sessionId)
    if (!session) throw new Error('Shift session not found.')
    if (session.status !== 'OPEN') throw new Error('Cannot add movement to a closed session.')

    const normalizedType = movementType.toUpperCase()
    if (normalizedType !== 'CASH_IN' && normalizedType !== 'CASH_OUT') {
      throw new Error("Movement type must be 'CASH_IN' or 'CASH_OUT'.")
    }

    const parsedAmount = Math.max(0, parseInt(amountCents, 10) || 0)
    if (parsedAmount <= 0) throw new Error('Amount must be greater than zero.')
    if (!reason || reason.trim() === '') throw new Error('Reason is required for cash movement.')

    const movementId = uuid()
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO cash_movements (id, session_id, movement_type, amount_cents, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(movementId, sessionId, normalizedType, parsedAmount, reason.trim(), now)

    logAudit(session.branch_id, `CASH_MOVEMENT_${normalizedType}`, 'CASH_SESSION', sessionId, {
      movementType: normalizedType,
      amountCents: parsedAmount,
      reason: reason.trim(),
    })

    return {
      movementId,
      sessionId,
      movementType: normalizedType,
      amountCents: parsedAmount,
      reason: reason.trim(),
      createdAt: now,
      liveMetrics: cashDrawerRepository.calculateSessionMetrics(sessionId),
    }
  },

  /**
   * Calculate live or historical metrics for a shift session
   */
  calculateSessionMetrics: (sessionId) => {
    const db = getDb()
    const session = db.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(sessionId)
    if (!session) return null

    const startTime = session.opened_at
    const endTime = session.closed_at || new Date().toISOString()

    // 1. Calculate sales by payment method processed during session
    const payments = db.prepare(`
      SELECT payment_method, SUM(amount_cents) as total_cents, COUNT(*) as count
      FROM payments
      WHERE branch_id = ? AND cashier_id = ?
        AND created_at >= ? AND created_at <= ? AND status = 'COMPLETED'
      GROUP BY payment_method
    `).all(session.branch_id, session.user_id, startTime, endTime)

    let totalCashSalesCents = 0
    let totalCardSalesCents = 0
    let totalBankSalesCents = 0
    let totalOnlineSalesCents = 0
    let totalPaymentsCount = 0

    for (const p of payments) {
      totalPaymentsCount += p.count
      const method = p.payment_method.toUpperCase()
      if (method === 'CASH') totalCashSalesCents += p.total_cents
      else if (method === 'CARD') totalCardSalesCents += p.total_cents
      else if (method === 'BANK_TRANSFER') totalBankSalesCents += p.total_cents
      else if (method === 'ONLINE') totalOnlineSalesCents += p.total_cents
      else totalCashSalesCents += p.total_cents
    }

    // 2. Calculate cash movements (Cash-In and Cash-Out)
    const movements = db.prepare(`
      SELECT movement_type, SUM(amount_cents) as total_cents, COUNT(*) as count
      FROM cash_movements
      WHERE session_id = ?
      GROUP BY movement_type
    `).all(sessionId)

    let totalCashInCents = 0
    let totalCashOutCents = 0

    for (const m of movements) {
      if (m.movement_type === 'CASH_IN') totalCashInCents += m.total_cents
      else if (m.movement_type === 'CASH_OUT') totalCashOutCents += m.total_cents
    }

    // 3. Expected cash in drawer:
    // Opening Float + Cash Sales + Cash In - Cash Out
    const openingBalanceCents = session.opening_balance_cents || 0
    const totalRefundsCents = session.total_refunds_cents || 0
    const expectedCashCents = openingBalanceCents + totalCashSalesCents + totalCashInCents - totalCashOutCents - totalRefundsCents

    return {
      openingBalanceCents,
      totalCashSalesCents,
      totalCardSalesCents,
      totalBankSalesCents,
      totalOnlineSalesCents,
      totalGrossSalesCents: totalCashSalesCents + totalCardSalesCents + totalBankSalesCents + totalOnlineSalesCents,
      totalCashInCents,
      totalCashOutCents,
      totalRefundsCents,
      expectedCashCents,
      totalPaymentsCount,
    }
  },

  /**
   * Get X-Report (Instantaneous, non-closing mid-shift audit report)
   */
  getXReport: (sessionId) => {
    const session = cashDrawerRepository.getSessionDetails(sessionId)
    if (!session) throw new Error('Shift session not found.')

    const metrics = cashDrawerRepository.calculateSessionMetrics(sessionId)
    return {
      reportType: 'X_REPORT',
      generatedAt: new Date().toISOString(),
      session,
      metrics,
    }
  },

  /**
   * Close Cash Session and Generate Permanent Z-Report
   */
  closeSession: ({ sessionId, countedCashCents, closingNotes = null, denominations = [], managerApprovalUserId = null }) => {
    const db = getDb()
    const now = new Date().toISOString()

    const closeTx = db.transaction(() => {
      const session = db.prepare('SELECT * FROM cash_sessions WHERE id = ?').get(sessionId)
      if (!session) throw new Error('Shift session not found.')
      if (session.status === 'CLOSED') throw new Error('Session is already closed.')

      const metrics = cashDrawerRepository.calculateSessionMetrics(sessionId)
      const parsedCounted = Math.max(0, parseInt(countedCashCents, 10) || 0)
      const varianceCents = parsedCounted - metrics.expectedCashCents

      const validManagerId = managerApprovalUserId ? resolveValidUserId(db, managerApprovalUserId) : null

      // Save denominations breakdown if provided
      if (Array.isArray(denominations) && denominations.length > 0) {
        const insertDenom = db.prepare(`
          INSERT INTO cash_drawer_denominations (id, session_id, denomination_cents, count, total_cents)
          VALUES (?, ?, ?, ?, ?)
        `)
        for (const d of denominations) {
          const denomVal = parseInt(d.denominationCents, 10) || 0
          const count = parseInt(d.count, 10) || 0
          const total = denomVal * count
          insertDenom.run(uuid(), sessionId, denomVal, count, total)
        }
      }

      // Update session status to CLOSED
      db.prepare(`
        UPDATE cash_sessions
        SET closed_at = ?,
            counted_cash_cents = ?,
            expected_cash_cents = ?,
            variance_cents = ?,
            total_cash_sales_cents = ?,
            total_card_sales_cents = ?,
            total_bank_sales_cents = ?,
            total_online_sales_cents = ?,
            total_cash_in_cents = ?,
            total_cash_out_cents = ?,
            closing_notes = ?,
            manager_approval_user_id = ?,
            status = 'CLOSED'
        WHERE id = ?
      `).run(
        now,
        parsedCounted,
        metrics.expectedCashCents,
        varianceCents,
        metrics.totalCashSalesCents,
        metrics.totalCardSalesCents,
        metrics.totalBankSalesCents,
        metrics.totalOnlineSalesCents,
        metrics.totalCashInCents,
        metrics.totalCashOutCents,
        closingNotes || null,
        validManagerId,
        sessionId
      )

      logAudit(session.branch_id, 'CLOSE_CASH_SESSION', 'CASH_SESSION', sessionId, {
        countedCashCents: parsedCounted,
        expectedCashCents: metrics.expectedCashCents,
        varianceCents,
        closingNotes,
      })

      return {
        reportType: 'Z_REPORT',
        sessionId,
        generatedAt: now,
        openedAt: session.opened_at,
        closedAt: now,
        cashierId: session.user_id,
        openingBalanceCents: metrics.openingBalanceCents,
        countedCashCents: parsedCounted,
        expectedCashCents: metrics.expectedCashCents,
        varianceCents,
        metrics,
        denominations,
        closingNotes,
      }
    })

    return closeTx()
  },

  /**
   * Get shift history list
   */
  getSessionHistory: (branchId, { limit = 30, offset = 0 } = {}) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, branchId)

    return db.prepare(`
      SELECT cs.*,
             u.display_name as cashier_name, u.username as cashier_username,
             m.display_name as manager_name
      FROM cash_sessions cs
      JOIN users u ON cs.user_id = u.id
      LEFT JOIN users m ON cs.manager_approval_user_id = m.id
      WHERE cs.branch_id = ?
      ORDER BY cs.opened_at DESC
      LIMIT ? OFFSET ?
    `).all(validBranchId, limit, offset)
  },

  /**
   * Get full details of a session
   */
  getSessionDetails: (sessionId) => {
    const db = getDb()
    const session = db.prepare(`
      SELECT cs.*,
             u.display_name as cashier_name, u.username as cashier_username,
             m.display_name as manager_name,
             b.name as branch_name
      FROM cash_sessions cs
      JOIN users u ON cs.user_id = u.id
      JOIN branches b ON cs.branch_id = b.id
      LEFT JOIN users m ON cs.manager_approval_user_id = m.id
      WHERE cs.id = ?
    `).get(sessionId)

    if (!session) return null

    const movements = db.prepare(`
      SELECT * FROM cash_movements WHERE session_id = ? ORDER BY created_at ASC
    `).all(sessionId)

    const denominations = db.prepare(`
      SELECT * FROM cash_drawer_denominations WHERE session_id = ? ORDER BY denomination_cents DESC
    `).all(sessionId)

    const metrics = cashDrawerRepository.calculateSessionMetrics(sessionId)

    return {
      ...session,
      movements,
      denominations,
      metrics,
    }
  },
}
