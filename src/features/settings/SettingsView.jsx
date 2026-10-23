import React, { useState, useEffect } from 'react'
import {
  Settings,
  Store,
  DollarSign,
  Receipt,
  Database,
  ShieldCheck,
  FolderArchive,
  Save,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  FileText,
  Clock,
  UserCheck,
  ArrowLeft
} from 'lucide-react'

export default function SettingsView({ onBack }) {
  const [activeTab, setActiveTab] = useState('general') // 'general', 'taxes', 'receipt', 'database', 'audit'
  const [settings, setSettings] = useState({
    business_name: 'FastBite Gourmet Grill',
    branch_phone: '+1 555-0199',
    branch_email: 'contact@restaurantpos.local',
    branch_address: '100 Gourmet Plaza, Suite 4',
    currency_code: 'USD',
    currency_symbol: '$',
    tax_rate_percentage: '5.0',
    service_charge_percentage: '0.0',
    delivery_fee: '3.00',
    receipt_header_msg: 'Welcome to FastBite Gourmet Grill!',
    receipt_footer_msg: 'Thank you for your visit! Please come again.',
    auto_print_kds: '1',
  })

  const [dbStatus, setDbStatus] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [backupPath, setBackupPath] = useState(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      if (window.api?.settings?.getAll) {
        const loaded = await window.api.settings.getAll()
        if (loaded && Object.keys(loaded).length > 0) {
          setSettings((prev) => ({ ...prev, ...loaded }))
        }
      }

      if (window.api?.db?.getStatus) {
        const stat = await window.api.db.getStatus()
        setDbStatus(stat)
      }

      if (window.api?.reports?.getAuditLogs) {
        const logs = await window.api.reports.getAuditLogs({ limit: 40 })
        setAuditLogs(logs || [])
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
      setError(err.message || 'Error loading settings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const showNotification = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  const handleSaveSettings = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (window.api?.settings?.saveBatch) {
        await window.api.settings.saveBatch(settings)
        showNotification('System settings saved successfully!')
      }
    } catch (err) {
      console.error('Save settings failed:', err)
      setError(err.message || 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  const handleTriggerBackup = async () => {
    try {
      if (window.api?.db?.backup) {
        const res = await window.api.db.backup()
        setBackupPath(res.backupPath)
        showNotification(`Database hot backup successfully created!`)
      }
    } catch (err) {
      console.error('Backup failed:', err)
      setError(err.message || 'Database backup failed.')
    }
  }

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
          <div className="p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-300">
            <Settings className="w-6 h-6 text-orange-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              System Settings & Audit Trail
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                Enterprise Edition
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Store configuration, financial tax rates, receipt formatting, SQLite backup & audit logs
            </p>
          </div>
        </div>

        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-orange-600/20 transition-all cursor-pointer disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'general' ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Store className="w-4 h-4" />
          Store Profile
        </button>
        <button
          onClick={() => setActiveTab('taxes')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'taxes' ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Taxes & Charges
        </button>
        <button
          onClick={() => setActiveTab('receipt')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'receipt' ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Receipt className="w-4 h-4" />
          Receipt Header / Footer
        </button>
        <button
          onClick={() => setActiveTab('database')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'database' ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Database className="w-4 h-4" />
          SQLite Database & Backup
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'audit' ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Audit Trail Logs
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

      {/* TAB 1: STORE PROFILE */}
      {activeTab === 'general' && (
        <form onSubmit={handleSaveSettings} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 max-w-2xl text-xs">
          <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-3 flex items-center gap-2">
            <Store className="w-4 h-4 text-orange-400" />
            Restaurant & Branch Profile
          </h3>

          <div className="space-y-1">
            <label className="text-slate-400 font-semibold">Restaurant Business Name *</label>
            <input
              type="text"
              required
              value={settings.business_name}
              onChange={(e) => setSettings({ ...settings, business_name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-semibold focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Branch Contact Phone</label>
              <input
                type="text"
                value={settings.branch_phone}
                onChange={(e) => setSettings({ ...settings, branch_phone: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono focus:outline-none focus:border-orange-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Contact Email</label>
              <input
                type="email"
                value={settings.branch_email}
                onChange={(e) => setSettings({ ...settings, branch_email: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-slate-400 font-semibold">Physical Location Address</label>
            <input
              type="text"
              value={settings.branch_address}
              onChange={(e) => setSettings({ ...settings, branch_address: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-orange-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Currency Code</label>
              <input
                type="text"
                value={settings.currency_code}
                onChange={(e) => setSettings({ ...settings, currency_code: e.target.value.toUpperCase() })}
                className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono uppercase focus:outline-none focus:border-orange-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Currency Symbol</label>
              <input
                type="text"
                value={settings.currency_symbol}
                onChange={(e) => setSettings({ ...settings, currency_symbol: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono text-center font-bold focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: TAXES & CHARGES */}
      {activeTab === 'taxes' && (
        <form onSubmit={handleSaveSettings} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 max-w-2xl text-xs">
          <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            Taxes, Surcharges & Fees
          </h3>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Sales Tax / VAT (%)</label>
              <input
                type="number"
                step="0.01"
                value={settings.tax_rate_percentage}
                onChange={(e) => setSettings({ ...settings, tax_rate_percentage: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Dine-In Service Charge (%)</label>
              <input
                type="number"
                step="0.01"
                value={settings.service_charge_percentage}
                onChange={(e) => setSettings({ ...settings, service_charge_percentage: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Standard Delivery Fee ($)</label>
              <input
                type="number"
                step="0.01"
                value={settings.delivery_fee}
                onChange={(e) => setSettings({ ...settings, delivery_fee: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </form>
      )}

      {/* TAB 3: RECEIPT FORMATTING */}
      {activeTab === 'receipt' && (
        <form onSubmit={handleSaveSettings} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 max-w-2xl text-xs">
          <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-3 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-amber-400" />
            Thermal Receipt Printing Configuration
          </h3>

          <div className="space-y-1">
            <label className="text-slate-400 font-semibold">Header Greeting Message</label>
            <input
              type="text"
              value={settings.receipt_header_msg}
              onChange={(e) => setSettings({ ...settings, receipt_header_msg: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-slate-400 font-semibold">Footer Thank-You Message</label>
            <textarea
              rows="2"
              value={settings.receipt_footer_msg}
              onChange={(e) => setSettings({ ...settings, receipt_footer_msg: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-amber-500"
            />
          </div>
        </form>
      )}

      {/* TAB 4: DATABASE & BACKUP */}
      {activeTab === 'database' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 max-w-2xl text-xs">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" />
              SQLite Persistent Store Information
            </h3>
            <button
              onClick={handleTriggerBackup}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition-all cursor-pointer"
            >
              <FolderArchive className="w-3.5 h-3.5" />
              Backup Now
            </button>
          </div>

          {backupPath && (
            <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-xl space-y-1 text-emerald-300">
              <span className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Hot Backup Saved:
              </span>
              <p className="font-mono text-[11px] text-emerald-400/90 break-all">{backupPath}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Engine</span>
              <p className="text-white font-mono font-bold mt-0.5">SQLite (better-sqlite3)</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Mode</span>
              <p className="text-emerald-400 font-bold mt-0.5">100% Offline-First Persistent</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Schema Version</span>
              <p className="text-white font-mono font-bold mt-0.5">v8 (All Migrations Applied)</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Storage Path</span>
              <p className="text-slate-400 font-mono text-[10px] mt-0.5 truncate" title={dbStatus?.dbPath}>
                {dbStatus?.dbPath || 'restaurant_pos.sqlite'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Entity</th>
                  <th className="py-3 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-medium">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-12 text-center text-slate-500">
                      No system audit logs found.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono text-slate-400">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-white font-bold">
                        {log.user_display_name || log.username || 'System Admin'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700 font-mono font-bold text-orange-300">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-mono">
                        {log.entity_type} {log.entity_id ? `(${log.entity_id.slice(0, 8)}...)` : ''}
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px] max-w-xs truncate" title={log.details_json}>
                        {log.details_json || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
