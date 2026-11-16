import React, { useEffect, useMemo, useState } from 'react'
import {
  BarChart3, RefreshCw, ArrowLeft, AlertCircle, Printer, Download,
} from 'lucide-react'
import { exportCsv, exportExcel, printReport } from '../../lib/reportExport.js'

const TABS = [
  { id: 'sales', label: 'Sales' },
  { id: 'products', label: 'Product sales' },
  { id: 'categories', label: 'Category sales' },
  { id: 'profit', label: 'Profit' },
  { id: 'foodcost', label: 'Food cost' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'vendors', label: 'Vendor statement' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'cashier', label: 'Cashier' },
  { id: 'staff', label: 'Staff' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'customers', label: 'Customers' },
  { id: 'refunds', label: 'Refunds' },
  { id: 'reservations', label: 'Reservations' },
  { id: 'branches', label: 'Branch comparison' },
  { id: 'hourly', label: 'Hourly' },
  { id: 'audits', label: 'Voids & log' },
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
  const [branchId, setBranchId] = useState('')
  const [orderType, setOrderType] = useState('')
  const [cashierId, setCashierId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [lookups, setLookups] = useState({ branches: [], cashiers: [], suppliers: [], categories: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const filter = useMemo(() => ({
    startDate,
    endDate,
    branchId: branchId || undefined,
    orderType: orderType || undefined,
    cashierId: cashierId || undefined,
    paymentMethod: paymentMethod || undefined,
  }), [startDate, endDate, branchId, orderType, cashierId, paymentMethod])

  const filterLabel = `${startDate} to ${endDate}${orderType ? ` · ${orderType}` : ''}${paymentMethod ? ` · ${paymentMethod}` : ''}`

  useEffect(() => {
    window.api?.reports?.getLookups?.().then(setLookups).catch(() => {})
  }, [])

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
    try {
      let next = null
      if (activeTab === 'sales') next = await api.getSalesSummary({ filter })
      else if (activeTab === 'products' || activeTab === 'categories') next = await api.getProductPerformance({ filter })
      else if (activeTab === 'profit') next = await api.getProfitAndLoss({ filter })
      else if (activeTab === 'foodcost') next = await (api.getFoodCost ? api.getFoodCost({ filter }) : { items: [] })
      else if (activeTab === 'hourly') next = await api.getHourlyBreakdown({ filter })
      else if (activeTab === 'staff') next = await api.getStaffSales({ filter })
      else if (activeTab === 'customers') next = await api.getCustomerReport({ filter })
      else if (activeTab === 'delivery') next = await api.getDeliveryReport({ filter })
      else if (activeTab === 'inventory') next = await api.getInventoryReport({ filter })
      else if (activeTab === 'purchases') next = await (api.getPurchaseReport ? api.getPurchaseReport({ filter }) : { items: [] })
      else if (activeTab === 'vendors') next = await (api.getVendorStatement ? api.getVendorStatement({ filter }) : { vendors: [] })
      else if (activeTab === 'expenses') next = await api.getExpenseReport({ filter })
      else if (activeTab === 'cashier') next = await (api.getCashierReport ? api.getCashierReport({ filter }) : { cashiers: [], sessions: [] })
      else if (activeTab === 'reservations') next = await api.getReservationReport({ filter })
      else if (activeTab === 'refunds') next = await api.getRefundReport({ filter })
      else if (activeTab === 'branches') next = await (api.getBranchComparison ? api.getBranchComparison({ filter }) : { rows: [] })
      else if (activeTab === 'audits') {
        const voids = await api.getVoidAudits({ filter })
        let logs = []
        try {
          logs = await api.getAuditLogs({ limit: 80 })
        } catch {
          logs = []
        }
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
  }, [activeTab, filter])

  const exportBundle = () => {
    const { columns, rows, title } = currentTable()
    return { columns, rows, title }
  }

  const currentTable = () => {
    const overall = data?.overall || {}
    if (activeTab === 'sales') {
      return {
        title: 'Sales report',
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'order_count', label: 'Orders' },
          { key: 'total_cents', label: 'Sales', render: (r) => money(r.total_cents), export: (r) => (r.total_cents / 100).toFixed(2) },
        ],
        rows: data?.dailyTimeline || [],
      }
    }
    if (activeTab === 'products') {
      return {
        title: 'Product sales',
        columns: [
          { key: 'item_name', label: 'Product' },
          { key: 'category_name', label: 'Category' },
          { key: 'total_quantity_sold', label: 'Qty' },
          { key: 'total_revenue_cents', label: 'Revenue', render: (r) => money(r.total_revenue_cents), export: (r) => ((r.total_revenue_cents || 0) / 100).toFixed(2) },
        ],
        rows: data?.items || [],
      }
    }
    if (activeTab === 'categories') {
      return {
        title: 'Category sales',
        columns: [
          { key: 'category_name', label: 'Category' },
          { key: 'total_quantity_sold', label: 'Qty' },
          { key: 'total_revenue_cents', label: 'Revenue', render: (r) => money(r.total_revenue_cents), export: (r) => ((r.total_revenue_cents || 0) / 100).toFixed(2) },
        ],
        rows: data?.categoryBreakdown || [],
      }
    }
    if (activeTab === 'foodcost') {
      return {
        title: 'Food cost',
        columns: [
          { key: 'product_name', label: 'Product' },
          { key: 'recipe_cost_cents', label: 'Recipe cost', render: (r) => money(r.recipe_cost_cents), export: (r) => ((r.recipe_cost_cents || 0) / 100).toFixed(2) },
          { key: 'selling_price_cents', label: 'Sell price', render: (r) => money(r.selling_price_cents), export: (r) => ((r.selling_price_cents || 0) / 100).toFixed(2) },
          { key: 'food_cost_percent', label: 'Food cost %' },
        ],
        rows: data?.items || [],
      }
    }
    if (activeTab === 'purchases') {
      return {
        title: 'Purchase report',
        columns: [
          { key: 'po_number', label: 'PO' },
          { key: 'vendor_name', label: 'Vendor' },
          { key: 'item_name', label: 'Item' },
          { key: 'order_date', label: 'Date' },
          { key: 'quantity', label: 'Qty' },
          { key: 'total_cents', label: 'Amount', render: (r) => money(r.total_cents), export: (r) => ((r.total_cents || 0) / 100).toFixed(2) },
        ],
        rows: data?.items || [],
      }
    }
    if (activeTab === 'vendors') {
      return {
        title: 'Vendor statement',
        columns: [
          { key: 'name', label: 'Vendor' },
          { key: 'invoices_cents', label: 'Invoices', render: (r) => money(r.invoices_cents), export: (r) => ((r.invoices_cents || 0) / 100).toFixed(2) },
          { key: 'returns_cents', label: 'Returns', render: (r) => money(r.returns_cents), export: (r) => ((r.returns_cents || 0) / 100).toFixed(2) },
          { key: 'payments_cents', label: 'Payments', render: (r) => money(r.payments_cents), export: (r) => ((r.payments_cents || 0) / 100).toFixed(2) },
          { key: 'outstanding_cents', label: 'Outstanding', render: (r) => money(r.outstanding_cents), export: (r) => ((r.outstanding_cents || 0) / 100).toFixed(2) },
        ],
        rows: data?.vendors || [],
      }
    }
    if (activeTab === 'cashier') {
      return {
        title: 'Cashier report',
        columns: [
          { key: 'display_name', label: 'Cashier' },
          { key: 'order_count', label: 'Orders' },
          { key: 'cash_cents', label: 'Cash', render: (r) => money(r.cash_cents), export: (r) => ((r.cash_cents || 0) / 100).toFixed(2) },
          { key: 'card_cents', label: 'Card', render: (r) => money(r.card_cents), export: (r) => ((r.card_cents || 0) / 100).toFixed(2) },
          { key: 'refund_cents', label: 'Refunds', render: (r) => money(r.refund_cents), export: (r) => ((r.refund_cents || 0) / 100).toFixed(2) },
        ],
        rows: data?.cashiers || [],
      }
    }
    if (activeTab === 'staff') {
      return {
        title: 'Staff sales',
        columns: [
          { key: 'display_name', label: 'Staff' },
          { key: 'order_count', label: 'Orders' },
          { key: 'sales_cents', label: 'Sales', render: (r) => money(r.sales_cents), export: (r) => ((r.sales_cents || 0) / 100).toFixed(2) },
        ],
        rows: Array.isArray(data) ? data : (data?.sales || []),
      }
    }
    if (activeTab === 'customers') {
      return {
        title: 'Customer report',
        columns: [
          { key: 'name', label: 'Customer' },
          { key: 'order_count', label: 'Orders' },
          { key: 'spent_cents', label: 'Spent', render: (r) => money(r.spent_cents), export: (r) => ((r.spent_cents || 0) / 100).toFixed(2) },
          { key: 'loyalty_points', label: 'Loyalty' },
          { key: 'last_order_at', label: 'Last order' },
        ],
        rows: Array.isArray(data) ? data : [],
      }
    }
    if (activeTab === 'refunds') {
      return {
        title: 'Refund report',
        columns: [
          { key: 'order_number', label: 'Order' },
          { key: 'returned_items', label: 'Items' },
          { key: 'reason', label: 'Reason' },
          { key: 'amount_cents', label: 'Amount', render: (r) => money(r.amount_cents), export: (r) => ((r.amount_cents || 0) / 100).toFixed(2) },
          { key: 'cashier_name', label: 'User' },
        ],
        rows: Array.isArray(data) ? data : [],
      }
    }
    if (activeTab === 'branches') {
      return {
        title: 'Branch comparison',
        columns: [
          { key: 'branch_name', label: 'Branch' },
          { key: 'order_count', label: 'Orders' },
          { key: 'sales_cents', label: 'Sales', render: (r) => money(r.sales_cents), export: (r) => ((r.sales_cents || 0) / 100).toFixed(2) },
          { key: 'cogs_cents', label: 'COGS', render: (r) => money(r.cogs_cents), export: (r) => ((r.cogs_cents || 0) / 100).toFixed(2) },
          { key: 'expenses_cents', label: 'Expenses', render: (r) => money(r.expenses_cents), export: (r) => ((r.expenses_cents || 0) / 100).toFixed(2) },
          { key: 'profit_cents', label: 'Profit', render: (r) => money(r.profit_cents), export: (r) => ((r.profit_cents || 0) / 100).toFixed(2) },
        ],
        rows: data?.rows || [],
      }
    }
    if (activeTab === 'expenses') {
      return {
        title: 'Expense report',
        columns: [
          { key: 'category_name', label: 'Category' },
          { key: 'expense_count', label: 'Count' },
          { key: 'total_cents', label: 'Amount', render: (r) => money(r.total_cents), export: (r) => ((r.total_cents || 0) / 100).toFixed(2) },
        ],
        rows: Array.isArray(data) ? data : [],
      }
    }
    if (activeTab === 'delivery') {
      return {
        title: 'Delivery report',
        columns: [
          { key: 'name', label: 'Rider' },
          { key: 'delivery_count', label: 'Orders' },
          { key: 'delivered_count', label: 'Delivered' },
          { key: 'failed_count', label: 'Failed' },
          { key: 'cod_cents', label: 'Cash collected', render: (r) => money(r.cod_cents), export: (r) => ((r.cod_cents || 0) / 100).toFixed(2) },
        ],
        rows: data?.riders || [],
      }
    }
    if (activeTab === 'reservations') {
      return {
        title: 'Reservation report',
        columns: [
          { key: 'status', label: 'Status' },
          { key: 'count', label: 'Count' },
        ],
        rows: Array.isArray(data) ? data : [],
      }
    }
    if (activeTab === 'inventory') {
      return {
        title: 'Inventory report',
        columns: [
          { key: 'name', label: 'Item' },
          { key: 'current_stock', label: 'Stock' },
          { key: 'valuation_cents', label: 'Value', render: (r) => money(r.valuation_cents), export: (r) => ((r.valuation_cents || 0) / 100).toFixed(2) },
          { key: 'is_low', label: 'Low', render: (r) => (r.is_low ? 'Yes' : ''), export: (r) => (r.is_low ? 'Yes' : '') },
        ],
        rows: data?.items || [],
      }
    }
    return { title: 'Report', columns: [{ key: 'id', label: 'Row' }], rows: [] }
  }

  const overall = data?.overall || {}
  const staffSales = Array.isArray(data) ? data : (data?.sales || [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-orange-600" />
            Reports & Analytics
          </h1>
          <p className="text-xs text-slate-500">Live SQLite figures. Export CSV/Excel or print to PDF.</p>
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
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
          <option value="">This branch</option>
          <option value="ALL">All branches</option>
          {(lookups.branches || []).map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select value={orderType} onChange={(e) => setOrderType(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
          <option value="">All order types</option>
          <option value="DINE_IN">Dine-in</option>
          <option value="TAKEAWAY">Takeaway</option>
          <option value="DELIVERY">Delivery</option>
        </select>
        <select value={cashierId} onChange={(e) => setCashierId(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
          <option value="">All cashiers</option>
          {(lookups.cashiers || []).map((u) => (
            <option key={u.id} value={u.id}>{u.display_name}</option>
          ))}
        </select>
        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs">
          <option value="">All payments</option>
          <option value="CASH">Cash</option>
          <option value="CARD">Card</option>
          <option value="CREDIT_CARD">Credit card</option>
          <option value="WALLET">Wallet / online</option>
        </select>
        <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 text-white text-xs font-semibold">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={() => { const t = exportBundle(); printReport(t.title, t.columns, t.rows, filterLabel) }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold"
          >
            <Printer className="w-3.5 h-3.5" /> Print / PDF
          </button>
          <button
            type="button"
            onClick={() => { const t = exportBundle(); exportCsv(t.title, t.columns, t.rows) }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            type="button"
            onClick={() => { const t = exportBundle(); exportExcel(t.title, t.columns, t.rows) }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold"
          >
            Excel
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              activeTab === tab.id ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
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
            <Card title="Gross sales" value={money(overall.gross_sales_cents || overall.total_sales_cents)} hint={`${overall.total_orders || 0} paid orders`} />
            <Card title="Refunds" value={money(overall.refund_cents)} />
            <Card title="Net sales" value={money(overall.net_sales_cents != null ? overall.net_sales_cents : (overall.total_sales_cents || 0) - (overall.refund_cents || 0))} />
            <Card title="Average ticket" value={money(overall.average_order_cents)} />
          </div>
          <Table empty="No sales in this date range." columns={[{ key: 'order_type', label: 'Channel' }, { key: 'order_count', label: 'Orders' }, { key: 'total_cents', label: 'Sales', render: (r) => money(r.total_cents) }]} rows={data.byOrderType} />
          <Table empty="No payments recorded." columns={[{ key: 'payment_method', label: 'Payment method' }, { key: 'payment_count', label: 'Count' }, { key: 'total_cents', label: 'Collected', render: (r) => money(r.total_cents) }]} rows={data.byPaymentMethod} />
          <Table empty="No cashier totals." columns={[{ key: 'cashier_name', label: 'Cashier' }, { key: 'order_count', label: 'Orders' }, { key: 'total_cents', label: 'Sales', render: (r) => money(r.total_cents) }]} rows={data.byCashier} />
          <Table empty="No daily totals yet." columns={[{ key: 'date', label: 'Date' }, { key: 'order_count', label: 'Orders' }, { key: 'total_cents', label: 'Sales', render: (r) => money(r.total_cents) }]} rows={data.dailyTimeline} />
        </div>
      )}

      {!loading && activeTab === 'products' && data && (
        <Table empty="No product sales in this range." columns={[{ key: 'item_name', label: 'Product' }, { key: 'category_name', label: 'Category' }, { key: 'total_quantity_sold', label: 'Qty' }, { key: 'total_revenue_cents', label: 'Revenue', render: (r) => money(r.total_revenue_cents) }]} rows={data.items} />
      )}

      {!loading && activeTab === 'categories' && data && (
        <Table empty="No category sales." columns={[{ key: 'category_name', label: 'Category' }, { key: 'total_quantity_sold', label: 'Qty' }, { key: 'total_revenue_cents', label: 'Revenue', render: (r) => money(r.total_revenue_cents) }]} rows={data.categoryBreakdown} />
      )}

      {!loading && activeTab === 'profit' && data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card title="Sales" value={money(data.revenueCents)} />
          <Card title="Food cost (COGS)" value={money(data.cogsCents)} />
          <Card title="Expenses" value={money(data.expensesCents)} />
          <Card title="Estimated net profit" value={money(data.netProfitCents)} hint={`${data.marginPercent}% margin`} />
        </div>
      )}

      {!loading && activeTab === 'foodcost' && (
        <Table empty="No recipes with cost." columns={[{ key: 'product_name', label: 'Product' }, { key: 'category_name', label: 'Category' }, { key: 'recipe_cost_cents', label: 'Recipe cost', render: (r) => money(r.recipe_cost_cents) }, { key: 'selling_price_cents', label: 'Selling price', render: (r) => money(r.selling_price_cents) }, { key: 'food_cost_percent', label: 'Food-cost %' }]} rows={data?.items} />
      )}

      {!loading && activeTab === 'hourly' && Array.isArray(data) && (
        <Table empty="No hourly sales." columns={[{ key: 'label', label: 'Hour' }, { key: 'orderCount', label: 'Orders' }, { key: 'totalCents', label: 'Sales', render: (r) => money(r.totalCents) }]} rows={data.filter((h) => h.orderCount > 0)} />
      )}

      {!loading && activeTab === 'staff' && (
        <div className="space-y-3">
          <Table empty="No staff sales." columns={[{ key: 'display_name', label: 'Staff' }, { key: 'role_name', label: 'Role' }, { key: 'order_count', label: 'Orders' }, { key: 'sales_cents', label: 'Sales', render: (r) => money(r.sales_cents) }, { key: 'refunded_cents', label: 'Refunds', render: (r) => money(r.refunded_cents) }]} rows={staffSales} />
          <Table empty="No attendance in this range." columns={[{ key: 'employee_name', label: 'Employee' }, { key: 'status', label: 'Status' }, { key: 'day_count', label: 'Days' }]} rows={data?.attendance} />
        </div>
      )}

      {!loading && activeTab === 'customers' && (
        <Table empty="No customer sales." columns={[{ key: 'name', label: 'Customer' }, { key: 'phone', label: 'Phone' }, { key: 'tag', label: 'Tag' }, { key: 'order_count', label: 'Orders' }, { key: 'spent_cents', label: 'Spent', render: (r) => money(r.spent_cents) }, { key: 'loyalty_points', label: 'Loyalty' }, { key: 'last_order_at', label: 'Last order' }]} rows={Array.isArray(data) ? data : []} />
      )}

      {!loading && activeTab === 'delivery' && (
        <div className="space-y-3">
          <Table empty="No delivery status rows." columns={[{ key: 'status', label: 'Status' }, { key: 'order_count', label: 'Orders' }, { key: 'cash_collected_cents', label: 'Cash collected', render: (r) => money(r.cash_collected_cents) }]} rows={data?.byStatus} />
          <Table empty="No rider activity." columns={[{ key: 'name', label: 'Rider' }, { key: 'delivery_count', label: 'Orders' }, { key: 'delivered_count', label: 'Delivered' }, { key: 'failed_count', label: 'Failed' }, { key: 'cod_cents', label: 'Cash collected', render: (r) => money(r.cod_cents) }]} rows={data?.riders} />
        </div>
      )}

      {!loading && activeTab === 'inventory' && data && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Card title="Stock value" value={money(data.totalValuationCents)} />
            <Card title="Low stock items" value={data.lowStockCount || 0} />
          </div>
          <Table empty="No inventory items." columns={[{ key: 'name', label: 'Item' }, { key: 'unit', label: 'Unit' }, { key: 'current_stock', label: 'Stock' }, { key: 'minimum_level', label: 'Min' }, { key: 'valuation_cents', label: 'Value', render: (r) => money(r.valuation_cents) }, { key: 'is_low', label: 'Low', render: (r) => (r.is_low ? 'Yes' : '') }]} rows={data.items} />
          <Table empty="No stock movement in this range." columns={[{ key: 'item_name', label: 'Item' }, { key: 'movement_type', label: 'Type' }, { key: 'quantity', label: 'Qty' }, { key: 'movement_count', label: 'Moves' }]} rows={data.movement} />
        </div>
      )}

      {!loading && activeTab === 'purchases' && (
        <Table empty="No purchases in this range." columns={[{ key: 'po_number', label: 'PO' }, { key: 'vendor_name', label: 'Vendor' }, { key: 'item_name', label: 'Item' }, { key: 'order_date', label: 'Date' }, { key: 'quantity', label: 'Qty' }, { key: 'total_cents', label: 'Amount', render: (r) => money(r.total_cents) }]} rows={data?.items} />
      )}

      {!loading && activeTab === 'vendors' && (
        <Table empty="No vendor activity." columns={[{ key: 'name', label: 'Vendor' }, { key: 'invoices_cents', label: 'Invoices', render: (r) => money(r.invoices_cents) }, { key: 'returns_cents', label: 'Returns', render: (r) => money(r.returns_cents) }, { key: 'payments_cents', label: 'Payments', render: (r) => money(r.payments_cents) }, { key: 'outstanding_cents', label: 'Outstanding', render: (r) => money(r.outstanding_cents) }]} rows={data?.vendors} />
      )}

      {!loading && activeTab === 'expenses' && (
        <Table empty="No expenses in this range." columns={[{ key: 'category_name', label: 'Category' }, { key: 'expense_count', label: 'Count' }, { key: 'total_cents', label: 'Total', render: (r) => money(r.total_cents) }]} rows={Array.isArray(data) ? data : []} />
      )}

      {!loading && activeTab === 'cashier' && data && (
        <div className="space-y-3">
          <Table empty="No cashier sales." columns={[{ key: 'display_name', label: 'Cashier' }, { key: 'order_count', label: 'Orders' }, { key: 'cash_cents', label: 'Cash', render: (r) => money(r.cash_cents) }, { key: 'card_cents', label: 'Card', render: (r) => money(r.card_cents) }, { key: 'refund_cents', label: 'Refunds', render: (r) => money(r.refund_cents) }, { key: 'sales_cents', label: 'Sales', render: (r) => money(r.sales_cents) }]} rows={data.cashiers} />
          <Table empty="No drawer sessions / variance." columns={[{ key: 'display_name', label: 'Cashier' }, { key: 'expected_cash_cents', label: 'Expected', render: (r) => money(r.expected_cash_cents) }, { key: 'counted_cash_cents', label: 'Counted', render: (r) => money(r.counted_cash_cents) }, { key: 'variance_cents', label: 'Variance', render: (r) => money(r.variance_cents) }, { key: 'status', label: 'Status' }]} rows={data.sessions} />
        </div>
      )}

      {!loading && activeTab === 'reservations' && (
        <Table empty="No reservations in this range." columns={[{ key: 'status', label: 'Status' }, { key: 'count', label: 'Count' }]} rows={Array.isArray(data) ? data : []} />
      )}

      {!loading && activeTab === 'refunds' && (
        <Table empty="No refunds in this range." columns={[{ key: 'order_number', label: 'Order' }, { key: 'returned_items', label: 'Returned items' }, { key: 'reason', label: 'Reason' }, { key: 'amount_cents', label: 'Amount', render: (r) => money(r.amount_cents) }, { key: 'cashier_name', label: 'User' }, { key: 'created_at', label: 'When' }]} rows={Array.isArray(data) ? data : []} />
      )}

      {!loading && activeTab === 'branches' && (
        <Table empty="No branch comparison data." columns={[{ key: 'branch_name', label: 'Branch' }, { key: 'order_count', label: 'Orders' }, { key: 'sales_cents', label: 'Sales', render: (r) => money(r.sales_cents) }, { key: 'cogs_cents', label: 'Costs', render: (r) => money(r.cogs_cents) }, { key: 'expenses_cents', label: 'Expenses', render: (r) => money(r.expenses_cents) }, { key: 'profit_cents', label: 'Profit', render: (r) => money(r.profit_cents) }]} rows={data?.rows} />
      )}

      {!loading && activeTab === 'audits' && data && (
        <div className="space-y-3">
          <Table empty="No voided or cancelled orders." columns={[{ key: 'order_number', label: 'Order' }, { key: 'status', label: 'Status' }, { key: 'total_cents', label: 'Total', render: (r) => money(r.total_cents) }, { key: 'cashier_name', label: 'Staff' }]} rows={data.voids?.voidOrders} />
          <Table empty="No audit log entries." columns={[{ key: 'created_at', label: 'When' }, { key: 'action', label: 'Action' }, { key: 'entity_type', label: 'Entity' }, { key: 'user_display_name', label: 'User' }]} rows={data.logs} />
        </div>
      )}
    </div>
  )
}
