import React, { useState, useEffect } from 'react'
import {
  Truck,
  Plus,
  Search,
  DollarSign,
  FileText,
  CreditCard,
  Building,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  AlertCircle,
  X,
  Package,
  Layers,
  Calendar,
  Trash2,
  ArrowLeft
} from 'lucide-react'

export default function PurchasesView({ onBack }) {
  const [activeTab, setActiveTab] = useState('ORDERS') // 'ORDERS' | 'SUPPLIERS'
  const [suppliers, setSuppliers] = useState([])
  const [purchaseOrders, setPurchaseOrders] = useState([])
  const [rawItems, setRawItems] = useState([])
  const [loading, setLoading] = useState(true)

  // Modals
  const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false)
  const [isCreatePoModalOpen, setIsCreatePoModalOpen] = useState(false)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [selectedSupplierForPayment, setSelectedSupplierForPayment] = useState(null)

  // Forms
  const [supplierFormData, setSupplierFormData] = useState({
    companyName: '',
    contactName: '',
    phone: '',
    email: '',
    address: '',
  })

  const [poFormData, setPoFormData] = useState({
    supplierId: '',
    poNumber: '',
    notes: '',
    autoReceive: true,
    items: [],
  })

  const [paymentFormData, setPaymentFormData] = useState({
    supplierId: '',
    amount: '',
    paymentMethod: 'BANK_TRANSFER',
    referenceNumber: '',
    notes: '',
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
      if (window.api?.purchases) {
        const [sups, pos, items] = await Promise.all([
          window.api.purchases.getSuppliers(),
          window.api.purchases.getOrders(),
          window.api.inventory?.getItems ? window.api.inventory.getItems() : [],
        ])

        setSuppliers(sups || [])
        setPurchaseOrders(pos || [])
        setRawItems(items || [])
      }
    } catch (err) {
      console.error('Failed to load purchases:', err)
      showToast('error', `Failed to load purchase data: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Create Supplier
  const handleCreateSupplier = async (e) => {
    e.preventDefault()
    if (!supplierFormData.companyName.trim()) {
      showToast('error', 'Company name is required.')
      return
    }

    try {
      await window.api.purchases.createSupplier({
        companyName: supplierFormData.companyName.trim(),
        contactName: supplierFormData.contactName.trim(),
        phone: supplierFormData.phone.trim(),
        email: supplierFormData.email.trim(),
        address: supplierFormData.address.trim(),
      })

      showToast('success', `Supplier "${supplierFormData.companyName}" added!`)
      setIsAddSupplierModalOpen(false)
      setSupplierFormData({ companyName: '', contactName: '', phone: '', email: '', address: '' })
      loadData()
    } catch (err) {
      showToast('error', `Failed to create supplier: ${err.message}`)
    }
  }

  // Open Create PO Modal
  const handleOpenCreatePo = () => {
    setPoFormData({
      supplierId: suppliers[0]?.id || '',
      poNumber: `PO-${Date.now().toString().slice(-6)}`,
      notes: '',
      autoReceive: true,
      items: [
        {
          inventoryItemId: rawItems[0]?.id || '',
          quantity: '10.0',
          unitCost: (rawItems[0]?.cost_per_unit_cents / 100 || 1.0).toFixed(2),
        },
      ],
    })
    setIsCreatePoModalOpen(true)
  }

  // Add Item to PO
  const handleAddPoItemRow = () => {
    setPoFormData({
      ...poFormData,
      items: [
        ...poFormData.items,
        {
          inventoryItemId: rawItems[0]?.id || '',
          quantity: '10.0',
          unitCost: (rawItems[0]?.cost_per_unit_cents / 100 || 1.0).toFixed(2),
        },
      ],
    })
  }

  // Update PO item row
  const handleUpdatePoItemRow = (idx, field, value) => {
    const updated = [...poFormData.items]
    updated[idx][field] = value

    // If changing item, update default unit cost
    if (field === 'inventoryItemId') {
      const selectedItem = rawItems.find((r) => r.id === value)
      if (selectedItem) {
        updated[idx].unitCost = (selectedItem.cost_per_unit_cents / 100).toFixed(2)
      }
    }

    setPoFormData({ ...poFormData, items: updated })
  }

  const handleRemovePoItemRow = (idx) => {
    setPoFormData({
      ...poFormData,
      items: poFormData.items.filter((_, i) => i !== idx),
    })
  }

  // Submit PO / GRN
  const handleCreatePo = async (e) => {
    e.preventDefault()
    if (!poFormData.supplierId) {
      showToast('error', 'Select a supplier.')
      return
    }
    if (poFormData.items.length === 0) {
      showToast('error', 'Add at least one raw item to the purchase invoice.')
      return
    }

    try {
      await window.api.purchases.createOrder({
        supplierId: poFormData.supplierId,
        poNumber: poFormData.poNumber,
        notes: poFormData.notes,
        autoReceive: poFormData.autoReceive,
        items: poFormData.items.map((it) => ({
          inventoryItemId: it.inventoryItemId,
          quantity: parseFloat(it.quantity || 0),
          unitCostCents: Math.round(parseFloat(it.unitCost || 0) * 100),
          totalCents: Math.round(parseFloat(it.quantity || 0) * parseFloat(it.unitCost || 0) * 100),
        })),
      })

      showToast('success', `Purchase order ${poFormData.poNumber} created successfully!`)
      setIsCreatePoModalOpen(false)
      loadData()
    } catch (err) {
      showToast('error', `Failed to create PO: ${err.message}`)
    }
  }

  // Record Payment to Supplier
  const handleOpenPaymentModal = (supplier) => {
    setSelectedSupplierForPayment(supplier)
    setPaymentFormData({
      supplierId: supplier.id,
      amount: ((supplier.outstandingBalanceCents || 0) / 100).toFixed(2),
      paymentMethod: 'BANK_TRANSFER',
      referenceNumber: `TX-${Date.now().toString().slice(-6)}`,
      notes: '',
    })
    setIsPaymentModalOpen(true)
  }

  const handleRecordPayment = async (e) => {
    e.preventDefault()
    const amt = parseFloat(paymentFormData.amount)
    if (isNaN(amt) || amt <= 0) {
      showToast('error', 'Please enter a valid payment amount.')
      return
    }

    try {
      await window.api.purchases.recordPayment({
        supplierId: paymentFormData.supplierId,
        amountCents: Math.round(amt * 100),
        paymentMethod: paymentFormData.paymentMethod,
        referenceNumber: paymentFormData.referenceNumber,
        notes: paymentFormData.notes,
      })

      showToast('success', `Payment of $${amt.toFixed(2)} recorded!`)
      setIsPaymentModalOpen(false)
      loadData()
    } catch (err) {
      showToast('error', `Payment recording failed: ${err.message}`)
    }
  }

  // Total Outstanding across all vendors
  const totalOutstandingCents = suppliers.reduce((sum, s) => sum + (s.outstandingBalanceCents || 0), 0)

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] gap-4 select-none">
      {/* Toast Alert */}
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

      {/* Header Banner */}
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
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              Purchases & Vendor Management
            </h1>
            <p className="text-xs text-slate-400">
              Goods received notes (GRN), supplier balances & payment ledger
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <span className="text-slate-400 mr-1.5">Total Payables:</span>
            <span className={`font-mono font-bold ${
              totalOutstandingCents > 0 ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              ${(totalOutstandingCents / 100).toFixed(2)}
            </span>
          </div>

          <button
            onClick={() => setIsAddSupplierModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
          >
            <Building className="w-3.5 h-3.5 text-orange-400" />
            <span>New Vendor</span>
          </button>

          <button
            onClick={handleOpenCreatePo}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Purchase / GRN</span>
          </button>
        </div>
      </div>

      {/* Navigation Tab Bar */}
      <div className="flex items-center gap-2 bg-slate-950/60 p-2 rounded-2xl border border-slate-800">
        <button
          onClick={() => setActiveTab('ORDERS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'ORDERS'
              ? 'bg-orange-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Purchase Invoices / GRN ({purchaseOrders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('SUPPLIERS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'SUPPLIERS'
              ? 'bg-orange-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>Suppliers & Payables ({suppliers.length})</span>
        </button>
      </div>

      {/* Main Tab Views */}
      <div className="flex-1 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
        {activeTab === 'ORDERS' ? (
          /* Purchase Invoices / Orders Table */
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">PO Number</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Items Summary</th>
                  <th className="py-3 px-4 text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {purchaseOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      No purchase orders recorded yet. Click "Create Purchase / GRN" to record fresh inventory intake.
                    </td>
                  </tr>
                ) : (
                  purchaseOrders.map((po) => (
                    <tr key={po.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-white">
                        {po.po_number}
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {new Date(po.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-200">
                        {po.supplier_name}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                          po.status === 'RECEIVED'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                            : 'bg-amber-950 text-amber-300 border border-amber-800/60'
                        }`}>
                          {po.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 max-w-xs truncate">
                        {po.items?.map((it) => `${it.item_name} (${it.quantity} ${it.unit_abbr || ''})`).join(', ')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400 text-sm">
                        ${(po.total_cents / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* Suppliers & Payables Table */
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Supplier Company</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Total Purchases</th>
                  <th className="py-3 px-4">Total Paid</th>
                  <th className="py-3 px-4">Outstanding Balance</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {suppliers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      No suppliers configured. Click "New Vendor" to create your supplier directory.
                    </td>
                  </tr>
                ) : (
                  suppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white text-sm">{s.company_name}</div>
                        <div className="text-[11px] text-slate-500">{s.address || 'No address specified'}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-200">{s.contact_name || 'N/A'}</div>
                        <div className="text-[10px] text-slate-400">{s.phone} • {s.email}</div>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-200">
                        ${(s.total_purchases_cents / 100).toFixed(2)} ({s.total_po_count} POs)
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                        ${(s.total_paid_cents / 100).toFixed(2)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`font-mono font-black text-sm ${
                          s.outstandingBalanceCents > 0 ? 'text-amber-400' : 'text-slate-500'
                        }`}>
                          ${(s.outstandingBalanceCents / 100).toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenPaymentModal(s)}
                          className="px-3 py-1.5 rounded-lg bg-orange-600/20 hover:bg-orange-600 text-orange-400 hover:text-white border border-orange-500/30 text-xs font-bold transition-all cursor-pointer"
                        >
                          Record Payment
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Vendor Modal */}
      {isAddSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Building className="w-4 h-4 text-orange-400" />
                Add New Supplier / Vendor
              </h2>
              <button
                onClick={() => setIsAddSupplierModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Company / Vendor Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Apex Prime Meats Ltd"
                  value={supplierFormData.companyName}
                  onChange={(e) => setSupplierFormData({ ...supplierFormData, companyName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Contact Person</label>
                <input
                  type="text"
                  placeholder="e.g. Robert Jenkins"
                  value={supplierFormData.contactName}
                  onChange={(e) => setSupplierFormData({ ...supplierFormData, contactName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Phone</label>
                  <input
                    type="text"
                    placeholder="+1 555-0199"
                    value={supplierFormData.phone}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="orders@vendor.com"
                    value={supplierFormData.email}
                    onChange={(e) => setSupplierFormData({ ...supplierFormData, email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Address / Warehouse</label>
                <input
                  type="text"
                  placeholder="e.g. 12 Industrial Way, Dock 4"
                  value={supplierFormData.address}
                  onChange={(e) => setSupplierFormData({ ...supplierFormData, address: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddSupplierModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold shadow-md cursor-pointer"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Purchase Order / GRN Modal */}
      {isCreatePoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-orange-400" />
                Record Purchase Order / Goods Received (GRN)
              </h2>
              <button
                onClick={() => setIsCreatePoModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreatePo} className="flex-1 overflow-y-auto space-y-4 pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Supplier *</label>
                  <select
                    value={poFormData.supplierId}
                    onChange={(e) => setPoFormData({ ...poFormData, supplierId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                    required
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.company_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">PO / Invoice Number</label>
                  <input
                    type="text"
                    value={poFormData.poNumber}
                    onChange={(e) => setPoFormData({ ...poFormData, poNumber: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Auto Receive Checkbox */}
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-emerald-200">Goods Received Note (GRN) Intake</div>
                  <div className="text-[10px] text-slate-400">
                    Automatically add item quantities directly into current stock ledger
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={poFormData.autoReceive}
                  onChange={(e) => setPoFormData({ ...poFormData, autoReceive: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded bg-slate-900 border-slate-700 cursor-pointer"
                />
              </div>

              {/* Items Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase">Purchased Raw Items</span>
                  <button
                    type="button"
                    onClick={handleAddPoItemRow}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-600/20 text-orange-400 hover:bg-orange-600 hover:text-white text-xs font-semibold transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Item</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {poFormData.items.map((it, idx) => {
                    const rowTotal = parseFloat(it.quantity || 0) * parseFloat(it.unitCost || 0)

                    return (
                      <div
                        key={idx}
                        className="p-3 bg-slate-950 border border-slate-800 rounded-xl grid grid-cols-12 gap-2 items-center"
                      >
                        <div className="col-span-6">
                          <label className="text-[10px] text-slate-500 block mb-0.5">Raw Material</label>
                          <select
                            value={it.inventoryItemId}
                            onChange={(e) => handleUpdatePoItemRow(idx, 'inventoryItemId', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                          >
                            {rawItems.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} ({r.unit_abbr})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="col-span-2">
                          <label className="text-[10px] text-slate-500 block mb-0.5">Quantity</label>
                          <input
                            type="number"
                            step="any"
                            value={it.quantity}
                            onChange={(e) => handleUpdatePoItemRow(idx, 'quantity', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-mono"
                            required
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="text-[10px] text-slate-500 block mb-0.5">Rate ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={it.unitCost}
                            onChange={(e) => handleUpdatePoItemRow(idx, 'unitCost', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-mono"
                            required
                          />
                        </div>

                        <div className="col-span-2 flex items-center justify-between gap-1 pt-3 sm:pt-0">
                          <span className="font-mono font-bold text-xs text-emerald-400">
                            ${rowTotal.toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemovePoItemRow(idx)}
                            disabled={poFormData.items.length <= 1}
                            className="p-1 text-slate-500 hover:text-rose-400 disabled:opacity-30 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Notes</label>
                <textarea
                  placeholder="e.g. Delivery received in good condition, batch expiry 2027..."
                  value={poFormData.notes}
                  onChange={(e) => setPoFormData({ ...poFormData, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500 h-16 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreatePoModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold shadow-md cursor-pointer"
                >
                  Save Purchase & Post
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Supplier Payment Modal */}
      {isPaymentModalOpen && selectedSupplierForPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-orange-400" />
                Record Vendor Payment
              </h2>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Vendor:</span>
                <span className="font-bold text-white">{selectedSupplierForPayment.company_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Outstanding Balance:</span>
                <span className="font-mono font-bold text-amber-400">
                  ${((selectedSupplierForPayment.outstandingBalanceCents || 0) / 100).toFixed(2)}
                </span>
              </div>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Payment Amount ($) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentFormData.amount}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, amount: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-orange-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Payment Method</label>
                <select
                  value={paymentFormData.paymentMethod}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, paymentMethod: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="BANK_TRANSFER">Bank Wire / Electronic Transfer</option>
                  <option value="CASH">Cash Payment</option>
                  <option value="CHEQUE">Bank Cheque</option>
                  <option value="CARD">Corporate Card</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Reference / Transaction Number</label>
                <input
                  type="text"
                  placeholder="e.g. WIRE-88719, CHQ-4029"
                  value={paymentFormData.referenceNumber}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, referenceNumber: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Paid against invoice #4092"
                  value={paymentFormData.notes}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold shadow-md cursor-pointer"
                >
                  Post Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
