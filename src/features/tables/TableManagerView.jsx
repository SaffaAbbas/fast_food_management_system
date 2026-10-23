import React, { useState, useEffect } from 'react'
import {
  Grid3X3,
  Plus,
  Edit,
  Trash2,
  ArrowRightLeft,
  Clock,
  Users,
  DollarSign,
  Utensils,
  Check,
  X,
  AlertCircle,
  CheckCircle2,
  FolderPlus,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  ArrowLeft
} from 'lucide-react'

export default function TableManagerView({ onStartOrderForTable, onBack }) {
  const [floors, setFloors] = useState([])
  const [activeFloorId, setActiveFloorId] = useState('')
  const [loading, setLoading] = useState(true)

  // Feedback Notification
  const [toast, setToast] = useState(null)

  // Modals
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false)
  const [transferSourceTable, setTransferSourceTable] = useState(null)

  const [isAddTableModalOpen, setIsAddTableModalOpen] = useState(false)
  const [editingTable, setEditingTable] = useState(null)

  const [isAddFloorModalOpen, setIsAddFloorModalOpen] = useState(false)

  const showToast = (type, message) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3500)
  }

  const loadFloorsAndTables = async () => {
    setLoading(true)
    try {
      if (window.api?.tables) {
        const res = await window.api.tables.getFloorsWithTables()
        setFloors(res || [])
        if (res?.length > 0 && !activeFloorId) {
          setActiveFloorId(res[0].id)
        }
      }
    } catch (err) {
      console.error('Failed to load table map:', err)
      showToast('error', `Could not load tables: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFloorsAndTables()
  }, [])

  const currentFloor = floors.find((f) => f.id === activeFloorId) || floors[0]

  // Status Change (e.g. Cleaning -> Available)
  const handleUpdateStatus = async (table, newStatus) => {
    try {
      await window.api.tables.updateStatus({
        tableId: table.id,
        status: newStatus,
        currentOrderId: newStatus === 'AVAILABLE' ? null : table.current_order_id,
      })
      showToast('success', `Table ${table.table_number} marked as ${newStatus}`)
      loadFloorsAndTables()
    } catch (err) {
      showToast('error', `Status update failed: ${err.message}`)
    }
  }

  return (
    <div className="space-y-6">
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

      {/* Top Banner & Floor Header */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-bold transition-all cursor-pointer shadow-sm group"
              title="Return to Dashboard"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-orange-400 group-hover:-translate-x-0.5 transition-transform" />
              <span>Back</span>
            </button>
          )}
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-orange-950/80 border border-orange-800/80 text-orange-400">
              <Grid3X3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-tight">Table & Floor Map</h2>
              <p className="text-xs text-slate-400">
                Visual dining room layout, table occupancy tracking, order transfers, and floor management.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsAddFloorModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold cursor-pointer transition-all"
          >
            <FolderPlus className="w-3.5 h-3.5 text-orange-400" /> Add Floor
          </button>

          <button
            onClick={() => {
              setEditingTable(null)
              setIsAddTableModalOpen(true)
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-lg shadow-orange-950 cursor-pointer transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Add Table
          </button>
        </div>
      </div>

      {/* Floor Switcher Tabs & Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/50 p-3 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {floors.map((floor) => (
            <button
              key={floor.id}
              onClick={() => setActiveFloorId(floor.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                currentFloor?.id === floor.id
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-950'
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <span>{floor.name}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                currentFloor?.id === floor.id ? 'bg-orange-950 text-orange-200' : 'bg-slate-800 text-slate-400'
              }`}>
                {floor.tables?.length || 0}
              </span>
            </button>
          ))}
        </div>

        {/* Status Legend */}
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
            Available
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />
            Occupied
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-sm shadow-purple-500/50" />
            Cleaning
          </span>
        </div>
      </div>

      {/* Visual Tables Grid */}
      {loading ? (
        <div className="text-center py-20 text-xs text-slate-500">Loading floor layout...</div>
      ) : currentFloor?.tables?.length === 0 ? (
        <div className="bg-slate-950/40 border border-slate-800 border-dashed rounded-2xl p-16 text-center text-xs text-slate-500 space-y-3">
          <Grid3X3 className="w-10 h-10 text-slate-700 mx-auto" />
          <p className="font-semibold text-slate-300">No dining tables on "{currentFloor?.name}"</p>
          <button
            onClick={() => {
              setEditingTable(null)
              setIsAddTableModalOpen(true)
            }}
            className="px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-bold"
          >
            Create Table
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {currentFloor?.tables?.map((table) => {
            const isAvailable = table.status === 'AVAILABLE'
            const isOccupied = table.status === 'OCCUPIED'
            const isCleaning = table.status === 'CLEANING'

            return (
              <div
                key={table.id}
                className={`relative rounded-2xl border p-4 flex flex-col justify-between transition-all select-none ${
                  isAvailable
                    ? 'bg-slate-950/70 border-emerald-900/60 hover:border-emerald-500 hover:shadow-xl hover:shadow-emerald-950/20'
                    : isOccupied
                    ? 'bg-amber-950/20 border-amber-800/80 hover:border-amber-500 hover:shadow-xl hover:shadow-amber-950/20'
                    : isCleaning
                    ? 'bg-purple-950/20 border-purple-800/80'
                    : 'bg-slate-950/70 border-slate-800'
                }`}
              >
                {/* Table Top Header */}
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-white tracking-tight">
                        {table.table_number}
                      </span>
                      <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                        <Users className="w-3 h-3 text-slate-500" /> {table.capacity}p
                      </span>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        isAvailable
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : isOccupied
                          ? 'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse'
                          : 'bg-purple-950 text-purple-300 border border-purple-800'
                      }`}
                    >
                      {table.status}
                    </span>
                  </div>

                  {/* Occupied State Info */}
                  {isOccupied && (
                    <div className="mt-3 bg-slate-900/90 border border-amber-800/40 rounded-xl p-3 space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-medium">Order:</span>
                        <span className="font-mono font-bold text-amber-400">
                          {table.current_order_number || 'ORD-ACTIVE'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-medium">Current Bill:</span>
                        <span className="font-mono font-black text-emerald-400 text-sm">
                          ${((table.current_order_total_cents || 0) / 100).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>Occupied {table.occupancyMinutes || 0} mins</span>
                        </span>
                        <span>{table.current_order_item_count || 0} items</span>
                      </div>
                    </div>
                  )}

                  {/* Available State Prompt */}
                  {isAvailable && (
                    <div className="mt-4 py-3 text-center border border-dashed border-emerald-900/60 rounded-xl text-emerald-400/80 text-xs">
                      Ready for guests
                    </div>
                  )}

                  {/* Cleaning State Prompt */}
                  {isCleaning && (
                    <div className="mt-4 py-3 text-center border border-dashed border-purple-900/60 rounded-xl text-purple-300 text-xs">
                      Table being sanitized
                    </div>
                  )}
                </div>

                {/* Table Action Footer */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-1.5">
                  {isAvailable && (
                    <button
                      onClick={() =>
                        onStartOrderForTable?.({
                          id: table.id,
                          table_number: table.table_number,
                          floor_name: currentFloor?.name,
                        })
                      }
                      className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-950 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" /> Start Order
                    </button>
                  )}

                  {isOccupied && (
                    <>
                      <button
                        onClick={() =>
                          onStartOrderForTable?.({
                            id: table.id,
                            table_number: table.table_number,
                            floor_name: currentFloor?.name,
                          })
                        }
                        className="flex-1 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer text-center"
                      >
                        Open Order
                      </button>

                      <button
                        onClick={() => {
                          setTransferSourceTable(table)
                          setIsTransferModalOpen(true)
                        }}
                        title="Transfer Order to another table"
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
                      </button>
                    </>
                  )}

                  {isCleaning && (
                    <button
                      onClick={() => handleUpdateStatus(table, 'AVAILABLE')}
                      className="flex-1 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all cursor-pointer"
                    >
                      Mark Available
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setEditingTable(table)
                      setIsAddTableModalOpen(true)
                    }}
                    title="Edit Table"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: TRANSFER TABLE */}
      {/* ========================================================================= */}
      {isTransferModalOpen && transferSourceTable && (
        <TransferTableModal
          sourceTable={transferSourceTable}
          allTables={floors.flatMap((f) => f.tables || [])}
          onClose={() => {
            setIsTransferModalOpen(false)
            setTransferSourceTable(null)
          }}
          onSuccess={() => {
            setIsTransferModalOpen(false)
            setTransferSourceTable(null)
            showToast('success', 'Table transferred successfully!')
            loadFloorsAndTables()
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT TABLE */}
      {/* ========================================================================= */}
      {isAddTableModalOpen && (
        <AddEditTableModal
          editingTable={editingTable}
          floors={floors}
          currentFloorId={activeFloorId}
          onClose={() => {
            setIsAddTableModalOpen(false)
            setEditingTable(null)
          }}
          onSuccess={() => {
            setIsAddTableModalOpen(false)
            setEditingTable(null)
            showToast('success', editingTable ? 'Table updated' : 'Table created')
            loadFloorsAndTables()
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD FLOOR */}
      {/* ========================================================================= */}
      {isAddFloorModalOpen && (
        <AddFloorModal
          floorsCount={floors.length}
          onClose={() => setIsAddFloorModalOpen(false)}
          onSuccess={() => {
            setIsAddFloorModalOpen(false)
            showToast('success', 'Floor added successfully')
            loadFloorsAndTables()
          }}
        />
      )}
    </div>
  )
}

// ============================================================================
// SUB-COMPONENT: TRANSFER TABLE MODAL
// ============================================================================
function TransferTableModal({ sourceTable, allTables, onClose, onSuccess }) {
  const availableTables = allTables.filter((t) => t.id !== sourceTable.id && t.status === 'AVAILABLE')
  const [targetTableId, setTargetTableId] = useState(availableTables[0]?.id || '')
  const [reason, setReason] = useState('Customer request for different seating')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleTransfer = async (e) => {
    e.preventDefault()
    if (!targetTableId) {
      setErrorMsg('No target available table selected.')
      return
    }

    setLoading(true)
    setErrorMsg('')
    try {
      await window.api.tables.transferTable({
        fromTableId: sourceTable.id,
        toTableId: targetTableId,
        reason: reason.trim(),
      })
      onSuccess()
    } catch (err) {
      setErrorMsg(err.message || 'Transfer failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-white text-base">Transfer Table Order</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-950 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleTransfer} className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl space-y-1 text-xs">
            <div className="text-slate-400">Source Table (Currently Occupied):</div>
            <div className="font-bold text-white text-sm">
              Table {sourceTable.table_number} — Order {sourceTable.current_order_number || 'Active'}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Select Target Destination Table (Available Only) *
            </label>
            {availableTables.length === 0 ? (
              <div className="text-rose-400 text-xs py-2">
                No available tables currently open to receive this order.
              </div>
            ) : (
              <select
                value={targetTableId}
                onChange={(e) => setTargetTableId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              >
                {availableTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    Table {t.table_number} (Capacity: {t.capacity} guests)
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Transfer Reason</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Guest requested larger booth"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || availableTables.length === 0}
              className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-xs cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Transferring...' : 'Confirm Table Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// SUB-COMPONENT: ADD / EDIT TABLE MODAL
// ============================================================================
function AddEditTableModal({ editingTable, floors, currentFloorId, onClose, onSuccess }) {
  const isEdit = Boolean(editingTable?.id)
  const [floorId, setFloorId] = useState(editingTable?.floor_id || currentFloorId || floors[0]?.id || '')
  const [tableNumber, setTableNumber] = useState(editingTable?.table_number || '')
  const [capacity, setCapacity] = useState(editingTable?.capacity || 4)
  const [status, setStatus] = useState(editingTable?.status || 'AVAILABLE')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!tableNumber.trim()) {
      setErrorMsg('Table number is required.')
      return
    }

    setLoading(true)
    setErrorMsg('')
    try {
      if (isEdit) {
        await window.api.tables.updateTable({
          id: editingTable.id,
          floorId,
          tableNumber: tableNumber.trim(),
          capacity: parseInt(capacity) || 4,
          status,
        })
      } else {
        await window.api.tables.createTable({
          floorId,
          tableNumber: tableNumber.trim(),
          capacity: parseInt(capacity) || 4,
        })
      }
      onSuccess()
    } catch (err) {
      setErrorMsg(err.message || 'Operation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-bold text-white text-base">
            {isEdit ? `Edit Table ${editingTable.table_number}` : 'Create New Table'}
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

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Assigned Floor</label>
            <select
              value={floorId}
              onChange={(e) => setFloorId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
            >
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Table Number / Label *</label>
            <input
              type="text"
              required
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder="e.g. T-09, VIP-1"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Guest Capacity (Seats)</label>
            <input
              type="number"
              min="1"
              max="30"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
            />
          </div>

          {isEdit && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Table Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="OCCUPIED">OCCUPIED</option>
                <option value="CLEANING">CLEANING</option>
                <option value="RESERVED">RESERVED</option>
              </select>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold"
            >
              {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Table'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// SUB-COMPONENT: ADD FLOOR MODAL
// ============================================================================
function AddFloorModal({ floorsCount, onClose, onSuccess }) {
  const [name, setName] = useState('')
  const [displayOrder, setDisplayOrder] = useState(floorsCount + 1)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    try {
      await window.api.tables.createFloor({
        name: name.trim(),
        displayOrder: parseInt(displayOrder) || 1,
      })
      onSuccess()
    } catch (err) {
      alert(`Create floor failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-bold text-white text-base">Add New Floor / Section</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Floor Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rooftop Lounge, VIP Deck"
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Display Order</label>
            <input
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold"
            >
              {loading ? 'Creating...' : 'Create Floor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
