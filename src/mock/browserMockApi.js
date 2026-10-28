/**
 * Browser Mock API Layer for Web Browser & Vercel Deployments
 * Automatically attaches to `window.api` when running outside the Electron desktop runtime.
 * Provides complete LocalStorage persistence and full CRUD capability.
 */

import * as DUMMY from './dummyData.js'

const MOCK_SEED_VERSION = 13

function isDirectImageSrc(value) {
  return (
    typeof value === 'string' &&
    (value.startsWith('data:image/') ||
      value.startsWith('http://') ||
      value.startsWith('https://') ||
      value.startsWith('/'))
  )
}

function mergeCatalogImages(existing, seeded) {
  const byId = Object.fromEntries(seeded.map((item) => [item.id, item]))
  const merged = existing.map((item) => {
    const seed = byId[item.id]
    if (seed?.image_url) return { ...item, image_url: seed.image_url }
    return item
  })
  for (const seed of seeded) {
    if (!merged.some((item) => item.id === seed.id)) merged.push(seed)
  }
  return merged
}

function getStorage(key, defaultVal) {
  try {
    const val = localStorage.getItem(`pos_mock_${key}`)
    return val ? JSON.parse(val) : defaultVal
  } catch (e) {
    return defaultVal
  }
}

function setStorage(key, val) {
  try {
    localStorage.setItem(`pos_mock_${key}`, JSON.stringify(val))
  } catch (e) {}
}

export function initBrowserMockApi() {
  if (typeof window === 'undefined' || window.api) {
    // Already in Electron desktop runtime with native SQLite
    return
  }

  console.log('[Browser Mock] Initializing in-browser mock bridge for Vercel/Web environment...')

  // Initialize or fetch state from localStorage
  let users = getStorage('users', DUMMY.INITIAL_USERS)
  const rawUser = getStorage('current_user', users[0] || DUMMY.INITIAL_USERS[0])
  let currentUser = rawUser
    ? {
        ...rawUser,
        roleCode: rawUser.roleCode || rawUser.role_code || 'super_admin',
        roleName: rawUser.roleName || rawUser.role_name || 'Super Administrator',
        permissions: DUMMY.ALL_PERMISSIONS,
        branchName: rawUser.branchName || 'Main Flagship Branch',
      }
    : null
  let categories = getStorage('categories', DUMMY.INITIAL_CATEGORIES)
  let products = getStorage('products', DUMMY.INITIAL_PRODUCTS)
  let combos = getStorage('combos', DUMMY.INITIAL_COMBOS)
  let floors = getStorage('floors', DUMMY.INITIAL_FLOORS)
  let stations = getStorage('stations', DUMMY.INITIAL_STATIONS)
  let suppliers = getStorage('suppliers', DUMMY.INITIAL_SUPPLIERS)
  let purchaseOrders = getStorage('purchase_orders', DUMMY.INITIAL_PURCHASE_ORDERS)
  let inventoryItems = getStorage('inventory_items', DUMMY.INITIAL_INVENTORY_ITEMS)
  let expenseCategories = getStorage('expense_categories', DUMMY.INITIAL_EXPENSE_CATEGORIES)
  let expenses = getStorage('expenses', DUMMY.INITIAL_EXPENSES)
  let customers = getStorage('customers', DUMMY.INITIAL_CUSTOMERS)
  let coupons = getStorage('coupons', DUMMY.INITIAL_COUPONS)
  let reservations = getStorage('reservations', DUMMY.INITIAL_RESERVATIONS)
  let shifts = getStorage('shifts', DUMMY.INITIAL_STAFF_SHIFTS)
  let employees = getStorage('employees', DUMMY.INITIAL_EMPLOYEES)
  let attendance = getStorage('attendance', DUMMY.INITIAL_ATTENDANCE)
  let currentCashSession = getStorage('cash_session', DUMMY.INITIAL_CASH_SESSION)
  let cashHistory = getStorage('cash_history', DUMMY.INITIAL_CASH_HISTORY)
  let deliveryZones = getStorage('delivery_zones', DUMMY.INITIAL_DELIVERY_ZONES)
  let riders = getStorage('riders', DUMMY.INITIAL_RIDERS)
  let deliveries = getStorage('deliveries', DUMMY.INITIAL_DELIVERIES)
  let orders = getStorage('orders', DUMMY.INITIAL_ORDERS)
  let mediaStore = getStorage('media', {})

  if (getStorage('seed_version', 0) < MOCK_SEED_VERSION) {
    products = mergeCatalogImages(products, DUMMY.INITIAL_PRODUCTS)
    combos = mergeCatalogImages(combos, DUMMY.INITIAL_COMBOS)
    setStorage('products', products)
    setStorage('combos', combos)
    setStorage('seed_version', MOCK_SEED_VERSION)
  }

  const mockApi = {
    app: {
      getInfo: async () => ({
        version: '1.0.0-web-demo',
        platform: 'Web / Vercel Cloud',
        dbVersion: 8,
        mode: 'Browser Demo (LocalStorage)',
      }),
      ping: async () => true,
    },

    window: {
      minimize: () => {},
      maximize: () => {},
      close: () => {},
      isMaximized: async () => false,
    },

    auth: {
      login: async ({ pin, username, password, userId }) => {
        const list = getStorage('users', users)
        const found = list.find((u) => {
          if (userId && (u.id === userId || u.userId === userId)) {
            if (pin) return u.pin === pin
            if (password) return u.pass === password || u.password === password
            return true
          }
          if (pin && u.pin === pin) return true
          if (username && u.username && u.username.toLowerCase() === username.toLowerCase()) {
            if (password) return u.pass === password || u.password === password
            return true
          }
          return false
        }) || list[0]

        const user = {
          ...found,
          roleCode: found.roleCode || found.role_code || 'super_admin',
          roleName: found.roleName || found.role_name || 'Super Administrator',
          permissions: DUMMY.ALL_PERMISSIONS,
          branchName: found.branchName || 'Main Flagship Branch',
        }
        currentUser = user
        setStorage('current_user', user)
        return user
      },
      registerUser: async ({ username, displayName, roleCode, pin, password }) => {
        const list = getStorage('users', users)
        const roleNames = {
          super_admin: 'Super Administrator',
          admin: 'Administrator',
          manager: 'Restaurant Manager',
          cashier: 'Senior Cashier',
          waiter: 'Head Waiter',
          kitchen_staff: 'Head Chef',
        }
        const cleanRole = roleCode || 'cashier'
        const newUser = {
          id: `usr-${Date.now()}`,
          userId: `usr-${Date.now()}`,
          username: (username || `staff_${Date.now()}`).toLowerCase().trim(),
          displayName: displayName || username || 'New Staff',
          display_name: displayName || username || 'New Staff',
          roleCode: cleanRole,
          role_code: cleanRole,
          roleName: roleNames[cleanRole] || 'Staff Member',
          role_name: roleNames[cleanRole] || 'Staff Member',
          pin: pin || '1234',
          pass: password || '123456',
          branchId: 'br-01',
          branchName: 'Main Flagship Branch',
          permissions: DUMMY.ALL_PERMISSIONS,
        }
        users = [...list, newUser]
        setStorage('users', users)
        currentUser = newUser
        setStorage('current_user', newUser)
        return newUser
      },
      logout: async () => {
        currentUser = null
        setStorage('current_user', null)
        return true
      },
      getCurrentUser: async () => {
        if (!currentUser) return null
        return {
          ...currentUser,
          roleCode: currentUser.roleCode || currentUser.role_code || 'super_admin',
          roleName: currentUser.roleName || currentUser.role_name || 'Super Administrator',
          permissions: DUMMY.ALL_PERMISSIONS,
          branchName: currentUser.branchName || 'Main Flagship Branch',
        }
      },
      getLoginUsers: async () => getStorage('users', users),
    },

    dashboard: {
      getMetrics: async () => {
        const totalSales = orders.reduce((acc, o) => acc + (o.total_cents || 0), 0)
        return {
          sales: {
            grossSalesCents: totalSales,
            discountCents: 500,
            taxCents: Math.round(totalSales * 0.0825),
            netSalesCents: totalSales,
            totalOrders: orders.length,
            avgOrderCents: orders.length ? Math.round(totalSales / orders.length) : 0,
          },
          salesByType: {
            DINE_IN: { count: 2, totalCents: 4866 },
            TAKEAWAY: { count: 0, totalCents: 0 },
            DELIVERY: { count: 2, totalCents: 6744 },
          },
          paymentsByMethod: { CASH: 2703, CARD: 2163, ONLINE: 3797 },
          kitchen: { pendingTickets: 0, preparingTickets: 2, readyTickets: 1, avgPrepMinutes: 12 },
          tables: { totalTables: 8, occupiedTables: 2, availableTables: 5, occupancyRate: 25 },
          topProducts: [
            { id: '1', name: 'Classic Cheeseburger', quantitySold: 12, totalRevenueCents: 10788 },
            { id: '2', name: 'Pepperoni Feast Pizza', quantitySold: 9, totalRevenueCents: 12591 },
            { id: '3', name: 'Golden Crinkle Cut Fries', quantitySold: 15, totalRevenueCents: 5985 },
          ],
        }
      },
    },

    product: {
      getCategories: async () => categories,
      createCategory: async (data) => {
        const newCat = { id: `cat-${Date.now()}`, ...data, is_active: 1 }
        categories = [...categories, newCat]
        setStorage('categories', categories)
        return newCat
      },
      updateCategory: async (data) => {
        categories = categories.map((c) => (c.id === data.id ? { ...c, ...data } : c))
        setStorage('categories', categories)
        return true
      },
      deleteCategory: async (id) => {
        categories = categories.filter((c) => c.id !== id)
        setStorage('categories', categories)
        return true
      },
      getProducts: async ({ categoryId, searchQuery, includeInactive = true } = {}) => {
        let res = products
        if (categoryId && categoryId !== 'all') {
          res = res.filter((p) => p.category_id === categoryId)
        }
        if (searchQuery) {
          const s = searchQuery.toLowerCase()
          res = res.filter(
            (p) =>
              p.name.toLowerCase().includes(s) ||
              (p.sku && p.sku.toLowerCase().includes(s)) ||
              (p.description && p.description.toLowerCase().includes(s))
          )
        }
        return res
      },
      createProduct: async (data) => {
        const newProd = {
          id: `prd-${Date.now()}`,
          ...data,
          image_url: data.imageUrl || data.image_url || null,
          is_available: 1,
        }
        products = [...products, newProd]
        setStorage('products', products)
        return newProd
      },
      updateProduct: async (data) => {
        products = products.map((p) =>
          p.id === data.id
            ? { ...p, ...data, image_url: data.imageUrl !== undefined ? data.imageUrl : data.image_url ?? p.image_url }
            : p
        )
        setStorage('products', products)
        return true
      },
      toggleAvailability: async ({ id, isAvailable }) => {
        products = products.map((p) => (p.id === id ? { ...p, is_available: isAvailable ? 1 : 0 } : p))
        setStorage('products', products)
        return true
      },
      archiveProduct: async (id) => {
        products = products.filter((p) => p.id !== id)
        setStorage('products', products)
        return true
      },
      getCombos: async () => combos,
      createCombo: async (data) => {
        const newCombo = { id: `cmb-${Date.now()}`, ...data, is_active: 1, is_available: 1 }
        combos = [...combos, newCombo]
        setStorage('combos', combos)
        return newCombo
      },
      updateCombo: async (data) => {
        combos = combos.map((c) => (c.id === data.id ? { ...c, ...data } : c))
        setStorage('combos', combos)
        return true
      },
      toggleComboAvailability: async ({ id, isAvailable }) => {
        combos = combos.map((c) => (c.id === id ? { ...c, is_available: isAvailable ? 1 : 0 } : c))
        setStorage('combos', combos)
        return true
      },
      archiveCombo: async (id) => {
        combos = combos.filter((c) => c.id !== id)
        setStorage('combos', combos)
        return true
      },
    },

    pos: {
      createOrder: async (orderData) => {
        const orderNum = orderData.orderNumber || orderData.order_number || `ORD-${Date.now().toString().slice(-4)}`
        const tableNum = orderData.tableNumber || (orderData.tableId ? floors.flatMap((f) => f.tables).find((t) => t.id === (orderData.tableId || orderData.table_id))?.table_number : null) || 'T1'
        const grandTotal = orderData.totalCents ?? orderData.total_cents ?? 0
        const subtotal = orderData.subtotalCents ?? orderData.subtotal_cents ?? grandTotal
        const newOrder = {
          id: `ord-${Date.now()}`,
          orderNumber: orderNum,
          order_number: orderNum,
          status: orderData.status || 'CONFIRMED',
          orderType: orderData.orderType || orderData.order_type || 'DINE_IN',
          order_type: orderData.orderType || orderData.order_type || 'DINE_IN',
          tableId: orderData.tableId || orderData.table_id || null,
          table_id: orderData.tableId || orderData.table_id || null,
          tableNumber: tableNum,
          table_number: tableNum,
          customerId: orderData.customerId || orderData.customer_id || null,
          customer_id: orderData.customerId || orderData.customer_id || null,
          customerName: orderData.customerName || (orderData.customerId ? customers.find((c) => c.id === orderData.customerId)?.name : null) || 'Walk-in Guest',
          customer_name: orderData.customerName || (orderData.customerId ? customers.find((c) => c.id === orderData.customerId)?.name : null) || 'Walk-in Guest',
          subtotalCents: subtotal,
          subtotal_cents: subtotal,
          discountCents: orderData.discountCents ?? orderData.discount_cents ?? 0,
          discount_cents: orderData.discountCents ?? orderData.discount_cents ?? 0,
          discountReason: orderData.discountReason || '',
          discount_reason: orderData.discountReason || '',
          taxCents: orderData.taxCents ?? orderData.tax_cents ?? 0,
          tax_cents: orderData.taxCents ?? orderData.tax_cents ?? 0,
          serviceChargeCents: orderData.serviceChargeCents ?? 0,
          service_charge_cents: orderData.serviceChargeCents ?? 0,
          deliveryChargeCents: orderData.deliveryChargeCents ?? 0,
          delivery_charge_cents: orderData.deliveryChargeCents ?? 0,
          totalCents: grandTotal,
          total_cents: grandTotal,
          notes: orderData.notes || '',
          items_count: (orderData.items || []).length,
          items: (orderData.items || []).map((it, idx) => ({
            id: `oi-${Date.now()}-${idx}`,
            productId: it.productId || it.product_id,
            product_id: it.productId || it.product_id,
            name: it.name || it.item_name || 'Menu Item',
            item_name: it.name || it.item_name || 'Menu Item',
            quantity: it.quantity || 1,
            unitPriceCents: it.unitPriceCents || it.unit_price_cents || 0,
            unit_price_cents: it.unitPriceCents || it.unit_price_cents || 0,
            totalCents: it.totalCents || it.total_cents || 0,
            total_cents: it.totalCents || it.total_cents || 0,
            notes: it.notes || '',
            modifiers: it.modifiers || [],
          })),
          created_at: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        }
        orders = [newOrder, ...orders]
        setStorage('orders', orders)

        // If dine in table, mark occupied
        if (orderData.tableId || orderData.table_id) {
          const tid = orderData.tableId || orderData.table_id
          floors = floors.map((f) => ({
            ...f,
            tables: f.tables.map((t) => (t.id === tid ? { ...t, status: 'OCCUPIED', current_order_id: newOrder.id } : t)),
          }))
          setStorage('floors', floors)
        }

        return newOrder
      },
      getOrder: async (id) => orders.find((o) => o.id === id) || null,
      processPayment: async ({ orderId, paymentMethod, amountCents }) => {
        orders = orders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: 'COMPLETED',
                paid_cents: amountCents,
                paidCents: amountCents,
                payment_method: paymentMethod || 'CASH',
                paymentMethod: paymentMethod || 'CASH',
              }
            : o
        )
        setStorage('orders', orders)
        return { success: true, paymentId: `pmt-${Date.now()}` }
      },
      holdOrder: async (data) => {
        const held = { id: `ord-held-${Date.now()}`, ...data, status: 'DRAFT', created_at: new Date().toISOString() }
        orders = [held, ...orders]
        setStorage('orders', orders)
        return held
      },
      getHeldOrders: async () => orders.filter((o) => o.status === 'DRAFT'),
      cancelOrder: async ({ orderId, reason }) => {
        orders = orders.map((o) => (o.id === orderId ? { ...o, status: 'CANCELLED', notes: reason } : o))
        setStorage('orders', orders)
        return true
      },
      getOrders: async ({ status, orderType, search } = {}) => {
        let res = orders
        if (status && status !== 'ALL') {
          res = res.filter((o) => o.status === status)
        }
        if (orderType && orderType !== 'ALL') {
          res = res.filter((o) => (o.order_type === orderType || o.orderType === orderType))
        }
        if (search) {
          const s = search.toLowerCase()
          res = res.filter(
            (o) =>
              (o.order_number && o.order_number.toLowerCase().includes(s)) ||
              (o.orderNumber && o.orderNumber.toLowerCase().includes(s)) ||
              (o.table_number && o.table_number.toLowerCase().includes(s)) ||
              (o.customer_name && o.customer_name.toLowerCase().includes(s))
          )
        }
        return res
      },
    },

    tables: {
      getFloorsWithTables: async () => floors,
      updateStatus: async ({ tableId, status }) => {
        floors = floors.map((f) => ({
          ...f,
          tables: f.tables.map((t) => (t.id === tableId ? { ...t, status } : t)),
        }))
        setStorage('floors', floors)
        return true
      },
      transferTable: async ({ fromTableId, toTableId }) => {
        let movedOrder = null
        floors = floors.map((f) => ({
          ...f,
          tables: f.tables.map((t) => {
            if (t.id === fromTableId) {
              movedOrder = t.current_order_id
              return { ...t, status: 'AVAILABLE', current_order_id: null }
            }
            return t
          }),
        }))
        floors = floors.map((f) => ({
          ...f,
          tables: f.tables.map((t) => {
            if (t.id === toTableId) {
              return { ...t, status: 'OCCUPIED', current_order_id: movedOrder }
            }
            return t
          }),
        }))
        setStorage('floors', floors)
        return true
      },
      createFloor: async (data) => {
        const newFloor = { id: `flr-${Date.now()}`, ...data, tables: [] }
        floors = [...floors, newFloor]
        setStorage('floors', floors)
        return newFloor
      },
      updateFloor: async (data) => {
        floors = floors.map((f) => (f.id === data.id ? { ...f, ...data } : f))
        setStorage('floors', floors)
        return true
      },
      createTable: async (data) => {
        const newTbl = { id: `tbl-${Date.now()}`, ...data, status: 'AVAILABLE' }
        floors = floors.map((f) =>
          f.id === data.floorId ? { ...f, tables: [...f.tables, newTbl] } : f
        )
        setStorage('floors', floors)
        return newTbl
      },
      updateTable: async (data) => {
        floors = floors.map((f) => ({
          ...f,
          tables: f.tables.map((t) => (t.id === data.id ? { ...t, ...data } : t)),
        }))
        setStorage('floors', floors)
        return true
      },
      archiveTable: async (id) => {
        floors = floors.map((f) => ({
          ...f,
          tables: f.tables.filter((t) => t.id !== id),
        }))
        setStorage('floors', floors)
        return true
      },
    },

    kitchen: {
      getOrders: async ({ statusFilter = 'ACTIVE' }) => {
        if (statusFilter === 'READY') {
          return orders.filter((o) => o.status === 'READY')
        }
        if (statusFilter === 'COMPLETED') {
          return orders.filter((o) => o.status === 'COMPLETED')
        }
        return orders.filter((o) => ['CONFIRMED', 'PREPARING'].includes(o.status))
      },
      updateItemStatus: async ({ itemId, status }) => {
        orders = orders.map((o) => ({
          ...o,
          items: (o.items || []).map((it) => (it.id === itemId ? { ...it, kitchen_status: status } : it)),
        }))
        setStorage('orders', orders)
        return true
      },
      updateOrderStatus: async ({ orderId, status }) => {
        orders = orders.map((o) => (o.id === orderId ? { ...o, status } : o))
        setStorage('orders', orders)
        return true
      },
      getStations: async () => stations,
      createStation: async (data) => {
        const newStation = { id: `stn-${Date.now()}`, ...data }
        stations = [...stations, newStation]
        setStorage('stations', stations)
        return newStation
      },
      updateStation: async ({ id, data }) => {
        stations = stations.map((s) => (s.id === id ? { ...s, ...data } : s))
        setStorage('stations', stations)
        return true
      },
      getMetrics: async () => ({
        activeTickets: orders.filter((o) => ['CONFIRMED', 'PREPARING'].includes(o.status)).length,
        preparingTickets: orders.filter((o) => o.status === 'PREPARING').length,
        readyTickets: orders.filter((o) => o.status === 'READY').length,
        delayedCount: 0,
        completedToday: orders.filter((o) => o.status === 'COMPLETED').length,
      }),
    },

    inventory: {
      getUnits: async () => [
        { id: 'u-1', name: 'Kilograms', abbreviation: 'kg' },
        { id: 'u-2', name: 'Grams', abbreviation: 'g' },
        { id: 'u-3', name: 'Liters', abbreviation: 'L' },
        { id: 'u-4', name: 'Pieces', abbreviation: 'pcs' },
      ],
      createUnit: async (data) => ({ id: `u-${Date.now()}`, ...data }),
      getItems: async () => inventoryItems,
      getItem: async (id) => inventoryItems.find((i) => i.id === id) || null,
      createItem: async (data) => {
        const newItem = { id: `inv-${Date.now()}`, ...data }
        inventoryItems = [...inventoryItems, newItem]
        setStorage('inventory_items', inventoryItems)
        return newItem
      },
      updateItem: async ({ id, data }) => {
        inventoryItems = inventoryItems.map((i) => (i.id === id ? { ...i, ...data } : i))
        setStorage('inventory_items', inventoryItems)
        return true
      },
      adjustStock: async ({ itemId, quantity, reason }) => {
        inventoryItems = inventoryItems.map((i) =>
          i.id === itemId ? { ...i, current_stock: i.current_stock + quantity } : i
        )
        setStorage('inventory_items', inventoryItems)
        return true
      },
      getMovements: async () => [
        { id: 'm-1', item_name: 'Beef Patty 150g', movement_type: 'PURCHASE', quantity: 200, created_at: new Date().toISOString() },
        { id: 'm-2', item_name: 'Fresh Mozzarella Block', movement_type: 'PURCHASE', quantity: 30, created_at: new Date().toISOString() },
      ],
    },

    recipes: {
      getRecipes: async () => [
        {
          id: 'rec-1',
          product_name: 'Classic Cheeseburger',
          selling_price_cents: 899,
          cost_price_cents: 350,
          gross_margin_cents: 549,
          food_cost_percentage: 38.9,
          ingredients: [
            { item_name: 'Beef Patty 150g', quantity_required: 1, unit_abbr: 'pcs', cost_cents: 180 },
            { item_name: 'Brioche Burger Buns', quantity_required: 1, unit_abbr: 'pcs', cost_cents: 60 },
            { item_name: 'Cheddar Cheese Slices', quantity_required: 1, unit_abbr: 'pcs', cost_cents: 45 },
          ],
        },
      ],
      getRecipe: async ({ productId }) => null,
      saveRecipe: async (data) => true,
    },

    purchases: {
      getSuppliers: async () => suppliers,
      createSupplier: async (data) => {
        const newSup = { id: `sup-${Date.now()}`, ...data, total_po_count: 0, total_purchases_cents: 0, is_active: 1 }
        suppliers = [...suppliers, newSup]
        setStorage('suppliers', suppliers)
        return newSup
      },
      updateSupplier: async ({ id, data }) => {
        suppliers = suppliers.map((s) => (s.id === id ? { ...s, ...data } : s))
        setStorage('suppliers', suppliers)
        return true
      },
      getOrders: async () => purchaseOrders,
      createOrder: async ({ supplierId, poNumber, notes, items, autoReceive }) => {
        const sup = suppliers.find((s) => s.id === supplierId)
        const total = (items || []).reduce((acc, it) => acc + (it.totalCents || it.quantity * it.unitCostCents), 0)
        const newPo = {
          id: `po-${Date.now()}`,
          po_number: poNumber || `PO-${Date.now().toString().slice(-6)}`,
          supplier_id: supplierId,
          supplier_name: sup?.company_name || 'Vendor',
          supplier_phone: sup?.phone || '',
          status: autoReceive ? 'RECEIVED' : 'ORDERED',
          total_cents: total,
          notes: notes || '',
          created_at: new Date().toISOString(),
          received_at: autoReceive ? new Date().toISOString() : null,
          items: (items || []).map((it, idx) => ({ id: `poi-${idx}`, ...it })),
        }
        purchaseOrders = [newPo, ...purchaseOrders]
        setStorage('purchase_orders', purchaseOrders)
        return newPo
      },
      recordPayment: async (data) => true,
    },

    expenses: {
      getCategories: async () => expenseCategories,
      getExpenses: async ({ categoryId }) => {
        if (categoryId) {
          return expenses.filter((e) => e.category_id === categoryId)
        }
        return expenses
      },
      createExpense: async (data) => {
        const cat = expenseCategories.find((c) => c.id === data.categoryId)
        const newExp = {
          id: `exp-${Date.now()}`,
          category_id: data.categoryId,
          category_name: cat?.name || 'Miscellaneous',
          amount_cents: data.amountCents,
          payment_method: data.paymentMethod,
          payee: data.payee,
          description: data.description,
          expense_date: data.expenseDate || new Date().toISOString().slice(0, 10),
          created_at: new Date().toISOString(),
        }
        expenses = [newExp, ...expenses]
        setStorage('expenses', expenses)
        return newExp
      },
      getSummary: async () => {
        const total = expenses.reduce((acc, e) => acc + e.amount_cents, 0)
        return {
          totalCents: total,
          categoryBreakdown: expenseCategories.map((c) => ({
            name: c.name,
            totalCents: expenses.filter((e) => e.category_id === c.id).reduce((acc, e) => acc + e.amount_cents, 0),
          })),
        }
      },
    },

    cashDrawer: {
      getCurrentSession: async () => currentCashSession,
      openSession: async ({ openingBalanceCents, notes }) => {
        currentCashSession = {
          id: `cs-${Date.now()}`,
          status: 'OPEN',
          opened_at: new Date().toISOString(),
          opening_balance_cents: openingBalanceCents,
          expected_cash_cents: openingBalanceCents,
          total_cash_sales_cents: 0,
          total_card_sales_cents: 0,
          notes: notes || 'Cashier float',
        }
        setStorage('cash_session', currentCashSession)
        return currentCashSession
      },
      recordMovement: async ({ movementType, amountCents, reason }) => {
        if (currentCashSession) {
          if (movementType === 'CASH_IN') {
            currentCashSession.expected_cash_cents += amountCents
          } else {
            currentCashSession.expected_cash_cents -= amountCents
          }
          setStorage('cash_session', currentCashSession)
        }
        return true
      },
      getXReport: async () => ({
        openingBalanceCents: currentCashSession?.opening_balance_cents || 10000,
        cashSalesCents: currentCashSession?.total_cash_sales_cents || 5450,
        cardSalesCents: currentCashSession?.total_card_sales_cents || 8900,
        expectedCashCents: currentCashSession?.expected_cash_cents || 15450,
      }),
      closeSession: async ({ countedCashCents, closingNotes }) => {
        const closed = {
          ...currentCashSession,
          status: 'CLOSED',
          closed_at: new Date().toISOString(),
          counted_cash_cents: countedCashCents,
          variance_cents: countedCashCents - (currentCashSession?.expected_cash_cents || countedCashCents),
          closing_notes: closingNotes,
        }
        cashHistory = [closed, ...cashHistory]
        currentCashSession = null
        setStorage('cash_session', null)
        setStorage('cash_history', cashHistory)
        return closed
      },
      getHistory: async () => cashHistory,
      getDetails: async (sessionId) => cashHistory.find((c) => c.id === sessionId) || null,
    },

    staff: {
      getEmployees: async () => employees,
      getEmployeeById: async (id) => employees.find((e) => e.id === id) || null,
      createEmployee: async (data) => {
        const newEmp = { id: `emp-${Date.now()}`, ...data, status: 'ACTIVE' }
        employees = [...employees, newEmp]
        setStorage('employees', employees)
        return newEmp
      },
      updateEmployee: async ({ id, data }) => {
        employees = employees.map((e) => (e.id === id ? { ...e, ...data } : e))
        setStorage('employees', employees)
        return true
      },
      clockIn: async (data) => {
        const newAtt = {
          id: `att-${Date.now()}`,
          employee_name: 'Current Staff',
          shift_name: 'Morning Shift',
          clock_in: new Date().toISOString(),
          clock_out: null,
          break_minutes: 0,
          status: 'PRESENT',
        }
        attendance = [newAtt, ...attendance]
        setStorage('attendance', attendance)
        return true
      },
      clockOut: async () => true,
      getAttendanceLogs: async () => attendance,
      getShifts: async () => shifts,
      saveShift: async (data) => {
        if (data.id) {
          shifts = shifts.map((s) => (s.id === data.id ? { ...s, ...data } : s))
        } else {
          shifts = [...shifts, { id: `shf-${Date.now()}`, ...data, is_active: 1 }]
        }
        setStorage('shifts', shifts)
        return true
      },
      getPerformance: async () => [
        { id: '1', display_name: 'Sam Cashier', order_count: 14, total_sales_cents: 18450 },
        { id: '2', display_name: 'David Waiter', order_count: 9, total_sales_cents: 12200 },
      ],
      getUsers: async () => DUMMY.INITIAL_USERS,
      getRoles: async () => DUMMY.INITIAL_ROLES,
      createUser: async (data) => ({ id: `usr-${Date.now()}`, ...data }),
      updateUser: async () => true,
    },

    customers: {
      getCustomers: async ({ search, tag } = {}) => {
        let res = customers
        if (tag && tag !== 'ALL') {
          res = res.filter((c) => c.tag === tag)
        }
        if (search) {
          const s = search.toLowerCase()
          res = res.filter((c) => c.name.toLowerCase().includes(s) || c.phone.includes(s))
        }
        return res
      },
      getDetails: async (id) => {
        const cust = customers.find((c) => c.id === id)
        return {
          customer: cust,
          transactions: [
            { id: 'tx-1', points_changed: 150, transaction_type: 'EARN', balance_after: cust?.loyalty_points || 150, created_at: new Date().toISOString(), notes: 'Order loyalty accrual' },
          ],
        }
      },
      create: async (data) => {
        const newCust = {
          id: `cst-${Date.now()}`,
          ...data,
          loyalty_points: 0,
          total_spent_cents: 0,
          order_count: 0,
          is_active: 1,
        }
        customers = [...customers, newCust]
        setStorage('customers', customers)
        return newCust
      },
      update: async ({ id, data }) => {
        customers = customers.map((c) => (c.id === id ? { ...c, ...data } : c))
        setStorage('customers', customers)
        return true
      },
      adjustLoyalty: async ({ customerId, pointsDelta, reason }) => {
        customers = customers.map((c) =>
          c.id === customerId ? { ...c, loyalty_points: Math.max(0, c.loyalty_points + pointsDelta) } : c
        )
        setStorage('customers', customers)
        return true
      },
      getSummary: async () => ({
        totalCustomers: customers.length,
        vipCustomers: customers.filter((c) => c.tag === 'VIP').length,
        corporateCustomers: customers.filter((c) => c.tag === 'CORPORATE').length,
        totalActiveLoyaltyPoints: customers.reduce((acc, c) => acc + (c.loyalty_points || 0), 0),
      }),
    },

    reservations: {
      getReservations: async ({ date, status } = {}) => {
        let res = reservations
        if (date) {
          res = res.filter((r) => r.reservation_date === date)
        }
        if (status && status !== 'ALL') {
          res = res.filter((r) => r.status === status)
        }
        return res
      },
      create: async (data) => {
        const newRes = {
          id: `res-${Date.now()}`,
          ...data,
          status: 'CONFIRMED',
          created_at: new Date().toISOString(),
        }
        reservations = [...reservations, newRes]
        setStorage('reservations', reservations)
        return newRes
      },
      updateStatus: async ({ id, status }) => {
        reservations = reservations.map((r) => (r.id === id ? { ...r, status } : r))
        setStorage('reservations', reservations)
        return true
      },
      checkAvailability: async () => ({ available: true, candidateTables: floors[0]?.tables || [] }),
    },

    coupons: {
      getCoupons: async () => coupons,
      create: async (data) => {
        const newCoupon = { id: `cpn-${Date.now()}`, ...data, is_active: 1 }
        coupons = [...coupons, newCoupon]
        setStorage('coupons', coupons)
        return newCoupon
      },
      update: async ({ id, data }) => {
        coupons = coupons.map((c) => (c.id === id ? { ...c, ...data } : c))
        setStorage('coupons', coupons)
        return true
      },
      validate: async ({ code, orderSubtotalCents }) => {
        const found = coupons.find((c) => c.code.toUpperCase() === code?.toUpperCase())
        if (!found) throw new Error('Invalid coupon code.')
        if (found.min_order_cents && orderSubtotalCents < found.min_order_cents) {
          throw new Error(`Minimum order of $${(found.min_order_cents / 100).toFixed(2)} required.`)
        }
        const discount =
          found.discount_type === 'PERCENTAGE'
            ? Math.round((orderSubtotalCents * found.discount_value) / 100)
            : found.discount_value
        return {
          valid: true,
          coupon: found,
          discountCents: found.max_discount_cents ? Math.min(discount, found.max_discount_cents) : discount,
        }
      },
    },

    delivery: {
      getZones: async () => deliveryZones,
      createZone: async (data) => {
        const newZone = { id: `zn-${Date.now()}`, ...data, is_active: 1 }
        deliveryZones = [...deliveryZones, newZone]
        setStorage('delivery_zones', deliveryZones)
        return newZone
      },
      updateZone: async ({ id, data }) => {
        deliveryZones = deliveryZones.map((z) => (z.id === id ? { ...z, ...data } : z))
        setStorage('delivery_zones', deliveryZones)
        return true
      },
      getRiders: async () => riders,
      getRiderById: async (id) => riders.find((r) => r.id === id) || null,
      createRider: async (data) => {
        const newRider = { id: `rd-${Date.now()}`, ...data, status: 'AVAILABLE', is_active: 1 }
        riders = [...riders, newRider]
        setStorage('riders', riders)
        return newRider
      },
      updateRider: async ({ id, data }) => {
        riders = riders.map((r) => (r.id === id ? { ...r, ...data } : r))
        setStorage('riders', riders)
        return true
      },
      updateRiderStatus: async ({ id, status }) => {
        riders = riders.map((r) => (r.id === id ? { ...r, status } : r))
        setStorage('riders', riders)
        return true
      },
      getDeliveries: async ({ filters = {} } = {}) => {
        if (filters.status) {
          return deliveries.filter((d) => d.status === filters.status)
        }
        return deliveries
      },
      getDeliveryById: async (id) => deliveries.find((d) => d.id === id) || null,
      createDelivery: async (data) => {
        const newDel = {
          id: `del-${Date.now()}`,
          status: 'PENDING',
          created_at: new Date().toISOString(),
          ...data,
        }
        deliveries = [newDel, ...deliveries]
        setStorage('deliveries', deliveries)
        return newDel
      },
      assignRider: async ({ deliveryId, riderId }) => {
        const rider = riders.find((r) => r.id === riderId)
        deliveries = deliveries.map((d) =>
          d.id === deliveryId ? { ...d, rider_id: riderId, rider_name: rider?.name, status: 'ASSIGNED' } : d
        )
        riders = riders.map((r) => (r.id === riderId ? { ...r, status: 'ASSIGNED' } : r))
        setStorage('deliveries', deliveries)
        setStorage('riders', riders)
        return true
      },
      dispatch: async (deliveryId) => {
        deliveries = deliveries.map((d) =>
          d.id === deliveryId ? { ...d, status: 'OUT_FOR_DELIVERY', dispatched_at: new Date().toISOString() } : d
        )
        setStorage('deliveries', deliveries)
        return true
      },
      complete: async ({ deliveryId, codCollectedCents }) => {
        let riderId = null
        deliveries = deliveries.map((d) => {
          if (d.id === deliveryId) {
            riderId = d.rider_id
            return {
              ...d,
              status: 'DELIVERED',
              delivered_at: new Date().toISOString(),
              cod_collected_cents: codCollectedCents || d.cod_amount_cents,
            }
          }
          return d
        })
        if (riderId) {
          riders = riders.map((r) => (r.id === riderId ? { ...r, status: 'AVAILABLE' } : r))
          setStorage('riders', riders)
        }
        setStorage('deliveries', deliveries)
        return true
      },
      fail: async ({ deliveryId, reason }) => {
        deliveries = deliveries.map((d) => (d.id === deliveryId ? { ...d, status: 'FAILED', failed_reason: reason } : d))
        setStorage('deliveries', deliveries)
        return true
      },
      getRiderPendingCod: async (riderId) => {
        const uncollected = deliveries.filter(
          (d) => d.rider_id === riderId && d.status === 'DELIVERED' && !d.cod_settled
        )
        const total = uncollected.reduce((acc, d) => acc + (d.cod_collected_cents || d.cod_amount_cents || 0), 0)
        return { count: uncollected.length, totalCents: total }
      },
      settleRiderCod: async ({ riderId }) => {
        deliveries = deliveries.map((d) => (d.rider_id === riderId ? { ...d, cod_settled: 1 } : d))
        setStorage('deliveries', deliveries)
        return true
      },
      getSettlementHistory: async () => [
        { id: 'set-1', rider_name: 'Marco Silva', total_collected_cents: 4500, orders_count: 2, created_at: new Date().toISOString() },
      ],
      getSummary: async () => ({
        totalRiders: riders.length,
        availableRiders: riders.filter((r) => r.status === 'AVAILABLE').length,
        activeDeliveries: deliveries.filter((d) => ['PENDING', 'ASSIGNED', 'OUT_FOR_DELIVERY'].includes(d.status)).length,
        deliveredToday: deliveries.filter((d) => d.status === 'DELIVERED').length,
      }),
    },

    reports: {
      getSalesSummary: async ({ filter } = {}) => {
        const completed = orders.filter((o) => ['COMPLETED', 'CONFIRMED', 'DELIVERED', 'SERVED'].includes(o.status))
        const totalSales = completed.reduce((sum, o) => sum + (o.total_cents ?? o.totalCents ?? 0), 0)
        const totalOrders = completed.length || 18
        const finalSales = totalSales > 0 ? totalSales : 52400
        const totalDisc = completed.reduce((sum, o) => sum + (o.discount_cents ?? o.discountCents ?? 0), 0) || 1200
        const totalTax = completed.reduce((sum, o) => sum + (o.tax_cents ?? o.taxCents ?? 0), 0) || 4200

        const typeMap = {}
        completed.forEach((o) => {
          const t = o.order_type || o.orderType || 'DINE_IN'
          if (!typeMap[t]) typeMap[t] = { order_type: t, order_count: 0, total_cents: 0 }
          typeMap[t].order_count++
          typeMap[t].total_cents += (o.total_cents ?? o.totalCents ?? 0)
        })

        const byOrderType = Object.values(typeMap).length > 0 ? Object.values(typeMap) : [
          { order_type: 'DINE_IN', order_count: 10, total_cents: 31200 },
          { order_type: 'TAKEAWAY', order_count: 5, total_cents: 14200 },
          { order_type: 'DELIVERY', order_count: 3, total_cents: 7000 },
        ]

        const byPaymentMethod = [
          { payment_method: 'CASH', payment_count: 9, total_cents: Math.round(finalSales * 0.45) },
          { payment_method: 'CREDIT_CARD', payment_count: 6, total_cents: Math.round(finalSales * 0.40) },
          { payment_method: 'QR_MOBILE', payment_count: 3, total_cents: Math.round(finalSales * 0.15) },
        ]

        return {
          startDate: filter?.startDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
          endDate: filter?.endDate || new Date().toISOString().slice(0, 10),
          overall: {
            total_orders: totalOrders,
            total_sales_cents: finalSales,
            subtotal_cents: Math.round(finalSales * 0.9),
            total_discount_cents: totalDisc,
            total_tax_cents: totalTax,
            total_service_charge_cents: 0,
            total_delivery_charge_cents: 900,
            average_order_cents: Math.round(finalSales / totalOrders),
          },
          byOrderType,
          byPaymentMethod,
          dailyTimeline: [
            { date: new Date().toISOString().slice(0, 10), order_count: totalOrders, total_cents: finalSales },
          ],
        }
      },

      getProductPerformance: async ({ filter } = {}) => ({
        items: [
          { product_id: 'prod-01', item_name: 'Smash Double Cheeseburger', category_name: 'Burgers & Sandwiches', total_quantity_sold: 34, total_revenue_cents: 30566 },
          { product_id: 'prod-02', item_name: 'Crispy Buffalo Chicken Burger', category_name: 'Burgers & Sandwiches', total_quantity_sold: 28, total_revenue_cents: 22372 },
          { product_id: 'prod-03', item_name: 'Pepperoni Rustica Pizza (12")', category_name: 'Artisan Pizzas', total_quantity_sold: 22, total_revenue_cents: 30778 },
          { product_id: 'prod-04', item_name: 'Truffle Parmesan Hand-Cut Fries', category_name: 'Crispy Sides & Starters', total_quantity_sold: 45, total_revenue_cents: 22455 },
          { product_id: 'prod-05', item_name: 'Craft Cola Float', category_name: 'Beverages & Refreshers', total_quantity_sold: 39, total_revenue_cents: 13611 },
          { product_id: 'prod-06', item_name: 'Warm Belgian Chocolate Lava Cake', category_name: 'Sweet Desserts', total_quantity_sold: 19, total_revenue_cents: 12331 },
        ],
        categoryBreakdown: [
          { category_name: 'Burgers & Sandwiches', total_quantity_sold: 62, total_revenue_cents: 52938 },
          { category_name: 'Artisan Pizzas', total_quantity_sold: 22, total_revenue_cents: 30778 },
          { category_name: 'Crispy Sides & Starters', total_quantity_sold: 45, total_revenue_cents: 22455 },
          { category_name: 'Beverages & Refreshers', total_quantity_sold: 39, total_revenue_cents: 13611 },
          { category_name: 'Sweet Desserts', total_quantity_sold: 19, total_revenue_cents: 12331 },
        ],
      }),

      getHourlyBreakdown: async ({ filter } = {}) => {
        const slots = []
        for (let h = 0; h < 24; h++) {
          const isLunch = h >= 12 && h <= 14
          const isDinner = h >= 19 && h <= 21
          const orderCount = isLunch ? 8 : isDinner ? 11 : h >= 10 && h <= 22 ? 3 : 0
          const totalCents = orderCount * 2850
          slots.push({
            hour: h,
            label: `${h.toString().padStart(2, '0')}:00`,
            orderCount,
            totalCents,
          })
        }
        return slots
      },

      getProfitAndLoss: async ({ filter } = {}) => {
        const rev = 52400
        const cogs = 18340
        const gross = rev - cogs
        const exp = 14500
        const net = gross - exp
        return {
          revenueCents: rev,
          discountCents: 1200,
          taxCents: 4200,
          cogsCents: cogs,
          grossProfitCents: gross,
          expensesCents: exp,
          netProfitCents: net,
          marginPercent: ((net / rev) * 100).toFixed(1),
        }
      },

      getVoidAudits: async ({ filter } = {}) => {
        const discounted = orders.filter((o) => (o.discount_cents || o.discountCents || 0) > 0)
        const voided = orders.filter((o) => o.status === 'CANCELLED' || o.status === 'VOID')
        return {
          discountedOrders: discounted.length > 0 ? discounted : [
            { id: 'aud-disc-1', order_number: 'ORD-9821', discount_cents: 500, discount_reason: 'VIP Loyalty Promo', cashier_name: 'Sam Cashier' },
            { id: 'aud-disc-2', order_number: 'ORD-9804', discount_cents: 700, discount_reason: 'Manager Courtesy', cashier_name: 'Sarah Manager' },
          ],
          voidOrders: voided.length > 0 ? voided : [
            { id: 'aud-void-1', order_number: 'ORD-9791', total_cents: 2450, status: 'CANCELLED', cashier_name: 'Sam Cashier' },
          ],
        }
      },
      getAuditLogs: async () => [
        { id: 'aud-1', action: 'CREATE_ORDER', entity_type: 'ORDER', entity_id: 'ord-kds-01', created_at: new Date().toISOString() },
        { id: 'aud-2', action: 'CLOCK_IN', entity_type: 'STAFF', entity_id: 'emp-01', created_at: new Date().toISOString() },
      ],
      getStaffSales: async () => [],
      getCustomerReport: async () => [],
      getKitchenReport: async () => ({ byStatus: [], avgPrepMinutes: 0 }),
      getDeliveryReport: async () => ({ riders: [] }),
      getInventoryReport: async () => ({ items: [], totalValuationCents: 0, lowStockCount: 0 }),
      getExpenseReport: async () => [],
      getReservationReport: async () => [],
      getRefundReport: async () => [],
    },

    media: {
      save: async ({ dataUrl }) => {
        const id = `media-${Date.now()}`
        mediaStore = { ...mediaStore, [id]: dataUrl }
        setStorage('media', mediaStore)
        return { id, dataUrl }
      },
      getDataUrl: async (id) => {
        if (!id) return null
        if (isDirectImageSrc(id)) return id
        return mediaStore[id] || null
      },
    },

    settings: {
      getAll: async () => ({
        tax_rate_percentage: '8.25',
        currency_symbol: '$',
        receipt_header: 'Gourmet Bistro & Fast Food',
        receipt_footer: 'Thank you for dining with us!',
        auto_print_receipt: 'false',
        kitchen_sound_chime: 'true',
      }),
      get: async (key) => '8.25',
      saveBatch: async (settings) => true,
    },

    db: {
      getStatus: async () => ({
        version: 8,
        mode: 'Browser Demo (LocalStorage)',
        isOnline: true,
      }),
      getSettings: async () => ({ currency_symbol: '$', tax_rate_percentage: '8.25' }),
      getCategories: async () => categories,
      getProducts: async ({ categoryId } = {}) => {
        if (categoryId) {
          return products.filter((p) => p.category_id === categoryId)
        }
        return products
      },
      getTables: async () => floors.flatMap((f) => f.tables),
      createOrder: async (data) => mockApi.pos.createOrder(data),
      getRecentOrders: async () => orders.slice(0, 10),
      backup: async () => ({ success: true, destination: 'browser_storage.json' }),
      restore: async () => ({ success: true }),
    },
  }

  // Attach mockApi to window.api
  window.api = mockApi
  window.__IS_BROWSER_DEMO__ = true
  console.log('[Browser Mock] window.api successfully attached with rich dummy data!')
}
