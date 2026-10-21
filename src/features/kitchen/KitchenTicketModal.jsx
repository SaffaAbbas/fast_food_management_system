import React from 'react'
import { Printer, X, Clock, Utensils, AlertCircle } from 'lucide-react'

/**
 * Kitchen Order Ticket (KOT) Thermal Receipt View
 * Standard 80mm format optimized for kitchen printers and chefs.
 */
export default function KitchenTicketModal({ ticket, onClose }) {
  if (!ticket) return null

  const handlePrint = () => {
    window.print()
  }

  const formattedTime = new Date(ticket.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto animate-scale-in">
        {/* Modal Controls (Not printed) */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-slate-800 print:hidden">
          <div className="flex items-center gap-2">
            <Utensils className="w-4 h-4 text-orange-400" />
            <span className="text-sm font-bold text-white">Kitchen Order Ticket (KOT)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print KOT
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 80mm Thermal KOT Surface */}
        <div className="p-6 bg-white text-black font-mono text-sm leading-relaxed overflow-y-auto max-h-[75vh]">
          {/* Header */}
          <div className="text-center border-b-2 border-dashed border-black pb-3 mb-3">
            <div className="text-xl font-black uppercase tracking-wider">*** KITCHEN TICKET ***</div>
            <div className="text-2xl font-black mt-1 bg-black text-white py-1 px-3 rounded inline-block">
              {ticket.order_number}
            </div>
            <div className="flex justify-between items-center text-xs font-bold mt-2 pt-1 border-t border-dotted border-gray-400">
              <span>Time: {formattedTime}</span>
              <span className="uppercase font-black px-1.5 py-0.5 border border-black rounded">
                {ticket.order_type.replace('_', ' ')}
              </span>
            </div>
            {ticket.table_number && (
              <div className="text-base font-black mt-1 text-left bg-gray-100 p-1 rounded">
                TABLE: {ticket.table_number} {ticket.floor_name ? `(${ticket.floor_name})` : ''}
              </div>
            )}
            {ticket.customer_name && (
              <div className="text-xs font-semibold text-left mt-0.5 text-gray-700">
                Customer: {ticket.customer_name}
              </div>
            )}
          </div>

          {/* Order-level Notes */}
          {ticket.order_notes && (
            <div className="mb-3 p-2 border-2 border-black rounded bg-yellow-100 text-xs font-black text-black">
              ORDER NOTE: {ticket.order_notes}
            </div>
          )}

          {/* Items Header */}
          <div className="flex justify-between font-black text-xs border-b border-black pb-1 mb-2">
            <span>QTY  ITEM</span>
            <span>STATUS</span>
          </div>

          {/* Item List */}
          <div className="space-y-3 border-b-2 border-dashed border-black pb-4 mb-3">
            {ticket.items?.map((item, idx) => (
              <div key={item.id || idx} className="text-left">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    <span className="text-lg font-black bg-black text-white px-1.5 py-0.5 rounded leading-none">
                      {item.quantity}x
                    </span>
                    <span className="text-base font-black leading-tight">
                      {item.item_name}
                    </span>
                  </div>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded border border-black uppercase">
                    {item.kitchen_status || 'PENDING'}
                  </span>
                </div>

                {/* Station Tag */}
                {item.station_name && (
                  <div className="text-[10px] font-bold text-gray-600 ml-8 mt-0.5 uppercase">
                    [{item.station_name}]
                  </div>
                )}

                {/* Modifiers / Addons */}
                {item.modifiers?.length > 0 && (
                  <div className="ml-8 mt-1 space-y-0.5">
                    {item.modifiers.map((mod, mIdx) => (
                      <div key={mIdx} className="text-xs font-bold text-black flex items-center gap-1">
                        + {mod.name}
                      </div>
                    ))}
                  </div>
                )}

                {/* Item-specific Notes */}
                {item.notes && (
                  <div className="ml-8 mt-1 text-xs font-black bg-gray-200 px-1.5 py-0.5 rounded inline-block text-black">
                    NOTE: {item.notes}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="text-center text-xs space-y-1">
            <div className="font-bold">Total Items: {ticket.totalItemsCount || ticket.items?.length || 0}</div>
            <div className="text-[10px] text-gray-500">Sent to Kitchen from POS Terminal</div>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end gap-2 print:hidden">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Print KOT Ticket
          </button>
        </div>
      </div>
    </div>
  )
}
