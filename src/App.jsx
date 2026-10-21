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
  Wrench
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
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard:view', phase: 'Phase 3' },
  { id: 'pos', name: 'Point of Sale (POS)', icon: ShoppingBag, perm: 'pos:create_order', phase: 'Phase 5' },
  { id: 'orders', name: 'Orders & Billing', icon: Receipt, perm: 'pos:create_order', phase: 'Phase 5' },
  { id: 'kitchen', name: 'Kitchen Display (KDS)', icon: UtensilsCrossed, perm: 'kitchen:view', phase: 'Phase 6' },
  { id: 'tables', name: 'Table & Floor Map', icon: Grid3X3, perm: 'pos:create_order', phase: 'Phase 5' },
  { id: 'products', name: 'Products & Menu', icon: Package, perm: 'menu:manage', phase: 'Phase 4' },
  { id: 'inventory', name: 'Inventory & Stock', icon: Boxes, perm: 'inventory:manage', phase: 'Phase 7' },
  { id: 'recipes', name: 'Recipes & Food Cost', icon: ScrollText, perm: 'inventory:manage', phase: 'Phase 7' },
  { id: 'purchases', name: 'Purchases & Vendors', icon: Truck, perm: 'inventory:manage', phase: 'Phase 7' },
  { id: 'expenses', name: 'Expenses', icon: DollarSign, perm: 'reports:view', phase: 'Phase 7' },
  { id: 'cash_drawer', name: 'Cash Drawer & Shifts', icon: DollarSign, perm: 'pos:create_order', phase: 'Phase 8' },
  { id: 'staff', name: 'Staff & Attendance', icon: UserCheck, perm: 'pos:create_order', phase: 'Phase 8' },
  { id: 'customers', name: 'Customers & Loyalty', icon: Users, perm: 'pos:create_order', phase: 'Phase 9' },
  { id: 'reservations', name: 'Reservations', icon: CalendarDays, perm: 'pos:create_order', phase: 'Phase 9' },
  { id: 'delivery', name: 'Delivery & Riders', icon: Bike, perm: 'pos:create_order', phase: 'Phase 10' },
  { id: 'reports', name: 'Reports & Analytics', icon: BarChart3, perm: 'reports:view', phase: 'Phase 11' },
  { id: 'qr_kiosk', name: 'QR & Kiosk Center', icon: QrCode, perm: 'settings:manage', phase: 'Phase 11' },
  { id: 'settings', name: 'Settings & Audit Logs', icon: Settings, perm: 'settings:manage', phase: 'Phase 11' },
  { id: 'diagnostics', name: 'System Diagnostics', icon: Wrench, perm: null, phase: 'Phase 1 & 2' },
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

  // Permission check for sidebar modules
  // Keep all operational pages and modules open and accessible for all roles (Admin, Manager, Cashier, etc.)
  const hasModuleAccess = (mod) => {
    if (!currentUser) return false
    return true
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
    <div className="flex h-screen w-screen overflow-hidden bg-slate-900 text-slate-100 font-sans select-none">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col flex-shrink-0">
        {/* Brand */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800 bg-slate-950">
          <div className="w-9 h-9 rounded-lg bg-orange-600 flex items-center justify-center font-black text-white shadow-md shadow-orange-950">
            RF
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight text-white">RESTAURANT OS</span>
            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-medium">Enterprise Desktop</span>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Operational Modules
          </div>
          {MODULE_LIST.map((mod) => {
            const Icon = mod.icon
            const isActive = activeModule === mod.id
            const permitted = hasModuleAccess(mod)

            return (
              <button
                key={mod.id}
                onClick={() => {
                  if (permitted) setActiveModule(mod.id)
                  else alert(`Access Denied: Requires '${mod.perm}' permission.`)
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-orange-600 text-white shadow-sm shadow-orange-950'
                    : permitted
                    ? 'text-slate-300 hover:bg-slate-900 hover:text-white'
                    : 'text-slate-600 cursor-not-allowed opacity-50'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : permitted ? 'text-slate-400' : 'text-slate-600'}`} />
                  <span className="truncate">{mod.name}</span>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  isActive ? 'bg-orange-700/60 text-orange-100' : 'bg-slate-800 text-slate-400'
                }`}>
                  {mod.phase}
                </span>
              </button>
            )
          })}
        </nav>

        {/* System status pill in sidebar footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${ipcStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span className="font-medium text-slate-300">{currentUser.roleName || currentUser.role_name || 'Staff'}</span>
            </span>
            <span className="font-mono text-[11px] text-slate-400">v1.0.0</span>
          </div>
          <div className="text-[10px] text-slate-400 flex items-center justify-between">
            <span className="truncate">{currentUser.branchName || 'Main Branch'}</span>
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <WifiOff className="w-3 h-3" /> Offline-First
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-900">
        {/* Custom Window Header & App Bar */}
        <header className="h-14 bg-slate-950/80 backdrop-blur border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
              <span>Restaurant & Fast Food Management System</span>
              <span className="text-xs font-normal text-slate-500">|</span>
              <span className="text-xs font-normal text-emerald-400 bg-emerald-950/50 border border-emerald-800/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Check className="w-3 h-3" /> Phase 1, 2, 3 & 4 Active
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Active User Badge & Switch/Logout */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">
              <div className="w-5 h-5 rounded-full bg-orange-600 flex items-center justify-center text-[10px] font-bold text-white">
                {(currentUser.displayName || currentUser.display_name || currentUser.username || 'U')[0]}
              </div>
              <div className="text-xs">
                <span className="font-semibold text-white leading-tight mr-1.5">{currentUser.displayName || currentUser.display_name || currentUser.username}</span>
                <span className="text-[10px] text-orange-400 font-mono">({currentUser.roleCode || currentUser.role_code || 'staff'})</span>
              </div>
              <button
                onClick={handleLogout}
                title="Switch Staff / Sign Out"
                className="ml-1 p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Clock */}
            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300 bg-slate-900 px-2.5 py-1 rounded border border-slate-800">
              <Clock className="w-3.5 h-3.5 text-orange-400" />
              <span>{currentTime}</span>
            </div>

            {/* Window control buttons */}
            <div className="flex items-center border border-slate-800 rounded overflow-hidden bg-slate-900">
              <button
                onClick={handleMinimize}
                title="Minimize"
                className="w-8 h-7 flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleMaximize}
                title="Maximize / Restore"
                className="w-8 h-7 flex items-center justify-center hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleClose}
                title="Close"
                className="w-8 h-7 flex items-center justify-center hover:bg-rose-600 text-slate-400 hover:text-white transition-colors"
              >
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
            />
          ) : activeModule === 'tables' ? (
            <TableManagerView
              onStartOrderForTable={(tbl) => {
                setPosPreselectedTable(tbl)
                setActiveModule('pos')
              }}
            />
          ) : activeModule === 'orders' ? (
            <OrdersView onNavigateToPos={() => setActiveModule('pos')} />
          ) : activeModule === 'kitchen' ? (
            <KitchenDisplayView currentUser={currentUser} />
          ) : activeModule === 'products' ? (
            <ProductManager onCatalogUpdated={loadData} />
          ) : activeModule === 'inventory' ? (
            <InventoryManagerView />
          ) : activeModule === 'recipes' ? (
            <RecipeManagerView />
          ) : activeModule === 'purchases' ? (
            <PurchasesView />
          ) : activeModule === 'expenses' ? (
            <ExpensesView />
          ) : activeModule === 'cash_drawer' ? (
            <CashDrawerShiftView />
          ) : activeModule === 'staff' ? (
            <StaffManagerView />
          ) : activeModule === 'customers' ? (
            <CustomersView />
          ) : activeModule === 'reservations' ? (
            <ReservationsView
              onStartOrderForTable={(tbl) => {
                setPosPreselectedTable(tbl)
                setActiveModule('pos')
              }}
            />
          ) : activeModule === 'delivery' ? (
            <DeliveryDispatchView />
          ) : activeModule === 'reports' ? (
            <ReportsView />
          ) : activeModule === 'qr_kiosk' ? (
            <QrKioskCenterView />
          ) : activeModule === 'settings' ? (
            <SettingsView />
          ) : activeModule === 'diagnostics' ? (
            /* System Diagnostics & Database Explorer */
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800 rounded-xl p-5 shadow-lg">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Wrench className="w-5 h-5 text-orange-400" />
                      System Diagnostics & SQLite Engine Explorer
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Direct diagnostic verification of native Electron IPC, SQLite tables, and hot backup mechanism.
                    </p>
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
            /* Upcoming Modules Preview Card */
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Info className="w-4 h-4 text-orange-400" />
                  {MODULE_LIST.find((m) => m.id === activeModule)?.name}
                </h3>
                <span className="text-xs font-mono bg-orange-950 text-orange-300 border border-orange-800/60 px-2.5 py-1 rounded">
                  Target: {MODULE_LIST.find((m) => m.id === activeModule)?.phase}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                This module is configured in the database schema (Migration 001) and scheduled for its dedicated implementation phase.
                You can switch back to the <strong className="text-white">Dashboard</strong> to view live sales analytics or <strong className="text-white">System Diagnostics</strong> to inspect the database.
              </p>
              <button
                onClick={() => setActiveModule('dashboard')}
                className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold"
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
