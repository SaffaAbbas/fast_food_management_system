import React, { useState, useEffect } from 'react'
import {
  QrCode,
  Smartphone,
  Tv,
  Printer,
  Grid3X3,
  ShoppingBag,
  Plus,
  Minus,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  ArrowRight,
  Flame,
  UtensilsCrossed,
  Receipt,
  ArrowLeft
} from 'lucide-react'

export default function QrKioskCenterView({ onBack }) {
  const [activeTab, setActiveTab] = useState('tables_qr') // 'tables_qr', 'kiosk_sim'
  const [tables, setTables] = useState([])
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [selectedKioskCat, setSelectedKioskCat] = useState('')
  const [kioskCart, setKioskCart] = useState([])
  const [kioskOrderNumber, setKioskOrderNumber] = useState(null)
  const [kioskCustomerName, setKioskCustomerName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  const loadData = async () => {
    setLoading(true)
    try {
      if (window.api?.db?.getTables) {
        const tbls = await window.api.db.getTables()
        setTables(tbls || [])
      }
      if (window.api?.db?.getCategories) {
        const cats = await window.api.db.getCategories()
        setCategories(cats || [])
        if (cats?.length > 0) setSelectedKioskCat(cats[0].id)
      }
      if (window.api?.db?.getProducts) {
        const prods = await window.api.db.getProducts({ includeInactive: false })
        setProducts(prods || [])
      }
    } catch (err) {
      console.error('Failed to load kiosk data:', err)
      setError(err.message || 'Error loading tables & menu.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Add Item to Kiosk Cart
  const addToKioskCart = (product) => {
    setKioskCart((prev) => {
      const existing = prev.find((item) => item.id === product.id)
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      }
      return [...prev, { ...product, quantity: 1 }]
    })
  }

  // Update Kiosk Cart Qty
  const updateKioskQty = (productId, delta) => {
    setKioskCart((prev) =>
      prev
        .map((item) => {
          if (item.id === productId) {
            const nextQty = item.quantity + delta
            return nextQty > 0 ? { ...item, quantity: nextQty } : null
          }
          return item
        })
        .filter(Boolean)
    )
  }

  // Place Kiosk Order
  const handlePlaceKioskOrder = async () => {
    if (kioskCart.length === 0) return
    try {
      const orderNum = `KIOSK-${Date.now().toString().slice(-4)}`
      const subtotalCents = kioskCart.reduce(
        (acc, item) => acc + item.base_price_cents * item.quantity,
        0
      )
      const taxCents = Math.round(subtotalCents * 0.05)
      const totalCents = subtotalCents + taxCents

      const payload = {
        orderNumber: orderNum,
        orderType: 'TAKEAWAY',
        orderSource: 'KIOSK',
        status: 'CONFIRMED',
        subtotalCents,
        taxCents,
        totalCents,
        paidCents: totalCents,
        notes: `Kiosk Self-Order for ${kioskCustomerName || 'Guest'}`,
        items: kioskCart.map((it) => ({
          productId: it.id,
          name: it.name,
          quantity: it.quantity,
          unitPriceCents: it.base_price_cents,
          totalCents: it.base_price_cents * it.quantity,
        })),
      }

      if (window.api?.db?.createOrder) {
        await window.api.db.createOrder(payload)
      }

      setKioskOrderNumber(orderNum)
      setKioskCart([])
      setKioskCustomerName('')
      setSuccessMsg(`Order ${orderNum} sent directly to the kitchen!`)
    } catch (err) {
      console.error('Kiosk order failed:', err)
      setError(err.message || 'Failed to place kiosk order.')
    }
  }

  const kioskSubtotal = kioskCart.reduce(
    (acc, it) => acc + it.base_price_cents * it.quantity,
    0
  )

  const filteredProducts = products.filter(
    (p) => !selectedKioskCat || p.category_id === selectedKioskCat
  )

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
              <ArrowLeft className="w-4 h-4 text-emerald-400" />
              <span>Back</span>
            </button>
          )}
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
            <QrCode className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              QR Ordering & Self-Service Kiosks
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Digital Ordering
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Contactless dining table QR generators, digital menu links & interactive touch-kiosk ordering simulator
            </p>
          </div>
        </div>

        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('tables_qr')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'tables_qr'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            Table QR Standees ({tables.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('kiosk_sim')
              setKioskOrderNumber(null)
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'kiosk_sim'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            Kiosk Touchscreen Simulator
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3.5 bg-rose-950/80 border border-rose-800 rounded-xl flex items-center justify-between text-rose-200 text-xs">
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
        <div className="p-3.5 bg-emerald-950/80 border border-emerald-800 rounded-xl flex items-center justify-between text-emerald-200 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {activeTab === 'tables_qr' ? (
        /* TABLE QR CODE STANDEES GRID */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {tables.map((t) => (
            <div
              key={t.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-between shadow-xl text-center space-y-3 hover:border-emerald-500/60 transition-all group"
            >
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  {t.floor_name || 'Dining Area'}
                </span>
                <h3 className="text-base font-bold text-white mt-0.5">
                  Table {t.table_number}
                </h3>
                <p className="text-[10px] text-slate-500">Cap: {t.capacity} guests</p>
              </div>

              {/* Stylized QR Card Simulation */}
              <div className="w-28 h-28 bg-white p-2.5 rounded-xl shadow-inner flex flex-col items-center justify-center relative">
                <div className="grid grid-cols-5 gap-1 w-full h-full p-1 bg-slate-900 rounded-lg">
                  {Array.from({ length: 25 }).map((_, i) => (
                    <div
                      key={i}
                      className={`rounded-xs ${
                        (i % 2 === 0 || i === 0 || i === 4 || i === 20 || i === 24)
                          ? 'bg-white'
                          : 'bg-slate-800'
                      }`}
                    />
                  ))}
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-xl backdrop-blur-xs">
                  <span className="text-[10px] font-bold text-emerald-300">Scan to Order</span>
                </div>
              </div>

              <div className="w-full pt-2 border-t border-slate-800 text-[10px] text-slate-400 font-mono truncate">
                pos://order?tbl={t.table_number}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* INTERACTIVE KIOSK SIMULATOR */
        <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                Interactive Touch Terminal
              </span>
              <h2 className="text-lg font-black text-white mt-1">Self-Service Order Kiosk</h2>
            </div>
            <span className="text-xs text-slate-400 font-mono">Terminal ID: KIOSK-01</span>
          </div>

          {kioskOrderNumber ? (
            /* Order Placed Success Screen */
            <div className="py-16 text-center space-y-4 max-w-md mx-auto">
              <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-black text-white">Order Sent to Kitchen!</h3>
              <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                <span className="text-xs text-slate-400">Your Pickup Order Number:</span>
                <p className="text-3xl font-black text-emerald-400 font-mono mt-1 tracking-wider">
                  {kioskOrderNumber}
                </p>
              </div>
              <p className="text-xs text-slate-400">
                Please collect your printed receipt slip and await your number on the kitchen collection display.
              </p>
              <button
                onClick={() => setKioskOrderNumber(null)}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
              >
                Start New Kiosk Order
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Cols: Category Tabs & Products */}
              <div className="lg:col-span-2 space-y-4">
                {/* Category Pills */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {categories.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedKioskCat(c.id)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                        selectedKioskCat === c.id
                          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                          : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>

                {/* Product Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {filteredProducts.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => addToKioskCart(p)}
                      className="bg-slate-900/90 border border-slate-800 hover:border-emerald-500 rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition-all active:scale-[0.98] shadow-md group"
                    >
                      <div>
                        <span className="text-[10px] text-emerald-400 font-semibold">{p.category_name}</span>
                        <h4 className="text-xs font-bold text-white mt-1 group-hover:text-emerald-400 transition-colors">
                          {p.name}
                        </h4>
                      </div>
                      <div className="mt-4 pt-2 border-t border-slate-800/80 flex justify-between items-center">
                        <span className="text-sm font-black font-mono text-white">
                          ${(p.base_price_cents / 100).toFixed(2)}
                        </span>
                        <div className="w-6 h-6 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                          <Plus className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Col: Kiosk Cart */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                    <ShoppingBag className="w-4 h-4 text-emerald-400" />
                    Your Tray ({kioskCart.reduce((acc, it) => acc + it.quantity, 0)})
                  </h3>

                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-800/60 mt-2 space-y-2 text-xs">
                    {kioskCart.length === 0 ? (
                      <p className="text-center text-slate-500 py-12">
                        Tap any meal item on the left to add to your tray.
                      </p>
                    ) : (
                      kioskCart.map((item) => (
                        <div key={item.id} className="pt-2 flex justify-between items-center">
                          <div>
                            <p className="text-white font-bold">{item.name}</p>
                            <span className="text-[10px] text-slate-400 font-mono">
                              @ ${(item.base_price_cents / 100).toFixed(2)}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 font-mono">
                              <button
                                onClick={() => updateKioskQty(item.id, -1)}
                                className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="px-2 font-bold text-white">{item.quantity}</span>
                              <button
                                onClick={() => updateKioskQty(item.id, 1)}
                                className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <span className="font-mono font-bold text-emerald-400 w-14 text-right">
                              ${((item.base_price_cents * item.quantity) / 100).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-800 text-xs">
                  <div className="space-y-1">
                    <label className="text-slate-400 font-semibold">Your Name for Order Pickup</label>
                    <input
                      type="text"
                      value={kioskCustomerName}
                      onChange={(e) => setKioskCustomerName(e.target.value)}
                      placeholder="e.g. Alex"
                      className="w-full bg-slate-950 border border-slate-800 p-2 rounded-lg text-white font-semibold focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex justify-between font-bold text-sm">
                    <span className="text-white">Total:</span>
                    <span className="text-emerald-400 font-mono">
                      ${(kioskSubtotal / 100).toFixed(2)}
                    </span>
                  </div>

                  <button
                    onClick={handlePlaceKioskOrder}
                    disabled={kioskCart.length === 0}
                    className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-xl text-xs shadow-lg shadow-emerald-600/20 disabled:opacity-30 transition-all cursor-pointer"
                  >
                    Pay & Print Order Ticket
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
