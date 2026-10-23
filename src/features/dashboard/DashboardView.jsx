import React, { useState, useEffect } from 'react'
import {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  Receipt,
  Utensils,
  Bike,
  CreditCard,
  Banknote,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  RefreshCw,
  PlusCircle,
  Package,
  CheckCircle2,
  Calendar,
  Layers
} from 'lucide-react'

export default function DashboardView({ onNavigate, onTriggerTestOrder }) {
  const [metrics, setMetrics] = useState(null)
  const [dateRange, setDateRange] = useState('today')
  const [loading, setLoading] = useState(true)

  const fetchMetrics = async (range = dateRange) => {
    setLoading(true)
    if (window.api?.dashboard?.getMetrics) {
      try {
        const res = await window.api.dashboard.getMetrics({ rangeType: range })
        setMetrics(res)
      } catch (err) {
        console.error('Failed to fetch dashboard metrics:', err)
      } finally {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    fetchMetrics(dateRange)
  }, [dateRange])

  const sales = metrics?.sales || {
    grossSalesCents: 0,
    discountCents: 0,
    taxCents: 0,
    netSalesCents: 0,
    totalOrders: 0,
    avgOrderCents: 0,
  }

  const ordersByType = metrics?.ordersByType || {
    DINE_IN: { count: 0, totalCents: 0 },
    TAKEAWAY: { count: 0, totalCents: 0 },
    DELIVERY: { count: 0, totalCents: 0 },
  }

  const totalTypeOrders =
    (ordersByType.DINE_IN?.count || 0) +
    (ordersByType.TAKEAWAY?.count || 0) +
    (ordersByType.DELIVERY?.count || 0)

  const dineInPct = totalTypeOrders > 0 ? Math.round((ordersByType.DINE_IN.count / totalTypeOrders) * 100) : 0
  const takeawayPct = totalTypeOrders > 0 ? Math.round((ordersByType.TAKEAWAY.count / totalTypeOrders) * 100) : 0
  const deliveryPct = totalTypeOrders > 0 ? Math.round((ordersByType.DELIVERY.count / totalTypeOrders) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Dashboard Top Header & Range Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-950/70 border border-slate-800 rounded-xl p-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-orange-400" />
            Live Restaurant Performance & Analytics
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time operational metrics, sales totals, and live kitchen order performance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Date range filter pills */}
          <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
            {[
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'this_week', label: 'This Week' },
              { id: 'this_month', label: 'This Month' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setDateRange(tab.id)}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  dateRange === tab.id ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => fetchMetrics(dateRange)}
            title="Refresh Metrics"
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-orange-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* 4 Primary KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Gross Sales */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Gross Sales</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-950 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            ${(sales.grossSalesCents / 100).toFixed(2)}
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Net: ${(sales.netSalesCents / 100).toFixed(2)}</span>
            <span className="text-slate-500 font-mono">Discounts: ${(sales.discountCents / 100).toFixed(2)}</span>
          </div>
        </div>

        {/* Card 2: Total Orders */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Orders</span>
            <div className="w-8 h-8 rounded-lg bg-orange-950 border border-orange-800/60 flex items-center justify-center text-orange-400">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {sales.totalOrders}
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Completed orders</span>
            <span className="text-emerald-400 font-medium">100% Offline</span>
          </div>
        </div>

        {/* Card 3: Average Order Value */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Avg Order Value</span>
            <div className="w-8 h-8 rounded-lg bg-sky-950 border border-sky-800/60 flex items-center justify-center text-sky-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            ${(sales.avgOrderCents / 100).toFixed(2)}
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Per sale average</span>
            <span className="text-sky-400">AOV</span>
          </div>
        </div>

        {/* Card 4: Tax Collected & Expenses */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 relative overflow-hidden group hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tax & Expenses</span>
            <div className="w-8 h-8 rounded-lg bg-purple-950 border border-purple-800/60 flex items-center justify-center text-purple-400">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            ${(sales.taxCents / 100).toFixed(2)}
          </div>
          <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Tax collected (5%)</span>
            <span className="text-purple-400">Expenses: ${(metrics?.expenses?.totalExpenseCents / 100 || 0).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Middle Row: Sales by Channel & Payments Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Sales by Order Channel */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Layers className="w-4 h-4 text-orange-400" />
              Sales by Order Channel
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">{totalTypeOrders} Orders</span>
          </div>

          <div className="space-y-3">
            {/* Dine In */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Utensils className="w-3.5 h-3.5 text-orange-400" /> Dine-In
                </span>
                <span className="font-mono text-slate-300 font-semibold">
                  {ordersByType.DINE_IN.count} ({dineInPct}%) • ${(ordersByType.DINE_IN.totalCents / 100).toFixed(2)}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${dineInPct}%` }} />
              </div>
            </div>

            {/* Takeaway */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <ShoppingBag className="w-3.5 h-3.5 text-sky-400" /> Takeaway
                </span>
                <span className="font-mono text-slate-300 font-semibold">
                  {ordersByType.TAKEAWAY.count} ({takeawayPct}%) • ${(ordersByType.TAKEAWAY.totalCents / 100).toFixed(2)}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${takeawayPct}%` }} />
              </div>
            </div>

            {/* Delivery */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Bike className="w-3.5 h-3.5 text-emerald-400" /> Delivery
                </span>
                <span className="font-mono text-slate-300 font-semibold">
                  {ordersByType.DELIVERY.count} ({deliveryPct}%) • ${(ordersByType.DELIVERY.totalCents / 100).toFixed(2)}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${deliveryPct}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Payments Breakdown */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-400" />
              Settled Payments
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">By Method</span>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
              <span className="flex items-center gap-2 text-slate-300">
                <Banknote className="w-4 h-4 text-emerald-400" /> Cash
              </span>
              <span className="font-mono font-bold text-white">
                ${((metrics?.paymentsByMethod?.CASH?.totalCents || 0) / 100).toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
              <span className="flex items-center gap-2 text-slate-300">
                <CreditCard className="w-4 h-4 text-sky-400" /> Card / Terminal
              </span>
              <span className="font-mono font-bold text-white">
                ${((metrics?.paymentsByMethod?.CARD?.totalCents || 0) / 100).toFixed(2)}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
              <span className="flex items-center gap-2 text-slate-300">
                <DollarSign className="w-4 h-4 text-purple-400" /> Bank Transfer / Online
              </span>
              <span className="font-mono font-bold text-white">
                ${((metrics?.paymentsByMethod?.BANK_TRANSFER?.totalCents || 0) / 100).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Inventory Stock Warnings
            </h3>
            <span className="text-[10px] bg-amber-950 text-amber-400 border border-amber-800/60 px-1.5 py-0.5 rounded font-mono">
              {metrics?.lowStockItems?.length || 0} Low
            </span>
          </div>

          <div className="space-y-2">
            {!metrics?.lowStockItems || metrics.lowStockItems.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500 flex flex-col items-center gap-1">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span>All ingredients above reorder threshold.</span>
              </div>
            ) : (
              metrics.lowStockItems.map((item) => (
                <div key={item.id} className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-white">{item.name}</div>
                    <span className="text-[10px] text-slate-500 font-mono">Min: {item.minimum_level} {item.unit}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-amber-400">
                      {item.current_stock} {item.unit}
                    </span>
                    <span className="block text-[9px] text-rose-400 font-semibold">REORDER</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Top Selling Products & Quick POS Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Top-Selling Products */}
        <div className="lg:col-span-2 bg-slate-950/70 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Package className="w-4 h-4 text-orange-400" />
              Top Selling Products
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">By Units Sold</span>
          </div>

          {!metrics?.topProducts || metrics.topProducts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No sales logged for this date range yet. Complete sales in POS to view product analytics.
            </div>
          ) : (
            <div className="space-y-2">
              {metrics.topProducts.map((p, idx) => (
                <div key={p.id} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-md bg-slate-800 font-bold text-orange-400 flex items-center justify-center text-xs">
                      #{idx + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-white">{p.name}</div>
                      <span className="text-[10px] text-slate-400">{p.category_name}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-white font-mono">{p.total_quantity} sold</div>
                    <span className="text-[11px] text-emerald-400 font-mono">${(p.total_revenue_cents / 100).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Operations Center */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Quick POS Actions</h3>
              <span className="text-[10px] text-emerald-400 font-mono">Ready</span>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => onNavigate?.('pos')}
                className="w-full p-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs transition-all shadow-md active:scale-95 flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4" /> Start New POS Order
                </span>
                <ArrowUpRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => onNavigate?.('products')}
                className="w-full p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold text-xs transition-all active:scale-95 flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-orange-400" /> Manage Menu & Products
                </span>
                <ArrowUpRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => onNavigate?.('tables')}
                className="w-full p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold text-xs transition-all active:scale-95 flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-orange-400" /> View Floor & Table Map
                </span>
                <ArrowUpRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => onTriggerTestOrder?.()}
                className="w-full p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold text-xs transition-all active:scale-95 flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <PlusCircle className="w-4 h-4 text-emerald-400" /> Simulate Real SQLite Sale
                </span>
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
            Cash Drawer: <span className="text-emerald-400 font-semibold">{metrics?.cashSession ? 'OPEN' : 'ACTIVE'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
