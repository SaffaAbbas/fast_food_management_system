import React, { useState, useEffect, useRef } from 'react'
import {
  ShoppingBag,
  Search,
  Plus,
  Minus,
  Trash2,
  DollarSign,
  Percent,
  Clock,
  Sparkles,
  Tag,
  CreditCard,
  User,
  Users,
  Grid3X3,
  Bookmark,
  Check,
  X,
  AlertCircle,
  FileText,
  ChevronRight,
  Flame,
  Star,
  CheckCircle2,
  Layers,
  Receipt,
  Ticket,
  ArrowLeft
} from 'lucide-react'
import { userCan } from '../../lib/access.js'
import PaymentModal from './PaymentModal.jsx'
import ReceiptModal from './ReceiptModal.jsx'
import { EntityImage } from '../../components/ImagePicker.jsx'

export default function PosView({ currentUser, preselectedTable, onNavigateToTables, onNavigateToDashboard, onBack }) {
  const canPay = userCan(currentUser, 'pos:process_payment')
  const canDiscount = userCan(currentUser, 'pos:apply_discount')
  // Order Parameters
  const [orderType, setOrderType] = useState('DINE_IN') // 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY'
  const [selectedTable, setSelectedTable] = useState(preselectedTable || null)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [deliveryZones, setDeliveryZones] = useState([])
  const [selectedZoneId, setSelectedZoneId] = useState('')
  const [kitchenLiveStatus, setKitchenLiveStatus] = useState(null)
  const [orderNotes, setOrderNotes] = useState('')
  const [orderNumber, setOrderNumber] = useState(`ORD-${Date.now().toString().slice(-6)}`)
  const [editingOrderId, setEditingOrderId] = useState(null)

  // Catalog Data
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [combos, setCombos] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loadingCatalog, setLoadingCatalog] = useState(true)

  // Cart: Array of { cartId, productId, name, variationId, variationName, unitPriceCents, quantity, totalCents, modifiers, notes }
  const [cart, setCart] = useState([])
  const [discountCents, setDiscountCents] = useState(0)
  const [discountReason, setDiscountReason] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState(null)
  const discountLockRef = useRef(null)

  // Settings
  const [settings, setSettings] = useState({
    taxRate: 5.0,
    serviceChargeRate: 0.0,
    deliveryChargeCents: 300,
    businessName: 'FastBite Gourmet Grill',
    currencySymbol: '$',
  })

  // Held Orders
  const [heldOrders, setHeldOrders] = useState([])
  const [isHeldDrawerOpen, setIsHeldDrawerOpen] = useState(false)

  // Modals
  const [customizingProduct, setCustomizingProduct] = useState(null) // Product for variation/modifiers modal
  const [customizingCombo, setCustomizingCombo] = useState(null)
  const [isTableModalOpen, setIsTableModalOpen] = useState(false)
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false)
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false)
  const [activePaymentOrder, setActivePaymentOrder] = useState(null)
  const [completedReceiptOrder, setCompletedReceiptOrder] = useState(null)

  // Notification Toast
  const [toast, setToast] = useState(null)

  const showToast = (type, message) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3500)
  }

  // Load Data
  const loadData = async () => {
    setLoadingCatalog(true)
    try {
      if (window.api) {
        const [cats, prods, deals, sysSettings, held, zones] = await Promise.all([
          window.api.product?.getCategories ? window.api.product.getCategories() : [],
          window.api.product?.getProducts ? window.api.product.getProducts({ includeInactive: false }) : [],
          window.api.product?.getCombos ? window.api.product.getCombos() : [],
          window.api.db?.getSettings ? window.api.db.getSettings() : {},
          window.api.pos?.getHeldOrders ? window.api.pos.getHeldOrders() : [],
          window.api.delivery?.getZones ? window.api.delivery.getZones() : [],
        ])
        const visibleCats = (cats || []).filter((c) => c.is_visible_pos !== 0)
        const visibleCatIds = new Set(visibleCats.map((c) => c.id))
        setCategories(visibleCats)
        setProducts((prods || []).filter((p) => !p.category_id || visibleCatIds.has(p.category_id)))
        setCombos(deals || [])
        setHeldOrders(held || [])
        setDeliveryZones((zones || []).filter((z) => z.is_active !== 0))

        if (sysSettings) {
          setSettings({
            taxRate: parseFloat(sysSettings.tax_rate_percentage || 5.0),
            serviceChargeRate: parseFloat(sysSettings.service_charge_percentage || 0.0),
            deliveryChargeCents: Math.round(parseFloat(sysSettings.delivery_fee || 3.0) * 100),
            loyaltyEarnPerDollar: parseFloat(sysSettings.loyalty_earn_per_dollar || 1),
            loyaltyRedeemMin: parseInt(sysSettings.loyalty_redeem_min || 50, 10),
            loyaltyCentsPerPoint: parseInt(sysSettings.loyalty_cents_per_point || 1, 10),
            businessName: sysSettings.business_name || 'FastBite Gourmet Grill',
            currencySymbol: sysSettings.currency_symbol || '$',
          })
        }
      }
    } catch (err) {
      console.error('Failed to load POS data:', err)
      showToast('error', `Failed to load catalog: ${err.message}`)
    } finally {
      setLoadingCatalog(false)
    }
  }

  useEffect(() => {
    loadData()
    const unsubKitchen = window.api?.on?.('kitchen:order-update', (payload) => {
      setKitchenLiveStatus(payload?.status || payload?.itemStatus || 'updated')
      showToast('success', `Kitchen: ${payload?.status || payload?.itemStatus || 'updated'}`)
    })
    const unsubPos = window.api?.on?.('pos:status-change', (payload) => {
      if (payload?.status) setKitchenLiveStatus(payload.status)
    })
    return () => {
      unsubKitchen?.()
      unsubPos?.()
    }
  }, [])

  useEffect(() => {
    if (preselectedTable) {
      setSelectedTable(preselectedTable)
      setOrderType('DINE_IN')
    }
  }, [preselectedTable])

  // Click on Product card
  const handleProductClick = async (product) => {
    if (product.is_available === 0) {
      showToast('error', `"${product.name}" is currently marked UNAVAILABLE.`)
      return
    }

    try {
      // Check if product has variations or modifier groups
      if (window.api?.product?.getProductDetails) {
        const full = await window.api.product.getProductDetails(product.id)
        if (full?.variations?.length > 0 || full?.modifierGroups?.length > 0) {
          setCustomizingProduct(full)
          return
        }
      }
    } catch (e) {}

    // Add standard product directly to cart
    addItemToCart({
      productId: product.id,
      name: product.name,
      variationId: null,
      variationName: null,
      unitPriceCents: getProductChannelPrice(product, orderType),
      modifiers: [],
      notes: '',
      categoryId: product.category_id,
      isDiscountEligible: product.is_discount_eligible !== 0,
    })
  }

  // Get price based on order channel (Dine-in / Takeaway / Delivery)
  const getProductChannelPrice = (product, channel) => {
    if (channel === 'DINE_IN' && product.price_dine_in_cents) return product.price_dine_in_cents
    if (channel === 'TAKEAWAY' && product.price_takeaway_cents) return product.price_takeaway_cents
    if (channel === 'DELIVERY' && product.price_delivery_cents) return product.price_delivery_cents
    return product.base_price_cents
  }

  // Add Item To Cart
  const addItemToCart = ({
    productId,
    name,
    variationId,
    variationName,
    unitPriceCents,
    modifiers = [],
    notes = '',
    quantity = 1,
    silent = false,
    categoryId = null,
    comboId = null,
    isDiscountEligible = true,
  }) => {
    const modifierTotalCents = modifiers.reduce((acc, m) => acc + (m.priceCents || 0), 0)
    const totalUnitCents = unitPriceCents + modifierTotalCents
    const addQty = Math.max(1, parseInt(quantity, 10) || 1)

    // Generate unique signature for grouping identical items
    const signature = `${productId}_${variationId || 'base'}_${modifiers.map(m => m.id || m.name).sort().join('_')}_${notes}`

    setCart((prev) => {
      const existingIdx = prev.findIndex((item) => item.signature === signature)
      if (existingIdx >= 0) {
        return prev.map((item, idx) =>
          idx === existingIdx
            ? {
                ...item,
                quantity: item.quantity + addQty,
                totalCents: (item.quantity + addQty) * totalUnitCents,
              }
            : item
        )
      }
      return [
        ...prev,
        {
          cartId: Date.now() + Math.random(),
          signature,
          productId,
          name,
          variationId,
          variationName,
          unitPriceCents: totalUnitCents,
          quantity: addQty,
          totalCents: addQty * totalUnitCents,
          modifiers,
          notes,
          categoryId,
          comboId,
          isDiscountEligible: isDiscountEligible !== 0 && isDiscountEligible !== false,
        },
      ]
    })

    if (!silent) showToast('success', `Added "${name}" to order`)
  }

  const comboIsLive = (combo) => {
    if (!combo || combo.is_available === 0) return false
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    if (combo.available_from && today < String(combo.available_from).slice(0, 10)) return false
    if (combo.available_to && today > String(combo.available_to).slice(0, 10)) return false
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const fromT = combo.available_from_time ? String(combo.available_from_time).slice(0, 5) : null
    const toT = combo.available_to_time ? String(combo.available_to_time).slice(0, 5) : null
    if (fromT && toT && fromT > toT) {
      if (!(hhmm >= fromT || hhmm <= toT)) return false
    } else {
      if (fromT && hhmm < fromT) return false
      if (toT && hhmm > toT) return false
    }
    return true
  }

  const commitComboToCart = (combo, chosenChoiceItems = []) => {
    const included = (combo.items || []).filter((it) => !it.choice_group)
    const lines = [...included, ...chosenChoiceItems]
    if (lines.length === 0) {
      showToast('error', 'This combo has no products configured.')
      return
    }
    const [first, ...rest] = lines
    addItemToCart({
      productId: first.product_id,
      name: combo.name,
      unitPriceCents: combo.price_cents,
      notes: `Combo: ${lines.map((l) => `${l.quantity || 1}× ${l.product_name}`).join(', ')}`,
      quantity: first.quantity || 1,
      silent: true,
      comboId: combo.id,
      categoryId: first.category_id || null,
    })
    for (const extra of rest) {
      addItemToCart({
        productId: extra.product_id,
        name: extra.product_name,
        unitPriceCents: 0,
        notes: `Part of ${combo.name}`,
        quantity: extra.quantity || 1,
        silent: true,
        comboId: combo.id,
      })
    }
    showToast('success', `Added combo "${combo.name}"`)
  }

  const handleComboClick = (combo) => {
    if (!comboIsLive(combo)) {
      showToast('error', `"${combo.name}" is not available right now.`)
      return
    }
    const groups = {}
    for (const it of combo.items || []) {
      if (!it.choice_group) continue
      if (!groups[it.choice_group]) groups[it.choice_group] = []
      groups[it.choice_group].push(it)
    }
    if (Object.keys(groups).length > 0) {
      setCustomizingCombo({ combo, groups })
      return
    }
    commitComboToCart(combo)
  }

  // Cart Item Quantity Stepper
  const updateQuantity = (cartId, delta) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.cartId === cartId) {
            const nextQty = item.quantity + delta
            if (nextQty <= 0) return null
            return {
              ...item,
              quantity: nextQty,
              totalCents: nextQty * item.unitPriceCents,
            }
          }
          return item
        })
        .filter(Boolean)
    )
  }

  const removeCartItem = (cartId) => {
    setCart((prev) => prev.filter((item) => item.cartId !== cartId))
  }

  // Cart Calculation Breakdown
  const subtotalCents = cart.reduce((acc, item) => acc + item.totalCents, 0)
  const afterDiscountCents = Math.max(0, subtotalCents - discountCents)
  const taxCents = Math.round((afterDiscountCents * settings.taxRate) / 100)
  const serviceChargeCents = orderType === 'DINE_IN' ? Math.round((afterDiscountCents * settings.serviceChargeRate) / 100) : 0
  const selectedZone = deliveryZones.find((z) => z.id === selectedZoneId)
  const deliveryChargeCents =
    orderType === 'DELIVERY'
      ? (selectedZone?.delivery_charge_cents ?? settings.deliveryChargeCents)
      : 0
  const grandTotalCents = afterDiscountCents + taxCents + serviceChargeCents + deliveryChargeCents
  const itemDiscountCents = cart.reduce((acc, item) => acc + (item.discountCents || 0), 0)

  const cartPromoItems = cart.map((it) => ({
    productId: it.productId,
    categoryId: it.categoryId,
    comboId: it.comboId,
    quantity: it.quantity,
    unitPriceCents: it.unitPriceCents,
    totalCents: it.totalCents,
    isDiscountEligible: it.isDiscountEligible,
  }))

  useEffect(() => {
    let cancelled = false
    const applyPromo = async () => {
      const lock = discountLockRef.current
      if (lock === 'loyalty') return
      if (lock === 'manual' && appliedCoupon?.code && window.api?.coupons?.validate) {
        try {
          const res = await window.api.coupons.validate({
            code: appliedCoupon.code,
            orderTotalCents: subtotalCents,
            customerId: selectedCustomer?.id,
            items: cartPromoItems,
          })
          if (!cancelled) {
            setDiscountCents(res.discountCents)
            setDiscountReason(`Coupon: ${res.coupon.code} (${res.coupon.title})`)
            setAppliedCoupon({ id: res.coupon.id, code: res.coupon.code })
          }
        } catch {
          if (!cancelled) {
            setDiscountCents(0)
            setDiscountReason('')
            setAppliedCoupon(null)
            discountLockRef.current = null
          }
        }
        return
      }
      if (lock === 'manual') return

      let auto = null
      if (window.api?.coupons?.evaluateAuto && subtotalCents > 0) {
        try {
          auto = await window.api.coupons.evaluateAuto({
            orderTotalCents: subtotalCents,
            customerId: selectedCustomer?.id,
            items: cartPromoItems,
          })
        } catch {
          auto = null
        }
      }
      const custCents = selectedCustomer?.discount_percent
        ? Math.round(subtotalCents * (Number(selectedCustomer.discount_percent) / 100))
        : 0
      if (cancelled) return
      if (custCents > (auto?.discountCents || 0)) {
        setDiscountCents(custCents)
        setDiscountReason(`Customer ${selectedCustomer.tag || ''} ${selectedCustomer.discount_percent}%`)
        setAppliedCoupon(null)
      } else if (auto?.discountCents > 0) {
        setDiscountCents(auto.discountCents)
        setDiscountReason(`Promo: ${auto.code} (${auto.title})`)
        setAppliedCoupon({ id: auto.coupon?.id, code: auto.code })
      } else {
        setDiscountCents(0)
        setDiscountReason('')
        setAppliedCoupon(null)
      }
    }
    applyPromo()
    return () => {
      cancelled = true
    }
  }, [subtotalCents, selectedCustomer, cart.length])

  const buildOrderPayload = (status) => ({
    id: editingOrderId || undefined,
    orderNumber,
    orderType,
    status,
    tableId: orderType === 'DINE_IN' ? selectedTable?.id || null : null,
    customerId: selectedCustomer?.id || preselectedTable?.customerId || null,
    reservationId: selectedTable?.reservationId || preselectedTable?.reservationId || null,
    subtotalCents,
    discountCents,
    discountReason,
    couponId: appliedCoupon?.id || null,
    couponCode: appliedCoupon?.code || null,
    taxCents,
    serviceChargeCents,
    deliveryChargeCents,
    totalCents: grandTotalCents,
    notes: orderNotes,
    items: cart.map((it) => ({
      productId: it.productId,
      variationId: it.variationId,
      name: it.variationName ? `${it.name} (${it.variationName})` : it.name,
      quantity: it.quantity,
      unitPriceCents: it.unitPriceCents,
      discountCents: it.discountCents || 0,
      totalCents: it.totalCents,
      notes: it.notes,
      modifiers: it.modifiers,
    })),
  })

  // Hold Order
  const handleHoldOrder = async () => {
    if (cart.length === 0) {
      showToast('error', 'Cart is empty. Add products before holding order.')
      return
    }

    try {
      await window.api.pos.holdOrder(buildOrderPayload('DRAFT'))
      showToast('success', `Order ${orderNumber} placed on Hold!`)

      // Reset cart and refresh held list
      resetCart()
      const updatedHeld = await window.api.pos.getHeldOrders()
      setHeldOrders(updatedHeld || [])
    } catch (err) {
      showToast('error', `Hold order failed: ${err.message}`)
    }
  }

  // Recall Held Order
  const handleRecallOrder = async (held) => {
    try {
      const full = await window.api.pos.getOrder(held.id)
      if (!full) throw new Error('Order details not found')

      // Load into cart
      setOrderNumber(full.order_number)
      setOrderType(full.order_type)
      setDiscountCents(full.discount_cents || 0)
      setDiscountReason(full.discount_reason || '')
      setAppliedCoupon(full.coupon_code ? { id: full.coupon_id, code: full.coupon_code } : null)
      discountLockRef.current = full.coupon_code ? 'manual' : null
      setOrderNotes(full.notes || '')
      if (full.table_id) {
        setSelectedTable({ id: full.table_id, table_number: full.table_number, floor_name: full.floor_name })
      }
      if (full.customer_id) {
        setSelectedCustomer({ id: full.customer_id, name: full.customer_name, phone: full.customer_phone })
      }

      const reconstructedCart = full.items.map((it) => ({
        cartId: Date.now() + Math.random(),
        signature: `${it.product_id}_${it.variation_id || 'base'}`,
        productId: it.product_id,
        name: it.item_name,
        variationId: it.variation_id,
        variationName: it.variation_name,
        unitPriceCents: it.unit_price_cents,
        quantity: it.quantity,
        totalCents: it.total_cents,
        modifiers: it.modifiers || [],
        notes: it.notes || '',
      }))

      setCart(reconstructedCart)
      const isPaid = (full.paid_cents || 0) > 0 && (full.paid_cents || 0) >= (full.total_cents || 0)
      setEditingOrderId(isPaid ? null : full.id)
      setIsHeldDrawerOpen(false)
      showToast(
        'success',
        isPaid
          ? `Opened paid order ${full.order_number} (view only — start a new ticket for extras)`
          : `Opened order ${full.order_number} — add items then Send or Pay`
      )
    } catch (err) {
      showToast('error', `Recall failed: ${err.message}`)
    }
  }

  useEffect(() => {
    if (preselectedTable?.current_order_id) {
      handleRecallOrder({ id: preselectedTable.current_order_id })
    }
  }, [preselectedTable?.current_order_id])

  // Reset Cart / Start Fresh
  const resetCart = () => {
    setCart([])
    setDiscountCents(0)
    setDiscountReason('')
    setAppliedCoupon(null)
    discountLockRef.current = null
    setOrderNotes('')
    setSelectedCustomer(null)
    setSelectedTable(null)
    setEditingOrderId(null)
    setOrderNumber(`ORD-${Date.now().toString().slice(-6)}`)
  }

  // Open Checkout / Payment Modal
  const handleProceedToPayment = async () => {
    if (cart.length === 0) {
      showToast('error', 'Cart is empty. Add products before proceeding to payment.')
      return
    }

    if (orderType === 'DINE_IN' && !selectedTable) {
      setIsTableModalOpen(true)
      showToast('error', 'Please select a dining table for Dine-In orders.')
      return
    }

    if (orderType === 'DELIVERY' && !selectedCustomer) {
      setIsCustomerModalOpen(true)
      showToast('error', 'Select or create a customer for delivery.')
      return
    }

    if (orderType === 'DELIVERY' && selectedZone?.min_order_cents && grandTotalCents < selectedZone.min_order_cents) {
      showToast(
        'error',
        `Minimum order for ${selectedZone.name} is $${(selectedZone.min_order_cents / 100).toFixed(2)}.`
      )
      return
    }

    try {
      const created = await window.api.pos.createOrder(buildOrderPayload('CONFIRMED'))
      if (orderType === 'DELIVERY' && window.api.delivery?.createDelivery) {
        try {
          await window.api.delivery.createDelivery({
            orderId: created.id,
            zoneId: selectedZoneId || undefined,
            customerName: selectedCustomer.name,
            customerPhone: selectedCustomer.phone || 'N/A',
            deliveryAddress: selectedCustomer.address || 'Address on file',
          })
        } catch (delivErr) {
          showToast('error', `Order sent but delivery ticket failed: ${delivErr.message}`)
        }
      }
      if (!canPay) {
        showToast('success', `Order ${created.orderNumber || created.order_number} sent to kitchen`)
        resetCart()
        return
      }
      setActivePaymentOrder(created)
    } catch (err) {
      showToast('error', `Order creation failed: ${err.message}`)
    }
  }

  // On Payment Successful
  const handlePaymentSuccess = (settledOrder) => {
    setActivePaymentOrder(null)
    setCompletedReceiptOrder(settledOrder)
    showToast('success', `Order ${settledOrder.order_number} settled successfully!`)
    resetCart()
  }

  // Filter products by category & search term
  const liveCombos = combos.filter((c) => comboIsLive(c) && c.is_active !== 0)
  const filteredCombos = liveCombos.filter((c) => {
    if (selectedCategory && selectedCategory !== '__combos__') return false
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim()
      return c.name.toLowerCase().includes(q) || c.code?.toLowerCase().includes(q)
    }
    return selectedCategory === '' || selectedCategory === '__combos__'
  })
  const filteredProducts = products.filter((p) => {
    if (selectedCategory === '__combos__') return false
    if (selectedCategory && p.category_id !== selectedCategory) return false
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim()
      const matchName = p.name.toLowerCase().includes(q)
      const matchSku = p.sku?.toLowerCase().includes(q)
      const matchBarcode = p.barcode?.toLowerCase().includes(q)
      if (!matchName && !matchSku && !matchBarcode) return false
    }
    return true
  })

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] gap-4 select-none">
      {/* Toast alert */}
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

      {/* TOP CONTROL BAR */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-2">
          {/* Back to Dashboard shortcut */}
          {(onBack || onNavigateToDashboard) && (
            <button
              onClick={onBack || onNavigateToDashboard}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 text-xs font-bold transition-all cursor-pointer shadow-sm group"
              title="Return to Main Dashboard"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-orange-400 group-hover:-translate-x-0.5 transition-transform" />
              <span>Dashboard</span>
            </button>
          )}

          {/* Order Type Switcher */}
          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
          {[
            { id: 'DINE_IN', label: 'Dine-In', icon: Grid3X3 },
            { id: 'TAKEAWAY', label: 'Takeaway', icon: ShoppingBag },
            { id: 'DELIVERY', label: 'Delivery', icon: User },
          ].map((t) => {
            const Icon = t.icon
            const isSelected = orderType === t.id
            return (
              <button
                key={t.id}
                onClick={() => setOrderType(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-orange-600 text-white shadow-md shadow-orange-950'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>
          {orderType === 'DELIVERY' && deliveryZones.length > 0 && (
            <select
              value={selectedZoneId}
              onChange={(e) => setSelectedZoneId(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
            >
              <option value="">Default delivery fee</option>
              {deliveryZones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name} · ${((z.delivery_charge_cents || 0) / 100).toFixed(2)}
                  {z.min_order_cents ? ` min $${(z.min_order_cents / 100).toFixed(2)}` : ''}
                </option>
              ))}
            </select>
          )}
          {kitchenLiveStatus && (
            <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800">
              Kitchen {kitchenLiveStatus}
            </span>
          )}
      </div>

        {/* Dynamic Context Badges (Table, Customer, Held Counter) */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Table Picker for Dine-In */}
          {orderType === 'DINE_IN' && (
            <button
              onClick={() => setIsTableModalOpen(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                selectedTable
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800 shadow-sm'
                  : 'bg-slate-900 border-amber-600/60 text-amber-300 hover:border-amber-500'
              }`}
            >
              <Grid3X3 className="w-3.5 h-3.5 text-orange-400" />
              <span>
                {selectedTable
                  ? `Table ${selectedTable.table_number} ${selectedTable.floor_name ? `(${selectedTable.floor_name})` : ''}`
                  : 'Select Dining Table *'}
              </span>
            </button>
          )}

          {/* Customer Selector */}
          <button
            onClick={() => setIsCustomerModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              selectedCustomer
                ? 'bg-indigo-950/80 text-indigo-300 border-indigo-800'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <User className="w-3.5 h-3.5 text-indigo-400" />
            <span className="truncate max-w-[140px]">
              {selectedCustomer ? selectedCustomer.name : 'Walk-in Customer'}
            </span>
          </button>

          {/* Held Orders Drawer Button */}
          <button
            onClick={() => setIsHeldDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
          >
            <Bookmark className="w-3.5 h-3.5 text-amber-400" />
            <span>Held Orders</span>
            {heldOrders.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 font-black text-[10px]">
                {heldOrders.length}
              </span>
            )}
          </button>

          {/* Order Number Tag */}
          <div className="hidden lg:flex items-center gap-1 text-slate-400 font-mono text-xs px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-xl">
            <span className="text-slate-500">Order:</span>
            <span className="font-bold text-white">{orderNumber}</span>
          </div>
        </div>
      </div>

      {/* MAIN WORKSPACE (LEFT: CATALOG, RIGHT: CART) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
        {/* LEFT / CENTER: MENU CATALOG (7 COLS) */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-3 min-h-0">
          {/* Search & Category Pills Bar */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 flex flex-col sm:flex-row gap-2.5 shadow-sm">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || !searchQuery.trim()) return
                  const q = searchQuery.trim().toLowerCase()
                  const exact = products.find((p) =>
                    p.barcode?.toLowerCase() === q || p.sku?.toLowerCase() === q
                  )
                  if (exact) {
                    handleProductClick(exact)
                    setSearchQuery('')
                  }
                }}
                placeholder="Search name, SKU, barcode — Enter to add exact SKU/barcode"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Pills Scroller */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <button
                onClick={() => setSelectedCategory('')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === ''
                    ? 'bg-orange-600 text-white shadow-md shadow-orange-950'
                    : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
                }`}
              >
                All Menu
              </button>
              {liveCombos.length > 0 && (
                <button
                  onClick={() => setSelectedCategory('__combos__')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    selectedCategory === '__combos__'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'bg-slate-900 text-amber-300 hover:text-white hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  Deals
                </button>
              )}
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-orange-600 text-white shadow-md shadow-orange-950'
                      : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Products Grid */}
          <div className="flex-1 overflow-y-auto pr-1">
            {loadingCatalog ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Loading menu catalog...
              </div>
            ) : filteredProducts.length === 0 && filteredCombos.length === 0 ? (
              <div className="bg-slate-950/40 border border-slate-800 border-dashed rounded-2xl p-12 text-center text-xs text-slate-500">
                No matching menu items found.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredCombos.map((combo) => (
                  <div
                    key={combo.id}
                    onClick={() => handleComboClick(combo)}
                    className="group relative bg-amber-950/20 border border-amber-800/70 rounded-2xl p-3 flex flex-col justify-between transition-all select-none cursor-pointer hover:border-amber-400 hover:shadow-xl hover:shadow-amber-950/20 active:scale-[0.98]"
                  >
                    <div className="flex items-start justify-between gap-1 mb-2">
                      <span className="text-[10px] text-amber-400 font-bold uppercase">Combo</span>
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <h4 className="text-sm font-black text-white leading-tight mb-1">{combo.name}</h4>
                    <p className="text-[10px] text-slate-400 line-clamp-2 mb-2">
                      {(combo.items || []).map((it) => it.product_name).join(' · ') || combo.description}
                    </p>
                    <div className="mt-auto text-sm font-mono font-black text-amber-300">
                      ${((combo.price_cents || 0) / 100).toFixed(2)}
                    </div>
                  </div>
                ))}
                {filteredProducts.map((p) => {
                  const channelPrice = getProductChannelPrice(p, orderType)
                  const isAvailable = p.is_available === 1

                  return (
                    <div
                      key={p.id}
                      onClick={() => handleProductClick(p)}
                      className={`group relative bg-slate-950/70 border rounded-2xl p-3 flex flex-col justify-between transition-all select-none cursor-pointer ${
                        isAvailable
                          ? 'border-slate-800 hover:border-orange-500/80 hover:bg-slate-900/90 hover:shadow-xl hover:shadow-orange-950/20 active:scale-[0.98]'
                          : 'border-slate-800/40 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      {/* Top Badges */}
                      <div className="flex items-start justify-between gap-1 mb-2">
                        <span className="text-[10px] text-orange-400/90 font-medium truncate">
                          {p.category_name}
                        </span>
                        <div className="flex items-center gap-1">
                          {p.is_featured === 1 && (
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
                          )}
                          {!isAvailable && (
                            <span className="text-[9px] bg-rose-950 text-rose-300 border border-rose-800 px-1.5 py-0.2 rounded font-bold uppercase">
                              Out
                            </span>
                          )}
                        </div>
                      </div>

                      {p.image_url ? (
                        <EntityImage
                          id={p.image_url}
                          alt={p.name}
                          className="w-full aspect-square rounded-xl mb-2 bg-white"
                        />
                      ) : (
                        <div className="w-full aspect-square rounded-xl mb-2 bg-slate-100 flex items-center justify-center text-slate-400">
                          <ShoppingBag className="w-8 h-8" />
                        </div>
                      )}
                      <h4 className="font-bold text-xs text-white line-clamp-2 leading-snug group-hover:text-orange-400 transition-colors">
                        {p.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                        {p.preparation_time_minutes ? (
                          <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" /> {p.preparation_time_minutes} min</span>
                        ) : null}
                        <span className={isAvailable ? 'text-emerald-600' : 'text-rose-500'}>
                          {isAvailable ? 'Available' : 'Unavailable'}
                        </span>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-800/70 flex items-center justify-between">
                        <div>
                          <div className="text-sm font-mono font-black text-emerald-400">
                            ${(channelPrice / 100).toFixed(2)}
                          </div>
                          {p.has_variations === 1 && (
                            <span className="text-[9px] text-indigo-400">Sizes Available</span>
                          )}
                        </div>

                        <div className="pos-add-btn w-8 h-8 rounded-full flex items-center justify-center shadow-sm">
                          <Plus className="w-4 h-4" strokeWidth={2.5} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: CART & BILL SUMMARY (5 COLS) */}
        <div className="lg:col-span-5 xl:col-span-4 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden min-h-0">
          {/* Cart Header */}
          <div className="p-3.5 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-orange-400" />
              <h3 className="font-bold text-xs uppercase tracking-wider text-white">Current Order</h3>
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[11px] font-mono">
                {cart.reduce((acc, it) => acc + it.quantity, 0)} Items
              </span>
            </div>

            {cart.length > 0 && (
              <button
                onClick={resetCart}
                className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 divide-y divide-slate-800/60">
            <textarea
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder="Order notes for kitchen / rider…"
              rows={2}
              className="w-full mb-2 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-[11px] text-white placeholder-slate-500"
            />
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
                <ShoppingBag className="w-10 h-10 text-slate-700 stroke-1" />
                <p className="text-xs font-semibold text-slate-400">Order is empty</p>
                <p className="text-[11px] text-slate-600 max-w-[200px]">
                  Click products on the left menu to add them to this ticket.
                </p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.cartId} className="pt-2 first:pt-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-white">{item.name}</span>
                        {item.variationName && (
                          <span className="text-[9px] bg-indigo-950 text-indigo-300 border border-indigo-800 px-1 rounded">
                            {item.variationName}
                          </span>
                        )}
                      </div>

                      {/* Modifiers List */}
                      {item.modifiers?.length > 0 && (
                        <div className="text-[10px] text-slate-400 pl-1 space-y-0.5 mt-0.5">
                          {item.modifiers.map((m, mi) => (
                            <div key={mi} className="flex justify-between">
                              <span>+ {m.name}</span>
                              <span className="font-mono text-slate-500">
                                ${(m.priceCents / 100).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Item note */}
                      {item.notes && (
                        <div className="text-[10px] text-amber-400/90 pl-1 italic">
                          Note: {item.notes}
                        </div>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="font-mono font-bold text-xs text-white">
                        ${(item.totalCents / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Quantity Stepper Bar */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-slate-500 font-mono">
                      @ ${(item.unitPriceCents / 100).toFixed(2)}
                    </span>

                    <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                      <button
                        onClick={() => updateQuantity(item.cartId, -1)}
                        className="w-6 h-6 rounded flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-mono font-bold text-xs text-white w-6 text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.cartId, 1)}
                        className="w-6 h-6 rounded flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <button onClick={() => removeCartItem(item.cartId)} className="w-6 h-6 rounded text-rose-400 hover:bg-rose-950/40 flex items-center justify-center">
                      <Trash2 className="w-3 h-3" />
                    </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* BILL CALCULATION & TOTALS */}
          <div className="p-4 bg-slate-900/80 border-t border-slate-800 space-y-2">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal:</span>
                <span className="font-mono text-slate-200">${(subtotalCents / 100).toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>Item discounts:</span>
                <span className="font-mono text-amber-400">-${(itemDiscountCents / 100).toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center text-slate-400">
                <button
                  onClick={() => setIsDiscountModalOpen(true)}
                  className="flex items-center gap-1 text-[11px] text-amber-400 hover:underline cursor-pointer"
                >
                  <Percent className="w-3 h-3" />
                  <span>Order discount / coupon</span>
                </button>
                <span className="font-mono text-amber-400 font-semibold">
                  -${(discountCents / 100).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>Tax (VAT {settings.taxRate}%):</span>
                <span className="font-mono text-slate-200">${(taxCents / 100).toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>Service charge{orderType === 'DINE_IN' ? ` (${settings.serviceChargeRate}%)` : ''}:</span>
                <span className="font-mono text-slate-200">${(serviceChargeCents / 100).toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-slate-400">
                <span>Delivery charge:</span>
                <span className="font-mono text-slate-200">${(deliveryChargeCents / 100).toFixed(2)}</span>
              </div>

              {/* Grand Total Bar */}
              <div className="pt-2 border-t border-slate-800 flex justify-between items-baseline">
                <span className="text-xs uppercase font-extrabold tracking-wider text-slate-300">Total Payable</span>
                <span className="text-2xl font-black font-mono text-emerald-400">
                  ${(grandTotalCents / 100).toFixed(2)}
                </span>
              </div>
            </div>

            {/* ACTION BUTTONS (HOLD, CHECKOUT) */}
            <div className="grid grid-cols-3 gap-2 pt-2">
              <button
                onClick={handleHoldOrder}
                disabled={cart.length === 0}
                className="flex items-center justify-center gap-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-xs font-bold transition-all cursor-pointer"
              >
                <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                {editingOrderId ? 'Save hold' : 'Hold'}
              </button>

              <button
                onClick={handleProceedToPayment}
                disabled={cart.length === 0}
                className="col-span-2 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-black shadow-lg shadow-emerald-950 transition-all cursor-pointer"
              >
                <CreditCard className="w-4 h-4" />
                {canPay ? `Pay $${(grandTotalCents / 100).toFixed(2)}` : 'Send to kitchen'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: PRODUCT CUSTOMIZER (Variations, Modifiers & Notes) */}
      {/* ========================================================================= */}
      {customizingProduct && (
        <ProductCustomizerModal
          product={customizingProduct}
          orderType={orderType}
          onClose={() => setCustomizingProduct(null)}
            onConfirm={(customizedItem) => {
            addItemToCart({
              ...customizedItem,
              categoryId: customizingProduct.category_id,
              isDiscountEligible: customizingProduct.is_discount_eligible !== 0,
            })
            setCustomizingProduct(null)
          }}
        />
      )}

      {customizingCombo && (
        <ComboChoiceModal
          combo={customizingCombo.combo}
          groups={customizingCombo.groups}
          onClose={() => setCustomizingCombo(null)}
          onConfirm={(chosen) => {
            commitComboToCart(customizingCombo.combo, chosen)
            setCustomizingCombo(null)
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL: TABLE PICKER */}
      {/* ========================================================================= */}
      {isTableModalOpen && (
        <TablePickerModal
          selectedTable={selectedTable}
          onClose={() => setIsTableModalOpen(false)}
          onSelect={(tbl) => {
            setSelectedTable(tbl)
            setIsTableModalOpen(false)
            showToast('success', `Selected Table ${tbl.table_number}`)
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL: CUSTOMER SELECTOR & QUICK ADD */}
      {/* ========================================================================= */}
      {isCustomerModalOpen && (
        <CustomerPickerModal
          selectedCustomer={selectedCustomer}
          onClose={() => setIsCustomerModalOpen(false)}
          onSelect={(c) => {
            setSelectedCustomer(c)
            setIsCustomerModalOpen(false)
            if (discountLockRef.current !== 'manual' && discountLockRef.current !== 'loyalty') {
              discountLockRef.current = null
            }
            showToast('success', `Customer set to "${c.name}"`)
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL: ORDER DISCOUNT */}
      {/* ========================================================================= */}
      {isDiscountModalOpen && (
        <DiscountModal
          subtotalCents={subtotalCents}
          currentDiscountCents={discountCents}
          currentReason={discountReason}
          customer={selectedCustomer}
          loyaltySettings={settings}
          cartItems={cart}
          canManualDiscount={canDiscount}
          onClose={() => setIsDiscountModalOpen(false)}
          onApply={(cents, reason, coupon = null, lock = 'manual') => {
            setDiscountCents(cents)
            setDiscountReason(reason)
            setAppliedCoupon(coupon)
            discountLockRef.current = cents > 0 ? lock : null
            setIsDiscountModalOpen(false)
            showToast('success', `Applied $${(cents / 100).toFixed(2)} discount`)
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* DRAWER: HELD ORDERS RECALL */}
      {/* ========================================================================= */}
      {isHeldDrawerOpen && (
        <HeldOrdersDrawer
          heldOrders={heldOrders}
          onClose={() => setIsHeldDrawerOpen(false)}
          onRecall={handleRecallOrder}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL: PAYMENT MODAL */}
      {/* ========================================================================= */}
      {activePaymentOrder && (
        <PaymentModal
          order={activePaymentOrder}
          branchSettings={settings}
          onClose={() => setActivePaymentOrder(null)}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL: THERMAL RECEIPT PREVIEW & PRINT */}
      {/* ========================================================================= */}
      {completedReceiptOrder && (
        <ReceiptModal
          order={completedReceiptOrder}
          branchSettings={settings}
          onClose={() => setCompletedReceiptOrder(null)}
          onNewOrder={resetCart}
        />
      )}
    </div>
  )
}

// ============================================================================
// SUB-COMPONENT: PRODUCT CUSTOMIZER MODAL (Variations, Modifiers & Notes)
// ============================================================================
function ProductCustomizerModal({ product, orderType, onClose, onConfirm }) {
  const variations = product.variations || []
  const [selectedVariation, setSelectedVariation] = useState(
    variations.find((v) => v.is_default) || variations[0] || null
  )

  // Modifier groups
  const modifierGroups = product.modifierGroups || []
  const [selectedModifiers, setSelectedModifiers] = useState([])
  const [itemNote, setItemNote] = useState('')

  const basePriceCents = selectedVariation
    ? selectedVariation.price_cents
    : product.base_price_cents

  const handleToggleModifier = (group, mod) => {
    setSelectedModifiers((prev) => {
      const exists = prev.find((m) => m.id === mod.id)
      if (exists) {
        return prev.filter((m) => m.id !== mod.id)
      }
      const currentInGroup = prev.filter((m) => m.groupId === group.id)
      if (group.max_selection && currentInGroup.length >= group.max_selection) {
        const otherGroups = prev.filter((m) => m.groupId !== group.id)
        return [...otherGroups, { ...mod, groupId: group.id, priceCents: mod.price_cents, quantity: 1 }]
      }
      return [...prev, { ...mod, groupId: group.id, priceCents: mod.price_cents, quantity: 1 }]
    })
  }

  const bumpModifierQty = (modId, delta) => {
    setSelectedModifiers((prev) =>
      prev
        .map((m) => (m.id === modId ? { ...m, quantity: Math.max(0, (m.quantity || 1) + delta) } : m))
        .filter((m) => (m.quantity || 1) > 0)
    )
  }

  const modifierTotalCents = selectedModifiers.reduce((acc, m) => acc + (m.price_cents || 0) * (m.quantity || 1), 0)
  const totalItemCents = basePriceCents + modifierTotalCents

  const handleConfirm = () => {
    const missing = modifierGroups.find(
      (g) => g.is_required && !selectedModifiers.some((m) => m.groupId === g.id)
    )
    if (missing) return
    onConfirm({
      productId: product.id,
      name: product.name,
      variationId: selectedVariation?.id || null,
      variationName: selectedVariation?.name || null,
      unitPriceCents: basePriceCents,
      modifiers: selectedModifiers.map((m) => ({
        id: m.id,
        name: (m.quantity || 1) > 1 ? `${m.name} x${m.quantity}` : m.name,
        priceCents: (m.price_cents || 0) * (m.quantity || 1),
        quantity: m.quantity || 1,
      })),
      notes: itemNote.trim(),
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col max-h-[85vh] space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="font-bold text-white text-base">{product.name}</h3>
            <p className="text-xs text-orange-400 font-mono mt-0.5">Customize portion size & options</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Variations (Sizes) */}
          {variations.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Select Size / Portion
              </label>
              <div className="grid grid-cols-2 gap-2">
                {variations.map((v) => {
                  const isSelected = selectedVariation?.id === v.id
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariation(v)}
                      className={`p-3 rounded-xl border flex justify-between items-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-orange-950/60 border-orange-500 text-white font-bold'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-xs">{v.name}</span>
                      <span className="font-mono text-emerald-400 text-xs">
                        ${(v.price_cents / 100).toFixed(2)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Modifier Groups */}
          {modifierGroups.map((group) => (
            <div key={group.id} className="space-y-2 bg-slate-900/60 border border-slate-800/80 p-3.5 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{group.name}</span>
                {group.is_required ? (
                  <span className="text-[10px] bg-rose-950 text-rose-300 border border-rose-800 px-1.5 py-0.2 rounded font-bold">
                    Required
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500">Optional</span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {group.modifiers?.map((m) => {
                  const isChecked = selectedModifiers.some((sm) => sm.id === m.id)
                  return (
                    <div
                      key={m.id}
                      className={`px-3 py-2 rounded-lg border text-xs flex justify-between items-center gap-2 ${
                        isChecked
                          ? 'bg-orange-950/70 border-orange-500 text-white font-semibold'
                          : 'bg-slate-950 border-slate-800 text-slate-300'
                      }`}
                    >
                      <button type="button" onClick={() => handleToggleModifier(group, m)} className="flex-1 text-left">
                        <span>{m.name}</span>
                        <span className="font-mono text-slate-400 text-[11px] ml-2">
                          +${(m.price_cents / 100).toFixed(2)}
                        </span>
                      </button>
                      {isChecked && (
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => bumpModifierQty(m.id, -1)} className="w-5 h-5 rounded bg-slate-800">-</button>
                          <span className="w-4 text-center">{selectedModifiers.find((sm) => sm.id === m.id)?.quantity || 1}</span>
                          <button type="button" onClick={() => bumpModifierQty(m.id, 1)} className="w-5 h-5 rounded bg-slate-800">+</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Item Special Instructions / Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300">Kitchen Instructions / Item Note</label>
            <input
              type="text"
              value={itemNote}
              onChange={(e) => setItemNote(e.target.value)}
              placeholder="e.g. Extra hot, no pickles, dressing on the side..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500">Item Total</span>
            <div className="text-lg font-mono font-black text-emerald-400">
              ${(totalItemCents / 100).toFixed(2)}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-lg shadow-orange-950 cursor-pointer"
            >
              Add to Ticket
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// SUB-COMPONENT: TABLE PICKER MODAL
// ============================================================================
function TablePickerModal({ selectedTable, onClose, onSelect }) {
  const [floors, setFloors] = useState([])
  const [activeFloorId, setActiveFloorId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadTables() {
      try {
        if (window.api?.tables) {
          const res = await window.api.tables.getFloorsWithTables()
          setFloors(res || [])
          if (res?.length > 0) setActiveFloorId(res[0].id)
        }
      } catch (err) {
        console.error('Failed to load tables:', err)
      } finally {
        setLoading(false)
      }
    }
    loadTables()
  }, [])

  const currentFloor = floors.find((f) => f.id === activeFloorId) || floors[0]

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Grid3X3 className="w-5 h-5 text-orange-400" />
            <h3 className="font-bold text-white text-base">Select Dining Table for Order</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Floor Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2">
          {floors.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFloorId(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currentFloor?.id === f.id
                  ? 'bg-orange-600 text-white shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>

        {/* Tables Grid */}
        <div className="min-h-[240px] max-h-[50vh] overflow-y-auto">
          {loading ? (
            <div className="text-xs text-slate-500 text-center py-10">Loading tables...</div>
          ) : currentFloor?.tables?.length === 0 ? (
            <div className="text-xs text-slate-500 text-center py-10">No tables configured on this floor.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {currentFloor?.tables?.map((t) => {
                const isSelected = selectedTable?.id === t.id
                const isOccupied = t.status === 'OCCUPIED'
                const isReserved = t.status === 'RESERVED' || Boolean(t.has_reservation)
                const isCleaning = t.status === 'CLEANING'
                const isOut = t.status === 'OUT_OF_SERVICE'

                return (
                  <button
                    key={t.id}
                    disabled={(isOccupied && selectedTable?.id !== t.id) || isOut}
                    onClick={() =>
                      onSelect({
                        id: t.id,
                        table_number: t.table_number,
                        floor_name: currentFloor.name,
                        status: t.status,
                      })
                    }
                    className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-orange-950/70 border-orange-500 text-white shadow-lg'
                        : isOccupied
                        ? 'bg-amber-950/30 border-amber-800/60 text-amber-200 opacity-70 cursor-not-allowed'
                        : isReserved
                        ? 'bg-indigo-950/40 border-indigo-800 text-indigo-200'
                        : isCleaning
                        ? 'bg-slate-800 border-slate-700 text-slate-400'
                        : isOut
                        ? 'bg-slate-950 border-slate-700 text-slate-500 opacity-60 cursor-not-allowed'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-white">{t.table_number}</span>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isOccupied ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
                        }`}
                      />
                    </div>
                    <div className="mt-3 text-[11px] text-slate-400 flex justify-between items-center">
                      <span>Cap: {t.capacity}</span>
                      <span className="capitalize text-[10px] font-semibold">
                        {isOut ? 'out of service' : isReserved && t.status !== 'RESERVED' ? 'reserved' : t.status.toLowerCase()}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="pt-2 flex items-center justify-between border-t border-slate-800 text-xs text-slate-500">
          <div className="flex gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Available
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" /> Occupied
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-400" /> Reserved
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-500" /> Out of service
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// SUB-COMPONENT: CUSTOMER PICKER MODAL (Search & Quick Create)
// ============================================================================
function CustomerPickerModal({ selectedCustomer, onClose, onSelect }) {
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState([])
  const [isCreating, setIsCreating] = useState(false)

  // New customer form
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')

  useEffect(() => {
    async function search() {
      try {
        if (window.api?.customers) {
          const res = await window.api.customers.getCustomers({ searchQuery: query })
          setCustomers(res || [])
        }
      } catch (err) {}
    }
    search()
  }, [query])

  const handleCreateCustomer = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    try {
      const created = await window.api.customers.create({
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
      })
      onSelect(created)
    } catch (err) {
      alert(`Customer creation failed: ${err.message}`)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-white text-base">Select Customer</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isCreating ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search by customer name or phone..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={() => setIsCreating(true)}
                className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Quick Add
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5 divide-y divide-slate-800/60">
              {customers.map((c) => (
                <div
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className="pt-1.5 first:pt-0 p-2 rounded-lg hover:bg-slate-900 flex justify-between items-center cursor-pointer transition-colors"
                >
                  <div>
                    <div className="text-xs font-bold text-white">{c.name}</div>
                    <div className="text-[11px] text-slate-400">{c.phone || 'No phone'}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-mono text-emerald-400 font-bold">
                      {c.loyalty_points || 0} pts
                    </span>
                    <div className="text-[10px] text-slate-500">{c.order_count || 0} orders</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateCustomer} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Customer Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full Name"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Phone Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555-0199"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Delivery Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street address for deliveries..."
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
            <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Back to Search
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
              >
                Save & Select Customer
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// SUB-COMPONENT: ORDER DISCOUNT MODAL
// ============================================================================
// ============================================================================
// SUB-COMPONENT: ORDER DISCOUNT & PROMO COUPONS MODAL
// ============================================================================
function DiscountModal({ subtotalCents, currentDiscountCents, currentReason, customer, loyaltySettings, cartItems = [], canManualDiscount = false, onClose, onApply }) {
  const [tab, setTab] = useState('coupon') // 'coupon' | 'manual' | 'loyalty'
  const [redeemPts, setRedeemPts] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [couponError, setCouponError] = useState(null)
  const [validCouponInfo, setValidCouponInfo] = useState(null)
  const [validating, setValidating] = useState(false)

  // Manual State
  const [discountType, setDiscountType] = useState('percent') // 'percent' | 'fixed'
  const [value, setValue] = useState(
    currentDiscountCents > 0 ? (currentDiscountCents / 100).toFixed(2) : '10'
  )
  const [reason, setReason] = useState(currentReason || 'Manager Approval')

  const calculatedManualCents =
    discountType === 'percent'
      ? Math.round((subtotalCents * parseFloat(value || 0)) / 100)
      : Math.round(parseFloat(value || 0) * 100)

  // Validate Promo Coupon Code
  const handleValidateCoupon = async (e) => {
    e.preventDefault()
    if (!couponCode.trim()) return
    setValidating(true)
    setCouponError(null)
    setValidCouponInfo(null)
    try {
      if (window.api?.coupons?.validate) {
        const res = await window.api.coupons.validate({
          code: couponCode.trim().toUpperCase(),
          orderTotalCents: subtotalCents,
          customerId: customer?.id,
          items: cartItems,
        })
        setValidCouponInfo(res)
      } else {
        throw new Error('Coupons API not available in offline fallback.')
      }
    } catch (err) {
      console.error('Coupon validation failed:', err)
      setCouponError(err.message || 'Invalid promotional coupon.')
    } finally {
      setValidating(false)
    }
  }

  const handleApplyCoupon = () => {
    if (validCouponInfo) {
      onApply(
        validCouponInfo.discountCents,
        `Coupon: ${validCouponInfo.coupon.code} (${validCouponInfo.coupon.title})`,
        { id: validCouponInfo.coupon.id, code: validCouponInfo.coupon.code },
        'manual'
      )
    }
  }

  const handleApplyManual = (e) => {
    e.preventDefault()
    if (!canManualDiscount) return
    onApply(calculatedManualCents, reason, null, 'manual')
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-white text-base">Discount & Vouchers</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setTab('coupon')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              tab === 'coupon' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Ticket className="w-3.5 h-3.5" />
            Promo Voucher
          </button>
          <button
            type="button"
            onClick={() => setTab('manual')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              tab === 'manual' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Percent className="w-3.5 h-3.5" />
            Manual Discount
          </button>
          <button
            type="button"
            onClick={() => setTab('loyalty')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              tab === 'loyalty' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Points
          </button>
        </div>

        {tab === 'coupon' ? (
          <div className="space-y-3">
            <form onSubmit={handleValidateCoupon} className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Enter Promo Code (e.g. WELCOME10, LUNCH5, VIP20)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value.toUpperCase())
                    setCouponError(null)
                    setValidCouponInfo(null)
                  }}
                  placeholder="PROMO CODE"
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-amber-400 uppercase focus:outline-none focus:border-amber-500"
                />
                <button
                  type="submit"
                  disabled={validating}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                >
                  {validating ? 'Checking...' : 'Check'}
                </button>
              </div>
            </form>

            {couponError && (
              <div className="p-2.5 bg-rose-950/80 border border-rose-800 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{couponError}</span>
              </div>
            )}

            {validCouponInfo && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-xl space-y-1.5 animate-in fade-in">
                <div className="flex items-center justify-between text-emerald-300 font-bold text-xs">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    {validCouponInfo.coupon.title}
                  </span>
                  <span className="font-mono text-emerald-400 font-black">
                    -${(validCouponInfo.discountCents / 100).toFixed(2)}
                  </span>
                </div>
                <p className="text-[11px] text-emerald-400/80">
                  Code: <strong className="font-mono">{validCouponInfo.coupon.code}</strong> • Type: {validCouponInfo.discountType}
                </p>
              </div>
            )}

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => onApply(0, '')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-rose-400 text-xs font-semibold"
              >
                Clear Discount
              </button>
              <button
                type="button"
                disabled={!validCouponInfo}
                onClick={handleApplyCoupon}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-40 transition-all cursor-pointer"
              >
                Apply Voucher
              </button>
            </div>
          </div>
        ) : tab === 'loyalty' ? (
          <div className="space-y-3 text-xs">
            {!customer ? (
              <p className="text-slate-400">Select a customer first to redeem points.</p>
            ) : (
              <>
                <p className="text-slate-300">
                  {customer.name} has <strong className="text-emerald-400">{customer.loyalty_points || 0}</strong> pts.
                  Min redeem {loyaltySettings?.loyaltyRedeemMin || 50}. Each point = ${((loyaltySettings?.loyaltyCentsPerPoint || 1) / 100).toFixed(2)}.
                </p>
                <input
                  type="number"
                  min={loyaltySettings?.loyaltyRedeemMin || 50}
                  max={customer.loyalty_points || 0}
                  value={redeemPts}
                  onChange={(e) => setRedeemPts(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const pts = parseInt(redeemPts, 10)
                    if (!pts) return
                    try {
                      await window.api.customers.adjustLoyalty({
                        customerId: customer.id,
                        pointsChanged: pts,
                        transactionType: 'REDEEM',
                        notes: 'POS redemption',
                      })
                      const cents = pts * (loyaltySettings?.loyaltyCentsPerPoint || 1)
                      onApply(cents, `Loyalty redeem ${pts} pts`, null, 'loyalty')
                    } catch (err) {
                      setCouponError(err.message)
                    }
                  }}
                  className="w-full py-2 rounded-lg bg-emerald-600 text-white font-bold"
                >
                  Redeem points
                </button>
              </>
            )}
          </div>
        ) : !canManualDiscount ? (
          <p className="text-xs text-amber-300 bg-amber-950/50 border border-amber-800 rounded-xl p-3">
            Manual override discounts require the <strong>pos:apply_discount</strong> permission. You can still apply a coupon code or loyalty points.
          </p>
        ) : (
          <form onSubmit={handleApplyManual} className="space-y-3">
            <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setDiscountType('percent')
                  setValue('10')
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  discountType === 'percent' ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Percentage (%)
              </button>
              <button
                type="button"
                onClick={() => {
                  setDiscountType('fixed')
                  setValue('5.00')
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  discountType === 'fixed' ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Fixed Amount ($)
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Discount Value {discountType === 'percent' ? '(%)' : '($)'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={discountType === 'percent' ? 100 : subtotalCents / 100}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono text-amber-400 font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Reason for Discount</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. VIP guest, apology for delay, staff discount"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
              <span className="text-slate-400">Total Deduction:</span>
              <span className="font-mono font-bold text-amber-400">
                -${(calculatedManualCents / 100).toFixed(2)}
              </span>
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => onApply(0, '')}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-rose-400 text-xs font-semibold"
              >
                Remove Discount
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold"
              >
                Apply Discount
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// SUB-COMPONENT: HELD ORDERS RECALL DRAWER
// ============================================================================
function HeldOrdersDrawer({ heldOrders, onClose, onRecall }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end">
      <div className="bg-slate-950 border-l border-slate-800 w-full max-w-md h-full flex flex-col p-6 shadow-2xl space-y-4 animate-slide-left">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-white text-base">Held Orders ({heldOrders.length})</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
          {heldOrders.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">No held orders found.</div>
          ) : (
            heldOrders.map((h) => (
              <div
                key={h.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2 hover:border-amber-500/60 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono font-bold text-sm text-white">{h.order_number}</span>
                    <div className="text-[11px] text-orange-400 uppercase font-semibold">
                      {h.order_type?.replace('_', ' ')}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-black text-sm text-emerald-400">
                      ${(h.total_cents / 100).toFixed(2)}
                    </span>
                    <div className="text-[10px] text-slate-500">{h.item_count} items</div>
                  </div>
                </div>

                <div className="text-xs text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60">
                  <span>{h.table_number ? `Table ${h.table_number}` : h.customer_name || 'Walk-in'}</span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(h.created_at).toLocaleTimeString()}
                  </span>
                </div>

                <button
                  onClick={() => onRecall(h)}
                  className="w-full py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  Recall into Cart
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function ComboChoiceModal({ combo, groups, onClose, onConfirm }) {
  const groupNames = Object.keys(groups || {})
  const [picks, setPicks] = useState(() => {
    const initial = {}
    for (const name of groupNames) {
      initial[name] = groups[name][0]?.id || ''
    }
    return initial
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="font-bold text-white text-base">{combo.name}</h3>
            <p className="text-[11px] text-slate-400">Choose one option in each group</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        {groupNames.map((name) => (
          <div key={name} className="space-y-1.5">
            <label className="text-xs font-bold text-amber-300 uppercase">{name}</label>
            <select
              value={picks[name] || ''}
              onChange={(e) => setPicks((prev) => ({ ...prev, [name]: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
            >
              {groups[name].map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.product_name}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
          <button type="button" onClick={onClose} className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const chosen = groupNames
                .map((name) => groups[name].find((opt) => opt.id === picks[name]))
                .filter(Boolean)
              onConfirm(chosen)
            }}
            className="px-4 py-1.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold"
          >
            Add Combo
          </button>
        </div>
      </div>
    </div>
  )
}
