import React, { useState, useEffect } from 'react'
import {
  Boxes,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Edit,
  History,
  X,
  CheckCircle2,
  Package,
  Layers,
  Scale,
  ArrowLeft
} from 'lucide-react'
import ImagePicker from '../../components/ImagePicker.jsx'

export default function InventoryManagerView({ onBack }) {
  const [items, setItems] = useState([])
  const [units, setUnits] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const [lowStockOnly, setLowStockOnly] = useState(false)

  // Modals & Drawers
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [adjustingItem, setAdjustingItem] = useState(null)
  const [viewingHistoryItem, setViewingHistoryItem] = useState(null)
  const [movementHistory, setMovementHistory] = useState([])

  // Form States
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    unitId: '',
    currentStock: '0',
    minimumLevel: '5',
    costPerUnit: '0.00',
    category: 'General',
    supplierId: '',
    imageUrl: null,
  })

  const [adjustFormData, setAdjustFormData] = useState({
    quantityChange: '',
    movementType: 'ADJUSTMENT',
    reason: '',
  })

  // Toast
  const [toast, setToast] = useState(null)

  const showToast = (type, message) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3500)
  }

  const loadData = async () => {
    setLoading(true)
    try {
      if (window.api?.inventory) {
        const [itemsRes, unitsRes, supRes] = await Promise.all([
          window.api.inventory.getItems({
            search: searchQuery,
            category: selectedCategory,
            lowStockOnly,
          }),
          window.api.inventory.getUnits(),
          window.api.purchases?.getSuppliers ? window.api.purchases.getSuppliers() : [],
        ])

        setItems(itemsRes || [])
        setUnits(unitsRes || [])
        setSuppliers(supRes || [])
        if (unitsRes?.length > 0 && !formData.unitId) {
          setFormData((prev) => ({ ...prev, unitId: unitsRes[0].id }))
        }
      }
    } catch (err) {
      console.error('Failed to load inventory:', err)
      showToast('error', `Failed to load stock master: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedCategory, lowStockOnly])

  const handleSearch = (e) => {
    e.preventDefault()
    loadData()
  }

  // Save Item (Create or Edit)
  const handleSaveItem = async (e) => {
    e.preventDefault()
    if (!formData.name.trim() || !formData.unitId) {
      showToast('error', 'Item name and unit are required.')
      return
    }

    try {
      const payload = {
        name: formData.name.trim(),
        sku: formData.sku.trim() || `RAW-${Date.now().toString().slice(-6)}`,
        unitId: formData.unitId,
        currentStock: parseFloat(formData.currentStock || 0),
        minimumLevel: parseFloat(formData.minimumLevel || 5.0),
        costPerUnitCents: Math.round(parseFloat(formData.costPerUnit || 0) * 100),
        category: formData.category || 'General',
        supplierId: formData.supplierId || null,
        imageUrl: formData.imageUrl || null,
      }

      if (editingItem) {
        await window.api.inventory.updateItem(editingItem.id, payload)
        showToast('success', `Item "${payload.name}" updated!`)
      } else {
        await window.api.inventory.createItem(payload)
        showToast('success', `Item "${payload.name}" created!`)
      }

      setIsAddItemModalOpen(false)
      setEditingItem(null)
      loadData()
    } catch (err) {
      showToast('error', `Save failed: ${err.message}`)
    }
  }

  // Stock Adjustment
  const handleAdjustStock = async (e) => {
    e.preventDefault()
    const qty = parseFloat(adjustFormData.quantityChange)
    if (isNaN(qty) || qty === 0) {
      showToast('error', 'Please enter a non-zero quantity change.')
      return
    }

    try {
      await window.api.inventory.adjustStock({
        itemId: adjustingItem.id,
        quantityChange: qty,
        movementType: adjustFormData.movementType,
        reason: adjustFormData.reason || 'Manual adjustment from inventory screen',
      })

      showToast('success', `Stock adjusted for "${adjustingItem.name}"`)
      setAdjustingItem(null)
      setAdjustFormData({ quantityChange: '', movementType: 'ADJUSTMENT', reason: '' })
      loadData()
    } catch (err) {
      showToast('error', `Adjustment failed: ${err.message}`)
    }
  }

  // Load History for Item
  const handleOpenHistory = async (item) => {
    setViewingHistoryItem(item)
    try {
      const history = await window.api.inventory.getMovements({ itemId: item.id })
      setMovementHistory(history || [])
    } catch (err) {
      showToast('error', `Failed to load movements: ${err.message}`)
    }
  }

  const openCreateModal = () => {
    setEditingItem(null)
    setFormData({
      name: '',
      sku: `RAW-${Date.now().toString().slice(-5)}`,
      unitId: units[0]?.id || '',
      currentStock: '0',
      minimumLevel: '5',
      costPerUnit: '0.00',
      category: 'General',
      supplierId: '',
      imageUrl: null,
    })
    setIsAddItemModalOpen(true)
  }

  const openEditModal = (item) => {
    setEditingItem(item)
    setFormData({
      name: item.name,
      sku: item.sku || '',
      unitId: item.unit_id,
      currentStock: String(item.current_stock),
      minimumLevel: String(item.minimum_level),
      costPerUnit: (item.cost_per_unit_cents / 100).toFixed(2),
      category: item.category || 'General',
      supplierId: item.supplier_id || '',
      imageUrl: item.image_url || null,
    })
    setIsAddItemModalOpen(true)
  }

  // Categories list
  const CATEGORIES = [
    'ALL',
    'Meat & Poultry',
    'Dairy & Cheese',
    'Produce',
    'Bakery',
    'Beverages',
    'Pantry & Oils',
    'Packaging',
    'General',
  ]

  // KPI Calculations
  const totalStockValueCents = items.reduce((acc, it) => acc + (it.totalValueCents || 0), 0)
  const lowStockCount = items.filter((it) => it.isLowStock).length

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

      {/* Top Banner & KPI Summary */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-bold transition-all cursor-pointer shadow-sm group mr-1"
              title="Return to Dashboard"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-orange-400 group-hover:-translate-x-0.5 transition-transform" />
              <span>Back</span>
            </button>
          )}
          <div className="w-10 h-10 rounded-xl bg-orange-600/20 border border-orange-500/30 flex items-center justify-center text-orange-400">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              Inventory & Stock Master
            </h1>
            <p className="text-xs text-slate-400">
              Raw materials, batch stock adjustments & valuation ledger
            </p>
          </div>
        </div>

        {/* Valuation & Low Stock Badges */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <span className="text-slate-400 mr-1.5">Total Valuation:</span>
            <span className="font-mono font-bold text-emerald-400 text-sm">
              ${(totalStockValueCents / 100).toFixed(2)}
            </span>
          </div>

          {lowStockCount > 0 && (
            <div className="px-3 py-1.5 rounded-xl bg-rose-950/70 border border-rose-800/50 text-xs flex items-center gap-1.5 text-rose-300 animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>Low Stock Alerts:</span>
              <span className="font-mono font-bold text-rose-100">{lowStockCount}</span>
            </div>
          )}

          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Raw Material</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <form onSubmit={handleSearch} className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search raw material name, SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
          />
        </form>

        {/* Category Pills & Low Stock Switch */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-orange-600 text-white shadow-md'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}

          <button
            onClick={() => setLowStockOnly(!lowStockOnly)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              lowStockOnly
                ? 'bg-rose-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-rose-300'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Low Stock</span>
          </button>
        </div>
      </div>

      {/* Stock Items Table */}
      <div className="flex-1 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Item & SKU</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Current Stock</th>
                <th className="py-3 px-4">Unit Cost</th>
                <th className="py-3 px-4">Total Value</th>
                <th className="py-3 px-4">Preferred Supplier</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {loading && items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-orange-500" />
                    <span>Loading stock master...</span>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <span>No raw inventory items match the current filter.</span>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-white text-sm">{item.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{item.sku}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[11px] border border-slate-700/60">
                        {item.category || 'General'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-black font-mono ${
                          item.isOutOfStock
                            ? 'text-rose-500'
                            : item.isLowStock
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}>
                          {item.current_stock} {item.unit_abbr}
                        </span>
                        {item.isLowStock && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800/60">
                            Min: {item.minimum_level}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-200">
                      ${(item.cost_per_unit_cents / 100).toFixed(2)} / {item.unit_abbr}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                      ${(item.totalValueCents / 100).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-xs">
                      {item.supplier_name || <span className="text-slate-600 italic">None assigned</span>}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Adjust Stock */}
                        <button
                          onClick={() => {
                            setAdjustingItem(item)
                            setAdjustFormData({ quantityChange: '', movementType: 'ADJUSTMENT', reason: '' })
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600 text-orange-400 hover:text-white border border-orange-500/30 text-[11px] font-bold transition-all cursor-pointer"
                        >
                          Stock In/Out
                        </button>

                        {/* Movement History */}
                        <button
                          onClick={() => handleOpenHistory(item)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-all cursor-pointer"
                          title="Movement History"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>

                        {/* Edit Item */}
                        <button
                          onClick={() => openEditModal(item)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-all cursor-pointer"
                          title="Edit Item"
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

      {/* Add / Edit Item Modal */}
      {isAddItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl p-6 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Boxes className="w-4 h-4 text-orange-400" />
                {editingItem ? 'Edit Raw Inventory Item' : 'New Raw Inventory Item'}
              </h2>
              <button
                onClick={() => setIsAddItemModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-4">
              <ImagePicker
                label="Item photo"
                value={formData.imageUrl}
                onChange={(imageUrl) => setFormData({ ...formData, imageUrl })}
              />
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Item Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Angus Beef Patties, Brioche Buns"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">SKU Code</label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  >
                    {CATEGORIES.filter((c) => c !== 'ALL').map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Measurement Unit *</label>
                  <select
                    value={formData.unitId}
                    onChange={(e) => setFormData({ ...formData, unitId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                    required
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>
                    ))}
                  </select>
                </div>

                {!editingItem && (
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Opening Stock</label>
                    <input
                      type="number"
                      step="any"
                      value={formData.currentStock}
                      onChange={(e) => setFormData({ ...formData, currentStock: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Minimum Alert Level</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.minimumLevel}
                    onChange={(e) => setFormData({ ...formData, minimumLevel: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Unit Cost Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.costPerUnit}
                    onChange={(e) => setFormData({ ...formData, costPerUnit: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Preferred Supplier</label>
                  <select
                    value={formData.supplierId}
                    onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  >
                    <option value="">-- None --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.company_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddItemModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold shadow-md cursor-pointer"
                >
                  {editingItem ? 'Save Changes' : 'Create Raw Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock In / Out Quick Adjustment Modal */}
      {adjustingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Scale className="w-4 h-4 text-orange-400" />
                Adjust Stock: {adjustingItem.name}
              </h2>
              <button
                onClick={() => setAdjustingItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
              <span className="text-slate-400">Current Stock:</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                {adjustingItem.current_stock} {adjustingItem.unit_abbr}
              </span>
            </div>

            <form onSubmit={handleAdjustStock} className="space-y-4">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Quantity Change (+ to add, - to subtract)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. +10 or -2.5"
                  value={adjustFormData.quantityChange}
                  onChange={(e) => setAdjustFormData({ ...adjustFormData, quantityChange: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-orange-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Movement Type</label>
                <select
                  value={adjustFormData.movementType}
                  onChange={(e) => setAdjustFormData({ ...adjustFormData, movementType: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="ADJUSTMENT">Stock Adjustment (Audit Correction)</option>
                  <option value="WASTAGE">Wastage / Spoiled / Expired</option>
                  <option value="RETURN">Return to Vendor</option>
                  <option value="PURCHASE">Ad-hoc Cash Purchase Intake</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Reason / Notes *</label>
                <input
                  type="text"
                  placeholder="e.g. Physical inventory recount, kitchen wastage"
                  value={adjustFormData.reason}
                  onChange={(e) => setAdjustFormData({ ...adjustFormData, reason: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAdjustingItem(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold shadow-md cursor-pointer"
                >
                  Confirm Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Movement History Drawer */}
      {viewingHistoryItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border-l border-slate-700 w-full max-w-lg h-full p-6 shadow-2xl flex flex-col space-y-4 animate-slide-left">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-orange-400" />
                  Stock Movement Ledger
                </h2>
                <p className="text-xs text-slate-400">{viewingHistoryItem.name} ({viewingHistoryItem.sku})</p>
              </div>
              <button
                onClick={() => setViewingHistoryItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {movementHistory.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No stock movement history recorded for this item yet.
                </div>
              ) : (
                movementHistory.map((m) => (
                  <div key={m.id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        m.movement_type === 'PURCHASE'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                          : m.movement_type === 'SALE_DEDUCTION'
                          ? 'bg-purple-950 text-purple-300 border border-purple-800/60'
                          : m.movement_type === 'WASTAGE'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800/60'
                          : 'bg-blue-950 text-blue-300 border border-blue-800/60'
                      }`}>
                        {m.movement_type}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(m.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between font-mono font-bold text-white pt-1">
                      <span className="text-slate-400">
                        {m.previous_stock} &rarr; {m.new_stock} {m.unit_abbr}
                      </span>
                      <span className={m.new_stock >= m.previous_stock ? 'text-emerald-400' : 'text-rose-400'}>
                        {m.new_stock >= m.previous_stock ? `+${m.quantity}` : `-${m.quantity}`}
                      </span>
                    </div>

                    <div className="text-slate-400 text-[11px] pt-0.5">
                      {m.reason}
                    </div>

                    {m.staff_name && (
                      <div className="text-[10px] text-slate-500">
                        Recorded by: {m.staff_name}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-800">
              <button
                onClick={() => setViewingHistoryItem(null)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl"
              >
                Close Ledger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
