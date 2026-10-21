import { getDb } from '../index.js'

function getDateRangeBounds(rangeType) {
  const now = new Date()
  let start = new Date()

  if (rangeType === 'yesterday') {
    start.setDate(now.getDate() - 1)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setHours(23, 59, 59, 999)
    return { startIso: start.toISOString(), endIso: end.toISOString() }
  } else if (rangeType === 'this_week') {
    start.setDate(now.getDate() - 7)
    start.setHours(0, 0, 0, 0)
  } else if (rangeType === 'this_month') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
  } else {
    // 'today' default
    start.setHours(0, 0, 0, 0)
  }

  return { startIso: start.toISOString(), endIso: now.toISOString() }
}

export const dashboardRepository = {
  getMetrics: (branchId, rangeType = 'today') => {
    const db = getDb()
    const { startIso, endIso } = getDateRangeBounds(rangeType)

    // 1. Sales & Order Totals from actual orders
    const salesRow = db.prepare(`
      SELECT 
        COUNT(id) as total_orders,
        COALESCE(SUM(total_cents), 0) as gross_sales_cents,
        COALESCE(SUM(discount_cents), 0) as total_discounts_cents,
        COALESCE(SUM(tax_cents), 0) as total_tax_cents,
        COALESCE(SUM(service_charge_cents), 0) as total_service_cents,
        COALESCE(SUM(delivery_charge_cents), 0) as total_delivery_cents
      FROM orders
      WHERE branch_id = ?
        AND created_at >= ? AND created_at <= ?
        AND status NOT IN ('DRAFT', 'CANCELLED')
    `).get(branchId, startIso, endIso)

    const totalOrders = salesRow.total_orders || 0
    const grossSalesCents = salesRow.gross_sales_cents || 0
    const avgOrderCents = totalOrders > 0 ? Math.round(grossSalesCents / totalOrders) : 0

    // 2. Sales by Order Type (Dine-In, Takeaway, Delivery)
    const typeRows = db.prepare(`
      SELECT order_type, COUNT(id) as count, COALESCE(SUM(total_cents), 0) as total_cents
      FROM orders
      WHERE branch_id = ?
        AND created_at >= ? AND created_at <= ?
        AND status NOT IN ('CANCELLED')
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

    // 3. Order Status Breakdown
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

    // 4. Sales by Payment Method
    const paymentRows = db.prepare(`
      SELECT payment_method, COALESCE(SUM(amount_cents), 0) as total_cents, COUNT(id) as count
      FROM payments
      WHERE branch_id = ?
        AND created_at >= ? AND created_at <= ?
        AND status = 'COMPLETED'
      GROUP BY payment_method
    `).all(branchId, startIso, endIso)

    const paymentsByMethod = {}
    for (const p of paymentRows) {
      paymentsByMethod[p.payment_method] = { totalCents: p.total_cents, count: p.count }
    }

    // 5. Top-Selling Products
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
        AND o.status NOT IN ('CANCELLED')
      GROUP BY p.id
      ORDER BY total_quantity DESC
      LIMIT 5
    `).all(branchId, startIso, endIso)

    // 6. Low-Stock Alerts
    const lowStockItems = db.prepare(`
      SELECT i.id, i.name, i.sku, i.current_stock, i.minimum_level, u.abbreviation as unit
      FROM inventory_items i
      JOIN inventory_units u ON i.unit_id = u.id
      WHERE i.branch_id = ?
        AND i.is_active = 1
        AND i.current_stock <= i.minimum_level
      ORDER BY i.current_stock ASC
      LIMIT 6
    `).all(branchId)

    // 7. Expenses
    const expenseRow = db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) as total_cents
      FROM expenses
      WHERE branch_id = ?
        AND expense_date >= ? AND expense_date <= ?
    `).get(branchId, startIso.slice(0, 10), endIso.slice(0, 10))

    const totalExpenseCents = expenseRow?.total_cents || 0

    // 8. Open Cash Drawer Session
    const activeCashSession = db.prepare(`
      SELECT id, user_id, opening_balance_cents, opened_at, status
      FROM cash_sessions
      WHERE branch_id = ? AND status = 'OPEN'
      ORDER BY opened_at DESC
      LIMIT 1
    `).get(branchId)

    return {
      rangeType,
      bounds: { start: startIso, end: endIso },
      sales: {
        grossSalesCents,
        discountCents: salesRow.total_discounts_cents || 0,
        taxCents: salesRow.total_tax_cents || 0,
        netSalesCents: grossSalesCents - (salesRow.total_discounts_cents || 0),
        totalOrders,
        avgOrderCents,
      },
      ordersByType,
      statusCounts,
      paymentsByMethod,
      topProducts,
      lowStockItems,
      expenses: {
        totalExpenseCents,
      },
      cashSession: activeCashSession || null,
    }
  },
}
