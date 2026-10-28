import React, { useState, useEffect, useRef } from 'react'
import {
  UtensilsCrossed,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Volume2,
  VolumeX,
  RefreshCw,
  Printer,
  ChevronRight,
  Filter,
  Check,
  Plus,
  Settings,
  Sparkles,
  Layers,
  ArrowRight,
  User,
  Grid3X3,
  X,
  ArrowLeft
} from 'lucide-react'
import KitchenTicketModal from './KitchenTicketModal.jsx'

/**
 * Web Audio API synthesizer for kitchen chime (zero external dependencies)
 */
function playKitchenChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()

    const playTone = (freq, startTime, duration) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime)
      gain.gain.setValueAtTime(0.15, ctx.currentTime + startTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + startTime)
      osc.stop(ctx.currentTime + startTime + duration)
    }

    // Play pleasant high two-tone chime
    playTone(587.33, 0, 0.25) // D5
    playTone(880.00, 0.15, 0.4) // A5
  } catch (e) {
    console.warn('Audio chime failed:', e)
  }
}

export default function KitchenDisplayView({ currentUser, onBack }) {
  // Data State
  const [stations, setStations] = useState([])
  const [selectedStation, setSelectedStation] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ACTIVE') // 'ACTIVE' | 'READY' | 'COMPLETED'
  const [orders, setOrders] = useState([])
  const [metrics, setMetrics] = useState({
    activeTickets: 0,
    preparingTickets: 0,
    readyTickets: 0,
    delayedCount: 0,
    completedToday: 0,
  })
  const [loading, setLoading] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Modals & Drawers
  const [activeKOTTicket, setActiveKOTTicket] = useState(null)
  const [isStationModalOpen, setIsStationModalOpen] = useState(false)
  const [newStation, setNewStation] = useState({ name: '', code: '', colorCode: '#f97316' })

  // Notification Toast
  const [toast, setToast] = useState(null)

  const showToast = (type, message) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3500)
  }

  // Previous order IDs ref to detect new incoming tickets for audio chime
  const previousOrderIdsRef = useRef(new Set())

  // Load Kitchen Data
  const loadKitchenData = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      if (window.api?.kitchen) {
        const [stationsRes, ordersRes, metricsRes] = await Promise.all([
          window.api.kitchen.getStations(),
          window.api.kitchen.getOrders({
            stationId: selectedStation,
            statusFilter,
          }),
          window.api.kitchen.getMetrics(),
        ])

        setStations(stationsRes || [])
        setMetrics(metricsRes || { activeTickets: 0, preparingTickets: 0, readyTickets: 0, delayedCount: 0, completedToday: 0 })

        const newOrders = ordersRes || []

        // Check if there are newly arrived orders
        if (soundEnabled && previousOrderIdsRef.current.size > 0) {
          const hasNew = newOrders.some((o) => !previousOrderIdsRef.current.has(o.id) && o.status === 'CONFIRMED')
          if (hasNew) {
            playKitchenChime()
          }
        }

        // Update previous order IDs
        previousOrderIdsRef.current = new Set(newOrders.map((o) => o.id))
        setOrders(newOrders)
      }
    } catch (err) {
      console.error('Failed to load kitchen data:', err)
      if (!silent) showToast('error', `Kitchen load error: ${err.message}`)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadKitchenData()
    const interval = setInterval(() => {
      loadKitchenData(true)
    }, 6000)
    const unsubNew = window.api?.on?.('kitchen:new-order', () => loadKitchenData(true))
    const unsubUpd = window.api?.on?.('kitchen:order-update', () => loadKitchenData(true))
    return () => {
      clearInterval(interval)
      unsubNew?.()
      unsubUpd?.()
    }
  }, [selectedStation, statusFilter])

  // Single Item Status Toggle (PENDING -> PREPARING -> READY -> PENDING)
  const handleToggleItemStatus = async (item) => {
    try {
      let nextStatus = 'PREPARING'
      if (item.kitchen_status === 'PENDING') nextStatus = 'PREPARING'
      else if (item.kitchen_status === 'PREPARING') nextStatus = 'READY'
      else if (item.kitchen_status === 'READY') nextStatus = 'PENDING'

      await window.api.kitchen.updateItemStatus({
        orderItemId: item.id,
        status: nextStatus,
      })

      loadKitchenData(true)
    } catch (err) {
      showToast('error', `Failed to update item: ${err.message}`)
    }
  }

  // Transition Whole Ticket (e.g. Start Cook / Mark All Ready / Bump)
  const handleUpdateOrderStatus = async (orderId, targetStatus) => {
    try {
      await window.api.kitchen.updateOrderStatus({
        orderId,
        status: targetStatus,
        notes: `Kitchen bumped order to ${targetStatus}`,
      })

      showToast('success', `Order updated to ${targetStatus}`)
      loadKitchenData(true)
    } catch (err) {
      showToast('error', `Status update failed: ${err.message}`)
    }
  }

  // Create Custom Kitchen Station
  const handleCreateStation = async (e) => {
    e.preventDefault()
    if (!newStation.name.trim()) return

    try {
      await window.api.kitchen.createStation({
        name: newStation.name.trim(),
        code: (newStation.code || newStation.name.slice(0, 4)).toUpperCase(),
        colorCode: newStation.colorCode,
      })

      showToast('success', `Station "${newStation.name}" created!`)
      setNewStation({ name: '', code: '', colorCode: '#f97316' })
      setIsStationModalOpen(false)
      loadKitchenData()
    } catch (err) {
      showToast('error', `Failed to create station: ${err.message}`)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] gap-4 select-none">
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-2 text-xs font-semibold animate-fade-in ${
          toast.type === 'success'
            ? 'bg-emerald-950/95 border-emerald-800 text-emerald-200'
            : 'bg-rose-950/95 border-rose-800 text-rose-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[13px] font-semibold"
                title="Return to Dashboard"
              >
                <ArrowLeft className="w-4 h-4 text-orange-600" />
                <span>Back</span>
              </button>
            )}
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-[16px] font-semibold text-slate-900 flex items-center gap-2">
                Kitchen
                <span className="w-2 h-2 rounded-full bg-emerald-500" title="Live" />
              </h1>
              <p className="text-[13px] text-slate-500">
                Live tickets by station
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-1.5 rounded-xl text-[13px] font-semibold">
            <div className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 flex items-center gap-1.5">
              <span>Active</span>
              <span className="font-semibold text-slate-900">{metrics.activeTickets}</span>
            </div>
            <div className="px-3 py-1 rounded-lg bg-amber-50 border border-amber-100 text-amber-800 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5" />
              <span>Cooking</span>
              <span className="font-semibold">{metrics.preparingTickets}</span>
            </div>
            <div className="px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-800 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Ready</span>
              <span className="font-semibold">{metrics.readyTickets}</span>
            </div>
            {metrics.delayedCount > 0 && (
              <div className="px-3 py-1 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Delayed</span>
                <span className="font-semibold">{metrics.delayedCount}</span>
              </div>
            )}
            <div className="px-3 py-1 rounded-lg text-slate-500 flex items-center gap-1.5">
              <span>Today</span>
              <span className="font-semibold text-slate-800">{metrics.completedToday}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const next = !soundEnabled
              setSoundEnabled(next)
              if (next) playKitchenChime()
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[13px] font-semibold ${
              soundEnabled
                ? 'bg-orange-50 border-orange-200 text-orange-700'
                : 'bg-white border-slate-200 text-slate-500'
            }`}
            title={soundEnabled ? 'Kitchen chime is ON' : 'Kitchen chime is muted'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{soundEnabled ? 'Chime ON' : 'Muted'}</span>
          </button>
          <button
            onClick={() => setIsStationModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-[13px] font-semibold border border-slate-200"
          >
            <Settings className="w-4 h-4 text-slate-400" />
            <span className="hidden md:inline">Stations</span>
          </button>
          <button
            onClick={() => loadKitchenData(false)}
            disabled={loading}
            className="p-2 rounded-xl bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 disabled:opacity-50"
            title="Refresh Orders"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-orange-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Navigation Sub-bar: Stations & Status Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-200">
        {/* Station Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setSelectedStation('ALL')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              selectedStation === 'ALL'
                ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/30'
                : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'
            }`}
          >
            All Stations
          </button>

          {stations.map((st) => (
            <button
              key={st.id}
              onClick={() => setSelectedStation(st.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                selectedStation === st.id
                  ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/30'
                  : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-200'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: st.color_code || '#f97316' }}
              />
              <span>{st.name}</span>
            </button>
          ))}
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          {[
            { id: 'ACTIVE', label: 'Active Queue' },
            { id: 'READY', label: 'Ready for Pickup' },
            { id: 'COMPLETED', label: 'Recently Bumped' },
          ].map((flt) => (
            <button
              key={flt.id}
              onClick={() => setStatusFilter(flt.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                statusFilter === flt.id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 bg-slate-50'
              }`}
            >
              {flt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main KDS Cards Grid */}
      <div className="flex-1 overflow-y-auto">
        {loading && orders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
            <p className="text-xs font-semibold">Loading live kitchen queue...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3 p-12 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">All Kitchen Orders Cleared!</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                There are no orders in the active queue for {selectedStation === 'ALL' ? 'any station' : 'this station'}.
                New tickets sent from POS will land here automatically.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-6">
            {orders.map((ord) => {
              // Card border & header styling based on urgency
              const isDelayed = ord.delayStatus === 'DELAYED'
              const isWarning = ord.delayStatus === 'WARNING'
              const isReady = ord.status === 'READY'

              let cardBorder = 'border-slate-200'
              let cardGlow = 'shadow-sm'
              if (isReady) {
                cardBorder = 'border-emerald-400'
                cardGlow = 'shadow-sm'
              } else if (isDelayed) {
                cardBorder = 'border-rose-400'
                cardGlow = 'shadow-sm ring-1 ring-rose-200'
              } else if (isWarning) {
                cardBorder = 'border-amber-400'
                cardGlow = 'shadow-sm'
              }

              return (
                <div
                  key={ord.id}
                  className={`bg-white border-2 ${cardBorder} ${cardGlow} rounded-2xl flex flex-col overflow-hidden transition-all duration-200 select-none`}
                >
                  {/* Card Header */}
                  <div className={`p-3.5 border-b flex items-start justify-between gap-2 ${
                    isReady
                      ? 'bg-emerald-50 border-emerald-100'
                      : isDelayed
                      ? 'bg-rose-50 border-rose-100'
                      : isWarning
                      ? 'bg-amber-50 border-amber-100'
                      : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-white tracking-wider">
                          {ord.order_number}
                        </span>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                          ord.order_type === 'DINE_IN'
                            ? 'bg-blue-950 text-blue-300 border border-blue-800/60'
                            : ord.order_type === 'TAKEAWAY'
                            ? 'bg-purple-950 text-purple-300 border border-purple-800/60'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                        }`}>
                          {ord.order_type.replace('_', ' ')}
                        </span>
                      </div>

                      {/* Location: Table or Customer */}
                      <div className="text-xs font-bold text-slate-200 mt-1 flex items-center gap-1.5">
                        {ord.table_number ? (
                          <>
                            <Grid3X3 className="w-3.5 h-3.5 text-orange-400" />
                            <span>Table {ord.table_number}</span>
                            {ord.floor_name && (
                              <span className="text-slate-400 font-normal">({ord.floor_name})</span>
                            )}
                          </>
                        ) : ord.customer_name ? (
                          <>
                            <User className="w-3.5 h-3.5 text-purple-400" />
                            <span>{ord.customer_name}</span>
                          </>
                        ) : (
                          <span className="text-slate-400">Direct Order</span>
                        )}
                      </div>
                    </div>

                    {/* Timer & Status Badge */}
                    <div className="flex flex-col items-end gap-1">
                      <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black font-mono ${
                        isReady
                          ? 'bg-emerald-900/80 text-emerald-200'
                          : isDelayed
                          ? 'bg-rose-900/90 text-rose-100 ring-1 ring-rose-400'
                          : isWarning
                          ? 'bg-amber-900/80 text-amber-100'
                          : 'bg-slate-800 text-slate-200'
                      }`}>
                        <Clock className="w-3 h-3" />
                        <span>{ord.elapsedMinutes}m</span>
                      </div>

                      <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${
                        isReady
                          ? 'bg-emerald-500 text-black'
                          : ord.status === 'PREPARING'
                          ? 'bg-amber-500 text-black'
                          : 'bg-slate-700 text-slate-200'
                      }`}>
                        {ord.status}
                      </span>
                    </div>
                  </div>

                  {/* Order-level Notes Warning Banner */}
                  {ord.order_notes && (
                    <div className="bg-amber-500/15 border-b border-amber-500/30 px-3 py-1.5 text-xs font-bold text-amber-200 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="truncate">{ord.order_notes}</span>
                    </div>
                  )}

                  {/* Items Checklist Body */}
                  <div className="flex-1 p-3 space-y-2 overflow-y-auto max-h-[360px]">
                    {ord.items?.map((item) => {
                      const isItemReady = item.kitchen_status === 'READY'
                      const isItemPrep = item.kitchen_status === 'PREPARING'

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleToggleItemStatus(item)}
                          className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                            isItemReady
                              ? 'bg-emerald-950/30 border-emerald-800/40 opacity-70'
                              : isItemPrep
                              ? 'bg-amber-950/25 border-amber-600/50 hover:border-amber-400'
                              : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5">
                              {/* Touch check box */}
                              <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                isItemReady
                                  ? 'bg-emerald-500 border-emerald-400 text-black'
                                  : isItemPrep
                                  ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                                  : 'border-slate-700 text-transparent hover:border-slate-500'
                              }`}>
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              </div>

                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-black text-orange-400">
                                    {item.quantity}x
                                  </span>
                                  <span className={`text-sm font-bold leading-tight ${
                                    isItemReady ? 'line-through text-slate-400' : 'text-white'
                                  }`}>
                                    {item.item_name}
                                  </span>
                                </div>

                                {/* Station Pill */}
                                {item.station_name && (
                                  <div className="mt-1 flex items-center gap-1">
                                    <span
                                      className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded text-white"
                                      style={{ backgroundColor: item.station_color || '#f97316' }}
                                    >
                                      {item.station_name}
                                    </span>
                                  </div>
                                )}

                                {/* Modifiers */}
                                {item.modifiers?.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {item.modifiers.map((mod, mIdx) => (
                                      <span
                                        key={mIdx}
                                        className="text-[10px] font-semibold bg-slate-800 text-amber-300 border border-slate-700 px-1.5 py-0.5 rounded"
                                      >
                                        +{mod.name}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Notes */}
                                {item.notes && (
                                  <div className="mt-1 text-[11px] font-bold text-amber-200 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded">
                                    Note: {item.notes}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Item Status Tag */}
                            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                              isItemReady
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                                : isItemPrep
                                ? 'bg-amber-950 text-amber-300 border border-amber-800/50'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              {item.kitchen_status || 'PENDING'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Card Action Controls Footer */}
                  <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-1.5">
                    {/* Thermal KOT Print */}
                    <button
                      onClick={() => setActiveKOTTicket(ord)}
                      className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-500 border border-slate-200"
                      title="Print KOT Ticket"
                    >
                      <Printer className="w-4 h-4" />
                    </button>

                    {/* Step Actions */}
                    <div className="flex items-center gap-1.5 flex-1 justify-end">
                      {ord.status === 'CONFIRMED' && (
                        <button
                          onClick={() => handleUpdateOrderStatus(ord.id, 'PREPARING')}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
                        >
                          <Flame className="w-3.5 h-3.5" />
                          <span>Start Cook</span>
                        </button>
                      )}

                      {ord.status !== 'READY' && ord.status !== 'COMPLETED' && (
                        <button
                          onClick={() => handleUpdateOrderStatus(ord.id, 'READY')}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>All Ready</span>
                        </button>
                      )}

                      {(ord.status === 'READY' || statusFilter === 'COMPLETED') && (
                        <button
                          onClick={() => handleUpdateOrderStatus(ord.id, 'COMPLETED')}
                          className="flex items-center gap-1 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                        >
                          <span>Bump / Served</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Printable KOT Modal */}
      {activeKOTTicket && (
        <KitchenTicketModal
          ticket={activeKOTTicket}
          onClose={() => setActiveKOTTicket(null)}
        />
      )}

      {/* Station Management Modal */}
      {isStationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-orange-400" />
                Kitchen Stations Manager
              </h2>
              <button
                onClick={() => setIsStationModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Existing Stations List */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              <div className="text-xs font-bold text-slate-400 uppercase">Existing Stations ({stations.length})</div>
              {stations.map((st) => (
                <div
                  key={st.id}
                  className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: st.color_code }}
                    />
                    <span className="font-bold text-white">{st.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">[{st.code}]</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-semibold">Active</span>
                </div>
              ))}
            </div>

            {/* Create New Station Form */}
            <form onSubmit={handleCreateStation} className="space-y-3 pt-2 border-t border-slate-800">
              <div className="text-xs font-bold text-slate-300">Add New Kitchen Station</div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Station Name</label>
                <input
                  type="text"
                  placeholder="e.g. Dessert Bar, Sushi Bar"
                  value={newStation.name}
                  onChange={(e) => setNewStation({ ...newStation, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Code</label>
                  <input
                    type="text"
                    placeholder="e.g. DSST"
                    value={newStation.code}
                    onChange={(e) => setNewStation({ ...newStation, code: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white uppercase focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Color</label>
                  <input
                    type="color"
                    value={newStation.colorCode}
                    onChange={(e) => setNewStation({ ...newStation, colorCode: e.target.value })}
                    className="w-full h-8 bg-slate-950 border border-slate-700 rounded-xl p-0.5 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsStationModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold shadow-md cursor-pointer"
                >
                  Create Station
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
