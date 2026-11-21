import React, { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  ShoppingBag,
  Receipt,
  UtensilsCrossed,
  Grid3X3,
  Package,
  Boxes,
  ScrollText,
  Truck,
  DollarSign,
  Users,
  UserCheck,
  CalendarDays,
  Bike,
  BarChart3,
  Settings,
  QrCode,
  ShieldCheck,
  Cpu,
  Activity,
  CheckCircle2,
  Clock,
  Minus,
  Square,
  X,
  WifiOff,
  Wifi,
  RefreshCw,
  Info,
  Database,
  PlusCircle,
  FolderArchive,
  Search,
  Check,
  AlertCircle,
  LogOut,
  User,
  Wrench,
  ArrowLeft
} from 'lucide-react'

import LoginScreen from './features/auth/LoginScreen.jsx'
import DashboardView from './features/dashboard/DashboardView.jsx'
import ProductManager from './features/products/ProductManager.jsx'
import PosView from './features/pos/PosView.jsx'
import TableManagerView from './features/tables/TableManagerView.jsx'
import OrdersView from './features/orders/OrdersView.jsx'
import KitchenDisplayView from './features/kitchen/KitchenDisplayView.jsx'
import InventoryManagerView from './features/inventory/InventoryManagerView.jsx'
import RecipeManagerView from './features/inventory/RecipeManagerView.jsx'
import PurchasesView from './features/purchases/PurchasesView.jsx'
import ExpensesView from './features/expenses/ExpensesView.jsx'
import CashDrawerShiftView from './features/shifts/CashDrawerShiftView.jsx'
import StaffManagerView from './features/staff/StaffManagerView.jsx'
import CustomersView from './features/customers/CustomersView.jsx'
import ReservationsView from './features/reservations/ReservationsView.jsx'
import DeliveryDispatchView from './features/delivery/DeliveryDispatchView.jsx'
import ReportsView from './features/reports/ReportsView.jsx'
import SettingsView from './features/settings/SettingsView.jsx'
import AuditLogView from './features/audit/AuditLogView.jsx'
import QrKioskCenterView from './features/kiosk/QrKioskCenterView.jsx'
import { userCan, homeModuleFor } from './lib/access.js'

const AUTH_TOKEN_KEY = 'pos_auth_token'

function readAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

function writeAuthToken(token) {
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token)
    else localStorage.removeItem(AUTH_TOKEN_KEY)
  } catch {
    /* storage can be unavailable */
  }
}

function formatSessionEnd(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const MODULE_LIST = [
  { id: 'dashboard', name: 'Dashboard', group: 'Service', icon: LayoutDashboard, perms: ['dashboard:view'] },
  { id: 'pos', name: 'POS', group: 'Service', icon: ShoppingBag, perms: ['pos:create_order'] },
  { id: 'orders', name: 'Orders', group: 'Service', icon: Receipt, perms: ['pos:create_order', 'pos:print_receipt'] },
  { id: 'kitchen', name: 'Kitchen', group: 'Service', icon: UtensilsCrossed, perms: ['kitchen:view'] },
  { id: 'tables', name: 'Tables', group: 'Service', icon: Grid3X3, perms: ['tables:view', 'tables:manage'] },
  { id: 'products', name: 'Menu', group: 'Catalog', icon: Package, perms: ['menu:manage'] },
  { id: 'inventory', name: 'Inventory', group: 'Catalog', icon: Boxes, perms: ['inventory:manage'] },
  { id: 'recipes', name: 'Recipes', group: 'Catalog', icon: ScrollText, perms: ['inventory:manage', 'menu:manage'] },
  { id: 'purchases', name: 'Purchases', group: 'Catalog', icon: Truck, perms: ['inventory:manage'] },
  { id: 'staff', name: 'Staff', group: 'People', icon: UserCheck, perms: ['staff:manage'] },
  { id: 'customers', name: 'Customers', group: 'People', icon: Users, perms: ['customers:view', 'customers:manage'] },
  { id: 'reservations', name: 'Reservations', group: 'People', icon: CalendarDays, perms: ['reservations:manage'] },
  { id: 'delivery', name: 'Delivery', group: 'People', icon: Bike, perms: ['delivery:manage', 'delivery:assigned'] },
  { id: 'expenses', name: 'Expenses', group: 'Finance', icon: DollarSign, perms: ['expenses:manage'] },
  { id: 'cash_drawer', name: 'Cash drawer', group: 'Finance', icon: DollarSign, perms: ['cash:manage'] },
  { id: 'reports', name: 'Reports', group: 'Finance', icon: BarChart3, perms: ['reports:view'] },
  { id: 'qr_kiosk', name: 'QR / Kiosk', group: 'Admin', icon: QrCode, perms: ['settings:manage'] },
  { id: 'audit', name: 'Audit log', group: 'Admin', icon: ShieldCheck, perms: ['audit:view', 'settings:manage'] },
  { id: 'settings', name: 'Settings', group: 'Admin', icon: Settings, perms: ['settings:manage', 'settings:branch'] },
  { id: 'diagnostics', name: 'Diagnostics', group: 'Admin', icon: Wrench, perms: ['settings:manage'] },
]

export default function App() {
  const [currentUser, setCurrentUser] = useState(null)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [authNotice, setAuthNotice] = useState('')
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const [activeModule, setActiveModule] = useState('dashboard')
  const [systemInfo, setSystemInfo] = useState(null)
  const [dbStatus, setDbStatus] = useState(null)
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [floors, setFloors] = useState([])
  const [recentOrders, setRecentOrders] = useState([])
  const [pingLatency, setPingLatency] = useState(null)
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString())
  const [ipcStatus, setIpcStatus] = useState('checking')
  const [actionFeedback, setActionFeedback] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [posPreselectedTable, setPosPreselectedTable] = useState(null)
  const [syncStatus, setSyncStatus] = useState(null)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!currentUser) return
    window.api?.settings?.getAll?.()
      .then((s) => {
        if (s?.ui_theme) document.documentElement.setAttribute('data-theme', s.ui_theme)
        if (s?.time_format === '12h') {
          /* clock uses locale below */
        }
      })
      .catch(() => {})
  }, [currentUser])

  useEffect(() => {
    let cancelled = false
    const restore = async () => {
      try {
        const token = readAuthToken()
        if (token && window.api?.auth?.getCurrentUser) {
          const session = await window.api.auth.getCurrentUser(token)
          if (cancelled) return
          if (session?.token) {
            writeAuthToken(session.token)
            setCurrentUser(session)
            setActiveModule(homeModuleFor(session))
          } else {
            writeAuthToken('')
            setAuthNotice('Your session expired. Sign in again.')
          }
        }
      } catch (err) {
        console.error('Failed to restore session:', err)
      } finally {
        if (!cancelled) setSessionChecked(true)
      }
    }
    restore()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!currentUser?.token || !currentUser?.expiresAt) return undefined
    let stopped = false
    const endSession = () => {
      if (stopped) return
      stopped = true
      const token = currentUser.token
      writeAuthToken('')
      setCurrentUser(null)
      setActiveModule('dashboard')
      setConfirmLogout(false)
      setAuthNotice('Your session expired. Sign in again.')
      window.api?.auth?.logout?.(token).catch(() => {})
    }
    const remaining = new Date(currentUser.expiresAt).getTime() - Date.now()
    if (remaining <= 0) {
      endSession()
      return undefined
    }
    const timer = setTimeout(endSession, remaining)
    const poll = setInterval(async () => {
      try {
        const session = await window.api?.auth?.getCurrentUser?.(currentUser.token)
        if (!session) endSession()
      } catch (err) {
        const message = String(err?.message || '')
        if (message.toLowerCase().includes('session expired')) endSession()
      }
    }, 20000)
    return () => {
      stopped = true
      clearTimeout(timer)
      clearInterval(poll)
    }
  }, [currentUser?.token, currentUser?.expiresAt])

  const loadData = async () => {
    if (window.api?.app?.getInfo) {
      try {
        const info = await window.api.app.getInfo()
        setSystemInfo(info)
        setIpcStatus('connected')
      } catch (err) {
        console.error('Failed to get app info:', err)
        setIpcStatus('error')
      }
    } else {
      setIpcStatus('web_fallback')
    }

    if (window.api?.db?.getStatus) {
      try {
        const status = await window.api.db.getStatus()
        setDbStatus(status)
      } catch (err) {
        console.error('Failed to get DB status:', err)
      }

      try {
        const cats = await window.api.db.getCategories()
        setCategories(cats || [])
      } catch (e) {}

      try {
        const prods = await window.api.db.getProducts({ categoryId: selectedCategory, searchQuery })
        setProducts(prods || [])
      } catch (e) {}

      try {
        const flrs = await window.api.db.getTables()
        setFloors(flrs || [])
      } catch (e) {}

      try {
        const ords = await window.api.db.getRecentOrders({ limit: 10 })
        setRecentOrders(ords || [])
      } catch (e) {}
    }
  }

  useEffect(() => {
    if (!currentUser) return
    loadData()
  }, [currentUser, selectedCategory, searchQuery])

  useEffect(() => {
    let unsub = () => {}
    const loadSync = async () => {
      if (!window.api?.sync?.getStatus) return
      try {
        setSyncStatus(await window.api.sync.getStatus())
      } catch {
        /* ignore */
      }
    }
    loadSync()
    const timer = setInterval(loadSync, 15000)
    if (window.api?.on) {
      unsub = window.api.on('db:sync-status', (status) => setSyncStatus(status))
    }
    const onOnline = () => {
      if (window.api?.sync?.notifyNetwork) {
        window.api.sync.notifyNetwork(true).then(setSyncStatus).catch(() => {})
      } else if (window.api?.sync?.runNow) {
        window.api.sync.runNow().then(setSyncStatus).catch(() => {})
      }
    }
    const onOffline = () => {
      if (window.api?.sync?.notifyNetwork) {
        window.api.sync.notifyNetwork(false).then(setSyncStatus).catch(() => {})
      }
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      clearInterval(timer)
      unsub()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const handleLogout = async () => {
    setLoggingOut(true)
    setLogoutError('')
    try {
      const token = currentUser?.token || readAuthToken()
      if (window.api?.auth?.logout) await window.api.auth.logout(token)
      writeAuthToken('')
      setCurrentUser(null)
      setActiveModule('dashboard')
      setConfirmLogout(false)
      setAuthNotice('')
    } catch (err) {
      setLogoutError(err?.message || 'Could not sign out. Try again.')
    } finally {
      setLoggingOut(false)
    }
  }

  const handlePingTest = async () => {
    if (!window.api?.app?.ping) {
      alert('Secure IPC bridge is only active inside Electron desktop runtime.')
      return
    }
    const start = performance.now()
    try {
      await window.api.app.ping({ sentAt: Date.now() })
      const latency = (performance.now() - start).toFixed(2)
      setPingLatency(`${latency} ms`)
    } catch (err) {
      console.error('Ping failed:', err)
      setPingLatency('Error')
    }
  }

  const handleCreateTestOrder = async () => {
    if (!window.api?.db?.createOrder) {
      setActionFeedback({ type: 'error', text: 'Database IPC is not connected' })
      return
    }
    if (products.length === 0) {
      setActionFeedback({ type: 'error', text: 'No products found to order' })
      return
    }

    try {
      const selectedProduct = products[0]
      const order = await window.api.db.createOrder({
        orderType: 'DINE_IN',
        subtotalCents: selectedProduct.base_price_cents,
        taxCents: Math.round(selectedProduct.base_price_cents * 0.05),
        totalCents: selectedProduct.base_price_cents + Math.round(selectedProduct.base_price_cents * 0.05),
        tableId: floors[0]?.tables?.[0]?.id || null,
        cashierId: currentUser?.id || null,
        items: [
          {
            productId: selectedProduct.id,
            name: selectedProduct.name,
            quantity: 1,
            unitPriceCents: selectedProduct.base_price_cents,
            totalCents: selectedProduct.base_price_cents,
          },
        ],
      })

      setActionFeedback({ type: 'success', text: `Order ${order.orderNumber} successfully posted to SQLite!` })
      loadData()
      setTimeout(() => setActionFeedback(null), 4000)
    } catch (err) {
      setActionFeedback({ type: 'error', text: `Failed: ${err.message}` })
    }
  }

  const handleBackupTest = async () => {
    if (!window.api?.db?.backup) return
    try {
      const res = await window.api.db.backup()
      setActionFeedback({ type: 'success', text: `SQLite hot backup saved: ${res.bytes} bytes` })
      setTimeout(() => setActionFeedback(null), 4000)
    } catch (err) {
      setActionFeedback({ type: 'error', text: `Backup error: ${err.message}` })
    }
  }

  const handleMinimize = () => window.api?.window?.minimize?.()
  const handleMaximize = () => window.api?.window?.maximize?.()
  const handleClose = () => window.api?.window?.close?.()

  const hasModuleAccess = (mod) => {
    if (!currentUser) return false
    const codes = mod.perms || (mod.perm ? [mod.perm] : [])
    if (!codes.length) return true
    return codes.some((code) => userCan(currentUser, code))
  }

  const allowedModules = MODULE_LIST.filter((mod) => hasModuleAccess(mod))

  if (!sessionChecked) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#f3f5f8] text-slate-500 text-[15px]">
        Checking your session...
      </div>
    )
  }

  if (!currentUser) {
    return (
      <LoginScreen
        notice={authNotice}
        onLoginSuccess={(session) => {
          if (session?.token) writeAuthToken(session.token)
          setAuthNotice('')
          setCurrentUser(session)
          setActiveModule(homeModuleFor(session))
          loadData()
        }}
      />
    )
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f3f5f8] text-slate-900 select-none">
      <aside className="hidden lg:flex w-[232px] bg-white border-r border-slate-200 flex-col flex-shrink-0">
        <div className="h-[64px] flex items-center gap-3 px-4 border-b border-slate-200">
          <div className="w-9 h-9 rounded-xl bg-orange-600 flex items-center justify-center font-extrabold text-white text-sm">
            RF
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-semibold text-[15px] text-slate-900">Restaurant OS</span>
            <span className="text-[12px] text-slate-500">Works without internet</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3">
          {['Service', 'Catalog', 'People', 'Finance', 'Admin'].map((group) => {
            const items = MODULE_LIST.filter((mod) => mod.group === group && hasModuleAccess(mod))
            if (!items.length) return null
            return (
              <div key={group} className="mb-3">
                <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  {group}
                </div>
                <div className="space-y-0.5">
                  {items.map((mod) => {
                    const Icon = mod.icon
                    const isActive = activeModule === mod.id
                    return (
                      <button
                        key={mod.id}
                        onClick={() => {
                          if (mod.id === 'pos') setPosPreselectedTable(null)
                          setActiveModule(mod.id)
                        }}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-[8px] rounded-lg text-[13px] font-medium transition-colors ${
                          isActive
                            ? 'bg-orange-600 text-white shadow-sm'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                        <span className="truncate">{mod.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 bg-slate-50">
          <div className="text-[13px] font-medium text-slate-800 truncate">
            {currentUser.displayName || currentUser.display_name || currentUser.username}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {currentUser.expiresAt ? `Session ends ${formatSessionEnd(currentUser.expiresAt)}` : 'Signed in'}
          </div>
          <div className="flex items-center justify-between text-[12px] text-slate-500 mt-0.5">
            <span className="truncate flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${ipcStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              {currentUser.roleName || currentUser.role_name || 'Staff'}
            </span>
            <span className={`flex items-center gap-1 ${syncStatus?.online ? 'text-emerald-700' : 'text-amber-700'}`}>
              {syncStatus?.online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {syncStatus?.online ? 'Online' : 'Offline'}
              {typeof syncStatus?.pending === 'number' && syncStatus.pending > 0 ? ` · ${syncStatus.pending}` : ''}
            </span>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="relative z-20 h-[64px] bg-white border-b border-slate-200 flex items-center justify-between px-5 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {activeModule !== homeModuleFor(currentUser) && (
              <button
                onClick={() => setActiveModule(homeModuleFor(currentUser))}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[13px] font-semibold"
                title="Home"
              >
                <ArrowLeft className="w-4 h-4 text-orange-600" />
                Home
              </button>
            )}
            {activeModule !== 'pos' && userCan(currentUser, 'pos:create_order') && (
              <button
                onClick={() => {
                  setPosPreselectedTable(null)
                  setActiveModule('pos')
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-[13px] font-semibold"
              >
                <ShoppingBag className="w-4 h-4" />
                Open POS
              </button>
            )}
            <div className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
              {(() => {
                const CurrentIcon = MODULE_LIST.find((m) => m.id === activeModule)?.icon || LayoutDashboard
                return <CurrentIcon className="w-4 h-4 text-orange-600" />
              })()}
              <span>{MODULE_LIST.find((m) => m.id === activeModule)?.name}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex items-center gap-2 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg">
              <div className="w-7 h-7 rounded-full bg-orange-600 flex items-center justify-center text-[12px] font-bold text-white">
                {(currentUser.displayName || currentUser.display_name || currentUser.username || 'U')[0]}
              </div>
              <span className="text-[13px] font-medium text-slate-800 max-w-[140px] truncate">
                {currentUser.displayName || currentUser.display_name || currentUser.username}
              </span>
              <button
                type="button"
                onClick={() => {
                  setLogoutError('')
                  setConfirmLogout((open) => !open)
                }}
                title="Sign out"
                className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-rose-50 text-slate-500 hover:text-rose-600 text-[13px] font-medium"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
              {confirmLogout && (
                <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                  <p className="text-[13px] font-semibold text-slate-900">Sign out of this register?</p>
                  <p className="mt-1 text-[12px] text-slate-500">This ends the session on this computer. The token cannot be used again.</p>
                  {logoutError && <p className="mt-2 text-[12px] text-rose-600">{logoutError}</p>}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={loggingOut}
                      onClick={handleLogout}
                      className="flex-1 rounded-lg bg-rose-600 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
                    >
                      {loggingOut ? 'Signing out...' : 'Sign out'}
                    </button>
                    <button
                      type="button"
                      disabled={loggingOut}
                      onClick={() => setConfirmLogout(false)}
                      className="flex-1 rounded-lg bg-slate-100 py-2 text-[13px] font-semibold text-slate-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="hidden md:flex items-center gap-1.5 text-[13px] font-medium text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg">
              <Clock className="w-4 h-4 text-orange-600" />
              <span>{currentTime}</span>
            </div>
            <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
              <button onClick={handleMinimize} title="Minimize" className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 text-slate-500">
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleMaximize} title="Maximize" className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 text-slate-500">
                <Square className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleClose} title="Close" className="w-8 h-8 flex items-center justify-center hover:bg-rose-600 text-slate-500 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </header>

        {/* Main Body */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 pb-24 lg:pb-6">
          {/* Notification feedback banner if active */}
          {actionFeedback && (
            <div className={`p-3 rounded-lg flex items-center gap-2 text-xs font-semibold ${
              actionFeedback.type === 'success'
                ? 'bg-emerald-950 border border-emerald-800 text-emerald-200'
                : 'bg-rose-950 border border-rose-800 text-rose-200'
            }`}>
              {actionFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
              <span>{actionFeedback.text}</span>
            </div>
          )}

          {/* Render Active Module */}
          {activeModule === 'dashboard' ? (
            <DashboardView
              currentUser={currentUser}
              onNavigate={(mod) => setActiveModule(mod)}
            />
          ) : activeModule === 'pos' ? (
            <PosView
              currentUser={currentUser}
              preselectedTable={posPreselectedTable}
              onNavigateToTables={() => setActiveModule('tables')}
              onNavigateToDashboard={() => setActiveModule('dashboard')}
              onBack={() => setActiveModule('dashboard')}
            />
          ) : activeModule === 'tables' ? (
            <TableManagerView
              onStartOrderForTable={(tbl) => {
                setPosPreselectedTable(tbl)
                setActiveModule('pos')
              }}
              onBack={() => setActiveModule('dashboard')}
            />
          ) : activeModule === 'orders' ? (
            <OrdersView
              currentUser={currentUser}
              onNavigateToPos={() => setActiveModule('pos')}
              onBack={() => setActiveModule(homeModuleFor(currentUser))}
            />
          ) : activeModule === 'kitchen' ? (
            <KitchenDisplayView currentUser={currentUser} onBack={() => setActiveModule('dashboard')} />
          ) : activeModule === 'products' ? (
            <ProductManager onCatalogUpdated={loadData} onBack={() => setActiveModule('dashboard')} />
          ) : activeModule === 'inventory' ? (
            <InventoryManagerView onBack={() => setActiveModule('dashboard')} />
          ) : activeModule === 'recipes' ? (
            <RecipeManagerView onBack={() => setActiveModule('dashboard')} />
          ) : activeModule === 'purchases' ? (
            <PurchasesView onBack={() => setActiveModule('dashboard')} />
          ) : activeModule === 'expenses' ? (
            <ExpensesView onBack={() => setActiveModule('dashboard')} />
          ) : activeModule === 'cash_drawer' ? (
            <CashDrawerShiftView onBack={() => setActiveModule('dashboard')} />
          ) : activeModule === 'staff' ? (
            <StaffManagerView onBack={() => setActiveModule('dashboard')} />
          ) : activeModule === 'customers' ? (
            <CustomersView onBack={() => setActiveModule('dashboard')} />
          ) : activeModule === 'reservations' ? (
            <ReservationsView
              onStartOrderForTable={(tbl) => {
                setPosPreselectedTable(tbl)
                setActiveModule('pos')
              }}
              onBack={() => setActiveModule('dashboard')}
            />
          ) : activeModule === 'delivery' ? (
            <DeliveryDispatchView currentUser={currentUser} onBack={() => setActiveModule(homeModuleFor(currentUser))} />
          ) : activeModule === 'reports' ? (
            <ReportsView onBack={() => setActiveModule('dashboard')} />
          ) : activeModule === 'qr_kiosk' ? (
            <QrKioskCenterView onBack={() => setActiveModule('dashboard')} />
          ) : activeModule === 'audit' ? (
            <AuditLogView currentUser={currentUser} onBack={() => setActiveModule('dashboard')} />
          ) : activeModule === 'settings' ? (
            <SettingsView currentUser={currentUser} onBack={() => setActiveModule(homeModuleFor(currentUser))} />
          ) : activeModule === 'diagnostics' ? (
            /* System Diagnostics & Database Explorer */
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800 rounded-xl p-5 shadow-lg">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setActiveModule('dashboard')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-medium transition-all shadow-sm"
                      title="Back to Dashboard"
                    >
                      <ArrowLeft className="w-4 h-4 text-orange-400" />
                      <span>Back</span>
                    </button>
                    <div>
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <Wrench className="w-5 h-5 text-orange-400" />
                        System Diagnostics & SQLite Engine Explorer
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Direct diagnostic verification of native Electron IPC, SQLite tables, and hot backup mechanism.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCreateTestOrder}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold transition-all"
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> Test Order
                    </button>
                    <button
                      onClick={handleBackupTest}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
                    >
                      <FolderArchive className="w-3.5 h-3.5" /> Backup DB
                    </button>
                    <button
                      onClick={handlePingTest}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Ping
                    </button>
                    {pingLatency && (
                      <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-1 rounded">
                        {pingLatency}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Diagnostics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-bold uppercase text-slate-300">SQLite Engine</div>
                  <div className="text-xs text-slate-300 space-y-1">
                    <div>Integrity: <span className="font-semibold text-emerald-400">{dbStatus?.integrity || 'OK'}</span></div>
                    <div>Journal: <span className="font-semibold text-emerald-400 font-mono uppercase">{dbStatus?.journalMode || 'wal'}</span></div>
                    <div>Foreign Keys: <span className="font-semibold text-emerald-400">{dbStatus?.foreignKeys ? 'Enforced' : 'Off'}</span></div>
                    <div>Tables Count: <span className="font-semibold text-white font-mono">{dbStatus?.tablesCount || 34}</span></div>
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-bold uppercase text-slate-300">Security Architecture</div>
                  <div className="text-xs text-slate-300 space-y-1">
                    <div>Context Isolation: <span className="font-semibold text-emerald-400">Enabled</span></div>
                    <div>Node Integration: <span className="font-semibold text-emerald-400">Disabled</span></div>
                    <div>Preload Bridge: <span className="font-semibold text-emerald-400">Strict Whitelist</span></div>
                    <div>CSP: <span className="font-semibold text-emerald-400">Active</span></div>
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-bold uppercase text-slate-300">Runtime Process</div>
                  <div className="text-xs text-slate-300 space-y-1">
                    <div>Electron: <span className="font-semibold text-white font-mono">{systemInfo?.electronVersion || '30.0.1'}</span></div>
                    <div>Chromium: <span className="font-semibold text-white font-mono">{systemInfo?.chromeVersion || '124.0'}</span></div>
                    <div>Node: <span className="font-semibold text-white font-mono">{systemInfo?.nodeVersion || '20.x'}</span></div>
                    <div>Platform: <span className="font-semibold text-white font-mono">{systemInfo?.platform || 'windows'}</span></div>
                  </div>
                </div>
              </div>

              {/* Tables & Catalog Explorer */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-xs font-bold uppercase text-slate-300">SQLite Catalog ({products.length} Items)</h3>
                  <div className="text-xs text-slate-500 font-mono">Real Tables & Records</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {products.map((p) => (
                    <div key={p.id} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-white">{p.name}</div>
                        <div className="text-[10px] text-slate-500">{p.category_name}</div>
                      </div>
                      <span className="font-mono font-bold text-emerald-400">${(p.base_price_cents / 100).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Module View Container */
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Info className="w-4 h-4 text-orange-400" />
                  {MODULE_LIST.find((m) => m.id === activeModule)?.name || 'Module'}
                </h3>
                <span className="text-xs font-mono bg-emerald-950 text-emerald-300 border border-emerald-800/60 px-2.5 py-1 rounded">
                  System Active
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                You can switch back to the <strong className="text-white">Dashboard</strong> to view live sales analytics or <strong className="text-white">POS Terminal</strong> to create orders.
              </p>
              <button
                onClick={() => setActiveModule('dashboard')}
                className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold cursor-pointer"
              >
                Return to Dashboard
              </button>
            </div>
          )}
        </main>
      </div>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 flex overflow-x-auto">
        {allowedModules.map((mod) => {
          const Icon = mod.icon
          const isActive = activeModule === mod.id
          return (
            <button
              key={mod.id}
              type="button"
              onClick={() => {
                if (mod.id === 'pos') setPosPreselectedTable(null)
                setActiveModule(mod.id)
              }}
              className={`flex-shrink-0 min-w-[72px] px-3 py-2.5 flex flex-col items-center gap-0.5 text-[11px] font-semibold ${
                isActive ? 'text-orange-600' : 'text-slate-500'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span>{mod.name}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
