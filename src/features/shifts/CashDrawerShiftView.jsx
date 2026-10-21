import React, { useState, useEffect } from 'react'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Lock,
  Unlock,
  Plus,
  Minus,
  RefreshCw,
  Printer,
  History,
  X,
  CreditCard,
  Building,
  Globe,
  Coins
} from 'lucide-react'

export default function CashDrawerShiftView() {
  const [currentSession, setCurrentSession] = useState(null)
  const [shiftHistory, setShiftHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  // Modals
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showMovementModal, setShowMovementModal] = useState(false)
  const [showXReportModal, setShowXReportModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [showZReportModal, setShowZReportModal] = useState(false)
  const [selectedZReport, setSelectedZReport] = useState(null)
  const [xReportData, setXReportData] = useState(null)

  // Form states
  const [openingFloat, setOpeningFloat] = useState('150.00')
  const [openingNotes, setOpeningNotes] = useState('')

  const [movementType, setMovementType] = useState('CASH_IN')
  const [movementAmount, setMovementAmount] = useState('20.00')
  const [movementReason, setMovementReason] = useState('Change replenishment from safe')

  // Closing form states
  const [closingNotes, setClosingNotes] = useState('')
  const [countedTotal, setCountedTotal] = useState('')
  const [denominations, setDenominations] = useState([
    { cents: 10000, label: '$100 Bills', count: 0 },
    { cents: 5000, label: '$50 Bills', count: 0 },
    { cents: 2000, label: '$20 Bills', count: 0 },
    { cents: 1000, label: '$10 Bills', count: 0 },
    { cents: 500, label: '$5 Bills', count: 0 },
    { cents: 100, label: '$1 Bills', count: 0 },
    { cents: 25, label: '$0.25 Quarters', count: 0 },
    { cents: 10, label: '$0.10 Dimes', count: 0 },
    { cents: 5, label: '$0.05 Nickels', count: 0 },
    { cents: 1, label: '$0.01 Pennies', count: 0 },
  ])

  useEffect(() => {
    loadShiftData()
  }, [])

  const loadShiftData = async () => {
    setLoading(true)
    setError(null)
    try {
      if (window.api?.cashDrawer) {
        const session = await window.api.cashDrawer.getCurrentSession()
        setCurrentSession(session)
        const history = await window.api.cashDrawer.getHistory({ limit: 15 })
        setShiftHistory(history || [])
      }
    } catch (err) {
      setError(err.message || 'Failed to load cash drawer session.')
    } finally {
      setLoading(false)
    }
  }

  // Handle Open Shift
  const handleOpenShift = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      const cents = Math.round(parseFloat(openingFloat || 0) * 100)
      if (cents < 0) throw new Error('Opening float cannot be negative.')
      await window.api.cashDrawer.openSession({
        openingBalanceCents: cents,
        notes: openingNotes,
      })
      setShowOpenModal(false)
      setSuccessMsg('Cash drawer shift opened successfully!')
      setTimeout(() => setSuccessMsg(null), 4000)
      loadShiftData()
    } catch (err) {
      setError(err.message || 'Failed to open shift.')
    }
  }

  // Handle Record Movement
  const handleRecordMovement = async (e) => {
    e.preventDefault()
    if (!currentSession) return
    setError(null)
    try {
      const cents = Math.round(parseFloat(movementAmount || 0) * 100)
      if (cents <= 0) throw new Error('Movement amount must be greater than zero.')
      await window.api.cashDrawer.recordMovement({
        sessionId: currentSession.id,
        movementType,
        amountCents: cents,
        reason: movementReason,
      })
      setShowMovementModal(false)
      setSuccessMsg(`Recorded ${movementType === 'CASH_IN' ? 'Cash In (+$' : 'Cash Out (-$'}${parseFloat(movementAmount).toFixed(2)})`)
      setTimeout(() => setSuccessMsg(null), 4000)
      loadShiftData()
    } catch (err) {
      setError(err.message || 'Failed to record movement.')
    }
  }

  // Handle View X-Report
  const handleViewXReport = async () => {
    if (!currentSession) return
    setError(null)
    try {
      const report = await window.api.cashDrawer.getXReport(currentSession.id)
      setXReportData(report)
      setShowXReportModal(true)
    } catch (err) {
      setError(err.message || 'Failed to generate X-Report.')
    }
  }

  // Calculate sum from denomination counts
  const calculatedDenomTotalCents = denominations.reduce((acc, d) => acc + d.cents * (d.count || 0), 0)

  const handleDenomChange = (index, count) => {
    const updated = [...denominations]
    updated[index].count = Math.max(0, parseInt(count, 10) || 0)
    setDenominations(updated)
    const total = updated.reduce((acc, d) => acc + d.cents * (d.count || 0), 0)
    setCountedTotal((total / 100).toFixed(2))
  }

  // Open Close Shift modal
  const handleInitiateClose = () => {
    if (!currentSession) return
    // Reset counted total to expected or blank
    const expected = (currentSession.liveMetrics?.expectedCashCents || 0) / 100
    setCountedTotal(expected.toFixed(2))
    setShowCloseModal(true)
  }

  // Submit Close Shift (Z-Report)
  const handleSubmitCloseShift = async (e) => {
    e.preventDefault()
    if (!currentSession) return
    setError(null)
    try {
      const countedCents = Math.round(parseFloat(countedTotal || 0) * 100)
      const denomPayload = denominations
        .filter((d) => d.count > 0)
        .map((d) => ({
          denominationCents: d.cents,
          count: d.count,
        }))

      const zReport = await window.api.cashDrawer.closeSession({
        sessionId: currentSession.id,
        countedCashCents: countedCents,
        closingNotes,
        denominations: denomPayload,
      })

      setShowCloseModal(false)
      setSelectedZReport(zReport)
      setShowZReportModal(true)
      loadShiftData()
    } catch (err) {
      setError(err.message || 'Failed to close shift.')
    }
  }

  // View details of historical shift
  const handleViewHistoricalZReport = async (sessionId) => {
    setError(null)
    try {
      const details = await window.api.cashDrawer.getDetails(sessionId)
      setSelectedZReport({
        reportType: 'Z_REPORT',
        sessionId: details.id,
        generatedAt: details.closed_at,
        openedAt: details.opened_at,
        closedAt: details.closed_at,
        cashierName: details.cashier_name,
        openingBalanceCents: details.opening_balance_cents,
        countedCashCents: details.counted_cash_cents,
        expectedCashCents: details.expected_cash_cents,
        varianceCents: details.variance_cents,
        metrics: details.metrics,
        denominations: details.denominations,
        closingNotes: details.closing_notes,
      })
      setShowZReportModal(true)
    } catch (err) {
      setError(err.message || 'Failed to load shift details.')
    }
  }

  const live = currentSession?.liveMetrics

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`p-3.5 rounded-xl border ${currentSession ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-400' : 'bg-rose-950/40 border-rose-800/60 text-rose-400'}`}>
              <DollarSign className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-white">Cash Drawer & Shift Operations</h1>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border ${
                  currentSession ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50' : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {currentSession ? 'Shift Active' : 'No Active Shift'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {currentSession
                  ? `Cashier: ${currentSession.cashier_name} | Opened at: ${new Date(currentSession.opened_at).toLocaleTimeString()}`
                  : 'Cash drawer is locked. Open a shift to begin receiving cash payments.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={loadShiftData}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all"
              title="Refresh Shift Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {!currentSession ? (
              <button
                onClick={() => setShowOpenModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs shadow-lg shadow-emerald-950/60 transition-all"
              >
                <Unlock className="w-4 h-4" /> Open Cash Drawer Shift
              </button>
            ) : (
              <>
                <button
                  onClick={() => setShowMovementModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold transition-all"
                >
                  <Coins className="w-4 h-4 text-amber-400" /> Cash In / Out
                </button>
                <button
                  onClick={handleViewXReport}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold transition-all"
                >
                  <FileText className="w-4 h-4 text-cyan-400" /> Mid-Shift X-Report
                </button>
                <button
                  onClick={handleInitiateClose}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-semibold text-xs shadow-lg shadow-rose-950/60 transition-all"
                >
                  <Lock className="w-4 h-4" /> Close Shift (Z-Report)
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)}><X className="w-4 h-4 text-rose-400" /></button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)}><X className="w-4 h-4 text-emerald-400" /></button>
        </div>
      )}

      {/* Live Active Shift Dashboard */}
      {currentSession ? (
        <div className="space-y-6">
          {/* KPI Cards Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Opening Float</span>
              <div className="text-xl font-bold font-mono text-white mt-1">
                ${((currentSession.opening_balance_cents || 0) / 100).toFixed(2)}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">Drawer start cash</span>
            </div>

            <div className="bg-slate-950/70 border border-emerald-900/40 rounded-xl p-4">
              <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> Cash Sales
              </span>
              <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                ${((live?.totalCashSalesCents || 0) / 100).toFixed(2)}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">In-drawer cash</span>
            </div>

            <div className="bg-slate-950/70 border border-cyan-900/40 rounded-xl p-4">
              <span className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5" /> Card & Online
              </span>
              <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
                ${(((live?.totalCardSalesCents || 0) + (live?.totalBankSalesCents || 0) + (live?.totalOnlineSalesCents || 0)) / 100).toFixed(2)}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">Non-cash tenders</span>
            </div>

            <div className="bg-slate-950/70 border border-amber-900/40 rounded-xl p-4">
              <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Cash In
              </span>
              <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                +${((live?.totalCashInCents || 0) / 100).toFixed(2)}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">Paid in / Float drops</span>
            </div>

            <div className="bg-slate-950/70 border border-rose-900/40 rounded-xl p-4">
              <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1">
                <Minus className="w-3.5 h-3.5" /> Cash Out
              </span>
              <div className="text-xl font-bold font-mono text-rose-400 mt-1">
                -${((live?.totalCashOutCents || 0) / 100).toFixed(2)}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">Petty cash / Payouts</span>
            </div>

            <div className="bg-gradient-to-br from-emerald-950/50 to-slate-950 border-2 border-emerald-600/60 rounded-xl p-4 shadow-lg shadow-emerald-950/50">
              <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">Expected Cash</span>
              <div className="text-2xl font-black font-mono text-emerald-400 mt-1">
                ${((live?.expectedCashCents || 0) / 100).toFixed(2)}
              </div>
              <span className="text-[10px] text-emerald-400/70 font-semibold mt-1 block">Should be in drawer</span>
            </div>
          </div>

          {/* Quick Breakdown Card */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Current Shift Balance Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2.5 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex justify-between text-slate-300">
                  <span>Starting Cash Float:</span>
                  <span className="font-mono font-bold">${((currentSession.opening_balance_cents || 0) / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-400">
                  <span>+ Total Cash Sales ({live?.totalPaymentsCount || 0} orders):</span>
                  <span className="font-mono font-bold">+${((live?.totalCashSalesCents || 0) / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-amber-400">
                  <span>+ Cash In Replenishments:</span>
                  <span className="font-mono font-bold">+${((live?.totalCashInCents || 0) / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-rose-400">
                  <span>- Cash Out Petty Drops:</span>
                  <span className="font-mono font-bold">-${((live?.totalCashOutCents || 0) / 100).toFixed(2)}</span>
                </div>
                <div className="border-t border-slate-800 pt-2 flex justify-between font-bold text-sm text-emerald-400">
                  <span>= Expected Cash in Drawer:</span>
                  <span className="font-mono text-base">${((live?.expectedCashCents || 0) / 100).toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-2.5 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex justify-between text-cyan-400">
                  <span>Card / POS Terminals:</span>
                  <span className="font-mono font-bold">${((live?.totalCardSalesCents || 0) / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-purple-400">
                  <span>Bank Transfers:</span>
                  <span className="font-mono font-bold">${((live?.totalBankSalesCents || 0) / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-blue-400">
                  <span>Online / QR Payments:</span>
                  <span className="font-mono font-bold">${((live?.totalOnlineSalesCents || 0) / 100).toFixed(2)}</span>
                </div>
                <div className="border-t border-slate-800 pt-2 flex justify-between font-bold text-sm text-white">
                  <span>Total Gross Revenue (All Tenders):</span>
                  <span className="font-mono text-base text-emerald-400">${((live?.totalGrossSalesCents || 0) / 100).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Empty / Locked State Card */
        <div className="p-12 text-center bg-slate-950/70 border border-slate-800 rounded-2xl">
          <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 text-slate-500 mx-auto flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-orange-400" />
          </div>
          <h3 className="text-base font-bold text-white">Cash Drawer is Currently Closed</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-6">
            In accordance with cash control procedures (Section 17), you must declare your starting cash float before accepting cash tenders.
          </p>
          <button
            onClick={() => setShowOpenModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/80 transition-all"
          >
            <Unlock className="w-4 h-4" /> Open Cash Drawer Shift
          </button>
        </div>
      )}

      {/* Shift History Table */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <History className="w-4 h-4 text-orange-400" />
            Previous Shift Closures & Z-Reports
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">Immutable Shift Records</span>
        </div>

        {shiftHistory.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No past shift records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Cashier</th>
                  <th className="py-2.5 px-3">Opened At</th>
                  <th className="py-2.5 px-3">Closed At</th>
                  <th className="py-2.5 px-3">Opening Float</th>
                  <th className="py-2.5 px-3">Expected Cash</th>
                  <th className="py-2.5 px-3">Counted Cash</th>
                  <th className="py-2.5 px-3">Variance</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {shiftHistory.map((s) => {
                  const variance = s.variance_cents || 0
                  return (
                    <tr key={s.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          s.status === 'OPEN' ? 'bg-emerald-950 border border-emerald-700 text-emerald-400' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-white">{s.cashier_name}</td>
                      <td className="py-3 px-3 font-mono text-slate-400">{new Date(s.opened_at).toLocaleString()}</td>
                      <td className="py-3 px-3 font-mono text-slate-400">{s.closed_at ? new Date(s.closed_at).toLocaleString() : 'Active'}</td>
                      <td className="py-3 px-3 font-mono">${((s.opening_balance_cents || 0) / 100).toFixed(2)}</td>
                      <td className="py-3 px-3 font-mono">${((s.expected_cash_cents || 0) / 100).toFixed(2)}</td>
                      <td className="py-3 px-3 font-mono">${((s.counted_cash_cents || 0) / 100).toFixed(2)}</td>
                      <td className="py-3 px-3 font-mono font-bold">
                        {s.status === 'OPEN' ? (
                          <span className="text-slate-500">—</span>
                        ) : variance === 0 ? (
                          <span className="text-emerald-400">$0.00 (Balanced)</span>
                        ) : variance < 0 ? (
                          <span className="text-rose-400">-${(Math.abs(variance) / 100).toFixed(2)} (Short)</span>
                        ) : (
                          <span className="text-amber-400">+${(variance / 100).toFixed(2)} (Over)</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {s.status === 'CLOSED' && (
                          <button
                            onClick={() => handleViewHistoricalZReport(s.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-cyan-400 border border-slate-700 text-[11px] font-semibold transition-all"
                          >
                            <FileText className="w-3 h-3" /> Z-Report
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: Open Cash Shift */}
      {showOpenModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Unlock className="w-5 h-5 text-emerald-400" />
                Open Cash Drawer Shift
              </h3>
              <button onClick={() => setShowOpenModal(false)}><X className="w-5 h-5 text-slate-400 hover:text-white" /></button>
            </div>

            <form onSubmit={handleOpenShift} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Opening Float Cash Amount ($)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-slate-500 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={openingFloat}
                    onChange={(e) => setOpeningFloat(e.target.value)}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 font-mono text-base font-bold text-white focus:outline-none focus:border-emerald-500"
                    placeholder="0.00"
                    required
                  />
                </div>
                {/* Quick denomination chips */}
                <div className="flex gap-2 mt-2">
                  {['50.00', '100.00', '150.00', '200.00', '300.00'].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setOpeningFloat(amt)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                        openingFloat === amt ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">Shift Notes (Optional)</label>
                <textarea
                  value={openingNotes}
                  onChange={(e) => setOpeningNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  rows="2"
                  placeholder="e.g. Standard morning shift float counted with manager"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowOpenModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs text-white font-bold transition-all"
                >
                  Confirm & Open Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Cash In / Cash Out */}
      {showMovementModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Coins className="w-5 h-5 text-amber-400" />
                Record Cash Movement
              </h3>
              <button onClick={() => setShowMovementModal(false)}><X className="w-5 h-5 text-slate-400 hover:text-white" /></button>
            </div>

            <form onSubmit={handleRecordMovement} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMovementType('CASH_IN')}
                  className={`py-2 rounded-xl font-bold text-xs border flex items-center justify-center gap-1.5 transition-all ${
                    movementType === 'CASH_IN' ? 'bg-emerald-600 text-white border-emerald-500 shadow-md' : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" /> Cash In (Drop)
                </button>
                <button
                  type="button"
                  onClick={() => setMovementType('CASH_OUT')}
                  className={`py-2 rounded-xl font-bold text-xs border flex items-center justify-center gap-1.5 transition-all ${
                    movementType === 'CASH_OUT' ? 'bg-rose-600 text-white border-rose-500 shadow-md' : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  <Minus className="w-3.5 h-3.5" /> Cash Out (Payout)
                </button>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">Amount ($)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-slate-500 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={movementAmount}
                    onChange={(e) => setMovementAmount(e.target.value)}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 font-mono text-base font-bold text-white focus:outline-none focus:border-amber-500"
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">Reason for Cash Movement</label>
                <input
                  type="text"
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  placeholder="e.g. Purchased cleaning items, added coins, petty cash"
                  required
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowMovementModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs text-white font-bold transition-all"
                >
                  Record Cash Movement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Mid-Shift X-Report */}
      {showXReportModal && xReportData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-400" />
                Mid-Shift X-Report (Instantaneous Read)
              </h3>
              <button onClick={() => setShowXReportModal(false)}><X className="w-5 h-5 text-slate-400 hover:text-white" /></button>
            </div>

            {/* Thermal Style Receipt Card */}
            <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 font-mono text-xs space-y-3">
              <div className="text-center border-b border-dashed border-slate-800 pb-3">
                <div className="text-base font-bold text-white tracking-wider">MID-SHIFT X-REPORT</div>
                <div className="text-[10px] text-slate-500">Non-Closing Audit Snapshot</div>
                <div className="text-[11px] text-slate-400 mt-1">Generated: {new Date(xReportData.generatedAt).toLocaleString()}</div>
              </div>

              <div className="space-y-1.5 border-b border-dashed border-slate-800 pb-3 text-slate-300">
                <div className="flex justify-between"><span>Cashier:</span><span className="text-white font-bold">{xReportData.session?.cashier_name}</span></div>
                <div className="flex justify-between"><span>Opened At:</span><span>{new Date(xReportData.session?.opened_at).toLocaleTimeString()}</span></div>
                <div className="flex justify-between"><span>Total Transactions:</span><span>{xReportData.metrics.totalPaymentsCount}</span></div>
              </div>

              <div className="space-y-1.5 border-b border-dashed border-slate-800 pb-3 text-slate-300">
                <div className="flex justify-between"><span>Opening Float:</span><span>${(xReportData.metrics.openingBalanceCents / 100).toFixed(2)}</span></div>
                <div className="flex justify-between text-emerald-400"><span>+ Cash Sales:</span><span>+${(xReportData.metrics.totalCashSalesCents / 100).toFixed(2)}</span></div>
                <div className="flex justify-between text-amber-400"><span>+ Cash In:</span><span>+${(xReportData.metrics.totalCashInCents / 100).toFixed(2)}</span></div>
                <div className="flex justify-between text-rose-400"><span>- Cash Out:</span><span>-${(xReportData.metrics.totalCashOutCents / 100).toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-sm text-emerald-400 pt-1">
                  <span>EXPECTED DRAWER CASH:</span>
                  <span>${(xReportData.metrics.expectedCashCents / 100).toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-1.5 text-slate-400 text-[11px]">
                <div className="flex justify-between"><span>Card Sales:</span><span>${(xReportData.metrics.totalCardSalesCents / 100).toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Bank / QR Sales:</span><span>${(xReportData.metrics.totalBankSalesCents / 100).toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-white pt-1">
                  <span>TOTAL GROSS REVENUE:</span>
                  <span>${(xReportData.metrics.totalGrossSalesCents / 100).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-[11px] text-slate-500">* X-Reports do not reset or close the drawer session.</span>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Close Shift & End-of-Day Z-Report */}
      {showCloseModal && currentSession && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Lock className="w-5 h-5 text-rose-500" />
                Close Cash Drawer & Generate Z-Report
              </h3>
              <button onClick={() => setShowCloseModal(false)}><X className="w-5 h-5 text-slate-400 hover:text-white" /></button>
            </div>

            <form onSubmit={handleSubmitCloseShift} className="space-y-4">
              {/* Expected vs Counted Comparison */}
              <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-slate-950 border border-slate-800 text-center font-mono">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-sans">Expected Cash</span>
                  <div className="text-lg font-bold text-white mt-0.5">
                    ${((live?.expectedCashCents || 0) / 100).toFixed(2)}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-sans">Counted Cash</span>
                  <div className="text-lg font-bold text-emerald-400 mt-0.5">
                    ${parseFloat(countedTotal || 0).toFixed(2)}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-sans">Variance</span>
                  {(() => {
                    const varianceCents = Math.round(parseFloat(countedTotal || 0) * 100) - (live?.expectedCashCents || 0)
                    return (
                      <div className={`text-lg font-bold mt-0.5 ${
                        varianceCents === 0 ? 'text-emerald-400' : varianceCents < 0 ? 'text-rose-400' : 'text-amber-400'
                      }`}>
                        {varianceCents === 0 ? '$0.00' : `${varianceCents < 0 ? '-' : '+'}$${(Math.abs(varianceCents) / 100).toFixed(2)}`}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Denomination Counter Accordion */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">Physical Cash Count (Denominations)</label>
                  <span className="text-xs text-slate-400 font-mono">
                    Total: <strong className="text-emerald-400">${(calculatedDenomTotalCents / 100).toFixed(2)}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto p-2 rounded-xl bg-slate-950 border border-slate-800">
                  {denominations.map((denom, idx) => (
                    <div key={denom.cents} className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                      <div className="font-bold text-white text-[11px] mb-1">{denom.label}</div>
                      <input
                        type="number"
                        min="0"
                        value={denom.count || ''}
                        onChange={(e) => handleDenomChange(idx, e.target.value)}
                        placeholder="0"
                        className="w-full px-2 py-1 rounded bg-slate-950 border border-slate-700 text-center font-mono font-bold text-white focus:outline-none focus:border-emerald-500 text-xs"
                      />
                      <div className="text-[10px] text-slate-500 text-center font-mono mt-1">
                        ${((denom.cents * (denom.count || 0)) / 100).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Manual Override Counted Cash input */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Or enter Final Total Counted Cash directly ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={countedTotal}
                  onChange={(e) => setCountedTotal(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 font-mono text-base font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Closing Notes / Variance Reason</label>
                <textarea
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-rose-500"
                  rows="2"
                  placeholder="Explain any variance or observations prior to closing shift..."
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs text-white font-bold transition-all shadow-lg shadow-rose-950"
                >
                  Close Shift & Lock Drawer (Z-Report)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Completed Z-Report Certificate View */}
      {showZReportModal && selectedZReport && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                Permanent Z-Report Shift Statement
              </h3>
              <button onClick={() => setShowZReportModal(false)}><X className="w-5 h-5 text-slate-400 hover:text-white" /></button>
            </div>

            <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 font-mono text-xs space-y-3.5 max-h-[70vh] overflow-y-auto">
              <div className="text-center border-b border-dashed border-slate-800 pb-3">
                <div className="text-lg font-black text-white tracking-widest">FINAL Z-REPORT</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">End of Shift Financial Certificate</div>
                <div className="text-[11px] text-slate-400 mt-1">Closed: {new Date(selectedZReport.closedAt || selectedZReport.generatedAt).toLocaleString()}</div>
              </div>

              <div className="space-y-1 text-slate-300 border-b border-dashed border-slate-800 pb-3">
                <div className="flex justify-between"><span>Cashier:</span><span className="text-white font-bold">{selectedZReport.cashierName || 'Cashier'}</span></div>
                <div className="flex justify-between"><span>Shift Opened:</span><span>{new Date(selectedZReport.openedAt).toLocaleTimeString()}</span></div>
                <div className="flex justify-between"><span>Shift Closed:</span><span>{new Date(selectedZReport.closedAt || selectedZReport.generatedAt).toLocaleTimeString()}</span></div>
              </div>

              <div className="space-y-1.5 border-b border-dashed border-slate-800 pb-3 text-slate-300">
                <div className="flex justify-between"><span>Starting Float:</span><span>${((selectedZReport.openingBalanceCents || 0) / 100).toFixed(2)}</span></div>
                <div className="flex justify-between text-emerald-400"><span>+ Cash Sales:</span><span>+${((selectedZReport.metrics?.totalCashSalesCents || 0) / 100).toFixed(2)}</span></div>
                <div className="flex justify-between text-amber-400"><span>+ Total Cash In:</span><span>+${((selectedZReport.metrics?.totalCashInCents || 0) / 100).toFixed(2)}</span></div>
                <div className="flex justify-between text-rose-400"><span>- Total Cash Out:</span><span>-${((selectedZReport.metrics?.totalCashOutCents || 0) / 100).toFixed(2)}</span></div>
                <div className="flex justify-between text-white font-bold pt-1">
                  <span>EXPECTED CASH:</span>
                  <span>${((selectedZReport.expectedCashCents || 0) / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-400 font-bold">
                  <span>COUNTED CASH:</span>
                  <span>${((selectedZReport.countedCashCents || 0) / 100).toFixed(2)}</span>
                </div>
                <div className={`flex justify-between font-bold text-sm pt-1 border-t border-slate-800 ${
                  (selectedZReport.varianceCents || 0) === 0 ? 'text-emerald-400' : (selectedZReport.varianceCents || 0) < 0 ? 'text-rose-400' : 'text-amber-400'
                }`}>
                  <span>CASH VARIANCE:</span>
                  <span>
                    {(selectedZReport.varianceCents || 0) === 0 ? '$0.00 (Balanced)' : `${(selectedZReport.varianceCents || 0) < 0 ? '-' : '+'}$${(Math.abs(selectedZReport.varianceCents || 0) / 100).toFixed(2)}`}
                  </span>
                </div>
              </div>

              {selectedZReport.closingNotes && (
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
                  <strong className="text-white block mb-0.5">Closing Note:</strong>
                  {selectedZReport.closingNotes}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
              >
                <Printer className="w-3.5 h-3.5" /> Print Z-Report
              </button>
              <button
                onClick={() => setShowZReportModal(false)}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs text-white font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
