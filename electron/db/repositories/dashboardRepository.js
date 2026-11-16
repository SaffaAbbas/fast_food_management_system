import { getDb } from '../index.js'

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

export function getDateRangeBounds(rangeType, options = {}) {
  const now = new Date()

  if (rangeType === 'custom' && options.startDate && options.endDate) {
    return {
      startIso: startOfDay(options.startDate).toISOString(),
      endIso: endOfDay(options.endDate).toISOString(),
    }
  }

  if (rangeType === 'yesterday') {
    const start = startOfDay(now)
    start.setDate(start.getDate() - 1)
    return { startIso: start.toISOString(), endIso: endOfDay(start).toISOString() }
  }

  if (rangeType === 'this_week') {
    const start = startOfDay(now)
    start.setDate(start.getDate() - 6)
    return { startIso: start.toISOString(), endIso: now.toISOString() }
  }

  if (rangeType === 'this_month') {
    const start = startOfDay(now)
    start.setDate(1)
    return { startIso: start.toISOString(), endIso: now.toISOString() }
  }

  const start = startOfDay(now)
  return { startIso: start.toISOString(), endIso: now.toISOString() }
}

function paymentBucket(method) {
  const key = String(method || '').toUpperCase()
  if (key === 'CASH') return 'CASH'
  if (key === 'CARD' || key === 'CREDIT_CARD' || key === 'DEBIT_CARD' || key === 'TERMINAL') return 'CARD'
  if (key === 'BANK_TRANSFER' || key === 'BANK' || key === 'TRANSFER') return 'BANK_TRANSFER'
  if (key === 'WALLET' || key === 'ONLINE' || key === 'ONLINE_PAYMENT' || key === 'JAZZCASH' || key === 'EASYPAISA') return 'WALLET'
  return 'OTHER'
}

export const dashboardRepository = {
  listBranches() {
    const db = getDb()
    return db.prepare(`
      SELECT id, name, code, currency_symbol
      FROM branches
      WHERE is_active = 1
      ORDER BY name ASC
    `).all()
  },

  getMetrics: (branchId, rangeType = 'today', options = {}) => {
    const db = getDb()
    const { startIso, endIso } = getDateRangeBounds(rangeType, options)
    const delayedCutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString()

    const salesRow = db.prepare(`
      SELECT
        COUNT(id) as total_orders,
        COALESCE(SUM(total_cents), 0) as gross_sales_cents,
        COALESCE(SUM(subtotal_cents), 0) as subtotal_cents,
        COALESCE(SUM(discount_cents), 0) as total_discounts_cents,
        COALESCE(SUM(tax_cents), 0) as total_tax_cents,
        COALESCE(SUM(service_charge_cents), 0) as total_service_cents,
        COALESCE(SUM(delivery_charge_cents), 0) as total_delivery_cents,
        COALESCE(SUM(COALESCE(refunded_cents, 0)), 0) as total_refunds_cents
      FROM orders
      WHERE branch_id = ?
        AND created_at >= ? AND created_at <= ?
        AND status NOT IN ('DRAFT', 'CANCELLED')
    `).get(branchId, startIso, endIso)

    const totalOrders = salesRow.total_orders || 0
    const grossSalesCents = salesRow.gross_sales_cents || 0
    const refundCents = salesRow.total_refunds_cents || 0
    const avgOrderCents = totalOrders > 0 ? Math.round(grossSalesCents / totalOrders) : 0
    const netSalesCents = Math.max(0, grossSalesCents - refundCents)

    const typeRows = db.prepare(`
      SELECT order_type, COUNT(id) as count, COALESCE(SUM(total_cents), 0) as total_cents
      FROM orders
      WHERE branch_id = ?
        AND created_at >= ? AND created_at <= ?
        AND status NOT IN ('DRAFT', 'CANCELLED')
      GROUP BY order_type
    `).all(branchId, startIso, endIso)

    const ordersByType = {
      DINE_IN: { count: 0, totalCents: 0 },
      TAKEAWAY: { count: 0, totalCents: 0 },
      DELIVERY: { count: 0, totalCents: 0 },
    }
    for (const r of typeRows) {
      if (ordersByType[r.order_type]) {
        ordersByType[r.order_type] = { count: r.count, totalCents: r.total_cents }
      }
    }

    const statusRows = db.prepare(`
      SELECT status, COUNT(id) as count
      FROM orders
      WHERE branch_id = ?
        AND created_at >= ? AND created_at <= ?
      GROUP BY status
    `).all(branchId, startIso, endIso)

    const statusCounts = {}
    for (const r of statusRows) {
      statusCounts[r.status] = r.count
    }

    const kitchen = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('CONFIRMED', 'PREPARING') AND kitchen_completed_at IS NULL THEN 1 ELSE 0 END), 0) as pending,
        COALESCE(SUM(CASE WHEN status IN ('CONFIRMED', 'PREPARING') AND kitchen_completed_at IS NULL AND created_at <= ? THEN 1 ELSE 0 END), 0) as delayed,
        COALESCE(SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END), 0) as cancelled
      FROM orders
      WHERE branch_id = ?
        AND created_at >= ? AND created_at <= ?
        AND status != 'DRAFT'
    `).get(delayedCutoff, branchId, startIso, endIso)

    const paymentRows = db.prepare(`
      SELECT payment_method, COALESCE(SUM(amount_cents), 0) as total_cents, COUNT(id) as count
      FROM payments
      WHERE branch_id = ?
        AND created_at >= ? AND created_at <= ?
        AND status = 'COMPLETED'
      GROUP BY payment_method
    `).all(branchId, startIso, endIso)

    const paymentsByMethod = {
      CASH: { totalCents: 0, count: 0 },
      CARD: { totalCents: 0, count: 0 },
      BANK_TRANSFER: { totalCents: 0, count: 0 },
      WALLET: { totalCents: 0, count: 0 },
      OTHER: { totalCents: 0, count: 0 },
    }
    for (const p of paymentRows) {
      const bucket = paymentBucket(p.payment_method)
      paymentsByMethod[bucket].totalCents += p.total_cents
      paymentsByMethod[bucket].count += p.count
    }

    const topProducts = db.prepare(`
      SELECT p.id, p.name, c.name as category_name,
             SUM(oi.quantity) as total_quantity,
             SUM(oi.total_cents) as total_revenue_cents
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE o.branch_id = ?
        AND o.created_at >= ? AND o.created_at <= ?
        AND o.status NOT IN ('DRAFT', 'CANCELLED')
      GROUP BY p.id
      ORDER BY total_quantity DESC
      LIMIT 5
    `).all(branchId, startIso, endIso)

    const topCategories = db.prepare(`
      SELECT c.id, c.name,
             SUM(oi.quantity) as total_quantity,
             SUM(oi.total_cents) as total_revenue_cents
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE o.branch_id = ?
        AND o.created_at >= ? AND o.created_at <= ?
        AND o.status NOT IN ('DRAFT', 'CANCELLED')
      GROUP BY c.id
      ORDER BY total_revenue_cents DESC
      LIMIT 5
    `).all(branchId, startIso, endIso)

    const lowStockItems = db.prepare(`
      SELECT i.id, i.name, i.sku, i.current_stock, i.minimum_level, i.reorder_level,
             (i.current_stock - COALESCE(i.reserved_stock, 0)) as available_stock,
             u.abbreviation as unit,
             CASE WHEN (i.current_stock - COALESCE(i.reserved_stock, 0)) <= 0 THEN 1 ELSE 0 END as is_out
      FROM inventory_items i
      JOIN inventory_units u ON i.unit_id = u.id
      WHERE i.branch_id = ?
        AND i.is_active = 1
        AND (i.current_stock - COALESCE(i.reserved_stock, 0)) <= COALESCE(i.reorder_level, i.minimum_level)
      ORDER BY is_out DESC, available_stock ASC
      LIMIT 8
    `).all(branchId)

    const stockCounts = db.prepare(`
      SELECT
        SUM(CASE WHEN (current_stock - COALESCE(reserved_stock, 0)) <= 0 THEN 1 ELSE 0 END) as out_of_stock,
        SUM(CASE WHEN (current_stock - COALESCE(reserved_stock, 0)) > 0
                  AND (current_stock - COALESCE(reserved_stock, 0)) <= COALESCE(reorder_level, minimum_level) THEN 1 ELSE 0 END) as low_stock
      FROM inventory_items
      WHERE branch_id = ? AND is_active = 1
    `).get(branchId)

    const expenseRow = db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) as total_cents
      FROM expenses
      WHERE branch_id = ?
        AND expense_date >= ? AND expense_date <= ?
    `).get(branchId, startIso.slice(0, 10), endIso.slice(0, 10))

    const totalExpenseCents = expenseRow?.total_cents || 0

    const hourlyRows = db.prepare(`
      SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour,
             COUNT(*) as order_count,
             COALESCE(SUM(total_cents), 0) as total_cents
      FROM orders
      WHERE branch_id = ?
        AND created_at >= ? AND created_at <= ?
        AND status NOT IN ('DRAFT', 'CANCELLED')
      GROUP BY hour
    `).all(branchId, startIso, endIso)

    const hourMap = Object.fromEntries(hourlyRows.map((r) => [r.hour, r]))
    const hourly = []
    for (let h = 0; h < 24; h++) {
      hourly.push({
        hour: h,
        label: `${String(h).padStart(2, '0')}:00`,
        orderCount: hourMap[h]?.order_count || 0,
        totalCents: hourMap[h]?.total_cents || 0,
      })
    }

    const trendStart = new Date()
    trendStart.setDate(trendStart.getDate() - 6)
    trendStart.setHours(0, 0, 0, 0)
    const trendRows = db.prepare(`
      SELECT substr(created_at, 1, 10) as day,
             COUNT(*) as order_count,
             COALESCE(SUM(total_cents), 0) as total_cents
      FROM orders
      WHERE branch_id = ?
        AND created_at >= ?
        AND status NOT IN ('DRAFT', 'CANCELLED')
      GROUP BY day
      ORDER BY day ASC
    `).all(branchId, trendStart.toISOString())

    const trendMap = Object.fromEntries(trendRows.map((r) => [r.day, r]))
    const trend = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      trend.push({
        day: key,
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        orderCount: trendMap[key]?.order_count || 0,
        totalCents: trendMap[key]?.total_cents || 0,
      })
    }

    const activeCashSession = db.prepare(`
      SELECT id, user_id, opening_balance_cents, opened_at, status
      FROM cash_sessions
      WHERE branch_id = ? AND status = 'OPEN'
      ORDER BY opened_at DESC
      LIMIT 1
    `).get(branchId)

    const branch = db.prepare('SELECT id, name, code, currency_symbol FROM branches WHERE id = ?').get(branchId)

    return {
      rangeType,
      bounds: { start: startIso, end: endIso },
      branch,
      sales: {
        grossSalesCents,
        subtotalCents: salesRow.subtotal_cents || 0,
        discountCents: salesRow.total_discounts_cents || 0,
        taxCents: salesRow.total_tax_cents || 0,
        serviceChargeCents: salesRow.total_service_cents || 0,
        deliveryChargeCents: salesRow.total_delivery_cents || 0,
        refundCents,
        netSalesCents,
        totalOrders,
        avgOrderCents,
      },
      ordersByType,
      statusCounts,
      kitchen: {
        pending: kitchen?.pending || 0,
        delayed: kitchen?.delayed || 0,
        completed: (statusCounts.COMPLETED || 0) + (statusCounts.SERVED || 0),
        cancelled: statusCounts.CANCELLED || 0,
      },
      paymentsByMethod,
      topProducts,
      topCategories,
      lowStockItems,
      stockAlerts: {
        low: stockCounts?.low_stock || 0,
        out: stockCounts?.out_of_stock || 0,
      },
      expenses: {
        totalExpenseCents,
        estimatedNetProfitCents: netSalesCents - totalExpenseCents,
      },
      hourly,
      trend,
      cashSession: activeCashSession || null,
    }
  },
}
