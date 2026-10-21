import crypto from 'node:crypto'

import { hashSecret } from './repositories/authRepository.js'

function uuid() {
  return crypto.randomUUID()
}

/**
 * Seed initial operational data into the SQLite database
 * @param {import('better-sqlite3').Database} db 
 */
export function seedDatabase(db) {
  console.log('[Database Seed] Seeding default operational data...')

  const seedTx = db.transaction(() => {
    // 1. Default Branch
    const branchCount = db.prepare('SELECT COUNT(*) as count FROM branches').get().count
    let branchId = null

    if (branchCount === 0) {
      branchId = uuid()
      const now = new Date().toISOString()
      db.prepare(`
        INSERT INTO branches (id, name, code, phone, email, address, city, currency_code, currency_symbol, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        branchId,
        'Main Flagship Branch',
        'BR-01',
        '+1 555-0199',
        'contact@restaurantpos.local',
        '100 Gourmet Plaza, Suite 4',
        'Metropolis',
        'USD',
        '$',
        1,
        now,
        now
      )
    } else {
      branchId = db.prepare('SELECT id FROM branches LIMIT 1').get().id
    }

    // 2. Default Roles
    const roles = [
      { code: 'super_admin', name: 'Super Administrator', desc: 'Full system and branch access', is_system: 1 },
      { code: 'manager', name: 'Restaurant Manager', desc: 'Orders, inventory, staff, discounts and reports', is_system: 1 },
      { code: 'cashier', name: 'Cashier', desc: 'POS order entry, payments and receipts', is_system: 1 },
      { code: 'waiter', name: 'Waiter', desc: 'Dine-in table orders and customer service', is_system: 1 },
      { code: 'kitchen_staff', name: 'Kitchen Staff', desc: 'Kitchen display screen and order preparation', is_system: 1 },
      { code: 'inventory_officer', name: 'Inventory Officer', desc: 'Stock movements, purchases and ingredients', is_system: 1 },
    ]

    const roleMap = {}
    for (const r of roles) {
      let existing = db.prepare('SELECT id FROM roles WHERE code = ?').get(r.code)
      if (!existing) {
        const id = uuid()
        db.prepare('INSERT INTO roles (id, code, name, description, is_system, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(id, r.code, r.name, r.desc, r.is_system, new Date().toISOString())
        roleMap[r.code] = id
      } else {
        roleMap[r.code] = existing.id
      }
    }

    // 3. Permissions
    const permissions = [
      { code: 'dashboard:view', name: 'View Dashboard Metrics', module: 'DASHBOARD' },
      { code: 'pos:create_order', name: 'Create Orders', module: 'POS' },
      { code: 'pos:apply_discount', name: 'Apply Discount', module: 'POS' },
      { code: 'pos:process_refund', name: 'Process Refund', module: 'POS' },
      { code: 'menu:manage', name: 'Manage Products & Menu', module: 'MENU' },
      { code: 'inventory:manage', name: 'Manage Inventory & Stock', module: 'INVENTORY' },
      { code: 'reports:view', name: 'View Reports & Analytics', module: 'REPORTS' },
      { code: 'staff:manage', name: 'Manage Staff & Roles', module: 'STAFF' },
      { code: 'settings:manage', name: 'Manage System Settings', module: 'SETTINGS' },
      { code: 'kitchen:view', name: 'Access Kitchen Display (KDS)', module: 'KITCHEN' },
    ]

    for (const p of permissions) {
      let existing = db.prepare('SELECT id FROM permissions WHERE code = ?').get(p.code)
      let permId = existing?.id
      if (!existing) {
        permId = uuid()
        db.prepare('INSERT INTO permissions (id, code, name, module, description) VALUES (?, ?, ?, ?, ?)')
          .run(permId, p.code, p.name, p.module, p.name)
      }

      // Link super_admin to all permissions
      if (roleMap.super_admin && permId) {
        db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)')
          .run(roleMap.super_admin, permId)
      }

      // Link manager
      if (roleMap.manager && permId && p.code !== 'settings:manage') {
        db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)')
          .run(roleMap.manager, permId)
      }

      // Link cashier
      if (roleMap.cashier && permId && ['dashboard:view', 'pos:create_order'].includes(p.code)) {
        db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)')
          .run(roleMap.cashier, permId)
      }

      // Link waiter
      if (roleMap.waiter && permId && ['pos:create_order'].includes(p.code)) {
        db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)')
          .run(roleMap.waiter, permId)
      }

      // Link kitchen
      if (roleMap.kitchen_staff && permId && ['kitchen:view'].includes(p.code)) {
        db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)')
          .run(roleMap.kitchen_staff, permId)
      }
    }

    // 4. Default Staff Users with Hashed Credentials
    const staffUsers = [
      {
        roleCode: 'super_admin',
        user: 'admin',
        name: 'Administrator',
        pin: '1234',
        pass: 'admin123',
      },
      {
        roleCode: 'manager',
        user: 'manager',
        name: 'Sarah Manager',
        pin: '4321',
        pass: 'manager123',
      },
      {
        roleCode: 'cashier',
        user: 'cashier1',
        name: 'Alex Cashier',
        pin: '0000',
        pass: 'cashier123',
      },
      {
        roleCode: 'waiter',
        user: 'waiter1',
        name: 'Jordan Waiter',
        pin: '1111',
        pass: null,
      },
      {
        roleCode: 'kitchen_staff',
        user: 'chef1',
        name: 'Chef Gordon',
        pin: '2222',
        pass: null,
      },
    ]

    const now = new Date().toISOString()
    for (const s of staffUsers) {
      const roleId = roleMap[s.roleCode] || null
      const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(s.user)
      if (existingUser) {
        db.prepare('UPDATE users SET branch_id = ?, role_id = ?, pin_hash = ?, password_hash = ?, is_active = 1 WHERE id = ?')
          .run(branchId, roleId, s.pin ? hashSecret(s.pin) : null, s.pass ? hashSecret(s.pass) : null, existingUser.id)
      } else {
        db.prepare(`
          INSERT INTO users (id, branch_id, role_id, username, display_name, password_hash, pin_hash, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
          uuid(),
          branchId,
          roleId,
          s.user,
          s.name,
          s.pass ? hashSecret(s.pass) : null,
          s.pin ? hashSecret(s.pin) : null,
          now,
          now
        )
      }
    }

    // 5. Floors & Tables
    const floorCount = db.prepare('SELECT COUNT(*) as count FROM floors').get().count
    if (floorCount === 0) {
      const now = new Date().toISOString()
      const groundFloorId = uuid()
      const terraceFloorId = uuid()

      db.prepare('INSERT INTO floors (id, branch_id, name, display_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(groundFloorId, branchId, 'Main Dining Hall', 1, 1, now)
      db.prepare('INSERT INTO floors (id, branch_id, name, display_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(terraceFloorId, branchId, 'Outdoor Terrace', 2, 1, now)

      // Tables
      const tables = [
        { floor: groundFloorId, num: 'T-01', cap: 2 },
        { floor: groundFloorId, num: 'T-02', cap: 4 },
        { floor: groundFloorId, num: 'T-03', cap: 4 },
        { floor: groundFloorId, num: 'T-04', cap: 6 },
        { floor: groundFloorId, num: 'T-05', cap: 8 },
        { floor: terraceFloorId, num: 'T-06', cap: 2 },
        { floor: terraceFloorId, num: 'T-07', cap: 4 },
        { floor: terraceFloorId, num: 'T-08', cap: 4 },
      ]

      for (const t of tables) {
        db.prepare(`
          INSERT INTO dining_tables (id, branch_id, floor_id, table_number, capacity, status, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'AVAILABLE', 1, ?, ?)
        `).run(uuid(), branchId, t.floor, t.num, t.cap, now, now)
      }
    }

    // 6. Categories & Products
    const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count
    if (catCount === 0) {
      const now = new Date().toISOString()
      const catBurgers = uuid()
      const catPizzas = uuid()
      const catSides = uuid()
      const catDrinks = uuid()

      db.prepare('INSERT INTO categories (id, branch_id, name, code, display_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(catBurgers, branchId, 'Gourmet Burgers', 'CAT-BGR', 1, 1, now)
      db.prepare('INSERT INTO categories (id, branch_id, name, code, display_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(catPizzas, branchId, 'Artisan Pizzas', 'CAT-PIZ', 2, 1, now)
      db.prepare('INSERT INTO categories (id, branch_id, name, code, display_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(catSides, branchId, 'Sides & Starters', 'CAT-SID', 3, 1, now)
      db.prepare('INSERT INTO categories (id, branch_id, name, code, display_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(catDrinks, branchId, 'Beverages & Coffee', 'CAT-DRK', 4, 1, now)

      // Sample Products
      const products = [
        { cat: catBurgers, name: 'Classic Angus Cheeseburger', price: 950, cost: 380, prep: 12 },
        { cat: catBurgers, name: 'Crispy Smoky Chicken Burger', price: 850, cost: 320, prep: 10 },
        { cat: catBurgers, name: 'Double Bacon Smashburger', price: 1199, cost: 480, prep: 14 },
        { cat: catPizzas, name: 'Woodfired Margherita Pizza', price: 1250, cost: 390, prep: 15 },
        { cat: catPizzas, name: 'Pepperoni Feast Pizza', price: 1499, cost: 520, prep: 16 },
        { cat: catSides, name: 'Crispy Seasoned French Fries', price: 399, cost: 90, prep: 6 },
        { cat: catSides, name: 'Loaded Cheesy Nachos', price: 650, cost: 180, prep: 8 },
        { cat: catDrinks, name: 'Artisan Iced Caramel Latte', price: 450, cost: 110, prep: 4 },
        { cat: catDrinks, name: 'Fresh Mint Lemonade', price: 350, cost: 70, prep: 3 },
      ]

      for (const p of products) {
        db.prepare(`
          INSERT INTO products (id, branch_id, category_id, name, sku, base_price_cents, cost_price_cents, preparation_time_minutes, is_available, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
        `).run(uuid(), branchId, p.cat, p.name, `SKU-${Math.floor(1000 + Math.random() * 9000)}`, p.price, p.cost, p.prep, now, now)
      }
    }

    // 7. Customers & Loyalty Seeds
    const customerCount = db.prepare('SELECT COUNT(*) as count FROM customers').get().count
    if (customerCount === 0) {
      const sampleCustomers = [
        { name: 'John Doe', phone: '+1 555-0142', email: 'john.doe@example.com', address: '45 Elm Street, Apt 3B', notes: 'Prefers contactless delivery' },
        { name: 'Emma Watson', phone: '+1 555-0188', email: 'emma.w@example.com', address: '128 Ocean Avenue, Suite 10', notes: 'VIP regular customer' },
        { name: 'David Miller', phone: '+1 555-0125', email: 'david.m@example.com', address: '99 Maple Drive', notes: 'Allergic to peanuts' },
      ]
      for (const c of sampleCustomers) {
        db.prepare(`
          INSERT INTO customers (id, branch_id, name, phone, email, address, notes, loyalty_points, total_spent_cents, order_count, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 50, 4500, 3, ?, ?)
        `).run(uuid(), branchId, c.name, c.phone, c.email, c.address, c.notes, now, now)
      }
    }

    // 7.5 Kitchen Stations Seeds (Phase 6)
    try {
      const stationCount = db.prepare('SELECT COUNT(*) as count FROM kitchen_stations').get().count
      if (stationCount === 0) {
        const insertStation = db.prepare(`
          INSERT INTO kitchen_stations (id, branch_id, name, code, color_code, display_order, is_active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        `)
        insertStation.run('station-grill', branchId, 'Grill & Fryer', 'GRILL', '#ef4444', 1, now)
        insertStation.run('station-pizza', branchId, 'Pizza & Oven', 'PIZZA', '#f59e0b', 2, now)
        insertStation.run('station-bar', branchId, 'Bar & Beverages', 'DRINKS', '#06b6d4', 3, now)
        insertStation.run('station-expo', branchId, 'Packaging & Expo', 'EXPO', '#10b981', 4, now)
      }
    } catch (e) {}

    // 8. Inventory Units
    const unitCount = db.prepare('SELECT COUNT(*) as count FROM inventory_units').get().count
    if (unitCount === 0) {
      db.prepare('INSERT INTO inventory_units (id, name, abbreviation) VALUES (?, ?, ?)').run(uuid(), 'Kilogram', 'kg')
      db.prepare('INSERT INTO inventory_units (id, name, abbreviation) VALUES (?, ?, ?)').run(uuid(), 'Gram', 'g')
      db.prepare('INSERT INTO inventory_units (id, name, abbreviation) VALUES (?, ?, ?)').run(uuid(), 'Piece', 'pc')
      db.prepare('INSERT INTO inventory_units (id, name, abbreviation) VALUES (?, ?, ?)').run(uuid(), 'Liter', 'L')
    }

    // 8.1 Suppliers Seeds (Phase 7)
    const supplierCount = db.prepare('SELECT COUNT(*) as count FROM suppliers').get().count
    const supplierMap = {}
    if (supplierCount === 0) {
      const sampleSuppliers = [
        { name: 'Apex Prime Meats Ltd', contact: 'Robert Jenkins', phone: '+1 555-4301', email: 'orders@apexmeats.com', address: '12 Industrial Way' },
        { name: 'Fresh Farms Produce', contact: 'Maria Garcia', phone: '+1 555-4302', email: 'sales@freshfarms.com', address: '88 Valley Road' },
        { name: 'Dairy King Wholesale', contact: 'Thomas Brown', phone: '+1 555-4303', email: 'support@dairyking.com', address: '45 Cold Storage Blvd' },
        { name: 'Metro Beverage Co', contact: 'Elena Rostova', phone: '+1 555-4304', email: 'orders@metrobev.com', address: '77 Port Street' },
      ]
      for (const s of sampleSuppliers) {
        const supId = uuid()
        supplierMap[s.name] = supId
        db.prepare(`
          INSERT INTO suppliers (id, branch_id, company_name, contact_name, phone, email, address, is_active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        `).run(supId, branchId, s.name, s.contact, s.phone, s.email, s.address, now)
      }
    }

    // 8.2 Inventory Items Seeds (Phase 7)
    const inventoryCount = db.prepare('SELECT COUNT(*) as count FROM inventory_items').get().count
    const itemMap = {}
    if (inventoryCount === 0) {
      const kgUnit = db.prepare("SELECT id FROM inventory_units WHERE abbreviation = 'kg' LIMIT 1").get()?.id
      const pcUnit = db.prepare("SELECT id FROM inventory_units WHERE abbreviation = 'pc' LIMIT 1").get()?.id
      const lUnit = db.prepare("SELECT id FROM inventory_units WHERE abbreviation = 'L' LIMIT 1").get()?.id

      const rawItems = [
        { name: 'Angus Beef Patties (150g)', sku: 'RAW-BEEF-01', unit: pcUnit, stock: 120.0, min: 25.0, cost: 220, cat: 'Meat & Poultry' },
        { name: 'Artisan Brioche Burger Buns', sku: 'RAW-BUN-01', unit: pcUnit, stock: 150.0, min: 30.0, cost: 45, cat: 'Bakery' },
        { name: 'Aged Cheddar Cheese Slices', sku: 'RAW-CHED-01', unit: pcUnit, stock: 200.0, min: 40.0, cost: 35, cat: 'Dairy & Cheese' },
        { name: 'Fresh Pizza Dough Balls', sku: 'RAW-DOUGH-01', unit: pcUnit, stock: 60.0, min: 15.0, cost: 110, cat: 'Bakery' },
        { name: 'Shredded Mozzarella Cheese', sku: 'RAW-MOZZ-01', unit: kgUnit, stock: 25.0, min: 8.0, cost: 850, cat: 'Dairy & Cheese' },
        { name: 'Italian San Marzano Tomato Sauce', sku: 'RAW-SAUCE-01', unit: kgUnit, stock: 30.0, min: 10.0, cost: 420, cat: 'Produce' },
        { name: 'Crispy Seasoning French Fries Cut', sku: 'RAW-FRIES-01', unit: kgUnit, stock: 50.0, min: 15.0, cost: 180, cat: 'Produce' },
        { name: 'Fresh Sicilian Lemons', sku: 'RAW-LEM-01', unit: kgUnit, stock: 15.0, min: 5.0, cost: 250, cat: 'Produce' },
        { name: 'Espresso Coffee Beans Blend', sku: 'RAW-COF-01', unit: kgUnit, stock: 18.0, min: 6.0, cost: 1600, cat: 'Beverages' },
      ]

      for (const item of rawItems) {
        if (!item.unit) continue
        const itemId = uuid()
        itemMap[item.name] = itemId
        db.prepare(`
          INSERT INTO inventory_items (id, branch_id, name, sku, unit_id, current_stock, minimum_level, cost_per_unit_cents, category, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(itemId, branchId, item.name, item.sku, item.unit, item.stock, item.min, item.cost, item.cat, now, now)
      }

      // 8.3 Recipe Seeds linking Products to Ingredients
      const burgerProd = db.prepare("SELECT id FROM products WHERE name LIKE '%Cheeseburger%' LIMIT 1").get()
      if (burgerProd && itemMap['Angus Beef Patties (150g)'] && itemMap['Artisan Brioche Burger Buns']) {
        const recipeId = uuid()
        db.prepare('INSERT INTO recipes (id, product_id, yield_quantity, notes) VALUES (?, ?, 1.0, ?)')
          .run(recipeId, burgerProd.id, 'Standard Cheeseburger assembly')

        db.prepare('INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required) VALUES (?, ?, ?, 1.0)')
          .run(uuid(), recipeId, itemMap['Angus Beef Patties (150g)'])
        db.prepare('INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required) VALUES (?, ?, ?, 1.0)')
          .run(uuid(), recipeId, itemMap['Artisan Brioche Burger Buns'])
        if (itemMap['Aged Cheddar Cheese Slices']) {
          db.prepare('INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required) VALUES (?, ?, ?, 1.0)')
            .run(uuid(), recipeId, itemMap['Aged Cheddar Cheese Slices'])
        }
      }

      const pizzaProd = db.prepare("SELECT id FROM products WHERE name LIKE '%Margherita%' LIMIT 1").get()
      if (pizzaProd && itemMap['Fresh Pizza Dough Balls'] && itemMap['Shredded Mozzarella Cheese']) {
        const recipeId = uuid()
        db.prepare('INSERT INTO recipes (id, product_id, yield_quantity, notes) VALUES (?, ?, 1.0, ?)')
          .run(recipeId, pizzaProd.id, '12-inch Woodfired Margherita')

        db.prepare('INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required) VALUES (?, ?, ?, 1.0)')
          .run(uuid(), recipeId, itemMap['Fresh Pizza Dough Balls'])
        db.prepare('INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required) VALUES (?, ?, ?, 0.20)')
          .run(uuid(), recipeId, itemMap['Shredded Mozzarella Cheese'])
        if (itemMap['Italian San Marzano Tomato Sauce']) {
          db.prepare('INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required) VALUES (?, ?, ?, 0.15)')
            .run(uuid(), recipeId, itemMap['Italian San Marzano Tomato Sauce'])
        }
      }
    }

    // 9. Default Business Settings
    const defaultSettings = [
      { key: 'business_name', val: 'FastBite Gourmet Grill', cat: 'GENERAL' },
      { key: 'tax_rate_percentage', val: '5.0', cat: 'TAX' },
      { key: 'service_charge_percentage', val: '0.0', cat: 'TAX' },
      { key: 'currency_code', val: 'USD', cat: 'LOCALIZATION' },
      { key: 'currency_symbol', val: '$', cat: 'LOCALIZATION' },
      { key: 'receipt_header', val: 'FastBite Gourmet Grill\n100 Gourmet Plaza, Suite 4\nTel: +1 555-0199', cat: 'RECEIPT' },
      { key: 'receipt_footer', val: 'Thank you for dining with us!\nVisit again soon.', cat: 'RECEIPT' },
      { key: 'low_stock_threshold', val: '5.0', cat: 'INVENTORY' },
    ]

    for (const s of defaultSettings) {
      db.prepare(`
        INSERT OR IGNORE INTO system_settings (setting_key, setting_value, category, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(s.key, s.val, s.cat, new Date().toISOString())
    }

    // 10. Staff Shifts & Employee Profiles (Phase 8)
    try {
      const shiftCount = db.prepare('SELECT COUNT(*) as count FROM staff_shifts').get()?.count || 0
      if (shiftCount === 0) {
        const shifts = [
          { name: 'Morning Shift', start: '08:00', end: '16:00' },
          { name: 'Evening Shift', start: '16:00', end: '00:00' },
          { name: 'Night Shift', start: '00:00', end: '08:00' },
        ]
        const insertShift = db.prepare(`
          INSERT INTO staff_shifts (id, branch_id, name, start_time, end_time, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        `)
        for (const s of shifts) {
          insertShift.run(uuid(), branchId, s.name, s.start, s.end, now, now)
        }
      }

      const empCount = db.prepare('SELECT COUNT(*) as count FROM employees').get()?.count || 0
      if (empCount === 0) {
        const users = db.prepare('SELECT id, username, display_name, role_id FROM users WHERE branch_id = ?').all(branchId)
        const insertEmp = db.prepare(`
          INSERT INTO employees (
            id, branch_id, user_id, employee_code, first_name, last_name,
            email, phone, designation, role_id, salary_type, base_rate_cents,
            hire_date, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        `)
        let codeIndex = 101
        for (const u of users) {
          const names = u.display_name.split(' ')
          const firstName = names[0] || u.username
          const lastName = names.slice(1).join(' ') || 'Staff'
          const designation = u.username.includes('admin')
            ? 'General Manager'
            : u.username.includes('manager')
            ? 'Floor Manager'
            : u.username.includes('cashier')
            ? 'Senior Cashier'
            : u.username.includes('waiter')
            ? 'Head Waiter'
            : u.username.includes('chef')
            ? 'Head Chef'
            : 'Staff Member'

          insertEmp.run(
            uuid(),
            branchId,
            u.id,
            `EMP-${codeIndex++}`,
            firstName,
            lastName,
            `${u.username}@restaurant.local`,
            `+1 555-01${codeIndex}`,
            designation,
            u.role_id,
            'MONTHLY',
            250000,
            '2026-01-01',
            now,
            now
          )
        }
      }
    } catch (e) {
      console.warn('Phase 8 staff seeds skipped:', e)
    }

    // 14. Phase 9: Default Promotional Coupons & CRM
    try {
      const couponCount = db.prepare('SELECT COUNT(*) as count FROM coupons').get()?.count || 0
      if (couponCount === 0) {
        const defaultCoupons = [
          {
            code: 'WELCOME10',
            title: '10% Welcome Discount',
            type: 'PERCENTAGE',
            val: 10,
            min: 1500, // min $15.00
            max: 500,  // max $5.00 off
          },
          {
            code: 'LUNCH5',
            title: '$5 Off Lunch Saver',
            type: 'FIXED_AMOUNT',
            val: 500, // $5.00
            min: 2500, // min $25.00
            max: null,
          },
          {
            code: 'VIP20',
            title: '20% VIP Feast Special',
            type: 'PERCENTAGE',
            val: 20,
            min: 5000, // min $50.00
            max: 2000, // max $20.00 off
          },
        ]

        const insertCoupon = db.prepare(`
          INSERT INTO coupons (
            id, branch_id, code, title, discount_type, discount_value,
            min_order_cents, max_discount_cents, start_date, end_date,
            usage_limit, times_used, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
        `)

        const now = new Date().toISOString()
        for (const c of defaultCoupons) {
          insertCoupon.run(
            uuid(),
            branchId,
            c.code,
            c.title,
            c.type,
            c.val,
            c.min,
            c.max,
            null,
            null,
            100,
            now,
            now
          )
        }
      }
    } catch (e) {
      console.warn('Phase 9 coupons seeds skipped:', e)
    }

    // 15. Phase 10: Delivery Zones & Riders Fleet
    try {
      const zoneCount = db.prepare('SELECT COUNT(*) as count FROM delivery_zones').get()?.count || 0
      if (zoneCount === 0) {
        const defaultZones = [
          {
            name: 'Zone A - Downtown & Financial District',
            chargeCents: 300,
            minOrderCents: 1500,
            minutes: 30,
            desc: 'Central commercial hub and high-rise apartments within 4 km',
          },
          {
            name: 'Zone B - West Suburbs & Uptown',
            chargeCents: 500,
            minOrderCents: 2000,
            minutes: 45,
            desc: 'Residential districts and universities within 8 km',
          },
          {
            name: 'Zone C - Outer Metro & North Hills',
            chargeCents: 800,
            minOrderCents: 3000,
            minutes: 60,
            desc: 'Extended delivery perimeter up to 15 km',
          },
        ]

        const insertZone = db.prepare(`
          INSERT INTO delivery_zones (
            id, branch_id, name, delivery_charge_cents, min_order_cents,
            estimated_minutes, description, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `)

        const now = new Date().toISOString()
        for (const z of defaultZones) {
          insertZone.run(
            uuid(),
            branchId,
            z.name,
            z.chargeCents,
            z.minOrderCents,
            z.minutes,
            z.desc,
            now,
            now
          )
        }
      }

      const riderCount = db.prepare('SELECT COUNT(*) as count FROM riders').get()?.count || 0
      if (riderCount === 0) {
        const defaultRiders = [
          { name: 'Marco Silva', phone: '+1 555-8011', vehicle: 'MOTORCYCLE', plate: 'MTR-4491' },
          { name: 'Lucas Bennett', phone: '+1 555-8012', vehicle: 'SCOOTER', plate: 'SCT-2208' },
          { name: 'Derrick Vance', phone: '+1 555-8013', vehicle: 'BICYCLE', plate: 'BIKE-03' },
        ]

        const insertRider = db.prepare(`
          INSERT INTO riders (
            id, branch_id, name, phone, vehicle_type, license_plate,
            status, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE', 1, ?, ?)
        `)

        const now = new Date().toISOString()
        for (const r of defaultRiders) {
          insertRider.run(
            uuid(),
            branchId,
            r.name,
            r.phone,
            r.vehicle,
            r.plate,
            now,
            now
          )
        }
      }
    } catch (e) {
      console.warn('Phase 10 delivery seeds skipped:', e)
    }
  })

  seedTx()
  console.log('[Database Seed] Seeding completed successfully.')
}
