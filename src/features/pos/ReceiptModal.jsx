import React from 'react'
import { Printer, CheckCircle2, X, Download } from 'lucide-react'

export default function ReceiptModal({ order, branchSettings, onClose, onNewOrder }) {
  if (!order) return null

  const handlePrint = () => {
    window.print()
  }

  const businessName = branchSettings?.business_name || 'FastBite Gourmet Grill'
  const receiptHeader = branchSettings?.receipt_header || 'FastBite Gourmet Grill\n100 Gourmet Plaza, Suite 4\nTel: +1 555-0199'
  const receiptFooter = branchSettings?.receipt_footer || 'Thank you for dining with us!\nVisit again soon.'

  const formattedDate = new Date(order.created_at || Date.now()).toLocaleString()

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header Bar */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-white text-sm">Receipt Preview & Print</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Printable Paper Canvas (80mm styling) */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-900/40">
          <div
            id="printable-receipt"
            className="bg-white text-slate-900 p-6 rounded-lg shadow-xl font-mono text-[11px] leading-relaxed mx-auto max-w-[320px] print:m-0 print:p-2 print:shadow-none print:w-full"
          >
            {/* Header */}
            <div className="text-center border-b border-dashed border-slate-400 pb-3 mb-3">
              <h2 className="font-black text-sm uppercase tracking-wide text-black">{businessName}</h2>
              <div className="whitespace-pre-line text-[10px] text-slate-600 mt-1">{receiptHeader}</div>
            </div>

            {/* Order Info */}
            <div className="space-y-1 border-b border-dashed border-slate-400 pb-2.5 mb-2.5 text-[10px]">
              <div className="flex justify-between font-bold">
                <span>ORDER: {order.order_number}</span>
                <span className="uppercase">{order.order_type?.replace('_', ' ')}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>DATE: {formattedDate}</span>
              </div>
              {order.table_number && (
                <div className="flex justify-between font-semibold text-black">
                  <span>TABLE: {order.table_number}</span>
                  {order.floor_name && <span>({order.floor_name})</span>}
                </div>
              )}
              {order.cashier_name && (
                <div className="flex justify-between text-slate-600">
                  <span>CASHIER: {order.cashier_name}</span>
                </div>
              )}
              {order.customer_name && (
                <div className="flex justify-between text-slate-600">
                  <span>CUSTOMER: {order.customer_name}</span>
                  {order.customer_phone && <span>{order.customer_phone}</span>}
                </div>
              )}
            </div>

            {/* Items List */}
            <div className="border-b border-dashed border-slate-400 pb-2.5 mb-2.5 space-y-2">
              <div className="flex justify-between text-[9px] uppercase font-bold text-slate-500 border-b border-slate-200 pb-1">
                <span>Item</span>
                <span className="text-right">Total</span>
              </div>

              {order.items?.map((item, idx) => (
                <div key={idx} className="space-y-0.5">
                  <div className="flex justify-between font-medium">
                    <span className="truncate pr-2">
                      {item.quantity}x {item.item_name}
                      {item.variation_name ? ` (${item.variation_name})` : ''}
                    </span>
                    <span className="font-bold shrink-0">
                      ${(item.total_cents / 100).toFixed(2)}
                    </span>
                  </div>

                  {/* Modifiers */}
                  {item.modifiers?.length > 0 && (
                    <div className="pl-3 text-[9px] text-slate-600 space-y-0.5">
                      {item.modifiers.map((m, mi) => (
                        <div key={mi} className="flex justify-between">
                          <span>+ {m.name}</span>
                          <span>${(m.price_cents / 100).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Item note */}
                  {item.notes && (
                    <div className="pl-3 text-[9px] text-slate-500 italic">
                      Note: {item.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Financial Calculations */}
            <div className="space-y-1 border-b border-dashed border-slate-400 pb-2.5 mb-2.5 text-[10px]">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>${(order.subtotal_cents / 100).toFixed(2)}</span>
              </div>
              {order.discount_cents > 0 && (
                <div className="flex justify-between text-rose-600 font-semibold">
                  <span>Discount {order.discount_reason ? `(${order.discount_reason})` : ''}:</span>
                  <span>-${(order.discount_cents / 100).toFixed(2)}</span>
                </div>
              )}
              {order.tax_cents > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Tax (VAT):</span>
                  <span>${(order.tax_cents / 100).toFixed(2)}</span>
                </div>
              )}
              {order.service_charge_cents > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Service Charge:</span>
                  <span>${(order.service_charge_cents / 100).toFixed(2)}</span>
                </div>
              )}
              {order.delivery_charge_cents > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Delivery Charge:</span>
                  <span>${(order.delivery_charge_cents / 100).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-sm pt-1 border-t border-slate-300 text-black">
                <span>TOTAL:</span>
                <span>${(order.total_cents / 100).toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Info */}
            <div className="space-y-1 border-b border-dashed border-slate-400 pb-2.5 mb-3 text-[10px]">
              {order.payments?.length > 0 ? (
                order.payments.map((p, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <div className="flex justify-between font-semibold">
                      <span>PAID ({p.payment_method}):</span>
                      <span>${(p.amount_cents / 100).toFixed(2)}</span>
                    </div>
                    {p.payment_method === 'CASH' && p.tendered_cents > p.amount_cents && (
                      <div className="flex justify-between text-[9px] text-slate-600 pl-2">
                        <span>Tendered: ${(p.tendered_cents / 100).toFixed(2)}</span>
                        <span>Change: ${(p.change_cents / 100).toFixed(2)}</span>
                      </div>
                    )}
                    {p.reference_number && (
                      <div className="text-[9px] text-slate-500 pl-2">
                        Ref: {p.reference_number}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex justify-between font-semibold">
                  <span>AMOUNT PAID:</span>
                  <span>${((order.paid_cents || 0) / 100).toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="text-center space-y-1 pt-1">
              <div className="whitespace-pre-line text-[9px] text-slate-500">{receiptFooter}</div>
              <div className="text-[8px] font-mono text-slate-400 mt-2">
                *** Powered by FastBite Offline POS ***
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-lg shadow-orange-950 transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Print Thermal Ticket
          </button>
          {onNewOrder && (
            <button
              onClick={() => {
                onClose()
                onNewOrder()
              }}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
            >
              Start New Order
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
