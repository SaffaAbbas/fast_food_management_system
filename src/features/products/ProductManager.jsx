import React, { useState, useEffect } from 'react'
import {
  Package,
  Plus,
  Edit,
  Trash2,
  Tag,
  Layers,
  Check,
  X,
  Search,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  AlertCircle,
  Eye,
  EyeOff,
  PlusCircle,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  DollarSign,
  Clock,
  ShieldAlert,
  FolderPlus,
  RefreshCw,
  Utensils,
  Percent,
  ListPlus,
  Flame,
  LayoutGrid,
  Table as TableIcon,
  Star,
  Calendar,
  Monitor,
  Globe
} from 'lucide-react'

export default function ProductManager({ onCatalogUpdated }) {
  // Navigation & Sub-views
  const [activeTab, setActiveTab] = useState('products') // 'products' | 'categories' | 'combos'
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'table'

  // Data states
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [combos, setCombos] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [availabilityFilter, setAvailabilityFilter] = useState('all') // 'all' | 'available' | 'unavailable'
  const [featuredOnly, setFeaturedOnly] = useState(false)

  // Notification / Alert banner
  const [notification, setNotification] = useState(null)

  // Modals
  const [isProductModalOpen, setIsProductModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null) // null for create, object for edit

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)

  const [isComboModalOpen, setIsComboModalOpen] = useState(false)
  const [editingCombo, setEditingCombo] = useState(null)

  const [archiveConfirm, setArchiveConfirm] = useState(null) // { type: 'product'|'category'|'combo', item }

  // Load All Data
  const loadCatalogData = async () => {
    setLoading(true)
    try {
      if (window.api?.product) {
        const [cats, prods, cmbs] = await Promise.all([
          window.api.product.getCategories(),
          window.api.product.getProducts({
            categoryId: selectedCategoryId || null,
            searchQuery: searchQuery || '',
            includeInactive: false
          }),
          window.api.product.getCombos()
        ])
        setCategories(cats || [])
        setProducts(prods || [])
        setCombos(cmbs || [])
      }
    } catch (err) {
      console.error('Failed to load catalog data:', err)
      showNotification('error', `Failed to load catalog: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCatalogData()
  }, [selectedCategoryId, searchQuery])

  const showNotification = (type, message) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 4000)
  }

  // Quick Availability Toggle
  const handleToggleAvailability = async (product, e) => {
    e.stopPropagation()
    const nextState = !product.is_available
    try {
      if (window.api?.product?.toggleAvailability) {
        await window.api.product.toggleAvailability(product.id, nextState)
        setProducts((prev) =>
          prev.map((p) => (p.id === product.id ? { ...p, is_available: nextState ? 1 : 0 } : p))
        )
        showNotification(
          'success',
          `"${product.name}" marked as ${nextState ? 'Available' : 'Unavailable'}`
        )
        if (onCatalogUpdated) onCatalogUpdated()
      }
    } catch (err) {
      showNotification('error', `Toggle failed: ${err.message}`)
    }
  }

  // Quick Combo Availability Toggle
  const handleToggleComboAvailability = async (combo, e) => {
    e.stopPropagation()
    const nextState = !combo.is_available
    try {
      if (window.api?.product?.toggleComboAvailability) {
        await window.api.product.toggleComboAvailability(combo.id, nextState)
        setCombos((prev) =>
          prev.map((c) => (c.id === combo.id ? { ...c, is_available: nextState ? 1 : 0 } : c))
        )
        showNotification(
          'success',
          `Combo "${combo.name}" marked as ${nextState ? 'Available' : 'Unavailable'}`
        )
        if (onCatalogUpdated) onCatalogUpdated()
      }
    } catch (err) {
      showNotification('error', `Combo toggle failed: ${err.message}`)
    }
  }


  // Open Edit Product Modal
  const handleOpenEditProduct = async (product) => {
    try {
      if (window.api?.product?.getProductDetails) {
        const fullDetails = await window.api.product.getProductDetails(product.id)
        setEditingProduct(fullDetails || product)
      } else {
        setEditingProduct(product)
      }
      setIsProductModalOpen(true)
    } catch (err) {
      showNotification('error', `Could not fetch product details: ${err.message}`)
    }
  }

  // Confirm Archive Action
  const handleExecuteArchive = async () => {
    if (!archiveConfirm) return
    const { type, item } = archiveConfirm
    try {
      if (type === 'product') {
        await window.api.product.archiveProduct(item.id)
        showNotification('success', `Product "${item.name}" archived successfully`)
      } else if (type === 'category') {
        await window.api.product.deleteCategory(item.id)
        showNotification('success', `Category "${item.name}" archived successfully`)
      } else if (type === 'combo') {
        await window.api.product.archiveCombo(item.id)
        showNotification('success', `Combo deal "${item.name}" archived successfully`)
      }
      setArchiveConfirm(null)
      loadCatalogData()
      if (onCatalogUpdated) onCatalogUpdated()
    } catch (err) {
      showNotification('error', `Archive failed: ${err.message}`)
      setArchiveConfirm(null)
    }
  }

  // Filter products by availability and featured flag
  const filteredProducts = products.filter((p) => {
    if (availabilityFilter === 'available' && p.is_available !== 1) return false
    if (availabilityFilter === 'unavailable' && p.is_available !== 0) return false
    if (featuredOnly && p.is_featured !== 1) return false
    return true
  })

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-orange-600/10 border border-orange-500/20 rounded-lg text-orange-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Menu & Catalog Management
                <span className="text-[10px] font-mono bg-orange-950 text-orange-300 border border-orange-800/60 px-2 py-0.5 rounded-full">
                  Phase 4 Production Complete
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Dishes, multi-level categories, channel pricing (Dine-in/Takeaway/Delivery), portion sizes, modifier groups, and combo deals.
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setEditingProduct(null)
              setIsProductModalOpen(true)
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold shadow-md shadow-orange-950 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> New Product
          </button>
          <button
            onClick={() => {
              setEditingCategory(null)
              setIsCategoryModalOpen(true)
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
          >
            <FolderPlus className="w-3.5 h-3.5 text-orange-400" /> New Category
          </button>
          <button
            onClick={() => setIsComboModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> New Combo
          </button>
          <button
            onClick={loadCatalogData}
            title="Refresh Catalog Data"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-orange-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notification Toast Banner */}
      {notification && (
        <div
          className={`p-3 rounded-lg flex items-center justify-between text-xs font-medium transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-200'
              : 'bg-rose-950/80 border border-rose-800 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            )}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('products')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'products'
                ? 'bg-orange-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            Products & Menu Items
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-black/30 font-mono">
              {products.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('categories')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'categories'
                ? 'bg-orange-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            Categories & Subcategories
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-black/30 font-mono">
              {categories.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('combos')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'combos'
                ? 'bg-orange-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Deals & Combos
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-black/30 font-mono">
              {combos.length}
            </span>
          </button>
        </div>

        {activeTab === 'products' && (
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              title="Grid View"
              className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'grid' ? 'bg-slate-800 text-orange-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Table View"
              className={`p-1.5 rounded text-xs transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-slate-800 text-orange-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PRODUCTS LIST & MANAGEMENT */}
      {/* ========================================================================= */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          {/* Filter & Search Bar */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search menu items by Name, SKU, or Barcode..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
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

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              <button
                onClick={() => setSelectedCategoryId('')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  selectedCategoryId === ''
                    ? 'bg-orange-600 text-white'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                All Categories ({products.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCategoryId === cat.id
                      ? 'bg-orange-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {cat.name} {cat.product_count !== undefined && `(${cat.product_count})`}
                </button>
              ))}
            </div>

            {/* Availability Filter & Featured Toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFeaturedOnly(!featuredOnly)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                  featuredOnly
                    ? 'bg-amber-950 text-amber-300 border-amber-700'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${featuredOnly ? 'fill-amber-400 text-amber-400' : ''}`} />
                Featured
              </button>

              <select
                value={availabilityFilter}
                onChange={(e) => setAvailabilityFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-500 cursor-pointer"
              >
                <option value="all">Status: All Items</option>
                <option value="available">Status: Available Only</option>
                <option value="unavailable">Status: Unavailable Only</option>
              </select>
            </div>
          </div>

          {/* Products Content */}
          {filteredProducts.length === 0 ? (
            <div className="bg-slate-950/50 border border-slate-800 border-dashed rounded-xl p-12 text-center">
              <Package className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-white">No products found</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                {searchQuery || selectedCategoryId || availabilityFilter !== 'all' || featuredOnly
                  ? 'No menu items match your active search or filter criteria. Try clearing filters.'
                  : 'Get started by creating your first menu item or category.'}
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setSelectedCategoryId('')
                    setAvailabilityFilter('all')
                    setFeaturedOnly(false)
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700"
                >
                  Clear Filters
                </button>
                <button
                  onClick={() => {
                    setEditingProduct(null)
                    setIsProductModalOpen(true)
                  }}
                  className="px-3 py-1.5 rounded-lg bg-orange-600 text-white text-xs font-semibold hover:bg-orange-500"
                >
                  Add Product
                </button>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            /* Grid View */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredProducts.map((p) => {
                const isAvailable = p.is_available === 1
                const hasChannelPrices = p.price_dine_in_cents || p.price_takeaway_cents || p.price_delivery_cents

                return (
                  <div
                    key={p.id}
                    className={`bg-slate-950/70 border rounded-xl p-4 flex flex-col justify-between transition-all hover:border-slate-700 group relative ${
                      isAvailable ? 'border-slate-800' : 'border-slate-800/60 opacity-80'
                    }`}
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded bg-slate-900 text-orange-400 border border-slate-800">
                            {p.category_name}
                          </span>
                          {p.is_featured === 1 && (
                            <span className="text-[10px] bg-amber-950/70 text-amber-300 border border-amber-800/80 px-1.5 py-0.5 rounded flex items-center gap-1 font-bold">
                              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" /> Best Seller
                            </span>
                          )}
                        </div>

                        {/* Availability Pill Toggle */}
                        <button
                          onClick={(e) => handleToggleAvailability(p, e)}
                          title={`Click to mark ${isAvailable ? 'Unavailable' : 'Available'}`}
                          className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                            isAvailable
                              ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/80 hover:bg-emerald-900'
                              : 'bg-rose-950/70 text-rose-300 border-rose-800/80 hover:bg-rose-900'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isAvailable ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                            }`}
                          />
                          {isAvailable ? 'Available' : 'Unavailable'}
                        </button>
                      </div>

                      {/* Product Name & SKU */}
                      <h4 className="text-sm font-bold text-white group-hover:text-orange-400 transition-colors line-clamp-1">
                        {p.name}
                      </h4>
                      <div className="text-[11px] font-mono text-slate-500 mt-0.5 flex items-center gap-2">
                        <span>SKU: {p.sku || 'N/A'}</span>
                        {p.barcode && <span className="text-slate-600">| Barcode: {p.barcode}</span>}
                      </div>

                      {p.description && (
                        <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                          {p.description}
                        </p>
                      )}

                      {/* Attributes Badges (Variations, Prep Time, Tax, Min/Max) */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-3">
                        {p.has_variations === 1 && (
                          <span className="text-[10px] bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <Layers className="w-3 h-3" /> Multi-Sizes
                          </span>
                        )}
                        <span className="text-[10px] bg-slate-900 text-slate-400 border border-slate-800 px-1.5 py-0.5 rounded flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {p.preparation_time_minutes || 15}m
                        </span>
                        {p.tax_percentage > 0 && (
                          <span className="text-[10px] bg-slate-900 text-slate-400 border border-slate-800 px-1.5 py-0.5 rounded flex items-center gap-1 font-mono">
                            <Percent className="w-2.5 h-2.5 text-slate-500" />
                            {p.tax_percentage}%
                          </span>
                        )}
                        {hasChannelPrices && (
                          <span className="text-[10px] bg-cyan-950/60 text-cyan-300 border border-cyan-800/60 px-1.5 py-0.5 rounded">
                            Channel Rates
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom Price & Actions */}
                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase font-medium">Selling Price</div>
                        <div className="text-base font-extrabold text-white font-mono flex items-center text-emerald-400">
                          ${(p.base_price_cents / 100).toFixed(2)}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditProduct(p)}
                          title="Edit Product"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setArchiveConfirm({ type: 'product', item: p })}
                          title="Archive Product"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-800 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* Table View */
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900 border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="py-3 px-4">Item & Category</th>
                    <th className="py-3 px-4">SKU / Barcode</th>
                    <th className="py-3 px-4">Base Price</th>
                    <th className="py-3 px-4">Channel Rates</th>
                    <th className="py-3 px-4">Prep Time</th>
                    <th className="py-3 px-4">Variations</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {filteredProducts.map((p) => {
                    const isAvailable = p.is_available === 1
                    return (
                      <tr key={p.id} className="hover:bg-slate-900/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white text-sm">{p.name}</span>
                            {p.is_featured === 1 && (
                              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                            )}
                          </div>
                          <div className="text-[11px] text-orange-400/90">{p.category_name}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                          <div>{p.sku || '—'}</div>
                          {p.barcode && <div className="text-[10px] text-slate-500">{p.barcode}</div>}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-emerald-400 text-sm">
                          ${(p.base_price_cents / 100).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                          {p.price_dine_in_cents || p.price_takeaway_cents || p.price_delivery_cents ? (
                            <div className="space-y-0.5 text-[10px]">
                              {p.price_dine_in_cents && <div>Dine: ${(p.price_dine_in_cents / 100).toFixed(2)}</div>}
                              {p.price_takeaway_cents && <div>Takeaway: ${(p.price_takeaway_cents / 100).toFixed(2)}</div>}
                              {p.price_delivery_cents && <div>Delivery: ${(p.price_delivery_cents / 100).toFixed(2)}</div>}
                            </div>
                          ) : (
                            <span className="text-slate-600">Standard</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-300">
                          {p.preparation_time_minutes || 15} mins
                        </td>
                        <td className="py-3 px-4">
                          {p.has_variations === 1 ? (
                            <span className="text-[10px] bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 px-2 py-0.5 rounded font-medium">
                              Configured
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-600">Standard</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={(e) => handleToggleAvailability(p, e)}
                            className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border cursor-pointer ${
                              isAvailable
                                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/80'
                                : 'bg-rose-950/70 text-rose-300 border-rose-800/80'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isAvailable ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                              }`}
                            />
                            {isAvailable ? 'Available' : 'Unavailable'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEditProduct(p)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setArchiveConfirm({ type: 'product', item: p })}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CATEGORIES MANAGEMENT */}
      {/* ========================================================================= */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Categories structure your POS menu, kitchen tickets, and online ordering. Subcategories provide granular hierarchy.
            </p>
            <button
              onClick={() => {
                setEditingCategory(null)
                setIsCategoryModalOpen(true)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Category
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat) => {
              const parentCat = categories.find((c) => c.id === cat.parent_id)
              return (
                <div
                  key={cat.id}
                  className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex items-center justify-between hover:border-slate-700 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-orange-400 font-bold text-sm">
                      {cat.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-bold text-sm text-white">{cat.name}</h4>
                        {parentCat && (
                          <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded border border-slate-700">
                            Sub of {parentCat.name}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5 font-mono">
                        <span>Code: {cat.code || 'None'}</span>
                        <span>•</span>
                        <span>Order: {cat.display_order}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[11px] text-emerald-400 font-medium">
                          {cat.product_count || 0} Products
                        </span>
                        <div className="flex items-center gap-1 text-[10px] text-slate-500">
                          {cat.is_visible_pos !== 0 && (
                            <span className="flex items-center gap-0.5 text-slate-400" title="Visible on POS">
                              <Monitor className="w-3 h-3 text-orange-400" /> POS
                            </span>
                          )}
                          {cat.is_visible_online !== 0 && (
                            <span className="flex items-center gap-0.5 text-slate-400" title="Visible Online/QR">
                              <Globe className="w-3 h-3 text-cyan-400" /> Web
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingCategory(cat)
                        setIsCategoryModalOpen(true)
                      }}
                      title="Edit Category"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setArchiveConfirm({ type: 'category', item: cat })}
                      title="Archive Category"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: COMBOS & MEAL DEALS */}
      {/* ========================================================================= */}
      {activeTab === 'combos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Combos allow bundling multiple food and beverage products under one discounted set price with availability scheduling.
            </p>
            <button
              onClick={() => {
                setEditingCombo(null)
                setIsComboModalOpen(true)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> Create Combo Deal
            </button>
          </div>

          {combos.length === 0 ? (
            <div className="bg-slate-950/50 border border-slate-800 border-dashed rounded-xl p-10 text-center">
              <Sparkles className="w-8 h-8 text-amber-500/50 mx-auto mb-2" />
              <h4 className="text-sm font-semibold text-white">No Combo Deals Configured</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Create value meal sets (e.g., Burger + Fries + Beverage) with custom bundle pricing.
              </p>
              <button
                onClick={() => {
                  setEditingCombo(null)
                  setIsComboModalOpen(true)
                }}
                className="mt-4 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold"
              >
                Create First Combo
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {combos.map((combo) => {
                const totalItemValueCents =
                  combo.items?.reduce(
                    (acc, it) => acc + (it.base_price_cents || 0) * (it.quantity || 1),
                    0
                  ) || 0
                const savingsCents = Math.max(0, totalItemValueCents - combo.price_cents)
                const isAvailable = combo.is_available === 1

                return (
                  <div
                    key={combo.id}
                    className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition-all"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] font-mono bg-amber-950/60 text-amber-300 border border-amber-800/60 px-2 py-0.5 rounded font-semibold uppercase">
                          {combo.code || 'COMBO'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {savingsCents > 0 && (
                            <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full font-bold">
                              Save ${(savingsCents / 100).toFixed(2)}
                            </span>
                          )}
                          <button
                            onClick={(e) => handleToggleComboAvailability(combo, e)}
                            className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border cursor-pointer ${
                              isAvailable
                                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/80'
                                : 'bg-rose-950/70 text-rose-300 border-rose-800/80'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isAvailable ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                              }`}
                            />
                            {isAvailable ? 'Active' : 'Paused'}
                          </button>
                        </div>
                      </div>

                      <h4 className="text-sm font-bold text-white mt-2">{combo.name}</h4>
                      {combo.description && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{combo.description}</p>
                      )}

                      {/* Active Scheduling Indicator */}
                      {(combo.available_from || combo.available_to) && (
                        <div className="mt-2 text-[10px] text-amber-400/90 flex items-center gap-1 font-mono">
                          <Calendar className="w-3 h-3" />
                          <span>
                            {combo.available_from || 'Always'} — {combo.available_to || 'Ongoing'}
                          </span>
                        </div>
                      )}

                      {/* Bundled Items List */}
                      <div className="mt-3 bg-slate-900/60 border border-slate-800/80 rounded-lg p-2.5 space-y-1.5">
                        <div className="text-[10px] uppercase font-bold text-slate-500">Includes Items:</div>
                        {combo.items?.map((it, idx) => (
                          <div key={idx} className="text-xs text-slate-300 flex justify-between items-center">
                            <span className="flex items-center gap-1.5 truncate">
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                              <span className="font-semibold text-white">{it.quantity}x</span> {it.product_name}
                            </span>
                            <span className="font-mono text-slate-400 text-[11px]">
                              ${((it.base_price_cents * it.quantity) / 100).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase font-medium">Combo Price</div>
                        <div className="text-base font-extrabold text-amber-400 font-mono">
                          ${(combo.price_cents / 100).toFixed(2)}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setEditingCombo(combo)
                            setIsComboModalOpen(true)
                          }}
                          title="Edit Combo"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setArchiveConfirm({ type: 'combo', item: combo })}
                          title="Archive Combo"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE / EDIT PRODUCT */}
      {/* ========================================================================= */}
      {isProductModalOpen && (
        <ProductFormModal
          product={editingProduct}
          categories={categories}
          onClose={() => {
            setIsProductModalOpen(false)
            setEditingProduct(null)
          }}
          onSaved={(savedProduct) => {
            setIsProductModalOpen(false)
            setEditingProduct(null)
            showNotification(
              'success',
              editingProduct
                ? `Updated "${savedProduct.name}" successfully`
                : `Created "${savedProduct.name}" successfully`
            )
            loadCatalogData()
            if (onCatalogUpdated) onCatalogUpdated()
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE / EDIT CATEGORY */}
      {/* ========================================================================= */}
      {isCategoryModalOpen && (
        <CategoryFormModal
          category={editingCategory}
          categories={categories}
          onClose={() => {
            setIsCategoryModalOpen(false)
            setEditingCategory(null)
          }}
          onSaved={() => {
            setIsCategoryModalOpen(false)
            setEditingCategory(null)
            showNotification(
              'success',
              editingCategory ? 'Category updated successfully' : 'Category created successfully'
            )
            loadCatalogData()
            if (onCatalogUpdated) onCatalogUpdated()
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE COMBO DEAL */}
      {/* ========================================================================= */}
      {isComboModalOpen && (
        <ComboFormModal
          combo={editingCombo}
          products={products}
          onClose={() => {
            setIsComboModalOpen(false)
            setEditingCombo(null)
          }}
          onSaved={() => {
            setIsComboModalOpen(false)
            setEditingCombo(null)
            showNotification(
              'success',
              editingCombo ? 'Combo deal updated successfully' : 'Combo deal created successfully'
            )
            loadCatalogData()
            if (onCatalogUpdated) onCatalogUpdated()
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* ARCHIVE CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {archiveConfirm && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2 rounded-lg bg-rose-950 border border-rose-800">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-white text-base">
                Confirm Archival: {archiveConfirm.item?.name}
              </h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This action will safely archive the{' '}
              <strong className="text-white">{archiveConfirm.type}</strong>. It will be hidden from
              active menu selections, but{' '}
              <span className="text-emerald-400 font-semibold">
                all past sales and financial audit reports will remain 100% intact.
              </span>
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setArchiveConfirm(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteArchive}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-950"
              >
                Yes, Archive Safely
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// SUB-COMPONENT: PRODUCT FORM MODAL (Section 6.2 & 6.3)
// ============================================================================
function ProductFormModal({ product, categories, onClose, onSaved }) {
  const isEdit = Boolean(product?.id)

  const [formTab, setFormTab] = useState('general') // 'general' | 'pricing' | 'variations' | 'modifiers'
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Form Fields
  const [name, setName] = useState(product?.name || '')
  const [categoryId, setCategoryId] = useState(product?.category_id || categories[0]?.id || '')
  const [sku, setSku] = useState(product?.sku || '')
  const [barcode, setBarcode] = useState(product?.barcode || '')
  const [description, setDescription] = useState(product?.description || '')
  const [prepTime, setPrepTime] = useState(product?.preparation_time_minutes || 15)
  const [taxPercentage, setTaxPercentage] = useState(product?.tax_percentage || 5.0)
  const [trackInventory, setTrackInventory] = useState(Boolean(product?.track_inventory))
  const [isAvailable, setIsAvailable] = useState(
    product ? Boolean(product.is_available) : true
  )

  // Section 6.2 Flags & Constraints
  const [isFeatured, setIsFeatured] = useState(Boolean(product?.is_featured))
  const [isDiscountEligible, setIsDiscountEligible] = useState(
    product?.is_discount_eligible !== undefined ? Boolean(product.is_discount_eligible) : true
  )
  const [minOrderQty, setMinOrderQty] = useState(product?.min_order_qty || 1)
  const [maxOrderQty, setMaxOrderQty] = useState(product?.max_order_qty || 99)

  // Pricing
  const [basePrice, setBasePrice] = useState(
    product?.base_price_cents !== undefined ? (product.base_price_cents / 100).toFixed(2) : '10.00'
  )
  const [costPrice, setCostPrice] = useState(
    product?.cost_price_cents !== undefined ? (product.cost_price_cents / 100).toFixed(2) : '4.50'
  )

  // Section 6.2 Order-Type Custom Pricing
  const [hasChannelPricing, setHasChannelPricing] = useState(
    Boolean(product?.price_dine_in_cents || product?.price_takeaway_cents || product?.price_delivery_cents)
  )
  const [priceDineIn, setPriceDineIn] = useState(
    product?.price_dine_in_cents ? (product.price_dine_in_cents / 100).toFixed(2) : ''
  )
  const [priceTakeaway, setPriceTakeaway] = useState(
    product?.price_takeaway_cents ? (product.price_takeaway_cents / 100).toFixed(2) : ''
  )
  const [priceDelivery, setPriceDelivery] = useState(
    product?.price_delivery_cents ? (product.price_delivery_cents / 100).toFixed(2) : ''
  )

  // Variations (Sizes)
  const [hasVariations, setHasVariations] = useState(Boolean(product?.has_variations))
  const [variations, setVariations] = useState(
    product?.variations?.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku || '',
      price: (v.price_cents / 100).toFixed(2),
      cost: (v.cost_cents / 100).toFixed(2),
      isDefault: Boolean(v.is_default)
    })) || [
      { name: 'Regular Portion', sku: '', price: basePrice, cost: costPrice, isDefault: true },
      { name: 'Large Portion', sku: '', price: (parseFloat(basePrice || 0) * 1.35).toFixed(2), cost: costPrice, isDefault: false }
    ]
  )

  // Modifier Groups
  const [modifierGroups, setModifierGroups] = useState(
    product?.modifierGroups?.map((g) => ({
      id: g.id,
      name: g.name,
      isRequired: Boolean(g.is_required),
      minSelection: g.min_selection || 0,
      maxSelection: g.max_selection || 1,
      modifiers: g.modifiers?.map((m) => ({
        id: m.id,
        name: m.name,
        price: (m.price_cents / 100).toFixed(2)
      })) || []
    })) || []
  )

  // Variation Handlers
  const addVariationRow = () => {
    setVariations((prev) => [
      ...prev,
      {
        name: `Size ${prev.length + 1}`,
        sku: '',
        price: basePrice,
        cost: costPrice,
        isDefault: false
      }
    ])
  }

  const removeVariationRow = (index) => {
    setVariations((prev) => prev.filter((_, i) => i !== index))
  }

  const updateVariationRow = (index, field, value) => {
    setVariations((prev) =>
      prev.map((v, i) => {
        if (i === index) {
          if (field === 'isDefault') {
            return { ...v, isDefault: true }
          }
          return { ...v, [field]: value }
        }
        if (field === 'isDefault') {
          return { ...v, isDefault: false }
        }
        return v
      })
    )
  }

  // Modifier Group Handlers
  const addModifierGroup = () => {
    setModifierGroups((prev) => [
      ...prev,
      {
        name: 'New Option Group',
        isRequired: false,
        minSelection: 0,
        maxSelection: 1,
        modifiers: [
          { name: 'Extra Cheese', price: '1.50' },
          { name: 'Extra Sauce', price: '0.75' }
        ]
      }
    ])
  }

  const removeModifierGroup = (index) => {
    setModifierGroups((prev) => prev.filter((_, i) => i !== index))
  }

  const addModifierToGroup = (groupIndex) => {
    setModifierGroups((prev) =>
      prev.map((g, gi) => {
        if (gi === groupIndex) {
          return {
            ...g,
            modifiers: [...g.modifiers, { name: 'Add-on', price: '1.00' }]
          }
        }
        return g
      })
    )
  }

  const removeModifierFromGroup = (groupIndex, modIndex) => {
    setModifierGroups((prev) =>
      prev.map((g, gi) => {
        if (gi === groupIndex) {
          return {
            ...g,
            modifiers: g.modifiers.filter((_, mi) => mi !== modIndex)
          }
        }
        return g
      })
    )
  }

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')

    if (!name.trim()) {
      setErrorMsg('Product name is required.')
      return
    }
    if (!categoryId) {
      setErrorMsg('Please select a valid category.')
      return
    }
    const baseCents = Math.round(parseFloat(basePrice || 0) * 100)
    if (isNaN(baseCents) || baseCents < 0) {
      setErrorMsg('Please enter a valid base price.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        categoryId,
        sku: sku.trim() || undefined,
        barcode: barcode.trim() || undefined,
        description: description.trim() || undefined,
        basePriceCents: baseCents,
        costPriceCents: Math.round(parseFloat(costPrice || 0) * 100),
        taxPercentage: parseFloat(taxPercentage) || 0.0,
        preparationTimeMinutes: parseInt(prepTime) || 15,
        isAvailable,
        trackInventory,
        isFeatured,
        isDiscountEligible,
        minOrderQty: parseInt(minOrderQty) || 1,
        maxOrderQty: parseInt(maxOrderQty) || 99,
        priceDineInCents: hasChannelPricing && priceDineIn ? Math.round(parseFloat(priceDineIn) * 100) : null,
        priceTakeawayCents: hasChannelPricing && priceTakeaway ? Math.round(parseFloat(priceTakeaway) * 100) : null,
        priceDeliveryCents: hasChannelPricing && priceDelivery ? Math.round(parseFloat(priceDelivery) * 100) : null,
        variations: hasVariations
          ? variations.map((v) => ({
              id: v.id,
              name: v.name.trim(),
              sku: v.sku.trim() || undefined,
              priceCents: Math.round(parseFloat(v.price || 0) * 100),
              costCents: Math.round(parseFloat(v.cost || 0) * 100),
              isDefault: v.isDefault
            }))
          : [],
        modifierGroups: modifierGroups.map((mg) => ({
          id: mg.id,
          name: mg.name.trim(),
          isRequired: mg.isRequired,
          minSelection: parseInt(mg.minSelection) || 0,
          maxSelection: parseInt(mg.maxSelection) || 1,
          modifiers: mg.modifiers.map((m) => ({
            id: m.id,
            name: m.name.trim(),
            priceCents: Math.round(parseFloat(m.price || 0) * 100)
          }))
        }))
      }

      let res
      if (isEdit) {
        res = await window.api.product.updateProduct({ id: product.id, ...payload })
      } else {
        res = await window.api.product.createProduct(payload)
      }

      onSaved(res)
    } catch (err) {
      console.error('Failed to save product:', err)
      setErrorMsg(err.message || 'Error saving product')
    } finally {
      setSaving(false)
    }
  }

  // Calculate profit margin
  const sellVal = parseFloat(basePrice || 0)
  const costVal = parseFloat(costPrice || 0)
  const marginPercent = sellVal > 0 ? (((sellVal - costVal) / sellVal) * 100).toFixed(1) : 0

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-orange-600/10 border border-orange-500/20 rounded-lg text-orange-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isEdit ? `Edit Product: ${product.name}` : 'Create New Menu Product'}
              </h3>
              <p className="text-xs text-slate-400">
                Configure dish specifications, portion sizes, prices, channel pricing, and add-on modifier groups.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Tabs Bar */}
        <div className="px-6 pt-3 border-b border-slate-800 flex items-center gap-2 bg-slate-900/60 flex-shrink-0">
          <button
            type="button"
            onClick={() => setFormTab('general')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              formTab === 'general'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            General Details
          </button>
          <button
            type="button"
            onClick={() => setFormTab('pricing')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              formTab === 'pricing'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Pricing & Taxes
          </button>
          <button
            type="button"
            onClick={() => setFormTab('variations')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              formTab === 'variations'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Sizes & Variations {hasVariations && `(${variations.length})`}
          </button>
          <button
            type="button"
            onClick={() => setFormTab('modifiers')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              formTab === 'modifiers'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListPlus className="w-3.5 h-3.5" />
            Add-ons / Modifiers ({modifierGroups.length})
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* TAB 1: GENERAL */}
          {formTab === 'general' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Product / Dish Name <span className="text-orange-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Classic Truffle Burger"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Category <span className="text-orange-400">*</span>
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">SKU / Item Code</label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="Auto-generated if left blank"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Barcode (Optional)</label>
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="e.g. 8901234567890"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ingredients, recipe details, allergen warning, etc."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Preparation Time (Minutes)
                  </label>
                  <div className="relative">
                    <Clock className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      min="1"
                      max="180"
                      value={prepTime}
                      onChange={(e) => setPrepTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Min Order Qty
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={minOrderQty}
                    onChange={(e) => setMinOrderQty(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Max Order Qty
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={maxOrderQty}
                    onChange={(e) => setMaxOrderQty(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Section 6.2 Flags & Options */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    onChange={(e) => setIsFeatured(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0"
                  />
                  <span className="text-xs text-amber-300 font-semibold flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> Mark as Featured / Best Seller
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDiscountEligible}
                    onChange={(e) => setIsDiscountEligible(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-800 text-orange-600 focus:ring-0"
                  />
                  <span className="text-xs text-slate-300 font-medium">
                    Eligible for Order & Item Discounts
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAvailable}
                    onChange={(e) => setIsAvailable(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-800 text-emerald-600 focus:ring-0"
                  />
                  <span className="text-xs text-slate-300 font-medium">Available for Sale Now</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={trackInventory}
                    onChange={(e) => setTrackInventory(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-800 text-orange-600 focus:ring-0"
                  />
                  <span className="text-xs text-slate-300 font-medium">
                    Track Recipe / Stock Inventory (Phase 7)
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* TAB 2: PRICING & TAX */}
          {formTab === 'pricing' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Base Selling Price ($) <span className="text-orange-400">*</span>
                  </label>
                  <div className="relative">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={basePrice}
                      onChange={(e) => setBasePrice(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-emerald-400 font-mono font-bold focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Cost Price ($) (Estimated Raw Ingredients)
                  </label>
                  <div className="relative">
                    <DollarSign className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-300 font-mono focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>
              </div>

              {/* Profit Margin KPI Pill */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 font-medium">Estimated Gross Margin:</span>
                  <div className="text-sm font-mono font-bold text-white mt-0.5">
                    ${(sellVal - costVal).toFixed(2)} per unit
                  </div>
                </div>
                <div
                  className={`px-3 py-1 rounded-full text-xs font-bold font-mono ${
                    marginPercent > 50
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : marginPercent > 20
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : 'bg-rose-950 text-rose-300 border border-rose-800'
                  }`}
                >
                  {marginPercent}% Margin
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  VAT / Sales Tax Percentage (%)
                </label>
                <div className="relative w-48">
                  <Percent className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={taxPercentage}
                    onChange={(e) => setTaxPercentage(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Section 6.2 Order-Type Custom Pricing Overrides */}
              <div className="border border-slate-800 rounded-xl p-4 bg-slate-900/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white">Order Channel Pricing (Section 6.2)</h4>
                    <p className="text-[11px] text-slate-400">
                      Optional custom prices for Dine-In, Takeaway, and Delivery orders. Leave blank to use Base Price.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasChannelPricing}
                      onChange={(e) => setHasChannelPricing(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-800 text-orange-600 focus:ring-0"
                    />
                    <span className="text-xs text-orange-400 font-semibold">Enable Channel Rates</span>
                  </label>
                </div>

                {hasChannelPricing && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Dine-In Price ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={basePrice}
                        value={priceDineIn}
                        onChange={(e) => setPriceDineIn(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Takeaway Price ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={basePrice}
                        value={priceTakeaway}
                        onChange={(e) => setPriceTakeaway(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">Delivery Price ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder={basePrice}
                        value={priceDelivery}
                        onChange={(e) => setPriceDelivery(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: VARIATIONS (SIZES) */}
          {formTab === 'variations' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800 p-3 rounded-xl">
                <div>
                  <h4 className="text-xs font-bold text-white">Enable Multi-Size Variations</h4>
                  <p className="text-[11px] text-slate-400">
                    Activate if this product has multiple sizes (e.g. Regular, Large, Family) with distinct prices.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasVariations}
                    onChange={(e) => setHasVariations(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
                </label>
              </div>

              {hasVariations && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Portion Sizes & Pricing
                    </span>
                    <button
                      type="button"
                      onClick={addVariationRow}
                      className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 font-semibold cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Size Option
                    </button>
                  </div>

                  <div className="space-y-2">
                    {variations.map((v, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs"
                      >
                        <div className="flex-1">
                          <input
                            type="text"
                            placeholder="Size Name (e.g. Small, 12-inch)"
                            value={v.name}
                            onChange={(e) => updateVariationRow(idx, 'name', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white"
                          />
                        </div>

                        <div className="w-24">
                          <input
                            type="text"
                            placeholder="SKU"
                            value={v.sku}
                            onChange={(e) => updateVariationRow(idx, 'sku', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono"
                          />
                        </div>

                        <div className="w-28 relative">
                          <DollarSign className="w-3 h-3 text-emerald-400 absolute left-2 top-1/2 -translate-y-1/2" />
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Price"
                            value={v.price}
                            onChange={(e) => updateVariationRow(idx, 'price', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded pl-6 pr-2 py-1 text-xs text-emerald-400 font-mono font-bold"
                          />
                        </div>

                        <label className="flex items-center gap-1.5 px-2 cursor-pointer text-slate-400 hover:text-white">
                          <input
                            type="radio"
                            name="default_variation"
                            checked={v.isDefault}
                            onChange={() => updateVariationRow(idx, 'isDefault', true)}
                            className="text-orange-600 focus:ring-0"
                          />
                          <span className="text-[10px]">Default</span>
                        </label>

                        {variations.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeVariationRow(idx)}
                            className="p-1 text-slate-500 hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: MODIFIERS & EXTRAS */}
          {formTab === 'modifiers' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">Add-on & Modifier Groups</h4>
                  <p className="text-[11px] text-slate-400">
                    Configure crusts, extra toppings, dressing sauces, and customer choices.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addModifierGroup}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> New Modifier Group
                </button>
              </div>

              {modifierGroups.length === 0 ? (
                <div className="border border-slate-800 border-dashed rounded-xl p-8 text-center text-xs text-slate-500">
                  No modifier groups linked to this product. Click "New Modifier Group" above to add choices.
                </div>
              ) : (
                <div className="space-y-4">
                  {modifierGroups.map((mg, gi) => (
                    <div
                      key={gi}
                      className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Group Name (e.g. Choose Crust, Extra Toppings)"
                            value={mg.name}
                            onChange={(e) =>
                              setModifierGroups((prev) =>
                                prev.map((g, i) => (i === gi ? { ...g, name: e.target.value } : g))
                              )
                            }
                            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-white font-bold w-1/2"
                          />

                          <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={mg.isRequired}
                              onChange={(e) =>
                                setModifierGroups((prev) =>
                                  prev.map((g, i) =>
                                    i === gi ? { ...g, isRequired: e.target.checked } : g
                                  )
                                )
                              }
                              className="rounded bg-slate-950 border-slate-800 text-orange-600 focus:ring-0"
                            />
                            Required Choice
                          </label>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeModifierGroup(gi)}
                          className="p-1 text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Items in this modifier group */}
                      <div className="pl-3 border-l-2 border-slate-800 space-y-2">
                        <div className="text-[10px] uppercase font-bold text-slate-400 flex justify-between items-center">
                          <span>Options in this group:</span>
                          <button
                            type="button"
                            onClick={() => addModifierToGroup(gi)}
                            className="text-orange-400 hover:text-orange-300 font-medium flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" /> Add Option
                          </button>
                        </div>

                        {mg.modifiers.map((m, mi) => (
                          <div key={mi} className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Option Name (e.g. Cheddar Cheese)"
                              value={m.name}
                              onChange={(e) =>
                                setModifierGroups((prev) =>
                                  prev.map((g, i) =>
                                    i === gi
                                      ? {
                                          ...g,
                                          modifiers: g.modifiers.map((mod, j) =>
                                            j === mi ? { ...mod, name: e.target.value } : mod
                                          )
                                        }
                                      : g
                                  )
                                )
                              }
                              className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                            />

                            <div className="w-28 relative">
                              <DollarSign className="w-3 h-3 text-emerald-400 absolute left-2 top-1/2 -translate-y-1/2" />
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="Extra $"
                                value={m.price}
                                onChange={(e) =>
                                  setModifierGroups((prev) =>
                                    prev.map((g, i) =>
                                      i === gi
                                      ? {
                                          ...g,
                                          modifiers: g.modifiers.map((mod, j) =>
                                            j === mi ? { ...mod, price: e.target.value } : mod
                                          )
                                        }
                                      : g
                                    )
                                  )
                                }
                                className="w-full bg-slate-950 border border-slate-800 rounded pl-6 pr-2 py-1 text-xs text-emerald-400 font-mono font-bold"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => removeModifierFromGroup(gi, mi)}
                              className="p-1 text-slate-500 hover:text-rose-400"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-lg shadow-orange-950 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" /> {isEdit ? 'Save Changes' : 'Create Product'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// SUB-COMPONENT: CATEGORY FORM MODAL (Section 6.1)
// ============================================================================
function CategoryFormModal({ category, categories = [], onClose, onSaved }) {
  const isEdit = Boolean(category?.id)
  const [name, setName] = useState(category?.name || '')
  const [code, setCode] = useState(category?.code || '')
  const [displayOrder, setDisplayOrder] = useState(category?.display_order || 0)
  const [parentId, setParentId] = useState(category?.parent_id || '')
  const [isVisiblePos, setIsVisiblePos] = useState(category?.is_visible_pos !== 0)
  const [isVisibleOnline, setIsVisibleOnline] = useState(category?.is_visible_online !== 0)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Filter out self from parent options to prevent cyclical hierarchy
  const availableParents = categories.filter((c) => !isEdit || c.id !== category.id)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setErrorMsg('Category name is required.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        code: code.trim() || undefined,
        displayOrder: parseInt(displayOrder) || 0,
        parentId: parentId || null,
        isVisiblePos,
        isVisibleOnline
      }

      if (isEdit) {
        await window.api.product.updateCategory({
          id: category.id,
          ...payload
        })
      } else {
        await window.api.product.createCategory(payload)
      }
      onSaved()
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save category')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-bold text-white text-sm">
            {isEdit ? `Edit Category: ${category.name}` : 'Create New Category'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-2.5 rounded bg-rose-950 border border-rose-800 text-rose-200 text-xs">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Category Name <span className="text-orange-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Handcrafted Pastas"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Category Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. PASTA"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Display Order</label>
              <input
                type="number"
                min="0"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Parent Category (Optional Subcategory Link)
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
            >
              <option value="">None (Top-Level Category)</option>
              {availableParents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Visibility Settings</span>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isVisiblePos}
                  onChange={(e) => setIsVisiblePos(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800 text-orange-600 focus:ring-0"
                />
                <span className="text-xs text-slate-300 font-medium">Visible on POS</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isVisibleOnline}
                  onChange={(e) => setIsVisibleOnline(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800 text-orange-600 focus:ring-0"
                />
                <span className="text-xs text-slate-300 font-medium">Visible on Online/QR</span>
              </label>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// SUB-COMPONENT: COMBO FORM MODAL (Section 6.4)
// ============================================================================
function ComboFormModal({ combo, products, onClose, onSaved }) {
  const isEdit = Boolean(combo?.id)

  const [name, setName] = useState(combo?.name || '')
  const [code, setCode] = useState(combo?.code || '')
  const [description, setDescription] = useState(combo?.description || '')
  const [bundlePrice, setBundlePrice] = useState(
    combo?.price_cents ? (combo.price_cents / 100).toFixed(2) : '14.99'
  )
  const [availableFrom, setAvailableFrom] = useState(combo?.available_from || '')
  const [availableTo, setAvailableTo] = useState(combo?.available_to || '')
  const [isAvailable, setIsAvailable] = useState(combo ? Boolean(combo.is_available) : true)
  const [selectedItems, setSelectedItems] = useState(
    combo?.items?.length
      ? combo.items.map((it) => ({
          productId: it.product_id || products.find((p) => p.name === it.product_name)?.id || products[0]?.id || '',
          quantity: it.quantity || 1
        }))
      : [{ productId: products[0]?.id || '', quantity: 1 }]
  )
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleAddItemRow = () => {
    setSelectedItems((prev) => [
      ...prev,
      { productId: products[0]?.id || '', quantity: 1 }
    ])
  }

  const handleRemoveItemRow = (idx) => {
    setSelectedItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleUpdateItem = (idx, field, value) => {
    setSelectedItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it))
    )
  }

  // Calculate sum of normal prices for selected products
  const normalTotalPriceCents = selectedItems.reduce((acc, it) => {
    const prod = products.find((p) => p.id === it.productId)
    return acc + (prod?.base_price_cents || 0) * (it.quantity || 1)
  }, 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setErrorMsg('Combo name is required.')
      return
    }
    if (selectedItems.length === 0) {
      setErrorMsg('Add at least one product to this combo.')
      return
    }

    const priceCents = Math.round(parseFloat(bundlePrice || 0) * 100)
    if (isNaN(priceCents) || priceCents <= 0) {
      setErrorMsg('Please enter a valid combo price.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        code: code.trim() || undefined,
        description: description.trim() || undefined,
        priceCents,
        isAvailable,
        availableFrom: availableFrom || undefined,
        availableTo: availableTo || undefined,
        items: selectedItems.map((it) => ({
          productId: it.productId,
          quantity: parseInt(it.quantity) || 1
        }))
      }

      if (isEdit) {
        await window.api.product.updateCombo({
          id: combo.id,
          ...payload
        })
      } else {
        await window.api.product.createCombo(payload)
      }
      onSaved()
    } catch (err) {
      setErrorMsg(err.message || 'Failed to save combo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-white text-sm">
              {isEdit ? `Edit Combo Deal: ${combo.name}` : 'Create New Combo Meal Deal'}
            </h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-2.5 rounded bg-rose-950 border border-rose-800 text-rose-200 text-xs">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Combo Name <span className="text-orange-400">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Deluxe Burger & Shake Combo"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. MEAL-01"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Includes 1 Gourmet Burger, Crispy Fries, and any Soft Beverage"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
            />
          </div>

          {/* Section 6.4 Active Schedule & Dates */}
          <div className="grid grid-cols-2 gap-3 bg-slate-900/60 border border-slate-800 p-3 rounded-lg">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Active From Date</label>
              <input
                type="date"
                value={availableFrom}
                onChange={(e) => setAvailableFrom(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Active Until Date</label>
              <input
                type="date"
                value={availableTo}
                onChange={(e) => setAvailableTo(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white font-mono"
              />
            </div>
          </div>

          {/* Bundled Items Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Select Bundled Products
              </label>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="text-xs text-orange-400 hover:text-orange-300 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Product
              </button>
            </div>

            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {selectedItems.map((it, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={it.productId}
                    onChange={(e) => handleUpdateItem(idx, 'productId', e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (${(p.base_price_cents / 100).toFixed(2)})
                      </option>
                    ))}
                  </select>

                  <div className="w-16">
                    <input
                      type="number"
                      min="1"
                      value={it.quantity}
                      onChange={(e) => handleUpdateItem(idx, 'quantity', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white font-mono text-center"
                    />
                  </div>

                  {selectedItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItemRow(idx)}
                      className="text-slate-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Price Calculation Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-medium">Individual Total</span>
              <div className="text-xs font-mono line-through text-slate-500">
                ${(normalTotalPriceCents / 100).toFixed(2)}
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-amber-400 mb-0.5">
                Combo Set Price ($)
              </label>
              <div className="relative w-28">
                <DollarSign className="w-3 h-3 text-amber-400 absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={bundlePrice}
                  onChange={(e) => setBundlePrice(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded pl-6 pr-2 py-1 text-xs text-amber-400 font-mono font-bold"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Combo Deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
