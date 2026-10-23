import React, { useState, useEffect } from 'react'
import {
  CalendarDays,
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
  X,
  Plus,
  Search,
  Filter,
  Check,
  Ban,
  UserX,
  UtensilsCrossed,
  DollarSign,
  Phone,
  Crown,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Layers,
  ArrowLeft
} from 'lucide-react'

export default function ReservationsView({ onStartOrderForTable, onBack }) {
  const [reservations, setReservations] = useState([])
  const [tables, setTables] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  // Filters
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  // New Reservation Modal State
  const [showAddModal, setShowAddModal] = useState(false)
  const [availableCandidateTables, setAvailableCandidateTables] = useState([])
  const [availabilityChecked, setAvailabilityChecked] = useState(false)
  const [checkingAvailability, setCheckingAvailability] = useState(false)

  // Form
  const [formData, setFormData] = useState({
    customerId: '',
    guestName: '',
    guestPhone: '',
    guestEmail: '',
    tableId: '',
    reservationDate: new Date().toISOString().slice(0, 10),
    reservationTime: '19:00',
    durationMinutes: 90,
    partySize: 2,
    depositAmount: '',
    depositPaymentMethod: 'CASH',
    specialRequests: '',
  })

  // Load reservations, tables, customers
  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      if (window.api?.reservations?.getReservations) {
        const resList = await window.api.reservations.getReservations({
          date: selectedDate || undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
        })
        setReservations(resList || [])
      }

      if (window.api?.db?.getTables) {
        const tblList = await window.api.db.getTables()
        setTables(tblList || [])
      }

      if (window.api?.customers?.getCustomers) {
        const custList = await window.api.customers.getCustomers()
        setCustomers(custList || [])
      }
    } catch (err) {
      console.error('Failed to load reservations:', err)
      setError(err.message || 'Error loading reservations.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedDate, statusFilter])

  const showNotification = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  // Check table availability for the selected time and party size
  const checkTableAvailability = async () => {
    setCheckingAvailability(true)
    try {
      const fullStartTime = `${formData.reservationDate}T${formData.reservationTime}:00`
      const result = await window.api.reservations.checkAvailability({
        startTime: fullStartTime,
        durationMinutes: parseInt(formData.durationMinutes, 10) || 90,
        partySize: parseInt(formData.partySize, 10) || 1,
      })
      setAvailableCandidateTables(result || [])
      setAvailabilityChecked(true)
    } catch (err) {
      console.error('Availability check failed:', err)
      setError(err.message || 'Failed to check table availability.')
    } finally {
      setCheckingAvailability(false)
    }
  }

  // Handle Create Reservation
  const handleCreateReservation = async (e) => {
    e.preventDefault()
    if (!formData.guestName.trim() || !formData.guestPhone.trim() || !formData.tableId) {
      setError('Guest name, phone number, and a reserved table selection are required.')
      return
    }

    try {
      const fullStartTime = `${formData.reservationDate}T${formData.reservationTime}:00`
      const payload = {
        customerId: formData.customerId || undefined,
        guestName: formData.guestName.trim(),
        guestPhone: formData.guestPhone.trim(),
        guestEmail: formData.guestEmail ? formData.guestEmail.trim() : undefined,
        tableId: formData.tableId,
        partySize: parseInt(formData.partySize, 10) || 1,
        startTime: fullStartTime,
        durationMinutes: parseInt(formData.durationMinutes, 10) || 90,
        depositCents: formData.depositAmount
          ? Math.round(parseFloat(formData.depositAmount) * 100)
          : 0,
        depositPaymentMethod: formData.depositAmount ? formData.depositPaymentMethod : undefined,
        specialRequests: formData.specialRequests ? formData.specialRequests.trim() : undefined,
      }

      await window.api.reservations.create(payload)
      showNotification(`Reservation booked successfully for ${formData.guestName}!`)
      setShowAddModal(false)
      setFormData({
        customerId: '',
        guestName: '',
        guestPhone: '',
        guestEmail: '',
        tableId: '',
        reservationDate: new Date().toISOString().slice(0, 10),
        reservationTime: '19:00',
        durationMinutes: 90,
        partySize: 2,
        depositAmount: '',
        depositPaymentMethod: 'CASH',
        specialRequests: '',
      })
      setAvailabilityChecked(false)
      loadData()
    } catch (err) {
      console.error('Failed to create reservation:', err)
      setError(err.message || 'Failed to book reservation.')
    }
  }

  // Update Reservation Status (e.g. SEATED, CANCELLED, NO_SHOW)
  const handleUpdateStatus = async (res, newStatus) => {
    try {
      await window.api.reservations.updateStatus(res.id, newStatus)
      showNotification(`Booking status updated to ${newStatus}.`)
      loadData()
    } catch (err) {
      console.error('Failed to update status:', err)
      setError(err.message || 'Failed to update reservation status.')
    }
  }

  // Select registered customer autofill
  const handleSelectCustomer = (custId) => {
    const found = customers.find((c) => c.id === custId)
    if (found) {
      setFormData({
        ...formData,
        customerId: found.id,
        guestName: found.name,
        guestPhone: found.phone,
        guestEmail: found.email || '',
        specialRequests: found.notes || '',
      })
    } else {
      setFormData({
        ...formData,
        customerId: '',
      })
    }
  }

  // Derived counts
  const totalCount = reservations.length
  const confirmedCount = reservations.filter((r) => r.status === 'CONFIRMED').length
  const seatedCount = reservations.filter((r) => r.status === 'SEATED').length
  const cancelledCount = reservations.filter((r) => r.status === 'CANCELLED' || r.status === 'NO_SHOW').length

  const filteredReservations = reservations.filter((r) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      r.guest_name.toLowerCase().includes(q) ||
      (r.guest_phone && r.guest_phone.includes(q)) ||
      (r.table_number && r.table_number.toLowerCase().includes(q))
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
              <ArrowLeft className="w-4 h-4 text-blue-400" />
              <span>Back</span>
            </button>
          )}
          <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
            <CalendarDays className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              Table Bookings & Reservations
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                Floor Bookings
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time table occupancy schedule, overlap protection, and VIP guest seating
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setFormData({
              customerId: '',
              guestName: '',
              guestPhone: '',
              guestEmail: '',
              tableId: '',
              reservationDate: selectedDate,
              reservationTime: '19:00',
              durationMinutes: 90,
              partySize: 2,
              depositAmount: '',
              depositPaymentMethod: 'CASH',
              specialRequests: '',
            })
            setAvailabilityChecked(false)
            setShowAddModal(true)
          }}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          New Reservation
        </button>
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

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-md">
          <div>
            <p className="text-xs font-medium text-slate-400">Total Bookings</p>
            <h3 className="text-2xl font-black text-white mt-1">{totalCount}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Date: {selectedDate}</p>
          </div>
          <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center text-blue-400">
            <CalendarDays className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-md">
          <div>
            <p className="text-xs font-medium text-slate-400">Confirmed / Awaiting</p>
            <h3 className="text-2xl font-black text-amber-400 mt-1">{confirmedCount}</h3>
            <p className="text-[11px] text-amber-500/80 mt-0.5">Tables held in reserve</p>
          </div>
          <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-amber-400">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-md">
          <div>
            <p className="text-xs font-medium text-slate-400">Seated Guests</p>
            <h3 className="text-2xl font-black text-emerald-400 mt-1">{seatedCount}</h3>
            <p className="text-[11px] text-emerald-500/80 mt-0.5">Currently dining</p>
          </div>
          <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
            <UtensilsCrossed className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-md">
          <div>
            <p className="text-xs font-medium text-slate-400">Cancelled / No-Show</p>
            <h3 className="text-2xl font-black text-rose-400 mt-1">{cancelledCount}</h3>
            <p className="text-[11px] text-rose-400/80 mt-0.5">Released back to pool</p>
          </div>
          <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-center text-rose-400">
            <UserX className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/70 p-4 rounded-xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
            />
          </div>

          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
            {['ALL', 'CONFIRMED', 'SEATED', 'CANCELLED', 'NO_SHOW'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded text-[11px] font-semibold transition-all ${
                  statusFilter === st
                    ? 'bg-slate-800 text-blue-400 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {st}
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
            placeholder="Search guest or table..."
            className="w-full bg-slate-950 border border-slate-800 pl-9 pr-3 py-1.5 text-xs text-white rounded-lg focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Reservations List */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Guest Details</th>
                <th className="py-3 px-4">Reserved Table</th>
                <th className="py-3 px-4">Time Slot</th>
                <th className="py-3 px-4">Party Size</th>
                <th className="py-3 px-4">Deposit</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {filteredReservations.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-500">
                    {loading ? 'Loading table reservations...' : 'No reservations booked for this date and filter.'}
                  </td>
                </tr>
              ) : (
                filteredReservations.map((res) => {
                  const startTimeStr = new Date(res.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  const endTimeStr = new Date(res.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

                  return (
                    <tr key={res.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          {res.guest_name}
                          {res.customer_tag === 'VIP' && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              <Crown className="w-3 h-3 text-amber-400" /> VIP
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mt-0.5">
                          <Phone className="w-3 h-3 text-slate-500" />
                          <span className="font-mono">{res.guest_phone || '—'}</span>
                        </div>
                        {res.special_requests && (
                          <p className="text-amber-300/80 text-[10px] mt-0.5 italic">
                            "{res.special_requests}"
                          </p>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-white">
                          Table {res.table_number || 'N/A'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {res.floor_name || 'Main Dining'} • Cap: {res.table_capacity || '4'}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-blue-300 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-blue-400" />
                          <span>{startTimeStr} - {endTimeStr}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {res.duration_minutes || 90} mins duration
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 font-mono font-bold">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          <span>{res.party_size} guests</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {res.deposit_cents > 0 ? (
                          <div>
                            <span className="font-mono font-bold text-emerald-400">
                              ${(res.deposit_cents / 100).toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-500 block uppercase">
                              {res.deposit_payment_method || 'CARD'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 font-mono text-[11px]">No Deposit</span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            res.status === 'CONFIRMED'
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              : res.status === 'SEATED'
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                          }`}
                        >
                          {res.status}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {res.status === 'CONFIRMED' && (
                            <>
                              <button
                                onClick={() => handleUpdateStatus(res, 'SEATED')}
                                title="Seat Guest & Lock Table to OCCUPIED"
                                className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-all cursor-pointer text-[11px]"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Seat Guest
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(res, 'NO_SHOW')}
                                title="Mark as No-Show"
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 transition-all cursor-pointer"
                              >
                                <UserX className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(res, 'CANCELLED')}
                                title="Cancel Reservation"
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 transition-all cursor-pointer"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {res.status === 'SEATED' && onStartOrderForTable && (
                            <button
                              onClick={() => {
                                const foundTbl = tables.find((t) => t.id === res.table_id)
                                if (foundTbl) onStartOrderForTable(foundTbl)
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-all cursor-pointer text-[11px]"
                            >
                              <UtensilsCrossed className="w-3.5 h-3.5" />
                              Open POS
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Book Table Reservation */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-blue-400" />
                Book New Table Reservation
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateReservation} className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
              {/* Optional Registered Customer Lookup */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                <label className="text-slate-400 font-semibold flex items-center justify-between">
                  <span>Select Registered Customer (Optional Autofill)</span>
                  <span className="text-[10px] text-amber-400 font-normal">VIP points & preferences attached</span>
                </label>
                <select
                  value={formData.customerId}
                  onChange={(e) => handleSelectCustomer(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 p-2 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Manual Guest Entry / Walk-in --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone}) - [{c.tag || 'REGULAR'}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Guest Information */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Guest Full Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.guestName}
                    onChange={(e) => setFormData({ ...formData, guestName: e.target.value })}
                    placeholder="e.g. Eleanor Vance"
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Contact Phone *</label>
                  <input
                    type="text"
                    required
                    value={formData.guestPhone}
                    onChange={(e) => setFormData({ ...formData, guestPhone: e.target.value })}
                    placeholder="e.g. +1 555-4321"
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Date, Time & Party Size */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Reservation Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.reservationDate}
                    onChange={(e) => {
                      setFormData({ ...formData, reservationDate: e.target.value })
                      setAvailabilityChecked(false)
                    }}
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Start Time *</label>
                  <input
                    type="time"
                    required
                    value={formData.reservationTime}
                    onChange={(e) => {
                      setFormData({ ...formData, reservationTime: e.target.value })
                      setAvailabilityChecked(false)
                    }}
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-blue-500 cursor-pointer font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Guests (Party Size) *</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    required
                    value={formData.partySize}
                    onChange={(e) => {
                      setFormData({ ...formData, partySize: e.target.value })
                      setAvailabilityChecked(false)
                    }}
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Table Selection with Live Availability Checker */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-400 font-semibold">Select Table *</label>
                  <button
                    type="button"
                    onClick={checkTableAvailability}
                    disabled={checkingAvailability}
                    className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {checkingAvailability ? 'Checking...' : 'Check Available Tables'}
                  </button>
                </div>

                <select
                  required
                  value={formData.tableId}
                  onChange={(e) => setFormData({ ...formData, tableId: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-blue-500 font-medium"
                >
                  <option value="">-- Choose Dining Table --</option>
                  {(availabilityChecked ? availableCandidateTables : tables).map((tbl) => (
                    <option
                      key={tbl.id}
                      value={tbl.id}
                      disabled={availabilityChecked && !tbl.is_available}
                    >
                      Table {tbl.table_number} ({tbl.floor_name || 'Dining Area'}) - Capacity: {tbl.capacity}
                      {availabilityChecked && !tbl.is_available ? ' [ALREADY BOOKED]' : ''}
                    </option>
                  ))}
                </select>

                {availabilityChecked && (
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Found {availableCandidateTables.filter((t) => t.is_available).length} available tables fitting {formData.partySize} guests.
                  </p>
                )}
              </div>

              {/* Advance Booking Deposit */}
              <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Deposit Paid ($) (Optional)</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.depositAmount}
                    onChange={(e) => setFormData({ ...formData, depositAmount: e.target.value })}
                    placeholder="0.00"
                    className="w-full bg-slate-900 border border-slate-800 p-2 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Payment Method</label>
                  <select
                    value={formData.depositPaymentMethod}
                    onChange={(e) => setFormData({ ...formData, depositPaymentMethod: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 p-2 rounded-lg text-white focus:outline-none focus:border-blue-500 font-semibold"
                  >
                    <option value="CASH">CASH</option>
                    <option value="CARD">CREDIT / DEBIT CARD</option>
                    <option value="ONLINE">ONLINE / TRANSFER</option>
                  </select>
                </div>
              </div>

              {/* Special Requests */}
              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">Special Requests / Seating Notes</label>
                <textarea
                  rows="2"
                  value={formData.specialRequests}
                  onChange={(e) => setFormData({ ...formData, specialRequests: e.target.value })}
                  placeholder="e.g. Birthday celebration, high chair required, quiet corner..."
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold"
                >
                  Confirm Reservation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
