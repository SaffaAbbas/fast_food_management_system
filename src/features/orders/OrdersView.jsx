import React, { useState, useEffect } from 'react'
import {
  Receipt,
  Search,
  Filter,
  Eye,
  Printer,
  X,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Grid3X3,
  User,
  ShoppingBag,
  CreditCard,
  Ban,
  Clock,
  ChevronRight,
  RefreshCw
} from 'lucide-react'
import ReceiptModal from '../pos/ReceiptModal.jsx'
import PaymentModal from '../pos/PaymentModal.jsx'

export default function OrdersView({ onNavigateToPos }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('ALL') // 'ALL' | 'CONFIRMED' | 'COMPLETED' | 'DRAFT' | 'CANCELLED'
  const [orderTypeFilter, setOrderTypeFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Selected Order Drawer
  const [selectedOrderId, setSelectedOrderId] = useState(null)
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

  // Receipt & Payment Modals
  const [receiptOrder, setReceiptOrder] = useState(null)
  const [paymentOrder, setPaymentOrder] = useState(null)

  // Cancellation Modal
  const [cancelModalOrder, setCancelModalOrder] = useState(null)
  const [cancelReason, setCancelReason] = useState('Customer changed mind')
  const [cancelling, setCancelling] = useState(false)

  // Toast
  const [toast, setToast] = useState(null)

  const showToast = (type, message) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3500)
  }

  const loadOrders = async () => {
    setLoading(true)
    try {
      if (window.api?.pos?.getOrders) {
        const res = await window.api.pos.getOrders({
          status: statusFilter !== 'ALL' ? statusFilter : null,
          orderType: orderTypeFilter !== 'ALL' ? orderTypeFilter : null,
          search: searchQuery,
          limit: 100,
        })
        setOrders(res || [])
      }
    } catch (err) {
      console.error('Failed to load orders:', err)
      showToast('error', `Failed to load orders: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOrders()
  }, [statusFilter, orderTypeFilter, searchQuery])

  // View full order details
  const handleOpenDetails = async (orderId) => {
    setSelectedOrderId(orderId)
    setLoadingDetails(true)
    try {
      if (window.api?.pos?.getOrder) {
        const full = await window.api.pos.getOrder(orderId)
        setSelectedOrderDetails(full)
      }
    } catch (err) {
      showToast('error', `Could not fetch order details: ${err.message}`)
    } finally {
      setLoadingDetails(false)
    }
  }

  // Cancel order execution
  const handleConfirmCancel = async (e) => {
    e.preventDefault()
    if (!cancelModalOrder || !cancelReason.trim()) return

    setCancelling(true)
    try {
      await window.api.pos.cancelOrder({
        orderId: cancelModalOrder.id,
        reason: cancelReason.trim(),
      })
      showToast('success', `Order ${cancelModalOrder.order_number} cancelled successfully`)
      setCancelModalOrder(null)
      loadOrders()
      if (selectedOrderId === cancelModalOrder.id) {
        handleOpenDetails(cancelModalOrder.id)
      }
    } catch (err) {
      showToast('error', `Cancel failed: ${err.message}`)
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-2 text-xs font-semibold animate-fade-in ${
          toast.type === 'success'
            ? 'bg-emerald-950/95 border-emerald-800 text-emerald-200'
            : 'bg-rose-950/95 border-rose-800 text-rose-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-orange-950/80 border border-orange-800/80 text-orange-400">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white tracking-tight">Orders & Billing History</h2>
            <p className="text-xs text-slate-400">
              Audit log of all dine-in, takeaway, and delivery orders, payment details, and receipt printing.
            </p>
          </div>
        </div>

        <button
          onClick={loadOrders}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold cursor-pointer transition-all self-start md:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5 text-orange-400" /> Refresh List
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Order #, Customer, Table..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
          />
        </div>

        {/* Status Filters & Channel */}
        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
          {/* Status Pills */}
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 overflow-x-auto scrollbar-none">
            {['ALL', 'CONFIRMED', 'COMPLETED', 'DRAFT', 'CANCELLED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer capitalize ${
                  statusFilter === st
                    ? 'bg-orange-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {st.toLowerCase()}
              </button>
            ))}
          </div>

          {/* Order Type Dropdown */}
          <select
            value={orderTypeFilter}
            onChange={(e) => setOrderTypeFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-orange-500 cursor-pointer"
          >
            <option value="ALL">All Order Types</option>
            <option value="DINE_IN">Dine-In</option>
            <option value="TAKEAWAY">Takeaway</option>
            <option value="DELIVERY">Delivery</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-16 text-center text-xs text-slate-500">Loading order records...</div>
        ) : orders.length === 0 ? (
          <div className="p-16 text-center text-xs text-slate-500 space-y-2">
            <Receipt className="w-8 h-8 text-slate-700 mx-auto" />
            <p className="font-semibold text-slate-300">No orders match criteria</p>
            <p className="text-[11px] text-slate-600">Try clearing your filters or creating an order in POS.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3.5 px-4">Order # & Type</th>
                  <th className="py-3.5 px-4">Table / Customer</th>
                  <th className="py-3.5 px-4">Date & Time</th>
                  <th className="py-3.5 px-4">Items</th>
                  <th className="py-3.5 px-4">Total Amount</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {orders.map((o) => {
                  const isCompleted = o.status === 'COMPLETED'
                  const isCancelled = o.status === 'CANCELLED'
                  const isDraft = o.status === 'DRAFT'

                  return (
                    <tr
                      key={o.id}
                      onClick={() => handleOpenDetails(o.id)}
                      className="hover:bg-slate-900/60 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-white text-sm">{o.order_number}</div>
                        <div className="text-[10px] text-orange-400 font-semibold uppercase">
                          {o.order_type?.replace('_', ' ')}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">
                          {o.table_number ? `Table ${o.table_number}` : o.customer_name || 'Walk-in'}
                        </div>
                        {o.customer_phone && (
                          <div className="text-[11px] text-slate-500 font-mono">{o.customer_phone}</div>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                        <div>{new Date(o.created_at).toLocaleDateString()}</div>
                        <div className="text-[10px] text-slate-500">
                          {new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300 font-mono text-[11px]">
                          {o.item_count || 1} items
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono">
                        <div className="font-black text-emerald-400 text-sm">
                          ${(o.total_cents / 100).toFixed(2)}
                        </div>
                        {o.paid_cents < o.total_cents && (
                          <span className="text-[9px] text-amber-400 font-semibold">
                            Due: ${((o.total_cents - o.paid_cents) / 100).toFixed(2)}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isCompleted
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : isCancelled
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : isDraft
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                          }`}
                        >
                          {o.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleOpenDetails(o.id)}
                            title="View Full Order Breakdown"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={async () => {
                              const full = await window.api.pos.getOrder(o.id)
                              setReceiptOrder(full)
                            }}
                            title="Print Thermal Ticket"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5 text-orange-400" />
                          </button>

                          {!isCancelled && !isCompleted && (
                            <button
                              onClick={() => setCancelModalOrder(o)}
                              title="Cancel Order"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* DRAWER: ORDER DETAILS INSPECTOR */}
      {/* ========================================================================= */}
      {selectedOrderId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end">
          <div className="bg-slate-950 border-l border-slate-800 w-full max-w-lg h-full flex flex-col p-6 shadow-2xl space-y-4 animate-slide-left">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-base">
                  Order Details: {selectedOrderDetails?.order_number || selectedOrderId}
                </h3>
                <span className="text-xs text-orange-400 uppercase font-semibold">
                  {selectedOrderDetails?.order_type?.replace('_', ' ')}
                </span>
              </div>
              <button
                onClick={() => {
                  setSelectedOrderId(null)
                  setSelectedOrderDetails(null)
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingDetails ? (
              <div className="text-center py-20 text-xs text-slate-500">Loading order items...</div>
            ) : selectedOrderDetails ? (
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {/* Meta Summary Box */}
                <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Order Status:</span>
                    <span className="font-bold text-white uppercase">{selectedOrderDetails.status}</span>
                  </div>
                  {selectedOrderDetails.table_number && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Dining Table:</span>
                      <span className="font-bold text-white">
                        Table {selectedOrderDetails.table_number} ({selectedOrderDetails.floor_name})
                      </span>
                    </div>
                  )}
                  {selectedOrderDetails.customer_name && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Customer:</span>
                      <span className="font-bold text-white">{selectedOrderDetails.customer_name}</span>
                    </div>
                  )}
                  {selectedOrderDetails.cashier_name && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Cashier:</span>
                      <span className="text-white">{selectedOrderDetails.cashier_name}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Placed At:</span>
                    <span className="font-mono text-slate-300">
                      {new Date(selectedOrderDetails.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Items List */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Itemized Order Lines
                  </h4>
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-2">
                    {selectedOrderDetails.items?.map((item, idx) => (
                      <div key={idx} className="text-xs space-y-0.5 border-b border-slate-800/60 pb-2 last:border-none last:pb-0">
                        <div className="flex justify-between font-semibold text-white">
                          <span>
                            {item.quantity}x {item.item_name}
                            {item.variation_name ? ` (${item.variation_name})` : ''}
                          </span>
                          <span className="font-mono text-emerald-400">
                            ${(item.total_cents / 100).toFixed(2)}
                          </span>
                        </div>
                        {item.modifiers?.length > 0 && (
                          <div className="pl-3 text-[11px] text-slate-400 space-y-0.5">
                            {item.modifiers.map((m, mi) => (
                              <div key={mi} className="flex justify-between">
                                <span>+ {m.name}</span>
                                <span>${(m.price_cents / 100).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {item.notes && (
                          <div className="pl-3 text-[11px] text-amber-400/90 italic">
                            Note: {item.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal:</span>
                    <span>${(selectedOrderDetails.subtotal_cents / 100).toFixed(2)}</span>
                  </div>
                  {selectedOrderDetails.discount_cents > 0 && (
                    <div className="flex justify-between text-amber-400">
                      <span>Discount ({selectedOrderDetails.discount_reason || 'Promo'}):</span>
                      <span>-${(selectedOrderDetails.discount_cents / 100).toFixed(2)}</span>
                    </div>
                  )}
                  {selectedOrderDetails.tax_cents > 0 && (
                    <div className="flex justify-between text-slate-400">
                      <span>Tax (VAT):</span>
                      <span>${(selectedOrderDetails.tax_cents / 100).toFixed(2)}</span>
                    </div>
                  )}
                  {selectedOrderDetails.service_charge_cents > 0 && (
                    <div className="flex justify-between text-slate-400">
                      <span>Service Charge:</span>
                      <span>${(selectedOrderDetails.service_charge_cents / 100).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-black text-sm text-white pt-1.5 border-t border-slate-800">
                    <span>Grand Total:</span>
                    <span className="text-emerald-400">
                      ${(selectedOrderDetails.total_cents / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400 pt-1">
                    <span>Paid Amount:</span>
                    <span className="text-white">${((selectedOrderDetails.paid_cents || 0) / 100).toFixed(2)}</span>
                  </div>
                </div>

                {/* Action Controls in Drawer */}
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    onClick={() => setReceiptOrder(selectedOrderDetails)}
                    className="w-full py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-md cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Printer className="w-4 h-4" /> Print Thermal Receipt
                  </button>

                  {selectedOrderDetails.status !== 'COMPLETED' && selectedOrderDetails.status !== 'CANCELLED' && (
                    <button
                      onClick={() => setPaymentOrder(selectedOrderDetails)}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md cursor-pointer flex items-center justify-center gap-2"
                    >
                      <CreditCard className="w-4 h-4" /> Settle / Process Payment
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CANCEL ORDER REASON */}
      {/* ========================================================================= */}
      {cancelModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-400">
              <Ban className="w-5 h-5" />
              <h3 className="font-bold text-white text-base">
                Cancel Order {cancelModalOrder.order_number}
              </h3>
            </div>

            <p className="text-xs text-slate-400">
              Cancellation is permanent and will release any occupied dining table. A mandatory reason must be recorded in the audit log.
            </p>

            <form onSubmit={handleConfirmCancel} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Cancellation Reason *
                </label>
                <input
                  type="text"
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Customer changed mind, accidental order"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCancelModalOrder(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                >
                  Keep Order
                </button>
                <button
                  type="submit"
                  disabled={cancelling}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                >
                  {cancelling ? 'Cancelling...' : 'Confirm Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: THERMAL RECEIPT */}
      {/* ========================================================================= */}
      {receiptOrder && (
        <ReceiptModal
          order={receiptOrder}
          onClose={() => setReceiptOrder(null)}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL: PAYMENT SETTLEMENT */}
      {/* ========================================================================= */}
      {paymentOrder && (
        <PaymentModal
          order={paymentOrder}
          onClose={() => setPaymentOrder(null)}
          onPaymentSuccess={(settled) => {
            setPaymentOrder(null)
            setReceiptOrder(settled)
            loadOrders()
            if (selectedOrderId === settled.id) {
              handleOpenDetails(settled.id)
            }
          }}
        />
      )}
    </div>
  )
}
