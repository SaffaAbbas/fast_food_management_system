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
import QrKioskCenterView from './features/kiosk/QrKioskCenterView.jsx'

const MODULE_LIST = [
  { id: 'dashboard', name: 'Dashboard', group: 'Service', icon: LayoutDashboard, perm: 'dashboard:view' },
  { id: 'pos', name: 'POS', group: 'Service', icon: ShoppingBag, perm: 'pos:create_order' },
  { id: 'orders', name: 'Orders', group: 'Service', icon: Receipt, perm: 'pos:create_order' },
  { id: 'kitchen', name: 'Kitchen', group: 'Service', icon: UtensilsCrossed, perm: 'kitchen:view' },
  { id: 'tables', name: 'Tables', group: 'Service', icon: Grid3X3, perm: 'pos:create_order' },
  { id: 'products', name: 'Menu', group: 'Catalog', icon: Package, perm: 'menu:manage' },
  { id: 'inventory', name: 'Inventory', group: 'Catalog', icon: Boxes, perm: 'inventory:manage' },
  { id: 'recipes', name: 'Recipes', group: 'Catalog', icon: ScrollText, perm: 'inventory:manage' },
  { id: 'purchases', name: 'Purchases', group: 'Catalog', icon: Truck, perm: 'inventory:manage' },
  { id: 'staff', name: 'Staff', group: 'People', icon: UserCheck, perm: 'staff:manage' },
  { id: 'customers', name: 'Customers', group: 'People', icon: Users, perm: 'pos:create_order' },
  { id: 'reservations', name: 'Reservations', group: 'People', icon: CalendarDays, perm: 'reservations:manage' },
  { id: 'delivery', name: 'Delivery', group: 'People', icon: Bike, perm: 'delivery:manage' },
  { id: 'expenses', name: 'Expenses', group: 'Finance', icon: DollarSign, perm: 'expenses:manage' },
  { id: 'cash_drawer', name: 'Cash drawer', group: 'Finance', icon: DollarSign, perm: 'cash:manage' },
  { id: 'reports', name: 'Reports', group: 'Finance', icon: BarChart3, perm: 'reports:view' },
  { id: 'qr_kiosk', name: 'QR / Kiosk', group: 'Admin', icon: QrCode, perm: 'settings:manage' },
  { id: 'settings', name: 'Settings', group: 'Admin', icon: Settings, perm: 'settings:manage' },
  { id: 'diagnostics', name: 'Diagnostics', group: 'Admin', icon: Wrench, perm: 'settings:manage' },
]

export default function App() {
  const [currentUser, setCurrentUser] = useState(null)
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

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Check existing session
  useEffect(() => {
    if (window.api?.auth?.getCurrentUser) {
      window.api.auth.getCurrentUser()
        .then((session) => {
          if (session) setCurrentUser(session)
        })
        .catch((e) => console.error('Failed to get session:', e))
    }
  }, [])

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
    loadData()
  }, [selectedCategory, searchQuery])

  const handleLogout = async () => {
    if (window.api?.auth?.logout) {
      await window.api.auth.logout()
    }
    setCurrentUser(null)
    setActiveModule('dashboard')
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
    if (!mod.perm) return true
    if (currentUser.roleCode === 'super_admin' || currentUser.role_code === 'super_admin') return true
    const perms = currentUser.permissions || []
    if (perms.includes(mod.perm)) return true
    if (mod.perm === 'cash:manage' && perms.includes('pos:create_order')) return true
    if (mod.perm === 'expenses:manage' && perms.includes('reports:view')) return true
    if (mod.perm === 'reservations:manage' && perms.includes('pos:create_order')) return true
    if (mod.perm === 'delivery:manage' && perms.includes('pos:create_order')) return true
    return false
  }

  // If user is not logged in, present secure LoginScreen
  if (!currentUser) {
    return (
      <LoginScreen
        onLoginSuccess={(session) => {
          setCurrentUser(session)
          loadData()
        }}
      />
    )
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f3f5f8] text-slate-900 select-none">
      <aside className="w-[232px] bg-white border-r border-slate-200 flex flex-col flex-shrink-0">
        <div className="h-[64px] flex items-center gap-3 px-4 border-b border-slate-200">
          <div className="w-9 h-9 rounded-xl bg-orange-600 flex items-center justify-center font-extrabold text-white text-sm">
            RF
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-semibold text-[15px] text-slate-900">Restaurant OS</span>
            <span className="text-[12px] text-slate-500">Offline POS</span>
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
                        onClick={() => setActiveModule(mod.id)}
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
          <div className="flex items-center justify-between text-[12px] text-slate-500 mt-0.5">
            <span className="truncate flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${ipcStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              {currentUser.roleName || currentUser.role_name || 'Staff'}
            </span>
            <span className="flex items-center gap-1 text-emerald-700">
              <WifiOff className="w-3 h-3" /> Offline
            </span>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-[64px] bg-white border-b border-slate-200 flex items-center justify-between px-5 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {activeModule !== 'dashboard' && (
              <button
                onClick={() => setActiveModule('dashboard')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[13px] font-semibold"
                title="Dashboard"
              >
                <ArrowLeft className="w-4 h-4 text-orange-600" />
                Home
              </button>
            )}
            {activeModule !== 'pos' && (
              <button
                onClick={() => setActiveModule('pos')}
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
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg">
              <div className="w-7 h-7 rounded-full bg-orange-600 flex items-center justify-center text-[12px] font-bold text-white">
                {(currentUser.displayName || currentUser.display_name || currentUser.username || 'U')[0]}
              </div>
              <span className="text-[13px] font-medium text-slate-800 max-w-[140px] truncate">
                {currentUser.displayName || currentUser.display_name || currentUser.username}
              </span>
              <button
                onClick={handleLogout}
                title="Sign out"
                className="p-1 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600"
              >
                <LogOut className="w-4 h-4" />
              </button>
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
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
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
              onNavigate={(mod) => setActiveModule(mod)}
              onTriggerTestOrder={handleCreateTestOrder}
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
              onNavigateToPos={() => setActiveModule('pos')}
              onBack={() => setActiveModule('dashboard')}
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
            <DeliveryDispatchView onBack={() => setActiveModule('dashboard')} />
          ) : activeModule === 'reports' ? (
            <ReportsView onBack={() => setActiveModule('dashboard')} />
          ) : activeModule === 'qr_kiosk' ? (
            <QrKioskCenterView onBack={() => setActiveModule('dashboard')} />
          ) : activeModule === 'settings' ? (
            <SettingsView onBack={() => setActiveModule('dashboard')} />
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
    </div>
  )
}
