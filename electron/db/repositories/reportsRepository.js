import { getDb } from '../index.js'

export const reportsRepository = {
  /**
   * Get Comprehensive Sales Summary for a Date Range
   * @param {string} branchId 
   * @param {{ startDate?: string, endDate?: string }} filter 
   */
  getSalesSummary(branchId, filter = {}) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    const startDate = filter.startDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const endDate = filter.endDate || new Date().toISOString().slice(0, 10)

    // Overall Totals
    const overall = db
      .prepare(`
        SELECT
          COUNT(*) as total_orders,
          COALESCE(SUM(total_cents), 0) as total_sales_cents,
          COALESCE(SUM(subtotal_cents), 0) as subtotal_cents,
          COALESCE(SUM(discount_cents), 0) as total_discount_cents,
          COALESCE(SUM(tax_cents), 0) as total_tax_cents,
          COALESCE(SUM(service_charge_cents), 0) as total_service_charge_cents,
          COALESCE(SUM(delivery_charge_cents), 0) as total_delivery_charge_cents,
          COALESCE(AVG(total_cents), 0) as average_order_cents
        FROM orders
        WHERE branch_id = ?
          AND status IN ('COMPLETED', 'DELIVERED', 'SERVED')
          AND created_at >= ?
          AND created_at <= ? || 'T23:59:59.999Z'
      `)
      .get(targetBranch, startDate, endDate)

    // Sales by Order Type (DINE_IN, TAKEAWAY, DELIVERY)
    const byOrderType = db
      .prepare(`
        SELECT
          order_type,
          COUNT(*) as order_count,
          COALESCE(SUM(total_cents), 0) as total_cents
        FROM orders
        WHERE branch_id = ?
          AND status IN ('COMPLETED', 'DELIVERED', 'SERVED')
          AND created_at >= ?
          AND created_at <= ? || 'T23:59:59.999Z'
        GROUP BY order_type
      `)
      .all(targetBranch, startDate, endDate)

    // Sales by Payment Method
    const byPaymentMethod = db
      .prepare(`
        SELECT
          p.payment_method,
          COUNT(p.id) as payment_count,
          COALESCE(SUM(p.amount_cents), 0) as total_cents
        FROM payments p
        JOIN orders o ON p.order_id = o.id
        WHERE o.branch_id = ?
          AND p.status = 'COMPLETED'
          AND p.created_at >= ?
          AND p.created_at <= ? || 'T23:59:59.999Z'
        GROUP BY p.payment_method
      `)
      .all(targetBranch, startDate, endDate)

    // Daily Sales Timeline
    const dailyTimeline = db
      .prepare(`
        SELECT
          substr(created_at, 1, 10) as date,
          COUNT(*) as order_count,
          COALESCE(SUM(total_cents), 0) as total_cents
        FROM orders
        WHERE branch_id = ?
          AND status IN ('COMPLETED', 'DELIVERED', 'SERVED')
          AND created_at >= ?
          AND created_at <= ? || 'T23:59:59.999Z'
        GROUP BY substr(created_at, 1, 10)
        ORDER BY date ASC
      `)
      .all(targetBranch, startDate, endDate)

    return {
      startDate,
      endDate,
      overall,
      byOrderType,
      byPaymentMethod,
      dailyTimeline,
    }
  },

  /**
   * Top Selling & Slow Moving Items Report
   */
  getProductPerformance(branchId, filter = {}) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    const startDate = filter.startDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const endDate = filter.endDate || new Date().toISOString().slice(0, 10)

    const items = db
      .prepare(`
        SELECT
          oi.product_id,
          oi.item_name,
          p.category_id,
          c.name as category_name,
          SUM(oi.quantity) as total_quantity_sold,
          SUM(oi.total_cents) as total_revenue_cents,
          p.cost_price_cents
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN products p ON oi.product_id = p.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE o.branch_id = ?
          AND o.status IN ('COMPLETED', 'DELIVERED', 'SERVED')
          AND o.created_at >= ?
          AND o.created_at <= ? || 'T23:59:59.999Z'
        GROUP BY oi.product_id, oi.item_name
        ORDER BY total_quantity_sold DESC
      `)
      .all(targetBranch, startDate, endDate)

    // Category breakdown
    const categoryBreakdown = db
      .prepare(`
        SELECT
          COALESCE(c.name, 'Uncategorized') as category_name,
          SUM(oi.quantity) as total_quantity_sold,
          SUM(oi.total_cents) as total_revenue_cents
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN products p ON oi.product_id = p.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE o.branch_id = ?
          AND o.status IN ('COMPLETED', 'DELIVERED', 'SERVED')
          AND o.created_at >= ?
          AND o.created_at <= ? || 'T23:59:59.999Z'
        GROUP BY c.id, c.name
        ORDER BY total_revenue_cents DESC
      `)
      .all(targetBranch, startDate, endDate)

    return {
      items,
      categoryBreakdown,
    }
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
          AND status IN ('COMPLETED', 'DELIVERED', 'SERVED')
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
          AND status IN ('COMPLETED', 'DELIVERED', 'SERVED')
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
  getAuditLogs(branchId, limit = 100) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    return db
      .prepare(`
        SELECT
          a.*,
          u.username,
          u.display_name as user_display_name
        FROM audit_logs a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.branch_id = ? OR a.branch_id IS NULL
        ORDER BY a.created_at DESC
        LIMIT ?
      `)
      .all(targetBranch, limit)
  },

  getStaffSales(branchId, filter = {}) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const { startDate, endDate } = dateRange(filter)
    return db.prepare(`
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
        AND o.status IN ('COMPLETED', 'DELIVERED', 'SERVED')
        AND o.created_at >= ? AND o.created_at <= ? || 'T23:59:59.999Z'
      WHERE u.branch_id = ? OR u.branch_id IS NULL
      GROUP BY u.id
      ORDER BY sales_cents DESC
    `).all(targetBranch, startDate, endDate, targetBranch)
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
        AND o.status IN ('COMPLETED', 'DELIVERED', 'SERVED')
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
    return { riders }
  },

  getInventoryReport(branchId) {
    const db = getDb()
    const targetBranch = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const items = db.prepare(`
      SELECT
        i.id, i.name, i.current_stock, i.minimum_level, i.cost_per_unit_cents, i.image_url,
        u.abbreviation as unit,
        ROUND(i.current_stock * COALESCE(i.cost_per_unit_cents, 0), 0) as valuation_cents,
        CASE WHEN i.current_stock <= i.minimum_level THEN 1 ELSE 0 END as is_low
      FROM inventory_items i
      LEFT JOIN inventory_units u ON i.unit_id = u.id
      WHERE i.branch_id = ? OR i.branch_id IS NULL
      ORDER BY is_low DESC, i.name ASC
    `).all(targetBranch)
    const totalValuation = items.reduce((s, i) => s + (i.valuation_cents || 0), 0)
    return { items, totalValuationCents: totalValuation, lowStockCount: items.filter((i) => i.is_low).length }
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
    return db.prepare(`
      SELECT
        rf.id, rf.amount_cents, rf.reason, rf.restock, rf.created_at,
        o.order_number, u.display_name as cashier_name
      FROM refunds rf
      LEFT JOIN orders o ON rf.order_id = o.id
      LEFT JOIN users u ON rf.cashier_id = u.id
      WHERE rf.branch_id = ?
        AND rf.created_at >= ? AND rf.created_at <= ? || 'T23:59:59.999Z'
      ORDER BY rf.created_at DESC
    `).all(targetBranch, startDate, endDate)
  },
}

function dateRange(filter = {}) {
  return {
    startDate: filter.startDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    endDate: filter.endDate || new Date().toISOString().slice(0, 10),
  }
}
