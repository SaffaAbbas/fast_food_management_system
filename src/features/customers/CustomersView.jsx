import React, { useState, useEffect } from 'react'
import {
  Users,
  UserPlus,
  Crown,
  Award,
  DollarSign,
  Search,
  Filter,
  Plus,
  Edit,
  History,
  Tag,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Gift,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  Ticket,
  Percent,
  TrendingUp,
  Receipt,
  ArrowLeft
} from 'lucide-react'
import ImagePicker from '../../components/ImagePicker.jsx'

export default function CustomersView({ onBack }) {
  const [activeTab, setActiveTab] = useState('customers') // 'customers', 'coupons'
  const [customers, setCustomers] = useState([])
  const [summary, setSummary] = useState(null)
  const [coupons, setCoupons] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  // Filters & search
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState('ALL')

  // Modals
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [showLoyaltyModal, setShowLoyaltyModal] = useState(false)
  const [selectedCustomerForLoyalty, setSelectedCustomerForLoyalty] = useState(null)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [customerDetails, setCustomerDetails] = useState(null)
  const [showAddCouponModal, setShowAddCouponModal] = useState(false)

  // Customer Form
  const [customerForm, setCustomerForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    tag: 'REGULAR',
    birthDate: '',
    notes: '',
    imageUrl: null,
  })

  // Loyalty Adjust Form
  const [loyaltyForm, setLoyaltyForm] = useState({
    pointsChanged: '',
    transactionType: 'BONUS', // EARN, REDEEM, ADJUSTMENT, BONUS
    notes: '',
  })

  // Coupon Form
  const [couponForm, setCouponForm] = useState({
    code: '',
    title: '',
    discountType: 'PERCENTAGE', // PERCENTAGE, FIXED_AMOUNT
    discountValue: '',
    minOrderAmount: '',
    maxDiscountAmount: '',
    usageLimit: 100,
  })

  // Load Customers, Summary & Coupons
  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      if (window.api?.customers?.getCustomers) {
        const custList = await window.api.customers.getCustomers({
          search: searchQuery || undefined,
          tag: selectedTag !== 'ALL' ? selectedTag : undefined,
        })
        setCustomers(custList || [])
      }

      if (window.api?.customers?.getSummary) {
        const sum = await window.api.customers.getSummary()
        setSummary(sum)
      }

      if (window.api?.coupons?.getCoupons) {
        const coupList = await window.api.coupons.getCoupons()
        setCoupons(coupList || [])
      }
    } catch (err) {
      console.error('Failed to load customer/coupon data:', err)
      setError(err.message || 'Error loading CRM data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedTag])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    loadData()
  }

  const showNotification = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  // Handle Create / Update Customer
  const handleSaveCustomer = async (e) => {
    e.preventDefault()
    if (!customerForm.name.trim() || !customerForm.phone.trim()) {
      setError('Customer name and phone number are required.')
      return
    }

    try {
      if (editingCustomer) {
        await window.api.customers.update(editingCustomer.id, customerForm)
        showNotification(`Customer "${customerForm.name}" updated successfully.`)
      } else {
        await window.api.customers.create(customerForm)
        showNotification(`Customer "${customerForm.name}" registered successfully.`)
      }
      setShowAddCustomerModal(false)
      setEditingCustomer(null)
      setCustomerForm({
        name: '',
        phone: '',
        email: '',
        address: '',
        tag: 'REGULAR',
        birthDate: '',
        notes: '',
        imageUrl: null,
      })
      loadData()
    } catch (err) {
      console.error('Failed to save customer:', err)
      setError(err.message || 'Failed to save customer.')
    }
  }

  // Open Edit Customer Modal
  const openEditModal = (c) => {
    setEditingCustomer(c)
    setCustomerForm({
      name: c.name || '',
      phone: c.phone || '',
      email: c.email || '',
      address: c.address || '',
      tag: c.tag || 'REGULAR',
      birthDate: c.birth_date || '',
      notes: c.notes || '',
      imageUrl: c.image_url || null,
    })
    setShowAddCustomerModal(true)
  }

  // Open Loyalty Adjust Modal
  const openLoyaltyModal = (c) => {
    setSelectedCustomerForLoyalty(c)
    setLoyaltyForm({
      pointsChanged: '',
      transactionType: 'BONUS',
      notes: '',
    })
    setShowLoyaltyModal(true)
  }

  // Submit Loyalty Points Adjustment
  const handleAdjustLoyalty = async (e) => {
    e.preventDefault()
    const pointsNum = parseInt(loyaltyForm.pointsChanged, 10)
    if (isNaN(pointsNum) || pointsNum === 0) {
      setError('Please enter a non-zero integer for points.')
      return
    }

    try {
      await window.api.customers.adjustLoyalty({
        customerId: selectedCustomerForLoyalty.id,
        pointsChanged: pointsNum,
        transactionType: loyaltyForm.transactionType,
        notes: loyaltyForm.notes || undefined,
      })
      showNotification(`Loyalty points successfully updated for ${selectedCustomerForLoyalty.name}.`)
      setShowLoyaltyModal(false)
      loadData()
    } catch (err) {
      console.error('Failed to adjust loyalty:', err)
      setError(err.message || 'Failed to adjust loyalty points.')
    }
  }

  // View Customer History & Ledger
  const openHistoryModal = async (c) => {
    try {
      const details = await window.api.customers.getDetails(c.id)
      setCustomerDetails(details)
      setShowHistoryModal(true)
    } catch (err) {
      console.error('Failed to fetch customer details:', err)
      setError(err.message || 'Failed to fetch customer profile.')
    }
  }

  // Handle Save Coupon
  const handleSaveCoupon = async (e) => {
    e.preventDefault()
    if (!couponForm.code.trim() || !couponForm.title.trim() || !couponForm.discountValue) {
      setError('Coupon code, title, and discount value are required.')
      return
    }

    try {
      const payload = {
        code: couponForm.code.trim().toUpperCase(),
        title: couponForm.title.trim(),
        discountType: couponForm.discountType,
        discountValue: couponForm.discountType === 'FIXED_AMOUNT'
          ? Math.round(parseFloat(couponForm.discountValue) * 100)
          : parseInt(couponForm.discountValue, 10),
        minOrderCents: couponForm.minOrderAmount
          ? Math.round(parseFloat(couponForm.minOrderAmount) * 100)
          : 0,
        maxDiscountCents: couponForm.maxDiscountAmount
          ? Math.round(parseFloat(couponForm.maxDiscountAmount) * 100)
          : null,
        usageLimit: parseInt(couponForm.usageLimit, 10) || 100,
      }

      await window.api.coupons.create(payload)
      showNotification(`Promotional coupon "${payload.code}" created successfully!`)
      setShowAddCouponModal(false)
      setCouponForm({
        code: '',
        title: '',
        discountType: 'PERCENTAGE',
        discountValue: '',
        minOrderAmount: '',
        maxDiscountAmount: '',
        usageLimit: 100,
      })
      loadData()
    } catch (err) {
      console.error('Failed to create coupon:', err)
      setError(err.message || 'Failed to create promotional coupon.')
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Metrics Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div>
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-medium transition-all shadow-sm"
                title="Back to Dashboard"
              >
                <ArrowLeft className="w-4 h-4 text-amber-400" />
                <span>Back</span>
              </button>
            )}
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Customer CRM & Loyalty Engine
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                  Active CRM
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                VIP profiles, membership tiers, loyalty points ledger & promotional vouchers
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('customers')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'customers'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Customers ({customers.length})
            </button>
            <button
              onClick={() => setActiveTab('coupons')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'coupons'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Ticket className="w-3.5 h-3.5" />
              Coupons & Vouchers ({coupons.length})
            </button>
          </div>

          {activeTab === 'customers' ? (
            <button
              onClick={() => {
                setEditingCustomer(null)
                setCustomerForm({
                  name: '',
                  phone: '',
                  email: '',
                  address: '',
                  tag: 'REGULAR',
                  birthDate: '',
                  notes: '',
                  imageUrl: null,
                })
                setShowAddCustomerModal(true)
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white text-xs font-bold rounded-xl shadow-lg shadow-amber-600/20 transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              New Customer
            </button>
          ) : (
            <button
              onClick={() => setShowAddCouponModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Create Coupon
            </button>
          )}
        </div>
      </div>

      {/* Notifications Bar */}
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

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-md">
          <div>
            <p className="text-xs font-medium text-slate-400">Total Patrons</p>
            <h3 className="text-2xl font-black text-white mt-1">
              {summary?.totalCustomers || customers.length}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Profiles on record</p>
          </div>
          <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center text-blue-400">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-md">
          <div>
            <p className="text-xs font-medium text-slate-400">VIP Members</p>
            <h3 className="text-2xl font-black text-amber-400 mt-1">
              {summary?.vipCount || customers.filter((c) => c.tag === 'VIP').length}
            </h3>
            <p className="text-[11px] text-amber-500/80 mt-0.5">Priority tier members</p>
          </div>
          <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center text-amber-400">
            <Crown className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-md">
          <div>
            <p className="text-xs font-medium text-slate-400">Active Loyalty Points</p>
            <h3 className="text-2xl font-black text-emerald-400 mt-1">
              {summary?.totalLoyaltyPoints ?? customers.reduce((acc, c) => acc + (c.loyalty_points || 0), 0)}
            </h3>
            <p className="text-[11px] text-emerald-500/80 mt-0.5">Ready for redemption</p>
          </div>
          <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
            <Award className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-md">
          <div>
            <p className="text-xs font-medium text-slate-400">Active Coupons</p>
            <h3 className="text-2xl font-black text-purple-400 mt-1">
              {coupons.filter((c) => c.is_active).length}
            </h3>
            <p className="text-[11px] text-purple-400/80 mt-0.5">Promotional offers live</p>
          </div>
          <div className="w-12 h-12 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-center text-purple-400">
            <Ticket className="w-6 h-6" />
          </div>
        </div>
      </div>

      {activeTab === 'customers' ? (
        <>
          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/70 p-4 rounded-xl border border-slate-800">
            <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customers by name, phone or email..."
                className="w-full bg-slate-950 border border-slate-800 pl-10 pr-4 py-2 text-xs text-white rounded-lg focus:outline-none focus:border-amber-500 transition-colors"
              />
            </form>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5" /> Tier:
              </span>
              <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                {['ALL', 'VIP', 'REGULAR', 'CORPORATE'].map((tier) => (
                  <button
                    key={tier}
                    onClick={() => setSelectedTag(tier)}
                    className={`px-3 py-1 rounded text-[11px] font-semibold transition-all ${
                      selectedTag === tier
                        ? 'bg-slate-800 text-amber-400 shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Customers Table */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Tier Tag</th>
                    <th className="py-3 px-4">Contact</th>
                    <th className="py-3 px-4">Loyalty Balance</th>
                    <th className="py-3 px-4">Order Stats</th>
                    <th className="py-3 px-4">Notes</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {customers.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-12 text-center text-slate-500">
                        {loading ? 'Loading customer records...' : 'No customer profiles match your filter.'}
                      </td>
                    </tr>
                  ) : (
                    customers.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-white flex items-center gap-2">
                            {c.name}
                            {c.tag === 'VIP' && (
                              <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            )}
                          </div>
                          {c.birth_date && (
                            <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Calendar className="w-3 h-3" /> Birthday: {c.birth_date}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                              c.tag === 'VIP'
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                : c.tag === 'CORPORATE'
                                ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            <Tag className="w-2.5 h-2.5" />
                            {c.tag || 'REGULAR'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 text-slate-200">
                            <Phone className="w-3 h-3 text-slate-500" />
                            <span className="font-mono">{c.phone}</span>
                          </div>
                          {c.email && (
                            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] mt-0.5">
                              <Mail className="w-3 h-3 text-slate-500" />
                              <span>{c.email}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 font-mono font-bold">
                            <Award className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{c.loyalty_points || 0} pts</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-white font-mono font-bold">
                            ${((c.total_spent_cents || 0) / 100).toFixed(2)}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {c.order_count || 0} orders completed
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-slate-400 max-w-xs truncate text-[11px]">
                            {c.notes || '—'}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openHistoryModal(c)}
                              title="View History & Points Ledger"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                            >
                              <History className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => openLoyaltyModal(c)}
                              title="Award or Adjust Points"
                              className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition-all cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => openEditModal(c)}
                              title="Edit Customer"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
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
      ) : (
        /* Coupons & Promotions Tab */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {coupons.map((c) => (
            <div
              key={c.id}
              className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 relative overflow-hidden shadow-xl hover:border-slate-700 transition-all group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                    {c.discount_type === 'PERCENTAGE' ? `${c.discount_value}% OFF` : `$${(c.discount_value / 100).toFixed(2)} OFF`}
                  </span>
                  <h3 className="text-base font-bold text-white mt-2">{c.title}</h3>
                </div>
                <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-400">
                  <Ticket className="w-5 h-5" />
                </div>
              </div>

              {/* Coupon Code Pill */}
              <div className="mt-4 p-3 bg-slate-950 border border-dashed border-slate-700 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Promo Code</span>
                  <p className="font-mono font-black text-amber-400 text-sm tracking-wider">{c.code}</p>
                </div>
                <span className="text-xs font-mono text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                  {c.times_used} / {c.usage_limit || '∞'} used
                </span>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col gap-1 text-[11px] text-slate-400">
                <div className="flex justify-between">
                  <span>Minimum Spend:</span>
                  <span className="text-white font-mono">
                    {c.min_order_cents ? `$${(c.min_order_cents / 100).toFixed(2)}` : 'None'}
                  </span>
                </div>
                {c.max_discount_cents && (
                  <div className="flex justify-between">
                    <span>Max Cap:</span>
                    <span className="text-white font-mono">${(c.max_discount_cents / 100).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className={c.is_active ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
                    {c.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Add / Edit Customer */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-400" />
                {editingCustomer ? 'Edit Customer Profile' : 'Register New Customer'}
              </h2>
              <button
                onClick={() => setShowAddCustomerModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="space-y-4 text-xs">
              <ImagePicker
                label="Customer photo"
                value={customerForm.imageUrl}
                onChange={(imageUrl) => setCustomerForm({ ...customerForm, imageUrl })}
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={customerForm.name}
                    onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                    placeholder="e.g. Victoria Sterling"
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={customerForm.phone}
                    onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                    placeholder="e.g. +1 555-9001"
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Email Address</label>
                  <input
                    type="email"
                    value={customerForm.email}
                    onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                    placeholder="e.g. customer@example.com"
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Tier Tag</label>
                  <select
                    value={customerForm.tag}
                    onChange={(e) => setCustomerForm({ ...customerForm, tag: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-amber-500 font-semibold"
                  >
                    <option value="REGULAR">REGULAR</option>
                    <option value="VIP">VIP (High Value)</option>
                    <option value="CORPORATE">CORPORATE (B2B)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Date of Birth</label>
                  <input
                    type="date"
                    value={customerForm.birthDate}
                    onChange={(e) => setCustomerForm({ ...customerForm, birthDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Physical Address</label>
                  <input
                    type="text"
                    value={customerForm.address}
                    onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                    placeholder="Street, City, Postal Code"
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">Preferences / Dietary Notes</label>
                <textarea
                  rows="2"
                  value={customerForm.notes}
                  onChange={(e) => setCustomerForm({ ...customerForm, notes: e.target.value })}
                  placeholder="e.g. Prefers window table, allergic to shellfish..."
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddCustomerModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold"
                >
                  {editingCustomer ? 'Update Profile' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Adjust Loyalty Points */}
      {showLoyaltyModal && selectedCustomerForLoyalty && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                Adjust Loyalty Points
              </h2>
              <button
                onClick={() => setShowLoyaltyModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-white">{selectedCustomerForLoyalty.name}</p>
                <p className="text-[11px] text-slate-400">{selectedCustomerForLoyalty.phone}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Current Balance</p>
                <p className="text-base font-black text-emerald-400 font-mono">
                  {selectedCustomerForLoyalty.loyalty_points || 0} pts
                </p>
              </div>
            </div>

            <form onSubmit={handleAdjustLoyalty} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">Transaction Reason / Type</label>
                <select
                  value={loyaltyForm.transactionType}
                  onChange={(e) => setLoyaltyForm({ ...loyaltyForm, transactionType: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-amber-500 font-semibold"
                >
                  <option value="BONUS">BONUS (Promotional Gift)</option>
                  <option value="EARN">EARN (Order Reward)</option>
                  <option value="REDEEM">REDEEM (Discount Redemption - subtract points)</option>
                  <option value="ADJUSTMENT">ADJUSTMENT (Correction)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">
                  Points Amount (use negative for deduction) *
                </label>
                <input
                  type="number"
                  required
                  value={loyaltyForm.pointsChanged}
                  onChange={(e) => setLoyaltyForm({ ...loyaltyForm, pointsChanged: e.target.value })}
                  placeholder="e.g. 50 or -20"
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">Audit Notes</label>
                <input
                  type="text"
                  value={loyaltyForm.notes}
                  onChange={(e) => setLoyaltyForm({ ...loyaltyForm, notes: e.target.value })}
                  placeholder="e.g. Manager courtesy adjustment"
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowLoyaltyModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  Commit Points
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Customer Profile & Loyalty Ledger History */}
      {showHistoryModal && customerDetails && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-amber-400" />
                  Patron Ledger & History: {customerDetails.name}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {customerDetails.phone} • Tag: <strong className="text-amber-400">{customerDetails.tag}</strong>
                </p>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
              {/* Profile summary */}
              <div className="grid grid-cols-3 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Loyalty Points</span>
                  <p className="text-lg font-black text-emerald-400 font-mono">
                    {customerDetails.loyalty_points || 0} pts
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Lifetime Spend</span>
                  <p className="text-lg font-black text-white font-mono">
                    ${((customerDetails.total_spent_cents || 0) / 100).toFixed(2)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Total Orders</span>
                  <p className="text-lg font-black text-amber-400 font-mono">
                    {customerDetails.order_count || 0}
                  </p>
                </div>
              </div>

              {/* Loyalty Ledger */}
              <div>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-emerald-400" />
                  Loyalty Points Ledger Transactions
                </h3>
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-500 font-semibold border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Type</th>
                        <th className="p-2.5">Points</th>
                        <th className="p-2.5">Balance</th>
                        <th className="p-2.5">Reason / Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {!customerDetails.loyalty_transactions || customerDetails.loyalty_transactions.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="p-6 text-center text-slate-500 font-sans">
                            No loyalty transactions recorded yet.
                          </td>
                        </tr>
                      ) : (
                        customerDetails.loyalty_transactions.map((tx) => (
                          <tr key={tx.id} className="hover:bg-slate-800/40">
                            <td className="p-2.5 text-slate-400 text-[11px] font-sans">
                              {new Date(tx.created_at).toLocaleString()}
                            </td>
                            <td className="p-2.5 font-sans font-bold">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] ${
                                  tx.transaction_type === 'EARN'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                    : tx.transaction_type === 'REDEEM'
                                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                                }`}
                              >
                                {tx.transaction_type}
                              </span>
                            </td>
                            <td className={`p-2.5 font-bold ${tx.points_changed > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {tx.points_changed > 0 ? `+${tx.points_changed}` : tx.points_changed}
                            </td>
                            <td className="p-2.5 text-white font-bold">{tx.balance_after}</td>
                            <td className="p-2.5 text-slate-400 font-sans text-[11px]">
                              {tx.notes || '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-semibold text-xs"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Promotional Coupon */}
      {showAddCouponModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Ticket className="w-5 h-5 text-emerald-400" />
                Create Promotional Voucher
              </h2>
              <button
                onClick={() => setShowAddCouponModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCoupon} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Promo Code *</label>
                  <input
                    type="text"
                    required
                    value={couponForm.code}
                    onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. SPECIAL15"
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-amber-400 font-mono font-bold focus:outline-none focus:border-emerald-500 uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Discount Type</label>
                  <select
                    value={couponForm.discountType}
                    onChange={(e) => setCouponForm({ ...couponForm, discountType: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-emerald-500 font-semibold"
                  >
                    <option value="PERCENTAGE">Percentage (%) Off</option>
                    <option value="FIXED_AMOUNT">Fixed Dollar ($) Off</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-semibold">Voucher Title / Campaign *</label>
                <input
                  type="text"
                  required
                  value={couponForm.title}
                  onChange={(e) => setCouponForm({ ...couponForm, title: e.target.value })}
                  placeholder="e.g. Weekend Family Feast Discount"
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">
                    {couponForm.discountType === 'PERCENTAGE' ? 'Discount % *' : 'Amount ($) *'}
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={couponForm.discountValue}
                    onChange={(e) => setCouponForm({ ...couponForm, discountValue: e.target.value })}
                    placeholder={couponForm.discountType === 'PERCENTAGE' ? '15' : '5.00'}
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Min Spend ($)</label>
                  <input
                    type="number"
                    step="any"
                    value={couponForm.minOrderAmount}
                    onChange={(e) => setCouponForm({ ...couponForm, minOrderAmount: e.target.value })}
                    placeholder="25.00"
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Usage Limit</label>
                  <input
                    type="number"
                    value={couponForm.usageLimit}
                    onChange={(e) => setCouponForm({ ...couponForm, usageLimit: e.target.value })}
                    placeholder="100"
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {couponForm.discountType === 'PERCENTAGE' && (
                <div className="space-y-1">
                  <label className="text-slate-400 font-semibold">Maximum Discount Cap ($)</label>
                  <input
                    type="number"
                    step="any"
                    value={couponForm.maxDiscountAmount}
                    onChange={(e) => setCouponForm({ ...couponForm, maxDiscountAmount: e.target.value })}
                    placeholder="e.g. 15.00 (optional max cap)"
                    className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddCouponModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  Create Voucher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
