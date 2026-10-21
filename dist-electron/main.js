import { ipcMain as u, app as ie, BrowserWindow as et, shell as dt } from "electron";
import { fileURLToPath as Et } from "node:url";
import H from "node:path";
import _t from "better-sqlite3";
import V from "node:fs";
import v from "node:crypto";
import ut from "node:os";
const q = {
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
}, lt = {
  version: 1,
  name: "initial_core_schema",
  up: (t) => {
    t.exec(`
      -- 1. Branches & Organization
      CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        phone TEXT,
        email TEXT,
        address TEXT,
        city TEXT,
        currency_code TEXT DEFAULT 'USD',
        currency_symbol TEXT DEFAULT '$',
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- 2. Roles & Permissions (RBAC)
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        is_system INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS permissions (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        module TEXT NOT NULL,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      );

      -- 3. Users & Sessions
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        branch_id TEXT REFERENCES branches(id),
        role_id TEXT NOT NULL REFERENCES roles(id),
        username TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        pin_hash TEXT,
        password_hash TEXT,
        is_active INTEGER DEFAULT 1,
        last_login_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- 4. Floor & Dining Tables
      CREATE TABLE IF NOT EXISTS floors (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        display_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dining_tables (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        floor_id TEXT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
        table_number TEXT NOT NULL,
        capacity INTEGER DEFAULT 4,
        status TEXT DEFAULT 'AVAILABLE', -- AVAILABLE, OCCUPIED, RESERVED, CLEANING
        current_order_id TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- 5. Product Categories & Products
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        branch_id TEXT REFERENCES branches(id),
        name TEXT NOT NULL,
        code TEXT,
        display_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        branch_id TEXT REFERENCES branches(id),
        category_id TEXT NOT NULL REFERENCES categories(id),
        name TEXT NOT NULL,
        sku TEXT,
        barcode TEXT,
        description TEXT,
        base_price_cents INTEGER NOT NULL,
        cost_price_cents INTEGER DEFAULT 0,
        tax_percentage REAL DEFAULT 0.0,
        preparation_time_minutes INTEGER DEFAULT 15,
        is_available INTEGER DEFAULT 1,
        has_variations INTEGER DEFAULT 0,
        track_inventory INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS product_variations (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        name TEXT NOT NULL, -- Small, Medium, Large
        sku TEXT,
        price_cents INTEGER NOT NULL,
        cost_cents INTEGER DEFAULT 0,
        is_default INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS modifier_groups (
        id TEXT PRIMARY KEY,
        product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        is_required INTEGER DEFAULT 0,
        min_selection INTEGER DEFAULT 0,
        max_selection INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS modifiers (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        price_cents INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1
      );

      -- 6. Customers & Loyalty
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        branch_id TEXT REFERENCES branches(id),
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        address TEXT,
        loyalty_points INTEGER DEFAULT 0,
        total_spent_cents INTEGER DEFAULT 0,
        order_count INTEGER DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- 7. Orders & Order Items
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        order_number TEXT NOT NULL,
        order_type TEXT NOT NULL, -- DINE_IN, TAKEAWAY, DELIVERY
        order_source TEXT DEFAULT 'POS', -- POS, QR, KIOSK
        status TEXT NOT NULL, -- DRAFT, CONFIRMED, PREPARING, READY, SERVED, COMPLETED, CANCELLED, REFUNDED
        table_id TEXT REFERENCES dining_tables(id),
        customer_id TEXT REFERENCES customers(id),
        cashier_id TEXT REFERENCES users(id),
        subtotal_cents INTEGER NOT NULL,
        discount_cents INTEGER DEFAULT 0,
        discount_reason TEXT,
        tax_cents INTEGER DEFAULT 0,
        service_charge_cents INTEGER DEFAULT 0,
        delivery_charge_cents INTEGER DEFAULT 0,
        total_cents INTEGER NOT NULL,
        paid_cents INTEGER DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES products(id),
        variation_id TEXT REFERENCES product_variations(id),
        item_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price_cents INTEGER NOT NULL,
        discount_cents INTEGER DEFAULT 0,
        total_cents INTEGER NOT NULL,
        kitchen_status TEXT DEFAULT 'PENDING', -- PENDING, PREPARING, READY, SERVED
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS order_item_modifiers (
        id TEXT PRIMARY KEY,
        order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
        modifier_id TEXT REFERENCES modifiers(id),
        name TEXT NOT NULL,
        price_cents INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS order_status_history (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        from_status TEXT,
        to_status TEXT NOT NULL,
        changed_by_user_id TEXT REFERENCES users(id),
        notes TEXT,
        created_at TEXT NOT NULL
      );

      -- 8. Payments & Cash Drawer
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        order_id TEXT NOT NULL REFERENCES orders(id),
        cashier_id TEXT NOT NULL REFERENCES users(id),
        payment_method TEXT NOT NULL, -- CASH, CARD, BANK_TRANSFER, ONLINE
        amount_cents INTEGER NOT NULL,
        tendered_cents INTEGER DEFAULT 0,
        change_cents INTEGER DEFAULT 0,
        reference_number TEXT,
        status TEXT DEFAULT 'COMPLETED',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cash_sessions (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        opened_at TEXT NOT NULL,
        closed_at TEXT,
        opening_balance_cents INTEGER NOT NULL,
        expected_cash_cents INTEGER DEFAULT 0,
        counted_cash_cents INTEGER,
        variance_cents INTEGER,
        status TEXT DEFAULT 'OPEN', -- OPEN, CLOSED
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS cash_movements (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
        movement_type TEXT NOT NULL, -- CASH_IN, CASH_OUT
        amount_cents INTEGER NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      -- 9. Inventory, Recipes & Stock Ledger
      CREATE TABLE IF NOT EXISTS inventory_units (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        abbreviation TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_items (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        name TEXT NOT NULL,
        sku TEXT,
        unit_id TEXT NOT NULL REFERENCES inventory_units(id),
        current_stock REAL DEFAULT 0.0,
        minimum_level REAL DEFAULT 5.0,
        cost_per_unit_cents INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recipes (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        variation_id TEXT REFERENCES product_variations(id) ON DELETE CASCADE,
        yield_quantity REAL DEFAULT 1.0,
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS recipe_ingredients (
        id TEXT PRIMARY KEY,
        recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
        quantity_required REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
        movement_type TEXT NOT NULL, -- PURCHASE, SALE_DEDUCTION, ADJUSTMENT, WASTAGE, RETURN
        quantity REAL NOT NULL,
        previous_stock REAL NOT NULL,
        new_stock REAL NOT NULL,
        unit_cost_cents INTEGER,
        reference_type TEXT, -- ORDER, PO, MANUAL
        reference_id TEXT,
        reason TEXT,
        user_id TEXT REFERENCES users(id),
        created_at TEXT NOT NULL
      );

      -- 10. Suppliers & Purchases
      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        branch_id TEXT REFERENCES branches(id),
        company_name TEXT NOT NULL,
        contact_name TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS purchase_orders (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        supplier_id TEXT NOT NULL REFERENCES suppliers(id),
        po_number TEXT NOT NULL,
        status TEXT DEFAULT 'ORDERED', -- ORDERED, RECEIVED, PARTIAL, CANCELLED
        total_cents INTEGER NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        received_at TEXT
      );

      -- 11. Expenses
      CREATE TABLE IF NOT EXISTS expense_categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        category_id TEXT NOT NULL REFERENCES expense_categories(id),
        amount_cents INTEGER NOT NULL,
        payment_method TEXT DEFAULT 'CASH',
        payee TEXT,
        description TEXT,
        recorded_by_user_id TEXT REFERENCES users(id),
        expense_date TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      -- 12. Reservations
      CREATE TABLE IF NOT EXISTS reservations (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        table_id TEXT REFERENCES dining_tables(id),
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        party_size INTEGER NOT NULL,
        reservation_time TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING', -- PENDING, CONFIRMED, SEATED, CANCELLED, NO_SHOW
        notes TEXT,
        created_at TEXT NOT NULL
      );

      -- 13. System Settings & Audit Logs
      CREATE TABLE IF NOT EXISTS system_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL,
        category TEXT DEFAULT 'GENERAL',
        description TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        branch_id TEXT,
        user_id TEXT REFERENCES users(id),
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        details_json TEXT,
        created_at TEXT NOT NULL
      );

      -- 14. Future Supabase Synchronization Outbox (Durable Offline Queue)
      CREATE TABLE IF NOT EXISTS sync_outbox (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL, -- INSERT, UPDATE, DELETE
        payload_json TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING', -- PENDING, SYNCED, FAILED
        retry_count INTEGER DEFAULT 0,
        error_message TEXT,
        created_at TEXT NOT NULL,
        synced_at TEXT
      );

      -- Indexes for performance & reporting
      CREATE INDEX IF NOT EXISTS idx_orders_branch_status ON orders(branch_id, status);
      CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
      CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(inventory_item_id);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(status);
    `);
  }
}, pt = {
  version: 2,
  name: "combos_and_deals_schema",
  up: (t) => {
    t.exec(`
      CREATE TABLE IF NOT EXISTS combos (
        id TEXT PRIMARY KEY,
        branch_id TEXT REFERENCES branches(id),
        name TEXT NOT NULL,
        code TEXT,
        description TEXT,
        price_cents INTEGER NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS combo_items (
        id TEXT PRIMARY KEY,
        combo_id TEXT NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        quantity INTEGER DEFAULT 1
      );

      CREATE INDEX IF NOT EXISTS idx_combos_branch ON combos(branch_id);
      CREATE INDEX IF NOT EXISTS idx_combo_items_combo ON combo_items(combo_id);
    `);
  }
}, Tt = {
  version: 3,
  name: "catalog_enhancements_schema",
  up: (t) => {
    try {
      t.exec("ALTER TABLE categories ADD COLUMN parent_id TEXT;");
    } catch {
    }
    try {
      t.exec("ALTER TABLE categories ADD COLUMN is_visible_pos INTEGER DEFAULT 1;");
    } catch {
    }
    try {
      t.exec("ALTER TABLE categories ADD COLUMN is_visible_online INTEGER DEFAULT 1;");
    } catch {
    }
    try {
      t.exec("ALTER TABLE products ADD COLUMN is_featured INTEGER DEFAULT 0;");
    } catch {
    }
    try {
      t.exec("ALTER TABLE products ADD COLUMN is_discount_eligible INTEGER DEFAULT 1;");
    } catch {
    }
    try {
      t.exec("ALTER TABLE products ADD COLUMN min_order_qty INTEGER DEFAULT 1;");
    } catch {
    }
    try {
      t.exec("ALTER TABLE products ADD COLUMN max_order_qty INTEGER DEFAULT 99;");
    } catch {
    }
    try {
      t.exec("ALTER TABLE products ADD COLUMN price_dine_in_cents INTEGER DEFAULT NULL;");
    } catch {
    }
    try {
      t.exec("ALTER TABLE products ADD COLUMN price_takeaway_cents INTEGER DEFAULT NULL;");
    } catch {
    }
    try {
      t.exec("ALTER TABLE products ADD COLUMN price_delivery_cents INTEGER DEFAULT NULL;");
    } catch {
    }
    try {
      t.exec("ALTER TABLE combos ADD COLUMN is_available INTEGER DEFAULT 1;");
    } catch {
    }
    try {
      t.exec("ALTER TABLE combos ADD COLUMN available_from TEXT DEFAULT NULL;");
    } catch {
    }
    try {
      t.exec("ALTER TABLE combos ADD COLUMN available_to TEXT DEFAULT NULL;");
    } catch {
    }
  }
}, mt = {
  version: 4,
  name: "kitchen_stations_schema",
  up: (t) => {
    t.exec(`
      CREATE TABLE IF NOT EXISTS kitchen_stations (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        color_code TEXT DEFAULT '#f97316',
        display_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );
    `);
    try {
      t.exec("ALTER TABLE products ADD COLUMN kitchen_station_id TEXT REFERENCES kitchen_stations(id);");
    } catch {
    }
    try {
      t.exec("ALTER TABLE order_items ADD COLUMN kitchen_station_id TEXT REFERENCES kitchen_stations(id);");
    } catch {
    }
    try {
      t.exec("ALTER TABLE order_items ADD COLUMN started_cooking_at TEXT;");
    } catch {
    }
    try {
      t.exec("ALTER TABLE order_items ADD COLUMN completed_cooking_at TEXT;");
    } catch {
    }
    try {
      t.exec("ALTER TABLE orders ADD COLUMN kitchen_accepted_at TEXT;");
    } catch {
    }
    try {
      t.exec("ALTER TABLE orders ADD COLUMN kitchen_ready_at TEXT;");
    } catch {
    }
    try {
      t.exec("ALTER TABLE orders ADD COLUMN kitchen_completed_at TEXT;");
    } catch {
    }
    try {
      t.exec("ALTER TABLE orders ADD COLUMN target_prep_minutes INTEGER DEFAULT 15;");
    } catch {
    }
    const e = t.prepare("SELECT id FROM branches LIMIT 1").get();
    if (e && t.prepare("SELECT COUNT(*) as count FROM kitchen_stations WHERE branch_id = ?").get(e.id).count === 0) {
      const n = (/* @__PURE__ */ new Date()).toISOString(), s = t.prepare(`
          INSERT INTO kitchen_stations (id, branch_id, name, code, color_code, display_order, is_active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        `);
      s.run("station-grill", e.id, "Grill & Fryer", "GRILL", "#ef4444", 1, n), s.run("station-pizza", e.id, "Pizza & Oven", "PIZZA", "#f59e0b", 2, n), s.run("station-bar", e.id, "Bar & Beverages", "DRINKS", "#06b6d4", 3, n), s.run("station-expo", e.id, "Packaging & Expo", "EXPO", "#10b981", 4, n);
    }
  }
}, Rt = {
  version: 5,
  name: "inventory_recipe_purchases_schema",
  up: (t) => {
    try {
      t.exec("ALTER TABLE inventory_items ADD COLUMN category TEXT DEFAULT 'General';");
    } catch {
    }
    try {
      t.exec("ALTER TABLE inventory_items ADD COLUMN reorder_level REAL DEFAULT 10.0;");
    } catch {
    }
    try {
      t.exec("ALTER TABLE inventory_items ADD COLUMN supplier_id TEXT REFERENCES suppliers(id);");
    } catch {
    }
    try {
      t.exec("ALTER TABLE recipe_ingredients ADD COLUMN wastage_percentage REAL DEFAULT 0.0;");
    } catch {
    }
    if (t.exec(`
      CREATE TABLE IF NOT EXISTS purchase_order_items (
        id TEXT PRIMARY KEY,
        po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
        quantity REAL NOT NULL,
        unit_cost_cents INTEGER NOT NULL,
        total_cents INTEGER NOT NULL
      );
    `), t.exec(`
      CREATE TABLE IF NOT EXISTS vendor_payments (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        supplier_id TEXT NOT NULL REFERENCES suppliers(id),
        po_id TEXT REFERENCES purchase_orders(id),
        amount_cents INTEGER NOT NULL,
        payment_method TEXT DEFAULT 'BANK_TRANSFER',
        reference_number TEXT,
        notes TEXT,
        payment_date TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `), t.prepare("SELECT COUNT(*) as count FROM expense_categories").get().count === 0) {
      const r = t.prepare("INSERT INTO expense_categories (id, name, code) VALUES (?, ?, ?)");
      r.run("exp-rent", "Rent & Property", "RENT"), r.run("exp-util", "Utilities (Electricity, Water, Gas)", "UTILITIES"), r.run("exp-salary", "Staff Salaries & Wages", "SALARY"), r.run("exp-maint", "Repairs & Maintenance", "MAINTENANCE"), r.run("exp-mkt", "Marketing & Social Media Ads", "MARKETING"), r.run("exp-trans", "Delivery & Fuel / Transport", "TRANSPORT"), r.run("exp-pack", "Packaging & Disposables", "PACKAGING"), r.run("exp-misc", "Miscellaneous Operational Expenses", "MISC");
    }
  }
};
function Je() {
  return v.randomUUID();
}
const Nt = {
  version: 6,
  name: "shifts_staff_attendance_schema",
  up: (t) => {
    const e = [
      "total_cash_sales_cents INTEGER DEFAULT 0",
      "total_card_sales_cents INTEGER DEFAULT 0",
      "total_bank_sales_cents INTEGER DEFAULT 0",
      "total_online_sales_cents INTEGER DEFAULT 0",
      "total_refunds_cents INTEGER DEFAULT 0",
      "total_cash_in_cents INTEGER DEFAULT 0",
      "total_cash_out_cents INTEGER DEFAULT 0",
      "closing_notes TEXT",
      "manager_approval_user_id TEXT REFERENCES users(id)"
    ];
    for (const i of e)
      try {
        t.exec(`ALTER TABLE cash_sessions ADD COLUMN ${i};`);
      } catch {
      }
    t.exec(`
      CREATE TABLE IF NOT EXISTS cash_drawer_denominations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
        denomination_cents INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        total_cents INTEGER NOT NULL DEFAULT 0
      );
    `), t.exec(`
      CREATE TABLE IF NOT EXISTS staff_shifts (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        name TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `), t.exec(`
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        user_id TEXT REFERENCES users(id),
        employee_code TEXT UNIQUE NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        designation TEXT NOT NULL,
        role_id TEXT REFERENCES roles(id),
        salary_type TEXT DEFAULT 'MONTHLY',
        base_rate_cents INTEGER DEFAULT 0,
        hire_date TEXT NOT NULL,
        status TEXT DEFAULT 'ACTIVE',
        emergency_contact TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `), t.exec(`
      CREATE TABLE IF NOT EXISTS staff_attendance (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        shift_id TEXT REFERENCES staff_shifts(id),
        clock_in TEXT NOT NULL,
        clock_out TEXT,
        break_minutes INTEGER DEFAULT 0,
        total_work_minutes INTEGER DEFAULT 0,
        status TEXT DEFAULT 'PRESENT',
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    const r = (/* @__PURE__ */ new Date()).toISOString(), n = t.prepare("SELECT id FROM branches LIMIT 1").get(), s = n == null ? void 0 : n.id;
    if (s) {
      if (t.prepare("SELECT COUNT(*) as count FROM staff_shifts").get().count === 0) {
        const o = [
          { name: "Morning Shift", start: "08:00", end: "16:00" },
          { name: "Evening Shift", start: "16:00", end: "00:00" },
          { name: "Night Shift", start: "00:00", end: "08:00" }
        ], c = t.prepare(`
          INSERT INTO staff_shifts (id, branch_id, name, start_time, end_time, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        `);
        for (const d of o)
          c.run(Je(), s, d.name, d.start, d.end, r, r);
      }
      if (t.prepare("SELECT COUNT(*) as count FROM employees").get().count === 0) {
        const o = t.prepare("SELECT id, username, display_name, role_id FROM users").all(), c = t.prepare(`
          INSERT INTO employees (
            id, branch_id, user_id, employee_code, first_name, last_name,
            email, phone, designation, role_id, salary_type, base_rate_cents,
            hire_date, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        `);
        let d = 101;
        for (const _ of o) {
          const p = _.display_name.split(" "), l = p[0] || _.username, T = p.slice(1).join(" ") || "Staff", R = _.username.includes("admin") ? "General Manager" : _.username.includes("manager") ? "Floor Manager" : _.username.includes("cashier") ? "Senior Cashier" : _.username.includes("waiter") ? "Head Waiter" : _.username.includes("chef") ? "Head Chef" : "Staff Member";
          c.run(
            Je(),
            s,
            _.id,
            `EMP-${d++}`,
            l,
            T,
            `${_.username}@restaurant.local`,
            "+1 555-01" + d,
            R,
            _.role_id,
            "MONTHLY",
            25e4,
            // $2,500/mo base
            "2026-01-01",
            r,
            r
          );
        }
      }
    }
  }
};
function Lt() {
  return v.randomUUID();
}
const St = {
  version: 7,
  name: "crm_loyalty_reservations_schema",
  up: (t) => {
    var s;
    const e = [
      "tag TEXT DEFAULT 'REGULAR'",
      "credit_balance_cents INTEGER DEFAULT 0",
      "birth_date TEXT",
      "is_active INTEGER DEFAULT 1"
    ];
    for (const i of e)
      try {
        t.exec(`ALTER TABLE customers ADD COLUMN ${i};`);
      } catch {
      }
    t.exec(`
      CREATE TABLE IF NOT EXISTS loyalty_transactions (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        order_id TEXT REFERENCES orders(id),
        points_changed INTEGER NOT NULL,
        transaction_type TEXT NOT NULL, -- EARN, REDEEM, ADJUSTMENT, BONUS
        balance_after INTEGER NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL
      );
    `);
    const r = [
      "customer_id TEXT REFERENCES customers(id)",
      "reservation_date TEXT",
      "duration_minutes INTEGER DEFAULT 90",
      "deposit_cents INTEGER DEFAULT 0",
      "deposit_payment_method TEXT",
      "updated_at TEXT"
    ];
    for (const i of r)
      try {
        t.exec(`ALTER TABLE reservations ADD COLUMN ${i};`);
      } catch {
      }
    t.exec(`
      CREATE TABLE IF NOT EXISTS coupons (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        code TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        discount_type TEXT NOT NULL, -- PERCENTAGE, FIXED_AMOUNT
        discount_value INTEGER NOT NULL,
        min_order_cents INTEGER DEFAULT 0,
        max_discount_cents INTEGER,
        start_date TEXT,
        end_date TEXT,
        usage_limit INTEGER DEFAULT 0,
        times_used INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    const n = t.prepare("SELECT id FROM branches LIMIT 1").get();
    if (n != null && n.id) {
      const i = (/* @__PURE__ */ new Date()).toISOString();
      if ((((s = t.prepare("SELECT COUNT(*) as count FROM coupons").get()) == null ? void 0 : s.count) || 0) === 0) {
        const o = [
          {
            code: "WELCOME10",
            title: "10% Welcome Discount",
            type: "PERCENTAGE",
            val: 10,
            min: 1500,
            // min $15.00
            max: 500
            // max $5.00 off
          },
          {
            code: "LUNCH5",
            title: "$5 Off Lunch Saver",
            type: "FIXED_AMOUNT",
            val: 500,
            // $5.00
            min: 2500,
            // min $25.00
            max: null
          },
          {
            code: "VIP20",
            title: "20% VIP Feast Special",
            type: "PERCENTAGE",
            val: 20,
            min: 5e3,
            // min $50.00
            max: 2e3
            // max $20.00 off
          }
        ], c = t.prepare(`
          INSERT INTO coupons (
            id, branch_id, code, title, discount_type, discount_value,
            min_order_cents, max_discount_cents, start_date, end_date,
            usage_limit, times_used, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, ?, ?)
        `);
        for (const d of o)
          c.run(
            Lt(),
            n.id,
            d.code,
            d.title,
            d.type,
            d.val,
            d.min,
            d.max,
            "2026-01-01",
            "2026-12-31",
            i,
            i
          );
      }
    }
  }
}, Ot = {
  version: 8,
  name: "delivery_dispatch_riders_schema",
  up: (t) => {
    t.exec(`
      CREATE TABLE IF NOT EXISTS delivery_zones (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        name TEXT NOT NULL,
        delivery_charge_cents INTEGER NOT NULL DEFAULT 300,
        min_order_cents INTEGER NOT NULL DEFAULT 1500,
        estimated_minutes INTEGER NOT NULL DEFAULT 35,
        description TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `), t.exec(`
      CREATE TABLE IF NOT EXISTS riders (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        employee_id TEXT REFERENCES employees(id),
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        vehicle_type TEXT NOT NULL DEFAULT 'MOTORCYCLE', -- MOTORCYCLE, BICYCLE, CAR, SCOOTER
        license_plate TEXT,
        status TEXT NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE, ASSIGNED, OUT_FOR_DELIVERY, OFFLINE
        current_delivery_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `), t.exec(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        zone_id TEXT REFERENCES delivery_zones(id),
        rider_id TEXT REFERENCES riders(id),
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        delivery_address TEXT NOT NULL,
        delivery_instructions TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, ASSIGNED, OUT_FOR_DELIVERY, DELIVERED, FAILED, CANCELLED
        dispatched_at TEXT,
        delivered_at TEXT,
        failed_reason TEXT,
        cod_amount_cents INTEGER NOT NULL DEFAULT 0,
        cod_collected_cents INTEGER NOT NULL DEFAULT 0,
        cod_settled INTEGER NOT NULL DEFAULT 0, -- 0 = pending remittance, 1 = settled
        settlement_id TEXT REFERENCES rider_settlements(id),
        settled_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `), t.exec(`
      CREATE TABLE IF NOT EXISTS rider_settlements (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        rider_id TEXT NOT NULL REFERENCES riders(id),
        settled_by_user_id TEXT NOT NULL REFERENCES users(id),
        total_collected_cents INTEGER NOT NULL,
        orders_count INTEGER NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL
      );
    `);
  }
}, ht = [
  lt,
  pt,
  Tt,
  mt,
  Rt,
  Nt,
  St,
  Ot
];
function It(t) {
  t.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  const e = t.prepare("SELECT version FROM schema_migrations ORDER BY version ASC").all(), r = new Set(e.map((i) => i.version));
  let n = 0, s = e.length > 0 ? e[e.length - 1].version : 0;
  for (const i of ht)
    r.has(i.version) || (console.log(`[Database Migration] Applying v${i.version}: ${i.name}...`), t.transaction(() => {
      i.up(t), t.prepare(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"
      ).run(i.version, i.name, (/* @__PURE__ */ new Date()).toISOString());
    })(), n++, s = i.version, console.log(`[Database Migration] Successfully applied v${i.version}: ${i.name}`));
  return {
    appliedCount: n,
    currentVersion: s
  };
}
let w = null;
function ae(t) {
  if (!t) return null;
  const e = v.randomBytes(16).toString("hex"), r = v.scryptSync(t, e, 64);
  return `${e}:${r.toString("hex")}`;
}
function Ke(t, e) {
  if (!t || !e || !e.includes(":")) return !1;
  try {
    const [r, n] = e.split(":"), s = Buffer.from(n, "hex"), i = v.scryptSync(t, r, 64);
    return s.length !== i.length ? !1 : v.timingSafeEqual(s, i);
  } catch {
    return !1;
  }
}
const O = {
  /**
   * Get active user session
   */
  getCurrentSession: () => w,
  /**
   * Clear active user session (Logout)
   */
  logout: () => {
    if (w) {
      const t = E(), e = (/* @__PURE__ */ new Date()).toISOString();
      t.prepare(`
        INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
        VALUES (?, ?, ?, 'LOGOUT', 'USER', ?, ?, ?)
      `).run(v.randomUUID(), w.branchId, w.id, w.id, JSON.stringify({ username: w.username }), e);
    }
    return w = null, { success: !0 };
  },
  /**
   * Authenticate user via username and password
   */
  loginWithPassword: (t, e) => {
    const r = E();
    (/* @__PURE__ */ new Date()).toISOString();
    const n = r.prepare(`
      SELECT u.id, u.branch_id, u.role_id, u.username, u.display_name,
             u.password_hash, u.pin_hash, u.is_active,
             COALESCE(r.code, 'cashier') as role_code,
             COALESCE(r.name, 'Staff Member') as role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE LOWER(u.username) = LOWER(?) AND u.is_active = 1
    `).get(t);
    if (!n)
      throw Oe(null, "FAILED_LOGIN", "USER", null, { reason: "User not found", username: t }), new Error("Invalid username or credentials.");
    if (!Ke(e, n.password_hash))
      throw Oe(n.branch_id, "FAILED_LOGIN", "USER", n.id, { reason: "Password mismatch", username: t }), new Error("Invalid password.");
    return ze(n, "PASSWORD");
  },
  /**
   * Quick-PIN login (fast cashier / waiter authentication)
   */
  loginWithPin: (t, e = null, r = null) => {
    const n = E();
    let s = `
      SELECT u.id, u.branch_id, u.role_id, u.username, u.display_name,
             u.password_hash, u.pin_hash, u.is_active,
             COALESCE(r.code, 'cashier') as role_code,
             COALESCE(r.name, 'Staff Member') as role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.is_active = 1
    `;
    const i = [];
    if (e || r) {
      const c = (e || "").replace(/^usr-/, "");
      s += " AND (u.id = ? OR LOWER(u.username) = LOWER(?) OR LOWER(u.username) = LOWER(?))", i.push(e || "", r || e || "", c);
    }
    let a = n.prepare(s).all(...i);
    a.length === 0 && (a = n.prepare(`
        SELECT u.id, u.branch_id, u.role_id, u.username, u.display_name,
               u.password_hash, u.pin_hash, u.is_active,
               COALESCE(r.code, 'cashier') as role_code,
               COALESCE(r.name, 'Staff Member') as role_name
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.id
        WHERE u.is_active = 1
      `).all());
    let o = null;
    for (const c of a)
      if (Ke(t, c.pin_hash)) {
        o = c;
        break;
      }
    if (!o)
      throw Oe(null, "FAILED_LOGIN", "USER", null, { reason: "Invalid PIN" }), new Error("Invalid PIN code.");
    return ze(o, "PIN");
  },
  /**
   * Get all active users with their roles (for switch user / fast PIN login UI)
   */
  getLoginUsers: () => E().prepare(`
      SELECT u.id, u.username, u.display_name as displayName,
             COALESCE(r.code, 'cashier') as role_code,
             COALESCE(r.name, 'Staff Member') as role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.is_active = 1
      ORDER BY u.display_name ASC
    `).all(),
  /**
   * Check if a specific permission is granted to current user
   */
  hasPermission: (t) => w ? w.roleCode === "super_admin" ? !0 : w.permissions.includes(t) : !1,
  /**
   * Create a new staff user with hashed credentials
   */
  createUser: ({ branchId: t, roleId: e, username: r, displayName: n, password: s, pin: i }) => {
    const a = E(), o = (/* @__PURE__ */ new Date()).toISOString(), c = v.randomUUID(), d = s ? ae(s) : null, _ = i ? ae(i) : null;
    return a.prepare(`
      INSERT INTO users (id, branch_id, role_id, username, display_name, password_hash, pin_hash, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(c, t, e, r, n, d, _, o, o), Oe(t, "CREATE_USER", "USER", c, { username: r, roleId: e }), { id: c, username: r, displayName: n };
  },
  /**
   * Set user PIN (hashed)
   */
  setUserPin: (t, e) => {
    const r = E(), n = (/* @__PURE__ */ new Date()).toISOString(), s = ae(e);
    return r.prepare("UPDATE users SET pin_hash = ?, updated_at = ? WHERE id = ?").run(s, n, t), !0;
  },
  /**
   * Set user Password (hashed)
   */
  setUserPassword: (t, e) => {
    const r = E(), n = (/* @__PURE__ */ new Date()).toISOString(), s = ae(e);
    return r.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(s, n, t), !0;
  }
};
function ze(t, e) {
  const r = E(), n = (/* @__PURE__ */ new Date()).toISOString(), s = r.prepare(`
    SELECT p.code
    FROM permissions p
    JOIN role_permissions rp ON p.id = rp.permission_id
    WHERE rp.role_id = ?
  `).all(t.role_id).map((a) => a.code);
  r.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(n, t.id);
  const i = t.branch_id ? r.prepare("SELECT id, name, code, currency_symbol FROM branches WHERE id = ?").get(t.branch_id) : r.prepare("SELECT id, name, code, currency_symbol FROM branches LIMIT 1").get();
  return w = {
    id: t.id,
    username: t.username,
    displayName: t.display_name,
    roleId: t.role_id,
    roleCode: t.role_code,
    roleName: t.role_name,
    branchId: i == null ? void 0 : i.id,
    branchName: i == null ? void 0 : i.name,
    currencySymbol: (i == null ? void 0 : i.currency_symbol) || "$",
    permissions: s,
    loginAt: n,
    method: e
  }, Oe(i == null ? void 0 : i.id, "LOGIN", "USER", t.id, { method: e, role: t.role_code }), w;
}
function Oe(t, e, r, n, s) {
  try {
    const i = E();
    let a = null;
    w != null && w.id && i.prepare("SELECT id FROM users WHERE id = ?").get(w.id) && (a = w.id), i.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      v.randomUUID(),
      t || null,
      a,
      e,
      r,
      n,
      JSON.stringify(s),
      (/* @__PURE__ */ new Date()).toISOString()
    );
  } catch (i) {
    console.error("[Audit Log] Failed to record audit:", i);
  }
}
function g() {
  return v.randomUUID();
}
function Ct(t) {
  console.log("[Database Seed] Seeding default operational data..."), t.transaction(() => {
    var b, U, C, Y, Ne, Ee, $e, qe;
    const r = t.prepare("SELECT COUNT(*) as count FROM branches").get().count;
    let n = null;
    if (r === 0) {
      n = g();
      const m = (/* @__PURE__ */ new Date()).toISOString();
      t.prepare(`
        INSERT INTO branches (id, name, code, phone, email, address, city, currency_code, currency_symbol, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        n,
        "Main Flagship Branch",
        "BR-01",
        "+1 555-0199",
        "contact@restaurantpos.local",
        "100 Gourmet Plaza, Suite 4",
        "Metropolis",
        "USD",
        "$",
        1,
        m,
        m
      );
    } else
      n = t.prepare("SELECT id FROM branches LIMIT 1").get().id;
    const s = [
      { code: "super_admin", name: "Super Administrator", desc: "Full system and branch access", is_system: 1 },
      { code: "manager", name: "Restaurant Manager", desc: "Orders, inventory, staff, discounts and reports", is_system: 1 },
      { code: "cashier", name: "Cashier", desc: "POS order entry, payments and receipts", is_system: 1 },
      { code: "waiter", name: "Waiter", desc: "Dine-in table orders and customer service", is_system: 1 },
      { code: "kitchen_staff", name: "Kitchen Staff", desc: "Kitchen display screen and order preparation", is_system: 1 },
      { code: "inventory_officer", name: "Inventory Officer", desc: "Stock movements, purchases and ingredients", is_system: 1 }
    ], i = {};
    for (const m of s) {
      let N = t.prepare("SELECT id FROM roles WHERE code = ?").get(m.code);
      if (N)
        i[m.code] = N.id;
      else {
        const I = g();
        t.prepare("INSERT INTO roles (id, code, name, description, is_system, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(I, m.code, m.name, m.desc, m.is_system, (/* @__PURE__ */ new Date()).toISOString()), i[m.code] = I;
      }
    }
    const a = [
      { code: "dashboard:view", name: "View Dashboard Metrics", module: "DASHBOARD" },
      { code: "pos:create_order", name: "Create Orders", module: "POS" },
      { code: "pos:apply_discount", name: "Apply Discount", module: "POS" },
      { code: "pos:process_refund", name: "Process Refund", module: "POS" },
      { code: "menu:manage", name: "Manage Products & Menu", module: "MENU" },
      { code: "inventory:manage", name: "Manage Inventory & Stock", module: "INVENTORY" },
      { code: "reports:view", name: "View Reports & Analytics", module: "REPORTS" },
      { code: "staff:manage", name: "Manage Staff & Roles", module: "STAFF" },
      { code: "settings:manage", name: "Manage System Settings", module: "SETTINGS" },
      { code: "kitchen:view", name: "Access Kitchen Display (KDS)", module: "KITCHEN" }
    ];
    for (const m of a) {
      let N = t.prepare("SELECT id FROM permissions WHERE code = ?").get(m.code), I = N == null ? void 0 : N.id;
      N || (I = g(), t.prepare("INSERT INTO permissions (id, code, name, module, description) VALUES (?, ?, ?, ?, ?)").run(I, m.code, m.name, m.module, m.name)), i.super_admin && I && t.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)").run(i.super_admin, I), i.manager && I && m.code !== "settings:manage" && t.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)").run(i.manager, I), i.cashier && I && ["dashboard:view", "pos:create_order"].includes(m.code) && t.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)").run(i.cashier, I), i.waiter && I && ["pos:create_order"].includes(m.code) && t.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)").run(i.waiter, I), i.kitchen_staff && I && ["kitchen:view"].includes(m.code) && t.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)").run(i.kitchen_staff, I);
    }
    const o = [
      {
        roleCode: "super_admin",
        user: "admin",
        name: "Administrator",
        pin: "1234",
        pass: "admin123"
      },
      {
        roleCode: "manager",
        user: "manager",
        name: "Sarah Manager",
        pin: "4321",
        pass: "manager123"
      },
      {
        roleCode: "cashier",
        user: "cashier1",
        name: "Alex Cashier",
        pin: "0000",
        pass: "cashier123"
      },
      {
        roleCode: "waiter",
        user: "waiter1",
        name: "Jordan Waiter",
        pin: "1111",
        pass: null
      },
      {
        roleCode: "kitchen_staff",
        user: "chef1",
        name: "Chef Gordon",
        pin: "2222",
        pass: null
      }
    ], c = (/* @__PURE__ */ new Date()).toISOString();
    for (const m of o) {
      const N = i[m.roleCode] || null, I = t.prepare("SELECT id FROM users WHERE username = ?").get(m.user);
      I ? t.prepare("UPDATE users SET branch_id = ?, role_id = ?, pin_hash = ?, password_hash = ?, is_active = 1 WHERE id = ?").run(n, N, m.pin ? ae(m.pin) : null, m.pass ? ae(m.pass) : null, I.id) : t.prepare(`
          INSERT INTO users (id, branch_id, role_id, username, display_name, password_hash, pin_hash, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
        g(),
        n,
        N,
        m.user,
        m.name,
        m.pass ? ae(m.pass) : null,
        m.pin ? ae(m.pin) : null,
        c,
        c
      );
    }
    if (t.prepare("SELECT COUNT(*) as count FROM floors").get().count === 0) {
      const m = (/* @__PURE__ */ new Date()).toISOString(), N = g(), I = g();
      t.prepare("INSERT INTO floors (id, branch_id, name, display_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(N, n, "Main Dining Hall", 1, 1, m), t.prepare("INSERT INTO floors (id, branch_id, name, display_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(I, n, "Outdoor Terrace", 2, 1, m);
      const F = [
        { floor: N, num: "T-01", cap: 2 },
        { floor: N, num: "T-02", cap: 4 },
        { floor: N, num: "T-03", cap: 4 },
        { floor: N, num: "T-04", cap: 6 },
        { floor: N, num: "T-05", cap: 8 },
        { floor: I, num: "T-06", cap: 2 },
        { floor: I, num: "T-07", cap: 4 },
        { floor: I, num: "T-08", cap: 4 }
      ];
      for (const y of F)
        t.prepare(`
          INSERT INTO dining_tables (id, branch_id, floor_id, table_number, capacity, status, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'AVAILABLE', 1, ?, ?)
        `).run(g(), n, y.floor, y.num, y.cap, m, m);
    }
    if (t.prepare("SELECT COUNT(*) as count FROM categories").get().count === 0) {
      const m = (/* @__PURE__ */ new Date()).toISOString(), N = g(), I = g(), F = g(), y = g();
      t.prepare("INSERT INTO categories (id, branch_id, name, code, display_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(N, n, "Gourmet Burgers", "CAT-BGR", 1, 1, m), t.prepare("INSERT INTO categories (id, branch_id, name, code, display_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(I, n, "Artisan Pizzas", "CAT-PIZ", 2, 1, m), t.prepare("INSERT INTO categories (id, branch_id, name, code, display_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(F, n, "Sides & Starters", "CAT-SID", 3, 1, m), t.prepare("INSERT INTO categories (id, branch_id, name, code, display_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(y, n, "Beverages & Coffee", "CAT-DRK", 4, 1, m);
      const h = [
        { cat: N, name: "Classic Angus Cheeseburger", price: 950, cost: 380, prep: 12 },
        { cat: N, name: "Crispy Smoky Chicken Burger", price: 850, cost: 320, prep: 10 },
        { cat: N, name: "Double Bacon Smashburger", price: 1199, cost: 480, prep: 14 },
        { cat: I, name: "Woodfired Margherita Pizza", price: 1250, cost: 390, prep: 15 },
        { cat: I, name: "Pepperoni Feast Pizza", price: 1499, cost: 520, prep: 16 },
        { cat: F, name: "Crispy Seasoned French Fries", price: 399, cost: 90, prep: 6 },
        { cat: F, name: "Loaded Cheesy Nachos", price: 650, cost: 180, prep: 8 },
        { cat: y, name: "Artisan Iced Caramel Latte", price: 450, cost: 110, prep: 4 },
        { cat: y, name: "Fresh Mint Lemonade", price: 350, cost: 70, prep: 3 }
      ];
      for (const J of h)
        t.prepare(`
          INSERT INTO products (id, branch_id, category_id, name, sku, base_price_cents, cost_price_cents, preparation_time_minutes, is_available, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
        `).run(g(), n, J.cat, J.name, `SKU-${Math.floor(1e3 + Math.random() * 9e3)}`, J.price, J.cost, J.prep, m, m);
    }
    if (t.prepare("SELECT COUNT(*) as count FROM customers").get().count === 0) {
      const m = [
        { name: "John Doe", phone: "+1 555-0142", email: "john.doe@example.com", address: "45 Elm Street, Apt 3B", notes: "Prefers contactless delivery" },
        { name: "Emma Watson", phone: "+1 555-0188", email: "emma.w@example.com", address: "128 Ocean Avenue, Suite 10", notes: "VIP regular customer" },
        { name: "David Miller", phone: "+1 555-0125", email: "david.m@example.com", address: "99 Maple Drive", notes: "Allergic to peanuts" }
      ];
      for (const N of m)
        t.prepare(`
          INSERT INTO customers (id, branch_id, name, phone, email, address, notes, loyalty_points, total_spent_cents, order_count, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 50, 4500, 3, ?, ?)
        `).run(g(), n, N.name, N.phone, N.email, N.address, N.notes, c, c);
    }
    try {
      if (t.prepare("SELECT COUNT(*) as count FROM kitchen_stations").get().count === 0) {
        const N = t.prepare(`
          INSERT INTO kitchen_stations (id, branch_id, name, code, color_code, display_order, is_active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        `);
        N.run("station-grill", n, "Grill & Fryer", "GRILL", "#ef4444", 1, c), N.run("station-pizza", n, "Pizza & Oven", "PIZZA", "#f59e0b", 2, c), N.run("station-bar", n, "Bar & Beverages", "DRINKS", "#06b6d4", 3, c), N.run("station-expo", n, "Packaging & Expo", "EXPO", "#10b981", 4, c);
      }
    } catch {
    }
    t.prepare("SELECT COUNT(*) as count FROM inventory_units").get().count === 0 && (t.prepare("INSERT INTO inventory_units (id, name, abbreviation) VALUES (?, ?, ?)").run(g(), "Kilogram", "kg"), t.prepare("INSERT INTO inventory_units (id, name, abbreviation) VALUES (?, ?, ?)").run(g(), "Gram", "g"), t.prepare("INSERT INTO inventory_units (id, name, abbreviation) VALUES (?, ?, ?)").run(g(), "Piece", "pc"), t.prepare("INSERT INTO inventory_units (id, name, abbreviation) VALUES (?, ?, ?)").run(g(), "Liter", "L"));
    const T = t.prepare("SELECT COUNT(*) as count FROM suppliers").get().count, R = {};
    if (T === 0) {
      const m = [
        { name: "Apex Prime Meats Ltd", contact: "Robert Jenkins", phone: "+1 555-4301", email: "orders@apexmeats.com", address: "12 Industrial Way" },
        { name: "Fresh Farms Produce", contact: "Maria Garcia", phone: "+1 555-4302", email: "sales@freshfarms.com", address: "88 Valley Road" },
        { name: "Dairy King Wholesale", contact: "Thomas Brown", phone: "+1 555-4303", email: "support@dairyking.com", address: "45 Cold Storage Blvd" },
        { name: "Metro Beverage Co", contact: "Elena Rostova", phone: "+1 555-4304", email: "orders@metrobev.com", address: "77 Port Street" }
      ];
      for (const N of m) {
        const I = g();
        R[N.name] = I, t.prepare(`
          INSERT INTO suppliers (id, branch_id, company_name, contact_name, phone, email, address, is_active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        `).run(I, n, N.name, N.contact, N.phone, N.email, N.address, c);
      }
    }
    const S = t.prepare("SELECT COUNT(*) as count FROM inventory_items").get().count, L = {};
    if (S === 0) {
      const m = (b = t.prepare("SELECT id FROM inventory_units WHERE abbreviation = 'kg' LIMIT 1").get()) == null ? void 0 : b.id, N = (U = t.prepare("SELECT id FROM inventory_units WHERE abbreviation = 'pc' LIMIT 1").get()) == null ? void 0 : U.id;
      (C = t.prepare("SELECT id FROM inventory_units WHERE abbreviation = 'L' LIMIT 1").get()) == null || C.id;
      const I = [
        { name: "Angus Beef Patties (150g)", sku: "RAW-BEEF-01", unit: N, stock: 120, min: 25, cost: 220, cat: "Meat & Poultry" },
        { name: "Artisan Brioche Burger Buns", sku: "RAW-BUN-01", unit: N, stock: 150, min: 30, cost: 45, cat: "Bakery" },
        { name: "Aged Cheddar Cheese Slices", sku: "RAW-CHED-01", unit: N, stock: 200, min: 40, cost: 35, cat: "Dairy & Cheese" },
        { name: "Fresh Pizza Dough Balls", sku: "RAW-DOUGH-01", unit: N, stock: 60, min: 15, cost: 110, cat: "Bakery" },
        { name: "Shredded Mozzarella Cheese", sku: "RAW-MOZZ-01", unit: m, stock: 25, min: 8, cost: 850, cat: "Dairy & Cheese" },
        { name: "Italian San Marzano Tomato Sauce", sku: "RAW-SAUCE-01", unit: m, stock: 30, min: 10, cost: 420, cat: "Produce" },
        { name: "Crispy Seasoning French Fries Cut", sku: "RAW-FRIES-01", unit: m, stock: 50, min: 15, cost: 180, cat: "Produce" },
        { name: "Fresh Sicilian Lemons", sku: "RAW-LEM-01", unit: m, stock: 15, min: 5, cost: 250, cat: "Produce" },
        { name: "Espresso Coffee Beans Blend", sku: "RAW-COF-01", unit: m, stock: 18, min: 6, cost: 1600, cat: "Beverages" }
      ];
      for (const h of I) {
        if (!h.unit) continue;
        const J = g();
        L[h.name] = J, t.prepare(`
          INSERT INTO inventory_items (id, branch_id, name, sku, unit_id, current_stock, minimum_level, cost_per_unit_cents, category, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(J, n, h.name, h.sku, h.unit, h.stock, h.min, h.cost, h.cat, c, c);
      }
      const F = t.prepare("SELECT id FROM products WHERE name LIKE '%Cheeseburger%' LIMIT 1").get();
      if (F && L["Angus Beef Patties (150g)"] && L["Artisan Brioche Burger Buns"]) {
        const h = g();
        t.prepare("INSERT INTO recipes (id, product_id, yield_quantity, notes) VALUES (?, ?, 1.0, ?)").run(h, F.id, "Standard Cheeseburger assembly"), t.prepare("INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required) VALUES (?, ?, ?, 1.0)").run(g(), h, L["Angus Beef Patties (150g)"]), t.prepare("INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required) VALUES (?, ?, ?, 1.0)").run(g(), h, L["Artisan Brioche Burger Buns"]), L["Aged Cheddar Cheese Slices"] && t.prepare("INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required) VALUES (?, ?, ?, 1.0)").run(g(), h, L["Aged Cheddar Cheese Slices"]);
      }
      const y = t.prepare("SELECT id FROM products WHERE name LIKE '%Margherita%' LIMIT 1").get();
      if (y && L["Fresh Pizza Dough Balls"] && L["Shredded Mozzarella Cheese"]) {
        const h = g();
        t.prepare("INSERT INTO recipes (id, product_id, yield_quantity, notes) VALUES (?, ?, 1.0, ?)").run(h, y.id, "12-inch Woodfired Margherita"), t.prepare("INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required) VALUES (?, ?, ?, 1.0)").run(g(), h, L["Fresh Pizza Dough Balls"]), t.prepare("INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required) VALUES (?, ?, ?, 0.20)").run(g(), h, L["Shredded Mozzarella Cheese"]), L["Italian San Marzano Tomato Sauce"] && t.prepare("INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required) VALUES (?, ?, ?, 0.15)").run(g(), h, L["Italian San Marzano Tomato Sauce"]);
      }
    }
    const A = [
      { key: "business_name", val: "FastBite Gourmet Grill", cat: "GENERAL" },
      { key: "tax_rate_percentage", val: "5.0", cat: "TAX" },
      { key: "service_charge_percentage", val: "0.0", cat: "TAX" },
      { key: "currency_code", val: "USD", cat: "LOCALIZATION" },
      { key: "currency_symbol", val: "$", cat: "LOCALIZATION" },
      { key: "receipt_header", val: `FastBite Gourmet Grill
100 Gourmet Plaza, Suite 4
Tel: +1 555-0199`, cat: "RECEIPT" },
      { key: "receipt_footer", val: `Thank you for dining with us!
Visit again soon.`, cat: "RECEIPT" },
      { key: "low_stock_threshold", val: "5.0", cat: "INVENTORY" }
    ];
    for (const m of A)
      t.prepare(`
        INSERT OR IGNORE INTO system_settings (setting_key, setting_value, category, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(m.key, m.val, m.cat, (/* @__PURE__ */ new Date()).toISOString());
    try {
      if ((((Y = t.prepare("SELECT COUNT(*) as count FROM staff_shifts").get()) == null ? void 0 : Y.count) || 0) === 0) {
        const I = [
          { name: "Morning Shift", start: "08:00", end: "16:00" },
          { name: "Evening Shift", start: "16:00", end: "00:00" },
          { name: "Night Shift", start: "00:00", end: "08:00" }
        ], F = t.prepare(`
          INSERT INTO staff_shifts (id, branch_id, name, start_time, end_time, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        `);
        for (const y of I)
          F.run(g(), n, y.name, y.start, y.end, c, c);
      }
      if ((((Ne = t.prepare("SELECT COUNT(*) as count FROM employees").get()) == null ? void 0 : Ne.count) || 0) === 0) {
        const I = t.prepare("SELECT id, username, display_name, role_id FROM users WHERE branch_id = ?").all(n), F = t.prepare(`
          INSERT INTO employees (
            id, branch_id, user_id, employee_code, first_name, last_name,
            email, phone, designation, role_id, salary_type, base_rate_cents,
            hire_date, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        `);
        let y = 101;
        for (const h of I) {
          const J = h.display_name.split(" "), at = J[0] || h.username, ot = J.slice(1).join(" ") || "Staff", ct = h.username.includes("admin") ? "General Manager" : h.username.includes("manager") ? "Floor Manager" : h.username.includes("cashier") ? "Senior Cashier" : h.username.includes("waiter") ? "Head Waiter" : h.username.includes("chef") ? "Head Chef" : "Staff Member";
          F.run(
            g(),
            n,
            h.id,
            `EMP-${y++}`,
            at,
            ot,
            `${h.username}@restaurant.local`,
            `+1 555-01${y}`,
            ct,
            h.role_id,
            "MONTHLY",
            25e4,
            "2026-01-01",
            c,
            c
          );
        }
      }
    } catch (m) {
      console.warn("Phase 8 staff seeds skipped:", m);
    }
    try {
      if ((((Ee = t.prepare("SELECT COUNT(*) as count FROM coupons").get()) == null ? void 0 : Ee.count) || 0) === 0) {
        const N = [
          {
            code: "WELCOME10",
            title: "10% Welcome Discount",
            type: "PERCENTAGE",
            val: 10,
            min: 1500,
            // min $15.00
            max: 500
            // max $5.00 off
          },
          {
            code: "LUNCH5",
            title: "$5 Off Lunch Saver",
            type: "FIXED_AMOUNT",
            val: 500,
            // $5.00
            min: 2500,
            // min $25.00
            max: null
          },
          {
            code: "VIP20",
            title: "20% VIP Feast Special",
            type: "PERCENTAGE",
            val: 20,
            min: 5e3,
            // min $50.00
            max: 2e3
            // max $20.00 off
          }
        ], I = t.prepare(`
          INSERT INTO coupons (
            id, branch_id, code, title, discount_type, discount_value,
            min_order_cents, max_discount_cents, start_date, end_date,
            usage_limit, times_used, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
        `), F = (/* @__PURE__ */ new Date()).toISOString();
        for (const y of N)
          I.run(
            g(),
            n,
            y.code,
            y.title,
            y.type,
            y.val,
            y.min,
            y.max,
            null,
            null,
            100,
            F,
            F
          );
      }
    } catch (m) {
      console.warn("Phase 9 coupons seeds skipped:", m);
    }
    try {
      if (((($e = t.prepare("SELECT COUNT(*) as count FROM delivery_zones").get()) == null ? void 0 : $e.count) || 0) === 0) {
        const I = [
          {
            name: "Zone A - Downtown & Financial District",
            chargeCents: 300,
            minOrderCents: 1500,
            minutes: 30,
            desc: "Central commercial hub and high-rise apartments within 4 km"
          },
          {
            name: "Zone B - West Suburbs & Uptown",
            chargeCents: 500,
            minOrderCents: 2e3,
            minutes: 45,
            desc: "Residential districts and universities within 8 km"
          },
          {
            name: "Zone C - Outer Metro & North Hills",
            chargeCents: 800,
            minOrderCents: 3e3,
            minutes: 60,
            desc: "Extended delivery perimeter up to 15 km"
          }
        ], F = t.prepare(`
          INSERT INTO delivery_zones (
            id, branch_id, name, delivery_charge_cents, min_order_cents,
            estimated_minutes, description, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `), y = (/* @__PURE__ */ new Date()).toISOString();
        for (const h of I)
          F.run(
            g(),
            n,
            h.name,
            h.chargeCents,
            h.minOrderCents,
            h.minutes,
            h.desc,
            y,
            y
          );
      }
      if ((((qe = t.prepare("SELECT COUNT(*) as count FROM riders").get()) == null ? void 0 : qe.count) || 0) === 0) {
        const I = [
          { name: "Marco Silva", phone: "+1 555-8011", vehicle: "MOTORCYCLE", plate: "MTR-4491" },
          { name: "Lucas Bennett", phone: "+1 555-8012", vehicle: "SCOOTER", plate: "SCT-2208" },
          { name: "Derrick Vance", phone: "+1 555-8013", vehicle: "BICYCLE", plate: "BIKE-03" }
        ], F = t.prepare(`
          INSERT INTO riders (
            id, branch_id, name, phone, vehicle_type, license_plate,
            status, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE', 1, ?, ?)
        `), y = (/* @__PURE__ */ new Date()).toISOString();
        for (const h of I)
          F.run(
            g(),
            n,
            h.name,
            h.phone,
            h.vehicle,
            h.plate,
            y,
            y
          );
      }
    } catch (m) {
      console.warn("Phase 10 delivery seeds skipped:", m);
    }
  })(), console.log("[Database Seed] Seeding completed successfully.");
}
let D = null, me = null;
function Ye(t) {
  var r;
  if (t) return t;
  if (process.env.DB_PATH) return process.env.DB_PATH;
  try {
    const n = require("electron"), s = n.app || ((r = n.remote) == null ? void 0 : r.app);
    if (s)
      return H.join(s.getPath("userData"), "restaurant_pos.sqlite");
  } catch {
  }
  const e = H.resolve(process.cwd(), "database_storage");
  return V.existsSync(e) || V.mkdirSync(e, { recursive: !0 }), H.join(e, "restaurant_pos.sqlite");
}
function xe(t = {}) {
  if (D && D.open)
    return D;
  me = Ye(t.dbPath);
  const e = H.dirname(me);
  V.existsSync(e) || V.mkdirSync(e, { recursive: !0 }), console.log(`[Database] Connecting to SQLite persistent store at: ${me}`), D = new _t(me, {
    verbose: process.env.DB_DEBUG ? console.log : null,
    fileMustExist: !1,
    timeout: 5e3
  }), D.pragma("foreign_keys = ON"), D.pragma("journal_mode = WAL"), D.pragma("synchronous = NORMAL"), D.pragma("busy_timeout = 5000");
  const r = It(D);
  console.log(`[Database] Migrations applied: ${r.appliedCount}, Current Version: ${r.currentVersion}`), t.seed !== !1 && r.appliedCount > 0 && Ct(D);
  try {
    const n = D.prepare("PRAGMA quick_check").get();
    (n == null ? void 0 : n.quick_check) !== "ok" && (console.warn("[Database] PRAGMA quick_check detected issues, executing REINDEX..."), D.prepare("REINDEX").run());
    const s = D.prepare("SELECT id FROM branches LIMIT 1").get();
    s && D.prepare(`
        UPDATE users 
        SET branch_id = ? 
        WHERE branch_id IS NOT NULL AND branch_id NOT IN (SELECT id FROM branches)
      `).run(s.id);
  } catch (n) {
    console.warn("[Database] Self-healing maintenance check:", n);
  }
  return D;
}
function E() {
  return !D || !D.open ? xe() : D;
}
function je() {
  D && D.open && (D.close(), D = null, console.log("[Database] Closed connection successfully."));
}
async function tt(t) {
  const e = E(), r = H.dirname(me), n = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-"), s = t || H.join(r, `restaurant_backup_${n}.sqlite`);
  await e.backup(s);
  const i = V.statSync(s);
  return {
    success: !0,
    destination: s,
    bytes: i.size,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function At(t, e = null) {
  if (!V.existsSync(t))
    throw new Error(`Backup file not found at: ${t}`);
  const r = Ye(e || me), n = H.dirname(r), s = H.join(n, `pre_restore_safety_${Date.now()}.sqlite`);
  V.existsSync(r) && await tt(s), je(), V.copyFileSync(t, r);
  const i = `${r}-wal`, a = `${r}-shm`;
  if (V.existsSync(i))
    try {
      V.unlinkSync(i);
    } catch {
    }
  if (V.existsSync(a))
    try {
      V.unlinkSync(a);
    } catch {
    }
  const c = xe({ dbPath: r, seed: !1 }).prepare("PRAGMA integrity_check").get();
  if (c.integrity_check !== "ok")
    throw je(), V.copyFileSync(s, r), xe({ seed: !1 }), new Error(`Restore failed integrity check: ${c.integrity_check}. Reverted to safety backup.`);
  return {
    success: !0,
    message: "Database restored and verified successfully.",
    preRestoreBackup: s
  };
}
const he = {
  getAll: () => {
    const e = E().prepare("SELECT setting_key, setting_value, category, description, updated_at FROM system_settings").all(), r = {};
    for (const n of e)
      r[n.setting_key] = n.setting_value;
    return r;
  },
  get: (t) => {
    const r = E().prepare("SELECT setting_value FROM system_settings WHERE setting_key = ?").get(t);
    return r ? r.setting_value : null;
  },
  set: (t, e, r = "GENERAL") => {
    const n = E(), s = (/* @__PURE__ */ new Date()).toISOString();
    return n.prepare(`
      INSERT INTO system_settings (setting_key, setting_value, category, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        category = excluded.category,
        updated_at = excluded.updated_at
    `).run(t, e, r, s), !0;
  }
};
function $() {
  return v.randomUUID();
}
function z(t, e, r, n, s) {
  try {
    const i = E(), a = O.getCurrentSession();
    let o = null;
    a != null && a.id && i.prepare("SELECT id FROM users WHERE id = ?").get(a.id) && (o = a.id), i.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      $(),
      t || (a == null ? void 0 : a.branchId) || null,
      o,
      e,
      r,
      n,
      JSON.stringify(s),
      (/* @__PURE__ */ new Date()).toISOString()
    );
  } catch (i) {
    console.error("[Audit Log Error]:", i);
  }
}
const P = {
  // ==========================================
  // CATEGORIES CRUD (Section 6.1)
  // ==========================================
  getCategories: (t) => E().prepare(`
      SELECT c.id, c.name, c.code, c.display_order, c.is_active,
             c.parent_id, c.is_visible_pos, c.is_visible_online,
             COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
      WHERE (c.branch_id = ? OR c.branch_id IS NULL) AND c.is_active = 1
      GROUP BY c.id
      ORDER BY c.display_order ASC, c.name ASC
    `).all(t),
  createCategory: ({ branchId: t, name: e, code: r, displayOrder: n = 0, parentId: s = null, isVisiblePos: i = 1, isVisibleOnline: a = 1 }) => {
    const o = E(), c = (/* @__PURE__ */ new Date()).toISOString(), d = $();
    return o.prepare(`
      INSERT INTO categories (id, branch_id, name, code, display_order, parent_id, is_visible_pos, is_visible_online, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      d,
      t || null,
      e.trim(),
      r ? r.trim() : null,
      n,
      s || null,
      i !== void 0 ? i ? 1 : 0 : 1,
      a !== void 0 ? a ? 1 : 0 : 1,
      c
    ), z(t, "CREATE_CATEGORY", "CATEGORY", d, { name: e, code: r }), { id: d, name: e, code: r, displayOrder: n, is_active: 1 };
  },
  updateCategory: (t, { name: e, code: r, displayOrder: n, parentId: s, isVisiblePos: i = 1, isVisibleOnline: a = 1, isActive: o = 1 }) => (E().prepare(`
      UPDATE categories
      SET name = ?, code = ?, display_order = ?, parent_id = ?, is_visible_pos = ?, is_visible_online = ?, is_active = ?
      WHERE id = ?
    `).run(
    e.trim(),
    r ? r.trim() : null,
    n || 0,
    s || null,
    i !== void 0 ? i ? 1 : 0 : 1,
    a !== void 0 ? a ? 1 : 0 : 1,
    o,
    t
  ), z(null, "UPDATE_CATEGORY", "CATEGORY", t, { name: e, code: r, isActive: o }), !0),
  deleteCategory: (t) => {
    const e = E(), r = e.prepare("SELECT COUNT(*) as count FROM products WHERE category_id = ? AND is_active = 1").get(t).count;
    if (r > 0)
      throw new Error(`Cannot delete category: Contains ${r} active products. Reassign or archive them first.`);
    return e.prepare("UPDATE categories SET is_active = 0 WHERE id = ?").run(t), z(null, "ARCHIVE_CATEGORY", "CATEGORY", t, {}), !0;
  },
  // ==========================================
  // PRODUCTS CRUD (Section 6.2 & 6.3)
  // ==========================================
  getProducts: (t, e = null, r = "", n = !1) => {
    const s = E();
    let i = `
      SELECT p.id, p.category_id, c.name as category_name, p.name, p.sku, p.barcode,
             p.description, p.base_price_cents, p.cost_price_cents, p.tax_percentage,
             p.preparation_time_minutes, p.is_available, p.has_variations, p.track_inventory,
             p.is_featured, p.is_discount_eligible, p.min_order_qty, p.max_order_qty,
             p.price_dine_in_cents, p.price_takeaway_cents, p.price_delivery_cents,
             p.is_active, p.created_at, p.updated_at
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE (p.branch_id = ? OR p.branch_id IS NULL)
    `;
    const a = [t];
    if (n || (i += " AND p.is_active = 1"), e && (i += " AND p.category_id = ?", a.push(e)), r && r.trim() !== "") {
      i += " AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)";
      const o = `%${r.trim()}%`;
      a.push(o, o, o);
    }
    return i += " ORDER BY c.display_order ASC, p.name ASC", s.prepare(i).all(...a);
  },
  getProductDetails: (t) => {
    const e = E(), r = e.prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `).get(t);
    if (!r) return null;
    const n = e.prepare(`
      SELECT id, name, sku, price_cents, cost_cents, is_default, is_active
      FROM product_variations
      WHERE product_id = ? AND is_active = 1
      ORDER BY price_cents ASC
    `).all(t), s = e.prepare(`
      SELECT id, name, is_required, min_selection, max_selection
      FROM modifier_groups
      WHERE product_id = ?
    `).all(t);
    for (const i of s)
      i.modifiers = e.prepare(`
        SELECT id, name, price_cents, is_active
        FROM modifiers
        WHERE group_id = ? AND is_active = 1
        ORDER BY price_cents ASC
      `).all(i.id);
    return {
      ...r,
      variations: n,
      modifierGroups: s
    };
  },
  createProduct: (t) => {
    const e = E(), r = (/* @__PURE__ */ new Date()).toISOString(), n = t.id || $(), i = e.transaction(() => {
      if (e.prepare(`
        INSERT INTO products (
          id, branch_id, category_id, name, sku, barcode, description,
          base_price_cents, cost_price_cents, tax_percentage, preparation_time_minutes,
          is_available, has_variations, track_inventory,
          is_featured, is_discount_eligible, min_order_qty, max_order_qty,
          price_dine_in_cents, price_takeaway_cents, price_delivery_cents,
          is_active, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          1, ?, ?
        )
      `).run(
        n,
        t.branchId || null,
        t.categoryId,
        t.name.trim(),
        t.sku ? t.sku.trim() : `SKU-${Date.now().toString().slice(-6)}`,
        t.barcode ? t.barcode.trim() : null,
        t.description || null,
        t.basePriceCents || 0,
        t.costPriceCents || 0,
        t.taxPercentage || 0,
        t.preparationTimeMinutes || 15,
        t.isAvailable !== void 0 ? t.isAvailable ? 1 : 0 : 1,
        Array.isArray(t.variations) && t.variations.length > 0 ? 1 : 0,
        t.trackInventory ? 1 : 0,
        t.isFeatured ? 1 : 0,
        t.isDiscountEligible !== void 0 ? t.isDiscountEligible ? 1 : 0 : 1,
        t.minOrderQty || 1,
        t.maxOrderQty || 99,
        t.priceDineInCents || null,
        t.priceTakeawayCents || null,
        t.priceDeliveryCents || null,
        r,
        r
      ), Array.isArray(t.variations))
        for (const a of t.variations)
          e.prepare(`
            INSERT INTO product_variations (id, product_id, name, sku, price_cents, cost_cents, is_default, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          `).run(
            a.id || $(),
            n,
            a.name.trim(),
            a.sku || null,
            a.priceCents || 0,
            a.costCents || 0,
            a.isDefault ? 1 : 0
          );
      if (Array.isArray(t.modifierGroups))
        for (const a of t.modifierGroups) {
          const o = a.id || $();
          if (e.prepare(`
            INSERT INTO modifier_groups (id, product_id, name, is_required, min_selection, max_selection)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(o, n, a.name.trim(), a.isRequired ? 1 : 0, a.minSelection || 0, a.maxSelection || 1), Array.isArray(a.modifiers))
            for (const c of a.modifiers)
              e.prepare(`
                INSERT INTO modifiers (id, group_id, name, price_cents, is_active)
                VALUES (?, ?, ?, ?, 1)
              `).run(c.id || $(), o, c.name.trim(), c.priceCents || 0);
        }
      return z(t.branchId, "CREATE_PRODUCT", "PRODUCT", n, {
        name: t.name,
        priceCents: t.basePriceCents
      }), n;
    })();
    return P.getProductDetails(i);
  },
  updateProduct: (t, e) => {
    const r = E(), n = (/* @__PURE__ */ new Date()).toISOString();
    return r.transaction(() => {
      const i = r.prepare("SELECT * FROM products WHERE id = ?").get(t);
      if (!i) throw new Error(`Product not found: ${t}`);
      const a = e.categoryId || e.category_id || i.category_id, o = e.basePriceCents !== void 0 ? e.basePriceCents : e.base_price_cents !== void 0 ? e.base_price_cents : i.base_price_cents, c = e.costPriceCents !== void 0 ? e.costPriceCents : e.cost_price_cents !== void 0 ? e.cost_price_cents : i.cost_price_cents, d = e.taxPercentage !== void 0 ? e.taxPercentage : e.tax_percentage !== void 0 ? e.tax_percentage : i.tax_percentage, _ = e.preparationTimeMinutes !== void 0 ? e.preparationTimeMinutes : e.preparation_time_minutes !== void 0 ? e.preparation_time_minutes : i.preparation_time_minutes, p = e.isAvailable !== void 0 ? e.isAvailable ? 1 : 0 : e.is_available !== void 0 ? e.is_available ? 1 : 0 : i.is_available, l = e.trackInventory !== void 0 ? e.trackInventory ? 1 : 0 : e.track_inventory !== void 0 ? e.track_inventory ? 1 : 0 : i.track_inventory, T = e.isFeatured !== void 0 ? e.isFeatured ? 1 : 0 : e.is_featured !== void 0 ? e.is_featured ? 1 : 0 : i.is_featured, R = e.isDiscountEligible !== void 0 ? e.isDiscountEligible ? 1 : 0 : e.is_discount_eligible !== void 0 ? e.is_discount_eligible ? 1 : 0 : i.is_discount_eligible, S = e.minOrderQty !== void 0 ? e.minOrderQty : e.min_order_qty !== void 0 ? e.min_order_qty : i.min_order_qty, L = e.maxOrderQty !== void 0 ? e.maxOrderQty : e.max_order_qty !== void 0 ? e.max_order_qty : i.max_order_qty, A = e.priceDineInCents !== void 0 ? e.priceDineInCents : i.price_dine_in_cents, b = e.priceTakeawayCents !== void 0 ? e.priceTakeawayCents : i.price_takeaway_cents, U = e.priceDeliveryCents !== void 0 ? e.priceDeliveryCents : i.price_delivery_cents;
      if (i.base_price_cents !== o && z(e.branchId, "PRICE_CHANGE", "PRODUCT", t, {
        oldPriceCents: i.base_price_cents,
        newPriceCents: o,
        productName: e.name || i.name
      }), r.prepare(`
        UPDATE products
        SET category_id = ?, name = ?, sku = ?, barcode = ?, description = ?,
            base_price_cents = ?, cost_price_cents = ?, tax_percentage = ?,
            preparation_time_minutes = ?, is_available = ?, has_variations = ?,
            track_inventory = ?, is_featured = ?, is_discount_eligible = ?,
            min_order_qty = ?, max_order_qty = ?,
            price_dine_in_cents = ?, price_takeaway_cents = ?, price_delivery_cents = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        a,
        (e.name || i.name).trim(),
        e.sku ? e.sku.trim() : i.sku,
        e.barcode !== void 0 ? e.barcode ? e.barcode.trim() : null : i.barcode,
        e.description !== void 0 ? e.description : i.description,
        o,
        c,
        d,
        _,
        p,
        Array.isArray(e.variations) && e.variations.length > 0 ? 1 : i.has_variations,
        l,
        T,
        R,
        S,
        L,
        A,
        b,
        U,
        n,
        t
      ), Array.isArray(e.variations)) {
        r.prepare("DELETE FROM product_variations WHERE product_id = ?").run(t);
        for (const C of e.variations)
          r.prepare(`
            INSERT INTO product_variations (id, product_id, name, sku, price_cents, cost_cents, is_default, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          `).run(
            C.id || $(),
            t,
            C.name.trim(),
            C.sku || null,
            C.priceCents || 0,
            C.costCents || 0,
            C.isDefault ? 1 : 0
          );
      }
      if (Array.isArray(e.modifierGroups)) {
        const C = r.prepare("SELECT id FROM modifier_groups WHERE product_id = ?").all(t);
        for (const Y of C)
          r.prepare("DELETE FROM modifiers WHERE group_id = ?").run(Y.id);
        r.prepare("DELETE FROM modifier_groups WHERE product_id = ?").run(t);
        for (const Y of e.modifierGroups) {
          const Ne = Y.id || $();
          if (r.prepare(`
            INSERT INTO modifier_groups (id, product_id, name, is_required, min_selection, max_selection)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(Ne, t, Y.name.trim(), Y.isRequired ? 1 : 0, Y.minSelection || 0, Y.maxSelection || 1), Array.isArray(Y.modifiers))
            for (const Ee of Y.modifiers)
              r.prepare(`
                INSERT INTO modifiers (id, group_id, name, price_cents, is_active)
                VALUES (?, ?, ?, ?, 1)
              `).run(Ee.id || $(), Ne, Ee.name.trim(), Ee.priceCents || 0);
        }
      }
      return z(e.branchId, "UPDATE_PRODUCT", "PRODUCT", t, { name: e.name }), !0;
    })(), P.getProductDetails(t);
  },
  toggleProductAvailability: (t, e) => {
    const r = E(), n = (/* @__PURE__ */ new Date()).toISOString();
    return r.prepare("UPDATE products SET is_available = ?, updated_at = ? WHERE id = ?").run(e ? 1 : 0, n, t), !0;
  },
  archiveProduct: (t) => {
    const e = E(), r = (/* @__PURE__ */ new Date()).toISOString();
    return e.prepare("UPDATE products SET is_active = 0, is_available = 0, updated_at = ? WHERE id = ?").run(r, t), z(null, "ARCHIVE_PRODUCT", "PRODUCT", t, {}), !0;
  },
  // ==========================================
  // COMBOS & DEALS (Section 6.4)
  // ==========================================
  getCombos: (t) => {
    const e = E(), r = e.prepare(`
      SELECT c.id, c.name, c.code, c.description, c.price_cents, c.is_available,
             c.available_from, c.available_to, c.is_active, c.created_at
      FROM combos c
      WHERE (c.branch_id = ? OR c.branch_id IS NULL) AND c.is_active = 1
      ORDER BY c.name ASC
    `).all(t);
    for (const n of r)
      n.items = e.prepare(`
        SELECT ci.id, ci.product_id, ci.quantity, p.name as product_name, p.base_price_cents
        FROM combo_items ci
        JOIN products p ON ci.product_id = p.id
        WHERE ci.combo_id = ?
      `).all(n.id);
    return r;
  },
  createCombo: ({ branchId: t, name: e, code: r, description: n, priceCents: s, isAvailable: i = 1, availableFrom: a = null, availableTo: o = null, items: c }) => {
    const d = E(), _ = (/* @__PURE__ */ new Date()).toISOString(), p = $();
    return d.transaction(() => {
      if (d.prepare(`
        INSERT INTO combos (id, branch_id, name, code, description, price_cents, is_available, available_from, available_to, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        p,
        t || null,
        e.trim(),
        r || null,
        n || null,
        s,
        i ? 1 : 0,
        a || null,
        o || null,
        _,
        _
      ), Array.isArray(c))
        for (const T of c)
          d.prepare(`
            INSERT INTO combo_items (id, combo_id, product_id, quantity)
            VALUES (?, ?, ?, ?)
          `).run($(), p, T.productId, T.quantity || 1);
      return z(t, "CREATE_COMBO", "COMBO", p, { name: e, priceCents: s }), p;
    })();
  },
  updateCombo: (t, { name: e, code: r, description: n, priceCents: s, isAvailable: i, availableFrom: a, availableTo: o, items: c }) => {
    const d = E(), _ = (/* @__PURE__ */ new Date()).toISOString();
    return d.transaction(() => {
      if (d.prepare(`
        UPDATE combos
        SET name = ?, code = ?, description = ?, price_cents = ?,
            is_available = ?, available_from = ?, available_to = ?, updated_at = ?
        WHERE id = ?
      `).run(
        e.trim(),
        r ? r.trim() : null,
        n ? n.trim() : null,
        s,
        i !== void 0 ? i ? 1 : 0 : 1,
        a || null,
        o || null,
        _,
        t
      ), Array.isArray(c)) {
        d.prepare("DELETE FROM combo_items WHERE combo_id = ?").run(t);
        for (const l of c)
          d.prepare(`
            INSERT INTO combo_items (id, combo_id, product_id, quantity)
            VALUES (?, ?, ?, ?)
          `).run($(), t, l.productId, l.quantity || 1);
      }
      return z(null, "UPDATE_COMBO", "COMBO", t, { name: e, priceCents: s }), !0;
    })();
  },
  toggleComboAvailability: (t, e) => {
    const r = E(), n = (/* @__PURE__ */ new Date()).toISOString();
    return r.prepare("UPDATE combos SET is_available = ?, updated_at = ? WHERE id = ?").run(e ? 1 : 0, n, t), !0;
  },
  archiveCombo: (t) => {
    const e = E(), r = (/* @__PURE__ */ new Date()).toISOString();
    return e.prepare("UPDATE combos SET is_active = 0, updated_at = ? WHERE id = ?").run(r, t), z(null, "ARCHIVE_COMBO", "COMBO", t, {}), !0;
  }
};
function ve() {
  return v.randomUUID();
}
function _e(t, e, r, n, s) {
  try {
    const i = E(), a = O.getCurrentSession();
    let o = null;
    a != null && a.id && i.prepare("SELECT id FROM users WHERE id = ?").get(a.id) && (o = a.id), i.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ve(),
      t || (a == null ? void 0 : a.branchId) || null,
      o,
      e,
      r,
      n,
      JSON.stringify(s),
      (/* @__PURE__ */ new Date()).toISOString()
    );
  } catch (i) {
    console.error("[Audit Log Error]:", i);
  }
}
const te = {
  getFloorsWithTables: (t) => {
    const e = E(), r = e.prepare(`
      SELECT id, name, display_order, is_active
      FROM floors
      WHERE (branch_id = ? OR branch_id IS NULL) AND is_active = 1
      ORDER BY display_order ASC, name ASC
    `).all(t), n = e.prepare(`
      SELECT t.id, t.floor_id, t.table_number, t.capacity, t.status, t.current_order_id, t.is_active,
             o.order_number as current_order_number,
             o.total_cents as current_order_total_cents,
             o.order_type as current_order_type,
             o.created_at as current_order_created_at,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as current_order_item_count
      FROM dining_tables t
      LEFT JOIN orders o ON t.current_order_id = o.id AND o.status != 'COMPLETED' AND o.status != 'CANCELLED'
      WHERE (t.branch_id = ? OR t.branch_id IS NULL) AND t.is_active = 1
      ORDER BY t.table_number ASC
    `).all(t), s = Date.now(), i = {};
    for (const a of n) {
      let o = 0;
      a.current_order_created_at && (o = Math.max(0, Math.floor((s - new Date(a.current_order_created_at).getTime()) / 6e4)));
      const c = {
        ...a,
        occupancyMinutes: o
      };
      i[a.floor_id] || (i[a.floor_id] = []), i[a.floor_id].push(c);
    }
    return r.map((a) => ({
      ...a,
      tables: i[a.id] || []
    }));
  },
  updateTableStatus: (t, e, r = null) => {
    const n = E(), s = (/* @__PURE__ */ new Date()).toISOString();
    return n.prepare(`
      UPDATE dining_tables
      SET status = ?, current_order_id = ?, updated_at = ?
      WHERE id = ?
    `).run(e, r, s, t), !0;
  },
  createFloor: ({ branchId: t, name: e, displayOrder: r = 0 }) => {
    const n = E(), s = ve(), i = (/* @__PURE__ */ new Date()).toISOString();
    return n.prepare(`
      INSERT INTO floors (id, branch_id, name, display_order, is_active, created_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(s, t || null, e.trim(), r, i), _e(t, "CREATE_FLOOR", "FLOOR", s, { name: e }), { id: s, name: e, displayOrder: r, is_active: 1 };
  },
  updateFloor: (t, { name: e, displayOrder: r = 0 }) => (E().prepare(`
      UPDATE floors SET name = ?, display_order = ? WHERE id = ?
    `).run(e.trim(), r, t), _e(null, "UPDATE_FLOOR", "FLOOR", t, { name: e }), !0),
  createTable: ({ branchId: t, floorId: e, tableNumber: r, capacity: n = 4 }) => {
    const s = E(), i = ve(), a = (/* @__PURE__ */ new Date()).toISOString();
    return s.prepare(`
      INSERT INTO dining_tables (id, branch_id, floor_id, table_number, capacity, status, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'AVAILABLE', 1, ?, ?)
    `).run(i, t || null, e, r.trim(), n, a, a), _e(t, "CREATE_TABLE", "TABLE", i, { tableNumber: r, capacity: n }), { id: i, floorId: e, tableNumber: r, capacity: n, status: "AVAILABLE", is_active: 1 };
  },
  updateTable: (t, { floorId: e, tableNumber: r, capacity: n, status: s }) => {
    const i = E(), a = (/* @__PURE__ */ new Date()).toISOString();
    return i.prepare(`
      UPDATE dining_tables
      SET floor_id = COALESCE(?, floor_id),
          table_number = COALESCE(?, table_number),
          capacity = COALESCE(?, capacity),
          status = COALESCE(?, status),
          updated_at = ?
      WHERE id = ?
    `).run(e || null, r ? r.trim() : null, n || null, s || null, a, t), _e(null, "UPDATE_TABLE", "TABLE", t, { tableNumber: r, capacity: n, status: s }), !0;
  },
  archiveTable: (t) => {
    const e = E(), r = (/* @__PURE__ */ new Date()).toISOString(), n = e.prepare("SELECT status, current_order_id FROM dining_tables WHERE id = ?").get(t);
    if ((n == null ? void 0 : n.status) === "OCCUPIED" && (n != null && n.current_order_id))
      throw new Error("Cannot archive an occupied table with an active dining order.");
    return e.prepare("UPDATE dining_tables SET is_active = 0, updated_at = ? WHERE id = ?").run(r, t), _e(null, "ARCHIVE_TABLE", "TABLE", t, {}), !0;
  },
  transferTable: ({ fromTableId: t, toTableId: e, reason: r = "Customer request" }) => {
    const n = E(), s = (/* @__PURE__ */ new Date()).toISOString();
    return n.transaction(() => {
      const a = n.prepare("SELECT * FROM dining_tables WHERE id = ?").get(t);
      if (!a) throw new Error("Source table not found.");
      if (!a.current_order_id) throw new Error(`Table ${a.table_number} does not have an active order to transfer.`);
      const o = n.prepare("SELECT * FROM dining_tables WHERE id = ?").get(e);
      if (!o) throw new Error("Target table not found.");
      if (o.status === "OCCUPIED" && o.current_order_id)
        throw new Error(`Target table ${o.table_number} is already occupied.`);
      const c = a.current_order_id;
      return n.prepare("UPDATE orders SET table_id = ?, updated_at = ? WHERE id = ?").run(e, s, c), n.prepare("UPDATE dining_tables SET status = 'AVAILABLE', current_order_id = NULL, updated_at = ? WHERE id = ?").run(s, t), n.prepare("UPDATE dining_tables SET status = 'OCCUPIED', current_order_id = ?, updated_at = ? WHERE id = ?").run(c, s, e), n.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, 'OCCUPIED', 'TRANSFER', NULL, ?, ?)
      `).run(ve(), c, `Table transferred from ${a.table_number} to ${o.table_number}. Reason: ${r}`, s), _e(a.branch_id, "TRANSFER_TABLE", "TABLE", c, {
        fromTable: a.table_number,
        toTable: o.table_number,
        reason: r
      }), {
        orderId: c,
        fromTableNumber: a.table_number,
        toTableNumber: o.table_number
      };
    })();
  }
};
function B() {
  return v.randomUUID();
}
function Q(t, e, r, n, s) {
  try {
    const i = E(), a = O.getCurrentSession();
    let o = null;
    a != null && a.id && i.prepare("SELECT id FROM users WHERE id = ?").get(a.id) && (o = a.id), i.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      B(),
      t || null,
      o,
      e,
      r,
      n,
      typeof s == "string" ? s : JSON.stringify(s),
      (/* @__PURE__ */ new Date()).toISOString()
    );
  } catch (i) {
    console.error("Failed to log audit:", i);
  }
}
const f = {
  // ==========================================
  // 1. INVENTORY UNITS & ITEMS (STOCK MASTER)
  // ==========================================
  getUnits: () => E().prepare("SELECT * FROM inventory_units ORDER BY name ASC").all(),
  createUnit: ({ name: t, abbreviation: e }) => {
    const r = E(), n = B();
    return r.prepare("INSERT INTO inventory_units (id, name, abbreviation) VALUES (?, ?, ?)").run(n, t, e), r.prepare("SELECT * FROM inventory_units WHERE id = ?").get(n);
  },
  getItems: (t = {}) => {
    var a;
    const e = E(), r = t.branchId || ((a = e.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : a.id);
    let n = `
      SELECT i.*, 
             u.name as unit_name, u.abbreviation as unit_abbr,
             s.company_name as supplier_name
      FROM inventory_items i
      LEFT JOIN inventory_units u ON i.unit_id = u.id
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.branch_id = ? AND i.is_active = 1
    `;
    const s = [r];
    if (t.category && t.category !== "ALL" && (n += " AND i.category = ?", s.push(t.category)), t.search && t.search.trim() !== "") {
      n += " AND (LOWER(i.name) LIKE ? OR LOWER(i.sku) LIKE ?)";
      const o = `%${t.search.trim().toLowerCase()}%`;
      s.push(o, o);
    }
    return t.lowStockOnly && (n += " AND i.current_stock <= i.minimum_level"), n += " ORDER BY i.name ASC", e.prepare(n).all(...s).map((o) => ({
      ...o,
      isLowStock: o.current_stock <= o.minimum_level,
      isOutOfStock: o.current_stock <= 0,
      totalValueCents: Math.round(o.current_stock * (o.cost_per_unit_cents || 0))
    }));
  },
  getItemById: (t) => {
    const r = E().prepare(`
      SELECT i.*, 
             u.name as unit_name, u.abbreviation as unit_abbr,
             s.company_name as supplier_name
      FROM inventory_items i
      LEFT JOIN inventory_units u ON i.unit_id = u.id
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.id = ?
    `).get(t);
    return r ? {
      ...r,
      isLowStock: r.current_stock <= r.minimum_level,
      isOutOfStock: r.current_stock <= 0,
      totalValueCents: Math.round(r.current_stock * (r.cost_per_unit_cents || 0))
    } : null;
  },
  createItem: (t) => {
    var o;
    const e = E(), r = B(), n = (/* @__PURE__ */ new Date()).toISOString(), s = t.branchId || ((o = e.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : o.id), i = parseFloat(t.currentStock || t.openingStock || 0);
    return e.transaction(() => (e.prepare(`
        INSERT INTO inventory_items (
          id, branch_id, name, sku, unit_id, current_stock, minimum_level,
          cost_per_unit_cents, category, supplier_id, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
      r,
      s,
      t.name,
      t.sku || `RAW-${Date.now().toString().slice(-6)}`,
      t.unitId,
      i,
      parseFloat(t.minimumLevel || 5),
      parseInt(t.costPerUnitCents || 0, 10),
      t.category || "General",
      t.supplierId || null,
      n,
      n
    ), i > 0 && e.prepare(`
          INSERT INTO stock_movements (
            id, branch_id, inventory_item_id, movement_type, quantity,
            previous_stock, new_stock, unit_cost_cents, reference_type, reason, created_at
          ) VALUES (?, ?, ?, 'ADJUSTMENT', ?, 0, ?, ?, 'MANUAL', 'Initial opening stock', ?)
        `).run(
      B(),
      s,
      r,
      i,
      i,
      parseInt(t.costPerUnitCents || 0, 10),
      n
    ), Q(s, "CREATE_INVENTORY_ITEM", "INVENTORY_ITEM", r, {
      name: t.name,
      stock: i
    }), f.getItemById(r)))();
  },
  updateItem: (t, e) => {
    const r = E(), n = r.prepare("SELECT * FROM inventory_items WHERE id = ?").get(t);
    if (!n) throw new Error(`Inventory item with ID "${t}" not found.`);
    const s = (/* @__PURE__ */ new Date()).toISOString();
    return r.prepare(`
      UPDATE inventory_items
      SET name = COALESCE(?, name),
          sku = COALESCE(?, sku),
          unit_id = COALESCE(?, unit_id),
          minimum_level = COALESCE(?, minimum_level),
          cost_per_unit_cents = COALESCE(?, cost_per_unit_cents),
          category = COALESCE(?, category),
          supplier_id = COALESCE(?, supplier_id),
          updated_at = ?
      WHERE id = ?
    `).run(
      e.name ?? null,
      e.sku ?? null,
      e.unitId ?? null,
      e.minimumLevel !== void 0 ? parseFloat(e.minimumLevel) : null,
      e.costPerUnitCents !== void 0 ? parseInt(e.costPerUnitCents, 10) : null,
      e.category ?? null,
      e.supplierId ?? null,
      s,
      t
    ), Q(n.branch_id, "UPDATE_INVENTORY_ITEM", "INVENTORY_ITEM", t, e), f.getItemById(t);
  },
  /**
   * Manual Stock Adjustment, Wastage or Return
   */
  adjustStock: ({ itemId: t, branchId: e, quantityChange: r, movementType: n, reason: s, userId: i }) => {
    const a = E(), o = a.prepare("SELECT * FROM inventory_items WHERE id = ?").get(t);
    if (!o) throw new Error(`Inventory item with ID "${t}" not found.`);
    const c = parseFloat(r);
    if (isNaN(c) || c === 0)
      throw new Error("Quantity change must be a non-zero number.");
    const d = parseFloat(o.current_stock), _ = d + c;
    if (_ < 0)
      throw new Error(`Insufficient stock for "${o.name}". Current: ${d}, adjustment: ${c}`);
    const p = (/* @__PURE__ */ new Date()).toISOString(), l = e || o.branch_id;
    return a.transaction(() => (a.prepare(`
        UPDATE inventory_items
        SET current_stock = ?,
            updated_at = ?
        WHERE id = ?
      `).run(_, p, t), a.prepare(`
        INSERT INTO stock_movements (
          id, branch_id, inventory_item_id, movement_type, quantity,
          previous_stock, new_stock, unit_cost_cents, reference_type,
          reason, user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?, ?)
      `).run(
      B(),
      l,
      t,
      n || (c > 0 ? "ADJUSTMENT" : "WASTAGE"),
      Math.abs(c),
      d,
      _,
      o.cost_per_unit_cents,
      s || "Manual inventory adjustment",
      i || null,
      p
    ), Q(l, "ADJUST_STOCK", "INVENTORY_ITEM", t, {
      previousStock: d,
      newStock: _,
      delta: c,
      movementType: n,
      reason: s
    }), f.getItemById(t)))();
  },
  getStockMovements: (t = {}) => {
    var i;
    const e = E(), r = t.branchId || ((i = e.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : i.id);
    let n = `
      SELECT sm.*, 
             i.name as item_name, i.sku as item_sku,
             u.abbreviation as unit_abbr,
             usr.display_name as staff_name
      FROM stock_movements sm
      JOIN inventory_items i ON sm.inventory_item_id = i.id
      LEFT JOIN inventory_units u ON i.unit_id = u.id
      LEFT JOIN users usr ON sm.user_id = usr.id
      WHERE sm.branch_id = ?
    `;
    const s = [r];
    return t.itemId && (n += " AND sm.inventory_item_id = ?", s.push(t.itemId)), t.movementType && (n += " AND sm.movement_type = ?", s.push(t.movementType)), n += " ORDER BY sm.created_at DESC LIMIT ?", s.push(t.limit || 100), e.prepare(n).all(...s);
  },
  // ==========================================
  // 2. RECIPES & FOOD COST MANAGEMENT
  // ==========================================
  getRecipes: (t = {}) => {
    var s;
    const e = E(), r = t.branchId || ((s = e.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : s.id);
    return e.prepare(`
      SELECT r.*, 
             p.name as product_name, p.sku as product_sku, p.base_price_cents,
             c.name as category_name,
             pv.name as variation_name, pv.price_cents as variation_price_cents
      FROM recipes r
      JOIN products p ON r.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN product_variations pv ON r.variation_id = pv.id
      WHERE p.branch_id = ? AND p.is_active = 1
      ORDER BY p.name ASC
    `).all(r).map((i) => {
      const a = e.prepare(`
        SELECT ri.*, 
               i.name as item_name, i.current_stock, i.cost_per_unit_cents,
               u.abbreviation as unit_abbr
        FROM recipe_ingredients ri
        JOIN inventory_items i ON ri.inventory_item_id = i.id
        LEFT JOIN inventory_units u ON i.unit_id = u.id
        WHERE ri.recipe_id = ?
      `).all(i.id), o = a.reduce((p, l) => {
        const T = 1 + (l.wastage_percentage || 0) / 100;
        return p + Math.round(l.quantity_required * T * (l.cost_per_unit_cents || 0));
      }, 0), c = i.variation_price_cents || i.base_price_cents || 0, d = Math.max(0, c - o), _ = c > 0 ? parseFloat((o / c * 100).toFixed(1)) : 0;
      return {
        ...i,
        ingredients: a,
        foodCostCents: o,
        grossMarginCents: d,
        foodCostPercentage: _,
        sellingPriceCents: c
      };
    });
  },
  getRecipeForProduct: (t, e = null) => {
    const r = E(), n = e ? "SELECT * FROM recipes WHERE product_id = ? AND variation_id = ? LIMIT 1" : "SELECT * FROM recipes WHERE product_id = ? LIMIT 1", s = e ? [t, e] : [t], i = r.prepare(n).get(...s);
    if (!i) return null;
    const a = r.prepare(`
      SELECT ri.*, 
             i.name as item_name, i.current_stock, i.cost_per_unit_cents,
             u.abbreviation as unit_abbr
      FROM recipe_ingredients ri
      JOIN inventory_items i ON ri.inventory_item_id = i.id
      LEFT JOIN inventory_units u ON i.unit_id = u.id
      WHERE ri.recipe_id = ?
    `).all(i.id), o = a.reduce((c, d) => {
      const _ = 1 + (d.wastage_percentage || 0) / 100;
      return c + Math.round(d.quantity_required * _ * (d.cost_per_unit_cents || 0));
    }, 0);
    return {
      ...i,
      ingredients: a,
      foodCostCents: o
    };
  },
  saveRecipe: ({ productId: t, variationId: e, yieldQuantity: r, notes: n, ingredients: s }) => {
    const i = E();
    return i.transaction(() => {
      let o = i.prepare(`
        SELECT id FROM recipes
        WHERE product_id = ? AND (variation_id = ? OR (variation_id IS NULL AND ? IS NULL))
      `).get(t, e || null, e || null), c = o == null ? void 0 : o.id;
      if (c ? (i.prepare("UPDATE recipes SET yield_quantity = ?, notes = ? WHERE id = ?").run(parseFloat(r || 1), n || null, c), i.prepare("DELETE FROM recipe_ingredients WHERE recipe_id = ?").run(c)) : (c = B(), i.prepare(`
          INSERT INTO recipes (id, product_id, variation_id, yield_quantity, notes)
          VALUES (?, ?, ?, ?, ?)
        `).run(c, t, e || null, parseFloat(r || 1), n || null)), Array.isArray(s))
        for (const _ of s)
          i.prepare(`
            INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required, wastage_percentage)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            B(),
            c,
            _.inventoryItemId,
            parseFloat(_.quantityRequired),
            parseFloat(_.wastagePercentage || 0)
          );
      const d = i.prepare("SELECT branch_id, name FROM products WHERE id = ?").get(t);
      return Q(d == null ? void 0 : d.branch_id, "SAVE_RECIPE", "RECIPE", c, {
        productId: t,
        productName: d == null ? void 0 : d.name,
        ingredientsCount: (s == null ? void 0 : s.length) || 0
      }), f.getRecipeForProduct(t, e);
    })();
  },
  /**
   * Automatic recipe stock deduction when POS order is completed/paid
   */
  deductRecipeStockForOrder: (t) => {
    const e = E(), r = e.prepare("SELECT * FROM orders WHERE id = ?").get(t);
    if (!r) return { success: !1, reason: "Order not found" };
    const n = e.prepare("SELECT * FROM order_items WHERE order_id = ?").all(t), s = (/* @__PURE__ */ new Date()).toISOString(), i = [];
    return e.transaction(() => {
      for (const o of n) {
        const c = f.getRecipeForProduct(o.product_id, o.variation_id);
        if (!c || !c.ingredients || c.ingredients.length === 0) continue;
        const d = o.quantity || 1;
        for (const _ of c.ingredients) {
          const p = 1 + (_.wastage_percentage || 0) / 100, l = parseFloat((_.quantity_required * d * p).toFixed(3)), T = e.prepare("SELECT current_stock, cost_per_unit_cents FROM inventory_items WHERE id = ?").get(_.inventory_item_id);
          if (!T) continue;
          const R = parseFloat(T.current_stock), S = Math.max(0, parseFloat((R - l).toFixed(3)));
          e.prepare("UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?").run(S, s, _.inventory_item_id), e.prepare(`
            INSERT INTO stock_movements (
              id, branch_id, inventory_item_id, movement_type, quantity,
              previous_stock, new_stock, unit_cost_cents, reference_type, reference_id,
              reason, created_at
            ) VALUES (?, ?, ?, 'SALE_DEDUCTION', ?, ?, ?, ?, 'ORDER', ?, ?, ?)
          `).run(
            B(),
            r.branch_id,
            _.inventory_item_id,
            l,
            R,
            S,
            T.cost_per_unit_cents,
            t,
            `Auto recipe deduction for Order ${r.order_number} (${o.item_name} x${d})`,
            s
          ), i.push({
            itemId: _.inventory_item_id,
            itemName: _.item_name,
            deducted: l,
            remainingStock: S
          });
        }
      }
      return i;
    })();
  },
  // ==========================================
  // 3. SUPPLIERS & PURCHASES
  // ==========================================
  getSuppliers: (t) => {
    var s;
    const e = E(), r = t || ((s = e.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : s.id);
    return e.prepare(`
      SELECT s.*,
             (SELECT COUNT(*) FROM purchase_orders WHERE supplier_id = s.id) as total_po_count,
             (SELECT COALESCE(SUM(total_cents), 0) FROM purchase_orders WHERE supplier_id = s.id AND status = 'RECEIVED') as total_purchases_cents,
             (SELECT COALESCE(SUM(amount_cents), 0) FROM vendor_payments WHERE supplier_id = s.id) as total_paid_cents
      FROM suppliers s
      WHERE s.branch_id = ? AND s.is_active = 1
      ORDER BY s.company_name ASC
    `).all(r).map((i) => ({
      ...i,
      outstandingBalanceCents: Math.max(0, (i.total_purchases_cents || 0) - (i.total_paid_cents || 0))
    }));
  },
  createSupplier: (t) => {
    var i;
    const e = E(), r = B(), n = (/* @__PURE__ */ new Date()).toISOString(), s = t.branchId || ((i = e.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : i.id);
    return e.prepare(`
      INSERT INTO suppliers (id, branch_id, company_name, contact_name, phone, email, address, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      r,
      s,
      t.companyName,
      t.contactName || null,
      t.phone || null,
      t.email || null,
      t.address || null,
      n
    ), Q(s, "CREATE_SUPPLIER", "SUPPLIER", r, { companyName: t.companyName }), e.prepare("SELECT * FROM suppliers WHERE id = ?").get(r);
  },
  updateSupplier: (t, e) => {
    const r = E(), n = r.prepare("SELECT * FROM suppliers WHERE id = ?").get(t);
    if (!n) throw new Error(`Supplier with ID "${t}" not found.`);
    return r.prepare(`
      UPDATE suppliers
      SET company_name = COALESCE(?, company_name),
          contact_name = COALESCE(?, contact_name),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          address = COALESCE(?, address),
          is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).run(
      e.companyName ?? null,
      e.contactName ?? null,
      e.phone ?? null,
      e.email ?? null,
      e.address ?? null,
      e.isActive ?? null,
      t
    ), Q(n.branch_id, "UPDATE_SUPPLIER", "SUPPLIER", t, e), r.prepare("SELECT * FROM suppliers WHERE id = ?").get(t);
  },
  getPurchaseOrders: (t = {}) => {
    var a;
    const e = E(), r = t.branchId || ((a = e.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : a.id);
    let n = `
      SELECT po.*, s.company_name as supplier_name, s.phone as supplier_phone
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id = s.id
      WHERE po.branch_id = ?
    `;
    const s = [r];
    return t.supplierId && (n += " AND po.supplier_id = ?", s.push(t.supplierId)), t.status && (n += " AND po.status = ?", s.push(t.status)), n += " ORDER BY po.created_at DESC", e.prepare(n).all(...s).map((o) => {
      const c = e.prepare(`
        SELECT poi.*, i.name as item_name, u.abbreviation as unit_abbr
        FROM purchase_order_items poi
        JOIN inventory_items i ON poi.inventory_item_id = i.id
        LEFT JOIN inventory_units u ON i.unit_id = u.id
        WHERE poi.po_id = ?
      `).all(o.id);
      return {
        ...o,
        items: c
      };
    });
  },
  /**
   * Create Purchase Order with optional auto-receive (Goods Received Note - GRN)
   */
  createPurchaseOrder: ({ branchId: t, supplierId: e, poNumber: r, notes: n, items: s, autoReceive: i }) => {
    var T;
    const a = E(), o = t || ((T = a.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : T.id), c = B(), d = (/* @__PURE__ */ new Date()).toISOString(), _ = i ? "RECEIVED" : "ORDERED", p = r || `PO-${Date.now().toString().slice(-6)}`;
    return a.transaction(() => {
      const R = (s || []).reduce((S, L) => S + (L.totalCents || Math.round(L.quantity * L.unitCostCents)), 0);
      if (a.prepare(`
        INSERT INTO purchase_orders (id, branch_id, supplier_id, po_number, status, total_cents, notes, created_at, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        c,
        o,
        e,
        p,
        _,
        R,
        n || null,
        d,
        i ? d : null
      ), Array.isArray(s))
        for (const S of s) {
          const L = S.totalCents || Math.round(S.quantity * S.unitCostCents);
          if (a.prepare(`
            INSERT INTO purchase_order_items (id, po_id, inventory_item_id, quantity, unit_cost_cents, total_cents)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(B(), c, S.inventoryItemId, parseFloat(S.quantity), parseInt(S.unitCostCents, 10), L), i) {
            const A = a.prepare("SELECT current_stock FROM inventory_items WHERE id = ?").get(S.inventoryItemId);
            if (A) {
              const b = parseFloat(A.current_stock), U = parseFloat(S.quantity), C = b + U;
              a.prepare(`
                UPDATE inventory_items
                SET current_stock = ?,
                    cost_per_unit_cents = ?,
                    updated_at = ?
                WHERE id = ?
              `).run(C, parseInt(S.unitCostCents, 10), d, S.inventoryItemId), a.prepare(`
                INSERT INTO stock_movements (
                  id, branch_id, inventory_item_id, movement_type, quantity,
                  previous_stock, new_stock, unit_cost_cents, reference_type, reference_id,
                  reason, created_at
                ) VALUES (?, ?, ?, 'PURCHASE', ?, ?, ?, ?, 'PO', ?, ?, ?)
              `).run(
                B(),
                o,
                S.inventoryItemId,
                U,
                b,
                C,
                parseInt(S.unitCostCents, 10),
                c,
                `Goods Received for PO ${p}`,
                d
              );
            }
          }
        }
      return Q(o, "CREATE_PURCHASE_ORDER", "PURCHASE_ORDER", c, {
        poNumber: p,
        status: _,
        totalCents: R
      }), a.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(c);
    })();
  },
  recordVendorPayment: ({ branchId: t, supplierId: e, poId: r, amountCents: n, paymentMethod: s, referenceNumber: i, notes: a }) => {
    var p;
    const o = E(), c = t || ((p = o.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : p.id), d = B(), _ = (/* @__PURE__ */ new Date()).toISOString();
    return o.prepare(`
      INSERT INTO vendor_payments (
        id, branch_id, supplier_id, po_id, amount_cents, payment_method,
        reference_number, notes, payment_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      d,
      c,
      e,
      r || null,
      parseInt(n, 10),
      s || "BANK_TRANSFER",
      i || null,
      a || null,
      _,
      _
    ), Q(c, "RECORD_VENDOR_PAYMENT", "VENDOR_PAYMENT", d, {
      supplierId: e,
      amountCents: n,
      paymentMethod: s
    }), o.prepare("SELECT * FROM vendor_payments WHERE id = ?").get(d);
  },
  // ==========================================
  // 4. EXPENSE MANAGEMENT
  // ==========================================
  getExpenseCategories: () => E().prepare("SELECT * FROM expense_categories ORDER BY name ASC").all(),
  getExpenses: (t = {}) => {
    var i;
    const e = E(), r = t.branchId || ((i = e.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : i.id);
    let n = `
      SELECT e.*, c.name as category_name, c.code as category_code,
             u.display_name as recorded_by_name
      FROM expenses e
      JOIN expense_categories c ON e.category_id = c.id
      LEFT JOIN users u ON e.recorded_by_user_id = u.id
      WHERE e.branch_id = ?
    `;
    const s = [r];
    return t.categoryId && t.categoryId !== "ALL" && (n += " AND e.category_id = ?", s.push(t.categoryId)), t.startDate && (n += " AND date(e.expense_date) >= date(?)", s.push(t.startDate)), t.endDate && (n += " AND date(e.expense_date) <= date(?)", s.push(t.endDate)), n += " ORDER BY e.expense_date DESC, e.created_at DESC", e.prepare(n).all(...s);
  },
  createExpense: ({ branchId: t, categoryId: e, amountCents: r, paymentMethod: n, payee: s, description: i, expenseDate: a, userId: o }) => {
    var T;
    const c = E(), d = t || ((T = c.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : T.id), _ = B(), p = (/* @__PURE__ */ new Date()).toISOString(), l = O.getCurrentSession();
    return c.prepare(`
      INSERT INTO expenses (
        id, branch_id, category_id, amount_cents, payment_method,
        payee, description, recorded_by_user_id, expense_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      _,
      d,
      e,
      parseInt(r, 10),
      n || "CASH",
      s || null,
      i || null,
      o || (l == null ? void 0 : l.id) || null,
      a || p,
      p
    ), Q(d, "RECORD_EXPENSE", "EXPENSE", _, {
      amountCents: r,
      categoryId: e,
      payee: s
    }), c.prepare(`
      SELECT e.*, c.name as category_name
      FROM expenses e
      JOIN expense_categories c ON e.category_id = c.id
      WHERE e.id = ?
    `).get(_);
  },
  getExpenseSummary: (t = {}) => {
    var i;
    const e = E(), r = t.branchId || ((i = e.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : i.id), n = e.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) as total FROM expenses
      WHERE branch_id = ?
    `).get(r).total, s = e.prepare(`
      SELECT c.name as category_name, COALESCE(SUM(e.amount_cents), 0) as amount_cents, COUNT(e.id) as count
      FROM expense_categories c
      LEFT JOIN expenses e ON e.category_id = c.id AND e.branch_id = ?
      GROUP BY c.id
      ORDER BY amount_cents DESC
    `).all(r);
    return {
      totalCents: n,
      categoryBreakdown: s
    };
  }
};
function re() {
  return v.randomUUID();
}
function De(t, e) {
  if (e) {
    const s = t.prepare("SELECT id FROM users WHERE id = ?").get(e);
    if (s) return s.id;
  }
  const r = O.getCurrentSession();
  if (r != null && r.id) {
    const s = t.prepare("SELECT id FROM users WHERE id = ?").get(r.id);
    if (s) return s.id;
  }
  const n = t.prepare("SELECT id FROM users WHERE is_active = 1 LIMIT 1").get();
  return (n == null ? void 0 : n.id) || null;
}
function Ve(t, e) {
  if (e) {
    const s = t.prepare("SELECT id FROM branches WHERE id = ?").get(e);
    if (s) return s.id;
  }
  const r = O.getCurrentSession();
  if (r != null && r.branchId) {
    const s = t.prepare("SELECT id FROM branches WHERE id = ?").get(r.branchId);
    if (s) return s.id;
  }
  const n = t.prepare("SELECT id FROM branches LIMIT 1").get();
  return (n == null ? void 0 : n.id) || null;
}
function we(t, e, r, n, s) {
  try {
    const i = E(), a = De(i, null), o = Ve(i, t);
    i.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      re(),
      o,
      a,
      e,
      r,
      n,
      JSON.stringify(s),
      (/* @__PURE__ */ new Date()).toISOString()
    );
  } catch (i) {
    console.error("[Audit Log Error]:", i);
  }
}
const G = {
  createOrder: (t) => {
    const e = E(), r = (/* @__PURE__ */ new Date()).toISOString(), n = t.id || re(), s = t.orderNumber || `ORD-${Date.now().toString().slice(-6)}`, i = t.status || "CONFIRMED", a = t.orderType || "DINE_IN";
    return e.transaction(() => {
      const c = Ve(e, t.branchId), d = De(e, t.cashierId);
      if (e.prepare(`
        INSERT INTO orders (
          id, branch_id, order_number, order_type, order_source, status,
          table_id, customer_id, cashier_id, subtotal_cents, discount_cents,
          discount_reason, tax_cents, service_charge_cents, delivery_charge_cents,
          total_cents, paid_cents, notes, kitchen_accepted_at, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?
        )
      `).run(
        n,
        c,
        s,
        a,
        t.orderSource || "POS",
        i,
        t.tableId || null,
        t.customerId || null,
        d,
        t.subtotalCents || 0,
        t.discountCents || 0,
        t.discountReason || null,
        t.taxCents || 0,
        t.serviceChargeCents || 0,
        t.deliveryChargeCents || 0,
        t.totalCents || 0,
        t.paidCents || 0,
        t.notes || null,
        i === "CONFIRMED" ? r : null,
        r,
        r
      ), Array.isArray(t.items))
        for (const _ of t.items) {
          const p = re();
          let l = _.kitchenStationId || null;
          if (!l && _.productId)
            try {
              const T = e.prepare("SELECT kitchen_station_id FROM products WHERE id = ?").get(_.productId);
              T != null && T.kitchen_station_id && (l = T.kitchen_station_id);
            } catch {
            }
          if (e.prepare(`
            INSERT INTO order_items (
              id, order_id, product_id, variation_id, item_name,
              quantity, unit_price_cents, discount_cents, total_cents,
              kitchen_station_id, kitchen_status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
          `).run(
            p,
            n,
            _.productId,
            _.variationId || null,
            _.name || _.itemName || "Menu Item",
            _.quantity,
            _.unitPriceCents,
            _.discountCents || 0,
            _.totalCents,
            l,
            _.notes || null
          ), Array.isArray(_.modifiers))
            for (const T of _.modifiers)
              e.prepare(`
                INSERT INTO order_item_modifiers (id, order_item_id, modifier_id, name, price_cents)
                VALUES (?, ?, ?, ?, ?)
              `).run(re(), p, T.id || null, T.name, T.priceCents || 0);
        }
      if (e.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, NULL, ?, ?, 'Order created via POS', ?)
      `).run(re(), n, i, d, r), a === "DINE_IN" && t.tableId && i !== "COMPLETED" && i !== "CANCELLED" && e.prepare("UPDATE dining_tables SET status = ?, current_order_id = ?, updated_at = ? WHERE id = ?").run("OCCUPIED", n, r, t.tableId), t.customerId && i !== "DRAFT" && i !== "CANCELLED") {
        const _ = Math.floor((t.totalCents || 0) / 100);
        e.prepare(`
          UPDATE customers
          SET order_count = order_count + 1,
              total_spent_cents = total_spent_cents + ?,
              loyalty_points = loyalty_points + ?,
              updated_at = ?
          WHERE id = ?
        `).run(t.totalCents || 0, _, r, t.customerId);
      }
      return e.prepare(`
        INSERT INTO sync_outbox (id, entity_type, entity_id, operation, payload_json, status, created_at)
        VALUES (?, 'ORDER', ?, 'INSERT', ?, 'PENDING', ?)
      `).run(re(), n, JSON.stringify({ id: n, orderNumber: s, totalCents: t.totalCents }), r), we(t.branchId, "CREATE_ORDER", "ORDER", n, {
        orderNumber: s,
        orderType: a,
        totalCents: t.totalCents,
        status: i
      }), G.getOrderDetails(n);
    })();
  },
  getOrderDetails: (t) => {
    const e = E(), r = e.prepare(`
      SELECT o.*,
             c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
             t.table_number, f.name as floor_name,
             u.display_name as cashier_name
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN dining_tables t ON o.table_id = t.id
      LEFT JOIN floors f ON t.floor_id = f.id
      LEFT JOIN users u ON o.cashier_id = u.id
      WHERE o.id = ?
    `).get(t);
    if (!r) return null;
    const n = e.prepare(`
      SELECT oi.*, p.sku as product_sku, v.name as variation_name
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      LEFT JOIN product_variations v ON oi.variation_id = v.id
      WHERE oi.order_id = ?
    `).all(t);
    for (const a of n)
      a.modifiers = e.prepare(`
        SELECT id, name, price_cents
        FROM order_item_modifiers
        WHERE order_item_id = ?
      `).all(a.id);
    const s = e.prepare(`
      SELECT p.*, u.display_name as cashier_name
      FROM payments p
      LEFT JOIN users u ON p.cashier_id = u.id
      WHERE p.order_id = ?
      ORDER BY p.created_at ASC
    `).all(t), i = e.prepare(`
      SELECT h.*, u.display_name as changed_by
      FROM order_status_history h
      LEFT JOIN users u ON h.changed_by_user_id = u.id
      WHERE h.order_id = ?
      ORDER BY h.created_at ASC
    `).all(t);
    return {
      ...r,
      items: n,
      payments: s,
      statusHistory: i
    };
  },
  processPayment: ({ orderId: t, branchId: e, cashierId: r, payments: n, tenderedCents: s = 0, changeCents: i = 0 }) => {
    const a = E(), o = (/* @__PURE__ */ new Date()).toISOString();
    return a.transaction(() => {
      const d = a.prepare("SELECT * FROM orders WHERE id = ?").get(t);
      if (!d) throw new Error("Order not found.");
      if (d.status === "CANCELLED") throw new Error("Cannot process payment on a cancelled order.");
      const _ = Ve(a, e || d.branch_id), p = De(a, r || d.cashier_id);
      let l = 0;
      for (const L of n)
        l += L.amountCents || 0;
      if (l <= 0)
        throw new Error("Payment amount must be greater than zero.");
      for (const L of n)
        a.prepare(`
          INSERT INTO payments (
            id, branch_id, order_id, cashier_id, payment_method,
            amount_cents, tendered_cents, change_cents, reference_number, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?)
        `).run(
          re(),
          _,
          t,
          p,
          L.paymentMethod.toUpperCase(),
          L.amountCents,
          L.paymentMethod.toUpperCase() === "CASH" ? s : L.amountCents,
          L.paymentMethod.toUpperCase() === "CASH" ? i : 0,
          L.referenceNumber || null,
          o
        );
      const T = (d.paid_cents || 0) + l, R = T >= d.total_cents, S = R ? "COMPLETED" : d.status;
      if (a.prepare(`
        UPDATE orders
        SET paid_cents = ?, status = ?, updated_at = ?
        WHERE id = ?
      `).run(T, S, o, t), a.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        re(),
        t,
        d.status,
        S,
        p,
        `Payment of $${(l / 100).toFixed(2)} received (${n.map((L) => L.paymentMethod).join(", ")})`,
        o
      ), R && d.table_id && a.prepare(`
          UPDATE dining_tables
          SET status = 'AVAILABLE', current_order_id = NULL, updated_at = ?
          WHERE id = ?
        `).run(o, d.table_id), R)
        try {
          f.deductRecipeStockForOrder(t);
        } catch (L) {
          console.warn("Recipe inventory auto-deduction failed:", L);
        }
      return we(e || d.branch_id, "PROCESS_PAYMENT", "ORDER", t, {
        orderNumber: d.order_number,
        totalPaymentCents: l,
        newPaidCents: T,
        isFullyPaid: R
      }), G.getOrderDetails(t);
    })();
  },
  holdOrder: (t) => G.createOrder({
    ...t,
    status: "DRAFT"
  }),
  getHeldOrders: (t) => E().prepare(`
      SELECT o.id, o.order_number, o.order_type, o.status, o.total_cents, o.subtotal_cents,
             o.created_at, o.notes,
             t.table_number, f.name as floor_name,
             c.name as customer_name, c.phone as customer_phone,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count
      FROM orders o
      LEFT JOIN dining_tables t ON o.table_id = t.id
      LEFT JOIN floors f ON t.floor_id = f.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE (o.branch_id = ? OR o.branch_id IS NULL) AND o.status = 'DRAFT'
      ORDER BY o.created_at DESC
    `).all(t),
  cancelOrder: (t, e, r = null) => {
    const n = E(), s = (/* @__PURE__ */ new Date()).toISOString();
    return n.transaction(() => {
      const a = n.prepare("SELECT * FROM orders WHERE id = ?").get(t);
      if (!a) throw new Error("Order not found.");
      if (a.status === "CANCELLED") throw new Error("Order is already cancelled.");
      if (!e || e.trim() === "") throw new Error("Cancellation reason is required.");
      n.prepare(`
        UPDATE orders
        SET status = 'CANCELLED', notes = COALESCE(notes || '
[Cancelled: ' || ? || ']', '[Cancelled: ' || ? || ']'), updated_at = ?
        WHERE id = ?
      `).run(e.trim(), e.trim(), s, t);
      const o = De(n, r);
      return n.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, ?, 'CANCELLED', ?, ?, ?)
      `).run(re(), t, a.status, o, `Cancelled: ${e.trim()}`, s), a.table_id && n.prepare("UPDATE dining_tables SET status = 'AVAILABLE', current_order_id = NULL, updated_at = ? WHERE id = ?").run(s, a.table_id), we(a.branch_id, "CANCEL_ORDER", "ORDER", t, {
        orderNumber: a.order_number,
        reason: e.trim()
      }), !0;
    })();
  },
  getOrders: ({ branchId: t, status: e = null, orderType: r = null, search: n = "", limit: s = 50, offset: i = 0 } = {}) => {
    const a = E();
    let o = `
      SELECT o.id, o.order_number, o.order_type, o.status, o.total_cents, o.paid_cents,
             o.discount_cents, o.tax_cents, o.created_at, o.notes,
             t.table_number, f.name as floor_name,
             c.name as customer_name, c.phone as customer_phone,
             u.display_name as cashier_name,
             (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count
      FROM orders o
      LEFT JOIN dining_tables t ON o.table_id = t.id
      LEFT JOIN floors f ON t.floor_id = f.id
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN users u ON o.cashier_id = u.id
      WHERE (o.branch_id = ? OR o.branch_id IS NULL)
    `;
    const c = [t];
    if (e && e !== "ALL" && (o += " AND o.status = ?", c.push(e)), r && r !== "ALL" && (o += " AND o.order_type = ?", c.push(r)), n && n.trim() !== "") {
      o += " AND (o.order_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR t.table_number LIKE ?)";
      const d = `%${n.trim()}%`;
      c.push(d, d, d, d);
    }
    return o += " ORDER BY o.created_at DESC LIMIT ? OFFSET ?", c.push(s, i), a.prepare(o).all(...c);
  },
  getRecentOrders: (t, e = 20) => G.getOrders({ branchId: t, limit: e })
};
function gt() {
  u.handle(q.DB_STATUS, async () => {
    try {
      const t = E(), e = t.prepare("SELECT MAX(version) as version FROM schema_migrations").get(), r = t.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count, n = t.prepare("PRAGMA foreign_keys").get(), s = t.prepare("PRAGMA journal_mode").get(), i = t.prepare("PRAGMA integrity_check").get(), a = t.prepare("SELECT id, name, code, currency_symbol FROM branches LIMIT 1").get(), o = t.prepare("SELECT count(*) as count FROM products WHERE is_active = 1").get().count, c = t.prepare("SELECT count(*) as count FROM dining_tables WHERE is_active = 1").get().count, d = t.prepare("SELECT count(*) as count FROM orders").get().count;
      return {
        initialized: !0,
        driver: "better-sqlite3",
        schemaVersion: (e == null ? void 0 : e.version) || 1,
        tablesCount: r,
        databasePath: Ye(),
        foreignKeys: n.foreign_keys === 1,
        journalMode: s.journal_mode,
        integrity: i.integrity_check,
        branch: a,
        stats: {
          products: o,
          tables: c,
          orders: d
        }
      };
    } catch (t) {
      return console.error("[IPC db:status] Error:", t), {
        initialized: !1,
        error: t.message
      };
    }
  }), u.handle("db:get-settings", async () => he.getAll()), u.handle("db:get-categories", async (t, e) => {
    var s;
    const r = E(), n = e || ((s = r.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : s.id);
    return P.getCategories(n);
  }), u.handle("db:get-products", async (t, { branchId: e, categoryId: r, searchQuery: n }) => {
    var a;
    const s = E(), i = e || ((a = s.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : a.id);
    return P.getProducts(i, r, n);
  }), u.handle("db:get-tables", async (t, e) => {
    var s;
    const r = E(), n = e || ((s = r.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : s.id);
    return te.getFloorsWithTables(n);
  }), u.handle("db:create-order", async (t, e) => {
    var s;
    const r = E(), n = e.branchId || ((s = r.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : s.id);
    return G.createOrder({
      ...e,
      branchId: n
    });
  }), u.handle("db:get-recent-orders", async (t, { branchId: e, limit: r } = {}) => {
    var i;
    const n = E(), s = e || ((i = n.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : i.id);
    return G.getRecentOrders(s, r || 20);
  }), u.handle(q.DB_BACKUP, async (t, e) => tt(e)), u.handle(q.DB_RESTORE, async (t, e) => At(e));
}
function yt(t) {
  const e = /* @__PURE__ */ new Date();
  let r = /* @__PURE__ */ new Date();
  if (t === "yesterday") {
    r.setDate(e.getDate() - 1), r.setHours(0, 0, 0, 0);
    const n = new Date(r);
    return n.setHours(23, 59, 59, 999), { startIso: r.toISOString(), endIso: n.toISOString() };
  } else t === "this_week" ? (r.setDate(e.getDate() - 7), r.setHours(0, 0, 0, 0)) : (t === "this_month" && r.setDate(1), r.setHours(0, 0, 0, 0));
  return { startIso: r.toISOString(), endIso: e.toISOString() };
}
const ft = {
  getMetrics: (t, e = "today") => {
    const r = E(), { startIso: n, endIso: s } = yt(e), i = r.prepare(`
      SELECT 
        COUNT(id) as total_orders,
        COALESCE(SUM(total_cents), 0) as gross_sales_cents,
        COALESCE(SUM(discount_cents), 0) as total_discounts_cents,
        COALESCE(SUM(tax_cents), 0) as total_tax_cents,
        COALESCE(SUM(service_charge_cents), 0) as total_service_cents,
        COALESCE(SUM(delivery_charge_cents), 0) as total_delivery_cents
      FROM orders
      WHERE branch_id = ?
        AND created_at >= ? AND created_at <= ?
        AND status NOT IN ('DRAFT', 'CANCELLED')
    `).get(t, n, s), a = i.total_orders || 0, o = i.gross_sales_cents || 0, c = a > 0 ? Math.round(o / a) : 0, d = r.prepare(`
      SELECT order_type, COUNT(id) as count, COALESCE(SUM(total_cents), 0) as total_cents
      FROM orders
      WHERE branch_id = ?
        AND created_at >= ? AND created_at <= ?
        AND status NOT IN ('CANCELLED')
      GROUP BY order_type
    `).all(t, n, s), _ = {
      DINE_IN: { count: 0, totalCents: 0 },
      TAKEAWAY: { count: 0, totalCents: 0 },
      DELIVERY: { count: 0, totalCents: 0 }
    };
    for (const C of d)
      _[C.order_type] && (_[C.order_type] = { count: C.count, totalCents: C.total_cents });
    const p = r.prepare(`
      SELECT status, COUNT(id) as count
      FROM orders
      WHERE branch_id = ?
        AND created_at >= ? AND created_at <= ?
      GROUP BY status
    `).all(t, n, s), l = {};
    for (const C of p)
      l[C.status] = C.count;
    const T = r.prepare(`
      SELECT payment_method, COALESCE(SUM(amount_cents), 0) as total_cents, COUNT(id) as count
      FROM payments
      WHERE branch_id = ?
        AND created_at >= ? AND created_at <= ?
        AND status = 'COMPLETED'
      GROUP BY payment_method
    `).all(t, n, s), R = {};
    for (const C of T)
      R[C.payment_method] = { totalCents: C.total_cents, count: C.count };
    const S = r.prepare(`
      SELECT p.id, p.name, c.name as category_name,
             SUM(oi.quantity) as total_quantity,
             SUM(oi.total_cents) as total_revenue_cents
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN products p ON oi.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE o.branch_id = ?
        AND o.created_at >= ? AND o.created_at <= ?
        AND o.status NOT IN ('CANCELLED')
      GROUP BY p.id
      ORDER BY total_quantity DESC
      LIMIT 5
    `).all(t, n, s), L = r.prepare(`
      SELECT i.id, i.name, i.sku, i.current_stock, i.minimum_level, u.abbreviation as unit
      FROM inventory_items i
      JOIN inventory_units u ON i.unit_id = u.id
      WHERE i.branch_id = ?
        AND i.is_active = 1
        AND i.current_stock <= i.minimum_level
      ORDER BY i.current_stock ASC
      LIMIT 6
    `).all(t), A = r.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) as total_cents
      FROM expenses
      WHERE branch_id = ?
        AND expense_date >= ? AND expense_date <= ?
    `).get(t, n.slice(0, 10), s.slice(0, 10)), b = (A == null ? void 0 : A.total_cents) || 0, U = r.prepare(`
      SELECT id, user_id, opening_balance_cents, opened_at, status
      FROM cash_sessions
      WHERE branch_id = ? AND status = 'OPEN'
      ORDER BY opened_at DESC
      LIMIT 1
    `).get(t);
    return {
      rangeType: e,
      bounds: { start: n, end: s },
      sales: {
        grossSalesCents: o,
        discountCents: i.total_discounts_cents || 0,
        taxCents: i.total_tax_cents || 0,
        netSalesCents: o - (i.total_discounts_cents || 0),
        totalOrders: a,
        avgOrderCents: c
      },
      ordersByType: _,
      statusCounts: l,
      paymentsByMethod: R,
      topProducts: S,
      lowStockItems: L,
      expenses: {
        totalExpenseCents: b
      },
      cashSession: U || null
    };
  }
};
function bt() {
  u.handle(q.AUTH_LOGIN, async (t, e) => {
    try {
      if (e.pin)
        return O.loginWithPin(e.pin, e.userId, e.username);
      if (e.username && e.password)
        return O.loginWithPassword(e.username, e.password);
      throw new Error("Must provide PIN or username and password.");
    } catch (r) {
      throw console.error("[IPC auth:login] Error:", r.message), r;
    }
  }), u.handle(q.AUTH_LOGOUT, async () => O.logout()), u.handle(q.AUTH_CURRENT_USER, async () => O.getCurrentSession()), u.handle("auth:get-login-users", async () => O.getLoginUsers()), u.handle("dashboard:get-metrics", async (t, { branchId: e, rangeType: r } = {}) => {
    var n;
    try {
      const s = E(), i = O.getCurrentSession(), a = e || (i == null ? void 0 : i.branchId) || ((n = s.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : n.id);
      return ft.getMetrics(a, r || "today");
    } catch (s) {
      throw console.error("[IPC dashboard:get-metrics] Error:", s.message), s;
    }
  });
}
function oe(t) {
  var n;
  if (t) return t;
  const e = O.getCurrentSession();
  return e != null && e.branchId ? e.branchId : (n = E().prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : n.id;
}
function K(t) {
  var r;
  const e = O.getCurrentSession();
  if (e && e.roleCode !== "super_admin" && !((r = e.permissions) != null && r.includes(t)))
    throw new Error(`Unauthorized: Requires '${t}' permission.`);
}
function vt() {
  u.handle("product:get-categories", async (t, e) => P.getCategories(oe(e))), u.handle("product:create-category", async (t, e) => (K("menu:manage"), P.createCategory({
    ...e,
    branchId: oe(e.branchId)
  }))), u.handle("product:update-category", async (t, { id: e, ...r }) => (K("menu:manage"), P.updateCategory(e, r))), u.handle("product:delete-category", async (t, e) => (K("menu:manage"), P.deleteCategory(e))), u.handle("product:get-products", async (t, { branchId: e, categoryId: r, searchQuery: n, includeInactive: s } = {}) => P.getProducts(oe(e), r, n, s)), u.handle("product:get-product-details", async (t, e) => P.getProductDetails(e)), u.handle("product:create-product", async (t, e) => (K("menu:manage"), P.createProduct({
    ...e,
    branchId: oe(e.branchId)
  }))), u.handle("product:update-product", async (t, { id: e, ...r }) => (K("menu:manage"), P.updateProduct(e, {
    ...r,
    branchId: oe(r.branchId)
  }))), u.handle("product:toggle-availability", async (t, { id: e, isAvailable: r }) => (K("menu:manage"), P.toggleProductAvailability(e, r))), u.handle("product:archive-product", async (t, e) => (K("menu:manage"), P.archiveProduct(e))), u.handle("product:get-combos", async (t, e) => P.getCombos(oe(e))), u.handle("product:create-combo", async (t, e) => (K("menu:manage"), P.createCombo({
    ...e,
    branchId: oe(e.branchId)
  }))), u.handle("product:update-combo", async (t, { id: e, ...r }) => (K("menu:manage"), P.updateCombo(e, r))), u.handle("product:toggle-combo-availability", async (t, { id: e, isAvailable: r }) => (K("menu:manage"), P.toggleComboAvailability(e, r))), u.handle("product:archive-combo", async (t, e) => (K("menu:manage"), P.archiveCombo(e)));
}
function Le(t) {
  var n;
  if (t) return t;
  const e = O.getCurrentSession();
  return e != null && e.branchId ? e.branchId : (n = E().prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : n.id;
}
function ge(t) {
  var r;
  const e = O.getCurrentSession();
  if (e && e.roleCode !== "super_admin" && !((r = e.permissions) != null && r.includes(t)))
    throw new Error(`Unauthorized: Requires '${t}' permission.`);
}
function Dt() {
  u.handle("pos:create-order", async (t, e) => {
    ge("pos:create_order");
    const r = Le(e.branchId), n = O.getCurrentSession();
    return G.createOrder({
      ...e,
      branchId: r,
      cashierId: e.cashierId || (n == null ? void 0 : n.id) || null
    });
  }), u.handle("pos:get-order", async (t, e) => G.getOrderDetails(e)), u.handle("pos:process-payment", async (t, e) => {
    ge("pos:create_order");
    const r = Le(e.branchId), n = O.getCurrentSession();
    return G.processPayment({
      ...e,
      branchId: r,
      cashierId: e.cashierId || (n == null ? void 0 : n.id) || null
    });
  }), u.handle("pos:hold-order", async (t, e) => {
    ge("pos:create_order");
    const r = Le(e.branchId), n = O.getCurrentSession();
    return G.holdOrder({
      ...e,
      branchId: r,
      cashierId: e.cashierId || (n == null ? void 0 : n.id) || null
    });
  }), u.handle("pos:get-held-orders", async (t, e) => G.getHeldOrders(Le(e))), u.handle("pos:cancel-order", async (t, { orderId: e, reason: r }) => {
    ge("pos:create_order");
    const n = O.getCurrentSession();
    return G.cancelOrder(e, r, (n == null ? void 0 : n.id) || null);
  }), u.handle("pos:get-orders", async (t, e = {}) => G.getOrders({
    ...e,
    branchId: Le(e.branchId)
  }));
}
function Xe(t) {
  var n;
  if (t) return t;
  const e = O.getCurrentSession();
  return e != null && e.branchId ? e.branchId : (n = E().prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : n.id;
}
function ce(t) {
  var r;
  const e = O.getCurrentSession();
  if (e && e.roleCode !== "super_admin" && !((r = e.permissions) != null && r.includes(t)))
    throw new Error(`Unauthorized: Requires '${t}' permission.`);
}
function Ut() {
  u.handle("table:get-floors-tables", async (t, e) => te.getFloorsWithTables(Xe(e))), u.handle("table:update-status", async (t, { tableId: e, status: r, currentOrderId: n }) => (ce("pos:create_order"), te.updateTableStatus(e, r, n))), u.handle("table:transfer-table", async (t, e) => (ce("pos:create_order"), te.transferTable(e))), u.handle("table:create-floor", async (t, e) => {
    ce("settings:manage");
    const r = Xe(e.branchId);
    return te.createFloor({ ...e, branchId: r });
  }), u.handle("table:update-floor", async (t, { id: e, ...r }) => (ce("settings:manage"), te.updateFloor(e, r))), u.handle("table:create-table", async (t, e) => {
    ce("settings:manage");
    const r = Xe(e.branchId);
    return te.createTable({ ...e, branchId: r });
  }), u.handle("table:update-table", async (t, { id: e, ...r }) => (ce("settings:manage"), te.updateTable(e, r))), u.handle("table:archive-table", async (t, e) => (ce("settings:manage"), te.archiveTable(e)));
}
function Ge() {
  return v.randomUUID();
}
function Ie(t, e) {
  if (e) {
    const s = t.prepare("SELECT id FROM branches WHERE id = ?").get(e);
    if (s) return s.id;
  }
  const r = O.getCurrentSession();
  if (r != null && r.branchId) {
    const s = t.prepare("SELECT id FROM branches WHERE id = ?").get(r.branchId);
    if (s) return s.id;
  }
  const n = t.prepare("SELECT id FROM branches LIMIT 1").get();
  return (n == null ? void 0 : n.id) || null;
}
function Ft(t, e) {
  const r = O.getCurrentSession();
  if (r != null && r.id) {
    const s = t.prepare("SELECT id FROM users WHERE id = ?").get(r.id);
    if (s) return s.id;
  }
  const n = t.prepare("SELECT id FROM users WHERE is_active = 1 LIMIT 1").get();
  return (n == null ? void 0 : n.id) || null;
}
function He(t, e, r, n, s) {
  try {
    const i = E(), a = Ft(i, null), o = Ie(i, t);
    i.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Ge(),
      o,
      a,
      e,
      r,
      n,
      JSON.stringify(s),
      (/* @__PURE__ */ new Date()).toISOString()
    );
  } catch (i) {
    console.error("[Customer Audit Log Error]:", i);
  }
}
const se = {
  getCustomers: (t, e = "", r = 50, n = null) => {
    const s = E(), i = Ie(s, t);
    let a = `
      SELECT id, branch_id, name, phone, email, address, tag,
             credit_balance_cents, loyalty_points, order_count, total_spent_cents,
             notes, birth_date, is_active, created_at, updated_at
      FROM customers
      WHERE (branch_id = ? OR branch_id IS NULL)
    `;
    const o = [i];
    if (n && n !== "ALL" && (a += " AND tag = ?", o.push(n)), e && e.trim() !== "") {
      a += " AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)";
      const c = `%${e.trim()}%`;
      o.push(c, c, c);
    }
    return a += " ORDER BY name ASC LIMIT ?", o.push(r), s.prepare(a).all(...o);
  },
  getCustomerById: (t) => {
    const e = E(), r = e.prepare("SELECT * FROM customers WHERE id = ?").get(t);
    if (!r) return null;
    const n = e.prepare(`
      SELECT id, order_number, order_type, total_cents, status, created_at
      FROM orders
      WHERE customer_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(t), s = e.prepare(`
      SELECT * FROM loyalty_transactions
      WHERE customer_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(t);
    return { ...r, recentOrders: n, loyaltyHistory: s };
  },
  createCustomer: ({ branchId: t, name: e, phone: r, email: n, address: s, tag: i = "REGULAR", birthDate: a = null, notes: o = null }) => {
    const c = E(), d = Ie(c, t), _ = (/* @__PURE__ */ new Date()).toISOString(), p = Ge();
    if (r && r.trim() !== "") {
      const l = c.prepare("SELECT id, name FROM customers WHERE phone = ?").get(r.trim());
      if (l)
        throw new Error(`Customer with phone "${r.trim()}" already exists (${l.name}).`);
    }
    return c.prepare(`
      INSERT INTO customers (
        id, branch_id, name, phone, email, address, tag, birth_date,
        notes, loyalty_points, credit_balance_cents, total_spent_cents,
        order_count, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 1, ?, ?)
    `).run(
      p,
      d,
      e.trim(),
      r ? r.trim() : null,
      n ? n.trim() : null,
      s ? s.trim() : null,
      i || "REGULAR",
      a || null,
      o ? o.trim() : null,
      _,
      _
    ), He(d, "CREATE_CUSTOMER", "CUSTOMER", p, { name: e, phone: r, tag: i }), se.getCustomerById(p);
  },
  updateCustomer: (t, { name: e, phone: r, email: n, address: s, tag: i, birthDate: a, notes: o, isActive: c }) => {
    const d = E(), _ = d.prepare("SELECT * FROM customers WHERE id = ?").get(t);
    if (!_) throw new Error("Customer not found.");
    if (r && r.trim() !== "" && r.trim() !== _.phone) {
      const l = d.prepare("SELECT id, name FROM customers WHERE phone = ? AND id != ?").get(r.trim(), t);
      if (l)
        throw new Error(`Another customer with phone "${r.trim()}" already exists (${l.name}).`);
    }
    const p = (/* @__PURE__ */ new Date()).toISOString();
    return d.prepare(`
      UPDATE customers
      SET name = ?,
          phone = ?,
          email = ?,
          address = ?,
          tag = ?,
          birth_date = ?,
          notes = ?,
          is_active = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      e !== void 0 ? e.trim() : _.name,
      r !== void 0 ? r ? r.trim() : null : _.phone,
      n !== void 0 ? n ? n.trim() : null : _.email,
      s !== void 0 ? s ? s.trim() : null : _.address,
      i !== void 0 ? i : _.tag,
      a !== void 0 ? a : _.birth_date,
      o !== void 0 ? o ? o.trim() : null : _.notes,
      c !== void 0 ? c ? 1 : 0 : _.is_active,
      p,
      t
    ), He(_.branch_id, "UPDATE_CUSTOMER", "CUSTOMER", t, { name: e, phone: r, tag: i }), se.getCustomerById(t);
  },
  /**
   * Adjust or award/redeem loyalty points
   */
  adjustLoyaltyPoints: ({ customerId: t, branchId: e, orderId: r = null, pointsChanged: n, transactionType: s = "ADJUSTMENT", notes: i = null }) => {
    const a = E(), o = Ie(a, e);
    return a.transaction(() => {
      const d = a.prepare("SELECT * FROM customers WHERE id = ?").get(t);
      if (!d) throw new Error("Customer not found.");
      const _ = d.loyalty_points || 0, p = parseInt(n, 10) || 0, l = Math.max(0, _ + p), T = Ge(), R = (/* @__PURE__ */ new Date()).toISOString();
      return a.prepare(`
        INSERT INTO loyalty_transactions (
          id, customer_id, branch_id, order_id, points_changed,
          transaction_type, balance_after, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        T,
        t,
        o,
        r,
        p,
        s.toUpperCase(),
        l,
        i || `Points ${p >= 0 ? "earned" : "redeemed"}`,
        R
      ), a.prepare("UPDATE customers SET loyalty_points = ?, updated_at = ? WHERE id = ?").run(l, R, t), He(o, "ADJUST_LOYALTY_POINTS", "CUSTOMER", t, {
        pointsChanged: p,
        balanceAfter: l,
        transactionType: s
      }), {
        customerId: t,
        pointsChanged: p,
        balanceAfter: l
      };
    })();
  },
  /**
   * Get CRM Analytics Summary
   */
  getCrmSummary: (t) => {
    const e = E(), r = Ie(e, t);
    return e.prepare(`
      SELECT COUNT(*) as total_customers,
             COALESCE(SUM(total_spent_cents), 0) as total_revenue_cents,
             COALESCE(SUM(order_count), 0) as total_orders,
             COALESCE(SUM(loyalty_points), 0) as total_active_points,
             COUNT(CASE WHEN tag = 'VIP' THEN 1 END) as vip_count,
             COUNT(CASE WHEN tag = 'REGULAR' THEN 1 END) as regular_count,
             COUNT(CASE WHEN tag = 'CORPORATE' THEN 1 END) as corporate_count
      FROM customers
      WHERE branch_id = ? OR branch_id IS NULL
    `).get(r);
  }
};
function rt() {
  return v.randomUUID();
}
function Ue(t, e) {
  if (e) {
    const s = t.prepare("SELECT id FROM branches WHERE id = ?").get(e);
    if (s) return s.id;
  }
  const r = O.getCurrentSession();
  if (r != null && r.branchId) {
    const s = t.prepare("SELECT id FROM branches WHERE id = ?").get(r.branchId);
    if (s) return s.id;
  }
  const n = t.prepare("SELECT id FROM branches LIMIT 1").get();
  return (n == null ? void 0 : n.id) || null;
}
function Mt(t, e) {
  const r = O.getCurrentSession();
  if (r != null && r.id) {
    const s = t.prepare("SELECT id FROM users WHERE id = ?").get(r.id);
    if (s) return s.id;
  }
  const n = t.prepare("SELECT id FROM users WHERE is_active = 1 LIMIT 1").get();
  return (n == null ? void 0 : n.id) || null;
}
function Ze(t, e, r, n, s) {
  try {
    const i = E(), a = Mt(i, null), o = Ue(i, t);
    i.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      rt(),
      o,
      a,
      e,
      r,
      n,
      JSON.stringify(s),
      (/* @__PURE__ */ new Date()).toISOString()
    );
  } catch (i) {
    console.error("[Reservation Audit Log Error]:", i);
  }
}
const Re = {
  /**
   * Get list of reservations
   */
  getReservations: ({ branchId: t, date: e = null, status: r = null, search: n = "" } = {}) => {
    const s = E(), i = Ue(s, t);
    let a = `
      SELECT r.*,
             t.table_number, t.capacity as table_capacity,
             f.name as floor_name,
             c.tag as customer_tag, c.email as customer_email, c.loyalty_points
      FROM reservations r
      LEFT JOIN dining_tables t ON r.table_id = t.id
      LEFT JOIN floors f ON t.floor_id = f.id
      LEFT JOIN customers c ON r.customer_id = c.id
      WHERE r.branch_id = ?
    `;
    const o = [i];
    if (e && (a += " AND (r.reservation_date = ? OR r.reservation_time LIKE ?)", o.push(e, `${e}%`)), r && r !== "ALL" && (a += " AND r.status = ?", o.push(r)), n && n.trim() !== "") {
      a += " AND (r.customer_name LIKE ? OR r.customer_phone LIKE ? OR t.table_number LIKE ?)";
      const c = `%${n.trim()}%`;
      o.push(c, c, c);
    }
    return a += " ORDER BY r.reservation_date ASC, r.reservation_time ASC", s.prepare(a).all(...o);
  },
  /**
   * Get single reservation by ID
   */
  getReservationById: (t) => E().prepare(`
      SELECT r.*,
             t.table_number, t.capacity as table_capacity,
             f.name as floor_name,
             c.tag as customer_tag, c.email as customer_email
      FROM reservations r
      LEFT JOIN dining_tables t ON r.table_id = t.id
      LEFT JOIN floors f ON t.floor_id = f.id
      LEFT JOIN customers c ON r.customer_id = c.id
      WHERE r.id = ?
    `).get(t),
  /**
   * Create new reservation with double-booking prevention
   */
  createReservation: (t) => {
    const e = E(), r = Ue(e, t.branchId), n = rt(), s = (/* @__PURE__ */ new Date()).toISOString();
    return e.transaction(() => {
      const a = t.reservationDate || t.reservationTime.slice(0, 10), o = t.reservationTime, c = t.durationMinutes || 90;
      if (t.tableId) {
        const l = e.prepare(`
          SELECT id, customer_name, reservation_time, duration_minutes
          FROM reservations
          WHERE table_id = ? AND (reservation_date = ? OR reservation_time LIKE ?)
            AND status IN ('CONFIRMED', 'PENDING', 'SEATED')
        `).all(t.tableId, a, `${a}%`);
        for (const T of l) {
          const R = new Date(T.reservation_time).getTime(), S = new Date(o).getTime();
          if (!isNaN(R) && !isNaN(S)) {
            const L = R + (T.duration_minutes || 90) * 60 * 1e3, A = S + c * 60 * 1e3;
            if (S < L && A > R) {
              const b = e.prepare("SELECT table_number FROM dining_tables WHERE id = ?").get(t.tableId);
              throw new Error(
                `Table ${(b == null ? void 0 : b.table_number) || ""} is already booked by "${T.customer_name}" during this time window.`
              );
            }
          }
        }
      }
      let d = t.customerId || null;
      if (!d && t.customerPhone) {
        const l = e.prepare("SELECT id FROM customers WHERE phone = ?").get(t.customerPhone.trim());
        l && (d = l.id);
      }
      const _ = t.status || "CONFIRMED";
      e.prepare(`
        INSERT INTO reservations (
          id, branch_id, customer_id, table_id, customer_name, customer_phone,
          party_size, reservation_date, reservation_time, duration_minutes,
          status, deposit_cents, deposit_payment_method, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        n,
        r,
        d,
        t.tableId || null,
        t.customerName.trim(),
        t.customerPhone.trim(),
        parseInt(t.partySize, 10) || 2,
        a,
        o,
        c,
        _,
        Math.max(0, parseInt(t.depositCents, 10) || 0),
        t.depositPaymentMethod || null,
        t.notes || null,
        s,
        s
      );
      const p = s.slice(0, 10);
      return a === p && t.tableId && _ === "CONFIRMED" && e.prepare("UPDATE dining_tables SET status = 'RESERVED', updated_at = ? WHERE id = ? AND status = 'AVAILABLE'").run(s, t.tableId), Ze(r, "CREATE_RESERVATION", "RESERVATION", n, {
        customerName: t.customerName,
        partySize: t.partySize,
        reservationDate: a,
        tableId: t.tableId
      }), Re.getReservationById(n);
    })();
  },
  /**
   * Update reservation status (Seated, Cancelled, Completed, No-Show)
   */
  updateReservationStatus: (t, e) => {
    const r = E(), n = r.prepare("SELECT * FROM reservations WHERE id = ?").get(t);
    if (!n) throw new Error("Reservation not found.");
    const s = (/* @__PURE__ */ new Date()).toISOString(), i = e.toUpperCase();
    return r.transaction(() => (r.prepare("UPDATE reservations SET status = ?, updated_at = ? WHERE id = ?").run(i, s, t), n.table_id && (i === "SEATED" ? r.prepare("UPDATE dining_tables SET status = 'OCCUPIED', updated_at = ? WHERE id = ?").run(s, n.table_id) : ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(i) && r.prepare(`
            UPDATE dining_tables
            SET status = 'AVAILABLE', updated_at = ?
            WHERE id = ? AND status = 'RESERVED'
          `).run(s, n.table_id)), Ze(n.branch_id, `RESERVATION_${i}`, "RESERVATION", t, {
      previousStatus: n.status,
      newStatus: i
    }), Re.getReservationById(t)))();
  },
  /**
   * Check Table Availability for a given date, time and party size
   */
  checkAvailability: ({ branchId: t, date: e, time: r, partySize: n, durationMinutes: s = 90 }) => {
    const i = E(), a = Ue(i, t), o = parseInt(n, 10) || 1, c = (/* @__PURE__ */ new Date(`${e}T${r}`)).getTime(), d = c + s * 60 * 1e3, _ = i.prepare(`
      SELECT t.*, f.name as floor_name
      FROM dining_tables t
      JOIN floors f ON t.floor_id = f.id
      WHERE t.branch_id = ? AND t.is_active = 1 AND t.capacity >= ?
      ORDER BY t.capacity ASC, t.table_number ASC
    `).all(a, o), p = i.prepare(`
      SELECT table_id, reservation_time, duration_minutes
      FROM reservations
      WHERE branch_id = ? AND (reservation_date = ? OR reservation_time LIKE ?)
        AND status IN ('CONFIRMED', 'PENDING', 'SEATED') AND table_id IS NOT NULL
    `).all(a, e, `${e}%`), l = /* @__PURE__ */ new Set();
    for (const T of p) {
      const R = new Date(T.reservation_time).getTime();
      if (!isNaN(R) && !isNaN(c)) {
        const S = R + (T.duration_minutes || 90) * 60 * 1e3;
        c < S && d > R && l.add(T.table_id);
      }
    }
    return _.map((T) => ({
      ...T,
      isAvailable: !l.has(T.id)
    }));
  }
};
function Pt() {
  return v.randomUUID();
}
function We(t, e) {
  if (e) {
    const s = t.prepare("SELECT id FROM branches WHERE id = ?").get(e);
    if (s) return s.id;
  }
  const r = O.getCurrentSession();
  if (r != null && r.branchId) {
    const s = t.prepare("SELECT id FROM branches WHERE id = ?").get(r.branchId);
    if (s) return s.id;
  }
  const n = t.prepare("SELECT id FROM branches LIMIT 1").get();
  return (n == null ? void 0 : n.id) || null;
}
const ye = {
  getCoupons: (t) => {
    const e = E(), r = We(e, t);
    return e.prepare(`
      SELECT * FROM coupons
      WHERE branch_id = ? OR branch_id IS NULL
      ORDER BY is_active DESC, created_at DESC
    `).all(r);
  },
  createCoupon: (t) => {
    const e = E(), r = We(e, t.branchId), n = Pt(), s = (/* @__PURE__ */ new Date()).toISOString(), i = t.code.trim().toUpperCase();
    if (e.prepare("SELECT id FROM coupons WHERE code = ?").get(i)) throw new Error(`Coupon code "${i}" already exists.`);
    return e.prepare(`
      INSERT INTO coupons (
        id, branch_id, code, title, discount_type, discount_value,
        min_order_cents, max_discount_cents, start_date, end_date,
        usage_limit, times_used, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(
      n,
      r,
      i,
      t.title.trim(),
      t.discountType || "PERCENTAGE",
      parseInt(t.discountValue, 10) || 10,
      Math.max(0, parseInt(t.minOrderCents, 10) || 0),
      t.maxDiscountCents ? parseInt(t.maxDiscountCents, 10) : null,
      t.startDate || null,
      t.endDate || null,
      parseInt(t.usageLimit, 10) || 0,
      t.isActive !== !1 ? 1 : 0,
      s,
      s
    ), e.prepare("SELECT * FROM coupons WHERE id = ?").get(n);
  },
  updateCoupon: (t, e) => {
    const r = E(), n = r.prepare("SELECT * FROM coupons WHERE id = ?").get(t);
    if (!n) throw new Error("Coupon not found.");
    const s = (/* @__PURE__ */ new Date()).toISOString();
    return r.prepare(`
      UPDATE coupons
      SET title = ?,
          discount_type = ?,
          discount_value = ?,
          min_order_cents = ?,
          max_discount_cents = ?,
          start_date = ?,
          end_date = ?,
          usage_limit = ?,
          is_active = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      e.title !== void 0 ? e.title.trim() : n.title,
      e.discountType !== void 0 ? e.discountType : n.discount_type,
      e.discountValue !== void 0 ? parseInt(e.discountValue, 10) : n.discount_value,
      e.minOrderCents !== void 0 ? parseInt(e.minOrderCents, 10) : n.min_order_cents,
      e.maxDiscountCents !== void 0 ? e.maxDiscountCents ? parseInt(e.maxDiscountCents, 10) : null : n.max_discount_cents,
      e.startDate !== void 0 ? e.startDate : n.start_date,
      e.endDate !== void 0 ? e.endDate : n.end_date,
      e.usageLimit !== void 0 ? parseInt(e.usageLimit, 10) : n.usage_limit,
      e.isActive !== void 0 ? e.isActive ? 1 : 0 : n.is_active,
      s,
      t
    ), r.prepare("SELECT * FROM coupons WHERE id = ?").get(t);
  },
  /**
   * Validate coupon and calculate discount amount
   */
  validateCoupon: ({ branchId: t, code: e, orderTotalCents: r = 0 }) => {
    const n = E(), s = We(n, t), i = (e || "").trim().toUpperCase(), a = n.prepare(`
      SELECT * FROM coupons
      WHERE code = ? AND (branch_id = ? OR branch_id IS NULL)
    `).get(i, s);
    if (!a)
      throw new Error(`Invalid promo code "${i}".`);
    if (!a.is_active)
      throw new Error(`Promo code "${i}" is no longer active.`);
    const o = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    if (a.start_date && o < a.start_date)
      throw new Error(`Promo code "${i}" is not active yet (starts ${a.start_date}).`);
    if (a.end_date && o > a.end_date)
      throw new Error(`Promo code "${i}" has expired (ended ${a.end_date}).`);
    if (a.usage_limit > 0 && a.times_used >= a.usage_limit)
      throw new Error(`Promo code "${i}" has reached its maximum usage limit.`);
    if (r < a.min_order_cents) {
      const d = (a.min_order_cents / 100).toFixed(2);
      throw new Error(`Coupon "${i}" requires a minimum spend of $${d}.`);
    }
    let c = 0;
    return a.discount_type === "PERCENTAGE" ? (c = Math.round(r * a.discount_value / 100), a.max_discount_cents && c > a.max_discount_cents && (c = a.max_discount_cents)) : c = Math.min(r, a.discount_value), {
      valid: !0,
      code: a.code,
      title: a.title,
      discountType: a.discount_type,
      discountCents: c,
      coupon: a
    };
  }
};
function j(t) {
  var n;
  if (t) return t;
  const e = O.getCurrentSession();
  return e != null && e.branchId ? e.branchId : (n = E().prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : n.id;
}
function wt() {
  u.handle("customer:get-customers", async (t, e = {}) => se.getCustomers(
    j(e.branchId),
    e.searchQuery,
    e.limit,
    e.tag
  )), u.handle("customer:get-details", async (t, e) => se.getCustomerById(e)), u.handle("customer:create", async (t, e) => {
    const r = j(e.branchId);
    return se.createCustomer({
      ...e,
      branchId: r
    });
  }), u.handle("customer:update", async (t, { id: e, data: r }) => se.updateCustomer(e, r || {})), u.handle("customer:adjust-loyalty", async (t, e) => {
    const r = j(e.branchId);
    return se.adjustLoyaltyPoints({ ...e, branchId: r });
  }), u.handle("customer:get-summary", async (t, e) => se.getCrmSummary(j(e))), u.handle("reservation:get-reservations", async (t, e = {}) => {
    const r = j(e.branchId);
    return Re.getReservations({ ...e, branchId: r });
  }), u.handle("reservation:create", async (t, e) => {
    const r = j(e.branchId);
    return Re.createReservation({ ...e, branchId: r });
  }), u.handle("reservation:update-status", async (t, { id: e, status: r }) => Re.updateReservationStatus(e, r)), u.handle("reservation:check-availability", async (t, e = {}) => {
    const r = j(e.branchId);
    return Re.checkAvailability({ ...e, branchId: r });
  }), u.handle("coupon:get-coupons", async (t, e) => ye.getCoupons(j(e))), u.handle("coupon:create", async (t, e) => {
    const r = j(e.branchId);
    return ye.createCoupon({ ...e, branchId: r });
  }), u.handle("coupon:update", async (t, { id: e, data: r }) => ye.updateCoupon(e, r)), u.handle("coupon:validate", async (t, e) => {
    const r = j(e.branchId);
    return ye.validateCoupon({ ...e, branchId: r });
  });
}
function Se() {
  return v.randomUUID();
}
const de = {
  /**
   * Retrieve active kitchen stations for a branch
   */
  getStations: (t) => {
    var n;
    const e = E(), r = t || ((n = e.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : n.id);
    return e.prepare(`
      SELECT * FROM kitchen_stations
      WHERE branch_id = ? AND is_active = 1
      ORDER BY display_order ASC, name ASC
    `).all(r);
  },
  /**
   * Create a new kitchen station
   */
  createStation: (t) => {
    var i;
    const e = E(), r = t.id || Se(), n = (/* @__PURE__ */ new Date()).toISOString(), s = t.branchId || ((i = e.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : i.id);
    return e.prepare(`
      INSERT INTO kitchen_stations (id, branch_id, name, code, color_code, display_order, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      r,
      s,
      t.name,
      (t.code || t.name.slice(0, 5)).toUpperCase(),
      t.colorCode || "#f97316",
      t.displayOrder || 0,
      n
    ), e.prepare("SELECT * FROM kitchen_stations WHERE id = ?").get(r);
  },
  /**
   * Update an existing kitchen station
   */
  updateStation: (t, e) => {
    const r = E();
    if (!r.prepare("SELECT * FROM kitchen_stations WHERE id = ?").get(t)) throw new Error(`Kitchen station with ID "${t}" not found.`);
    return r.prepare(`
      UPDATE kitchen_stations
      SET name = COALESCE(?, name),
          code = COALESCE(?, code),
          color_code = COALESCE(?, color_code),
          display_order = COALESCE(?, display_order),
          is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).run(
      e.name ?? null,
      e.code ? e.code.toUpperCase() : null,
      e.colorCode ?? null,
      e.displayOrder ?? null,
      e.isActive ?? null,
      t
    ), r.prepare("SELECT * FROM kitchen_stations WHERE id = ?").get(t);
  },
  /**
   * Get active kitchen orders and tickets
   * @param {object} params
   * @param {string} [params.branchId]
   * @param {string} [params.stationId] - Filter by station ID or 'ALL'
   * @param {string} [params.statusFilter] - 'ACTIVE' | 'READY' | 'COMPLETED' | 'ALL'
   */
  getKitchenOrders: (t = {}) => {
    var d;
    const e = E(), r = t.branchId || ((d = e.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : d.id), n = t.statusFilter || "ACTIVE";
    let s = "";
    n === "ACTIVE" ? s = "o.status IN ('CONFIRMED', 'PREPARING', 'READY')" : n === "READY" ? s = "o.status = 'READY'" : n === "COMPLETED" ? s = "o.status IN ('SERVED', 'COMPLETED') AND datetime(o.updated_at) >= datetime('now', '-60 minutes')" : n !== "ALL" ? s = `o.status = '${n}'` : s = "o.status NOT IN ('DRAFT', 'CANCELLED')";
    const i = `
      SELECT o.id, o.branch_id, o.order_number, o.order_type, o.status,
             o.table_id, o.customer_id, o.cashier_id, o.notes as order_notes,
             o.created_at, o.updated_at,
             o.kitchen_accepted_at, o.kitchen_ready_at, o.kitchen_completed_at,
             COALESCE(o.target_prep_minutes, 15) as target_prep_minutes,
             t.table_number, f.name as floor_name,
             c.name as customer_name, c.phone as customer_phone
      FROM orders o
      LEFT JOIN dining_tables t ON o.table_id = t.id
      LEFT JOIN floors f ON t.floor_id = f.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.branch_id = ? AND ${s}
      ORDER BY 
        CASE o.status
          WHEN 'CONFIRMED' THEN 1
          WHEN 'PREPARING' THEN 2
          WHEN 'READY' THEN 3
          ELSE 4
        END,
        o.created_at ASC
    `, a = e.prepare(i).all(r), o = Date.now(), c = [];
    for (const _ of a) {
      let l = e.prepare(`
        SELECT oi.*, 
               p.name as catalog_product_name,
               ks.id as station_id,
               ks.name as station_name,
               ks.code as station_code,
               ks.color_code as station_color
        FROM order_items oi
        LEFT JOIN products p ON oi.product_id = p.id
        LEFT JOIN kitchen_stations ks ON COALESCE(oi.kitchen_station_id, p.kitchen_station_id) = ks.id
        WHERE oi.order_id = ?
        ORDER BY oi.id ASC
      `).all(_.id);
      if (l = l.map((U) => {
        const C = e.prepare(`
          SELECT * FROM order_item_modifiers WHERE order_item_id = ?
        `).all(U.id);
        return {
          ...U,
          modifiers: C
        };
      }), t.stationId && t.stationId !== "ALL" && !l.some((C) => C.station_id === t.stationId))
        continue;
      const T = new Date(_.created_at).getTime(), R = Math.max(0, Math.floor((o - T) / 6e4));
      let S = "NORMAL";
      R >= _.target_prep_minutes ? S = "DELAYED" : R >= Math.floor(_.target_prep_minutes * 0.65) && (S = "WARNING");
      const L = l.reduce((U, C) => U + (C.quantity || 1), 0), A = l.filter((U) => U.kitchen_status === "READY").reduce((U, C) => U + (C.quantity || 1), 0), b = l.length > 0 && l.every((U) => U.kitchen_status === "READY");
      c.push({
        ..._,
        elapsedMinutes: R,
        delayStatus: S,
        totalItemsCount: L,
        readyItemsCount: A,
        isAllItemsReady: b,
        items: l
      });
    }
    return c;
  },
  /**
   * Update individual order item kitchen status
   * Transitions: PENDING -> PREPARING -> READY -> SERVED
   */
  updateOrderItemStatus: ({ orderItemId: t, status: e, userId: r }) => {
    const n = E(), s = ["PENDING", "PREPARING", "READY", "SERVED"];
    if (!s.includes(e))
      throw new Error(`Invalid item status "${e}". Allowed: ${s.join(", ")}`);
    const i = n.prepare("SELECT * FROM order_items WHERE id = ?").get(t);
    if (!i) throw new Error(`Order item with ID "${t}" not found.`);
    const a = (/* @__PURE__ */ new Date()).toISOString();
    return n.transaction(() => {
      let c = i.started_cooking_at, d = i.completed_cooking_at;
      e === "PREPARING" && !c ? c = a : e === "READY" && !d && (d = a), n.prepare(`
        UPDATE order_items
        SET kitchen_status = ?,
            started_cooking_at = ?,
            completed_cooking_at = ?
        WHERE id = ?
      `).run(e, c, d, t);
      const _ = n.prepare("SELECT kitchen_status FROM order_items WHERE order_id = ?").all(i.order_id), p = _.every((R) => R.kitchen_status === "READY"), l = _.some((R) => R.kitchen_status === "PREPARING" || R.kitchen_status === "READY"), T = n.prepare("SELECT id, status, branch_id, order_number FROM orders WHERE id = ?").get(i.order_id);
      return p && T && T.status !== "READY" && T.status !== "COMPLETED" && T.status !== "SERVED" ? (n.prepare(`
          UPDATE orders
          SET status = 'READY',
              kitchen_ready_at = ?,
              updated_at = ?
          WHERE id = ?
        `).run(a, a, i.order_id), n.prepare(`
          INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
          VALUES (?, ?, ?, 'READY', ?, 'All kitchen items prepared and ready', ?)
        `).run(Se(), i.order_id, T.status, r || null, a)) : l && T && T.status === "CONFIRMED" && (n.prepare(`
          UPDATE orders
          SET status = 'PREPARING',
              kitchen_accepted_at = COALESCE(kitchen_accepted_at, ?),
              updated_at = ?
          WHERE id = ?
        `).run(a, a, i.order_id), n.prepare(`
          INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
          VALUES (?, ?, 'CONFIRMED', 'PREPARING', ?, 'Kitchen started preparation', ?)
        `).run(Se(), i.order_id, r || null, a)), n.prepare("SELECT * FROM order_items WHERE id = ?").get(t);
    })();
  },
  /**
   * Update full order status in Kitchen workflow
   * @param {object} params
   * @param {string} params.orderId
   * @param {string} params.status - 'PREPARING' | 'READY' | 'SERVED' | 'COMPLETED'
   * @param {string} [params.userId]
   * @param {string} [params.notes]
   */
  updateOrderStatus: ({ orderId: t, status: e, userId: r, notes: n }) => {
    const s = E(), i = ["CONFIRMED", "PREPARING", "READY", "SERVED", "COMPLETED"];
    if (!i.includes(e))
      throw new Error(`Invalid status "${e}". Allowed: ${i.join(", ")}`);
    const a = s.prepare("SELECT * FROM orders WHERE id = ?").get(t);
    if (!a) throw new Error(`Order with ID "${t}" not found.`);
    const o = (/* @__PURE__ */ new Date()).toISOString();
    return s.transaction(() => {
      let d = a.kitchen_accepted_at, _ = a.kitchen_ready_at, p = a.kitchen_completed_at;
      return e === "PREPARING" && !d ? d = o : e === "READY" && !_ ? _ = o : (e === "SERVED" || e === "COMPLETED") && !p && (p = o), s.prepare(`
        UPDATE orders
        SET status = ?,
            kitchen_accepted_at = ?,
            kitchen_ready_at = ?,
            kitchen_completed_at = ?,
            updated_at = ?
        WHERE id = ?
      `).run(e, d, _, p, o, t), e === "PREPARING" ? s.prepare(`
          UPDATE order_items
          SET kitchen_status = 'PREPARING',
              started_cooking_at = COALESCE(started_cooking_at, ?)
          WHERE order_id = ? AND kitchen_status = 'PENDING'
        `).run(o, t) : e === "READY" && s.prepare(`
          UPDATE order_items
          SET kitchen_status = 'READY',
              completed_cooking_at = COALESCE(completed_cooking_at, ?)
          WHERE order_id = ? AND kitchen_status != 'READY'
        `).run(o, t), s.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(Se(), t, a.status, e, r || null, n || `Status updated to ${e}`, o), s.prepare(`
        INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
        VALUES (?, ?, ?, 'UPDATE_KITCHEN_STATUS', 'ORDER', ?, ?, ?)
      `).run(
        Se(),
        a.branch_id,
        r || null,
        t,
        JSON.stringify({ from: a.status, to: e, orderNumber: a.order_number }),
        o
      ), s.prepare("SELECT * FROM orders WHERE id = ?").get(t);
    })();
  },
  /**
   * Get KDS summary metrics (Active orders, Preparing, Ready, Delayed count, Avg cook time)
   */
  getKitchenMetrics: (t) => {
    var _;
    const e = E(), r = t || ((_ = e.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _.id), n = e.prepare(`
      SELECT COUNT(*) as count FROM orders
      WHERE branch_id = ? AND status IN ('CONFIRMED', 'PREPARING', 'READY')
    `).get(r).count, s = e.prepare(`
      SELECT COUNT(*) as count FROM orders
      WHERE branch_id = ? AND status = 'PREPARING'
    `).get(r).count, i = e.prepare(`
      SELECT COUNT(*) as count FROM orders
      WHERE branch_id = ? AND status = 'READY'
    `).get(r).count, a = e.prepare(`
      SELECT COUNT(*) as count FROM orders
      WHERE branch_id = ? AND status IN ('SERVED', 'COMPLETED')
        AND date(created_at) = date('now')
    `).get(r).count, o = e.prepare(`
      SELECT created_at, COALESCE(target_prep_minutes, 15) as target_prep_minutes
      FROM orders
      WHERE branch_id = ? AND status IN ('CONFIRMED', 'PREPARING')
    `).all(r), c = Date.now();
    let d = 0;
    for (const p of o)
      (c - new Date(p.created_at).getTime()) / 6e4 >= p.target_prep_minutes && d++;
    return {
      activeTickets: n,
      preparingTickets: s,
      readyTickets: i,
      delayedCount: d,
      completedToday: a
    };
  }
};
function fe(t) {
  var n;
  if (t) return t;
  const e = O.getCurrentSession();
  return e != null && e.branchId ? e.branchId : (n = E().prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : n.id;
}
function ue(t) {
  var r;
  const e = O.getCurrentSession();
  if (e && e.roleCode !== "super_admin" && !((r = e.permissions) != null && r.includes(t)))
    throw new Error(`Unauthorized: Requires '${t}' permission.`);
}
function Xt() {
  u.handle("kitchen:get-orders", async (t, e = {}) => {
    ue("kitchen:view");
    const r = fe(e.branchId);
    return de.getKitchenOrders({
      ...e,
      branchId: r
    });
  }), u.handle("kitchen:update-item-status", async (t, { orderItemId: e, status: r }) => {
    ue("kitchen:view");
    const n = O.getCurrentSession();
    return de.updateOrderItemStatus({
      orderItemId: e,
      status: r,
      userId: (n == null ? void 0 : n.id) || null
    });
  }), u.handle("kitchen:update-order-status", async (t, { orderId: e, status: r, notes: n }) => {
    ue("kitchen:view");
    const s = O.getCurrentSession();
    return de.updateOrderStatus({
      orderId: e,
      status: r,
      userId: (s == null ? void 0 : s.id) || null,
      notes: n
    });
  }), u.handle("kitchen:get-stations", async (t, e) => de.getStations(fe(e))), u.handle("kitchen:create-station", async (t, e) => {
    ue("settings:manage");
    const r = fe(e.branchId);
    return de.createStation({
      ...e,
      branchId: r
    });
  }), u.handle("kitchen:update-station", async (t, { id: e, data: r }) => (ue("settings:manage"), de.updateStation(e, r))), u.handle("kitchen:get-metrics", async (t, e) => (ue("kitchen:view"), de.getKitchenMetrics(fe(e))));
}
function x(t) {
  var n;
  if (t) return t;
  const e = O.getCurrentSession();
  return e != null && e.branchId ? e.branchId : (n = E().prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : n.id;
}
function W(t) {
  var r;
  const e = O.getCurrentSession();
  if (e && e.roleCode !== "super_admin" && !((r = e.permissions) != null && r.includes(t)))
    throw new Error(`Unauthorized: Requires '${t}' permission.`);
}
function Ht() {
  u.handle("inventory:get-units", async () => f.getUnits()), u.handle("inventory:create-unit", async (t, e) => (W("inventory:manage"), f.createUnit(e))), u.handle("inventory:get-items", async (t, e = {}) => f.getItems({
    ...e,
    branchId: x(e.branchId)
  })), u.handle("inventory:get-item", async (t, e) => f.getItemById(e)), u.handle("inventory:create-item", async (t, e) => (W("inventory:manage"), f.createItem({
    ...e,
    branchId: x(e.branchId)
  }))), u.handle("inventory:update-item", async (t, { id: e, data: r }) => (W("inventory:manage"), f.updateItem(e, r))), u.handle("inventory:adjust-stock", async (t, e) => {
    W("inventory:manage");
    const r = O.getCurrentSession();
    return f.adjustStock({
      ...e,
      branchId: x(e.branchId),
      userId: (r == null ? void 0 : r.id) || null
    });
  }), u.handle("inventory:get-movements", async (t, e = {}) => (W("inventory:manage"), f.getStockMovements({
    ...e,
    branchId: x(e.branchId)
  }))), u.handle("recipe:get-recipes", async (t, e = {}) => f.getRecipes({
    ...e,
    branchId: x(e.branchId)
  })), u.handle("recipe:get-recipe", async (t, { productId: e, variationId: r }) => f.getRecipeForProduct(e, r)), u.handle("recipe:save-recipe", async (t, e) => (W("inventory:manage"), f.saveRecipe(e))), u.handle("supplier:get-suppliers", async (t, e) => f.getSuppliers(x(e))), u.handle("supplier:create", async (t, e) => (W("inventory:manage"), f.createSupplier({
    ...e,
    branchId: x(e.branchId)
  }))), u.handle("supplier:update", async (t, { id: e, data: r }) => (W("inventory:manage"), f.updateSupplier(e, r))), u.handle("purchase:get-orders", async (t, e = {}) => (W("inventory:manage"), f.getPurchaseOrders({
    ...e,
    branchId: x(e.branchId)
  }))), u.handle("purchase:create-order", async (t, e) => (W("inventory:manage"), f.createPurchaseOrder({
    ...e,
    branchId: x(e.branchId)
  }))), u.handle("purchase:record-payment", async (t, e) => (W("inventory:manage"), f.recordVendorPayment({
    ...e,
    branchId: x(e.branchId)
  }))), u.handle("expense:get-categories", async () => f.getExpenseCategories()), u.handle("expense:get-expenses", async (t, e = {}) => (W("reports:view"), f.getExpenses({
    ...e,
    branchId: x(e.branchId)
  }))), u.handle("expense:create", async (t, e) => {
    W("reports:view");
    const r = O.getCurrentSession();
    return f.createExpense({
      ...e,
      branchId: x(e.branchId),
      userId: (r == null ? void 0 : r.id) || null
    });
  }), u.handle("expense:get-summary", async (t, e = {}) => (W("reports:view"), f.getExpenseSummary({
    ...e,
    branchId: x(e.branchId)
  })));
}
function Fe() {
  return v.randomUUID();
}
function Me(t, e) {
  if (e) {
    const s = t.prepare("SELECT id FROM users WHERE id = ?").get(e);
    if (s) return s.id;
  }
  const r = O.getCurrentSession();
  if (r != null && r.id) {
    const s = t.prepare("SELECT id FROM users WHERE id = ?").get(r.id);
    if (s) return s.id;
  }
  const n = t.prepare("SELECT id FROM users WHERE is_active = 1 LIMIT 1").get();
  return (n == null ? void 0 : n.id) || null;
}
function Pe(t, e) {
  if (e) {
    const s = t.prepare("SELECT id FROM branches WHERE id = ?").get(e);
    if (s) return s.id;
  }
  const r = O.getCurrentSession();
  if (r != null && r.branchId) {
    const s = t.prepare("SELECT id FROM branches WHERE id = ?").get(r.branchId);
    if (s) return s.id;
  }
  const n = t.prepare("SELECT id FROM branches LIMIT 1").get();
  return (n == null ? void 0 : n.id) || null;
}
function Be(t, e, r, n, s) {
  try {
    const i = E(), a = Me(i, null), o = Pe(i, t);
    i.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Fe(),
      o,
      a,
      e,
      r,
      n,
      JSON.stringify(s),
      (/* @__PURE__ */ new Date()).toISOString()
    );
  } catch (i) {
    console.error("[Cash Drawer Audit Log Error]:", i);
  }
}
const k = {
  /**
   * Get currently active open session for user/branch
   */
  getCurrentSession: (t, e = null) => {
    const r = E(), n = Pe(r, t), s = Me(r, e);
    let i = null;
    if (s && (i = r.prepare(`
        SELECT cs.*, u.display_name as cashier_name, u.username as cashier_username
        FROM cash_sessions cs
        JOIN users u ON cs.user_id = u.id
        WHERE cs.branch_id = ? AND cs.user_id = ? AND cs.status = 'OPEN'
        ORDER BY cs.opened_at DESC LIMIT 1
      `).get(n, s)), i || (i = r.prepare(`
        SELECT cs.*, u.display_name as cashier_name, u.username as cashier_username
        FROM cash_sessions cs
        JOIN users u ON cs.user_id = u.id
        WHERE cs.branch_id = ? AND cs.status = 'OPEN'
        ORDER BY cs.opened_at DESC LIMIT 1
      `).get(n)), !i) return null;
    const a = k.calculateSessionMetrics(i.id);
    return {
      ...i,
      liveMetrics: a
    };
  },
  /**
   * Open a new cash drawer session
   */
  openSession: ({ branchId: t, userId: e, openingBalanceCents: r = 0, notes: n = null }) => {
    const s = E(), i = Pe(s, t), a = Me(s, e);
    if (!i) throw new Error("Valid branch is required to open shift.");
    if (!a) throw new Error("Valid cashier is required to open shift.");
    if (s.prepare(`
      SELECT id FROM cash_sessions
      WHERE branch_id = ? AND user_id = ? AND status = 'OPEN'
    `).get(i, a))
      throw new Error("An active cash shift session is already open for this user. Please close it first.");
    const c = Fe(), d = (/* @__PURE__ */ new Date()).toISOString();
    return s.prepare(`
      INSERT INTO cash_sessions (
        id, branch_id, user_id, opened_at, opening_balance_cents,
        expected_cash_cents, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)
    `).run(
      c,
      i,
      a,
      d,
      Math.max(0, parseInt(r, 10) || 0),
      Math.max(0, parseInt(r, 10) || 0),
      n || null
    ), Be(i, "OPEN_CASH_SESSION", "CASH_SESSION", c, {
      openingBalanceCents: r,
      userId: a
    }), k.getSessionDetails(c);
  },
  /**
   * Record Cash In or Cash Out (Petty Cash movement)
   */
  recordMovement: ({ sessionId: t, movementType: e, amountCents: r, reason: n }) => {
    const s = E(), i = s.prepare("SELECT * FROM cash_sessions WHERE id = ?").get(t);
    if (!i) throw new Error("Shift session not found.");
    if (i.status !== "OPEN") throw new Error("Cannot add movement to a closed session.");
    const a = e.toUpperCase();
    if (a !== "CASH_IN" && a !== "CASH_OUT")
      throw new Error("Movement type must be 'CASH_IN' or 'CASH_OUT'.");
    const o = Math.max(0, parseInt(r, 10) || 0);
    if (o <= 0) throw new Error("Amount must be greater than zero.");
    if (!n || n.trim() === "") throw new Error("Reason is required for cash movement.");
    const c = Fe(), d = (/* @__PURE__ */ new Date()).toISOString();
    return s.prepare(`
      INSERT INTO cash_movements (id, session_id, movement_type, amount_cents, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(c, t, a, o, n.trim(), d), Be(i.branch_id, `CASH_MOVEMENT_${a}`, "CASH_SESSION", t, {
      movementType: a,
      amountCents: o,
      reason: n.trim()
    }), {
      movementId: c,
      sessionId: t,
      movementType: a,
      amountCents: o,
      reason: n.trim(),
      createdAt: d,
      liveMetrics: k.calculateSessionMetrics(t)
    };
  },
  /**
   * Calculate live or historical metrics for a shift session
   */
  calculateSessionMetrics: (t) => {
    const e = E(), r = e.prepare("SELECT * FROM cash_sessions WHERE id = ?").get(t);
    if (!r) return null;
    const n = r.opened_at, s = r.closed_at || (/* @__PURE__ */ new Date()).toISOString(), i = e.prepare(`
      SELECT payment_method, SUM(amount_cents) as total_cents, COUNT(*) as count
      FROM payments
      WHERE branch_id = ? AND cashier_id = ?
        AND created_at >= ? AND created_at <= ? AND status = 'COMPLETED'
      GROUP BY payment_method
    `).all(r.branch_id, r.user_id, n, s);
    let a = 0, o = 0, c = 0, d = 0, _ = 0;
    for (const A of i) {
      _ += A.count;
      const b = A.payment_method.toUpperCase();
      b === "CASH" ? a += A.total_cents : b === "CARD" ? o += A.total_cents : b === "BANK_TRANSFER" ? c += A.total_cents : b === "ONLINE" ? d += A.total_cents : a += A.total_cents;
    }
    const p = e.prepare(`
      SELECT movement_type, SUM(amount_cents) as total_cents, COUNT(*) as count
      FROM cash_movements
      WHERE session_id = ?
      GROUP BY movement_type
    `).all(t);
    let l = 0, T = 0;
    for (const A of p)
      A.movement_type === "CASH_IN" ? l += A.total_cents : A.movement_type === "CASH_OUT" && (T += A.total_cents);
    const R = r.opening_balance_cents || 0, S = r.total_refunds_cents || 0, L = R + a + l - T - S;
    return {
      openingBalanceCents: R,
      totalCashSalesCents: a,
      totalCardSalesCents: o,
      totalBankSalesCents: c,
      totalOnlineSalesCents: d,
      totalGrossSalesCents: a + o + c + d,
      totalCashInCents: l,
      totalCashOutCents: T,
      totalRefundsCents: S,
      expectedCashCents: L,
      totalPaymentsCount: _
    };
  },
  /**
   * Get X-Report (Instantaneous, non-closing mid-shift audit report)
   */
  getXReport: (t) => {
    const e = k.getSessionDetails(t);
    if (!e) throw new Error("Shift session not found.");
    const r = k.calculateSessionMetrics(t);
    return {
      reportType: "X_REPORT",
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      session: e,
      metrics: r
    };
  },
  /**
   * Close Cash Session and Generate Permanent Z-Report
   */
  closeSession: ({ sessionId: t, countedCashCents: e, closingNotes: r = null, denominations: n = [], managerApprovalUserId: s = null }) => {
    const i = E(), a = (/* @__PURE__ */ new Date()).toISOString();
    return i.transaction(() => {
      const c = i.prepare("SELECT * FROM cash_sessions WHERE id = ?").get(t);
      if (!c) throw new Error("Shift session not found.");
      if (c.status === "CLOSED") throw new Error("Session is already closed.");
      const d = k.calculateSessionMetrics(t), _ = Math.max(0, parseInt(e, 10) || 0), p = _ - d.expectedCashCents, l = s ? Me(i, s) : null;
      if (Array.isArray(n) && n.length > 0) {
        const T = i.prepare(`
          INSERT INTO cash_drawer_denominations (id, session_id, denomination_cents, count, total_cents)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const R of n) {
          const S = parseInt(R.denominationCents, 10) || 0, L = parseInt(R.count, 10) || 0, A = S * L;
          T.run(Fe(), t, S, L, A);
        }
      }
      return i.prepare(`
        UPDATE cash_sessions
        SET closed_at = ?,
            counted_cash_cents = ?,
            expected_cash_cents = ?,
            variance_cents = ?,
            total_cash_sales_cents = ?,
            total_card_sales_cents = ?,
            total_bank_sales_cents = ?,
            total_online_sales_cents = ?,
            total_cash_in_cents = ?,
            total_cash_out_cents = ?,
            closing_notes = ?,
            manager_approval_user_id = ?,
            status = 'CLOSED'
        WHERE id = ?
      `).run(
        a,
        _,
        d.expectedCashCents,
        p,
        d.totalCashSalesCents,
        d.totalCardSalesCents,
        d.totalBankSalesCents,
        d.totalOnlineSalesCents,
        d.totalCashInCents,
        d.totalCashOutCents,
        r || null,
        l,
        t
      ), Be(c.branch_id, "CLOSE_CASH_SESSION", "CASH_SESSION", t, {
        countedCashCents: _,
        expectedCashCents: d.expectedCashCents,
        varianceCents: p,
        closingNotes: r
      }), {
        reportType: "Z_REPORT",
        sessionId: t,
        generatedAt: a,
        openedAt: c.opened_at,
        closedAt: a,
        cashierId: c.user_id,
        openingBalanceCents: d.openingBalanceCents,
        countedCashCents: _,
        expectedCashCents: d.expectedCashCents,
        varianceCents: p,
        metrics: d,
        denominations: n,
        closingNotes: r
      };
    })();
  },
  /**
   * Get shift history list
   */
  getSessionHistory: (t, { limit: e = 30, offset: r = 0 } = {}) => {
    const n = E(), s = Pe(n, t);
    return n.prepare(`
      SELECT cs.*,
             u.display_name as cashier_name, u.username as cashier_username,
             m.display_name as manager_name
      FROM cash_sessions cs
      JOIN users u ON cs.user_id = u.id
      LEFT JOIN users m ON cs.manager_approval_user_id = m.id
      WHERE cs.branch_id = ?
      ORDER BY cs.opened_at DESC
      LIMIT ? OFFSET ?
    `).all(s, e, r);
  },
  /**
   * Get full details of a session
   */
  getSessionDetails: (t) => {
    const e = E(), r = e.prepare(`
      SELECT cs.*,
             u.display_name as cashier_name, u.username as cashier_username,
             m.display_name as manager_name,
             b.name as branch_name
      FROM cash_sessions cs
      JOIN users u ON cs.user_id = u.id
      JOIN branches b ON cs.branch_id = b.id
      LEFT JOIN users m ON cs.manager_approval_user_id = m.id
      WHERE cs.id = ?
    `).get(t);
    if (!r) return null;
    const n = e.prepare(`
      SELECT * FROM cash_movements WHERE session_id = ? ORDER BY created_at ASC
    `).all(t), s = e.prepare(`
      SELECT * FROM cash_drawer_denominations WHERE session_id = ? ORDER BY denomination_cents DESC
    `).all(t), i = k.calculateSessionMetrics(t);
    return {
      ...r,
      movements: n,
      denominations: s,
      metrics: i
    };
  }
};
function ke(t) {
  var n;
  if (t) return t;
  const e = O.getCurrentSession();
  return e != null && e.branchId ? e.branchId : (n = E().prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : n.id;
}
function Qe() {
  const t = O.getCurrentSession();
  return (t == null ? void 0 : t.id) || null;
}
function Wt() {
  u.handle("cash:get-current-session", async (t, e = {}) => {
    const r = ke(e.branchId), n = e.userId || Qe();
    return k.getCurrentSession(r, n);
  }), u.handle("cash:open-session", async (t, e = {}) => {
    const r = ke(e.branchId), n = e.userId || Qe();
    return k.openSession({
      ...e,
      branchId: r,
      userId: n
    });
  }), u.handle("cash:record-movement", async (t, e) => k.recordMovement(e)), u.handle("cash:get-x-report", async (t, e) => k.getXReport(e)), u.handle("cash:close-session", async (t, e) => k.closeSession(e)), u.handle("cash:get-history", async (t, e = {}) => {
    const r = ke(e.branchId);
    return k.getSessionHistory(r, e);
  }), u.handle("cash:get-details", async (t, e) => k.getSessionDetails(e));
}
function Ce() {
  return v.randomUUID();
}
function Z(t, e) {
  if (e) {
    const s = t.prepare("SELECT id FROM branches WHERE id = ?").get(e);
    if (s) return s.id;
  }
  const r = O.getCurrentSession();
  if (r != null && r.branchId) {
    const s = t.prepare("SELECT id FROM branches WHERE id = ?").get(r.branchId);
    if (s) return s.id;
  }
  const n = t.prepare("SELECT id FROM branches LIMIT 1").get();
  return (n == null ? void 0 : n.id) || null;
}
function Bt(t, e) {
  const r = O.getCurrentSession();
  if (r != null && r.id) {
    const s = t.prepare("SELECT id FROM users WHERE id = ?").get(r.id);
    if (s) return s.id;
  }
  const n = t.prepare("SELECT id FROM users WHERE is_active = 1 LIMIT 1").get();
  return (n == null ? void 0 : n.id) || null;
}
function le(t, e, r, n, s) {
  try {
    const i = E(), a = Bt(i, null), o = Z(i, t);
    i.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Ce(),
      o,
      a,
      e,
      r,
      n,
      JSON.stringify(s),
      (/* @__PURE__ */ new Date()).toISOString()
    );
  } catch (i) {
    console.error("[Staff Audit Log Error]:", i);
  }
}
const X = {
  /**
   * Get employee roster with today's live attendance status
   */
  getEmployees: ({ branchId: t, search: e = "", status: r = null, designation: n = null } = {}) => {
    const s = E(), i = Z(s, t);
    let a = `
      SELECT e.*,
             r.name as role_name, r.code as role_code,
             u.username, u.display_name as user_display_name, u.is_active as user_active
      FROM employees e
      LEFT JOIN roles r ON e.role_id = r.id
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.branch_id = ?
    `;
    const o = [i];
    if (r && (a += " AND e.status = ?", o.push(r)), n && (a += " AND e.designation = ?", o.push(n)), e && e.trim() !== "") {
      a += " AND (e.first_name LIKE ? OR e.last_name LIKE ? OR e.employee_code LIKE ? OR e.phone LIKE ?)";
      const _ = `%${e.trim()}%`;
      o.push(_, _, _, _);
    }
    a += " ORDER BY e.employee_code ASC";
    const c = s.prepare(a).all(...o), d = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    for (const _ of c) {
      const p = s.prepare(`
        SELECT sa.*, ss.name as shift_name
        FROM staff_attendance sa
        LEFT JOIN staff_shifts ss ON sa.shift_id = ss.id
        WHERE sa.employee_id = ? AND sa.clock_in >= ?
        ORDER BY sa.clock_in DESC LIMIT 1
      `).get(_.id, `${d}T00:00:00.000Z`);
      _.todayAttendance = p || null;
    }
    return c;
  },
  /**
   * Get employee by ID
   */
  getEmployeeById: (t) => {
    const e = E(), r = e.prepare(`
      SELECT e.*, r.name as role_name, r.code as role_code,
             u.username, u.display_name as user_display_name
      FROM employees e
      LEFT JOIN roles r ON e.role_id = r.id
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.id = ?
    `).get(t);
    return r ? (r.recentAttendance = e.prepare(`
      SELECT sa.*, ss.name as shift_name
      FROM staff_attendance sa
      LEFT JOIN staff_shifts ss ON sa.shift_id = ss.id
      WHERE sa.employee_id = ?
      ORDER BY sa.clock_in DESC LIMIT 15
    `).all(t), r) : null;
  },
  /**
   * Create new employee profile
   */
  createEmployee: (t) => {
    const e = E(), r = Z(e, t.branchId), n = Ce(), s = (/* @__PURE__ */ new Date()).toISOString();
    let i = t.employeeCode;
    return (!i || i.trim() === "") && (i = `EMP-${(e.prepare("SELECT COUNT(*) as count FROM employees").get().count + 101).toString()}`), e.prepare(`
      INSERT INTO employees (
        id, branch_id, user_id, employee_code, first_name, last_name,
        email, phone, designation, role_id, salary_type, base_rate_cents,
        hire_date, status, emergency_contact, notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `).run(
      n,
      r,
      t.userId || null,
      i.trim().toUpperCase(),
      t.firstName.trim(),
      t.lastName.trim(),
      t.email || null,
      t.phone || null,
      t.designation || "Staff Member",
      t.roleId || null,
      t.salaryType || "MONTHLY",
      Math.max(0, parseInt(t.baseRateCents, 10) || 0),
      t.hireDate || s.slice(0, 10),
      t.status || "ACTIVE",
      t.emergencyContact || null,
      t.notes || null,
      s,
      s
    ), le(r, "CREATE_EMPLOYEE", "EMPLOYEE", n, {
      employeeCode: i,
      name: `${t.firstName} ${t.lastName}`,
      designation: t.designation
    }), X.getEmployeeById(n);
  },
  /**
   * Update employee profile
   */
  updateEmployee: (t, e) => {
    const r = E(), n = r.prepare("SELECT * FROM employees WHERE id = ?").get(t);
    if (!n) throw new Error("Employee not found.");
    const s = (/* @__PURE__ */ new Date()).toISOString();
    return r.prepare(`
      UPDATE employees
      SET first_name = ?,
          last_name = ?,
          email = ?,
          phone = ?,
          designation = ?,
          role_id = ?,
          user_id = ?,
          salary_type = ?,
          base_rate_cents = ?,
          status = ?,
          emergency_contact = ?,
          notes = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      e.firstName !== void 0 ? e.firstName.trim() : n.first_name,
      e.lastName !== void 0 ? e.lastName.trim() : n.last_name,
      e.email !== void 0 ? e.email : n.email,
      e.phone !== void 0 ? e.phone : n.phone,
      e.designation !== void 0 ? e.designation : n.designation,
      e.roleId !== void 0 ? e.roleId : n.role_id,
      e.userId !== void 0 ? e.userId : n.user_id,
      e.salaryType !== void 0 ? e.salaryType : n.salary_type,
      e.baseRateCents !== void 0 ? Math.max(0, parseInt(e.baseRateCents, 10) || 0) : n.base_rate_cents,
      e.status !== void 0 ? e.status : n.status,
      e.emergencyContact !== void 0 ? e.emergencyContact : n.emergency_contact,
      e.notes !== void 0 ? e.notes : n.notes,
      s,
      t
    ), le(n.branch_id, "UPDATE_EMPLOYEE", "EMPLOYEE", t, { ...e }), X.getEmployeeById(t);
  },
  /**
   * Clock in an employee
   */
  clockIn: ({ employeeId: t, branchId: e, shiftId: r = null, notes: n = null }) => {
    const s = E(), i = s.prepare("SELECT * FROM employees WHERE id = ?").get(t);
    if (!i) throw new Error("Employee not found.");
    const a = Z(s, e || i.branch_id);
    if ((/* @__PURE__ */ new Date()).toISOString().slice(0, 10), s.prepare(`
      SELECT id FROM staff_attendance
      WHERE employee_id = ? AND clock_out IS NULL
    `).get(t))
      throw new Error(`${i.first_name} ${i.last_name} is already clocked in. Please clock out first.`);
    const c = Ce(), d = (/* @__PURE__ */ new Date()).toISOString();
    let _ = r;
    if (!_) {
      const p = s.prepare("SELECT id FROM staff_shifts WHERE branch_id = ? AND is_active = 1 LIMIT 1").get(a);
      _ = (p == null ? void 0 : p.id) || null;
    }
    return s.prepare(`
      INSERT INTO staff_attendance (
        id, branch_id, employee_id, shift_id, clock_in, clock_out,
        break_minutes, total_work_minutes, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, 0, 0, 'PRESENT', ?, ?, ?)
    `).run(
      c,
      a,
      t,
      _,
      d,
      n || null,
      d,
      d
    ), le(a, "CLOCK_IN", "ATTENDANCE", c, {
      employeeId: t,
      employeeCode: i.employee_code,
      clockIn: d
    }), s.prepare("SELECT * FROM staff_attendance WHERE id = ?").get(c);
  },
  /**
   * Clock out an employee & compute total worked minutes
   */
  clockOut: ({ attendanceId: t, breakMinutes: e = 0, notes: r = null }) => {
    const n = E(), s = n.prepare("SELECT * FROM staff_attendance WHERE id = ?").get(t);
    if (!s) throw new Error("Attendance record not found.");
    if (s.clock_out) throw new Error("Employee has already clocked out for this session.");
    const i = (/* @__PURE__ */ new Date()).toISOString(), a = new Date(s.clock_in).getTime(), o = new Date(i).getTime(), c = Math.max(0, Math.round((o - a) / (1e3 * 60))), d = Math.max(0, parseInt(e, 10) || 0), _ = Math.max(0, c - d);
    return n.prepare(`
      UPDATE staff_attendance
      SET clock_out = ?,
          break_minutes = ?,
          total_work_minutes = ?,
          notes = COALESCE(notes || ' | ' || ?, ?),
          updated_at = ?
      WHERE id = ?
    `).run(
      i,
      d,
      _,
      r,
      r,
      i,
      t
    ), le(s.branch_id, "CLOCK_OUT", "ATTENDANCE", t, {
      clockOut: i,
      totalWorkMinutes: _,
      breakMinutes: d
    }), n.prepare("SELECT * FROM staff_attendance WHERE id = ?").get(t);
  },
  /**
   * Get attendance logs
   */
  getAttendanceLogs: ({ branchId: t, date: e = null, employeeId: r = null, limit: n = 50, offset: s = 0 } = {}) => {
    const i = E(), a = Z(i, t);
    let o = `
      SELECT sa.*,
             e.first_name, e.last_name, e.employee_code, e.designation,
             ss.name as shift_name
      FROM staff_attendance sa
      JOIN employees e ON sa.employee_id = e.id
      LEFT JOIN staff_shifts ss ON sa.shift_id = ss.id
      WHERE sa.branch_id = ?
    `;
    const c = [a];
    return r && (o += " AND sa.employee_id = ?", c.push(r)), e && (o += " AND sa.clock_in LIKE ?", c.push(`${e}%`)), o += " ORDER BY sa.clock_in DESC LIMIT ? OFFSET ?", c.push(n, s), i.prepare(o).all(...c);
  },
  /**
   * Staff Performance Analytics (Sales generated, orders processed)
   */
  getStaffPerformance: ({ branchId: t, startDate: e = null, endDate: r = null } = {}) => {
    const n = E(), s = Z(n, t);
    let i = "";
    const a = [];
    return e && (i += " AND p.created_at >= ?", a.push(e)), r && (i += " AND p.created_at <= ?", a.push(r)), {
      cashierPerformance: n.prepare(`
      SELECT u.id as user_id, u.display_name, u.username,
             COUNT(DISTINCT p.order_id) as orders_handled,
             COUNT(p.id) as transactions_count,
             COALESCE(SUM(p.amount_cents), 0) as total_collected_cents,
             COALESCE(SUM(CASE WHEN p.payment_method = 'CASH' THEN p.amount_cents ELSE 0 END), 0) as cash_collected_cents,
             COALESCE(SUM(CASE WHEN p.payment_method = 'CARD' THEN p.amount_cents ELSE 0 END), 0) as card_collected_cents
      FROM users u
      LEFT JOIN payments p ON p.cashier_id = u.id AND p.status = 'COMPLETED' ${i}
      WHERE u.branch_id = ?
      GROUP BY u.id
      ORDER BY total_collected_cents DESC
    `).all(...a, s)
    };
  },
  /**
   * Get all shifts
   */
  getShifts: (t) => {
    const e = E(), r = Z(e, t);
    return e.prepare("SELECT * FROM staff_shifts WHERE branch_id = ? ORDER BY start_time ASC").all(r);
  },
  /**
   * Save or update shift
   */
  saveShift: (t) => {
    const e = E(), r = Z(e, t.branchId), n = (/* @__PURE__ */ new Date()).toISOString();
    if (t.id)
      return e.prepare(`
        UPDATE staff_shifts
        SET name = ?, start_time = ?, end_time = ?, is_active = ?, updated_at = ?
        WHERE id = ?
      `).run(
        t.name,
        t.startTime,
        t.endTime,
        t.isActive !== !1 ? 1 : 0,
        n,
        t.id
      ), e.prepare("SELECT * FROM staff_shifts WHERE id = ?").get(t.id);
    const s = Ce();
    return e.prepare(`
      INSERT INTO staff_shifts (id, branch_id, name, start_time, end_time, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      s,
      r,
      t.name,
      t.startTime,
      t.endTime,
      t.isActive !== !1 ? 1 : 0,
      n,
      n
    ), e.prepare("SELECT * FROM staff_shifts WHERE id = ?").get(s);
  },
  /**
   * User Administration for managers
   */
  getUsers: (t) => {
    const e = E(), r = Z(e, t);
    return e.prepare(`
      SELECT u.id, u.branch_id, u.role_id, u.username, u.display_name,
             u.is_active, u.last_login_at, u.created_at,
             r.name as role_name, r.code as role_code
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.branch_id = ?
      ORDER BY u.created_at ASC
    `).all(r);
  },
  getRoles: () => E().prepare("SELECT * FROM roles ORDER BY name ASC").all(),
  createUser: (t) => {
    const e = E(), r = Z(e, t.branchId), n = Ce(), s = (/* @__PURE__ */ new Date()).toISOString();
    if (e.prepare("SELECT id FROM users WHERE username = ?").get(t.username.trim().toLowerCase())) throw new Error(`Username "${t.username}" is already taken.`);
    const a = t.pin || "1234", o = v.createHash("sha256").update(a).digest("hex");
    return e.prepare(`
      INSERT INTO users (
        id, branch_id, role_id, username, display_name, pin_hash, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      n,
      r,
      t.roleId,
      t.username.trim().toLowerCase(),
      t.displayName.trim(),
      o,
      s,
      s
    ), le(r, "CREATE_USER", "USER", n, {
      username: t.username,
      displayName: t.displayName
    }), e.prepare(`
      SELECT u.id, u.branch_id, u.role_id, u.username, u.display_name,
             u.is_active, r.name as role_name, r.code as role_code
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = ?
    `).get(n);
  },
  updateUser: (t, e) => {
    const r = E(), n = r.prepare("SELECT * FROM users WHERE id = ?").get(t);
    if (!n) throw new Error("User not found.");
    const s = (/* @__PURE__ */ new Date()).toISOString();
    let i = n.pin_hash;
    return e.pin && e.pin.trim() !== "" && (i = v.createHash("sha256").update(e.pin.trim()).digest("hex")), r.prepare(`
      UPDATE users
      SET display_name = ?,
          role_id = ?,
          is_active = ?,
          pin_hash = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      e.displayName !== void 0 ? e.displayName.trim() : n.display_name,
      e.roleId !== void 0 ? e.roleId : n.role_id,
      e.isActive !== void 0 ? e.isActive ? 1 : 0 : n.is_active,
      i,
      s,
      t
    ), le(n.branch_id, "UPDATE_USER", "USER", t, { ...e }), r.prepare(`
      SELECT u.id, u.branch_id, u.role_id, u.username, u.display_name,
             u.is_active, r.name as role_name, r.code as role_code
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = ?
    `).get(t);
  }
};
function ee(t) {
  var n;
  if (t) return t;
  const e = O.getCurrentSession();
  return e != null && e.branchId ? e.branchId : (n = E().prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : n.id;
}
function pe() {
  const t = O.getCurrentSession();
  if (t && !["super_admin", "branch_admin", "manager"].includes(t.roleCode))
    throw new Error("Unauthorized: Manager or Admin role required.");
}
function kt() {
  u.handle("staff:get-employees", async (t, e = {}) => {
    const r = ee(e.branchId);
    return X.getEmployees({ ...e, branchId: r });
  }), u.handle("staff:get-employee-by-id", async (t, e) => X.getEmployeeById(e)), u.handle("staff:create-employee", async (t, e) => {
    pe();
    const r = ee(e.branchId);
    return X.createEmployee({ ...e, branchId: r });
  }), u.handle("staff:update-employee", async (t, { id: e, data: r }) => (pe(), X.updateEmployee(e, r))), u.handle("staff:clock-in", async (t, e) => {
    const r = ee(e.branchId);
    return X.clockIn({ ...e, branchId: r });
  }), u.handle("staff:clock-out", async (t, e) => X.clockOut(e)), u.handle("staff:get-attendance-logs", async (t, e = {}) => {
    const r = ee(e.branchId);
    return X.getAttendanceLogs({ ...e, branchId: r });
  }), u.handle("staff:get-shifts", async (t, e) => X.getShifts(ee(e))), u.handle("staff:save-shift", async (t, e) => {
    pe();
    const r = ee(e.branchId);
    return X.saveShift({ ...e, branchId: r });
  }), u.handle("staff:get-performance", async (t, e = {}) => {
    const r = ee(e.branchId);
    return X.getStaffPerformance({ ...e, branchId: r });
  }), u.handle("staff:get-users", async (t, e) => (pe(), X.getUsers(ee(e)))), u.handle("staff:get-roles", async () => X.getRoles()), u.handle("staff:create-user", async (t, e) => {
    pe();
    const r = ee(e.branchId);
    return X.createUser({ ...e, branchId: r });
  }), u.handle("staff:update-user", async (t, { id: e, data: r }) => (pe(), X.updateUser(e, r)));
}
function be() {
  return v.randomUUID();
}
const M = {
  // =========================================================================
  // 1. DELIVERY ZONES
  // =========================================================================
  getZones(t) {
    var n;
    const e = E(), r = t || ((n = e.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : n.id);
    return e.prepare(`
        SELECT * FROM delivery_zones
        WHERE branch_id = ?
        ORDER BY delivery_charge_cents ASC
      `).all(r);
  },
  createZone(t) {
    var i;
    const e = E(), r = t.branchId || ((i = e.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : i.id), n = be(), s = (/* @__PURE__ */ new Date()).toISOString();
    return e.prepare(`
      INSERT INTO delivery_zones (
        id, branch_id, name, delivery_charge_cents, min_order_cents,
        estimated_minutes, description, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      n,
      r,
      t.name.trim(),
      parseInt(t.deliveryChargeCents, 10) || 0,
      parseInt(t.minOrderCents, 10) || 0,
      parseInt(t.estimatedMinutes, 10) || 30,
      t.description || null,
      s,
      s
    ), e.prepare("SELECT * FROM delivery_zones WHERE id = ?").get(n);
  },
  updateZone(t, e) {
    const r = E(), n = [], s = [];
    return e.name !== void 0 && (n.push("name = ?"), s.push(e.name.trim())), e.deliveryChargeCents !== void 0 && (n.push("delivery_charge_cents = ?"), s.push(parseInt(e.deliveryChargeCents, 10))), e.minOrderCents !== void 0 && (n.push("min_order_cents = ?"), s.push(parseInt(e.minOrderCents, 10))), e.estimatedMinutes !== void 0 && (n.push("estimated_minutes = ?"), s.push(parseInt(e.estimatedMinutes, 10))), e.description !== void 0 && (n.push("description = ?"), s.push(e.description)), e.isActive !== void 0 && (n.push("is_active = ?"), s.push(e.isActive ? 1 : 0)), n.length === 0 || (n.push("updated_at = ?"), s.push((/* @__PURE__ */ new Date()).toISOString()), s.push(t), r.prepare(`UPDATE delivery_zones SET ${n.join(", ")} WHERE id = ?`).run(...s)), r.prepare("SELECT * FROM delivery_zones WHERE id = ?").get(t);
  },
  // =========================================================================
  // 2. RIDERS FLEET
  // =========================================================================
  getRiders(t, e = null) {
    var a;
    const r = E(), n = t || ((a = r.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : a.id);
    let s = `
      SELECT r.*,
        (SELECT COUNT(*) FROM deliveries d WHERE d.rider_id = r.id AND d.status = 'OUT_FOR_DELIVERY') as active_deliveries_count,
        (SELECT SUM(d.cod_collected_cents) FROM deliveries d WHERE d.rider_id = r.id AND d.status = 'DELIVERED' AND d.cod_settled = 0) as unsettled_cod_cents
      FROM riders r
      WHERE r.branch_id = ? AND r.is_active = 1
    `;
    const i = [n];
    return e && (s += " AND r.status = ?", i.push(e)), s += " ORDER BY r.name ASC", r.prepare(s).all(...i);
  },
  getRiderById(t) {
    return E().prepare(`
        SELECT r.*,
          (SELECT COUNT(*) FROM deliveries d WHERE d.rider_id = r.id AND d.status = 'OUT_FOR_DELIVERY') as active_deliveries_count,
          (SELECT SUM(d.cod_collected_cents) FROM deliveries d WHERE d.rider_id = r.id AND d.status = 'DELIVERED' AND d.cod_settled = 0) as unsettled_cod_cents
        FROM riders r
        WHERE r.id = ?
      `).get(t);
  },
  createRider(t) {
    var i;
    const e = E(), r = t.branchId || ((i = e.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : i.id), n = be(), s = (/* @__PURE__ */ new Date()).toISOString();
    return e.prepare(`
      INSERT INTO riders (
        id, branch_id, employee_id, name, phone, vehicle_type,
        license_plate, status, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', 1, ?, ?)
    `).run(
      n,
      r,
      t.employeeId || null,
      t.name.trim(),
      t.phone.trim(),
      t.vehicleType || "MOTORCYCLE",
      t.licensePlate ? t.licensePlate.trim() : null,
      s,
      s
    ), this.getRiderById(n);
  },
  updateRider(t, e) {
    const r = E(), n = [], s = [];
    return e.name !== void 0 && (n.push("name = ?"), s.push(e.name.trim())), e.phone !== void 0 && (n.push("phone = ?"), s.push(e.phone.trim())), e.vehicleType !== void 0 && (n.push("vehicle_type = ?"), s.push(e.vehicleType)), e.licensePlate !== void 0 && (n.push("license_plate = ?"), s.push(e.licensePlate)), e.status !== void 0 && (n.push("status = ?"), s.push(e.status)), e.isActive !== void 0 && (n.push("is_active = ?"), s.push(e.isActive ? 1 : 0)), n.length === 0 ? this.getRiderById(t) : (n.push("updated_at = ?"), s.push((/* @__PURE__ */ new Date()).toISOString()), s.push(t), r.prepare(`UPDATE riders SET ${n.join(", ")} WHERE id = ?`).run(...s), this.getRiderById(t));
  },
  updateRiderStatus(t, e) {
    const r = E(), n = (/* @__PURE__ */ new Date()).toISOString();
    return r.prepare("UPDATE riders SET status = ?, updated_at = ? WHERE id = ?").run(e, n, t), this.getRiderById(t);
  },
  // =========================================================================
  // 3. DISPATCH & DELIVERIES
  // =========================================================================
  getDeliveries(t, e = {}) {
    var a;
    const r = E(), n = t || ((a = r.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : a.id);
    let s = `
      SELECT
        d.*,
        o.order_number,
        o.total_cents as order_total_cents,
        o.paid_cents as order_paid_cents,
        o.status as order_status,
        z.name as zone_name,
        z.delivery_charge_cents,
        z.estimated_minutes,
        r.name as rider_name,
        r.phone as rider_phone,
        r.vehicle_type as rider_vehicle
      FROM deliveries d
      JOIN orders o ON d.order_id = o.id
      LEFT JOIN delivery_zones z ON d.zone_id = z.id
      LEFT JOIN riders r ON d.rider_id = r.id
      WHERE d.branch_id = ?
    `;
    const i = [n];
    return e.status && (s += " AND d.status = ?", i.push(e.status)), e.riderId && (s += " AND d.rider_id = ?", i.push(e.riderId)), e.date && (s += " AND d.created_at LIKE ?", i.push(`${e.date}%`)), s += " ORDER BY d.created_at DESC", r.prepare(s).all(...i);
  },
  getDeliveryById(t) {
    return E().prepare(`
        SELECT
          d.*,
          o.order_number,
          o.total_cents as order_total_cents,
          o.paid_cents as order_paid_cents,
          o.status as order_status,
          z.name as zone_name,
          r.name as rider_name,
          r.phone as rider_phone,
          r.vehicle_type as rider_vehicle
        FROM deliveries d
        JOIN orders o ON d.order_id = o.id
        LEFT JOIN delivery_zones z ON d.zone_id = z.id
        LEFT JOIN riders r ON d.rider_id = r.id
        WHERE d.id = ?
      `).get(t);
  },
  createDelivery(t) {
    var o;
    const e = E(), r = t.branchId || ((o = e.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : o.id), n = be(), s = (/* @__PURE__ */ new Date()).toISOString(), i = e.prepare("SELECT * FROM orders WHERE id = ?").get(t.orderId);
    if (!i) throw new Error(`Order not found: ${t.orderId}`);
    const a = t.codAmountCents !== void 0 ? parseInt(t.codAmountCents, 10) : Math.max(0, i.total_cents - (i.paid_cents || 0));
    return e.prepare(`
      INSERT INTO deliveries (
        id, order_id, branch_id, zone_id, rider_id,
        customer_name, customer_phone, delivery_address,
        delivery_instructions, status, cod_amount_cents,
        cod_collected_cents, cod_settled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, 0, 0, ?, ?)
    `).run(
      n,
      t.orderId,
      r,
      t.zoneId || null,
      t.riderId || null,
      t.customerName.trim(),
      t.customerPhone.trim(),
      t.deliveryAddress.trim(),
      t.deliveryInstructions || null,
      a,
      s,
      s
    ), t.riderId && this.assignRider(n, t.riderId), this.getDeliveryById(n);
  },
  assignRider(t, e) {
    const r = E(), n = (/* @__PURE__ */ new Date()).toISOString();
    if (!r.prepare("SELECT * FROM deliveries WHERE id = ?").get(t)) throw new Error("Delivery not found.");
    if (!r.prepare("SELECT * FROM riders WHERE id = ?").get(e)) throw new Error("Rider not found.");
    return r.transaction(() => {
      r.prepare(`
        UPDATE deliveries
        SET rider_id = ?, status = 'ASSIGNED', updated_at = ?
        WHERE id = ?
      `).run(e, n, t), r.prepare(`
        UPDATE riders
        SET status = 'ASSIGNED', current_delivery_id = ?, updated_at = ?
        WHERE id = ?
      `).run(t, n, e);
    })(), this.getDeliveryById(t);
  },
  dispatchDelivery(t) {
    const e = E(), r = (/* @__PURE__ */ new Date()).toISOString(), n = e.prepare("SELECT * FROM deliveries WHERE id = ?").get(t);
    if (!n) throw new Error("Delivery not found.");
    if (!n.rider_id) throw new Error("Cannot dispatch without an assigned rider.");
    return e.transaction(() => {
      e.prepare(`
        UPDATE deliveries
        SET status = 'OUT_FOR_DELIVERY', dispatched_at = ?, updated_at = ?
        WHERE id = ?
      `).run(r, r, t), e.prepare(`
        UPDATE riders
        SET status = 'OUT_FOR_DELIVERY', updated_at = ?
        WHERE id = ?
      `).run(r, n.rider_id), e.prepare(`
        UPDATE orders
        SET status = 'OUT_FOR_DELIVERY', updated_at = ?
        WHERE id = ?
      `).run(r, n.order_id);
    })(), this.getDeliveryById(t);
  },
  completeDelivery(t, { codCollectedCents: e = null } = {}) {
    const r = E(), n = (/* @__PURE__ */ new Date()).toISOString(), s = r.prepare("SELECT * FROM deliveries WHERE id = ?").get(t);
    if (!s) throw new Error("Delivery not found.");
    const i = e !== null ? parseInt(e, 10) : s.cod_amount_cents;
    return r.transaction(() => {
      var o;
      if (r.prepare(`
        UPDATE deliveries
        SET status = 'DELIVERED', delivered_at = ?, cod_collected_cents = ?, updated_at = ?
        WHERE id = ?
      `).run(n, i, n, t), s.rider_id) {
        const d = (((o = r.prepare("SELECT COUNT(*) as count FROM deliveries WHERE rider_id = ? AND status = 'OUT_FOR_DELIVERY' AND id != ?").get(s.rider_id, t)) == null ? void 0 : o.count) || 0) > 0 ? "OUT_FOR_DELIVERY" : "AVAILABLE";
        r.prepare(`
          UPDATE riders
          SET status = ?, current_delivery_id = NULL, updated_at = ?
          WHERE id = ?
        `).run(d, n, s.rider_id);
      }
      r.prepare(`
        UPDATE orders
        SET status = 'DELIVERED', paid_cents = total_cents, updated_at = ?
        WHERE id = ?
      `).run(n, s.order_id);
    })(), this.getDeliveryById(t);
  },
  failDelivery(t, e) {
    const r = E(), n = (/* @__PURE__ */ new Date()).toISOString(), s = r.prepare("SELECT * FROM deliveries WHERE id = ?").get(t);
    if (!s) throw new Error("Delivery not found.");
    return r.transaction(() => {
      r.prepare(`
        UPDATE deliveries
        SET status = 'FAILED', failed_reason = ?, updated_at = ?
        WHERE id = ?
      `).run(e || "Customer unavailable", n, t), s.rider_id && r.prepare(`
          UPDATE riders
          SET status = 'AVAILABLE', current_delivery_id = NULL, updated_at = ?
          WHERE id = ?
        `).run(n, s.rider_id);
    })(), this.getDeliveryById(t);
  },
  // =========================================================================
  // 4. CASH-ON-DELIVERY (COD) SETTLEMENT
  // =========================================================================
  getRiderPendingCod(t) {
    const e = E(), r = e.prepare(`
        SELECT
          COUNT(*) as delivered_orders_count,
          COALESCE(SUM(cod_collected_cents), 0) as pending_cod_cents
        FROM deliveries
        WHERE rider_id = ? AND status = 'DELIVERED' AND cod_settled = 0
      `).get(t), n = e.prepare(`
        SELECT d.*, o.order_number
        FROM deliveries d
        JOIN orders o ON d.order_id = o.id
        WHERE d.rider_id = ? AND d.status = 'DELIVERED' AND d.cod_settled = 0
        ORDER BY d.delivered_at ASC
      `).all(t);
    return {
      riderId: t,
      deliveredOrdersCount: (r == null ? void 0 : r.delivered_orders_count) || 0,
      pendingCodCents: (r == null ? void 0 : r.pending_cod_cents) || 0,
      deliveries: n
    };
  },
  settleRiderCod({ branchId: t, riderId: e, settledByUserId: r, notes: n = "" }) {
    var _;
    const s = E(), i = t || ((_ = s.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _.id), a = (/* @__PURE__ */ new Date()).toISOString(), o = be(), c = this.getRiderPendingCod(e);
    if (c.deliveredOrdersCount === 0 || c.pendingCodCents === 0)
      throw new Error("No pending Cash-on-Delivery funds to settle for this rider.");
    return s.transaction(() => {
      s.prepare(`
        INSERT INTO rider_settlements (
          id, branch_id, rider_id, settled_by_user_id,
          total_collected_cents, orders_count, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        o,
        i,
        e,
        r,
        c.pendingCodCents,
        c.deliveredOrdersCount,
        n || null,
        a
      ), s.prepare(`
        UPDATE deliveries
        SET cod_settled = 1, settlement_id = ?, settled_at = ?, updated_at = ?
        WHERE rider_id = ? AND status = 'DELIVERED' AND cod_settled = 0
      `).run(o, a, a, e);
    })(), {
      settlementId: o,
      riderId: e,
      totalSettledCents: c.pendingCodCents,
      ordersSettledCount: c.deliveredOrdersCount,
      settledAt: a
    };
  },
  getSettlementHistory(t, { riderId: e = null, date: r = null } = {}) {
    var o;
    const n = E(), s = t || ((o = n.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : o.id);
    let i = `
      SELECT
        s.*,
        r.name as rider_name,
        r.phone as rider_phone,
        u.display_name as settled_by_name
      FROM rider_settlements s
      JOIN riders r ON s.rider_id = r.id
      JOIN users u ON s.settled_by_user_id = u.id
      WHERE s.branch_id = ?
    `;
    const a = [s];
    return e && (i += " AND s.rider_id = ?", a.push(e)), r && (i += " AND s.created_at LIKE ?", a.push(`${r}%`)), i += " ORDER BY s.created_at DESC", n.prepare(i).all(...a);
  },
  // =========================================================================
  // 5. SUMMARY METRICS
  // =========================================================================
  getSummary(t) {
    var p, l, T, R, S, L, A, b;
    const e = E(), r = t || ((p = e.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : p.id), n = ((l = e.prepare("SELECT COUNT(*) as count FROM riders WHERE branch_id = ? AND is_active = 1").get(r)) == null ? void 0 : l.count) || 0, s = ((T = e.prepare("SELECT COUNT(*) as count FROM riders WHERE branch_id = ? AND is_active = 1 AND status = 'AVAILABLE'").get(r)) == null ? void 0 : T.count) || 0, i = ((R = e.prepare("SELECT COUNT(*) as count FROM riders WHERE branch_id = ? AND is_active = 1 AND status = 'OUT_FOR_DELIVERY'").get(r)) == null ? void 0 : R.count) || 0, a = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), o = ((S = e.prepare("SELECT COUNT(*) as count FROM deliveries WHERE branch_id = ? AND status IN ('PENDING', 'ASSIGNED')").get(r)) == null ? void 0 : S.count) || 0, c = ((L = e.prepare("SELECT COUNT(*) as count FROM deliveries WHERE branch_id = ? AND status = 'OUT_FOR_DELIVERY'").get(r)) == null ? void 0 : L.count) || 0, d = ((A = e.prepare("SELECT COUNT(*) as count FROM deliveries WHERE branch_id = ? AND status = 'DELIVERED' AND created_at LIKE ?").get(r, `${a}%`)) == null ? void 0 : A.count) || 0, _ = ((b = e.prepare("SELECT COALESCE(SUM(cod_collected_cents), 0) as total FROM deliveries WHERE branch_id = ? AND status = 'DELIVERED' AND cod_settled = 0").get(r)) == null ? void 0 : b.total) || 0;
    return {
      totalRiders: n,
      availableRiders: s,
      onTripRiders: i,
      pendingDispatches: o,
      outForDelivery: c,
      deliveredToday: d,
      pendingCodCents: _
    };
  }
};
function xt() {
  u.handle("delivery:get-zones", async (t, e) => M.getZones(e)), u.handle("delivery:create-zone", async (t, e) => M.createZone(e)), u.handle("delivery:update-zone", async (t, { id: e, data: r }) => M.updateZone(e, r)), u.handle("delivery:get-riders", async (t, { branchId: e, status: r } = {}) => M.getRiders(e, r)), u.handle("delivery:get-rider-by-id", async (t, e) => M.getRiderById(e)), u.handle("delivery:create-rider", async (t, e) => M.createRider(e)), u.handle("delivery:update-rider", async (t, { id: e, data: r }) => M.updateRider(e, r)), u.handle("delivery:update-rider-status", async (t, { id: e, status: r }) => M.updateRiderStatus(e, r)), u.handle("delivery:get-deliveries", async (t, { branchId: e, filters: r } = {}) => M.getDeliveries(e, r)), u.handle("delivery:get-delivery-by-id", async (t, e) => M.getDeliveryById(e)), u.handle("delivery:create-delivery", async (t, e) => M.createDelivery(e)), u.handle("delivery:assign-rider", async (t, { deliveryId: e, riderId: r }) => M.assignRider(e, r)), u.handle("delivery:dispatch", async (t, e) => M.dispatchDelivery(e)), u.handle("delivery:complete", async (t, { deliveryId: e, codCollectedCents: r }) => M.completeDelivery(e, { codCollectedCents: r })), u.handle("delivery:fail", async (t, { deliveryId: e, reason: r }) => M.failDelivery(e, r)), u.handle("delivery:get-rider-pending-cod", async (t, e) => M.getRiderPendingCod(e)), u.handle("delivery:settle-rider-cod", async (t, { branchId: e, riderId: r, notes: n }) => {
    const s = O.getCurrentSession(), i = s == null ? void 0 : s.userId;
    if (!i) throw new Error("Authentication required to settle rider funds.");
    return M.settleRiderCod({
      branchId: e,
      riderId: r,
      settledByUserId: i,
      notes: n
    });
  }), u.handle("delivery:get-settlement-history", async (t, { branchId: e, params: r } = {}) => M.getSettlementHistory(e, r)), u.handle("delivery:get-summary", async (t, e) => M.getSummary(e));
}
const Te = {
  /**
   * Get Comprehensive Sales Summary for a Date Range
   * @param {string} branchId 
   * @param {{ startDate?: string, endDate?: string }} filter 
   */
  getSalesSummary(t, e = {}) {
    var _;
    const r = E(), n = t || ((_ = r.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _.id), s = e.startDate || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), i = e.endDate || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), a = r.prepare(`
        SELECT
          COUNT(*) as total_orders,
          COALESCE(SUM(total_cents), 0) as total_sales_cents,
          COALESCE(SUM(subtotal_cents), 0) as subtotal_cents,
          COALESCE(SUM(discount_cents), 0) as total_discount_cents,
          COALESCE(SUM(tax_cents), 0) as total_tax_cents,
          COALESCE(SUM(service_charge_cents), 0) as total_service_charge_cents,
          COALESCE(SUM(delivery_charge_cents), 0) as total_delivery_charge_cents,
          COALESCE(AVG(total_cents), 0) as average_order_cents
        FROM orders
        WHERE branch_id = ?
          AND status IN ('COMPLETED', 'DELIVERED', 'SERVED')
          AND created_at >= ?
          AND created_at <= ? || 'T23:59:59.999Z'
      `).get(n, s, i), o = r.prepare(`
        SELECT
          order_type,
          COUNT(*) as order_count,
          COALESCE(SUM(total_cents), 0) as total_cents
        FROM orders
        WHERE branch_id = ?
          AND status IN ('COMPLETED', 'DELIVERED', 'SERVED')
          AND created_at >= ?
          AND created_at <= ? || 'T23:59:59.999Z'
        GROUP BY order_type
      `).all(n, s, i), c = r.prepare(`
        SELECT
          p.payment_method,
          COUNT(p.id) as payment_count,
          COALESCE(SUM(p.amount_cents), 0) as total_cents
        FROM payments p
        JOIN orders o ON p.order_id = o.id
        WHERE o.branch_id = ?
          AND p.status = 'COMPLETED'
          AND p.created_at >= ?
          AND p.created_at <= ? || 'T23:59:59.999Z'
        GROUP BY p.payment_method
      `).all(n, s, i), d = r.prepare(`
        SELECT
          substr(created_at, 1, 10) as date,
          COUNT(*) as order_count,
          COALESCE(SUM(total_cents), 0) as total_cents
        FROM orders
        WHERE branch_id = ?
          AND status IN ('COMPLETED', 'DELIVERED', 'SERVED')
          AND created_at >= ?
          AND created_at <= ? || 'T23:59:59.999Z'
        GROUP BY substr(created_at, 1, 10)
        ORDER BY date ASC
      `).all(n, s, i);
    return {
      startDate: s,
      endDate: i,
      overall: a,
      byOrderType: o,
      byPaymentMethod: c,
      dailyTimeline: d
    };
  },
  /**
   * Top Selling & Slow Moving Items Report
   */
  getProductPerformance(t, e = {}) {
    var c;
    const r = E(), n = t || ((c = r.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : c.id), s = e.startDate || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), i = e.endDate || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), a = r.prepare(`
        SELECT
          oi.product_id,
          oi.item_name,
          p.category_id,
          c.name as category_name,
          SUM(oi.quantity) as total_quantity_sold,
          SUM(oi.total_cents) as total_revenue_cents,
          p.cost_price_cents
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN products p ON oi.product_id = p.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE o.branch_id = ?
          AND o.status IN ('COMPLETED', 'DELIVERED', 'SERVED')
          AND o.created_at >= ?
          AND o.created_at <= ? || 'T23:59:59.999Z'
        GROUP BY oi.product_id, oi.item_name
        ORDER BY total_quantity_sold DESC
      `).all(n, s, i), o = r.prepare(`
        SELECT
          COALESCE(c.name, 'Uncategorized') as category_name,
          SUM(oi.quantity) as total_quantity_sold,
          SUM(oi.total_cents) as total_revenue_cents
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN products p ON oi.product_id = p.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE o.branch_id = ?
          AND o.status IN ('COMPLETED', 'DELIVERED', 'SERVED')
          AND o.created_at >= ?
          AND o.created_at <= ? || 'T23:59:59.999Z'
        GROUP BY c.id, c.name
        ORDER BY total_revenue_cents DESC
      `).all(n, s, i);
    return {
      items: a,
      categoryBreakdown: o
    };
  },
  /**
   * Hourly Peak Rush Breakdown (00:00 to 23:00)
   */
  getHourlyBreakdown(t, e = {}) {
    var d, _, p;
    const r = E(), n = t || ((d = r.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : d.id), s = e.startDate || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), i = e.endDate || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), a = r.prepare(`
        SELECT
          CAST(strftime('%H', created_at) AS INTEGER) as hour,
          COUNT(*) as order_count,
          COALESCE(SUM(total_cents), 0) as total_cents
        FROM orders
        WHERE branch_id = ?
          AND status IN ('COMPLETED', 'DELIVERED', 'SERVED')
          AND created_at >= ?
          AND created_at <= ? || 'T23:59:59.999Z'
        GROUP BY hour
        ORDER BY hour ASC
      `).all(n, s, i), o = {};
    a.forEach((l) => {
      o[l.hour] = l;
    });
    const c = [];
    for (let l = 0; l < 24; l++)
      c.push({
        hour: l,
        label: `${l.toString().padStart(2, "0")}:00`,
        orderCount: ((_ = o[l]) == null ? void 0 : _.order_count) || 0,
        totalCents: ((p = o[l]) == null ? void 0 : p.total_cents) || 0
      });
    return c;
  },
  /**
   * Financial Profit & Loss Overview
   */
  getProfitAndLoss(t, e = {}) {
    var R;
    const r = E(), n = t || ((R = r.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : R.id), s = e.startDate || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), i = e.endDate || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), a = r.prepare(`
        SELECT
          COALESCE(SUM(total_cents), 0) as total_revenue_cents,
          COALESCE(SUM(discount_cents), 0) as total_discount_cents,
          COALESCE(SUM(tax_cents), 0) as total_tax_cents
        FROM orders
        WHERE branch_id = ?
          AND status IN ('COMPLETED', 'DELIVERED', 'SERVED')
          AND created_at >= ?
          AND created_at <= ? || 'T23:59:59.999Z'
      `).get(n, s, i), o = r.prepare(`
        SELECT
          COALESCE(SUM(quantity * unit_cost_cents), 0) as total_cogs_cents
        FROM stock_movements
        WHERE branch_id = ?
          AND movement_type = 'SALE_DEDUCTION'
          AND created_at >= ?
          AND created_at <= ? || 'T23:59:59.999Z'
      `).get(n, s, i), c = r.prepare(`
        SELECT
          COALESCE(SUM(amount_cents), 0) as total_expenses_cents
        FROM expenses
        WHERE branch_id = ?
          AND expense_date >= ?
          AND expense_date <= ?
      `).get(n, s, i), d = (a == null ? void 0 : a.total_revenue_cents) || 0, _ = (o == null ? void 0 : o.total_cogs_cents) || 0, p = Math.max(0, d - _), l = (c == null ? void 0 : c.total_expenses_cents) || 0, T = d - _ - l;
    return {
      revenueCents: d,
      discountCents: (a == null ? void 0 : a.total_discount_cents) || 0,
      taxCents: (a == null ? void 0 : a.total_tax_cents) || 0,
      cogsCents: _,
      grossProfitCents: p,
      expensesCents: l,
      netProfitCents: T,
      marginPercent: d > 0 ? (T / d * 100).toFixed(1) : "0.0"
    };
  },
  /**
   * Void, Cancellation & Refund Audit
   */
  getVoidAndRefundAudits(t, e = {}) {
    var c;
    const r = E(), n = t || ((c = r.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : c.id), s = e.startDate || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), i = e.endDate || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), a = r.prepare(`
        SELECT
          o.*,
          u.display_name as cashier_name
        FROM orders o
        LEFT JOIN users u ON o.cashier_id = u.id
        WHERE o.branch_id = ?
          AND o.status IN ('CANCELLED', 'REFUNDED')
          AND o.created_at >= ?
          AND o.created_at <= ? || 'T23:59:59.999Z'
        ORDER BY o.created_at DESC
      `).all(n, s, i), o = r.prepare(`
        SELECT
          o.*,
          u.display_name as cashier_name
        FROM orders o
        LEFT JOIN users u ON o.cashier_id = u.id
        WHERE o.branch_id = ?
          AND o.discount_cents > 0
          AND o.created_at >= ?
          AND o.created_at <= ? || 'T23:59:59.999Z'
        ORDER BY o.created_at DESC
      `).all(n, s, i);
    return {
      voidOrders: a,
      discountedOrders: o
    };
  },
  /**
   * System Audit Logs History
   */
  getAuditLogs(t, e = 100) {
    var s;
    const r = E(), n = t || ((s = r.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : s.id);
    return r.prepare(`
        SELECT
          a.*,
          u.username,
          u.display_name as user_display_name
        FROM audit_logs a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.branch_id = ? OR a.branch_id IS NULL
        ORDER BY a.created_at DESC
        LIMIT ?
      `).all(n, e);
  }
};
function Vt() {
  u.handle("reports:get-sales-summary", async (t, { branchId: e, filter: r } = {}) => Te.getSalesSummary(e, r)), u.handle("reports:get-product-performance", async (t, { branchId: e, filter: r } = {}) => Te.getProductPerformance(e, r)), u.handle("reports:get-hourly-breakdown", async (t, { branchId: e, filter: r } = {}) => Te.getHourlyBreakdown(e, r)), u.handle("reports:get-profit-and-loss", async (t, { branchId: e, filter: r } = {}) => Te.getProfitAndLoss(e, r)), u.handle("reports:get-void-audits", async (t, { branchId: e, filter: r } = {}) => Te.getVoidAndRefundAudits(e, r)), u.handle("reports:get-audit-logs", async (t, { branchId: e, limit: r } = {}) => Te.getAuditLogs(e, r)), u.handle("settings:get-all", async () => he.getAll()), u.handle("settings:get", async (t, e) => he.get(e)), u.handle("settings:save-batch", async (t, e) => {
    for (const [r, n] of Object.entries(e))
      he.set(r, String(n));
    return he.getAll();
  });
}
function Gt(t) {
  u.handle(q.APP_GET_INFO, async () => ({
    appName: "Restaurant & Fast Food Management System",
    version: ie.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    osRelease: ut.release(),
    userDataPath: ie.getPath("userData"),
    appPath: ie.getAppPath(),
    isPackaged: ie.isPackaged,
    mode: process.env.NODE_ENV || "production",
    offlineOnly: !0,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  })), u.handle(q.APP_PING, async (e, r) => ({
    pong: !0,
    received: r,
    time: Date.now()
  })), u.on(q.WINDOW_MINIMIZE, () => {
    t && !t.isDestroyed() && t.minimize();
  }), u.on(q.WINDOW_MAXIMIZE, () => {
    t && !t.isDestroyed() && (t.isMaximized() ? t.unmaximize() : t.maximize());
  }), u.on(q.WINDOW_CLOSE, () => {
    t && !t.isDestroyed() && t.close();
  }), u.handle(q.WINDOW_IS_MAXIMIZED, () => t && !t.isDestroyed() ? t.isMaximized() : !1), gt(), bt(), vt(), Dt(), Ut(), wt(), Xt(), Ht(), Wt(), kt(), xt(), Vt();
}
const nt = H.dirname(Et(import.meta.url));
process.env.APP_ROOT = H.join(nt, "..");
const Ae = process.env.VITE_DEV_SERVER_URL, Zt = H.join(process.env.APP_ROOT, "dist-electron"), st = H.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = Ae ? H.join(process.env.APP_ROOT, "public") : st;
let ne = null;
function it() {
  ne = new et({
    title: "Restaurant & Fast Food Management System",
    icon: H.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: !1,
    // Show gracefully when ready
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: H.join(nt, "preload.cjs"),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !1,
      // Required for better-sqlite3 native IPC communication if needed
      webSecurity: !0,
      allowRunningInsecureContent: !1
    }
  }), Gt(ne), ne.once("ready-to-show", () => {
    ne.show();
  }), ne.webContents.setWindowOpenHandler(({ url: t }) => ((t.startsWith("https:") || t.startsWith("http:")) && dt.openExternal(t), { action: "deny" })), ne.webContents.on("will-navigate", (t, e) => {
    const r = new URL(e);
    if (Ae) {
      const n = new URL(Ae).origin;
      r.origin !== n && t.preventDefault();
    } else r.protocol !== "file:" && t.preventDefault();
  }), Ae ? ne.loadURL(Ae) : ne.loadFile(H.join(st, "index.html"));
}
process.on("uncaughtException", (t) => {
  console.error("[Electron Main] Uncaught Exception:", t);
});
process.on("unhandledRejection", (t) => {
  console.error("[Electron Main] Unhandled Rejection:", t);
});
ie.on("window-all-closed", () => {
  process.platform !== "darwin" && (ie.quit(), ne = null);
});
ie.on("activate", () => {
  et.getAllWindows().length === 0 && it();
});
ie.whenReady().then(it);
export {
  Zt as MAIN_DIST,
  st as RENDERER_DIST,
  Ae as VITE_DEV_SERVER_URL
};
