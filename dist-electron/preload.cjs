"use strict";
const electron = require("electron");
const IPC_CHANNELS = {
  // App & System
  APP_GET_INFO: "app:get-info",
  APP_PING: "app:ping",
  // Window controls
  WINDOW_MINIMIZE: "window:minimize",
  WINDOW_MAXIMIZE: "window:maximize",
  WINDOW_CLOSE: "window:close",
  WINDOW_IS_MAXIMIZED: "window:is-maximized",
  DB_STATUS: "db:status",
  DB_BACKUP: "db:backup",
  DB_RESTORE: "db:restore",
  // Auth channels (Foundation for Phase 3)
  AUTH_LOGIN: "auth:login",
  AUTH_LOGOUT: "auth:logout",
  AUTH_CURRENT_USER: "auth:current-user"
};
const ALLOWED_INVOKE_CHANNELS = /* @__PURE__ */ new Set([
  IPC_CHANNELS.APP_GET_INFO,
  IPC_CHANNELS.APP_PING,
  IPC_CHANNELS.WINDOW_IS_MAXIMIZED,
  IPC_CHANNELS.DB_STATUS,
  IPC_CHANNELS.DB_BACKUP,
  IPC_CHANNELS.DB_RESTORE,
  "db:choose-backup-file",
  IPC_CHANNELS.AUTH_LOGIN,
  IPC_CHANNELS.AUTH_LOGOUT,
  IPC_CHANNELS.AUTH_CURRENT_USER,
  "auth:get-login-users",
  "auth:list-roles",
  "auth:mail-status",
  "auth:save-mail-config",
  "auth:signup",
  "auth:request-signup",
  "auth:resend-signup-otp",
  "auth:verify-signup",
  "auth:needs-setup",
  "auth:complete-setup",
  "dashboard:get-metrics",
  "dashboard:list-branches",
  "db:get-settings",
  "db:get-categories",
  "db:get-products",
  "db:get-tables",
  "db:create-order",
  "db:get-recent-orders",
  // Product & Catalog channels
  "product:get-categories",
  "product:create-category",
  "product:update-category",
  "product:delete-category",
  "product:get-products",
  "product:get-product-details",
  "product:create-product",
  "product:update-product",
  "product:toggle-availability",
  "product:archive-product",
  "product:get-combos",
  "product:create-combo",
  "product:update-combo",
  "product:toggle-combo-availability",
  "product:archive-combo",
  // POS & Order Management (Phase 5)
  "pos:create-order",
  "pos:get-order",
  "pos:process-payment",
  "pos:hold-order",
  "pos:get-held-orders",
  "pos:cancel-order",
  "pos:refund-order",
  "pos:get-orders",
  // Table & Floor Management (Phase 5)
  "table:get-floors-tables",
  "table:update-status",
  "table:transfer-table",
  "table:create-floor",
  "table:update-floor",
  "table:create-table",
  "table:update-table",
  "table:archive-table",
  "table:merge-tables",
  "table:split-bill",
  // Customer CRM & Loyalty (Phase 9)
  "customer:get-customers",
  "customer:get-details",
  "customer:create",
  "customer:update",
  "customer:adjust-loyalty",
  "customer:get-summary",
  "customer:merge",
  // Table Reservations (Phase 9)
  "reservation:get-reservations",
  "reservation:create",
  "reservation:update-status",
  "reservation:check-availability",
  // Coupons & Promotions (Phase 9)
  "coupon:get-coupons",
  "coupon:create",
  "coupon:update",
  "coupon:validate",
  "coupon:evaluate-auto",
  // Kitchen Display System (Phase 6)
  "kitchen:get-orders",
  "kitchen:update-item-status",
  "kitchen:update-order-status",
  "kitchen:accept-order",
  "kitchen:get-stations",
  "kitchen:create-station",
  "kitchen:update-station",
  "kitchen:get-metrics",
  // Inventory & Stock Management (Phase 7)
  "inventory:get-units",
  "inventory:create-unit",
  "inventory:get-items",
  "inventory:get-item",
  "inventory:create-item",
  "inventory:update-item",
  "inventory:adjust-stock",
  "inventory:get-movements",
  "inventory:transfer-stock",
  "inventory:get-alerts",
  "inventory:get-branches",
  // Recipes & Food Cost (Phase 7)
  "recipe:get-recipes",
  "recipe:get-recipe",
  "recipe:save-recipe",
  "recipe:set-active",
  "recipe:get-versions",
  // Suppliers & Purchases (Phase 7)
  "supplier:get-suppliers",
  "supplier:create",
  "supplier:update",
  "purchase:get-orders",
  "purchase:create-order",
  "purchase:record-payment",
  "purchase:receive-order",
  "purchase:return-items",
  "purchase:vendor-statement",
  // Expenses (Phase 7)
  "expense:get-categories",
  "expense:get-expenses",
  "expense:create",
  "expense:approve",
  "expense:cancel",
  "expense:get-summary",
  // Cash Drawer & Shift Management (Phase 8)
  "cash:get-current-session",
  "cash:open-session",
  "cash:record-movement",
  "cash:get-x-report",
  "cash:close-session",
  "cash:get-history",
  "cash:get-details",
  // Staff, Shifts & Attendance (Phase 8)
  "staff:get-employees",
  "staff:get-employee-by-id",
  "staff:create-employee",
  "staff:update-employee",
  "staff:clock-in",
  "staff:mark-attendance",
  "staff:clock-out",
  "staff:get-attendance-logs",
  "staff:get-shifts",
  "staff:save-shift",
  "staff:get-performance",
  "staff:get-users",
  "staff:get-roles",
  "staff:create-user",
  "staff:update-user",
  // Delivery & Dispatch Management (Phase 10)
  "delivery:get-zones",
  "delivery:create-zone",
  "delivery:update-zone",
  "delivery:get-riders",
  "delivery:get-rider-by-id",
  "delivery:create-rider",
  "delivery:update-rider",
  "delivery:update-rider-status",
  "delivery:get-deliveries",
  "delivery:get-delivery-by-id",
  "delivery:create-delivery",
  "delivery:assign-rider",
  "delivery:dispatch",
  "delivery:complete",
  "delivery:fail",
  "delivery:get-rider-pending-cod",
  "delivery:settle-rider-cod",
  "delivery:get-settlement-history",
  "delivery:get-summary",
  // Reports & Analytics (Phase 11)
  "reports:get-sales-summary",
  "reports:get-product-performance",
  "reports:get-hourly-breakdown",
  "reports:get-profit-and-loss",
  "reports:get-void-audits",
  "reports:get-audit-logs",
  "reports:get-staff-sales",
  "reports:get-customer-report",
  "reports:get-kitchen-report",
  "reports:get-delivery-report",
  "reports:get-inventory-report",
  "reports:get-expense-report",
  "reports:get-reservation-report",
  "reports:get-refund-report",
  "reports:get-food-cost",
  "reports:get-purchase-report",
  "reports:get-vendor-statement",
  "reports:get-cashier-report",
  "reports:get-branch-comparison",
  "reports:get-lookups",
  "media:save",
  "media:get-data-url",
  // System Settings (Phase 11)
  "settings:get-all",
  "settings:get",
  "settings:save-batch",
  "sync:get-status",
  "sync:get-config",
  "sync:save-config",
  "sync:run-now",
  "sync:notify-network",
  "pos:record-print"
]);
const ALLOWED_SEND_CHANNELS = /* @__PURE__ */ new Set([
  IPC_CHANNELS.WINDOW_MINIMIZE,
  IPC_CHANNELS.WINDOW_MAXIMIZE,
  IPC_CHANNELS.WINDOW_CLOSE
]);
const ALLOWED_RECEIVE_CHANNELS = /* @__PURE__ */ new Set([
  "kitchen:new-order",
  "kitchen:order-update",
  "pos:status-change",
  "inventory:low-stock",
  "db:sync-status"
]);
const api = {
  // App info & diagnostics
  app: {
    getInfo: () => electron.ipcRenderer.invoke(IPC_CHANNELS.APP_GET_INFO),
    ping: (payload) => electron.ipcRenderer.invoke(IPC_CHANNELS.APP_PING, payload)
  },
  // Window controls
  window: {
    minimize: () => electron.ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE),
    maximize: () => electron.ipcRenderer.send(IPC_CHANNELS.WINDOW_MAXIMIZE),
    close: () => electron.ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE),
    isMaximized: () => electron.ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED)
  },
  // Authentication & RBAC API
  auth: {
    login: (credentials) => electron.ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN, credentials),
    logout: (token) => electron.ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT, typeof token === "string" ? token : void 0),
    getCurrentUser: (token) => electron.ipcRenderer.invoke(
      IPC_CHANNELS.AUTH_CURRENT_USER,
      typeof token === "string" ? token : void 0
    ),
    getLoginUsers: () => electron.ipcRenderer.invoke("auth:get-login-users"),
    listRoles: () => electron.ipcRenderer.invoke("auth:list-roles"),
    mailStatus: () => electron.ipcRenderer.invoke("auth:mail-status"),
    saveMailConfig: (payload) => electron.ipcRenderer.invoke("auth:save-mail-config", payload),
    signup: (payload) => electron.ipcRenderer.invoke("auth:signup", payload),
    requestSignup: (payload) => electron.ipcRenderer.invoke("auth:request-signup", payload),
    resendSignupOtp: (payload) => electron.ipcRenderer.invoke("auth:resend-signup-otp", payload),
    verifySignup: (payload) => electron.ipcRenderer.invoke("auth:verify-signup", payload),
    needsSetup: () => electron.ipcRenderer.invoke("auth:needs-setup"),
    completeSetup: (payload) => electron.ipcRenderer.invoke("auth:complete-setup", payload)
  },
  // Dashboard API
  dashboard: {
    getMetrics: (params = {}) => electron.ipcRenderer.invoke("dashboard:get-metrics", params),
    listBranches: () => electron.ipcRenderer.invoke("dashboard:list-branches")
  },
  // Product & Menu Catalog API (Phase 4)
  product: {
    getCategories: (branchId) => electron.ipcRenderer.invoke("product:get-categories", branchId),
    createCategory: (data) => electron.ipcRenderer.invoke("product:create-category", data),
    updateCategory: (data) => electron.ipcRenderer.invoke("product:update-category", data),
    deleteCategory: (id) => electron.ipcRenderer.invoke("product:delete-category", id),
    getProducts: (params = {}) => electron.ipcRenderer.invoke("product:get-products", params),
    getProductDetails: (id) => electron.ipcRenderer.invoke("product:get-product-details", id),
    createProduct: (data) => electron.ipcRenderer.invoke("product:create-product", data),
    updateProduct: (data) => electron.ipcRenderer.invoke("product:update-product", data),
    toggleAvailability: (id, isAvailable) => electron.ipcRenderer.invoke("product:toggle-availability", { id, isAvailable }),
    archiveProduct: (id) => electron.ipcRenderer.invoke("product:archive-product", id),
    getCombos: (branchId) => electron.ipcRenderer.invoke("product:get-combos", branchId),
    createCombo: (data) => electron.ipcRenderer.invoke("product:create-combo", data),
    updateCombo: (data) => electron.ipcRenderer.invoke("product:update-combo", data),
    toggleComboAvailability: (id, isAvailable) => electron.ipcRenderer.invoke("product:toggle-combo-availability", { id, isAvailable }),
    archiveCombo: (id) => electron.ipcRenderer.invoke("product:archive-combo", id)
  },
  // POS & Order Management API (Phase 5)
  pos: {
    createOrder: (data) => electron.ipcRenderer.invoke("pos:create-order", data),
    getOrder: (orderId) => electron.ipcRenderer.invoke("pos:get-order", orderId),
    processPayment: (data) => electron.ipcRenderer.invoke("pos:process-payment", data),
    holdOrder: (data) => electron.ipcRenderer.invoke("pos:hold-order", data),
    getHeldOrders: (branchId) => electron.ipcRenderer.invoke("pos:get-held-orders", branchId),
    cancelOrder: (data) => electron.ipcRenderer.invoke("pos:cancel-order", data),
    refundOrder: (data) => electron.ipcRenderer.invoke("pos:refund-order", data),
    getOrders: (params = {}) => electron.ipcRenderer.invoke("pos:get-orders", params),
    recordPrint: (data) => electron.ipcRenderer.invoke("pos:record-print", data)
  },
  // Table & Floor Management API (Phase 5)
  tables: {
    getFloorsWithTables: (branchId) => electron.ipcRenderer.invoke("table:get-floors-tables", branchId),
    updateStatus: (data) => electron.ipcRenderer.invoke("table:update-status", data),
    transferTable: (data) => electron.ipcRenderer.invoke("table:transfer-table", data),
    createFloor: (data) => electron.ipcRenderer.invoke("table:create-floor", data),
    updateFloor: (data) => electron.ipcRenderer.invoke("table:update-floor", data),
    createTable: (data) => electron.ipcRenderer.invoke("table:create-table", data),
    updateTable: (data) => electron.ipcRenderer.invoke("table:update-table", data),
    archiveTable: (id) => electron.ipcRenderer.invoke("table:archive-table", id),
    mergeTables: (data) => electron.ipcRenderer.invoke("table:merge-tables", data),
    splitBill: (data) => electron.ipcRenderer.invoke("table:split-bill", data)
  },
  // Customer Management API (Phase 5 & 8)
  customers: {
    getCustomers: (params = {}) => electron.ipcRenderer.invoke("customer:get-customers", params),
    getDetails: (id) => electron.ipcRenderer.invoke("customer:get-details", id),
    create: (data) => electron.ipcRenderer.invoke("customer:create", data),
    update: (data) => electron.ipcRenderer.invoke("customer:update", data)
  },
  // Kitchen Display System (KDS) API (Phase 6)
  kitchen: {
    getOrders: (params = {}) => electron.ipcRenderer.invoke("kitchen:get-orders", params),
    updateItemStatus: (data) => electron.ipcRenderer.invoke("kitchen:update-item-status", data),
    updateOrderStatus: (data) => electron.ipcRenderer.invoke("kitchen:update-order-status", data),
    acceptOrder: (data) => electron.ipcRenderer.invoke("kitchen:accept-order", data),
    getStations: (branchId) => electron.ipcRenderer.invoke("kitchen:get-stations", branchId),
    createStation: (data) => electron.ipcRenderer.invoke("kitchen:create-station", data),
    updateStation: (id, data) => electron.ipcRenderer.invoke("kitchen:update-station", { id, data }),
    getMetrics: (branchId) => electron.ipcRenderer.invoke("kitchen:get-metrics", branchId)
  },
  // Inventory & Stock Management API (Phase 7)
  inventory: {
    getUnits: () => electron.ipcRenderer.invoke("inventory:get-units"),
    createUnit: (data) => electron.ipcRenderer.invoke("inventory:create-unit", data),
    getItems: (params = {}) => electron.ipcRenderer.invoke("inventory:get-items", params),
    getItem: (id) => electron.ipcRenderer.invoke("inventory:get-item", id),
    createItem: (data) => electron.ipcRenderer.invoke("inventory:create-item", data),
    updateItem: (id, data) => electron.ipcRenderer.invoke("inventory:update-item", { id, data }),
    adjustStock: (data) => electron.ipcRenderer.invoke("inventory:adjust-stock", data),
    getMovements: (params = {}) => electron.ipcRenderer.invoke("inventory:get-movements", params),
    transferStock: (data) => electron.ipcRenderer.invoke("inventory:transfer-stock", data),
    getAlerts: (params = {}) => electron.ipcRenderer.invoke("inventory:get-alerts", params),
    getBranches: () => electron.ipcRenderer.invoke("inventory:get-branches")
  },
  // Recipes & Food Cost API (Phase 7)
  recipes: {
    getRecipes: (params = {}) => electron.ipcRenderer.invoke("recipe:get-recipes", params),
    getRecipe: (params) => electron.ipcRenderer.invoke("recipe:get-recipe", params),
    saveRecipe: (data) => electron.ipcRenderer.invoke("recipe:save-recipe", data),
    setActive: (id, isActive) => electron.ipcRenderer.invoke("recipe:set-active", { id, isActive }),
    getVersions: (recipeId) => electron.ipcRenderer.invoke("recipe:get-versions", recipeId)
  },
  // Suppliers & Purchases API (Phase 7)
  purchases: {
    getSuppliers: (branchId) => electron.ipcRenderer.invoke("supplier:get-suppliers", branchId),
    createSupplier: (data) => electron.ipcRenderer.invoke("supplier:create", data),
    updateSupplier: (id, data) => electron.ipcRenderer.invoke("supplier:update", { id, data }),
    getOrders: (params = {}) => electron.ipcRenderer.invoke("purchase:get-orders", params),
    createOrder: (data) => electron.ipcRenderer.invoke("purchase:create-order", data),
    recordPayment: (data) => electron.ipcRenderer.invoke("purchase:record-payment", data),
    receiveOrder: (data) => electron.ipcRenderer.invoke("purchase:receive-order", data),
    returnItems: (data) => electron.ipcRenderer.invoke("purchase:return-items", data),
    getVendorStatement: (params) => electron.ipcRenderer.invoke("purchase:vendor-statement", params)
  },
  // Expense Management API (Phase 7)
  expenses: {
    getCategories: () => electron.ipcRenderer.invoke("expense:get-categories"),
    getExpenses: (params = {}) => electron.ipcRenderer.invoke("expense:get-expenses", params),
    createExpense: (data) => electron.ipcRenderer.invoke("expense:create", data),
    create: (data) => electron.ipcRenderer.invoke("expense:create", data),
    approve: (id) => electron.ipcRenderer.invoke("expense:approve", id),
    cancel: (data) => electron.ipcRenderer.invoke("expense:cancel", data),
    getSummary: (params = {}) => electron.ipcRenderer.invoke("expense:get-summary", params)
  },
  // Cash Drawer & Shift API (Phase 8)
  cashDrawer: {
    getCurrentSession: (params = {}) => electron.ipcRenderer.invoke("cash:get-current-session", params),
    openSession: (data) => electron.ipcRenderer.invoke("cash:open-session", data),
    recordMovement: (data) => electron.ipcRenderer.invoke("cash:record-movement", data),
    getXReport: (sessionId) => electron.ipcRenderer.invoke("cash:get-x-report", sessionId),
    closeSession: (data) => electron.ipcRenderer.invoke("cash:close-session", data),
    getHistory: (params = {}) => electron.ipcRenderer.invoke("cash:get-history", params),
    getDetails: (sessionId) => electron.ipcRenderer.invoke("cash:get-details", sessionId)
  },
  // Staff & Attendance API (Phase 8)
  staff: {
    getEmployees: (params = {}) => electron.ipcRenderer.invoke("staff:get-employees", params),
    getEmployeeById: (employeeId) => electron.ipcRenderer.invoke("staff:get-employee-by-id", employeeId),
    createEmployee: (data) => electron.ipcRenderer.invoke("staff:create-employee", data),
    updateEmployee: (id, data) => electron.ipcRenderer.invoke("staff:update-employee", { id, data }),
    clockIn: (data) => electron.ipcRenderer.invoke("staff:clock-in", data),
    markAttendance: (data) => electron.ipcRenderer.invoke("staff:mark-attendance", data),
    clockOut: (data) => electron.ipcRenderer.invoke("staff:clock-out", data),
    getAttendanceLogs: (params = {}) => electron.ipcRenderer.invoke("staff:get-attendance-logs", params),
    getShifts: (branchId) => electron.ipcRenderer.invoke("staff:get-shifts", branchId),
    saveShift: (data) => electron.ipcRenderer.invoke("staff:save-shift", data),
    getPerformance: (params = {}) => electron.ipcRenderer.invoke("staff:get-performance", params),
    getUsers: (branchId) => electron.ipcRenderer.invoke("staff:get-users", branchId),
    getRoles: () => electron.ipcRenderer.invoke("staff:get-roles"),
    createUser: (data) => electron.ipcRenderer.invoke("staff:create-user", data),
    updateUser: (id, data) => electron.ipcRenderer.invoke("staff:update-user", { id, data })
  },
  // Customer CRM & Loyalty API (Phase 9)
  customers: {
    getCustomers: (params = {}) => electron.ipcRenderer.invoke("customer:get-customers", params),
    getDetails: (id) => electron.ipcRenderer.invoke("customer:get-details", id),
    create: (data) => electron.ipcRenderer.invoke("customer:create", data),
    update: (id, data) => electron.ipcRenderer.invoke("customer:update", { id, data }),
    adjustLoyalty: (data) => electron.ipcRenderer.invoke("customer:adjust-loyalty", data),
    getSummary: (branchId) => electron.ipcRenderer.invoke("customer:get-summary", branchId),
    merge: (data) => electron.ipcRenderer.invoke("customer:merge", data)
  },
  // Reservations API (Phase 9)
  reservations: {
    getReservations: (params = {}) => electron.ipcRenderer.invoke("reservation:get-reservations", params),
    create: (data) => electron.ipcRenderer.invoke("reservation:create", data),
    updateStatus: (id, status) => electron.ipcRenderer.invoke("reservation:update-status", { id, status }),
    checkAvailability: (params = {}) => electron.ipcRenderer.invoke("reservation:check-availability", params)
  },
  // Coupons API (Phase 9)
  coupons: {
    getCoupons: (branchId) => electron.ipcRenderer.invoke("coupon:get-coupons", branchId),
    create: (data) => electron.ipcRenderer.invoke("coupon:create", data),
    update: (id, data) => electron.ipcRenderer.invoke("coupon:update", { id, data }),
    validate: (data) => electron.ipcRenderer.invoke("coupon:validate", data),
    evaluateAuto: (data) => electron.ipcRenderer.invoke("coupon:evaluate-auto", data)
  },
  // Delivery & Dispatch API (Phase 10)
  delivery: {
    getZones: (branchId) => electron.ipcRenderer.invoke("delivery:get-zones", branchId),
    createZone: (data) => electron.ipcRenderer.invoke("delivery:create-zone", data),
    updateZone: (id, data) => electron.ipcRenderer.invoke("delivery:update-zone", { id, data }),
    getRiders: (params = {}) => electron.ipcRenderer.invoke("delivery:get-riders", params),
    getRiderById: (id) => electron.ipcRenderer.invoke("delivery:get-rider-by-id", id),
    createRider: (data) => electron.ipcRenderer.invoke("delivery:create-rider", data),
    updateRider: (id, data) => electron.ipcRenderer.invoke("delivery:update-rider", { id, data }),
    updateRiderStatus: (id, status) => electron.ipcRenderer.invoke("delivery:update-rider-status", { id, status }),
    getDeliveries: (params = {}) => electron.ipcRenderer.invoke("delivery:get-deliveries", params),
    getDeliveryById: (id) => electron.ipcRenderer.invoke("delivery:get-delivery-by-id", id),
    createDelivery: (data) => electron.ipcRenderer.invoke("delivery:create-delivery", data),
    assignRider: (deliveryId, riderId) => electron.ipcRenderer.invoke("delivery:assign-rider", { deliveryId, riderId }),
    dispatch: (deliveryId) => electron.ipcRenderer.invoke("delivery:dispatch", deliveryId),
    complete: (deliveryId, codCollectedCents) => electron.ipcRenderer.invoke("delivery:complete", { deliveryId, codCollectedCents }),
    fail: (deliveryId, reason) => electron.ipcRenderer.invoke("delivery:fail", { deliveryId, reason }),
    getRiderPendingCod: (riderId) => electron.ipcRenderer.invoke("delivery:get-rider-pending-cod", riderId),
    settleRiderCod: (data) => electron.ipcRenderer.invoke("delivery:settle-rider-cod", data),
    getSettlementHistory: (params = {}) => electron.ipcRenderer.invoke("delivery:get-settlement-history", params),
    getSummary: (branchId) => electron.ipcRenderer.invoke("delivery:get-summary", branchId)
  },
  // Reports API (Phase 11)
  reports: {
    getSalesSummary: (params = {}) => electron.ipcRenderer.invoke("reports:get-sales-summary", params),
    getProductPerformance: (params = {}) => electron.ipcRenderer.invoke("reports:get-product-performance", params),
    getHourlyBreakdown: (params = {}) => electron.ipcRenderer.invoke("reports:get-hourly-breakdown", params),
    getProfitAndLoss: (params = {}) => electron.ipcRenderer.invoke("reports:get-profit-and-loss", params),
    getVoidAudits: (params = {}) => electron.ipcRenderer.invoke("reports:get-void-audits", params),
    getAuditLogs: (params = {}) => electron.ipcRenderer.invoke("reports:get-audit-logs", params),
    getStaffSales: (params = {}) => electron.ipcRenderer.invoke("reports:get-staff-sales", params),
    getCustomerReport: (params = {}) => electron.ipcRenderer.invoke("reports:get-customer-report", params),
    getKitchenReport: (params = {}) => electron.ipcRenderer.invoke("reports:get-kitchen-report", params),
    getDeliveryReport: (params = {}) => electron.ipcRenderer.invoke("reports:get-delivery-report", params),
    getInventoryReport: (params = {}) => electron.ipcRenderer.invoke("reports:get-inventory-report", params),
    getExpenseReport: (params = {}) => electron.ipcRenderer.invoke("reports:get-expense-report", params),
    getReservationReport: (params = {}) => electron.ipcRenderer.invoke("reports:get-reservation-report", params),
    getRefundReport: (params = {}) => electron.ipcRenderer.invoke("reports:get-refund-report", params),
    getFoodCost: (params = {}) => electron.ipcRenderer.invoke("reports:get-food-cost", params),
    getPurchaseReport: (params = {}) => electron.ipcRenderer.invoke("reports:get-purchase-report", params),
    getVendorStatement: (params = {}) => electron.ipcRenderer.invoke("reports:get-vendor-statement", params),
    getCashierReport: (params = {}) => electron.ipcRenderer.invoke("reports:get-cashier-report", params),
    getBranchComparison: (params = {}) => electron.ipcRenderer.invoke("reports:get-branch-comparison", params),
    getLookups: () => electron.ipcRenderer.invoke("reports:get-lookups")
  },
  media: {
    save: (payload) => electron.ipcRenderer.invoke("media:save", payload),
    getDataUrl: (id) => electron.ipcRenderer.invoke("media:get-data-url", id)
  },
  sync: {
    getStatus: () => electron.ipcRenderer.invoke("sync:get-status"),
    getConfig: () => electron.ipcRenderer.invoke("sync:get-config"),
    saveConfig: (payload) => electron.ipcRenderer.invoke("sync:save-config", payload),
    runNow: () => electron.ipcRenderer.invoke("sync:run-now"),
    notifyNetwork: (online) => electron.ipcRenderer.invoke("sync:notify-network", online)
  },
  // Settings API (Phase 11)
  settings: {
    getAll: () => electron.ipcRenderer.invoke("settings:get-all"),
    get: (key) => electron.ipcRenderer.invoke("settings:get", key),
    saveBatch: (obj) => electron.ipcRenderer.invoke("settings:save-batch", obj)
  },
  // Database API
  db: {
    getStatus: () => electron.ipcRenderer.invoke(IPC_CHANNELS.DB_STATUS),
    getSettings: () => electron.ipcRenderer.invoke("db:get-settings"),
    getCategories: (branchId) => electron.ipcRenderer.invoke("db:get-categories", branchId),
    getProducts: (params = {}) => electron.ipcRenderer.invoke("db:get-products", params),
    getTables: (branchId) => electron.ipcRenderer.invoke("db:get-tables", branchId),
    createOrder: (orderData) => electron.ipcRenderer.invoke("db:create-order", orderData),
    getRecentOrders: (params = {}) => electron.ipcRenderer.invoke("db:get-recent-orders", params),
    backup: (targetPath) => electron.ipcRenderer.invoke(IPC_CHANNELS.DB_BACKUP, targetPath),
    restore: (backupPath) => electron.ipcRenderer.invoke(IPC_CHANNELS.DB_RESTORE, backupPath),
    chooseBackupFile: () => electron.ipcRenderer.invoke("db:choose-backup-file")
  },
  // Safe invoke with strict whitelist verification
  invoke: (channel, ...args) => {
    if (ALLOWED_INVOKE_CHANNELS.has(channel)) {
      return electron.ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`[IPC Security] Blocked invoke on unauthorized channel: ${channel}`));
  },
  // Safe send with strict whitelist verification
  send: (channel, ...args) => {
    if (ALLOWED_SEND_CHANNELS.has(channel)) {
      electron.ipcRenderer.send(channel, ...args);
    } else {
      console.warn(`[IPC Security] Blocked send on unauthorized channel: ${channel}`);
    }
  },
  // Safe event subscription with strict whitelist verification
  on: (channel, callback) => {
    if (ALLOWED_RECEIVE_CHANNELS.has(channel)) {
      const subscription = (_event, ...args) => callback(...args);
      electron.ipcRenderer.on(channel, subscription);
      return () => electron.ipcRenderer.removeListener(channel, subscription);
    }
    console.warn(`[IPC Security] Blocked listener on unauthorized channel: ${channel}`);
    return () => {
    };
  }
};
electron.contextBridge.exposeInMainWorld("api", api);
