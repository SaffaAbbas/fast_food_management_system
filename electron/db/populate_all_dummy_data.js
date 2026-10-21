import path from 'node:path'
import crypto from 'node:crypto'
import { initDatabase, getDb, closeDatabase } from './index.js'
import { hashSecret } from './repositories/authRepository.js'

function uuid() {
  return crypto.randomUUID()
}

export function populateAllDummyData() {
  const dbPath = path.resolve(process.cwd(), 'database_storage', 'restaurant_pos.sqlite')
  console.log('====================================================')
  console.log('[Dummy Data Seeder] Starting complete seed into:', dbPath)
  console.log('====================================================')

  initDatabase({ dbPath, seed: false })
  const db = getDb()

  const seedTransaction = db.transaction(() => {
    const now = new Date()
    const nowIso = now.toISOString()
    const todayStr = nowIso.slice(0, 10)

    // Helper date generators for past days
    const daysAgo = (days, hours = 12, mins = 0) => {
      const d = new Date(now.getTime() - days * 86400000)
      d.setHours(hours, mins, 0, 0)
      return d.toISOString()
    }

    // -------------------------------------------------------------------------
    // 1. BRANCH
    // -------------------------------------------------------------------------
    let branch = db.prepare('SELECT id FROM branches LIMIT 1').get()
    let branchId = branch?.id

    if (!branchId) {
      branchId = uuid()
      db.prepare(`
        INSERT INTO branches (id, name, code, phone, email, address, city, currency_code, currency_symbol, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        branchId,
        'Main Flagship Branch',
        'BR-01',
        '+1 (555) 234-5678',
        'contact@gourmetbistro.com',
        '100 Gourmet Plaza, Suite 4',
        'Metropolis',
        'USD',
        '$',
        nowIso,
        nowIso
      )
    }

    // -------------------------------------------------------------------------
    // 2. ROLES & PERMISSIONS
    // -------------------------------------------------------------------------
    const roles = [
      { code: 'super_admin', name: 'Super Administrator', desc: 'Full system and branch access' },
      { code: 'manager', name: 'Restaurant Manager', desc: 'Orders, inventory, staff, discounts and reports' },
      { code: 'cashier', name: 'Cashier', desc: 'POS order entry, payments and receipts' },
      { code: 'waiter', name: 'Waiter', desc: 'Dine-in table orders and customer service' },
      { code: 'kitchen_staff', name: 'Kitchen Chef', desc: 'Kitchen display screen and order preparation' },
    ]

    const roleMap = {}
    for (const r of roles) {
      let existing = db.prepare('SELECT id FROM roles WHERE code = ?').get(r.code)
      if (!existing) {
        const id = uuid()
        db.prepare('INSERT INTO roles (id, code, name, description, is_system, created_at) VALUES (?, ?, ?, ?, 1, ?)')
          .run(id, r.code, r.name, r.desc, nowIso)
        roleMap[r.code] = id
      } else {
        roleMap[r.code] = existing.id
      }
    }

    // -------------------------------------------------------------------------
    // 3. USERS (PINs: admin:1234, manager:2345, cashier:3456, waiter:4567, chef:5678)
    // -------------------------------------------------------------------------
    const testUsers = [
      { username: 'admin', display_name: 'John Administrator', role: 'super_admin', pin: '1234', pass: 'admin123' },
      { username: 'manager', display_name: 'Rachel Manager', role: 'manager', pin: '2345', pass: 'manager123' },
      { username: 'cashier', display_name: 'Sam Cashier', role: 'cashier', pin: '3456', pass: 'cashier123' },
      { username: 'waiter', display_name: 'David Waiter', role: 'waiter', pin: '4567', pass: 'waiter123' },
      { username: 'chef', display_name: 'Gordon Head Chef', role: 'kitchen_staff', pin: '5678', pass: 'chef123' },
    ]

    const userMap = {}
    for (const u of testUsers) {
      let existing = db.prepare('SELECT id FROM users WHERE username = ?').get(u.username)
      if (!existing) {
        const id = uuid()
        db.prepare(`
          INSERT INTO users (id, branch_id, role_id, username, display_name, pin_hash, password_hash, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
          id,
          branchId,
          roleMap[u.role],
          u.username,
          u.display_name,
          hashSecret(u.pin),
          hashSecret(u.pass),
          nowIso,
          nowIso
        )
        userMap[u.username] = id
      } else {
        // Ensure valid branch_id and hashes
        db.prepare(`
          UPDATE users 
          SET branch_id = ?, pin_hash = ?, password_hash = ?, is_active = 1, updated_at = ?
          WHERE id = ?
        `).run(branchId, hashSecret(u.pin), hashSecret(u.pass), nowIso, existing.id)
        userMap[u.username] = existing.id
      }
    }

    // -------------------------------------------------------------------------
    // 4. FLOORS & DINING TABLES
    // -------------------------------------------------------------------------
    const floorList = [
      { name: 'Ground Floor Dining Hall', order: 1 },
      { name: 'Rooftop Terrace & Garden', order: 2 },
    ]

    const floorMap = {}
    for (const f of floorList) {
      let existing = db.prepare('SELECT id FROM floors WHERE branch_id = ? AND name = ?').get(branchId, f.name)
      if (!existing) {
        const id = uuid()
        db.prepare('INSERT INTO floors (id, branch_id, name, display_order, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)')
          .run(id, branchId, f.name, f.order, nowIso)
        floorMap[f.name] = id
      } else {
        floorMap[f.name] = existing.id
      }
    }

    const tableDefs = [
      { number: 'T-01', floor: 'Ground Floor Dining Hall', capacity: 2, status: 'AVAILABLE' },
      { number: 'T-02', floor: 'Ground Floor Dining Hall', capacity: 4, status: 'AVAILABLE' },
      { number: 'T-03', floor: 'Ground Floor Dining Hall', capacity: 4, status: 'RESERVED' },
      { number: 'T-04', floor: 'Ground Floor Dining Hall', capacity: 6, status: 'AVAILABLE' },
      { number: 'T-05', floor: 'Ground Floor Dining Hall', capacity: 8, status: 'AVAILABLE' },
      { number: 'R-01', floor: 'Rooftop Terrace & Garden', capacity: 2, status: 'AVAILABLE' },
      { number: 'R-02', floor: 'Rooftop Terrace & Garden', capacity: 4, status: 'AVAILABLE' },
      { number: 'R-03', floor: 'Rooftop Terrace & Garden', capacity: 6, status: 'AVAILABLE' },
    ]

    const tableMap = {}
    for (const t of tableDefs) {
      let existing = db.prepare('SELECT id FROM dining_tables WHERE branch_id = ? AND table_number = ?').get(branchId, t.number)
      if (!existing) {
        const id = uuid()
        db.prepare(`
          INSERT INTO dining_tables (id, branch_id, floor_id, table_number, capacity, status, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(id, branchId, floorMap[t.floor], t.number, t.capacity, t.status, nowIso, nowIso)
        tableMap[t.number] = id
      } else {
        tableMap[t.number] = existing.id
      }
    }

    // -------------------------------------------------------------------------
    // 5. KITCHEN STATIONS
    // -------------------------------------------------------------------------
    const stationDefs = [
      { name: 'Grill Station', code: 'GRILL', color: '#f97316', order: 1 },
      { name: 'Pizza & Oven', code: 'PIZZA', color: '#ef4444', order: 2 },
      { name: 'Fryer & Sides', code: 'FRYER', color: '#eab308', order: 3 },
      { name: 'Beverage & Bar', code: 'BAR', color: '#06b6d4', order: 4 },
    ]

    const stationMap = {}
    for (const s of stationDefs) {
      let existing = db.prepare('SELECT id FROM kitchen_stations WHERE branch_id = ? AND code = ?').get(branchId, s.code)
      if (!existing) {
        const id = uuid()
        db.prepare(`
          INSERT INTO kitchen_stations (id, branch_id, name, code, color_code, display_order, is_active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        `).run(id, branchId, s.name, s.code, s.color, s.order, nowIso)
        stationMap[s.code] = id
      } else {
        stationMap[s.code] = existing.id
      }
    }

    // -------------------------------------------------------------------------
    // 6. PRODUCT CATEGORIES
    // -------------------------------------------------------------------------
    const categoryDefs = [
      { name: 'Burgers & Sandwiches', code: 'BURGERS', order: 1 },
      { name: 'Artisan Pizzas', code: 'PIZZA', order: 2 },
      { name: 'Crispy Sides & Starters', code: 'SIDES', order: 3 },
      { name: 'Beverages & Refreshers', code: 'DRINKS', order: 4 },
      { name: 'Sweet Desserts', code: 'DESSERTS', order: 5 },
      { name: 'Meal Combos & Value Deals', code: 'COMBOS', order: 6 },
    ]

    const categoryMap = {}
    for (const c of categoryDefs) {
      let existing = db.prepare('SELECT id FROM categories WHERE branch_id = ? AND code = ?').get(branchId, c.code)
      if (!existing) {
        const id = uuid()
        db.prepare(`
          INSERT INTO categories (id, branch_id, name, code, display_order, is_active, is_visible_pos, is_visible_online, created_at)
          VALUES (?, ?, ?, ?, ?, 1, 1, 1, ?)
        `).run(id, branchId, c.name, c.code, c.order, nowIso)
        categoryMap[c.code] = id
      } else {
        categoryMap[c.code] = existing.id
      }
    }

    // -------------------------------------------------------------------------
    // 7. PRODUCTS & VARIATIONS
    // -------------------------------------------------------------------------
    const productDefs = [
      // Burgers
      {
        name: 'Classic Cheeseburger',
        code: 'BURGER-CLS',
        category: 'BURGERS',
        station: 'GRILL',
        price: 899,
        cost: 350,
        prep: 10,
        desc: 'Handcrafted Angus beef patty, melted cheddar, lettuce, pickles and special sauce on toasted brioche bun.',
        has_variations: 0,
      },
      {
        name: 'Smoky Double Bacon Burger',
        code: 'BURGER-DBL',
        category: 'BURGERS',
        station: 'GRILL',
        price: 1249,
        cost: 480,
        prep: 12,
        desc: 'Two flame-grilled patties, applewood bacon strips, aged cheddar and smoky house BBQ glaze.',
        has_variations: 0,
      },
      {
        name: 'Crispy Zinger Chicken Burger',
        code: 'BURGER-ZNG',
        category: 'BURGERS',
        station: 'GRILL',
        price: 999,
        cost: 380,
        prep: 10,
        desc: 'Crispy buttermilk battered chicken fillet with spicy mayo and shredded iceberg lettuce.',
        has_variations: 0,
      },
      // Pizzas (with size variations)
      {
        name: 'Margherita Supreme Pizza',
        code: 'PIZZA-MAR',
        category: 'PIZZA',
        station: 'PIZZA',
        price: 1199,
        cost: 420,
        prep: 15,
        desc: 'Crushed San Marzano tomatoes, fresh mozzarella pearls, sweet basil and extra virgin olive oil.',
        has_variations: 1,
        variations: [
          { name: '9-inch Personal', price: 1199, cost: 420, is_default: 1 },
          { name: '12-inch Medium', price: 1699, cost: 600, is_default: 0 },
          { name: '14-inch Large Family', price: 2199, cost: 780, is_default: 0 },
        ],
      },
      {
        name: 'Pepperoni Feast Pizza',
        code: 'PIZZA-PEP',
        category: 'PIZZA',
        station: 'PIZZA',
        price: 1399,
        cost: 510,
        prep: 15,
        desc: 'Overloaded with crisp spicy pepperoni curls, rich tomato reduction and melted mozzarella.',
        has_variations: 1,
        variations: [
          { name: '9-inch Personal', price: 1399, cost: 510, is_default: 1 },
          { name: '12-inch Medium', price: 1899, cost: 710, is_default: 0 },
          { name: '14-inch Large Family', price: 2399, cost: 920, is_default: 0 },
        ],
      },
      {
        name: 'BBQ Smoked Chicken Pizza',
        code: 'PIZZA-BBQ',
        category: 'PIZZA',
        station: 'PIZZA',
        price: 1449,
        cost: 540,
        prep: 16,
        desc: 'Grilled chicken tenders, red onions, smoked Gouda and tangy BBQ swirl.',
        has_variations: 1,
        variations: [
          { name: '9-inch Personal', price: 1449, cost: 540, is_default: 1 },
          { name: '12-inch Medium', price: 1949, cost: 740, is_default: 0 },
          { name: '14-inch Large Family', price: 2449, cost: 960, is_default: 0 },
        ],
      },
      // Sides
      {
        name: 'Golden Crinkle Cut Fries',
        code: 'SIDE-FRS',
        category: 'SIDES',
        station: 'FRYER',
        price: 399,
        cost: 110,
        prep: 6,
        desc: 'Crispy fried Idaho crinkle potatoes tossed in herb rosemary salt.',
        has_variations: 0,
      },
      {
        name: 'Crispy Mozzarella Sticks (6 pcs)',
        code: 'SIDE-MOZ',
        category: 'SIDES',
        station: 'FRYER',
        price: 599,
        cost: 190,
        prep: 7,
        desc: 'Golden-fried breaded Wisconsin mozzarella with warm marinara dipping sauce.',
        has_variations: 0,
      },
      {
        name: 'Buffalo Hot Wings (8 pcs)',
        code: 'SIDE-WNG',
        category: 'SIDES',
        station: 'FRYER',
        price: 799,
        cost: 290,
        prep: 9,
        desc: 'Jumbo wings tossed in classic fiery cayenne butter glaze with blue cheese dip.',
        has_variations: 0,
      },
      // Beverages
      {
        name: 'Craft Cola Float',
        code: 'DRK-COL',
        category: 'DRINKS',
        station: 'BAR',
        price: 349,
        cost: 80,
        prep: 3,
        desc: 'Chilled artisanal cane-sugar cola poured over a scoop of vanilla bean gelato.',
        has_variations: 0,
      },
      {
        name: 'Fresh Mint Lemonade',
        code: 'DRK-LEM',
        category: 'DRINKS',
        station: 'BAR',
        price: 429,
        cost: 90,
        prep: 4,
        desc: 'Freshly squeezed Meyer lemons blended with crushed garden mint and raw cane sugar.',
        has_variations: 0,
      },
      {
        name: 'Iced Caramel Macchiato',
        code: 'DRK-CAR',
        category: 'DRINKS',
        station: 'BAR',
        price: 499,
        cost: 120,
        prep: 4,
        desc: 'Double shot espresso layered over chilled whole milk and buttery vanilla caramel drizzle.',
        has_variations: 0,
      },
      // Desserts
      {
        name: 'Warm Molten Lava Cake',
        code: 'DES-LAV',
        category: 'DESSERTS',
        station: 'FRYER',
        price: 649,
        cost: 200,
        prep: 8,
        desc: 'Rich Belgian dark chocolate cake with an oozing liquid ganache core and powdered sugar.',
        has_variations: 0,
      },
      {
        name: 'New York Cheesecake',
        code: 'DES-CHK',
        category: 'DESSERTS',
        station: 'FRYER',
        price: 599,
        cost: 180,
        prep: 4,
        desc: 'Dense, velvety cream cheese filling with a buttery graham cracker crust and berry coulis.',
        has_variations: 0,
      },
    ]

    const productMap = {}
    const variationMap = {}

    for (const p of productDefs) {
      let existing = db.prepare('SELECT id FROM products WHERE branch_id = ? AND name = ?').get(branchId, p.name)
      let prodId = existing?.id

      if (!existing) {
        prodId = uuid()
        db.prepare(`
          INSERT INTO products (
            id, branch_id, category_id, kitchen_station_id, name, sku, description,
            base_price_cents, cost_price_cents, tax_percentage, preparation_time_minutes,
            is_available, has_variations, track_inventory, is_active, is_featured, is_discount_eligible,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 8.25, ?, 1, ?, 1, 1, 1, 1, ?, ?)
        `).run(
          prodId,
          branchId,
          categoryMap[p.category],
          stationMap[p.station],
          p.name,
          p.code,
          p.desc,
          p.price,
          p.cost,
          p.prep,
          p.has_variations,
          nowIso,
          nowIso
        )
      } else {
        db.prepare(`
          UPDATE products 
          SET category_id = ?, kitchen_station_id = ?, base_price_cents = ?, is_active = 1, is_available = 1
          WHERE id = ?
        `).run(categoryMap[p.category], stationMap[p.station], p.price, prodId)
      }

      productMap[p.name] = prodId

      // Variations if defined
      if (p.has_variations && p.variations) {
        for (const v of p.variations) {
          let varExist = db.prepare('SELECT id FROM product_variations WHERE product_id = ? AND name = ?').get(prodId, v.name)
          if (!varExist) {
            const varId = uuid()
            db.prepare(`
              INSERT INTO product_variations (id, product_id, name, sku, price_cents, cost_cents, is_default, is_active)
              VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            `).run(varId, prodId, v.name, `${p.code}-${v.name.slice(0, 3).toUpperCase()}`, v.price, v.cost, v.is_default)
            variationMap[`${p.name}_${v.name}`] = varId
          } else {
            variationMap[`${p.name}_${v.name}`] = varExist.id
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // 8. MODIFIERS & MODIFIER GROUPS
    // -------------------------------------------------------------------------
    const burgerGroupExist = db.prepare("SELECT id FROM modifier_groups WHERE name = 'Burger Add-ons'").get()
    let burgerGroupId = burgerGroupExist?.id
    if (!burgerGroupId) {
      burgerGroupId = uuid()
      db.prepare(`
        INSERT INTO modifier_groups (id, product_id, name, is_required, min_selection, max_selection)
        VALUES (?, NULL, 'Burger Add-ons', 0, 0, 4)
      `).run(burgerGroupId)

      const burgerMods = [
        { name: 'Extra Cheddar Slice', price: 100 },
        { name: 'Crispy Bacon Strips (2 pcs)', price: 150 },
        { name: 'Jalapeño Pickles', price: 75 },
        { name: 'Sautéed Garlic Mushrooms', price: 125 },
      ]
      for (const m of burgerMods) {
        db.prepare('INSERT INTO modifiers (id, group_id, name, price_cents, is_active) VALUES (?, ?, ?, ?, 1)')
          .run(uuid(), burgerGroupId, m.name, m.price)
      }
    }

    const crustGroupExist = db.prepare("SELECT id FROM modifier_groups WHERE name = 'Crust Style'").get()
    let crustGroupId = crustGroupExist?.id
    if (!crustGroupId) {
      crustGroupId = uuid()
      db.prepare(`
        INSERT INTO modifier_groups (id, product_id, name, is_required, min_selection, max_selection)
        VALUES (?, NULL, 'Crust Style', 0, 0, 1)
      `).run(crustGroupId)

      const crustMods = [
        { name: 'Thin & Crispy Roman Crust', price: 0 },
        { name: 'Cheese Stuffed Crust', price: 250 },
        { name: 'Garlic Herb Glazed Crust', price: 150 },
      ]
      for (const m of crustMods) {
        db.prepare('INSERT INTO modifiers (id, group_id, name, price_cents, is_active) VALUES (?, ?, ?, ?, 1)')
          .run(uuid(), crustGroupId, m.name, m.price)
      }
    }

    // -------------------------------------------------------------------------
    // 9. COMBOS & VALUE DEALS
    // -------------------------------------------------------------------------
    const comboDefs = [
      {
        name: 'Ultimate Solo Burger Box',
        code: 'CMB-SOLO',
        desc: 'Classic Cheeseburger + Golden Crinkle Cut Fries + Craft Cola Float',
        price: 1299,
        items: [
          { prod: 'Classic Cheeseburger', qty: 1 },
          { prod: 'Golden Crinkle Cut Fries', qty: 1 },
          { prod: 'Craft Cola Float', qty: 1 },
        ],
      },
      {
        name: 'Family Pizza Fiesta Deal',
        code: 'CMB-FAM',
        desc: 'Pepperoni Feast Pizza + Crispy Mozzarella Sticks + Buffalo Hot Wings + 2x Fresh Mint Lemonade',
        price: 3499,
        items: [
          { prod: 'Pepperoni Feast Pizza', qty: 1 },
          { prod: 'Crispy Mozzarella Sticks (6 pcs)', qty: 1 },
          { prod: 'Buffalo Hot Wings (8 pcs)', qty: 1 },
          { prod: 'Fresh Mint Lemonade', qty: 2 },
        ],
      },
      {
        name: 'Twin Burger Crunch Pack',
        code: 'CMB-TWIN',
        desc: '2x Crispy Zinger Burgers + 2x Crinkle Cut Fries + 2x Craft Cola',
        price: 2199,
        items: [
          { prod: 'Crispy Zinger Chicken Burger', qty: 2 },
          { prod: 'Golden Crinkle Cut Fries', qty: 2 },
          { prod: 'Craft Cola Float', qty: 2 },
        ],
      },
    ]

    for (const cmb of comboDefs) {
      let exist = db.prepare('SELECT id FROM combos WHERE branch_id = ? AND name = ?').get(branchId, cmb.name)
      if (!exist) {
        const comboId = uuid()
        db.prepare(`
          INSERT INTO combos (id, branch_id, name, code, description, price_cents, is_active, is_available, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
        `).run(comboId, branchId, cmb.name, cmb.code, cmb.desc, cmb.price, nowIso, nowIso)

        for (const it of cmb.items) {
          const pId = productMap[it.prod]
          if (pId) {
            db.prepare('INSERT INTO combo_items (id, combo_id, product_id, quantity) VALUES (?, ?, ?, ?)')
              .run(uuid(), comboId, pId, it.qty)
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // 10. INVENTORY UNITS & ITEMS
    // -------------------------------------------------------------------------
    const units = [
      { name: 'Kilograms', abbr: 'kg' },
      { name: 'Grams', abbr: 'g' },
      { name: 'Liters', abbr: 'L' },
      { name: 'Pieces', abbr: 'pcs' },
      { name: 'Standard Pack', abbr: 'pk' },
    ]

    const unitMap = {}
    for (const u of units) {
      let exist = db.prepare('SELECT id FROM inventory_units WHERE abbreviation = ?').get(u.abbr)
      if (!exist) {
        const id = uuid()
        db.prepare('INSERT INTO inventory_units (id, name, abbreviation) VALUES (?, ?, ?)').run(id, u.name, u.abbr)
        unitMap[u.abbr] = id
      } else {
        unitMap[u.abbr] = exist.id
      }
    }

    // Suppliers first so inventory items can reference them
    const supplierDefs = [
      {
        company: 'Metro Prime Meat Wholesale',
        contact: 'Arthur Pendelton',
        phone: '+1 555-4301',
        email: 'orders@metroprimemeats.com',
        address: '88 Industrial Way, Sector 4',
      },
      {
        company: 'Sunrise Dairy & Cheese Co.',
        contact: 'Elena Rostova',
        phone: '+1 555-4302',
        email: 'sales@sunrisedairy.com',
        address: '14 Dairy Meadows Blvd',
      },
      {
        company: 'Golden Crust Artisan Bakery',
        contact: 'Marco Rossi',
        phone: '+1 555-4303',
        email: 'delivery@goldencrust.com',
        address: '32 Baker Street, Downtown',
      },
      {
        company: 'Valley Fresh Produce & Greens',
        contact: 'Sarah Chen',
        phone: '+1 555-4304',
        email: 'fresh@valleygreens.com',
        address: '7 Green Valley Lane',
      },
    ]

    const supplierMap = {}
    for (const s of supplierDefs) {
      let exist = db.prepare('SELECT id FROM suppliers WHERE company_name = ?').get(s.company)
      if (!exist) {
        const id = uuid()
        db.prepare(`
          INSERT INTO suppliers (id, branch_id, company_name, contact_name, phone, email, address, is_active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        `).run(id, branchId, s.company, s.contact, s.phone, s.email, s.address, nowIso)
        supplierMap[s.company] = id
      } else {
        supplierMap[s.company] = exist.id
      }
    }

    const inventoryDefs = [
      { name: 'Beef Patty 150g', sku: 'ING-PTY', unit: 'pcs', stock: 120, min: 25, cost: 180, cat: 'Meat & Poultry', sup: 'Metro Prime Meat Wholesale' },
      { name: 'Brioche Burger Buns', sku: 'ING-BUN', unit: 'pcs', stock: 150, min: 30, cost: 60, cat: 'Bakery', sup: 'Golden Crust Artisan Bakery' },
      { name: 'Cheddar Cheese Slices', sku: 'ING-CHD', unit: 'pcs', stock: 200, min: 40, cost: 45, cat: 'Dairy', sup: 'Sunrise Dairy & Cheese Co.' },
      { name: 'Russet Potato Fries Cut', sku: 'ING-FRS', unit: 'kg', stock: 45.0, min: 10.0, cost: 210, cat: 'Produce', sup: 'Valley Fresh Produce & Greens' },
      { name: 'Fresh Mozzarella Block', sku: 'ING-MOZ', unit: 'kg', stock: 28.5, min: 8.0, cost: 650, cat: 'Dairy', sup: 'Sunrise Dairy & Cheese Co.' },
      { name: 'Pizza Flour Type 00', sku: 'ING-FLR', unit: 'kg', stock: 80.0, min: 20.0, cost: 120, cat: 'Dry Goods', sup: 'Golden Crust Artisan Bakery' },
      { name: 'Marinara Pizza Sauce', sku: 'ING-SAU', unit: 'L', stock: 35.0, min: 10.0, cost: 300, cat: 'Sauces', sup: 'Valley Fresh Produce & Greens' },
      { name: 'Premium Pepperoni Slices', sku: 'ING-PEP', unit: 'kg', stock: 18.0, min: 5.0, cost: 950, cat: 'Meat & Poultry', sup: 'Metro Prime Meat Wholesale' },
      { name: 'Chicken Breast Fillet', sku: 'ING-CHK', unit: 'kg', stock: 32.0, min: 8.0, cost: 520, cat: 'Meat & Poultry', sup: 'Metro Prime Meat Wholesale' },
      { name: 'Vegetable Cooking Oil Can', sku: 'ING-OIL', unit: 'L', stock: 60.0, min: 15.0, cost: 280, cat: 'Dry Goods', sup: 'Valley Fresh Produce & Greens' },
      { name: 'Fountain Cola Syrup 5L', sku: 'ING-COL', unit: 'L', stock: 25.0, min: 5.0, cost: 400, cat: 'Beverages', sup: 'Valley Fresh Produce & Greens' },
      { name: 'Fresh Mint & Meyer Lemons', sku: 'ING-LEM', unit: 'kg', stock: 12.0, min: 3.0, cost: 350, cat: 'Produce', sup: 'Valley Fresh Produce & Greens' },
    ]

    const itemMap = {}
    for (const it of inventoryDefs) {
      let exist = db.prepare('SELECT id FROM inventory_items WHERE branch_id = ? AND name = ?').get(branchId, it.name)
      if (!exist) {
        const id = uuid()
        db.prepare(`
          INSERT INTO inventory_items (
            id, branch_id, name, sku, unit_id, current_stock, minimum_level,
            cost_per_unit_cents, category, reorder_level, supplier_id, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
          id,
          branchId,
          it.name,
          it.sku,
          unitMap[it.unit],
          it.stock,
          it.min,
          it.cost,
          it.cat,
          it.min,
          supplierMap[it.sup],
          nowIso,
          nowIso
        )
        itemMap[it.name] = id
      } else {
        itemMap[it.name] = exist.id
      }
    }

    // -------------------------------------------------------------------------
    // 11. RECIPES
    // -------------------------------------------------------------------------
    const burgerRecipeProd = productMap['Classic Cheeseburger']
    if (burgerRecipeProd) {
      let exist = db.prepare('SELECT id FROM recipes WHERE product_id = ?').get(burgerRecipeProd)
      if (!exist) {
        const recId = uuid()
        db.prepare('INSERT INTO recipes (id, product_id, yield_quantity, notes) VALUES (?, ?, 1.0, ?)')
          .run(recId, burgerRecipeProd, 'Standard Angus Burger Build: 1 patty, 1 bun, 1 slice cheese')

        if (itemMap['Beef Patty 150g']) {
          db.prepare('INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required, wastage_percentage) VALUES (?, ?, ?, 1.0, 0.0)')
            .run(uuid(), recId, itemMap['Beef Patty 150g'])
        }
        if (itemMap['Brioche Burger Buns']) {
          db.prepare('INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required, wastage_percentage) VALUES (?, ?, ?, 1.0, 2.0)')
            .run(uuid(), recId, itemMap['Brioche Burger Buns'])
        }
        if (itemMap['Cheddar Cheese Slices']) {
          db.prepare('INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required, wastage_percentage) VALUES (?, ?, ?, 1.0, 0.0)')
            .run(uuid(), recId, itemMap['Cheddar Cheese Slices'])
        }
      }
    }

    const pizzaRecipeProd = productMap['Pepperoni Feast Pizza']
    if (pizzaRecipeProd) {
      let exist = db.prepare('SELECT id FROM recipes WHERE product_id = ?').get(pizzaRecipeProd)
      if (!exist) {
        const recId = uuid()
        db.prepare('INSERT INTO recipes (id, product_id, yield_quantity, notes) VALUES (?, ?, 1.0, ?)')
          .run(recId, pizzaRecipeProd, 'Standard 12-inch Pepperoni Pizza')

        if (itemMap['Pizza Flour Type 00']) {
          db.prepare('INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required, wastage_percentage) VALUES (?, ?, ?, 0.25, 5.0)')
            .run(uuid(), recId, itemMap['Pizza Flour Type 00'])
        }
        if (itemMap['Fresh Mozzarella Block']) {
          db.prepare('INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required, wastage_percentage) VALUES (?, ?, ?, 0.15, 2.0)')
            .run(uuid(), recId, itemMap['Fresh Mozzarella Block'])
        }
        if (itemMap['Marinara Pizza Sauce']) {
          db.prepare('INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required, wastage_percentage) VALUES (?, ?, ?, 0.10, 3.0)')
            .run(uuid(), recId, itemMap['Marinara Pizza Sauce'])
        }
        if (itemMap['Premium Pepperoni Slices']) {
          db.prepare('INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required, wastage_percentage) VALUES (?, ?, ?, 0.08, 0.0)')
            .run(uuid(), recId, itemMap['Premium Pepperoni Slices'])
        }
      }
    }

    // -------------------------------------------------------------------------
    // 12. PURCHASE ORDERS & VENDOR PAYMENTS
    // -------------------------------------------------------------------------
    const existingPoCount = db.prepare('SELECT COUNT(*) as count FROM purchase_orders').get().count
    if (existingPoCount === 0) {
      const poList = [
        {
          poNumber: 'PO-2026-001',
          supplier: 'Metro Prime Meat Wholesale',
          status: 'RECEIVED',
          total: 51600, // $516.00
          notes: 'Fresh refrigerated shipment received in full.',
          createdAt: daysAgo(5, 9, 30),
          receivedAt: daysAgo(5, 14, 0),
          items: [
            { item: 'Beef Patty 150g', qty: 200, cost: 180, total: 36000 },
            { item: 'Chicken Breast Fillet', qty: 30, cost: 520, total: 15600 },
          ],
          payment: { amount: 51600, method: 'BANK_TRANSFER', ref: 'WIRE-9921', date: daysAgo(5, 15, 30) },
        },
        {
          poNumber: 'PO-2026-002',
          supplier: 'Sunrise Dairy & Cheese Co.',
          status: 'RECEIVED',
          total: 30750, // $307.50
          notes: 'Cheeses and dairy delivery verified and stored in walk-in cooler.',
          createdAt: daysAgo(3, 10, 15),
          receivedAt: daysAgo(3, 13, 0),
          items: [
            { item: 'Fresh Mozzarella Block', qty: 30, cost: 650, total: 19500 },
            { item: 'Cheddar Cheese Slices', qty: 250, cost: 45, total: 11250 },
          ],
          payment: { amount: 30750, method: 'BANK_TRANSFER', ref: 'WIRE-9934', date: daysAgo(3, 14, 0) },
        },
        {
          poNumber: 'PO-2026-003',
          supplier: 'Golden Crust Artisan Bakery',
          status: 'ORDERED',
          total: 18000, // $180.00
          notes: 'Standing weekly bun and flour replenishment for the upcoming weekend peak.',
          createdAt: daysAgo(1, 11, 0),
          receivedAt: null,
          items: [
            { item: 'Brioche Burger Buns', qty: 300, cost: 60, total: 18000 },
          ],
          payment: null,
        },
        {
          poNumber: 'PO-2026-004',
          supplier: 'Valley Fresh Produce & Greens',
          status: 'DRAFT',
          total: 14000, // $140.00
          notes: 'Draft estimate for next Monday delivery.',
          createdAt: nowIso,
          receivedAt: null,
          items: [
            { item: 'Russet Potato Fries Cut', qty: 40, cost: 210, total: 8400 },
            { item: 'Fresh Mint & Meyer Lemons', qty: 16, cost: 350, total: 5600 },
          ],
          payment: null,
        },
      ]

      for (const po of poList) {
        const poId = uuid()
        const supId = supplierMap[po.supplier]
        if (!supId) continue

        db.prepare(`
          INSERT INTO purchase_orders (id, branch_id, supplier_id, po_number, status, total_cents, notes, created_at, received_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(poId, branchId, supId, po.poNumber, po.status, po.total, po.notes, po.createdAt, po.receivedAt)

        for (const it of po.items) {
          const itemId = itemMap[it.item]
          if (itemId) {
            db.prepare(`
              INSERT INTO purchase_order_items (id, po_id, inventory_item_id, quantity, unit_cost_cents, total_cents)
              VALUES (?, ?, ?, ?, ?, ?)
            `).run(uuid(), poId, itemId, it.qty, it.cost, it.total)
          }
        }

        if (po.payment) {
          db.prepare(`
            INSERT INTO vendor_payments (id, branch_id, supplier_id, po_id, amount_cents, payment_method, reference_number, notes, payment_date, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Vendor invoice settlement', ?, ?)
          `).run(uuid(), branchId, supId, poId, po.payment.amount, po.payment.method, po.payment.ref, po.payment.date, po.payment.date)
        }
      }
    }

    // -------------------------------------------------------------------------
    // 13. EXPENSES
    // -------------------------------------------------------------------------
    const existingExpCount = db.prepare('SELECT COUNT(*) as count FROM expenses').get().count
    if (existingExpCount === 0) {
      const expCatRows = db.prepare('SELECT id, code FROM expense_categories').all()
      const catLookup = {}
      for (const ec of expCatRows) {
        catLookup[ec.code] = ec.id
      }

      const sampleExpenses = [
        { code: 'RENT', amount: 280000, payee: 'Metropolis Plaza Commercial Properties', method: 'BANK_TRANSFER', desc: 'Monthly store lease for Main Flagship Branch', date: daysAgo(15) },
        { code: 'UTILITIES', amount: 48550, payee: 'Metropolis City Power & Energy', method: 'BANK_TRANSFER', desc: 'Commercial three-phase electricity & refrigeration power', date: daysAgo(10) },
        { code: 'UTILITIES', amount: 12000, payee: 'Metropolis Water Service', method: 'BANK_TRANSFER', desc: 'Monthly municipal water & drainage utility bill', date: daysAgo(8) },
        { code: 'MAINTENANCE', amount: 25000, payee: 'Sparkle Clean Commercial Services', method: 'CASH', desc: 'Deep kitchen exhaust hood degreasing & equipment sanitation', date: daysAgo(6) },
        { code: 'PACKAGING', amount: 34000, payee: 'EcoPack Paper & Cartons Ltd', method: 'CARD', desc: 'Takeaway burger boxes, recyclable craft bags and pizza liners', date: daysAgo(4) },
        { code: 'MARKETING', amount: 15000, payee: 'Meta Ads Global', method: 'CARD', desc: 'Weekend local area food delivery campaign ads', date: daysAgo(2) },
        { code: 'TRANSPORT', amount: 11500, payee: 'Downtown Moto Tech', method: 'CASH', desc: 'Routine brake service and oil changes on delivery bikes', date: daysAgo(1) },
        { code: 'MISC', amount: 4500, payee: 'Office Stationery Depot', method: 'CASH', desc: 'Thermal receipt paper rolls (box of 50) and permanent food labels', date: daysAgo(0, 9, 30) },
      ]

      const adminUserId = userMap.admin || userMap.manager

      for (const ex of sampleExpenses) {
        const catId = catLookup[ex.code] || catLookup['MISC'] || expCatRows[0]?.id
        if (catId) {
          db.prepare(`
            INSERT INTO expenses (id, branch_id, category_id, amount_cents, payment_method, payee, description, recorded_by_user_id, expense_date, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(uuid(), branchId, catId, ex.amount, ex.method, ex.payee, ex.desc, adminUserId, ex.date.slice(0, 10), ex.date)
        }
      }
    }

    // -------------------------------------------------------------------------
    // 14. CUSTOMERS & LOYALTY LEDGER
    // -------------------------------------------------------------------------
    const customerDefs = [
      { name: 'Alexander Vance', phone: '+1 555-7711', email: 'alex.vance@gmail.com', tag: 'VIP', points: 450, spent: 42000, orders: 18, addr: '742 Evergreen Terrace, Apt 4B' },
      { name: 'Sophia Montgomery', phone: '+1 555-7722', email: 'sophia.m@outlook.com', tag: 'VIP', points: 780, spent: 68000, orders: 26, addr: '120 Skyline Drive, Penthouse 2' },
      { name: 'Daniel Kim', phone: '+1 555-7733', email: 'daniel.kim@techcorp.io', tag: 'CORPORATE', points: 1250, spent: 145000, orders: 14, addr: '500 Innovation Way, Suite 800' },
      { name: 'Emma Watson', phone: '+1 555-7744', email: 'emma.watson@yahoo.com', tag: 'REGULAR', points: 180, spent: 14500, orders: 7, addr: '104 University Ave, Flat 3' },
      { name: 'Liam Gallagher', phone: '+1 555-7755', email: 'liam.g@musiclive.net', tag: 'REGULAR', points: 95, spent: 8850, orders: 4, addr: '45 Sunset Boulevard' },
      { name: 'Olivia Martinez', phone: '+1 555-7766', email: 'olivia.martinez@creative.co', tag: 'REGULAR', points: 220, spent: 19800, orders: 9, addr: '89 Maple Road' },
      { name: 'Noah Sterling', phone: '+1 555-7777', email: 'noah.sterling@fintech.com', tag: 'REGULAR', points: 60, spent: 4200, orders: 2, addr: '210 Riverbend Crescent' },
      { name: 'TechCorp Catering', phone: '+1 555-7788', email: 'catering@techcorp.io', tag: 'CORPORATE', points: 3100, spent: 289000, orders: 32, addr: '500 Innovation Way, 1st Floor Cafe' },
    ]

    const customerMap = {}
    for (const c of customerDefs) {
      let exist = db.prepare('SELECT id FROM customers WHERE branch_id = ? AND phone = ?').get(branchId, c.phone)
      if (!exist) {
        const id = uuid()
        db.prepare(`
          INSERT INTO customers (
            id, branch_id, name, phone, email, address, loyalty_points, total_spent_cents,
            order_count, tag, credit_balance_cents, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
        `).run(id, branchId, c.name, c.phone, c.email, c.addr, c.points, c.spent, c.orders, c.tag, nowIso, nowIso)
        customerMap[c.name] = id

        // Add sample loyalty transaction
        db.prepare(`
          INSERT INTO loyalty_transactions (id, customer_id, branch_id, points_changed, transaction_type, balance_after, notes, created_at)
          VALUES (?, ?, ?, ?, 'EARN', ?, 'Welcome & recurring order loyalty points accrual', ?)
        `).run(uuid(), id, branchId, c.points, c.points, nowIso)
      } else {
        customerMap[c.name] = exist.id
      }
    }

    // -------------------------------------------------------------------------
    // 15. PROMOTIONAL COUPONS
    // -------------------------------------------------------------------------
    const couponDefs = [
      { code: 'WELCOME10', title: '10% Welcome Discount', type: 'PERCENTAGE', val: 10, min: 1500, max: 500 },
      { code: 'LUNCH5', title: '$5 Off Lunch Saver', type: 'FIXED_AMOUNT', val: 500, min: 2500, max: null },
      { code: 'VIP20', title: '20% VIP Feast Special', type: 'PERCENTAGE', val: 20, min: 5000, max: 2000 },
      { code: 'FREESHIP', title: '$3 Off Delivery Fee', type: 'FIXED_AMOUNT', val: 300, min: 2000, max: null },
    ]

    for (const cp of couponDefs) {
      let exist = db.prepare('SELECT id FROM coupons WHERE code = ?').get(cp.code)
      if (!exist) {
        db.prepare(`
          INSERT INTO coupons (
            id, branch_id, code, title, discount_type, discount_value, min_order_cents,
            max_discount_cents, usage_limit, times_used, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 500, 3, 1, ?, ?)
        `).run(uuid(), branchId, cp.code, cp.title, cp.type, cp.val, cp.min, cp.max, nowIso, nowIso)
      }
    }

    // -------------------------------------------------------------------------
    // 16. TABLE RESERVATIONS
    // -------------------------------------------------------------------------
    const existingResCount = db.prepare('SELECT COUNT(*) as count FROM reservations').get().count
    if (existingResCount === 0) {
      const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10)
      const reservationDefs = [
        {
          name: 'Sophia Montgomery',
          phone: '+1 555-7722',
          customer: 'Sophia Montgomery',
          table: 'T-03',
          date: todayStr,
          time: '13:00',
          party: 4,
          status: 'CONFIRMED',
          deposit: 2000,
          notes: 'Window booth preferred for business luncheon.',
        },
        {
          name: 'Daniel Kim',
          phone: '+1 555-7733',
          customer: 'Daniel Kim',
          table: 'T-05',
          date: todayStr,
          time: '19:30',
          party: 8,
          status: 'CONFIRMED',
          deposit: 5000,
          notes: 'Team celebration dinner. Requested prompt drink service.',
        },
        {
          name: 'Alexander Vance',
          phone: '+1 555-7711',
          customer: 'Alexander Vance',
          table: 'R-01',
          date: todayStr,
          time: '20:00',
          party: 2,
          status: 'SEATED',
          deposit: 0,
          notes: 'Romantic anniversary dinner on the rooftop terrace.',
        },
        {
          name: 'Olivia Martinez',
          phone: '+1 555-7766',
          customer: 'Olivia Martinez',
          table: 'R-03',
          date: tomorrow,
          time: '18:30',
          party: 6,
          status: 'PENDING',
          deposit: 1500,
          notes: 'Outdoor garden seating requested.',
        },
      ]

      for (const res of reservationDefs) {
        const tblId = tableMap[res.table]
        const cId = customerMap[res.customer]
        if (tblId) {
          db.prepare(`
            INSERT INTO reservations (
              id, branch_id, table_id, customer_id, customer_name, customer_phone,
              party_size, reservation_date, reservation_time, duration_minutes,
              deposit_cents, deposit_payment_method, status, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 90, ?, 'CASH', ?, ?, ?, ?)
          `).run(
            uuid(),
            branchId,
            tblId,
            cId,
            res.name,
            res.phone,
            res.party,
            res.date,
            res.time,
            res.deposit,
            res.status,
            res.notes,
            nowIso,
            nowIso
          )
        }
      }
    }

    // -------------------------------------------------------------------------
    // 17. STAFF SHIFTS, EMPLOYEES & ATTENDANCE
    // -------------------------------------------------------------------------
    const shiftDefs = [
      { name: 'Morning Shift', start: '08:00', end: '16:00' },
      { name: 'Evening Shift', start: '16:00', end: '00:00' },
      { name: 'Night Shift', start: '00:00', end: '08:00' },
    ]

    const shiftMap = {}
    for (const sh of shiftDefs) {
      let exist = db.prepare('SELECT id FROM staff_shifts WHERE branch_id = ? AND name = ?').get(branchId, sh.name)
      if (!exist) {
        const id = uuid()
        db.prepare('INSERT INTO staff_shifts (id, branch_id, name, start_time, end_time, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
          .run(id, branchId, sh.name, sh.start, sh.end, nowIso, nowIso)
        shiftMap[sh.name] = id
      } else {
        shiftMap[sh.name] = exist.id
      }
    }

    const employeeDefs = [
      { user: 'admin', code: 'EMP-101', first: 'John', last: 'Admin', desig: 'General Manager', salary: 350000, type: 'MONTHLY' },
      { user: 'manager', code: 'EMP-102', first: 'Rachel', last: 'Manager', desig: 'Operations Floor Manager', salary: 280000, type: 'MONTHLY' },
      { user: 'cashier', code: 'EMP-103', first: 'Sam', last: 'Cashier', desig: 'Senior Front Cashier', salary: 1800, type: 'HOURLY' },
      { user: 'waiter', code: 'EMP-104', first: 'David', last: 'Waiter', desig: 'Head Floor Waiter', salary: 1500, type: 'HOURLY' },
      { user: 'chef', code: 'EMP-105', first: 'Gordon', last: 'Chef', desig: 'Head Line Chef', salary: 260000, type: 'MONTHLY' },
    ]

    const empMap = {}
    for (const emp of employeeDefs) {
      const uId = userMap[emp.user]
      let exist = db.prepare('SELECT id FROM employees WHERE branch_id = ? AND employee_code = ?').get(branchId, emp.code)
      if (!exist) {
        const id = uuid()
        db.prepare(`
          INSERT INTO employees (
            id, branch_id, user_id, employee_code, first_name, last_name, email,
            phone, designation, role_id, salary_type, base_rate_cents, hire_date,
            status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2025-01-15', 'ACTIVE', ?, ?)
        `).run(
          id,
          branchId,
          uId,
          emp.code,
          emp.first,
          emp.last,
          `${emp.user}@gourmetbistro.com`,
          `+1 555-01${emp.code.slice(-2)}`,
          emp.desig,
          uId ? db.prepare('SELECT role_id FROM users WHERE id = ?').get(uId)?.role_id : null,
          emp.type,
          emp.salary,
          nowIso,
          nowIso
        )
        empMap[emp.user] = id
      } else {
        empMap[emp.user] = exist.id
      }
    }

    // Attendance records
    const existingAttCount = db.prepare('SELECT COUNT(*) as count FROM staff_attendance').get().count
    if (existingAttCount === 0) {
      const morningShiftId = shiftMap['Morning Shift']
      // Today clock-ins
      for (const u of ['manager', 'cashier', 'waiter', 'chef']) {
        const empId = empMap[u]
        if (empId) {
          db.prepare(`
            INSERT INTO staff_attendance (
              id, branch_id, employee_id, shift_id, clock_in, clock_out, break_minutes,
              total_work_minutes, status, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, NULL, 0, 0, 'PRESENT', 'On duty for morning shift', ?, ?)
          `).run(uuid(), branchId, empId, morningShiftId, `${todayStr}T08:00:00.000Z`, nowIso, nowIso)
        }
      }

      // Yesterday completed records
      const yesterdayStr = daysAgo(1).slice(0, 10)
      for (const u of ['cashier', 'waiter', 'chef']) {
        const empId = empMap[u]
        if (empId) {
          db.prepare(`
            INSERT INTO staff_attendance (
              id, branch_id, employee_id, shift_id, clock_in, clock_out, break_minutes,
              total_work_minutes, status, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 45, 435, 'PRESENT', 'Full shift completed', ?, ?)
          `).run(
            uuid(),
            branchId,
            empId,
            morningShiftId,
            `${yesterdayStr}T08:00:00.000Z`,
            `${yesterdayStr}T16:00:00.000Z`,
            daysAgo(1),
            daysAgo(1)
          )
        }
      }
    }

    // -------------------------------------------------------------------------
    // 18. CASH DRAWER SHIFT SESSIONS
    // -------------------------------------------------------------------------
    const activeSession = db.prepare("SELECT id FROM cash_sessions WHERE branch_id = ? AND status = 'OPEN'").get(branchId)
    const cashierUserId = userMap.cashier || userMap.admin

    if (!activeSession) {
      // 1. Open live active session for today so cashier can immediately place orders
      const openSessionId = uuid()
      const openTime = `${todayStr}T08:00:00.000Z`
      db.prepare(`
        INSERT INTO cash_sessions (
          id, branch_id, user_id, opened_at, opening_balance_cents,
          expected_cash_cents, status, notes
        ) VALUES (?, ?, ?, ?, 10000, 10000, 'OPEN', 'Morning operational cashier float')
      `).run(openSessionId, branchId, cashierUserId, openTime)

      // Add float cash-in movement
      db.prepare(`
        INSERT INTO cash_movements (id, session_id, movement_type, amount_cents, reason, created_at)
        VALUES (?, ?, 'CASH_IN', 10000, 'Starting cash drawer float from safe', ?)
      `).run(uuid(), openSessionId, openTime)

      // 2. Insert yesterday's fully balanced CLOSED session with Z-Report history
      const closedSessionId = uuid()
      const yOpened = daysAgo(1, 8, 0)
      const yClosed = daysAgo(1, 23, 30)
      db.prepare(`
        INSERT INTO cash_sessions (
          id, branch_id, user_id, opened_at, closed_at, opening_balance_cents,
          expected_cash_cents, counted_cash_cents, variance_cents, status, notes,
          total_cash_sales_cents, total_card_sales_cents, total_bank_sales_cents,
          total_online_sales_cents, total_refunds_cents, total_cash_in_cents, total_cash_out_cents,
          closing_notes, manager_approval_user_id
        ) VALUES (
          ?, ?, ?, ?, ?, 10000,
          74500, 74500, 0, 'CLOSED', 'Shift reconciled cleanly with zero cash variance.',
          64500, 89000, 0,
          0, 0, 10000, 0,
          'Physical cash counted, matched exactly with POS tender log.', ?
        )
      `).run(closedSessionId, branchId, cashierUserId, yOpened, yClosed, userMap.manager || userMap.admin)

      // Denominations for closed session: total = 74500 ($745.00)
      const closedDenoms = [
        { cents: 5000, count: 8, total: 40000 }, // $400
        { cents: 2000, count: 12, total: 24000 }, // $240
        { cents: 1000, count: 7, total: 7000 },  // $70
        { cents: 500, count: 5, total: 2500 },   // $25
        { cents: 100, count: 10, total: 1000 },  // $10
      ]
      for (const d of closedDenoms) {
        db.prepare('INSERT INTO cash_drawer_denominations (id, session_id, denomination_cents, count, total_cents) VALUES (?, ?, ?, ?, ?)')
          .run(uuid(), closedSessionId, d.cents, d.count, d.total)
      }
    }

    // -------------------------------------------------------------------------
    // 19. DELIVERY ZONES & RIDERS FLEET
    // -------------------------------------------------------------------------
    const zoneDefs = [
      { name: 'Zone A - Downtown Commercial Hub', charge: 300, min: 1500, mins: 25, desc: 'Downtown commercial core and high-rise apartments within 3 km' },
      { name: 'Zone B - West Suburbs & Campus', charge: 500, min: 2000, mins: 40, desc: 'University campus and residential neighborhoods within 7 km' },
      { name: 'Zone C - Outer Hills & Waterfront', charge: 800, min: 3000, mins: 55, desc: 'Extended delivery perimeter up to 14 km' },
    ]

    const zoneMap = {}
    for (const z of zoneDefs) {
      let exist = db.prepare('SELECT id FROM delivery_zones WHERE branch_id = ? AND name = ?').get(branchId, z.name)
      if (!exist) {
        const id = uuid()
        db.prepare(`
          INSERT INTO delivery_zones (id, branch_id, name, delivery_charge_cents, min_order_cents, estimated_minutes, description, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(id, branchId, z.name, z.charge, z.min, z.mins, z.desc, nowIso, nowIso)
        zoneMap[z.name] = id
      } else {
        zoneMap[z.name] = exist.id
      }
    }

    const riderDefs = [
      { name: 'Marco Silva', phone: '+1 555-8011', vehicle: 'MOTORCYCLE', plate: 'MTR-4491', status: 'AVAILABLE' },
      { name: 'Lucas Bennett', phone: '+1 555-8012', vehicle: 'SCOOTER', plate: 'SCT-2208', status: 'OUT_FOR_DELIVERY' },
      { name: 'Derrick Vance', phone: '+1 555-8013', vehicle: 'BICYCLE', plate: 'BIKE-03', status: 'AVAILABLE' },
      { name: 'Carlos Ramos', phone: '+1 555-8014', vehicle: 'MOTORCYCLE', plate: 'MTR-7712', status: 'AVAILABLE' },
    ]

    const riderMap = {}
    for (const r of riderDefs) {
      let exist = db.prepare('SELECT id FROM riders WHERE branch_id = ? AND name = ?').get(branchId, r.name)
      if (!exist) {
        const id = uuid()
        db.prepare(`
          INSERT INTO riders (id, branch_id, name, phone, vehicle_type, license_plate, status, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(id, branchId, r.name, r.phone, r.vehicle, r.plate, r.status, nowIso, nowIso)
        riderMap[r.name] = id
      } else {
        riderMap[r.name] = exist.id
      }
    }

    // -------------------------------------------------------------------------
    // 20. ORDERS, KDS TICKETS, DELIVERIES & REPORTING DATA
    // -------------------------------------------------------------------------
    const existingOrdersCount = db.prepare('SELECT COUNT(*) as count FROM orders').get().count

    // We add rich live orders if count is low or if missing active KDS / delivery orders
    const activeKdsCount = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status IN ('CONFIRMED', 'PREPARING', 'READY')").get().count

    if (activeKdsCount === 0) {
      // ORDER 1: Active DINE-IN at Table T-01 -> Status PREPARING (Shows on KDS!)
      const o1Id = uuid()
      const t1Id = tableMap['T-01']
      const c1Id = customerMap['Alexander Vance']
      const o1Num = `ORD-${Date.now().toString().slice(-4)}01`

      db.prepare(`
        INSERT INTO orders (
          id, branch_id, order_number, order_type, order_source, status, table_id,
          customer_id, cashier_id, subtotal_cents, tax_cents, total_cents, paid_cents,
          kitchen_accepted_at, target_prep_minutes, created_at, updated_at
        ) VALUES (?, ?, ?, 'DINE_IN', 'POS', 'PREPARING', ?, ?, ?, 2497, 206, 2703, 0, ?, 15, ?, ?)
      `).run(o1Id, branchId, o1Num, t1Id, c1Id, cashierUserId, nowIso, nowIso, nowIso)

      // Occupy Table T-01
      if (t1Id) {
        db.prepare("UPDATE dining_tables SET status = 'OCCUPIED', current_order_id = ? WHERE id = ?").run(o1Id, t1Id)
      }

      // Items for Order 1
      const burgerProdId = productMap['Classic Cheeseburger']
      const friesProdId = productMap['Golden Crinkle Cut Fries']
      const colaProdId = productMap['Craft Cola Float']

      if (burgerProdId) {
        db.prepare(`
          INSERT INTO order_items (id, order_id, product_id, item_name, quantity, unit_price_cents, total_cents, kitchen_status, kitchen_station_id, started_cooking_at)
          VALUES (?, ?, ?, 'Classic Cheeseburger', 2, 899, 1798, 'PREPARING', ?, ?)
        `).run(uuid(), o1Id, burgerProdId, stationMap['GRILL'], nowIso)
      }
      if (friesProdId) {
        db.prepare(`
          INSERT INTO order_items (id, order_id, product_id, item_name, quantity, unit_price_cents, total_cents, kitchen_status, kitchen_station_id, started_cooking_at)
          VALUES (?, ?, ?, 'Golden Crinkle Cut Fries', 1, 399, 399, 'PREPARING', ?, ?)
        `).run(uuid(), o1Id, friesProdId, stationMap['FRYER'], nowIso)
      }
      if (colaProdId) {
        db.prepare(`
          INSERT INTO order_items (id, order_id, product_id, item_name, quantity, unit_price_cents, total_cents, kitchen_status, kitchen_station_id)
          VALUES (?, ?, ?, 'Craft Cola Float', 1, 349, 349, 'READY', ?)
        `).run(uuid(), o1Id, colaProdId, stationMap['BAR'])
      }

      // ORDER 2: Active DINE-IN at Table R-02 -> Status READY (Shows on KDS Ready Column!)
      const o2Id = uuid()
      const t2Id = tableMap['R-02']
      const o2Num = `ORD-${Date.now().toString().slice(-4)}02`

      db.prepare(`
        INSERT INTO orders (
          id, branch_id, order_number, order_type, order_source, status, table_id,
          cashier_id, subtotal_cents, tax_cents, total_cents, paid_cents,
          kitchen_accepted_at, kitchen_ready_at, target_prep_minutes, created_at, updated_at
        ) VALUES (?, ?, ?, 'DINE_IN', 'POS', 'READY', ?, ?, 1998, 165, 2163, 2163, ?, ?, 15, ?, ?)
      `).run(o2Id, branchId, o2Num, t2Id, cashierUserId, daysAgo(0, now.getHours(), now.getMinutes() - 18), nowIso, daysAgo(0, now.getHours(), now.getMinutes() - 20), nowIso)

      if (t2Id) {
        db.prepare("UPDATE dining_tables SET status = 'OCCUPIED', current_order_id = ? WHERE id = ?").run(o2Id, t2Id)
      }

      const pizzaProdId = productMap['Pepperoni Feast Pizza']
      const mozProdId = productMap['Crispy Mozzarella Sticks (6 pcs)']

      if (pizzaProdId) {
        db.prepare(`
          INSERT INTO order_items (id, order_id, product_id, item_name, quantity, unit_price_cents, total_cents, kitchen_status, kitchen_station_id, completed_cooking_at)
          VALUES (?, ?, ?, 'Pepperoni Feast Pizza', 1, 1399, 1399, 'READY', ?, ?)
        `).run(uuid(), o2Id, pizzaProdId, stationMap['PIZZA'], nowIso)
      }
      if (mozProdId) {
        db.prepare(`
          INSERT INTO order_items (id, order_id, product_id, item_name, quantity, unit_price_cents, total_cents, kitchen_status, kitchen_station_id, completed_cooking_at)
          VALUES (?, ?, ?, 'Crispy Mozzarella Sticks (6 pcs)', 1, 599, 599, 'READY', ?, ?)
        `).run(uuid(), o2Id, mozProdId, stationMap['FRYER'], nowIso)
      }

      // Payment for Order 2
      db.prepare(`
        INSERT INTO payments (id, branch_id, order_id, cashier_id, payment_method, amount_cents, status, created_at)
        VALUES (?, ?, ?, ?, 'CARD', 2163, 'COMPLETED', ?)
      `).run(uuid(), branchId, o2Id, cashierUserId, nowIso)
    }

    // ORDER 3 & 4: Active DELIVERIES on Live Dispatch Board
    const activeDelivCount = db.prepare("SELECT COUNT(*) as count FROM deliveries WHERE status IN ('PENDING', 'ASSIGNED', 'OUT_FOR_DELIVERY')").get().count

    if (activeDelivCount === 0) {
      const zoneAId = zoneMap['Zone A - Downtown Commercial Hub']
      const zoneBId = zoneMap['Zone B - West Suburbs & Campus']
      const riderLucas = riderMap['Lucas Bennett']

      // Delivery 1: OUT_FOR_DELIVERY with Rider Lucas Bennett
      const o3Id = uuid()
      const o3Num = `ORD-${Date.now().toString().slice(-4)}03`
      db.prepare(`
        INSERT INTO orders (
          id, branch_id, order_number, order_type, order_source, status,
          cashier_id, subtotal_cents, delivery_charge_cents, total_cents, paid_cents,
          created_at, updated_at
        ) VALUES (?, ?, ?, 'DELIVERY', 'POS', 'CONFIRMED', ?, 2647, 300, 2947, 0, ?, ?)
      `).run(o3Id, branchId, o3Num, cashierUserId, daysAgo(0, now.getHours(), now.getMinutes() - 25), nowIso)

      const d1Id = uuid()
      db.prepare(`
        INSERT INTO deliveries (
          id, order_id, branch_id, zone_id, rider_id, customer_name, customer_phone,
          delivery_address, delivery_instructions, status, dispatched_at, cod_amount_cents,
          cod_collected_cents, cod_settled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'Alexander Vance', '+1 555-7711', '742 Evergreen Terrace, Apt 4B', 'Gate code #4490, leave at reception if not answering', 'OUT_FOR_DELIVERY', ?, 2947, 0, 0, ?, ?)
      `).run(d1Id, o3Id, branchId, zoneAId, riderLucas, daysAgo(0, now.getHours(), now.getMinutes() - 10), daysAgo(0, now.getHours(), now.getMinutes() - 25), nowIso)

      // Delivery 2: PENDING rider assignment
      const o4Id = uuid()
      const o4Num = `ORD-${Date.now().toString().slice(-4)}04`
      db.prepare(`
        INSERT INTO orders (
          id, branch_id, order_number, order_type, order_source, status,
          cashier_id, subtotal_cents, delivery_charge_cents, total_cents, paid_cents,
          created_at, updated_at
        ) VALUES (?, ?, ?, 'DELIVERY', 'POS', 'CONFIRMED', ?, 3297, 500, 3797, 3797, ?, ?)
      `).run(o4Id, branchId, o4Num, cashierUserId, daysAgo(0, now.getHours(), now.getMinutes() - 8), nowIso)

      const d2Id = uuid()
      db.prepare(`
        INSERT INTO deliveries (
          id, order_id, branch_id, zone_id, rider_id, customer_name, customer_phone,
          delivery_address, delivery_instructions, status, cod_amount_cents, cod_collected_cents,
          cod_settled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, 'Emma Watson', '+1 555-7744', '104 University Ave, Flat 3', 'Call upon arrival at front gate', 'PENDING', 0, 0, 0, ?, ?)
      `).run(d2Id, o4Id, branchId, zoneBId, daysAgo(0, now.getHours(), now.getMinutes() - 8), nowIso)

      // Payment for Order 4 (Paid Online)
      db.prepare(`
        INSERT INTO payments (id, branch_id, order_id, cashier_id, payment_method, amount_cents, status, created_at)
        VALUES (?, ?, ?, ?, 'ONLINE', 3797, 'COMPLETED', ?)
      `).run(uuid(), branchId, o4Id, cashierUserId, daysAgo(0, now.getHours(), now.getMinutes() - 8))
    }

    // Historical Orders for Rich Reports (if less than 10 orders exist)
    const totalOrderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get().count
    if (totalOrderCount < 8) {
      console.log('[Dummy Data] Inserting historical completed orders for analytics & reporting...')
      const historicalDays = [1, 2, 3, 4, 5, 6]
      const orderTypes = ['DINE_IN', 'TAKEAWAY', 'DELIVERY']
      const payMethods = ['CASH', 'CARD', 'ONLINE']

      let hIndex = 10
      for (const day of historicalDays) {
        for (let slot = 1; slot <= 2; slot++) {
          const ordId = uuid()
          const ordNum = `ORD-H${day}0${slot}-${hIndex++}`
          const ordType = orderTypes[(day + slot) % 3]
          const payMethod = payMethods[(day + slot) % 3]
          const hour = slot === 1 ? 13 : 20 // Lunch or Dinner
          const orderTime = daysAgo(day, hour, 15 + slot * 10)

          const subtotal = 2500 + (day * 350) + (slot * 400)
          const tax = Math.round(subtotal * 0.0825)
          const total = subtotal + tax

          db.prepare(`
            INSERT INTO orders (
              id, branch_id, order_number, order_type, order_source, status,
              cashier_id, subtotal_cents, tax_cents, total_cents, paid_cents,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'POS', 'COMPLETED', ?, ?, ?, ?, ?, ?, ?)
          `).run(ordId, branchId, ordNum, ordType, cashierUserId, subtotal, tax, total, total, orderTime, orderTime)

          // Add random items
          if (productMap['Classic Cheeseburger']) {
            db.prepare(`
              INSERT INTO order_items (id, order_id, product_id, item_name, quantity, unit_price_cents, total_cents, kitchen_status)
              VALUES (?, ?, ?, 'Classic Cheeseburger', 1, 899, 899, 'SERVED')
            `).run(uuid(), ordId, productMap['Classic Cheeseburger'])
          }
          if (productMap['Golden Crinkle Cut Fries']) {
            db.prepare(`
              INSERT INTO order_items (id, order_id, product_id, item_name, quantity, unit_price_cents, total_cents, kitchen_status)
              VALUES (?, ?, ?, 'Golden Crinkle Cut Fries', 1, 399, 399, 'SERVED')
            `).run(uuid(), ordId, productMap['Golden Crinkle Cut Fries'])
          }

          // Payment
          db.prepare(`
            INSERT INTO payments (id, branch_id, order_id, cashier_id, payment_method, amount_cents, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED', ?)
          `).run(uuid(), branchId, ordId, cashierUserId, payMethod, total, orderTime)
        }
      }
    }

    console.log('[Dummy Data Seeder] Completed transaction successfully.')
  })

  seedTransaction()

  // Display summary of live rows
  console.log('\n====================================================')
  console.log('LIVE DATABASE SUMMARY AFTER SEEDING')
  console.log('====================================================')
  const tables = [
    'branches',
    'users',
    'floors',
    'dining_tables',
    'kitchen_stations',
    'categories',
    'products',
    'product_variations',
    'modifier_groups',
    'modifiers',
    'combos',
    'combo_items',
    'inventory_units',
    'inventory_items',
    'recipes',
    'suppliers',
    'purchase_orders',
    'purchase_order_items',
    'vendor_payments',
    'expense_categories',
    'expenses',
    'customers',
    'loyalty_transactions',
    'coupons',
    'reservations',
    'staff_shifts',
    'employees',
    'staff_attendance',
    'cash_sessions',
    'delivery_zones',
    'riders',
    'orders',
    'order_items',
    'payments',
    'deliveries',
  ]

  for (const t of tables) {
    try {
      const row = db.prepare(`SELECT count(*) as count FROM ${t}`).get()
      console.log(`${t.padEnd(25)} : ${row.count} rows`)
    } catch (e) {
      console.log(`${t.padEnd(25)} : [ERROR: ${e.message}]`)
    }
  }

  closeDatabase()
  console.log('====================================================')
  console.log('All dummy data successfully committed to SQLite!')
  console.log('====================================================')
}

// Run immediately if called directly
populateAllDummyData()
