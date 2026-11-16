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
  ArrowLeft,
  Cloud,
  Wifi,
  WifiOff
} from 'lucide-react'

import { userCan } from '../../lib/access.js'
import ImagePicker from '../../components/ImagePicker.jsx'

export default function SettingsView({ currentUser, onBack }) {
  const canSystem = userCan(currentUser, 'settings:manage')
  const [activeTab, setActiveTab] = useState('general') // 'general', 'taxes', 'receipt', 'database', 'audit'
  const [settings, setSettings] = useState({
    business_name: 'FastBite Gourmet Grill',
    legal_name: '',
    logo_url: '',
    branch_phone: '+1 555-0199',
    branch_email: 'contact@restaurantpos.local',
    branch_address: '100 Gourmet Plaza, Suite 4',
    social_contact: '',
    currency_code: 'USD',
    currency_symbol: '$',
    number_format: '1,234.56',
    tax_rate_percentage: '5.0',
    service_charge_percentage: '0.0',
    delivery_fee: '3.00',
    receipt_header_msg: 'Welcome to FastBite Gourmet Grill!',
    receipt_footer_msg: 'Thank you for your visit! Please come again.',
    auto_print_receipt: '0',
    receipt_printer_name: '',
    kitchen_printer_name: '',
    kds_mode: 'SCREEN',
    auto_print_kds: '0',
    kds_delay_minutes: '15',
    order_number_prefix: 'ORD',
    ui_theme: 'orange',
    date_format: 'YYYY-MM-DD',
    time_format: '24h',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    notify_low_stock: '1',
    backup_retention_days: '14',
    hold_orders_enabled: '1',
    require_table_for_dine_in: '1',
    loyalty_earn_per_dollar: '1',
    loyalty_redeem_min: '50',
    loyalty_cents_per_point: '1',
    notify_customer_on_status: '1',
    recipe_auto_deduct: '1',
  })

  const [dbStatus, setDbStatus] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [backupPath, setBackupPath] = useState(null)
  const [syncConfig, setSyncConfig] = useState({ enabled: false, url: '', key: '', hasKey: false })
  const [syncStatus, setSyncStatus] = useState(null)
  const [savingSync, setSavingSync] = useState(false)

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

      try {
        if (window.api?.reports?.getAuditLogs && (canSystem || userCan(currentUser, 'audit:view'))) {
          const logs = await window.api.reports.getAuditLogs({ limit: 40 })
          setAuditLogs(logs || [])
        }
      } catch (e) {
        setAuditLogs([])
      }

      if (window.api?.sync?.getConfig) {
        const cfg = await window.api.sync.getConfig()
        setSyncConfig({ enabled: Boolean(cfg.enabled), url: cfg.url || '', key: '', hasKey: Boolean(cfg.hasKey) })
      }
      if (window.api?.sync?.getStatus) {
        setSyncStatus(await window.api.sync.getStatus())
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
        if (settings.ui_theme) document.documentElement.setAttribute('data-theme', settings.ui_theme)
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
        setBackupPath(res.destination || res.backupPath)
        showNotification(`Database hot backup successfully created!`)
      }
    } catch (err) {
      console.error('Backup failed:', err)
      setError(err.message || 'Database backup failed.')
    }
  }

  const handleSaveSync = async () => {
    setSavingSync(true)
    setError(null)
    try {
      if (!window.api?.sync?.saveConfig) {
        setError('Cloud sync is only available in the desktop app (not the browser demo).')
        return
      }
      const payload = { enabled: syncConfig.enabled, url: syncConfig.url }
      if (syncConfig.key) payload.key = syncConfig.key
      const res = await window.api.sync.saveConfig(payload)
      setSyncConfig((prev) => ({ ...prev, key: '', hasKey: Boolean(res.hasKey), enabled: res.enabled, url: res.url }))
      setSyncStatus(res.status || (await window.api.sync.getStatus()))
      showNotification('Cloud sync settings saved.')
    } catch (err) {
      setError(err.message || 'Could not save cloud sync.')
    } finally {
      setSavingSync(false)
    }
  }

  const handleSyncNow = async () => {
    try {
      if (!window.api?.sync?.runNow) return
      const status = await window.api.sync.runNow()
      setSyncStatus(status)
      showNotification(status.message || 'Sync finished.')
    } catch (err) {
      setError(err.message || 'Sync failed.')
    }
  }

  const handleRestoreBackup = async () => {
    try {
      if (!window.api?.db?.chooseBackupFile || !window.api?.db?.restore) {
        setError('Restore is only available in the desktop application.')
        return
      }
      const selected = await window.api.db.chooseBackupFile()
      if (!selected) return
      const confirmed = window.confirm(
        'Restoring a backup replaces the current database. A safety snapshot will be created first. Continue?'
      )
      if (!confirmed) return
      const result = await window.api.db.restore(selected)
      showNotification(result.message || 'Database restored. Restart the application.')
    } catch (err) {
      setError(err.message || 'Restore failed.')
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
          onClick={() => setActiveTab('printers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'printers' ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          Printers / KDS
        </button>
        <button
          onClick={() => setActiveTab('appearance')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'appearance' ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          Theme & format
        </button>
        <button
          onClick={() => setActiveTab('workflow')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'workflow' ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          Workflow
        </button>
        <button
          onClick={() => setActiveTab('roles')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'roles' ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          Users & roles
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
        {canSystem && (
        <button
          onClick={() => setActiveTab('cloud')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'cloud' ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Cloud className="w-4 h-4" />
          Cloud sync
        </button>
        )}
        {(canSystem || userCan(currentUser, 'audit:view')) && (
        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'audit' ? 'bg-orange-600 text-white shadow' : 'text-slate-400 hover:text-white'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Audit Trail Logs
        </button>
        )}
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
            <label className="text-slate-400 font-semibold">Restaurant trading name *</label>
            <input
              type="text"
              required
              value={settings.business_name}
              onChange={(e) => setSettings({ ...settings, business_name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-semibold focus:outline-none focus:border-orange-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-slate-400 font-semibold">Legal / registered business name</label>
            <input
              type="text"
              value={settings.legal_name || ''}
              onChange={(e) => setSettings({ ...settings, legal_name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white focus:outline-none focus:border-orange-500"
            />
          </div>
          <ImagePicker
            label="Logo"
            value={settings.logo_url}
            onChange={(url) => setSettings({ ...settings, logo_url: url || '' })}
          />

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

          <div className="space-y-1">
            <label className="text-slate-400 font-semibold">Social / extra contact (website, WhatsApp, Instagram)</label>
            <input
              type="text"
              value={settings.social_contact || ''}
              onChange={(e) => setSettings({ ...settings, social_contact: e.target.value })}
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
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Number format</label>
              <select
                value={settings.number_format || '1,234.56'}
                onChange={(e) => setSettings({ ...settings, number_format: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white"
              >
                <option value="1,234.56">1,234.56</option>
                <option value="1.234,56">1.234,56</option>
                <option value="1 234.56">1 234.56</option>
              </select>
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
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Kitchen delay highlight (minutes)</label>
              <input
                type="number"
                min="1"
                value={settings.kds_delay_minutes || '15'}
                onChange={(e) => setSettings({ ...settings, kds_delay_minutes: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Loyalty points per $1 spent</label>
              <input
                type="number"
                step="0.1"
                value={settings.loyalty_earn_per_dollar || '1'}
                onChange={(e) => setSettings({ ...settings, loyalty_earn_per_dollar: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Minimum points to redeem</label>
              <input
                type="number"
                value={settings.loyalty_redeem_min || '50'}
                onChange={(e) => setSettings({ ...settings, loyalty_redeem_min: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Cents of discount per point</label>
              <input
                type="number"
                value={settings.loyalty_cents_per_point || '1'}
                onChange={(e) => setSettings({ ...settings, loyalty_cents_per_point: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-slate-300">
            <input
              type="checkbox"
              checked={settings.notify_customer_on_status !== '0'}
              onChange={(e) => setSettings({ ...settings, notify_customer_on_status: e.target.checked ? '1' : '0' })}
            />
            Log customer notifications when delivery/kitchen status changes
          </label>
          <label className="flex items-center gap-2 text-slate-300">
            <input
              type="checkbox"
              checked={settings.recipe_auto_deduct !== '0'}
              onChange={(e) => setSettings({ ...settings, recipe_auto_deduct: e.target.checked ? '1' : '0' })}
            />
            Automatically deduct recipe ingredients when an order is paid
          </label>
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
          <label className="flex items-center gap-2 text-slate-300">
            <input
              type="checkbox"
              checked={settings.auto_print_receipt === '1'}
              onChange={(e) => setSettings({ ...settings, auto_print_receipt: e.target.checked ? '1' : '0' })}
            />
            Auto-print receipt after payment
          </label>
        </form>
      )}

      {activeTab === 'printers' && (
        <form onSubmit={handleSaveSettings} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 max-w-2xl text-xs">
          <h3 className="text-sm font-bold text-white">Receipt printer, kitchen printer & KDS</h3>
          <p className="text-slate-400">Names are stored for this PC. Windows print dialog still selects the device at print time.</p>
          <div className="space-y-1">
            <label className="text-slate-400 font-semibold">Receipt printer</label>
            <input value={settings.receipt_printer_name || ''} onChange={(e) => setSettings({ ...settings, receipt_printer_name: e.target.value })} placeholder="e.g. EPSON TM-T20" className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white" />
          </div>
          <div className="space-y-1">
            <label className="text-slate-400 font-semibold">Kitchen printer</label>
            <input value={settings.kitchen_printer_name || ''} onChange={(e) => setSettings({ ...settings, kitchen_printer_name: e.target.value })} placeholder="e.g. Kitchen-80mm" className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white" />
          </div>
          <div className="space-y-1">
            <label className="text-slate-400 font-semibold">Kitchen display mode</label>
            <select value={settings.kds_mode || 'SCREEN'} onChange={(e) => setSettings({ ...settings, kds_mode: e.target.value })} className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white">
              <option value="SCREEN">KDS screen only</option>
              <option value="PRINTER">Kitchen printer tickets</option>
              <option value="BOTH">KDS + printer</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-slate-300">
            <input type="checkbox" checked={settings.auto_print_kds === '1'} onChange={(e) => setSettings({ ...settings, auto_print_kds: e.target.checked ? '1' : '0' })} />
            Auto-print kitchen ticket when order is confirmed
          </label>
        </form>
      )}

      {activeTab === 'appearance' && (
        <form onSubmit={handleSaveSettings} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 max-w-2xl text-xs">
          <h3 className="text-sm font-bold text-white">Color theme, date/time</h3>
          <div className="space-y-1">
            <label className="text-slate-400 font-semibold">UI theme</label>
            <select value={settings.ui_theme || 'orange'} onChange={(e) => setSettings({ ...settings, ui_theme: e.target.value })} className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white">
              <option value="orange">Orange (default)</option>
              <option value="forest">Forest green</option>
              <option value="navy">Navy</option>
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Date format</label>
              <select value={settings.date_format || 'YYYY-MM-DD'} onChange={(e) => setSettings({ ...settings, date_format: e.target.value })} className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white">
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Time format</label>
              <select value={settings.time_format || '24h'} onChange={(e) => setSettings({ ...settings, time_format: e.target.value })} className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white">
                <option value="24h">24-hour</option>
                <option value="12h">12-hour</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-slate-400 font-semibold">Timezone</label>
              <input value={settings.timezone || ''} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono" />
            </div>
          </div>
        </form>
      )}

      {activeTab === 'workflow' && (
        <form onSubmit={handleSaveSettings} className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 max-w-2xl text-xs">
          <h3 className="text-sm font-bold text-white">Order numbering, notifications, menu workflow</h3>
          <div className="space-y-1">
            <label className="text-slate-400 font-semibold">Order number prefix</label>
            <input value={settings.order_number_prefix || 'ORD'} onChange={(e) => setSettings({ ...settings, order_number_prefix: e.target.value.toUpperCase() })} className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono" />
          </div>
          <label className="flex items-center gap-2 text-slate-300">
            <input type="checkbox" checked={settings.hold_orders_enabled !== '0'} onChange={(e) => setSettings({ ...settings, hold_orders_enabled: e.target.checked ? '1' : '0' })} />
            Allow holding drafts on POS
          </label>
          <label className="flex items-center gap-2 text-slate-300">
            <input type="checkbox" checked={settings.require_table_for_dine_in !== '0'} onChange={(e) => setSettings({ ...settings, require_table_for_dine_in: e.target.checked ? '1' : '0' })} />
            Require a table for dine-in orders
          </label>
          <label className="flex items-center gap-2 text-slate-300">
            <input type="checkbox" checked={settings.notify_low_stock !== '0'} onChange={(e) => setSettings({ ...settings, notify_low_stock: e.target.checked ? '1' : '0' })} />
            Low-stock notifications
          </label>
          <div className="space-y-1">
            <label className="text-slate-400 font-semibold">Keep local backups (days)</label>
            <input type="number" min="1" value={settings.backup_retention_days || '14'} onChange={(e) => setSettings({ ...settings, backup_retention_days: e.target.value })} className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono" />
          </div>
        </form>
      )}

      {activeTab === 'roles' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3 max-w-2xl text-xs text-slate-300">
          <h3 className="text-sm font-bold text-white">Users, roles & permissions</h3>
          <p>Role matrix is stored in SQLite (`roles`, `permissions`, `role_permissions`). Create users and assign roles under <strong>Staff</strong>.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Admin / manager: full POS, discounts, reports, settings</li>
            <li>Cashier: orders, payments, coupons — not manual override discounts</li>
            <li>Waiter: create tickets, no settlement unless granted</li>
            <li>Kitchen: KDS only</li>
          </ul>
        </div>
      )}

      {/* TAB 4: DATABASE & BACKUP */}
      {activeTab === 'database' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 max-w-2xl text-xs">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" />
              SQLite Persistent Store Information
            </h3>
            <div className="flex gap-2">
              <button
                onClick={handleTriggerBackup}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition-all cursor-pointer"
              >
                <FolderArchive className="w-3.5 h-3.5" />
                Backup Now
              </button>
              <button
                onClick={handleRestoreBackup}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold border border-slate-700"
              >
                Restore Backup
              </button>
            </div>
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
              <p className="text-white font-mono font-bold mt-0.5">v{dbStatus?.schemaVersion || 10}</p>
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

      {activeTab === 'cloud' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 max-w-2xl text-xs">
          <h3 className="text-sm font-bold text-white border-b border-slate-800 pb-3 flex items-center gap-2">
            <Cloud className="w-4 h-4 text-orange-400" />
            Offline POS + online backup
          </h3>
          <div className="rounded-xl border border-orange-100 bg-orange-50 p-3 text-slate-700 leading-relaxed space-y-2">
            <p>
              <strong>GitHub is not the restaurant database.</strong> GitHub stores app source code.
              A restaurant PC does not download GitHub when Wi‑Fi returns. New screens / POS button
              fixes need a new installer.
            </p>
            <p>
              <strong>Supabase is the online data copy.</strong> Orders, menu and customers save first
              in local SQLite. When internet comes back, this PC uploads queued work and pulls other
              terminals’ records from Supabase.
            </p>
          </div>
          <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
            syncStatus?.online ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}>
            {syncStatus?.online ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            <span className="font-semibold">{syncStatus?.message || 'Checking connection…'}</span>
            <span className="ml-auto font-mono">{syncStatus?.pending || 0} pending</span>
          </div>
          <label className="flex items-center gap-2 font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={syncConfig.enabled}
              onChange={(e) => setSyncConfig({ ...syncConfig, enabled: e.target.checked })}
            />
            Enable cloud sync when internet is available
          </label>
          <div className="space-y-1">
            <label className="text-slate-400 font-semibold">Supabase project URL</label>
            <input
              type="url"
              placeholder="https://xxxx.supabase.co"
              value={syncConfig.url}
              onChange={(e) => setSyncConfig({ ...syncConfig, url: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono focus:outline-none focus:border-orange-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-slate-400 font-semibold">
              Service role or anon key {syncConfig.hasKey ? '(saved on this PC)' : ''}
            </label>
            <input
              type="password"
              placeholder={syncConfig.hasKey ? '••••••••  leave blank to keep current key' : 'Paste key from Supabase → Settings → API'}
              value={syncConfig.key}
              onChange={(e) => setSyncConfig({ ...syncConfig, key: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-lg text-white font-mono focus:outline-none focus:border-orange-500"
            />
          </div>
          <p className="text-slate-500">
            In Supabase SQL editor, run <span className="font-mono text-slate-700">docs/supabase_schema.sql</span> once
            so the <span className="font-mono">pos_sync_records</span> table exists.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSaveSync}
              disabled={savingSync}
              className="px-4 py-2 rounded-xl bg-orange-600 text-white font-bold hover:bg-orange-500 disabled:opacity-50"
            >
              {savingSync ? 'Saving…' : 'Save cloud settings'}
            </button>
            <button
              type="button"
              onClick={handleSyncNow}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500"
            >
              Sync now
            </button>
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
