import { ipcRenderer, contextBridge } from 'electron'
import { IPC_CHANNELS } from './ipc/channels.js'

// Whitelist of channels allowed for renderer invoke
const ALLOWED_INVOKE_CHANNELS = new Set([
  IPC_CHANNELS.APP_GET_INFO,
  IPC_CHANNELS.APP_PING,
  IPC_CHANNELS.WINDOW_IS_MAXIMIZED,
  IPC_CHANNELS.DB_STATUS,
  IPC_CHANNELS.DB_BACKUP,
  IPC_CHANNELS.DB_RESTORE,
  IPC_CHANNELS.AUTH_LOGIN,
  IPC_CHANNELS.AUTH_LOGOUT,
  IPC_CHANNELS.AUTH_CURRENT_USER,
  'auth:get-login-users',
  'dashboard:get-metrics',
  'db:get-settings',
  'db:get-categories',
  'db:get-products',
  'db:get-tables',
  'db:create-order',
  'db:get-recent-orders',
  // Product & Catalog channels
  'product:get-categories',
  'product:create-category',
  'product:update-category',
  'product:delete-category',
  'product:get-products',
  'product:get-product-details',
  'product:create-product',
  'product:update-product',
  'product:toggle-availability',
  'product:archive-product',
  'product:get-combos',
  'product:create-combo',
  'product:update-combo',
  'product:toggle-combo-availability',
  'product:archive-combo',
  // POS & Order Management (Phase 5)
  'pos:create-order',
  'pos:get-order',
  'pos:process-payment',
  'pos:hold-order',
  'pos:get-held-orders',
  'pos:cancel-order',
  'pos:get-orders',
  // Table & Floor Management (Phase 5)
  'table:get-floors-tables',
  'table:update-status',
  'table:transfer-table',
  'table:create-floor',
  'table:update-floor',
  'table:create-table',
  'table:update-table',
  'table:archive-table',
  // Customer CRM & Loyalty (Phase 9)
  'customer:get-customers',
  'customer:get-details',
  'customer:create',
  'customer:update',
  'customer:adjust-loyalty',
  'customer:get-summary',
  // Table Reservations (Phase 9)
  'reservation:get-reservations',
  'reservation:create',
  'reservation:update-status',
  'reservation:check-availability',
  // Coupons & Promotions (Phase 9)
  'coupon:get-coupons',
  'coupon:create',
  'coupon:update',
  'coupon:validate',
  // Kitchen Display System (Phase 6)
  'kitchen:get-orders',
  'kitchen:update-item-status',
  'kitchen:update-order-status',
  'kitchen:get-stations',
  'kitchen:create-station',
  'kitchen:update-station',
  'kitchen:get-metrics',
  // Inventory & Stock Management (Phase 7)
  'inventory:get-units',
  'inventory:create-unit',
  'inventory:get-items',
  'inventory:get-item',
  'inventory:create-item',
  'inventory:update-item',
  'inventory:adjust-stock',
  'inventory:get-movements',
  // Recipes & Food Cost (Phase 7)
  'recipe:get-recipes',
  'recipe:get-recipe',
  'recipe:save-recipe',
  // Suppliers & Purchases (Phase 7)
  'supplier:get-suppliers',
  'supplier:create',
  'supplier:update',
  'purchase:get-orders',
  'purchase:create-order',
  'purchase:record-payment',
  // Expenses (Phase 7)
  'expense:get-categories',
  'expense:get-expenses',
  'expense:create',
  'expense:get-summary',
  // Cash Drawer & Shift Management (Phase 8)
  'cash:get-current-session',
  'cash:open-session',
  'cash:record-movement',
  'cash:get-x-report',
  'cash:close-session',
  'cash:get-history',
  'cash:get-details',
  // Staff, Shifts & Attendance (Phase 8)
  'staff:get-employees',
  'staff:get-employee-by-id',
  'staff:create-employee',
  'staff:update-employee',
  'staff:clock-in',
  'staff:clock-out',
  'staff:get-attendance-logs',
  'staff:get-shifts',
  'staff:save-shift',
  'staff:get-performance',
  'staff:get-users',
  'staff:get-roles',
  'staff:create-user',
  'staff:update-user',
  // Delivery & Dispatch Management (Phase 10)
  'delivery:get-zones',
  'delivery:create-zone',
  'delivery:update-zone',
  'delivery:get-riders',
  'delivery:get-rider-by-id',
  'delivery:create-rider',
  'delivery:update-rider',
  'delivery:update-rider-status',
  'delivery:get-deliveries',
  'delivery:get-delivery-by-id',
  'delivery:create-delivery',
  'delivery:assign-rider',
  'delivery:dispatch',
  'delivery:complete',
  'delivery:fail',
  'delivery:get-rider-pending-cod',
  'delivery:settle-rider-cod',
  'delivery:get-settlement-history',
  'delivery:get-summary',
  // Reports & Analytics (Phase 11)
  'reports:get-sales-summary',
  'reports:get-product-performance',
  'reports:get-hourly-breakdown',
  'reports:get-profit-and-loss',
  'reports:get-void-audits',
  'reports:get-audit-logs',
  // System Settings (Phase 11)
  'settings:get-all',
  'settings:get',
  'settings:save-batch',
])

// Whitelist of channels allowed for renderer send
const ALLOWED_SEND_CHANNELS = new Set([
  IPC_CHANNELS.WINDOW_MINIMIZE,
  IPC_CHANNELS.WINDOW_MAXIMIZE,
  IPC_CHANNELS.WINDOW_CLOSE,
])

// Whitelist of channels allowed for main-to-renderer notifications
const ALLOWED_RECEIVE_CHANNELS = new Set([
  'kitchen:new-order',
  'kitchen:order-update',
  'pos:status-change',
  'inventory:low-stock',
  'db:sync-status',
])

// Secure API bridge exposed to the renderer under window.api
const api = {
  // App info & diagnostics
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_INFO),
    ping: (payload) => ipcRenderer.invoke(IPC_CHANNELS.APP_PING, payload),
  },

  // Window controls
  window: {
    minimize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE),
    maximize: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_MAXIMIZE),
    close: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE),
    isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
  },

  // Authentication & RBAC API
  auth: {
    login: (credentials) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN, credentials),
    logout: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),
    getCurrentUser: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_CURRENT_USER),
    getLoginUsers: () => ipcRenderer.invoke('auth:get-login-users'),
  },

  // Dashboard API
  dashboard: {
    getMetrics: (params = {}) => ipcRenderer.invoke('dashboard:get-metrics', params),
  },

  // Product & Menu Catalog API (Phase 4)
  product: {
    getCategories: (branchId) => ipcRenderer.invoke('product:get-categories', branchId),
    createCategory: (data) => ipcRenderer.invoke('product:create-category', data),
    updateCategory: (data) => ipcRenderer.invoke('product:update-category', data),
    deleteCategory: (id) => ipcRenderer.invoke('product:delete-category', id),
    getProducts: (params = {}) => ipcRenderer.invoke('product:get-products', params),
    getProductDetails: (id) => ipcRenderer.invoke('product:get-product-details', id),
    createProduct: (data) => ipcRenderer.invoke('product:create-product', data),
    updateProduct: (data) => ipcRenderer.invoke('product:update-product', data),
    toggleAvailability: (id, isAvailable) => ipcRenderer.invoke('product:toggle-availability', { id, isAvailable }),
    archiveProduct: (id) => ipcRenderer.invoke('product:archive-product', id),
    getCombos: (branchId) => ipcRenderer.invoke('product:get-combos', branchId),
    createCombo: (data) => ipcRenderer.invoke('product:create-combo', data),
    updateCombo: (data) => ipcRenderer.invoke('product:update-combo', data),
    toggleComboAvailability: (id, isAvailable) => ipcRenderer.invoke('product:toggle-combo-availability', { id, isAvailable }),
    archiveCombo: (id) => ipcRenderer.invoke('product:archive-combo', id),
  },

  // POS & Order Management API (Phase 5)
  pos: {
    createOrder: (data) => ipcRenderer.invoke('pos:create-order', data),
    getOrder: (orderId) => ipcRenderer.invoke('pos:get-order', orderId),
    processPayment: (data) => ipcRenderer.invoke('pos:process-payment', data),
    holdOrder: (data) => ipcRenderer.invoke('pos:hold-order', data),
    getHeldOrders: (branchId) => ipcRenderer.invoke('pos:get-held-orders', branchId),
    cancelOrder: (data) => ipcRenderer.invoke('pos:cancel-order', data),
    getOrders: (params = {}) => ipcRenderer.invoke('pos:get-orders', params),
  },

  // Table & Floor Management API (Phase 5)
  tables: {
    getFloorsWithTables: (branchId) => ipcRenderer.invoke('table:get-floors-tables', branchId),
    updateStatus: (data) => ipcRenderer.invoke('table:update-status', data),
    transferTable: (data) => ipcRenderer.invoke('table:transfer-table', data),
    createFloor: (data) => ipcRenderer.invoke('table:create-floor', data),
    updateFloor: (data) => ipcRenderer.invoke('table:update-floor', data),
    createTable: (data) => ipcRenderer.invoke('table:create-table', data),
    updateTable: (data) => ipcRenderer.invoke('table:update-table', data),
    archiveTable: (id) => ipcRenderer.invoke('table:archive-table', id),
  },

  // Customer Management API (Phase 5 & 8)
  customers: {
    getCustomers: (params = {}) => ipcRenderer.invoke('customer:get-customers', params),
    getDetails: (id) => ipcRenderer.invoke('customer:get-details', id),
    create: (data) => ipcRenderer.invoke('customer:create', data),
    update: (data) => ipcRenderer.invoke('customer:update', data),
  },

  // Kitchen Display System (KDS) API (Phase 6)
  kitchen: {
    getOrders: (params = {}) => ipcRenderer.invoke('kitchen:get-orders', params),
    updateItemStatus: (data) => ipcRenderer.invoke('kitchen:update-item-status', data),
    updateOrderStatus: (data) => ipcRenderer.invoke('kitchen:update-order-status', data),
    getStations: (branchId) => ipcRenderer.invoke('kitchen:get-stations', branchId),
    createStation: (data) => ipcRenderer.invoke('kitchen:create-station', data),
    updateStation: (id, data) => ipcRenderer.invoke('kitchen:update-station', { id, data }),
    getMetrics: (branchId) => ipcRenderer.invoke('kitchen:get-metrics', branchId),
  },

  // Inventory & Stock Management API (Phase 7)
  inventory: {
    getUnits: () => ipcRenderer.invoke('inventory:get-units'),
    createUnit: (data) => ipcRenderer.invoke('inventory:create-unit', data),
    getItems: (params = {}) => ipcRenderer.invoke('inventory:get-items', params),
    getItem: (id) => ipcRenderer.invoke('inventory:get-item', id),
    createItem: (data) => ipcRenderer.invoke('inventory:create-item', data),
    updateItem: (id, data) => ipcRenderer.invoke('inventory:update-item', { id, data }),
    adjustStock: (data) => ipcRenderer.invoke('inventory:adjust-stock', data),
    getMovements: (params = {}) => ipcRenderer.invoke('inventory:get-movements', params),
  },

  // Recipes & Food Cost API (Phase 7)
  recipes: {
    getRecipes: (params = {}) => ipcRenderer.invoke('recipe:get-recipes', params),
    getRecipe: (params) => ipcRenderer.invoke('recipe:get-recipe', params),
    saveRecipe: (data) => ipcRenderer.invoke('recipe:save-recipe', data),
  },

  // Suppliers & Purchases API (Phase 7)
  purchases: {
    getSuppliers: (branchId) => ipcRenderer.invoke('supplier:get-suppliers', branchId),
    createSupplier: (data) => ipcRenderer.invoke('supplier:create', data),
    updateSupplier: (id, data) => ipcRenderer.invoke('supplier:update', { id, data }),
    getOrders: (params = {}) => ipcRenderer.invoke('purchase:get-orders', params),
    createOrder: (data) => ipcRenderer.invoke('purchase:create-order', data),
    recordPayment: (data) => ipcRenderer.invoke('purchase:record-payment', data),
  },

  // Expense Management API (Phase 7)
  expenses: {
    getCategories: () => ipcRenderer.invoke('expense:get-categories'),
    getExpenses: (params = {}) => ipcRenderer.invoke('expense:get-expenses', params),
    createExpense: (data) => ipcRenderer.invoke('expense:create', data),
    getSummary: (params = {}) => ipcRenderer.invoke('expense:get-summary', params),
  },

  // Cash Drawer & Shift API (Phase 8)
  cashDrawer: {
    getCurrentSession: (params = {}) => ipcRenderer.invoke('cash:get-current-session', params),
    openSession: (data) => ipcRenderer.invoke('cash:open-session', data),
    recordMovement: (data) => ipcRenderer.invoke('cash:record-movement', data),
    getXReport: (sessionId) => ipcRenderer.invoke('cash:get-x-report', sessionId),
    closeSession: (data) => ipcRenderer.invoke('cash:close-session', data),
    getHistory: (params = {}) => ipcRenderer.invoke('cash:get-history', params),
    getDetails: (sessionId) => ipcRenderer.invoke('cash:get-details', sessionId),
  },

  // Staff & Attendance API (Phase 8)
  staff: {
    getEmployees: (params = {}) => ipcRenderer.invoke('staff:get-employees', params),
    getEmployeeById: (employeeId) => ipcRenderer.invoke('staff:get-employee-by-id', employeeId),
    createEmployee: (data) => ipcRenderer.invoke('staff:create-employee', data),
    updateEmployee: (id, data) => ipcRenderer.invoke('staff:update-employee', { id, data }),
    clockIn: (data) => ipcRenderer.invoke('staff:clock-in', data),
    clockOut: (data) => ipcRenderer.invoke('staff:clock-out', data),
    getAttendanceLogs: (params = {}) => ipcRenderer.invoke('staff:get-attendance-logs', params),
    getShifts: (branchId) => ipcRenderer.invoke('staff:get-shifts', branchId),
    saveShift: (data) => ipcRenderer.invoke('staff:save-shift', data),
    getPerformance: (params = {}) => ipcRenderer.invoke('staff:get-performance', params),
    getUsers: (branchId) => ipcRenderer.invoke('staff:get-users', branchId),
    getRoles: () => ipcRenderer.invoke('staff:get-roles'),
    createUser: (data) => ipcRenderer.invoke('staff:create-user', data),
    updateUser: (id, data) => ipcRenderer.invoke('staff:update-user', { id, data }),
  },

  // Customer CRM & Loyalty API (Phase 9)
  customers: {
    getCustomers: (params = {}) => ipcRenderer.invoke('customer:get-customers', params),
    getDetails: (id) => ipcRenderer.invoke('customer:get-details', id),
    create: (data) => ipcRenderer.invoke('customer:create', data),
    update: (id, data) => ipcRenderer.invoke('customer:update', { id, data }),
    adjustLoyalty: (data) => ipcRenderer.invoke('customer:adjust-loyalty', data),
    getSummary: (branchId) => ipcRenderer.invoke('customer:get-summary', branchId),
  },

  // Reservations API (Phase 9)
  reservations: {
    getReservations: (params = {}) => ipcRenderer.invoke('reservation:get-reservations', params),
    create: (data) => ipcRenderer.invoke('reservation:create', data),
    updateStatus: (id, status) => ipcRenderer.invoke('reservation:update-status', { id, status }),
    checkAvailability: (params = {}) => ipcRenderer.invoke('reservation:check-availability', params),
  },

  // Coupons API (Phase 9)
  coupons: {
    getCoupons: (branchId) => ipcRenderer.invoke('coupon:get-coupons', branchId),
    create: (data) => ipcRenderer.invoke('coupon:create', data),
    update: (id, data) => ipcRenderer.invoke('coupon:update', { id, data }),
    validate: (data) => ipcRenderer.invoke('coupon:validate', data),
  },

  // Delivery & Dispatch API (Phase 10)
  delivery: {
    getZones: (branchId) => ipcRenderer.invoke('delivery:get-zones', branchId),
    createZone: (data) => ipcRenderer.invoke('delivery:create-zone', data),
    updateZone: (id, data) => ipcRenderer.invoke('delivery:update-zone', { id, data }),
    getRiders: (params = {}) => ipcRenderer.invoke('delivery:get-riders', params),
    getRiderById: (id) => ipcRenderer.invoke('delivery:get-rider-by-id', id),
    createRider: (data) => ipcRenderer.invoke('delivery:create-rider', data),
    updateRider: (id, data) => ipcRenderer.invoke('delivery:update-rider', { id, data }),
    updateRiderStatus: (id, status) => ipcRenderer.invoke('delivery:update-rider-status', { id, status }),
    getDeliveries: (params = {}) => ipcRenderer.invoke('delivery:get-deliveries', params),
    getDeliveryById: (id) => ipcRenderer.invoke('delivery:get-delivery-by-id', id),
    createDelivery: (data) => ipcRenderer.invoke('delivery:create-delivery', data),
    assignRider: (deliveryId, riderId) => ipcRenderer.invoke('delivery:assign-rider', { deliveryId, riderId }),
    dispatch: (deliveryId) => ipcRenderer.invoke('delivery:dispatch', deliveryId),
    complete: (deliveryId, codCollectedCents) => ipcRenderer.invoke('delivery:complete', { deliveryId, codCollectedCents }),
    fail: (deliveryId, reason) => ipcRenderer.invoke('delivery:fail', { deliveryId, reason }),
    getRiderPendingCod: (riderId) => ipcRenderer.invoke('delivery:get-rider-pending-cod', riderId),
    settleRiderCod: (data) => ipcRenderer.invoke('delivery:settle-rider-cod', data),
    getSettlementHistory: (params = {}) => ipcRenderer.invoke('delivery:get-settlement-history', params),
    getSummary: (branchId) => ipcRenderer.invoke('delivery:get-summary', branchId),
  },

  // Reports API (Phase 11)
  reports: {
    getSalesSummary: (params = {}) => ipcRenderer.invoke('reports:get-sales-summary', params),
    getProductPerformance: (params = {}) => ipcRenderer.invoke('reports:get-product-performance', params),
    getHourlyBreakdown: (params = {}) => ipcRenderer.invoke('reports:get-hourly-breakdown', params),
    getProfitAndLoss: (params = {}) => ipcRenderer.invoke('reports:get-profit-and-loss', params),
    getVoidAudits: (params = {}) => ipcRenderer.invoke('reports:get-void-audits', params),
    getAuditLogs: (params = {}) => ipcRenderer.invoke('reports:get-audit-logs', params),
  },

  // Settings API (Phase 11)
  settings: {
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    get: (key) => ipcRenderer.invoke('settings:get', key),
    saveBatch: (obj) => ipcRenderer.invoke('settings:save-batch', obj),
  },

  // Database API
  db: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.DB_STATUS),
    getSettings: () => ipcRenderer.invoke('db:get-settings'),
    getCategories: (branchId) => ipcRenderer.invoke('db:get-categories', branchId),
    getProducts: (params = {}) => ipcRenderer.invoke('db:get-products', params),
    getTables: (branchId) => ipcRenderer.invoke('db:get-tables', branchId),
    createOrder: (orderData) => ipcRenderer.invoke('db:create-order', orderData),
    getRecentOrders: (params = {}) => ipcRenderer.invoke('db:get-recent-orders', params),
    backup: (targetPath) => ipcRenderer.invoke(IPC_CHANNELS.DB_BACKUP, targetPath),
    restore: (backupPath) => ipcRenderer.invoke(IPC_CHANNELS.DB_RESTORE, backupPath),
  },

  // Safe invoke with strict whitelist verification
  invoke: (channel, ...args) => {
    if (ALLOWED_INVOKE_CHANNELS.has(channel)) {
      return ipcRenderer.invoke(channel, ...args)
    }
    return Promise.reject(new Error(`[IPC Security] Blocked invoke on unauthorized channel: ${channel}`))
  },

  // Safe send with strict whitelist verification
  send: (channel, ...args) => {
    if (ALLOWED_SEND_CHANNELS.has(channel)) {
      ipcRenderer.send(channel, ...args)
    } else {
      console.warn(`[IPC Security] Blocked send on unauthorized channel: ${channel}`)
    }
  },

  // Safe event subscription with strict whitelist verification
  on: (channel, callback) => {
    if (ALLOWED_RECEIVE_CHANNELS.has(channel)) {
      const subscription = (_event, ...args) => callback(...args)
      ipcRenderer.on(channel, subscription)
      return () => ipcRenderer.removeListener(channel, subscription)
    }
    console.warn(`[IPC Security] Blocked listener on unauthorized channel: ${channel}`)
    return () => {}
  },
}

// Expose the protected API to renderer
contextBridge.exposeInMainWorld('api', api)
