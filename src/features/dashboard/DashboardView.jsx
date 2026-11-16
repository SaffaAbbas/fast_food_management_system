import React, { useState, useEffect } from 'react'
import {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  Utensils,
  Bike,
  CreditCard,
  Banknote,
  AlertTriangle,
  ArrowUpRight,
  RefreshCw,
  Package,
  CheckCircle2,
  Layers,
  Wallet,
  Building2,
  Truck,
  Clock,
  Ban,
  UserPlus,
  CalendarDays,
} from 'lucide-react'
import { userCan } from '../../lib/access.js'

function money(cents, symbol = '$') {
  return `${symbol}${(Number(cents || 0) / 100).toFixed(2)}`
}

function MiniBars({ items, valueKey = 'totalCents' }) {
  const max = Math.max(1, ...items.map((i) => i[valueKey] || 0))
  return (
    <div className="flex items-end gap-1 h-28">
      {items.map((item) => {
        const h = Math.round(((item[valueKey] || 0) / max) * 100)
        return (
          <div key={item.label} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="w-full h-24 bg-slate-100 rounded-md overflow-hidden flex items-end">
              <div className="w-full bg-orange-500 rounded-t-md" style={{ height: `${h}%` }} title={money(item[valueKey])} />
            </div>
            <span className="text-[9px] text-slate-400 truncate w-full text-center">{item.label}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function DashboardView({ currentUser, onNavigate }) {
  const [metrics, setMetrics] = useState(null)
  const [dateRange, setDateRange] = useState('today')
  const [customStart, setCustomStart] = useState(() => new Date().toISOString().slice(0, 10))
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10))
  const [branchId, setBranchId] = useState(currentUser?.branchId || '')
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const symbol = currentUser?.currencySymbol || metrics?.branch?.currency_symbol || '$'
  const canPickBranch = (currentUser?.roleCode || currentUser?.role_code) === 'super_admin'

  const fetchMetrics = async () => {
    setLoading(true)
    try {
      if (window.api?.dashboard?.listBranches) {
        const list = await window.api.dashboard.listBranches()
        setBranches(list || [])
        if (!branchId && list?.[0]?.id) setBranchId(list[0].id)
      }
      if (window.api?.dashboard?.getMetrics) {
        const res = await window.api.dashboard.getMetrics({
          rangeType: dateRange,
          branchId: canPickBranch ? branchId : undefined,
          startDate: dateRange === 'custom' ? customStart : undefined,
          endDate: dateRange === 'custom' ? customEnd : undefined,
        })
        setMetrics(res)
      }
    } catch (err) {
      console.error('Failed to fetch dashboard metrics:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
  }, [dateRange, branchId, customStart, customEnd])

  const sales = metrics?.sales || {
    grossSalesCents: 0,
    discountCents: 0,
    taxCents: 0,
    serviceChargeCents: 0,
    deliveryChargeCents: 0,
    refundCents: 0,
    netSalesCents: 0,
    totalOrders: 0,
    avgOrderCents: 0,
  }
  const kitchen = metrics?.kitchen || { pending: 0, delayed: 0, completed: 0, cancelled: 0 }
  const ordersByType = metrics?.ordersByType || {
    DINE_IN: { count: 0, totalCents: 0 },
    TAKEAWAY: { count: 0, totalCents: 0 },
    DELIVERY: { count: 0, totalCents: 0 },
  }
  const totalTypeOrders =
    (ordersByType.DINE_IN?.count || 0) +
    (ordersByType.TAKEAWAY?.count || 0) +
    (ordersByType.DELIVERY?.count || 0)
  const pct = (n) => (totalTypeOrders > 0 ? Math.round((n / totalTypeOrders) * 100) : 0)

  const showInventory = userCan(currentUser, 'inventory:manage')
  const showFinance = userCan(currentUser, 'reports:view') || userCan(currentUser, 'expenses:manage')
  const showKitchen = userCan(currentUser, 'kitchen:view') || userCan(currentUser, 'dashboard:view')
  const showPayments = userCan(currentUser, 'pos:process_payment') || userCan(currentUser, 'cash:manage') || userCan(currentUser, 'reports:view') || userCan(currentUser, 'dashboard:view')

  const actions = [
    { id: 'pos', label: 'New order', icon: ShoppingBag, perm: 'pos:create_order', primary: true },
    { id: 'products', label: 'Add product', icon: Package, perm: 'menu:manage' },
    { id: 'purchases', label: 'Purchase', icon: Truck, perm: 'inventory:manage' },
    { id: 'expenses', label: 'Expense', icon: DollarSign, perm: 'expenses:manage' },
    { id: 'customers', label: 'Customer', icon: UserPlus, perm: 'customers:view' },
    { id: 'reservations', label: 'Reservation', icon: CalendarDays, perm: 'reservations:manage' },
  ].filter((a) => userCan(currentUser, a.perm))

  const moneyLine = [
    { label: 'Gross sales', value: sales.grossSalesCents },
    { label: 'Discounts', value: sales.discountCents },
    { label: 'Tax', value: sales.taxCents },
    { label: 'Service', value: sales.serviceChargeCents },
    { label: 'Delivery', value: sales.deliveryChargeCents },
    { label: 'Refunds', value: sales.refundCents },
    { label: 'Net sales', value: sales.netSalesCents, emphasize: true },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-[18px] font-semibold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-orange-600" />
              Branch dashboard
            </h2>
            <p className="text-[13px] text-slate-500 mt-1">
              {metrics?.branch?.name || currentUser?.branchName || 'This branch'} · live SQLite totals
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canPickBranch && (
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-[13px] text-slate-800"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
            <div className="flex bg-slate-100 p-1 rounded-xl text-[13px] flex-wrap">
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: 'this_week', label: 'Week' },
                { id: 'this_month', label: 'Month' },
                { id: 'custom', label: 'Custom' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDateRange(tab.id)}
                  className={`px-3 py-1 rounded-md font-medium ${
                    dateRange === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button onClick={fetchMetrics} className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-orange-400' : ''}`} />
            </button>
          </div>
        </div>
        {dateRange === 'custom' && (
          <div className="flex gap-3 text-[13px]">
            <label className="text-slate-500">
              From
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="ml-2 border border-slate-200 rounded-lg px-2 py-1" />
            </label>
            <label className="text-slate-500">
              To
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="ml-2 border border-slate-200 rounded-lg px-2 py-1" />
            </label>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {moneyLine.map((row) => (
          <div key={row.label} className={`bg-white border rounded-2xl p-4 shadow-sm ${row.emphasize ? 'border-emerald-200' : 'border-slate-200'}`}>
            <div className="text-[12px] text-slate-500">{row.label}</div>
            <div className={`text-[18px] font-semibold mt-1 ${row.emphasize ? 'text-emerald-700' : 'text-slate-900'}`}>
              {money(row.value, symbol)}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="text-[13px] text-slate-500">Orders</div>
          <div className="text-[26px] font-semibold text-slate-900">{sales.totalOrders}</div>
          <div className="text-[12px] text-slate-400 mt-1">Avg {money(sales.avgOrderCents, symbol)}</div>
        </div>
        {showKitchen && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="text-[13px] text-slate-500 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Kitchen</div>
            <div className="text-[26px] font-semibold text-slate-900">{kitchen.pending} pending</div>
            <div className="text-[12px] text-amber-700 mt-1">{kitchen.delayed} delayed (&gt;20 min)</div>
          </div>
        )}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="text-[13px] text-slate-500 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Completed / cancelled</div>
          <div className="text-[26px] font-semibold text-slate-900">{kitchen.completed}</div>
          <div className="text-[12px] text-rose-600 mt-1 flex items-center gap-1"><Ban className="w-3.5 h-3.5" /> {kitchen.cancelled} cancelled</div>
        </div>
        {showFinance && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="text-[13px] text-slate-500">Expenses / est. profit</div>
            <div className="text-[26px] font-semibold text-slate-900">{money(metrics?.expenses?.estimatedNetProfitCents, symbol)}</div>
            <div className="text-[12px] text-slate-400 mt-1">Spend {money(metrics?.expenses?.totalExpenseCents, symbol)}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-[14px] font-semibold text-slate-800 mb-3">Hourly sales</h3>
          <MiniBars items={(metrics?.hourly || []).filter((h) => h.hour >= 8 && h.hour <= 23)} />
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-[14px] font-semibold text-slate-800 mb-3">7-day sales trend</h3>
          <MiniBars items={metrics?.trend || []} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <h3 className="text-[14px] font-semibold text-slate-800 flex items-center gap-2">
            <Layers className="w-4 h-4 text-orange-500" /> Orders by type
          </h3>
          {[
            { key: 'DINE_IN', label: 'Dine-In', icon: Utensils, color: 'bg-orange-500' },
            { key: 'TAKEAWAY', label: 'Takeaway', icon: ShoppingBag, color: 'bg-sky-500' },
            { key: 'DELIVERY', label: 'Delivery', icon: Bike, color: 'bg-emerald-500' },
          ].map((row) => {
            const Icon = row.icon
            const data = ordersByType[row.key]
            return (
              <div key={row.key}>
                <div className="flex justify-between text-[12px] mb-1 text-slate-600">
                  <span className="flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {row.label}</span>
                  <span>{data.count} · {money(data.totalCents, symbol)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full ${row.color}`} style={{ width: `${pct(data.count)}%` }} />
                </div>
              </div>
            )
          })}
        </div>

        {showPayments && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2.5 shadow-sm">
            <h3 className="text-[14px] font-semibold text-slate-800 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-500" /> Payments
            </h3>
            {[
              { key: 'CASH', label: 'Cash', icon: Banknote },
              { key: 'CARD', label: 'Card', icon: CreditCard },
              { key: 'BANK_TRANSFER', label: 'Bank transfer', icon: Building2 },
              { key: 'WALLET', label: 'Wallet / online', icon: Wallet },
            ].map((row) => {
              const Icon = row.icon
              const data = metrics?.paymentsByMethod?.[row.key] || { totalCents: 0, count: 0 }
              return (
                <div key={row.key} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-[13px]">
                  <span className="flex items-center gap-2 text-slate-700"><Icon className="w-4 h-4 text-slate-400" /> {row.label}</span>
                  <span className="font-semibold text-slate-900">{money(data.totalCents, symbol)}</span>
                </div>
              )
            })}
          </div>
        )}

        {showInventory && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Stock alerts
              </h3>
              <span className="text-[11px] text-slate-500">{metrics?.stockAlerts?.low || 0} low · {metrics?.stockAlerts?.out || 0} out</span>
            </div>
            {!metrics?.lowStockItems?.length ? (
              <div className="p-4 text-center text-[13px] text-slate-500">All stock above reorder level.</div>
            ) : (
              metrics.lowStockItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-[13px] border-b border-slate-100 pb-2">
                  <div>
                    <div className="font-medium text-slate-800">{item.name}</div>
                    <div className="text-[11px] text-slate-400">Min {item.minimum_level} {item.unit}</div>
                  </div>
                  <span className={`font-semibold ${item.is_out ? 'text-rose-600' : 'text-amber-600'}`}>
                    {item.is_out ? 'OUT' : `${item.current_stock} ${item.unit}`}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="text-[14px] font-semibold text-slate-800 flex items-center gap-2">
            <Package className="w-4 h-4 text-orange-500" /> Top products & categories
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              {(metrics?.topProducts || []).length === 0 && <p className="text-[13px] text-slate-500">No product sales in this range.</p>}
              {(metrics?.topProducts || []).map((p, idx) => (
                <div key={p.id} className="flex justify-between text-[13px]">
                  <span className="text-slate-700">#{idx + 1} {p.name}</span>
                  <span className="text-slate-500">{p.total_quantity} · {money(p.total_revenue_cents, symbol)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {(metrics?.topCategories || []).map((c) => (
                <div key={c.id} className="flex justify-between text-[13px]">
                  <span className="text-slate-700">{c.name}</span>
                  <span className="text-slate-500">{money(c.total_revenue_cents, symbol)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-[14px] font-semibold text-slate-800 mb-3">Quick actions</h3>
          <div className="space-y-2">
            {actions.map((a) => {
              const Icon = a.icon
              return (
                <button
                  key={a.id}
                  onClick={() => onNavigate?.(a.id)}
                  className={`w-full p-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-between ${
                    a.primary ? 'bg-orange-600 text-white' : 'bg-slate-50 border border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2"><Icon className="w-4 h-4" /> {a.label}</span>
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              )
            })}
            {actions.length === 0 && <p className="text-[13px] text-slate-500">No actions for this role.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
