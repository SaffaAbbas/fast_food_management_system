import React, { useEffect, useState } from 'react'
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Clock,
  Percent,
  Receipt,
  RefreshCw,
  UserCheck,
  Users,
  UtensilsCrossed,
  Bike,
  Boxes,
  CalendarDays,
  RotateCcw,
  FileText,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react'

const TABS = [
  { id: 'sales', label: 'Sales', icon: DollarSign },
  { id: 'products', label: 'Product sales', icon: ShoppingBag },
  { id: 'discounts', label: 'Discounts', icon: Percent },
  { id: 'hourly', label: 'Hourly', icon: Clock },
  { id: 'pnl', label: 'Cost & P&L', icon: TrendingUp },
  { id: 'staff', label: 'Staff / roles', icon: UserCheck },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'kitchen', label: 'Kitchen', icon: UtensilsCrossed },
  { id: 'delivery', label: 'Delivery', icon: Bike },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'expenses', label: 'Expenses', icon: Receipt },
  { id: 'reservations', label: 'Reservations', icon: CalendarDays },
  { id: 'refunds', label: 'Refunds', icon: RotateCcw },
  { id: 'audits', label: 'Voids & log', icon: FileText },
]

function money(cents) {
  return `$${((Number(cents) || 0) / 100).toFixed(2)}`
}

function Empty({ text }) {
  return <p className="text-sm text-slate-500 py-8 text-center border border-dashed border-slate-200 rounded-xl bg-white">{text}</p>
}

function Card({ title, value, hint }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="text-xl font-bold text-slate-900 mt-1">{value}</div>
      {hint && <div className="text-[11px] text-slate-400 mt-1">{hint}</div>}
    </div>
  )
}

function Table({ columns, rows, empty }) {
  if (!rows?.length) return <Empty text={empty} />
  return (
    <div className="overflow-auto border border-slate-200 rounded-xl bg-white">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2 font-semibold whitespace-nowrap">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id || i} className="border-t border-slate-100">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 text-slate-800 whitespace-nowrap">{c.render ? c.render(row) : row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ReportsView({ onBack }) {
  const [activeTab, setActiveTab] = useState('sales')
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    const api = window.api?.reports
    if (!api) {
      setError('Reports API is not available. Launch the desktop app.')
      setData(null)
      setLoading(false)
      return
    }
    const filter = { startDate, endDate }
    try {
      let next = null
      if (activeTab === 'sales') next = await api.getSalesSummary({ filter })
      else if (activeTab === 'products') next = await api.getProductPerformance({ filter })
      else if (activeTab === 'discounts') {
        const [summary, audits] = await Promise.all([
          api.getSalesSummary({ filter }),
          api.getVoidAudits({ filter }),
        ])
        next = { summary, audits }
      } else if (activeTab === 'hourly') next = await api.getHourlyBreakdown({ filter })
      else if (activeTab === 'pnl') next = await api.getProfitAndLoss({ filter })
      else if (activeTab === 'staff') next = await api.getStaffSales({ filter })
      else if (activeTab === 'customers') next = await api.getCustomerReport({ filter })
      else if (activeTab === 'kitchen') next = await api.getKitchenReport({ filter })
      else if (activeTab === 'delivery') next = await api.getDeliveryReport({ filter })
      else if (activeTab === 'inventory') next = await api.getInventoryReport()
      else if (activeTab === 'expenses') next = await api.getExpenseReport({ filter })
      else if (activeTab === 'reservations') next = await api.getReservationReport({ filter })
      else if (activeTab === 'refunds') next = await api.getRefundReport({ filter })
      else if (activeTab === 'audits') {
        const [voids, logs] = await Promise.all([
          api.getVoidAudits({ filter }),
          api.getAuditLogs({ limit: 80 }),
        ])
        next = { voids, logs }
      }
      setData(next)
    } catch (err) {
      setError(err.message || 'Failed to load report.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, startDate, endDate])

  const overall = data?.overall || {}

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-orange-600" />
            Reports
          </h1>
          <p className="text-xs text-slate-500">Live figures from local SQLite. Empty means no records in this range.</p>
        </div>
        {onBack && (
          <button onClick={onBack} className="text-xs font-semibold text-slate-600 flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-xl p-3">
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />
        <span className="text-xs text-slate-400">to</span>
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs" />
        <button onClick={load} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 text-white text-xs font-semibold">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                active ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {loading && <p className="text-xs text-slate-500">Loading report...</p>}

      {!loading && activeTab === 'sales' && data && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card title="Sales" value={money(overall.total_sales_cents)} hint={`${overall.total_orders || 0} completed orders`} />
            <Card title="Average ticket" value={money(overall.average_order_cents)} />
            <Card title="Discounts" value={money(overall.total_discount_cents)} />
            <Card title="Tax" value={money(overall.total_tax_cents)} />
          </div>
          <Table
            empty="No sales in this date range."
            columns={[
              { key: 'order_type', label: 'Channel' },
              { key: 'order_count', label: 'Orders' },
              { key: 'total_cents', label: 'Sales', render: (r) => money(r.total_cents) },
            ]}
            rows={data.byOrderType}
          />
          <Table
            empty="No payments recorded."
            columns={[
              { key: 'payment_method', label: 'Payment method' },
              { key: 'payment_count', label: 'Count' },
              { key: 'total_cents', label: 'Collected', render: (r) => money(r.total_cents) },
            ]}
            rows={data.byPaymentMethod}
          />
          <Table
            empty="No daily totals yet."
            columns={[
              { key: 'date', label: 'Date' },
              { key: 'order_count', label: 'Orders' },
              { key: 'total_cents', label: 'Sales', render: (r) => money(r.total_cents) },
            ]}
            rows={data.dailyTimeline}
          />
        </div>
      )}

      {!loading && activeTab === 'products' && data && (
        <div className="space-y-3">
          <Table
            empty="No product sales in this range."
            columns={[
              { key: 'item_name', label: 'Product' },
              { key: 'category_name', label: 'Category' },
              { key: 'total_quantity_sold', label: 'Qty' },
              { key: 'total_revenue_cents', label: 'Revenue', render: (r) => money(r.total_revenue_cents) },
              { key: 'cost_price_cents', label: 'Unit cost', render: (r) => money(r.cost_price_cents) },
            ]}
            rows={data.items}
          />
          <Table
            empty="No category breakdown."
            columns={[
              { key: 'category_name', label: 'Category' },
              { key: 'total_quantity_sold', label: 'Qty' },
              { key: 'total_revenue_cents', label: 'Revenue', render: (r) => money(r.total_revenue_cents) },
            ]}
            rows={data.categoryBreakdown}
          />
        </div>
      )}

      {!loading && activeTab === 'discounts' && data && (
        <div className="space-y-3">
          <Card title="Total discounts" value={money(data.summary?.overall?.total_discount_cents)} />
          <Table
            empty="No discounted orders."
            columns={[
              { key: 'order_number', label: 'Order' },
              { key: 'discount_cents', label: 'Discount', render: (r) => money(r.discount_cents) },
              { key: 'discount_reason', label: 'Reason' },
              { key: 'cashier_name', label: 'Staff' },
            ]}
            rows={data.audits?.discountedOrders}
          />
        </div>
      )}

      {!loading && activeTab === 'hourly' && Array.isArray(data) && (
        <Table
          empty="No hourly sales."
          columns={[
            { key: 'label', label: 'Hour' },
            { key: 'orderCount', label: 'Orders' },
            { key: 'totalCents', label: 'Sales', render: (r) => money(r.totalCents) },
          ]}
          rows={data.filter((h) => h.orderCount > 0)}
        />
      )}

      {!loading && activeTab === 'pnl' && data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card title="Revenue" value={money(data.revenueCents)} />
          <Card title="COGS" value={money(data.cogsCents)} />
          <Card title="Expenses" value={money(data.expensesCents)} />
          <Card title="Net profit" value={money(data.netProfitCents)} hint={`${data.marginPercent}% margin`} />
          <Card title="Discounts" value={money(data.discountCents)} />
          <Card title="Tax" value={money(data.taxCents)} />
          <Card title="Gross profit" value={money(data.grossProfitCents)} />
        </div>
      )}

      {!loading && activeTab === 'staff' && (
        <Table
          empty="No staff sales in this range."
          columns={[
            { key: 'display_name', label: 'Staff' },
            { key: 'role_name', label: 'Role' },
            { key: 'order_count', label: 'Orders' },
            { key: 'sales_cents', label: 'Sales', render: (r) => money(r.sales_cents) },
            { key: 'discount_cents', label: 'Discounts', render: (r) => money(r.discount_cents) },
            { key: 'refunded_cents', label: 'Refunds', render: (r) => money(r.refunded_cents) },
          ]}
          rows={data}
        />
      )}

      {!loading && activeTab === 'customers' && (
        <Table
          empty="No customer sales in this range."
          columns={[
            { key: 'name', label: 'Customer' },
            { key: 'phone', label: 'Phone' },
            { key: 'tag', label: 'Tag' },
            { key: 'order_count', label: 'Orders' },
            { key: 'spent_cents', label: 'Spent', render: (r) => money(r.spent_cents) },
            { key: 'loyalty_points', label: 'Points' },
          ]}
          rows={data}
        />
      )}

      {!loading && activeTab === 'kitchen' && data && (
        <div className="space-y-3">
          <Card title="Avg. ticket time" value={`${data.avgPrepMinutes || 0} min`} />
          <Table
            empty="No kitchen tickets in this range."
            columns={[
              { key: 'status', label: 'Status' },
              { key: 'order_count', label: 'Orders' },
            ]}
            rows={data.byStatus}
          />
        </div>
      )}

      {!loading && activeTab === 'delivery' && (
        <Table
          empty="No rider activity in this range."
          columns={[
            { key: 'name', label: 'Rider' },
            { key: 'vehicle_type', label: 'Vehicle' },
            { key: 'delivery_count', label: 'Assigned' },
            { key: 'delivered_count', label: 'Delivered' },
            { key: 'failed_count', label: 'Failed' },
            { key: 'cod_cents', label: 'COD collected', render: (r) => money(r.cod_cents) },
          ]}
          rows={data?.riders}
        />
      )}

      {!loading && activeTab === 'inventory' && data && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Card title="Stock value" value={money(data.totalValuationCents)} />
            <Card title="Low stock items" value={data.lowStockCount || 0} />
          </div>
          <Table
            empty="No inventory items."
            columns={[
              { key: 'name', label: 'Item' },
              { key: 'unit', label: 'Unit' },
              { key: 'current_stock', label: 'Stock' },
              { key: 'minimum_level', label: 'Min' },
              { key: 'valuation_cents', label: 'Value', render: (r) => money(r.valuation_cents) },
              { key: 'is_low', label: 'Low', render: (r) => (r.is_low ? 'Yes' : '') },
            ]}
            rows={data.items}
          />
        </div>
      )}

      {!loading && activeTab === 'expenses' && (
        <Table
          empty="No expenses in this range."
          columns={[
            { key: 'category_name', label: 'Category' },
            { key: 'expense_count', label: 'Count' },
            { key: 'total_cents', label: 'Total', render: (r) => money(r.total_cents) },
          ]}
          rows={data}
        />
      )}

      {!loading && activeTab === 'reservations' && (
        <Table
          empty="No reservations in this range."
          columns={[
            { key: 'status', label: 'Status' },
            { key: 'count', label: 'Count' },
          ]}
          rows={data}
        />
      )}

      {!loading && activeTab === 'refunds' && (
        <Table
          empty="No refunds in this range."
          columns={[
            { key: 'order_number', label: 'Order' },
            { key: 'amount_cents', label: 'Amount', render: (r) => money(r.amount_cents) },
            { key: 'reason', label: 'Reason' },
            { key: 'cashier_name', label: 'Staff' },
            { key: 'created_at', label: 'When' },
          ]}
          rows={data}
        />
      )}

      {!loading && activeTab === 'audits' && data && (
        <div className="space-y-3">
          <Table
            empty="No voided or cancelled orders."
            columns={[
              { key: 'order_number', label: 'Order' },
              { key: 'status', label: 'Status' },
              { key: 'total_cents', label: 'Total', render: (r) => money(r.total_cents) },
              { key: 'cashier_name', label: 'Staff' },
            ]}
            rows={data.voids?.voidOrders}
          />
          <Table
            empty="No audit log entries."
            columns={[
              { key: 'created_at', label: 'When' },
              { key: 'action', label: 'Action' },
              { key: 'entity_type', label: 'Entity' },
              { key: 'user_display_name', label: 'User' },
            ]}
            rows={data.logs}
          />
        </div>
      )}
    </div>
  )
}
