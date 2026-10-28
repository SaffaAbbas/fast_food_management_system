import React, { useState, useEffect } from 'react'
import {
  Bike,
  Navigation,
  MapPin,
  Clock,
  DollarSign,
  Phone,
  User,
  Users,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  X,
  Plus,
  Send,
  Check,
  Ban,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Layers,
  History,
  Receipt,
  Car,
  ChevronRight,
  RefreshCw,
  Wallet,
  ArrowLeft
} from 'lucide-react'
import ImagePicker from '../../components/ImagePicker.jsx'

export default function DeliveryDispatchView({ onBack }) {
  const [activeTab, setActiveTab] = useState('board') // 'board', 'riders', 'zones', 'settlements'
  const [deliveries, setDeliveries] = useState([])
  const [riders, setRiders] = useState([])
  const [zones, setZones] = useState([])
  const [settlementHistory, setSettlementHistory] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // Modals
  const [showAddRiderModal, setShowAddRiderModal] = useState(false)
  const [showAddZoneModal, setShowAddZoneModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedDeliveryForAssign, setSelectedDeliveryForAssign] = useState(null)
  const [selectedRiderIdToAssign, setSelectedRiderIdToAssign] = useState('')
  const [showSettleModal, setShowSettleModal] = useState(false)
  const [selectedRiderForSettle, setSelectedRiderForSettle] = useState(null)
  const [riderPendingCodData, setRiderPendingCodData] = useState(null)
  const [settlementNotes, setSettlementNotes] = useState('')
  const [settlingCod, setSettlingCod] = useState(false)

  // Rider Form
  const [riderForm, setRiderForm] = useState({
    name: '',
    phone: '',
    vehicleType: 'MOTORCYCLE',
    licensePlate: '',
    imageUrl: null,
  })

  // Zone Form
  const [zoneForm, setZoneForm] = useState({
    name: '',
    deliveryCharge: '3.00',
    minOrderAmount: '15.00',
    estimatedMinutes: 30,
    description: '',
  })

  // Load Data
  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      if (window.api?.delivery) {
        const [delivs, rids, zns, sum] = await Promise.all([
          window.api.delivery.getDeliveries({
            filters: statusFilter !== 'ALL' ? { status: statusFilter } : {},
          }),
          window.api.delivery.getRiders(),
          window.api.delivery.getZones(),
          window.api.delivery.getSummary(),
        ])

        setDeliveries(delivs || [])
        setRiders(rids || [])
        setZones(zns || [])
        setSummary(sum)

        if (activeTab === 'settlements') {
          const hist = await window.api.delivery.getSettlementHistory()
          setSettlementHistory(hist || [])
        }
      }
    } catch (err) {
      console.error('Failed to load delivery data:', err)
      setError(err.message || 'Error loading delivery data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [activeTab, statusFilter])

  const showNotification = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  // Assign Rider
  const handleAssignRiderSubmit = async (e) => {
    e.preventDefault()
    if (!selectedRiderIdToAssign || !selectedDeliveryForAssign) return

    try {
      await window.api.delivery.assignRider(selectedDeliveryForAssign.id, selectedRiderIdToAssign)
      showNotification('Rider assigned successfully!')
      setShowAssignModal(false)
      setSelectedDeliveryForAssign(null)
      loadData()
    } catch (err) {
      console.error('Assign rider failed:', err)
      setError(err.message || 'Failed to assign rider.')
    }
  }

  // Dispatch Trip
  const handleDispatch = async (deliveryId) => {
    try {
      await window.api.delivery.dispatch(deliveryId)
      showNotification('Order marked Out for Delivery!')
      loadData()
    } catch (err) {
      console.error('Dispatch failed:', err)
      setError(err.message || 'Failed to dispatch order.')
    }
  }

  // Complete Delivery
  const handleComplete = async (delivery) => {
    try {
      await window.api.delivery.complete(delivery.id, delivery.cod_amount_cents)
      showNotification(`Order ${delivery.order_number} marked DELIVERED!`)
      loadData()
    } catch (err) {
      console.error('Complete delivery failed:', err)
      setError(err.message || 'Failed to complete delivery.')
    }
  }

  // Fail Delivery
  const handleFail = async (delivery) => {
    const reason = window.prompt('Please enter delivery failure reason:', 'Customer not reachable')
    if (!reason) return

    try {
      await window.api.delivery.fail(delivery.id, reason)
      showNotification(`Order ${delivery.order_number} marked FAILED.`)
      loadData()
    } catch (err) {
      console.error('Fail delivery failed:', err)
      setError(err.message || 'Failed to update delivery.')
    }
  }

  // Open Settle COD Modal
  const openSettleModal = async (rider) => {
    setSelectedRiderForSettle(rider)
    setSettlementNotes('')
    try {
      const pending = await window.api.delivery.getRiderPendingCod(rider.id)
      setRiderPendingCodData(pending)
      setShowSettleModal(true)
    } catch (err) {
      console.error('Failed to get pending COD:', err)
      setError(err.message || 'Failed to retrieve pending COD balance.')
    }
  }

  // Submit COD Settlement
  const handleCommitSettlement = async (e) => {
    e.preventDefault()
    if (!selectedRiderForSettle) return
    setSettlingCod(true)
    try {
      await window.api.delivery.settleRiderCod({
        riderId: selectedRiderForSettle.id,
        notes: settlementNotes,
      })
      showNotification(`Cash remittance committed for ${selectedRiderForSettle.name}!`)
      setShowSettleModal(false)
      setSelectedRiderForSettle(null)
      loadData()
    } catch (err) {
      console.error('Settlement failed:', err)
      setError(err.message || 'Failed to commit COD settlement.')
    } finally {
      setSettlingCod(false)
    }
  }

  // Create Rider
  const handleSaveRider = async (e) => {
    e.preventDefault()
    if (!riderForm.name.trim() || !riderForm.phone.trim()) {
      setError('Rider name and phone number are required.')
      return
    }

    try {
      await window.api.delivery.createRider(riderForm)
      showNotification(`Rider "${riderForm.name}" registered successfully.`)
      setShowAddRiderModal(false)
      setRiderForm({
        name: '',
        phone: '',
        vehicleType: 'MOTORCYCLE',
        licensePlate: '',
      })
      loadData()
    } catch (err) {
      console.error('Failed to register rider:', err)
      setError(err.message || 'Failed to register rider.')
    }
  }

  // Create Zone
  const handleSaveZone = async (e) => {
    e.preventDefault()
    if (!zoneForm.name.trim()) {
      setError('Zone name is required.')
      return
    }

    try {
      await window.api.delivery.createZone({
        name: zoneForm.name.trim(),
        deliveryChargeCents: Math.round(parseFloat(zoneForm.deliveryCharge) * 100),
        minOrderCents: Math.round(parseFloat(zoneForm.minOrderAmount) * 100),
        estimatedMinutes: parseInt(zoneForm.estimatedMinutes, 10) || 30,
        description: zoneForm.description || '',
      })
      showNotification(`Delivery zone "${zoneForm.name}" created!`)
      setShowAddZoneModal(false)
      setZoneForm({
        name: '',
        deliveryCharge: '3.00',
        minOrderAmount: '15.00',
        estimatedMinutes: 30,
        description: '',
      })
      loadData()
    } catch (err) {
      console.error('Failed to create zone:', err)
      setError(err.message || 'Failed to create delivery zone.')
    }
  }

  // Filter deliveries
  const filteredDeliveries = deliveries.filter((d) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      d.order_number.toLowerCase().includes(q) ||
      d.customer_name.toLowerCase().includes(q) ||
      d.delivery_address.toLowerCase().includes(q) ||
      (d.rider_name && d.rider_name.toLowerCase().includes(q))
    )
  })

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-medium transition-all shadow-sm"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-4 h-4 text-orange-400" />
              <span>Back</span>
            </button>
          )}
          <div className="p-2.5 bg-orange-500/10 border border-orange-500/20 rounded-xl text-orange-400">
            <Bike className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              Delivery & Dispatch Control
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse"></span>
                Live Dispatch
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Live dispatch board, rider fleet tracking, trip dispatches & Cash on Delivery (COD) settlement
            </p>
          </div>
        </div>

        {/* Tab Controls & Add Buttons */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('board')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'board'
                  ? 'bg-orange-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Navigation className="w-3.5 h-3.5" />
              Live Board ({deliveries.length})
            </button>
            <button
              onClick={() => setActiveTab('riders')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'riders'
                  ? 'bg-orange-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Bike className="w-3.5 h-3.5" />
              Riders Fleet ({riders.length})
            </button>
            <button
              onClick={() => setActiveTab('zones')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'zones'
                  ? 'bg-orange-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              Zones ({zones.length})
            </button>
            <button
              onClick={() => setActiveTab('settlements')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'settlements'
                  ? 'bg-orange-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              COD History
            </button>
          </div>

          {activeTab === 'riders' && (
            <button
              onClick={() => setShowAddRiderModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-orange-600/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Rider
            </button>
          )}

          {activeTab === 'zones' && (
            <button
              onClick={() => setShowAddZoneModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New Zone
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3.5 bg-rose-950/80 border border-rose-800 rounded-xl flex items-center justify-between text-rose-200 text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 bg-emerald-950/80 border border-emerald-800 rounded-xl flex items-center justify-between text-emerald-200 text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-md">
          <div>
            <p className="text-xs font-medium text-slate-400">Available Riders</p>
            <h3 className="text-2xl font-black text-emerald-400 mt-1">
              {summary?.availableRiders || 0} / {summary?.totalRiders || riders.length}
            </h3>
            <p className="text-[11px] text-emerald-500/80 mt-0.5">Ready for dispatch</p>
          </div>
          <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
            <Bike className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-md">
          <div>
            <p className="text-xs font-medium text-slate-400">Active On Trip</p>
            <h3 className="text-2xl font-black text-blue-400 mt-1">
              {summary?.outForDelivery || 0}
            </h3>
            <p className="text-[11px] text-blue-400/80 mt-0.5">Dispatched & on the road</p>
          </div>
          <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center text-blue-400">
            <Send className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-md">
          <div>
            <p className="text-xs font-medium text-slate-400">Delivered Today</p>
            <h3 className="text-2xl font-black text-white mt-1">
              {summary?.deliveredToday || 0}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Successfully handed over</p>
          </div>
          <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-amber-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-md">
          <div>
            <p className="text-xs font-medium text-slate-400">Pending COD in Fleet</p>
            <h3 className="text-2xl font-black text-amber-400 font-mono mt-1">
              ${((summary?.pendingCodCents || 0) / 100).toFixed(2)}
            </h3>
            <p className="text-[11px] text-amber-500/80 mt-0.5">Awaiting cashier remittance</p>
          </div>
          <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-amber-400">
            <Wallet className="w-6 h-6" />
          </div>
        </div>
      </div>

      {activeTab === 'board' ? (
        <>
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/70 p-4 rounded-xl border border-slate-800">
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5" /> Status:
              </span>
              <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                {['ALL', 'PENDING', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1 rounded text-[11px] font-semibold transition-all ${
                      statusFilter === st
                        ? 'bg-slate-800 text-orange-400 shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {st.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search order #, customer or address..."
                className="w-full bg-slate-950 border border-slate-800 pl-9 pr-3 py-1.5 text-xs text-white rounded-lg focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          {/* Deliveries Table */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Order Details</th>
                    <th className="py-3 px-4">Customer & Address</th>
                    <th className="py-3 px-4">Delivery Zone</th>
                    <th className="py-3 px-4">Assigned Rider</th>
                    <th className="py-3 px-4">COD Cash</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Dispatch Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {filteredDeliveries.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-12 text-center text-slate-500">
                        {loading ? 'Loading deliveries...' : 'No delivery dispatches match current filter.'}
                      </td>
                    </tr>
                  ) : (
                    filteredDeliveries.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-white flex items-center gap-2">
                            {d.order_number}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            Total: ${((d.order_total_cents || 0) / 100).toFixed(2)}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-white flex items-center gap-1.5">
                            {d.customer_name}
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mt-0.5">
                            <Phone className="w-3 h-3 text-slate-500" />
                            <span className="font-mono">{d.customer_phone}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mt-0.5 max-w-xs truncate">
                            <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                            <span title={d.delivery_address}>{d.delivery_address}</span>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="text-white font-semibold">
                            {d.zone_name || 'Standard Metro'}
                          </div>
                          {d.estimated_minutes && (
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              Est: ~{d.estimated_minutes} mins
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {d.rider_name ? (
                            <div>
                              <div className="text-white font-bold flex items-center gap-1.5">
                                <Bike className="w-3.5 h-3.5 text-orange-400" />
                                {d.rider_name}
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {d.rider_vehicle} • {d.rider_phone}
                              </span>
                            </div>
                          ) : (
                            <span className="text-rose-400 text-[11px] font-semibold bg-rose-950/60 border border-rose-800 px-2 py-0.5 rounded">
                              Unassigned
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {d.cod_amount_cents > 0 ? (
                            <div>
                              <span className="font-mono font-bold text-amber-400">
                                ${(d.cod_amount_cents / 100).toFixed(2)}
                              </span>
                              <span className="block text-[10px] text-slate-500 uppercase">
                                {d.cod_settled ? 'Settled' : 'Pending'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-emerald-400 text-[11px] font-semibold">Pre-paid</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                              d.status === 'PENDING'
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                : d.status === 'ASSIGNED'
                                ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                                : d.status === 'OUT_FOR_DELIVERY'
                                ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                                : d.status === 'DELIVERED'
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                            }`}
                          >
                            {d.status.replace(/_/g, ' ')}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {d.status === 'PENDING' && (
                              <button
                                onClick={() => {
                                  setSelectedDeliveryForAssign(d)
                                  setSelectedRiderIdToAssign('')
                                  setShowAssignModal(true)
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded-lg text-[11px] cursor-pointer"
                              >
                                <User className="w-3.5 h-3.5" />
                                Assign Rider
                              </button>
                            )}

                            {d.status === 'ASSIGNED' && (
                              <button
                                onClick={() => handleDispatch(d.id)}
                                className="flex items-center gap-1 px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg text-[11px] cursor-pointer"
                              >
                                <Send className="w-3.5 h-3.5" />
                                Dispatch Trip
                              </button>
                            )}

                            {d.status === 'OUT_FOR_DELIVERY' && (
                              <>
                                <button
                                  onClick={() => handleComplete(d)}
                                  className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px] cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  Delivered
                                </button>
                                <button
                                  onClick={() => handleFail(d)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-400 cursor-pointer"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : activeTab === 'riders' ? (
        /* Riders Fleet Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {riders.map((r) => (
            <div
              key={r.id}
              className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 relative overflow-hidden shadow-xl space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl text-orange-400">
                    <Bike className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">{r.name}</h3>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">{r.phone}</p>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    r.status === 'AVAILABLE'
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : r.status === 'OUT_FOR_DELIVERY'
                      ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                      : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  }`}
                >
                  {r.status.replace(/_/g, ' ')}
                </span>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Vehicle</span>
                  <p className="text-slate-200 font-semibold">{r.vehicle_type}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{r.license_plate || 'No Plate'}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Unsettled COD</span>
                  <p className="text-amber-400 font-mono font-black text-sm">
                    ${((r.unsettled_cod_cents || 0) / 100).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center text-xs">
                <span className="text-[11px] text-slate-400">
                  {r.active_deliveries_count || 0} active trip(s)
                </span>
                <button
                  onClick={() => openSettleModal(r)}
                  disabled={!r.unsettled_cod_cents || r.unsettled_cod_cents === 0}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-xs disabled:opacity-30 cursor-pointer transition-all flex items-center gap-1.5"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  Settle Cash (${((r.unsettled_cod_cents || 0) / 100).toFixed(2)})
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : activeTab === 'zones' ? (
        /* Delivery Zones Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {zones.map((z) => (
            <div
              key={z.id}
              className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-white">{z.name}</h3>
                  <p className="text-xs text-slate-400 mt-1">{z.description || 'Standard sector'}</p>
                </div>
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
                  <MapPin className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Fee</span>
                  <p className="text-emerald-400 font-mono font-bold mt-0.5">
                    ${(z.delivery_charge_cents / 100).toFixed(2)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Min Spend</span>
                  <p className="text-white font-mono font-bold mt-0.5">
                    ${(z.min_order_cents / 100).toFixed(2)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Est. Time</span>
                  <p className="text-amber-400 font-mono font-bold mt-0.5">
                    ~{z.estimated_minutes}m
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* COD Settlement History Table */
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Rider</th>
                  <th className="py-3 px-4">Cashier Settled By</th>
                  <th className="py-3 px-4">Remitted Cash</th>
                  <th className="py-3 px-4">Orders Cleared</th>
                  <th className="py-3 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {settlementHistory.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-12 text-center text-slate-500">
                      No COD settlement remittance audit records yet.
                    </td>
                  </tr>
                ) : (
                  settlementHistory.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {new Date(s.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-bold text-white flex items-center gap-1.5">
                        <Bike className="w-3.5 h-3.5 text-orange-400" />
                        {s.rider_name} ({s.rider_phone})
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-semibold">
                        {s.settled_by_name || 'Administrator'}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                        ${(s.total_collected_cents / 100).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 font-mono text-white">
                        {s.orders_count} orders
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-[11px]">
                        {s.notes || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Assign Rider */}
      {showAssignModal && selectedDeliveryForAssign && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Bike className="w-5 h-5 text-orange-400" />
                Assign Rider to Order {selectedDeliveryForAssign.order_number}
              </h2>
              <button onClick={() => setShowAssignModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignRiderSubmit} className="space-y-4 text-xs">
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                <p className="text-white font-bold">{selectedDeliveryForAssign.customer_name}</p>
                <p className="text-slate-400">{selectedDeliveryForAssign.delivery_address}</p>
                <p className="text-amber-400 font-mono font-bold">
                  COD Cash to Collect: ${((selectedDeliveryForAssign.cod_amount_cents || 0) / 100).toFixed(2)}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">Choose Available Rider *</label>
                <select
                  required
                  value={selectedRiderIdToAssign}
                  onChange={(e) => setSelectedRiderIdToAssign(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-semibold focus:outline-none focus:border-orange-500"
                >
                  <option value="">-- Select Rider --</option>
                  {riders.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.vehicle_type}) - Status: {r.status}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold"
                >
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Settle COD Cash Remittance */}
      {showSettleModal && selectedRiderForSettle && riderPendingCodData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Wallet className="w-5 h-5 text-amber-400" />
                Settle Cash Remittance: {selectedRiderForSettle.name}
              </h2>
              <button onClick={() => setShowSettleModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCommitSettlement} className="space-y-4 text-xs">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex justify-between items-center">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Total Remittance Due</span>
                  <p className="text-2xl font-black text-emerald-400 font-mono mt-0.5">
                    ${((riderPendingCodData.pendingCodCents || 0) / 100).toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Orders to Clear</span>
                  <p className="text-lg font-black text-white font-mono mt-0.5">
                    {riderPendingCodData.deliveredOrdersCount} orders
                  </p>
                </div>
              </div>

              {/* Order List */}
              <div className="max-h-40 overflow-y-auto space-y-1.5 border border-slate-800 rounded-xl p-2 bg-slate-950/60 font-mono">
                {riderPendingCodData.deliveries.map((deliv) => (
                  <div key={deliv.id} className="flex justify-between items-center p-2 rounded bg-slate-900/60 text-[11px]">
                    <span className="text-white">{deliv.order_number} ({deliv.customer_name})</span>
                    <span className="text-emerald-400 font-bold">${((deliv.cod_collected_cents || 0) / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">Settlement Audit Notes (Optional)</label>
                <input
                  type="text"
                  value={settlementNotes}
                  onChange={(e) => setSettlementNotes(e.target.value)}
                  placeholder="e.g. Received by head cashier at shift end"
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSettleModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settlingCod}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-50"
                >
                  {settlingCod ? 'Settling...' : 'Confirm Cash Received'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Rider */}
      {showAddRiderModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Bike className="w-5 h-5 text-orange-400" />
                Register New Fleet Rider
              </h2>
              <button onClick={() => setShowAddRiderModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRider} className="space-y-4 text-xs">
              <ImagePicker
                label="Rider photo"
                value={riderForm.imageUrl}
                onChange={(imageUrl) => setRiderForm({ ...riderForm, imageUrl })}
              />
              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">Full Name *</label>
                <input
                  type="text"
                  required
                  value={riderForm.name}
                  onChange={(e) => setRiderForm({ ...riderForm, name: e.target.value })}
                  placeholder="e.g. Marco Silva"
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">Phone Number *</label>
                <input
                  type="text"
                  required
                  value={riderForm.phone}
                  onChange={(e) => setRiderForm({ ...riderForm, phone: e.target.value })}
                  placeholder="e.g. +1 555-8011"
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Vehicle Type</label>
                  <select
                    value={riderForm.vehicleType}
                    onChange={(e) => setRiderForm({ ...riderForm, vehicleType: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-semibold focus:outline-none focus:border-orange-500"
                  >
                    <option value="MOTORCYCLE">MOTORCYCLE</option>
                    <option value="SCOOTER">SCOOTER</option>
                    <option value="BICYCLE">BICYCLE</option>
                    <option value="CAR">CAR</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">License Plate</label>
                  <input
                    type="text"
                    value={riderForm.licensePlate}
                    onChange={(e) => setRiderForm({ ...riderForm, licensePlate: e.target.value })}
                    placeholder="e.g. MTR-4491"
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono uppercase focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddRiderModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold"
                >
                  Register Rider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Zone */}
      {showAddZoneModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-blue-400" />
                Configure Delivery Zone
              </h2>
              <button onClick={() => setShowAddZoneModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveZone} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">Zone Name *</label>
                <input
                  type="text"
                  required
                  value={zoneForm.name}
                  onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
                  placeholder="e.g. Zone D - Tech Corridor"
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Delivery Fee ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={zoneForm.deliveryCharge}
                    onChange={(e) => setZoneForm({ ...zoneForm, deliveryCharge: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Min Order ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={zoneForm.minOrderAmount}
                    onChange={(e) => setZoneForm({ ...zoneForm, minOrderAmount: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Est. (Mins)</label>
                  <input
                    type="number"
                    required
                    value={zoneForm.estimatedMinutes}
                    onChange={(e) => setZoneForm({ ...zoneForm, estimatedMinutes: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">Zone Coverage Description</label>
                <textarea
                  rows="2"
                  value={zoneForm.description}
                  onChange={(e) => setZoneForm({ ...zoneForm, description: e.target.value })}
                  placeholder="e.g. Commercial tech hub within 5km..."
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddZoneModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold"
                >
                  Save Zone
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
