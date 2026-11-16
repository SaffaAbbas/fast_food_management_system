import { getDb } from '../index.js'
import { redactAuditRow } from '../auditLog.js'

function dateRange(filter = {}) {
  return {
    startDate: filter.startDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    endDate: filter.endDate || new Date().toISOString().slice(0, 10),
  }
}

function resolveBranch(db, branchId, filter = {}) {
  if (filter.branchId === 'ALL' || branchId === 'ALL') return null
  const id = filter.branchId || branchId
  if (id) return id
  return db.prepare('SELECT id FROM branches LIMIT 1').get()?.id || null
}

function orderScope(filter = {}, alias = 'o') {
  const { startDate, endDate } = dateRange(filter)
  const clauses = [
    `${alias}.status NOT IN ('DRAFT', 'CANCELLED')`,
    `COALESCE(${alias}.paid_cents, 0) > 0`,
    `${alias}.created_at >= ?`,
    `${alias}.created_at <= ? || 'T23:59:59.999Z'`,
  ]
  const params = [startDate, endDate]
  if (filter.orderType) {
    clauses.push(`${alias}.order_type = ?`)
    params.push(filter.orderType)
  }
  if (filter.cashierId) {
    clauses.push(`${alias}.cashier_id = ?`)
    params.push(filter.cashierId)
  }
  if (filter.paymentMethod) {
    clauses.push(`EXISTS (SELECT 1 FROM payments pmt WHERE pmt.order_id = ${alias}.id AND pmt.status = 'COMPLETED' AND pmt.payment_method = ?)`)
    params.push(filter.paymentMethod)
  }
  return { startDate, endDate, where: clauses.join(' AND '), params }
}

export const reportsRepository = {
  /**
   * Get Comprehensive Sales Summary for a Date Range
   * @param {string} branchId 
   * @param {{ startDate?: string, endDate?: string }} filter 
   */
  getSalesSummary(branchId, filter = {}) {
    const db = getDb()
    const targetBranch = resolveBranch(db, branchId, filter)
    const scope = orderScope(filter)
    const branchSql = targetBranch ? 'o.branch_id = ? AND ' : ''
    const params = targetBranch ? [targetBranch, ...scope.params] : scope.params

    const overall = db.prepare(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(total_cents), 0) as total_sales_cents,
        COALESCE(SUM(total_cents), 0) as gross_sales_cents,
        COALESCE(SUM(COALESCE(refunded_cents, 0)), 0) as refund_cents,
        COALESCE(SUM(total_cents), 0) - COALESCE(SUM(COALESCE(refunded_cents, 0)), 0) as net_sales_cents,
        COALESCE(SUM(subtotal_cents), 0) as subtotal_cents,
        COALESCE(SUM(discount_cents), 0) as total_discount_cents,
        COALESCE(SUM(tax_cents), 0) as total_tax_cents,
        COALESCE(SUM(service_charge_cents), 0) as total_service_charge_cents,
        COALESCE(SUM(delivery_charge_cents), 0) as total_delivery_charge_cents,
        COALESCE(AVG(total_cents), 0) as average_order_cents
      FROM orders o
      WHERE ${branchSql}${scope.where}
    `).get(...params)

    const byOrderType = db.prepare(`
      SELECT order_type, COUNT(*) as order_count, COALESCE(SUM(total_cents), 0) as total_cents
      FROM orders o
      WHERE ${branchSql}${scope.where}
      GROUP BY order_type
    `).all(...params)

    const byPaymentMethod = db.prepare(`
      SELECT p.payment_method, COUNT(p.id) as payment_count, COALESCE(SUM(p.amount_cents), 0) as total_cents
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      WHERE ${branchSql}p.status = 'COMPLETED' AND ${scope.where}
      GROUP BY p.payment_method
    `).all(...params)

    const byCashier = db.prepare(`
      SELECT COALESCE(u.display_name, 'Unassigned') as cashier_name, COUNT(o.id) as order_count,
             COALESCE(SUM(o.total_cents), 0) as total_cents
      FROM orders o
      LEFT JOIN users u ON o.cashier_id = u.id
      WHERE ${branchSql}${scope.where}
      GROUP BY o.cashier_id
      ORDER BY total_cents DESC
    `).all(...params)

    const dailyTimeline = db.prepare(`
      SELECT substr(created_at, 1, 10) as date, COUNT(*) as order_count, COALESCE(SUM(total_cents), 0) as total_cents
      FROM orders o
      WHERE ${branchSql}${scope.where}
      GROUP BY substr(created_at, 1, 10)
      ORDER BY date ASC
    `).all(...params)

    return {
      startDate: scope.startDate,
      endDate: scope.endDate,
      overall,
      byOrderType,
      byPaymentMethod,
      byCashier,
      dailyTimeline,
    }
  },

  /**
   * Top Selling & Slow Moving Items Report
   */
  getProductPerformance(branchId, filter = {}) {
    const db = getDb()
    const targetBranch = resolveBranch(db, branchId, filter)
    const scope = orderScope(filter)
    const branchSql = targetBranch ? 'o.branch_id = ? AND ' : ''
    const params = targetBranch ? [targetBranch, ...scope.params] : scope.params
    if (filter.categoryId) {
      // applied in SQL below via extra join filter
    }
    const catFilter = filter.categoryId ? 'AND p.category_id = ?' : ''
    const catParams = filter.categoryId ? [...params, filter.categoryId] : params
    const productFilter = filter.productId ? 'AND oi.product_id = ?' : ''
    const itemParams = filter.productId ? [...catParams, filter.productId] : catParams

    const items = db.prepare(`
      SELECT
        oi.product_id, oi.item_name, p.category_id, c.name as category_name,
        SUM(oi.quantity) as total_quantity_sold,
        SUM(oi.total_cents) as total_revenue_cents,
        p.cost_price_cents
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ${branchSql}${scope.where} ${catFilter} ${productFilter}
      GROUP BY oi.product_id, oi.item_name
      ORDER BY total_quantity_sold DESC
    `).all(...itemParams)

    const categoryBreakdown = db.prepare(`
      SELECT
        COALESCE(c.name, 'Uncategorized') as category_name,
        SUM(oi.quantity) as total_quantity_sold,
        SUM(oi.total_cents) as total_revenue_cents
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ${branchSql}${scope.where} ${catFilter}
      GROUP BY c.id, c.name
      ORDER BY total_revenue_cents DESC
    `).all(...catParams)

    return { items, categoryBreakdown }
  },

  /**
   * Hourly Peak Rush Breakdown (00:00 to 23:00)
   */
  getHourlyBreakdown(branchId, filter = {}) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    const startDate = filter.startDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const endDate = filter.endDate || new Date().toISOString().slice(0, 10)

    const rows = db
      .prepare(`
        SELECT
          CAST(strftime('%H', created_at) AS INTEGER) as hour,
          COUNT(*) as order_count,
          COALESCE(SUM(total_cents), 0) as total_cents
        FROM orders
        WHERE branch_id = ?
          AND status NOT IN ('DRAFT', 'CANCELLED')
          AND COALESCE(paid_cents, 0) > 0
          AND created_at >= ?
          AND created_at <= ? || 'T23:59:59.999Z'
        GROUP BY hour
        ORDER BY hour ASC
      `)
      .all(targetBranch, startDate, endDate)

    // Fill all 24 hours
    const hourMap = {}
    rows.forEach((r) => {
      hourMap[r.hour] = r
    })

    const result = []
    for (let h = 0; h < 24; h++) {
      result.push({
        hour: h,
        label: `${h.toString().padStart(2, '0')}:00`,
        orderCount: hourMap[h]?.order_count || 0,
        totalCents: hourMap[h]?.total_cents || 0,
      })
    }

    return result
  },

  /**
   * Financial Profit & Loss Overview
   */
  getProfitAndLoss(branchId, filter = {}) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    const startDate = filter.startDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const endDate = filter.endDate || new Date().toISOString().slice(0, 10)

    // 1. Gross Revenue
    const revenueRow = db
      .prepare(`
        SELECT
          COALESCE(SUM(total_cents), 0) as total_revenue_cents,
          COALESCE(SUM(discount_cents), 0) as total_discount_cents,
          COALESCE(SUM(tax_cents), 0) as total_tax_cents
        FROM orders
        WHERE branch_id = ?
          AND status NOT IN ('DRAFT', 'CANCELLED')
          AND COALESCE(paid_cents, 0) > 0
          AND created_at >= ?
          AND created_at <= ? || 'T23:59:59.999Z'
      `)
      .get(targetBranch, startDate, endDate)

    // 2. Cost of Goods Sold (COGS from stock movements or purchase receipts)
    const cogsRow = db
      .prepare(`
        SELECT
          COALESCE(SUM(quantity * unit_cost_cents), 0) as total_cogs_cents
        FROM stock_movements
        WHERE branch_id = ?
          AND movement_type = 'SALE_DEDUCTION'
          AND created_at >= ?
          AND created_at <= ? || 'T23:59:59.999Z'
      `)
      .get(targetBranch, startDate, endDate)

    // 3. Operating Expenses
    const expensesRow = db
      .prepare(`
        SELECT
          COALESCE(SUM(amount_cents), 0) as total_expenses_cents
        FROM expenses
        WHERE branch_id = ?
          AND expense_date >= ?
          AND expense_date <= ?
      `)
      .get(targetBranch, startDate, endDate)

    const revenue = revenueRow?.total_revenue_cents || 0
    const cogs = cogsRow?.total_cogs_cents || 0
    const grossProfit = Math.max(0, revenue - cogs)
    const expenses = expensesRow?.total_expenses_cents || 0
    const netProfit = revenue - cogs - expenses

    return {
      revenueCents: revenue,
      discountCents: revenueRow?.total_discount_cents || 0,
      taxCents: revenueRow?.total_tax_cents || 0,
      cogsCents: cogs,
      grossProfitCents: grossProfit,
      expensesCents: expenses,
      netProfitCents: netProfit,
      marginPercent: revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : '0.0',
    }
  },

  /**
   * Void, Cancellation & Refund Audit
   */
  getVoidAndRefundAudits(branchId, filter = {}) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    const startDate = filter.startDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const endDate = filter.endDate || new Date().toISOString().slice(0, 10)

    const voidOrders = db
      .prepare(`
        SELECT
          o.*,
          u.display_name as cashier_name
        FROM orders o
        LEFT JOIN users u ON o.cashier_id = u.id
        WHERE o.branch_id = ?
          AND o.status IN ('CANCELLED', 'REFUNDED')
          AND o.created_at >= ?
          AND o.created_at <= ? || 'T23:59:59.999Z'
        ORDER BY o.created_at DESC
      `)
      .all(targetBranch, startDate, endDate)

    const discountedOrders = db
      .prepare(`
        SELECT
          o.*,
          u.display_name as cashier_name
        FROM orders o
        LEFT JOIN users u ON o.cashier_id = u.id
        WHERE o.branch_id = ?
          AND o.discount_cents > 0
          AND o.created_at >= ?
          AND o.created_at <= ? || 'T23:59:59.999Z'
        ORDER BY o.created_at DESC
      `)
      .all(targetBranch, startDate, endDate)

    return {
      voidOrders,
      discountedOrders,
    }
  },

  /**
   * System Audit Logs History
   */
  getAuditLogs(branchId, options = {}) {
    const db = getDb()
    const limit = typeof options === 'number' ? options : (options.limit || 200)
    const fullAccess = Boolean(options.fullAccess)
    const action = options.action
    const entityType = options.entityType
    const startDate = options.startDate
    const endDate = options.endDate
    const targetBranch = options.branchId === 'ALL' ? null : (branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id)

    let sql = `
      SELECT
        a.id, a.branch_id, a.user_id, a.action, a.entity_type, a.entity_id,
        a.details_json, a.created_at,
        u.username,
        u.display_name as user_display_name,
        b.name as branch_name
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      LEFT JOIN branches b ON a.branch_id = b.id
      WHERE 1=1
    `
    const params = []
    if (targetBranch) {
      sql += ' AND (a.branch_id = ? OR a.branch_id IS NULL)'
      params.push(targetBranch)
    }
    if (action) {
      sql += ' AND a.action = ?'
      params.push(action)
    }
    if (entityType) {
      sql += ' AND a.entity_type = ?'
      params.push(entityType)
    }
    if (startDate) {
      sql += ' AND a.created_at >= ?'
      params.push(startDate)
    }
    if (endDate) {
      sql += " AND a.created_at <= ? || 'T23:59:59.999Z'"
      params.push(endDate)
    }
    sql += ' ORDER BY a.created_at DESC LIMIT ?'
    params.push(limit)

    const rows = db.prepare(sql).all(...params)
    return rows.map((row) => redactAuditRow(row, { fullAccess }))
  },

  getStaffSales(branchId, filter = {}) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const { startDate, endDate } = dateRange(filter)
    const sales = db.prepare(`
      SELECT
        u.id as user_id,
        u.display_name,
        COALESCE(r.name, 'Staff') as role_name,
        COUNT(o.id) as order_count,
        COALESCE(SUM(o.total_cents), 0) as sales_cents,
        COALESCE(SUM(o.discount_cents), 0) as discount_cents,
        COALESCE(SUM(o.refunded_cents), 0) as refunded_cents
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN orders o ON o.cashier_id = u.id
        AND o.branch_id = ?
        AND o.status NOT IN ('DRAFT', 'CANCELLED')
        AND COALESCE(o.paid_cents, 0) > 0
        AND o.created_at >= ? AND o.created_at <= ? || 'T23:59:59.999Z'
      WHERE u.branch_id = ? OR u.branch_id IS NULL
      GROUP BY u.id
      ORDER BY sales_cents DESC
    `).all(targetBranch, startDate, endDate, targetBranch)
    const attendance = db.prepare(`
      SELECT
        e.id as employee_id,
        TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')) as employee_name,
        sa.status,
        COUNT(*) as day_count
      FROM staff_attendance sa
      JOIN employees e ON sa.employee_id = e.id
      WHERE sa.branch_id = ?
        AND substr(sa.created_at, 1, 10) >= ?
        AND substr(sa.created_at, 1, 10) <= ?
      GROUP BY e.id, sa.status
      ORDER BY employee_name, sa.status
    `).all(targetBranch, startDate, endDate)
    return { sales, attendance }
  },

  getCustomerReport(branchId, filter = {}) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const { startDate, endDate } = dateRange(filter)
    return db.prepare(`
      SELECT
        c.id, c.name, c.phone, c.tag, c.loyalty_points, c.image_url,
        COUNT(o.id) as order_count,
        COALESCE(SUM(o.total_cents), 0) as spent_cents,
        MAX(o.created_at) as last_order_at
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id
        AND o.status NOT IN ('DRAFT', 'CANCELLED')
        AND COALESCE(o.paid_cents, 0) > 0
        AND o.created_at >= ? AND o.created_at <= ? || 'T23:59:59.999Z'
      WHERE c.branch_id = ? OR c.branch_id IS NULL
      GROUP BY c.id
      ORDER BY spent_cents DESC
    `).all(startDate, endDate, targetBranch)
  },

  getKitchenReport(branchId, filter = {}) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const { startDate, endDate } = dateRange(filter)
    const byStatus = db.prepare(`
      SELECT status, COUNT(*) as order_count
      FROM orders
      WHERE branch_id = ?
        AND created_at >= ? AND created_at <= ? || 'T23:59:59.999Z'
      GROUP BY status
    `).all(targetBranch, startDate, endDate)
    const avgPrep = db.prepare(`
      SELECT AVG(
        (julianday(updated_at) - julianday(created_at)) * 24 * 60
      ) as avg_minutes
      FROM orders
      WHERE branch_id = ?
        AND status IN ('READY', 'COMPLETED', 'SERVED', 'DELIVERED')
        AND created_at >= ? AND created_at <= ? || 'T23:59:59.999Z'
    `).get(targetBranch, startDate, endDate)
    return { byStatus, avgPrepMinutes: Math.round(avgPrep?.avg_minutes || 0) }
  },

  getDeliveryReport(branchId, filter = {}) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const { startDate, endDate } = dateRange(filter)
    const riders = db.prepare(`
      SELECT
        r.id, r.name, r.vehicle_type, r.status, r.image_url,
        COUNT(d.id) as delivery_count,
        COALESCE(SUM(CASE WHEN d.status = 'DELIVERED' THEN 1 ELSE 0 END), 0) as delivered_count,
        COALESCE(SUM(CASE WHEN d.status = 'FAILED' THEN 1 ELSE 0 END), 0) as failed_count,
        COALESCE(SUM(d.cod_collected_cents), 0) as cod_cents
      FROM riders r
      LEFT JOIN deliveries d ON d.rider_id = r.id
        AND d.created_at >= ? AND d.created_at <= ? || 'T23:59:59.999Z'
      WHERE r.branch_id = ?
      GROUP BY r.id
      ORDER BY delivered_count DESC
    `).all(startDate, endDate, targetBranch)
    const byStatus = db.prepare(`
      SELECT d.status, COUNT(*) as order_count,
             COALESCE(SUM(d.cod_collected_cents), 0) as cash_collected_cents
      FROM deliveries d
      WHERE d.branch_id = ?
        AND d.created_at >= ? AND d.created_at <= ? || 'T23:59:59.999Z'
      GROUP BY d.status
    `).all(targetBranch, startDate, endDate)
    return { riders, byStatus }
  },

  getInventoryReport(branchId, filter = {}) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const { startDate, endDate } = dateRange(filter)
    const items = db.prepare(`
      SELECT
        i.id, i.name, i.current_stock, i.minimum_level, i.cost_per_unit_cents, i.image_url,
        u.abbreviation as unit,
        ROUND(i.current_stock * COALESCE(i.avg_cost_cents, i.cost_per_unit_cents, 0), 0) as valuation_cents,
        CASE WHEN i.current_stock <= i.minimum_level THEN 1 ELSE 0 END as is_low
      FROM inventory_items i
      LEFT JOIN inventory_units u ON i.unit_id = u.id
      WHERE i.branch_id = ? OR i.branch_id IS NULL
      ORDER BY is_low DESC, i.name ASC
    `).all(targetBranch)
    const movement = db.prepare(`
      SELECT sm.movement_type, COALESCE(i.name, sm.inventory_item_id) as item_name,
             SUM(sm.quantity) as quantity, COUNT(*) as movement_count
      FROM stock_movements sm
      LEFT JOIN inventory_items i ON sm.inventory_item_id = i.id
      WHERE (sm.branch_id = ? OR sm.branch_id IS NULL)
        AND sm.created_at >= ? AND sm.created_at <= ? || 'T23:59:59.999Z'
      GROUP BY sm.movement_type, i.name
      ORDER BY movement_count DESC
    `).all(targetBranch, startDate, endDate)
    const totalValuation = items.reduce((s, i) => s + (i.valuation_cents || 0), 0)
    return { items, movement, totalValuationCents: totalValuation, lowStockCount: items.filter((i) => i.is_low).length }
  },

  getExpenseReport(branchId, filter = {}) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const { startDate, endDate } = dateRange(filter)
    return db.prepare(`
      SELECT
        COALESCE(ec.name, 'Uncategorized') as category_name,
        COUNT(e.id) as expense_count,
        COALESCE(SUM(e.amount_cents), 0) as total_cents
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      WHERE e.branch_id = ?
        AND e.expense_date >= ? AND e.expense_date <= ?
      GROUP BY ec.id, ec.name
      ORDER BY total_cents DESC
    `).all(targetBranch, startDate, endDate)
  },

  getReservationReport(branchId, filter = {}) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const { startDate, endDate } = dateRange(filter)
    return db.prepare(`
      SELECT status, COUNT(*) as count
      FROM reservations
      WHERE branch_id = ?
        AND COALESCE(reservation_date, substr(reservation_time, 1, 10)) >= ?
        AND COALESCE(reservation_date, substr(reservation_time, 1, 10)) <= ?
      GROUP BY status
    `).all(targetBranch, startDate, endDate)
  },

  getRefundReport(branchId, filter = {}) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const { startDate, endDate } = dateRange(filter)
    const refunds = db.prepare(`
      SELECT
        rf.id, rf.amount_cents, rf.reason, rf.restock, rf.created_at, rf.refund_method,
        o.order_number, u.display_name as cashier_name
      FROM refunds rf
      LEFT JOIN orders o ON rf.order_id = o.id
      LEFT JOIN users u ON rf.cashier_id = u.id
      WHERE rf.branch_id = ?
        AND rf.created_at >= ? AND rf.created_at <= ? || 'T23:59:59.999Z'
      ORDER BY rf.created_at DESC
    `).all(targetBranch, startDate, endDate)
    let items = []
    try {
      items = db.prepare(`
        SELECT ri.refund_id, ri.quantity, ri.amount_cents, oi.item_name
        FROM refund_items ri
        LEFT JOIN order_items oi ON ri.order_item_id = oi.id
        WHERE ri.refund_id IN (SELECT id FROM refunds WHERE branch_id = ? AND created_at >= ? AND created_at <= ? || 'T23:59:59.999Z')
      `).all(targetBranch, startDate, endDate)
    } catch (e) {}
    const grouped = {}
    for (const it of items) {
      if (!grouped[it.refund_id]) grouped[it.refund_id] = []
      grouped[it.refund_id].push(it)
    }
    return refunds.map((r) => ({
      ...r,
      returned_items: (grouped[r.id] || []).map((i) => `${i.quantity}× ${i.item_name || 'item'}`).join(', '),
    }))
  },

  getFoodCostReport(branchId, filter = {}) {
    const db = getDb()
    const targetBranch = resolveBranch(db, branchId, filter)
    const rows = db.prepare(`
      SELECT
        p.id as product_id,
        p.name as product_name,
        COALESCE(cat.name, 'Uncategorized') as category_name,
        p.base_price_cents as selling_price_cents,
        COALESCE(rv.food_cost_cents, 0) as recipe_cost_cents,
        CASE WHEN p.base_price_cents > 0
          THEN ROUND(COALESCE(rv.food_cost_cents, 0) * 100.0 / p.base_price_cents, 1)
          ELSE 0 END as food_cost_percent
      FROM products p
      LEFT JOIN categories cat ON p.category_id = cat.id
      LEFT JOIN recipes r ON r.product_id = p.id AND COALESCE(r.is_active, 1) = 1
      LEFT JOIN recipe_versions rv ON rv.recipe_id = r.id AND rv.version = (
        SELECT MAX(v.version) FROM recipe_versions v WHERE v.recipe_id = r.id
      )
      WHERE p.is_active = 1 AND (p.branch_id = ? OR p.branch_id IS NULL OR ? IS NULL)
      ORDER BY food_cost_percent DESC, p.name ASC
    `).all(targetBranch, targetBranch)
    return { items: rows }
  },

  getPurchaseReport(branchId, filter = {}) {
    const db = getDb()
    const targetBranch = resolveBranch(db, branchId, filter)
    const { startDate, endDate } = dateRange(filter)
    const vendorSql = filter.supplierId ? 'AND po.supplier_id = ?' : ''
    const params = [targetBranch, startDate, endDate]
    if (filter.supplierId) params.push(filter.supplierId)
    const items = db.prepare(`
      SELECT
        po.po_number, po.status, po.created_at as order_date, po.received_at as received_date,
        s.company_name as vendor_name,
        COALESCE(i.name, 'Item') as item_name,
        poi.quantity, poi.unit_cost_cents, poi.total_cents
      FROM purchase_order_items poi
      JOIN purchase_orders po ON poi.po_id = po.id
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      LEFT JOIN inventory_items i ON poi.inventory_item_id = i.id
      WHERE po.branch_id = ?
        AND po.created_at >= ?
        AND po.created_at <= ? || 'T23:59:59.999Z'
        ${vendorSql}
      ORDER BY po.created_at DESC
    `).all(...params)
    const totalCents = items.reduce((s, r) => s + (r.total_cents || 0), 0)
    return { items, totalCents }
  },

  getVendorStatementReport(branchId, filter = {}) {
    const db = getDb()
    const targetBranch = resolveBranch(db, branchId, filter)
    const { startDate, endDate } = dateRange(filter)
    const suppliers = db.prepare(`
      SELECT s.id, s.company_name as name,
        COALESCE((SELECT SUM(total_cents) FROM purchase_orders po WHERE po.supplier_id = s.id AND po.branch_id = ?), 0) as invoices_cents,
        COALESCE((SELECT SUM(amount_cents) FROM purchase_returns pr WHERE pr.supplier_id = s.id), 0) as returns_cents,
        COALESCE((SELECT SUM(amount_cents) FROM vendor_payments vp WHERE vp.supplier_id = s.id), 0) as payments_cents
      FROM suppliers s
      WHERE s.branch_id = ? OR s.branch_id IS NULL
      ORDER BY name
    `).all(targetBranch, targetBranch)
    const rows = suppliers.map((s) => ({
      ...s,
      outstanding_cents: (s.invoices_cents || 0) - (s.returns_cents || 0) - (s.payments_cents || 0),
    }))
    return { vendors: rows, startDate, endDate }
  },

  getCashierReport(branchId, filter = {}) {
    const db = getDb()
    const targetBranch = resolveBranch(db, branchId, filter)
    const { startDate, endDate } = dateRange(filter)
    const branchOrd = targetBranch ? 'AND o.branch_id = ?' : ''
    const branchPay = targetBranch ? 'AND p.branch_id = ?' : ''
    const extra = targetBranch ? [targetBranch] : []
    const cashiers = db.prepare(`
      SELECT
        u.id as user_id,
        u.display_name,
        (SELECT COUNT(*) FROM orders o
          WHERE o.cashier_id = u.id AND o.status NOT IN ('DRAFT', 'CANCELLED')
            AND COALESCE(o.paid_cents, 0) > 0
            AND o.created_at >= ? AND o.created_at <= ? || 'T23:59:59.999Z' ${branchOrd}) as order_count,
        (SELECT COALESCE(SUM(o.total_cents), 0) FROM orders o
          WHERE o.cashier_id = u.id AND o.status NOT IN ('DRAFT', 'CANCELLED')
            AND COALESCE(o.paid_cents, 0) > 0
            AND o.created_at >= ? AND o.created_at <= ? || 'T23:59:59.999Z' ${branchOrd}) as sales_cents,
        (SELECT COALESCE(SUM(o.refunded_cents), 0) FROM orders o
          WHERE o.cashier_id = u.id
            AND o.created_at >= ? AND o.created_at <= ? || 'T23:59:59.999Z' ${branchOrd}) as refund_cents,
        (SELECT COALESCE(SUM(p.amount_cents), 0) FROM payments p
          WHERE p.cashier_id = u.id AND p.status = 'COMPLETED' AND p.payment_method = 'CASH'
            AND p.created_at >= ? AND p.created_at <= ? || 'T23:59:59.999Z' ${branchPay}) as cash_cents,
        (SELECT COALESCE(SUM(p.amount_cents), 0) FROM payments p
          WHERE p.cashier_id = u.id AND p.status = 'COMPLETED'
            AND p.payment_method IN ('CARD', 'CREDIT_CARD', 'DEBIT_CARD')
            AND p.created_at >= ? AND p.created_at <= ? || 'T23:59:59.999Z' ${branchPay}) as card_cents
      FROM users u
      WHERE u.is_active = 1
      ORDER BY sales_cents DESC
    `).all(
      startDate, endDate, ...extra,
      startDate, endDate, ...extra,
      startDate, endDate, ...extra,
      startDate, endDate, ...extra,
      startDate, endDate, ...extra
    )
    const sessions = db.prepare(`
      SELECT cs.id, u.display_name, cs.opening_balance_cents as opening_float_cents, cs.expected_cash_cents,
             cs.counted_cash_cents, cs.variance_cents, cs.status, cs.opened_at, cs.closed_at
      FROM cash_sessions cs
      LEFT JOIN users u ON cs.user_id = u.id
      WHERE ${targetBranch ? 'cs.branch_id = ? AND ' : ''}
            cs.opened_at >= ? AND cs.opened_at <= ? || 'T23:59:59.999Z'
      ORDER BY cs.opened_at DESC
    `).all(...(targetBranch ? [targetBranch, startDate, endDate] : [startDate, endDate]))
    return { cashiers: cashiers.filter((c) => (c.order_count || 0) > 0 || (c.cash_cents || 0) > 0), sessions }
  },

  getBranchComparison(filter = {}) {
    const db = getDb()
    const scope = orderScope(filter)
    const sales = db.prepare(`
      SELECT b.id as branch_id, b.name as branch_name,
        COUNT(o.id) as order_count,
        COALESCE(SUM(o.total_cents), 0) as sales_cents,
        COALESCE(SUM(o.discount_cents), 0) as discount_cents
      FROM branches b
      LEFT JOIN orders o ON o.branch_id = b.id AND ${scope.where}
      GROUP BY b.id
      ORDER BY sales_cents DESC
    `).all(...scope.params)
    const { startDate, endDate } = dateRange(filter)
    const expenses = db.prepare(`
      SELECT branch_id, COALESCE(SUM(amount_cents), 0) as expenses_cents
      FROM expenses
      WHERE expense_date >= ? AND expense_date <= ?
      GROUP BY branch_id
    `).all(startDate, endDate)
    const cogs = db.prepare(`
      SELECT branch_id, COALESCE(SUM(quantity * unit_cost_cents), 0) as cogs_cents
      FROM stock_movements
      WHERE movement_type = 'SALE_DEDUCTION' AND created_at >= ? AND created_at <= ? || 'T23:59:59.999Z'
      GROUP BY branch_id
    `).all(startDate, endDate)
    const expMap = Object.fromEntries(expenses.map((e) => [e.branch_id, e.expenses_cents]))
    const cogsMap = Object.fromEntries(cogs.map((e) => [e.branch_id, e.cogs_cents]))
    const rows = sales.map((r) => {
      const cost = cogsMap[r.branch_id] || 0
      const exp = expMap[r.branch_id] || 0
      return {
        ...r,
        cogs_cents: cost,
        expenses_cents: exp,
        profit_cents: (r.sales_cents || 0) - cost - exp,
      }
    })
    return { rows }
  },

  getLookups() {
    const db = getDb()
    return {
      branches: db.prepare('SELECT id, name FROM branches ORDER BY name').all(),
      cashiers: db.prepare('SELECT id, display_name FROM users WHERE is_active = 1 ORDER BY display_name').all(),
      suppliers: db.prepare('SELECT id, company_name as name FROM suppliers ORDER BY company_name').all(),
      categories: db.prepare('SELECT id, name FROM categories WHERE is_active = 1 ORDER BY name').all(),
    }
  },
}
