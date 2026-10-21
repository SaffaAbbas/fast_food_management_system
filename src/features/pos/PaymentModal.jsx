import React, { useState } from 'react'
import {
  DollarSign,
  CreditCard,
  Building2,
  Smartphone,
  X,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Receipt
} from 'lucide-react'

export default function PaymentModal({ order, branchSettings, onClose, onPaymentSuccess }) {
  const totalCents = order?.total_cents || 0
  const alreadyPaidCents = order?.paid_cents || 0
  const balanceDueCents = Math.max(0, totalCents - alreadyPaidCents)

  const [paymentMode, setPaymentMode] = useState('single') // 'single' | 'split'
  const [selectedMethod, setSelectedMethod] = useState('CASH')
  const [tenderedInput, setTenderedInput] = useState((balanceDueCents / 100).toFixed(2))
  const [referenceNumber, setReferenceNumber] = useState('')

  // Split payments list: [ { method: 'CASH', amount: '10.00', reference: '' } ]
  const [splitItems, setSplitItems] = useState([
    { method: 'CASH', amount: (balanceDueCents / 200).toFixed(2), reference: '' },
    { method: 'CARD', amount: (balanceDueCents / 200).toFixed(2), reference: '' }
  ])

  const [processing, setProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Calculations for Single Payment
  const tenderedCents = Math.round(parseFloat(tenderedInput || 0) * 100)
  const changeCents = selectedMethod === 'CASH' ? Math.max(0, tenderedCents - balanceDueCents) : 0

  // Calculations for Split Payment
  const splitTotalCents = splitItems.reduce((acc, it) => acc + Math.round(parseFloat(it.amount || 0) * 100), 0)
  const splitRemainingCents = balanceDueCents - splitTotalCents

  // Quick cash buttons
  const addQuickCash = (cents) => {
    if (cents === 'exact') {
      setTenderedInput((balanceDueCents / 100).toFixed(2))
    } else {
      const current = Math.round(parseFloat(tenderedInput || 0) * 100)
      setTenderedInput(((current + cents) / 100).toFixed(2))
    }
  }

  const setExactBill = (billCents) => {
    setTenderedInput((billCents / 100).toFixed(2))
  }

  // Handle Split Items
  const handleAddSplitRow = () => {
    const remaining = Math.max(0, splitRemainingCents)
    setSplitItems((prev) => [
      ...prev,
      { method: 'CARD', amount: (remaining / 100).toFixed(2), reference: '' }
    ])
  }

  const handleUpdateSplit = (idx, field, value) => {
    setSplitItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it))
    )
  }

  const handleRemoveSplit = (idx) => {
    setSplitItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleProcessPayment = async () => {
    setErrorMsg('')

    let paymentsPayload = []
    let finalTenderedCents = 0
    let finalChangeCents = 0

    if (paymentMode === 'single') {
      if (selectedMethod === 'CASH' && tenderedCents < balanceDueCents) {
        setErrorMsg(`Tendered cash ($${(tenderedCents / 100).toFixed(2)}) is less than balance due ($${(balanceDueCents / 100).toFixed(2)}).`)
        return
      }

      paymentsPayload = [
        {
          paymentMethod: selectedMethod,
          amountCents: balanceDueCents,
          referenceNumber: referenceNumber.trim() || undefined
        }
      ]
      finalTenderedCents = selectedMethod === 'CASH' ? tenderedCents : balanceDueCents
      finalChangeCents = changeCents
    } else {
      // Split mode
      if (splitTotalCents < balanceDueCents) {
        setErrorMsg(`Total split payments ($${(splitTotalCents / 100).toFixed(2)}) do not cover full balance due ($${(balanceDueCents / 100).toFixed(2)}).`)
        return
      }

      paymentsPayload = splitItems.map((it) => ({
        paymentMethod: it.method,
        amountCents: Math.round(parseFloat(it.amount || 0) * 100),
        referenceNumber: it.reference.trim() || undefined
      }))
      finalTenderedCents = splitTotalCents
      finalChangeCents = 0
    }

    setProcessing(true)
    try {
      if (window.api?.pos?.processPayment) {
        const updatedOrder = await window.api.pos.processPayment({
          orderId: order.id,
          payments: paymentsPayload,
          tenderedCents: finalTenderedCents,
          changeCents: finalChangeCents
        })
        onPaymentSuccess(updatedOrder)
      } else {
        throw new Error('POS payment API is unavailable')
      }
    } catch (err) {
      setErrorMsg(err.message || 'Payment processing failed')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-white text-base">Payment & Settlement: {order?.order_number}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1 overflow-y-auto max-h-[80vh]">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Amount Due Card */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-800 p-4 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">Total Balance Due</span>
              <div className="text-3xl font-mono font-black text-emerald-400 mt-0.5">
                ${(balanceDueCents / 100).toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex gap-2">
                <span>Subtotal: ${(order.subtotal_cents / 100).toFixed(2)}</span>
                <span>•</span>
                <span>Tax: ${(order.tax_cents / 100).toFixed(2)}</span>
                {order.discount_cents > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-amber-400">Disc: -${(order.discount_cents / 100).toFixed(2)}</span>
                  </>
                )}
              </div>
            </div>

            {/* Mode Switcher */}
            <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setPaymentMode('single')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  paymentMode === 'single' ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Single Tender
              </button>
              <button
                type="button"
                onClick={() => setPaymentMode('split')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  paymentMode === 'split' ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Split Tender
              </button>
            </div>
          </div>

          {/* SINGLE PAYMENT MODE */}
          {paymentMode === 'single' ? (
            <div className="space-y-4">
              {/* Tender Methods Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { id: 'CASH', name: 'Cash', icon: DollarSign },
                  { id: 'CARD', name: 'Debit/Credit Card', icon: CreditCard },
                  { id: 'BANK_TRANSFER', name: 'Bank Transfer', icon: Building2 },
                  { id: 'ONLINE', name: 'Online / Wallet', icon: Smartphone }
                ].map((m) => {
                  const Icon = m.icon
                  const isSelected = selectedMethod === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMethod(m.id)}
                      className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-orange-950/40 border-orange-500 text-orange-400 font-bold shadow-lg shadow-orange-950/50'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs text-center">{m.name}</span>
                    </button>
                  )
                })}
              </div>

              {/* CASH SPECIFIC INPUTS & QUICK BILLS */}
              {selectedMethod === 'CASH' && (
                <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">Tendered Cash Received ($)</label>
                    <div className="text-xs font-mono text-slate-400">
                      Exact: ${(balanceDueCents / 100).toFixed(2)}
                    </div>
                  </div>

                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={tenderedInput}
                      onChange={(e) => setTenderedInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-emerald-400 font-mono font-bold focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  {/* Quick Cash Buttons */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => addQuickCash('exact')}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                    >
                      Exact
                    </button>
                    {[1000, 2000, 5000, 10000].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setExactBill(val)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer font-mono"
                      >
                        ${val / 100}
                      </button>
                    ))}
                    {[500, 1000, 2000].map((val) => (
                      <button
                        key={`add-${val}`}
                        type="button"
                        onClick={() => addQuickCash(val)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-medium cursor-pointer font-mono"
                      >
                        +${val / 100}
                      </button>
                    ))}
                  </div>

                  {/* Change Calculation Box */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">Customer Change Due:</span>
                    <div className={`text-base font-mono font-bold ${changeCents > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                      ${(changeCents / 100).toFixed(2)}
                    </div>
                  </div>
                </div>
              )}

              {/* CARD / BANK REFERENCE NUMBER */}
              {selectedMethod !== 'CASH' && (
                <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Transaction / Auth Reference Number (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. AUTH-48921 or Last 4 Digits"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                  />
                  <p className="text-[11px] text-slate-500">
                    Recorded on invoice and settlement reports for reconciliation.
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* SPLIT PAYMENT MODE */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Split Payment Breakdown
                </span>
                <button
                  type="button"
                  onClick={handleAddSplitRow}
                  className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Split Method
                </button>
              </div>

              <div className="space-y-2.5">
                {splitItems.map((item, idx) => (
                  <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center gap-2">
                    <select
                      value={item.method}
                      onChange={(e) => handleUpdateSplit(idx, 'method', e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="CASH">Cash</option>
                      <option value="CARD">Card</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="ONLINE">Online Wallet</option>
                    </select>

                    <div className="w-32 relative">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-400 absolute left-2 top-1/2 -translate-y-1/2" />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.amount}
                        onChange={(e) => handleUpdateSplit(idx, 'amount', e.target.value)}
                        placeholder="Amount"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-6 pr-2 py-1.5 text-xs text-emerald-400 font-mono font-bold"
                      />
                    </div>

                    <input
                      type="text"
                      placeholder="Ref # (optional)"
                      value={item.reference}
                      onChange={(e) => handleUpdateSplit(idx, 'reference', e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono placeholder-slate-600"
                    />

                    {splitItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSplit(idx)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Split Balance Summary */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400">Total Allocated:</span>
                  <span className="font-mono font-bold text-white ml-1.5">
                    ${(splitTotalCents / 100).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Remaining to Allocate:</span>
                  <span className={`font-mono font-bold ml-1.5 ${splitRemainingCents === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    ${(splitRemainingCents / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={processing}
            onClick={handleProcessPayment}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-950 transition-all cursor-pointer disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            {processing ? 'Processing Payment...' : `Complete & Settle $${(balanceDueCents / 100).toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
