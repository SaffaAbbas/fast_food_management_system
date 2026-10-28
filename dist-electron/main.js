import { ipcMain, dialog, BrowserWindow, app, shell } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import os from "node:os";
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
const migration001 = {
  version: 1,
  name: "initial_core_schema",
  up: (db) => {
    db.exec(`
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
};
const migration002 = {
  version: 2,
  name: "combos_and_deals_schema",
  up: (db) => {
    db.exec(`
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
};
const migration003 = {
  version: 3,
  name: "catalog_enhancements_schema",
  up: (db) => {
    try {
      db.exec("ALTER TABLE categories ADD COLUMN parent_id TEXT;");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE categories ADD COLUMN is_visible_pos INTEGER DEFAULT 1;");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE categories ADD COLUMN is_visible_online INTEGER DEFAULT 1;");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE products ADD COLUMN is_featured INTEGER DEFAULT 0;");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE products ADD COLUMN is_discount_eligible INTEGER DEFAULT 1;");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE products ADD COLUMN min_order_qty INTEGER DEFAULT 1;");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE products ADD COLUMN max_order_qty INTEGER DEFAULT 99;");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE products ADD COLUMN price_dine_in_cents INTEGER DEFAULT NULL;");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE products ADD COLUMN price_takeaway_cents INTEGER DEFAULT NULL;");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE products ADD COLUMN price_delivery_cents INTEGER DEFAULT NULL;");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE combos ADD COLUMN is_available INTEGER DEFAULT 1;");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE combos ADD COLUMN available_from TEXT DEFAULT NULL;");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE combos ADD COLUMN available_to TEXT DEFAULT NULL;");
    } catch (e) {
    }
  }
};
const migration004 = {
  version: 4,
  name: "kitchen_stations_schema",
  up: (db) => {
    db.exec(`
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
      db.exec("ALTER TABLE products ADD COLUMN kitchen_station_id TEXT REFERENCES kitchen_stations(id);");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE order_items ADD COLUMN kitchen_station_id TEXT REFERENCES kitchen_stations(id);");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE order_items ADD COLUMN started_cooking_at TEXT;");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE order_items ADD COLUMN completed_cooking_at TEXT;");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE orders ADD COLUMN kitchen_accepted_at TEXT;");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE orders ADD COLUMN kitchen_ready_at TEXT;");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE orders ADD COLUMN kitchen_completed_at TEXT;");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE orders ADD COLUMN target_prep_minutes INTEGER DEFAULT 15;");
    } catch (e) {
    }
    const branch = db.prepare("SELECT id FROM branches LIMIT 1").get();
    if (branch) {
      const existing = db.prepare("SELECT COUNT(*) as count FROM kitchen_stations WHERE branch_id = ?").get(branch.id);
      if (existing.count === 0) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const insertStation = db.prepare(`
          INSERT INTO kitchen_stations (id, branch_id, name, code, color_code, display_order, is_active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        `);
        insertStation.run("station-grill", branch.id, "Grill & Fryer", "GRILL", "#ef4444", 1, now);
        insertStation.run("station-pizza", branch.id, "Pizza & Oven", "PIZZA", "#f59e0b", 2, now);
        insertStation.run("station-bar", branch.id, "Bar & Beverages", "DRINKS", "#06b6d4", 3, now);
        insertStation.run("station-expo", branch.id, "Packaging & Expo", "EXPO", "#10b981", 4, now);
      }
    }
  }
};
const migration005 = {
  version: 5,
  name: "inventory_recipe_purchases_schema",
  up: (db) => {
    try {
      db.exec("ALTER TABLE inventory_items ADD COLUMN category TEXT DEFAULT 'General';");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE inventory_items ADD COLUMN reorder_level REAL DEFAULT 10.0;");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE inventory_items ADD COLUMN supplier_id TEXT REFERENCES suppliers(id);");
    } catch (e) {
    }
    try {
      db.exec("ALTER TABLE recipe_ingredients ADD COLUMN wastage_percentage REAL DEFAULT 0.0;");
    } catch (e) {
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_order_items (
        id TEXT PRIMARY KEY,
        po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
        quantity REAL NOT NULL,
        unit_cost_cents INTEGER NOT NULL,
        total_cents INTEGER NOT NULL
      );
    `);
    db.exec(`
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
    `);
    const expCatCount = db.prepare("SELECT COUNT(*) as count FROM expense_categories").get().count;
    if (expCatCount === 0) {
      const insertCat = db.prepare("INSERT INTO expense_categories (id, name, code) VALUES (?, ?, ?)");
      insertCat.run("exp-rent", "Rent & Property", "RENT");
      insertCat.run("exp-util", "Utilities (Electricity, Water, Gas)", "UTILITIES");
      insertCat.run("exp-salary", "Staff Salaries & Wages", "SALARY");
      insertCat.run("exp-maint", "Repairs & Maintenance", "MAINTENANCE");
      insertCat.run("exp-mkt", "Marketing & Social Media Ads", "MARKETING");
      insertCat.run("exp-trans", "Delivery & Fuel / Transport", "TRANSPORT");
      insertCat.run("exp-pack", "Packaging & Disposables", "PACKAGING");
      insertCat.run("exp-misc", "Miscellaneous Operational Expenses", "MISC");
    }
  }
};
function uuid$d() {
  return crypto.randomUUID();
}
const migration006 = {
  version: 6,
  name: "shifts_staff_attendance_schema",
  up: (db) => {
    const columnsToAdd = [
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
    for (const col of columnsToAdd) {
      try {
        db.exec(`ALTER TABLE cash_sessions ADD COLUMN ${col};`);
      } catch (e) {
      }
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS cash_drawer_denominations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
        denomination_cents INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        total_cents INTEGER NOT NULL DEFAULT 0
      );
    `);
    db.exec(`
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
    `);
    db.exec(`
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
    `);
    db.exec(`
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
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const activeBranch = db.prepare("SELECT id FROM branches LIMIT 1").get();
    const branchId = activeBranch == null ? void 0 : activeBranch.id;
    if (branchId) {
      const shiftCount = db.prepare("SELECT COUNT(*) as count FROM staff_shifts").get().count;
      if (shiftCount === 0) {
        const shifts = [
          { name: "Morning Shift", start: "08:00", end: "16:00" },
          { name: "Evening Shift", start: "16:00", end: "00:00" },
          { name: "Night Shift", start: "00:00", end: "08:00" }
        ];
        const insertShift = db.prepare(`
          INSERT INTO staff_shifts (id, branch_id, name, start_time, end_time, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        `);
        for (const s of shifts) {
          insertShift.run(uuid$d(), branchId, s.name, s.start, s.end, now, now);
        }
      }
      const empCount = db.prepare("SELECT COUNT(*) as count FROM employees").get().count;
      if (empCount === 0) {
        const users = db.prepare("SELECT id, username, display_name, role_id FROM users").all();
        const insertEmp = db.prepare(`
          INSERT INTO employees (
            id, branch_id, user_id, employee_code, first_name, last_name,
            email, phone, designation, role_id, salary_type, base_rate_cents,
            hire_date, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        `);
        let codeIndex = 101;
        for (const u of users) {
          const names = u.display_name.split(" ");
          const firstName = names[0] || u.username;
          const lastName = names.slice(1).join(" ") || "Staff";
          const designation = u.username.includes("admin") ? "General Manager" : u.username.includes("manager") ? "Floor Manager" : u.username.includes("cashier") ? "Senior Cashier" : u.username.includes("waiter") ? "Head Waiter" : u.username.includes("chef") ? "Head Chef" : "Staff Member";
          insertEmp.run(
            uuid$d(),
            branchId,
            u.id,
            `EMP-${codeIndex++}`,
            firstName,
            lastName,
            `${u.username}@restaurant.local`,
            "+1 555-01" + codeIndex,
            designation,
            u.role_id,
            "MONTHLY",
            25e4,
            // $2,500/mo base
            "2026-01-01",
            now,
            now
          );
        }
      }
    }
  }
};
function uuid$c() {
  return crypto.randomUUID();
}
const migration007 = {
  version: 7,
  name: "crm_loyalty_reservations_schema",
  up: (db) => {
    var _a;
    const customerCols = [
      "tag TEXT DEFAULT 'REGULAR'",
      "credit_balance_cents INTEGER DEFAULT 0",
      "birth_date TEXT",
      "is_active INTEGER DEFAULT 1"
    ];
    for (const col of customerCols) {
      try {
        db.exec(`ALTER TABLE customers ADD COLUMN ${col};`);
      } catch (e) {
      }
    }
    db.exec(`
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
    const reservationCols = [
      "customer_id TEXT REFERENCES customers(id)",
      "reservation_date TEXT",
      "duration_minutes INTEGER DEFAULT 90",
      "deposit_cents INTEGER DEFAULT 0",
      "deposit_payment_method TEXT",
      "updated_at TEXT"
    ];
    for (const col of reservationCols) {
      try {
        db.exec(`ALTER TABLE reservations ADD COLUMN ${col};`);
      } catch (e) {
      }
    }
    db.exec(`
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
    const branch = db.prepare("SELECT id FROM branches LIMIT 1").get();
    if (branch == null ? void 0 : branch.id) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const couponCount = ((_a = db.prepare("SELECT COUNT(*) as count FROM coupons").get()) == null ? void 0 : _a.count) || 0;
      if (couponCount === 0) {
        const defaultCoupons = [
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
        ];
        const insertCoupon = db.prepare(`
          INSERT INTO coupons (
            id, branch_id, code, title, discount_type, discount_value,
            min_order_cents, max_discount_cents, start_date, end_date,
            usage_limit, times_used, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, ?, ?)
        `);
        for (const c of defaultCoupons) {
          insertCoupon.run(
            uuid$c(),
            branch.id,
            c.code,
            c.title,
            c.type,
            c.val,
            c.min,
            c.max,
            "2026-01-01",
            "2026-12-31",
            now,
            now
          );
        }
      }
    }
  }
};
const migration008 = {
  version: 8,
  name: "delivery_dispatch_riders_schema",
  up: (db) => {
    db.exec(`
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
    `);
    db.exec(`
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
    `);
    db.exec(`
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
    `);
    db.exec(`
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
};
const migration009 = {
  version: 9,
  name: "refunds_financial_integrity",
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS refunds (
        id TEXT PRIMARY KEY,
        branch_id TEXT REFERENCES branches(id),
        order_id TEXT NOT NULL REFERENCES orders(id),
        payment_id TEXT REFERENCES payments(id),
        cashier_id TEXT REFERENCES users(id),
        amount_cents INTEGER NOT NULL,
        reason TEXT NOT NULL,
        restock INTEGER DEFAULT 1,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);
      CREATE INDEX IF NOT EXISTS idx_refunds_created ON refunds(created_at);
    `);
    const orderCols = db.prepare("PRAGMA table_info(orders)").all().map((c) => c.name);
    if (!orderCols.includes("refunded_cents")) {
      db.exec("ALTER TABLE orders ADD COLUMN refunded_cents INTEGER DEFAULT 0");
    }
    if (!orderCols.includes("loyalty_awarded")) {
      db.exec("ALTER TABLE orders ADD COLUMN loyalty_awarded INTEGER DEFAULT 0");
    }
    if (!orderCols.includes("stock_posted")) {
      db.exec("ALTER TABLE orders ADD COLUMN stock_posted INTEGER DEFAULT 0");
    }
  }
};
const migration010 = {
  version: 10,
  name: "sync_outbox_and_granular_permissions",
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_metadata (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT,
        updated_at TEXT NOT NULL
      );
    `);
    const extraPermissions = [
      ["reservations:manage", "Manage Reservations", "RESERVATIONS"],
      ["delivery:manage", "Manage Delivery & Riders", "DELIVERY"],
      ["expenses:manage", "Manage Expenses", "EXPENSES"],
      ["cash:manage", "Manage Cash Drawer", "CASH"]
    ];
    const now = (/* @__PURE__ */ new Date()).toISOString();
    for (const [code, name, module] of extraPermissions) {
      const existing = db.prepare("SELECT id FROM permissions WHERE code = ?").get(code);
      let permId = existing == null ? void 0 : existing.id;
      if (!permId) {
        permId = crypto.randomUUID();
        db.prepare("INSERT INTO permissions (id, code, name, module, description) VALUES (?, ?, ?, ?, ?)").run(permId, code, name, module, name);
      }
      const roleCodes = ["super_admin", "branch_admin", "manager"];
      if (code === "reservations:manage") roleCodes.push("receptionist");
      if (code === "delivery:manage") roleCodes.push("delivery_rider", "cashier");
      if (code === "expenses:manage") roleCodes.push("accountant");
      if (code === "cash:manage") roleCodes.push("cashier");
      for (const roleCode of roleCodes) {
        const role = db.prepare("SELECT id FROM roles WHERE code = ?").get(roleCode);
        if (role) {
          db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)").run(role.id, permId);
        }
      }
    }
    db.prepare(`
      INSERT INTO sync_metadata (setting_key, setting_value, updated_at)
      VALUES ('cloud_sync_enabled', '0', ?)
      ON CONFLICT(setting_key) DO NOTHING
    `).run(now);
  }
};
function addColumn$1(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
const migration011 = {
  version: 11,
  name: "media_image_columns",
  up: (db) => {
    addColumn$1(db, "products", "image_url", "TEXT");
    addColumn$1(db, "categories", "image_url", "TEXT");
    addColumn$1(db, "combos", "image_url", "TEXT");
    addColumn$1(db, "customers", "image_url", "TEXT");
    addColumn$1(db, "employees", "image_url", "TEXT");
    addColumn$1(db, "users", "image_url", "TEXT");
    addColumn$1(db, "recipes", "image_url", "TEXT");
    addColumn$1(db, "riders", "image_url", "TEXT");
    addColumn$1(db, "inventory_items", "image_url", "TEXT");
    addColumn$1(db, "branches", "logo_url", "TEXT");
    addColumn$1(db, "roles", "image_url", "TEXT");
  }
};
function addColumn(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
const migration012 = {
  version: 12,
  name: "roles_and_media_columns_guard",
  up: (db) => {
    addColumn(db, "products", "image_url", "TEXT");
    addColumn(db, "categories", "image_url", "TEXT");
    addColumn(db, "combos", "image_url", "TEXT");
    addColumn(db, "customers", "image_url", "TEXT");
    addColumn(db, "employees", "image_url", "TEXT");
    addColumn(db, "users", "image_url", "TEXT");
    addColumn(db, "recipes", "image_url", "TEXT");
    addColumn(db, "riders", "image_url", "TEXT");
    addColumn(db, "inventory_items", "image_url", "TEXT");
    addColumn(db, "branches", "logo_url", "TEXT");
    addColumn(db, "roles", "image_url", "TEXT");
  }
};
const MIGRATIONS = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
  migration012
];
function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  const appliedRows = db.prepare("SELECT version FROM schema_migrations ORDER BY version ASC").all();
  const appliedSet = new Set(appliedRows.map((r) => r.version));
  let appliedCount = 0;
  let currentVersion = appliedRows.length > 0 ? appliedRows[appliedRows.length - 1].version : 0;
  for (const migration of MIGRATIONS) {
    if (!appliedSet.has(migration.version)) {
      console.log(`[Database Migration] Applying v${migration.version}: ${migration.name}...`);
      const runMigrationTx = db.transaction(() => {
        migration.up(db);
        db.prepare(
          "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"
        ).run(migration.version, migration.name, (/* @__PURE__ */ new Date()).toISOString());
      });
      runMigrationTx();
      appliedCount++;
      currentVersion = migration.version;
      console.log(`[Database Migration] Successfully applied v${migration.version}: ${migration.name}`);
    }
  }
  return {
    appliedCount,
    currentVersion
  };
}
let currentSession = null;
function hashSecret(secret) {
  if (!secret) return null;
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(secret, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}
function verifySecret(secret, storedHash) {
  if (!secret || !storedHash || !storedHash.includes(":")) return false;
  try {
    const [salt, key] = storedHash.split(":");
    const keyBuffer = Buffer.from(key, "hex");
    const derivedKey = crypto.scryptSync(secret, salt, 64);
    if (keyBuffer.length !== derivedKey.length) return false;
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch (err) {
    return false;
  }
}
const authRepository$1 = {
  /**
   * Get active user session
   */
  getCurrentSession: () => {
    return currentSession;
  },
  /**
   * Clear active user session (Logout)
   */
  logout: () => {
    if (currentSession) {
      const db = getDb();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      db.prepare(`
        INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
        VALUES (?, ?, ?, 'LOGOUT', 'USER', ?, ?, ?)
      `).run(crypto.randomUUID(), currentSession.branchId, currentSession.id, currentSession.id, JSON.stringify({ username: currentSession.username }), now);
    }
    currentSession = null;
    return { success: true };
  },
  /**
   * Authenticate user via username and password
   */
  loginWithPassword: (username, password) => {
    const db = getDb();
    (/* @__PURE__ */ new Date()).toISOString();
    const user = db.prepare(`
      SELECT u.id, u.branch_id, u.role_id, u.username, u.display_name,
             u.password_hash, u.pin_hash, u.is_active,
             COALESCE(r.code, 'cashier') as role_code,
             COALESCE(r.name, 'Staff Member') as role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE LOWER(u.username) = LOWER(?) AND u.is_active = 1
    `).get(username);
    if (!user) {
      logAudit$8(null, "FAILED_LOGIN", "USER", null, { reason: "User not found", username });
      throw new Error("Invalid username or credentials.");
    }
    const isValid = verifySecret(password, user.password_hash);
    if (!isValid) {
      logAudit$8(user.branch_id, "FAILED_LOGIN", "USER", user.id, { reason: "Password mismatch", username });
      throw new Error("Invalid password.");
    }
    return createSessionForUser(user, "PASSWORD");
  },
  /**
   * Quick-PIN login (fast cashier / waiter authentication)
   */
  loginWithPin: (pin, userId = null, username = null) => {
    const db = getDb();
    let query = `
      SELECT u.id, u.branch_id, u.role_id, u.username, u.display_name,
             u.password_hash, u.pin_hash, u.is_active,
             COALESCE(r.code, 'cashier') as role_code,
             COALESCE(r.name, 'Staff Member') as role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.is_active = 1
    `;
    const params = [];
    if (userId || username) {
      const cleanUser = (userId || "").replace(/^usr-/, "");
      query += " AND (u.id = ? OR LOWER(u.username) = LOWER(?) OR LOWER(u.username) = LOWER(?))";
      params.push(userId || "", username || userId || "", cleanUser);
    }
    const users = db.prepare(query).all(...params);
    let authenticatedUser = null;
    for (const u of users) {
      if (verifySecret(pin, u.pin_hash)) {
        authenticatedUser = u;
        break;
      }
    }
    if (!authenticatedUser) {
      logAudit$8(null, "FAILED_LOGIN", "USER", null, { reason: "Invalid PIN" });
      throw new Error("Invalid PIN code.");
    }
    return createSessionForUser(authenticatedUser, "PIN");
  },
  /**
   * Get all active users with their roles (for switch user / fast PIN login UI)
   */
  getLoginUsers: () => {
    const db = getDb();
    return db.prepare(`
      SELECT u.id, u.username, u.display_name as displayName,
             COALESCE(r.code, 'cashier') as role_code,
             COALESCE(r.name, 'Staff Member') as role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.is_active = 1
      ORDER BY u.display_name ASC
    `).all();
  },
  /**
   * Check if a specific permission is granted to current user
   */
  hasPermission: (permissionCode) => {
    if (!currentSession) return false;
    if (currentSession.roleCode === "super_admin") return true;
    return currentSession.permissions.includes(permissionCode);
  },
  /**
   * Create a new staff user with hashed credentials
   */
  createUser: ({ branchId, roleId, username, displayName, password, pin }) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const userId = crypto.randomUUID();
    const passwordHash = password ? hashSecret(password) : null;
    const pinHash = pin ? hashSecret(pin) : null;
    db.prepare(`
      INSERT INTO users (id, branch_id, role_id, username, display_name, password_hash, pin_hash, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(userId, branchId, roleId, username, displayName, passwordHash, pinHash, now, now);
    logAudit$8(branchId, "CREATE_USER", "USER", userId, { username, roleId });
    return { id: userId, username, displayName };
  },
  /**
   * Set user PIN (hashed)
   */
  setUserPin: (userId, newPin) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const hashed = hashSecret(newPin);
    db.prepare("UPDATE users SET pin_hash = ?, updated_at = ? WHERE id = ?").run(hashed, now, userId);
    return true;
  },
  needsSetup: () => {
    const db = getDb();
    const count = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    return count === 0;
  },
  completeInitialSetup: ({ restaurantName, username, displayName, password, pin }) => {
    const db = getDb();
    if (authRepository$1.needsSetup() === false) {
      throw new Error("Initial setup is already complete. Sign in with an existing administrator account.");
    }
    if (!(username == null ? void 0 : username.trim()) || !password || password.length < 8) {
      throw new Error("Administrator username and a password of at least 8 characters are required.");
    }
    if (!pin || !/^\d{4,6}$/.test(String(pin))) {
      throw new Error("A 4 to 6 digit PIN is required for terminal unlocking.");
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const setupTx = db.transaction(() => {
      let branch = db.prepare("SELECT id FROM branches LIMIT 1").get();
      if (!branch) {
        const branchId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO branches (id, name, code, phone, email, address, city, currency_code, currency_symbol, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
          branchId,
          (restaurantName || "My Restaurant").trim(),
          "BR-01",
          "",
          "",
          "",
          "",
          "USD",
          "$",
          now,
          now
        );
        branch = { id: branchId };
      } else if (restaurantName == null ? void 0 : restaurantName.trim()) {
        db.prepare("UPDATE branches SET name = ?, updated_at = ? WHERE id = ?").run(restaurantName.trim(), now, branch.id);
      }
      let role = db.prepare("SELECT id FROM roles WHERE code = 'super_admin'").get();
      if (!role) {
        const roleId = crypto.randomUUID();
        db.prepare("INSERT INTO roles (id, code, name, description, is_system, created_at) VALUES (?, ?, ?, ?, 1, ?)").run(roleId, "super_admin", "Super Administrator", "Full system access", now);
        role = { id: roleId };
      }
      const userId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO users (id, branch_id, role_id, username, display_name, password_hash, pin_hash, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        userId,
        branch.id,
        role.id,
        username.trim().toLowerCase(),
        (displayName || username).trim(),
        hashSecret(password),
        hashSecret(String(pin)),
        now,
        now
      );
      db.prepare(`
        INSERT INTO system_settings (setting_key, setting_value, category, updated_at)
        VALUES ('setup_completed', '1', 'SECURITY', ?)
        ON CONFLICT(setting_key) DO UPDATE SET
          setting_value = excluded.setting_value,
          updated_at = excluded.updated_at
      `).run(now);
    });
    setupTx();
    return authRepository$1.loginWithPassword(username.trim().toLowerCase(), password);
  },
  /**
   * Set user Password (hashed)
   */
  setUserPassword: (userId, newPassword) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const hashed = hashSecret(newPassword);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(hashed, now, userId);
    return true;
  }
};
function createSessionForUser(user, method) {
  const db = getDb();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const permissions = db.prepare(`
    SELECT p.code
    FROM permissions p
    JOIN role_permissions rp ON p.id = rp.permission_id
    WHERE rp.role_id = ?
  `).all(user.role_id).map((r) => r.code);
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now, user.id);
  const branch = user.branch_id ? db.prepare("SELECT id, name, code, currency_symbol FROM branches WHERE id = ?").get(user.branch_id) : db.prepare("SELECT id, name, code, currency_symbol FROM branches LIMIT 1").get();
  currentSession = {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    roleId: user.role_id,
    roleCode: user.role_code,
    roleName: user.role_name,
    branchId: branch == null ? void 0 : branch.id,
    branchName: branch == null ? void 0 : branch.name,
    currencySymbol: (branch == null ? void 0 : branch.currency_symbol) || "$",
    permissions,
    loginAt: now,
    method
  };
  logAudit$8(branch == null ? void 0 : branch.id, "LOGIN", "USER", user.id, { method, role: user.role_code });
  return currentSession;
}
function logAudit$8(branchId, action, entityType, entityId, details) {
  try {
    const db = getDb();
    let validUserId = null;
    if (currentSession == null ? void 0 : currentSession.id) {
      const exists = db.prepare("SELECT id FROM users WHERE id = ?").get(currentSession.id);
      if (exists) validUserId = currentSession.id;
    }
    db.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      branchId || null,
      validUserId,
      action,
      entityType,
      entityId,
      JSON.stringify(details),
      (/* @__PURE__ */ new Date()).toISOString()
    );
  } catch (e) {
    console.error("[Audit Log] Failed to record audit:", e);
  }
}
function uuid$b() {
  return crypto.randomUUID();
}
function seedDatabase(db, options = {}) {
  const includeDemoUsers = options.includeDemoUsers === true;
  console.log("[Database Seed] Seeding default operational data...");
  const seedTx = db.transaction(() => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const branchCount = db.prepare("SELECT COUNT(*) as count FROM branches").get().count;
    let branchId = null;
    if (branchCount === 0) {
      branchId = uuid$b();
      const now2 = (/* @__PURE__ */ new Date()).toISOString();
      db.prepare(`
        INSERT INTO branches (id, name, code, phone, email, address, city, currency_code, currency_symbol, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        branchId,
        "Main Flagship Branch",
        "BR-01",
        "+1 555-0199",
        "contact@restaurantpos.local",
        "100 Gourmet Plaza, Suite 4",
        "Metropolis",
        "USD",
        "$",
        1,
        now2,
        now2
      );
    } else {
      branchId = db.prepare("SELECT id FROM branches LIMIT 1").get().id;
    }
    const roles = [
      { code: "super_admin", name: "Super Administrator", desc: "Full system and branch access", is_system: 1 },
      { code: "branch_admin", name: "Branch Admin / Owner", desc: "Full branch management without global system locks", is_system: 1 },
      { code: "manager", name: "Restaurant Manager", desc: "Orders, inventory, staff, discounts and reports", is_system: 1 },
      { code: "cashier", name: "Cashier", desc: "POS order entry, payments and receipts", is_system: 1 },
      { code: "waiter", name: "Waiter", desc: "Dine-in table orders and customer service", is_system: 1 },
      { code: "kitchen_staff", name: "Kitchen Staff", desc: "Kitchen display screen and order preparation", is_system: 1 },
      { code: "inventory_officer", name: "Inventory Officer", desc: "Stock movements, purchases and ingredients", is_system: 1 },
      { code: "accountant", name: "Accountant", desc: "Expenses, settlements and financial reports", is_system: 1 },
      { code: "delivery_rider", name: "Delivery Rider", desc: "Assigned deliveries and rider status updates", is_system: 1 },
      { code: "receptionist", name: "Reception / Reservation", desc: "Reservations, customers and table coordination", is_system: 1 }
    ];
    const roleMap = {};
    for (const r of roles) {
      let existing = db.prepare("SELECT id FROM roles WHERE code = ?").get(r.code);
      if (!existing) {
        const id = uuid$b();
        db.prepare("INSERT INTO roles (id, code, name, description, is_system, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, r.code, r.name, r.desc, r.is_system, (/* @__PURE__ */ new Date()).toISOString());
        roleMap[r.code] = id;
      } else {
        roleMap[r.code] = existing.id;
      }
    }
    const permissions = [
      { code: "dashboard:view", name: "View Dashboard Metrics", module: "DASHBOARD" },
      { code: "pos:create_order", name: "Create Orders", module: "POS" },
      { code: "pos:apply_discount", name: "Apply Discount", module: "POS" },
      { code: "pos:process_refund", name: "Process Refund", module: "POS" },
      { code: "menu:manage", name: "Manage Products & Menu", module: "MENU" },
      { code: "inventory:manage", name: "Manage Inventory & Stock", module: "INVENTORY" },
      { code: "reports:view", name: "View Reports & Analytics", module: "REPORTS" },
      { code: "staff:manage", name: "Manage Staff & Roles", module: "STAFF" },
      { code: "settings:manage", name: "Manage System Settings", module: "SETTINGS" },
      { code: "kitchen:view", name: "Access Kitchen Display (KDS)", module: "KITCHEN" },
      { code: "reservations:manage", name: "Manage Reservations", module: "RESERVATIONS" },
      { code: "delivery:manage", name: "Manage Delivery & Riders", module: "DELIVERY" },
      { code: "expenses:manage", name: "Manage Expenses", module: "EXPENSES" },
      { code: "cash:manage", name: "Manage Cash Drawer", module: "CASH" }
    ];
    for (const p of permissions) {
      let existing = db.prepare("SELECT id FROM permissions WHERE code = ?").get(p.code);
      let permId = existing == null ? void 0 : existing.id;
      if (!existing) {
        permId = uuid$b();
        db.prepare("INSERT INTO permissions (id, code, name, module, description) VALUES (?, ?, ?, ?, ?)").run(permId, p.code, p.name, p.module, p.name);
      }
      if (roleMap.super_admin && permId) {
        db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)").run(roleMap.super_admin, permId);
      }
      if (roleMap.branch_admin && permId && p.code !== "settings:manage") {
        db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)").run(roleMap.branch_admin, permId);
      }
      if (roleMap.manager && permId && p.code !== "settings:manage") {
        db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)").run(roleMap.manager, permId);
      }
      if (roleMap.cashier && permId && ["dashboard:view", "pos:create_order", "pos:apply_discount", "cash:manage", "delivery:manage"].includes(p.code)) {
        db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)").run(roleMap.cashier, permId);
      }
      if (roleMap.waiter && permId && ["pos:create_order", "reservations:manage"].includes(p.code)) {
        db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)").run(roleMap.waiter, permId);
      }
      if (roleMap.kitchen_staff && permId && ["kitchen:view"].includes(p.code)) {
        db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)").run(roleMap.kitchen_staff, permId);
      }
      if (roleMap.inventory_officer && permId && ["inventory:manage", "dashboard:view"].includes(p.code)) {
        db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)").run(roleMap.inventory_officer, permId);
      }
      if (roleMap.accountant && permId && ["reports:view", "dashboard:view", "expenses:manage"].includes(p.code)) {
        db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)").run(roleMap.accountant, permId);
      }
      if (roleMap.delivery_rider && permId && ["delivery:manage"].includes(p.code)) {
        db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)").run(roleMap.delivery_rider, permId);
      }
      if (roleMap.receptionist && permId && ["pos:create_order", "dashboard:view", "reservations:manage"].includes(p.code)) {
        db.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)").run(roleMap.receptionist, permId);
      }
    }
    const staffUsers = includeDemoUsers ? [
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
    ] : [];
    const now = (/* @__PURE__ */ new Date()).toISOString();
    for (const s of staffUsers) {
      const roleId = roleMap[s.roleCode] || null;
      const existingUser = db.prepare("SELECT id FROM users WHERE username = ?").get(s.user);
      if (existingUser) {
        continue;
      } else {
        db.prepare(`
          INSERT INTO users (id, branch_id, role_id, username, display_name, password_hash, pin_hash, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
          uuid$b(),
          branchId,
          roleId,
          s.user,
          s.name,
          s.pass ? hashSecret(s.pass) : null,
          s.pin ? hashSecret(s.pin) : null,
          now,
          now
        );
      }
    }
    const floorCount = db.prepare("SELECT COUNT(*) as count FROM floors").get().count;
    if (floorCount === 0) {
      const now2 = (/* @__PURE__ */ new Date()).toISOString();
      const groundFloorId = uuid$b();
      const terraceFloorId = uuid$b();
      db.prepare("INSERT INTO floors (id, branch_id, name, display_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(groundFloorId, branchId, "Main Dining Hall", 1, 1, now2);
      db.prepare("INSERT INTO floors (id, branch_id, name, display_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(terraceFloorId, branchId, "Outdoor Terrace", 2, 1, now2);
      const tables = [
        { floor: groundFloorId, num: "T-01", cap: 2 },
        { floor: groundFloorId, num: "T-02", cap: 4 },
        { floor: groundFloorId, num: "T-03", cap: 4 },
        { floor: groundFloorId, num: "T-04", cap: 6 },
        { floor: groundFloorId, num: "T-05", cap: 8 },
        { floor: terraceFloorId, num: "T-06", cap: 2 },
        { floor: terraceFloorId, num: "T-07", cap: 4 },
        { floor: terraceFloorId, num: "T-08", cap: 4 }
      ];
      for (const t of tables) {
        db.prepare(`
          INSERT INTO dining_tables (id, branch_id, floor_id, table_number, capacity, status, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'AVAILABLE', 1, ?, ?)
        `).run(uuid$b(), branchId, t.floor, t.num, t.cap, now2, now2);
      }
    }
    const catCount = db.prepare("SELECT COUNT(*) as count FROM categories").get().count;
    if (catCount === 0) {
      const now2 = (/* @__PURE__ */ new Date()).toISOString();
      const catBurgers = uuid$b();
      const catPizzas = uuid$b();
      const catSides = uuid$b();
      const catDrinks = uuid$b();
      db.prepare("INSERT INTO categories (id, branch_id, name, code, display_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(catBurgers, branchId, "Gourmet Burgers", "CAT-BGR", 1, 1, now2);
      db.prepare("INSERT INTO categories (id, branch_id, name, code, display_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(catPizzas, branchId, "Artisan Pizzas", "CAT-PIZ", 2, 1, now2);
      db.prepare("INSERT INTO categories (id, branch_id, name, code, display_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(catSides, branchId, "Sides & Starters", "CAT-SID", 3, 1, now2);
      db.prepare("INSERT INTO categories (id, branch_id, name, code, display_order, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(catDrinks, branchId, "Beverages & Coffee", "CAT-DRK", 4, 1, now2);
      const products = [
        { cat: catBurgers, name: "Classic Angus Cheeseburger", price: 950, cost: 380, prep: 12 },
        { cat: catBurgers, name: "Crispy Smoky Chicken Burger", price: 850, cost: 320, prep: 10 },
        { cat: catBurgers, name: "Double Bacon Smashburger", price: 1199, cost: 480, prep: 14 },
        { cat: catPizzas, name: "Woodfired Margherita Pizza", price: 1250, cost: 390, prep: 15 },
        { cat: catPizzas, name: "Pepperoni Feast Pizza", price: 1499, cost: 520, prep: 16 },
        { cat: catSides, name: "Crispy Seasoned French Fries", price: 399, cost: 90, prep: 6 },
        { cat: catSides, name: "Loaded Cheesy Nachos", price: 650, cost: 180, prep: 8 },
        { cat: catDrinks, name: "Artisan Iced Caramel Latte", price: 450, cost: 110, prep: 4 },
        { cat: catDrinks, name: "Fresh Mint Lemonade", price: 350, cost: 70, prep: 3 }
      ];
      for (const p of products) {
        db.prepare(`
          INSERT INTO products (id, branch_id, category_id, name, sku, base_price_cents, cost_price_cents, preparation_time_minutes, is_available, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
        `).run(uuid$b(), branchId, p.cat, p.name, `SKU-${Math.floor(1e3 + Math.random() * 9e3)}`, p.price, p.cost, p.prep, now2, now2);
      }
    }
    const customerCount = db.prepare("SELECT COUNT(*) as count FROM customers").get().count;
    if (customerCount === 0) {
      const sampleCustomers = [
        { name: "John Doe", phone: "+1 555-0142", email: "john.doe@example.com", address: "45 Elm Street, Apt 3B", notes: "Prefers contactless delivery" },
        { name: "Emma Watson", phone: "+1 555-0188", email: "emma.w@example.com", address: "128 Ocean Avenue, Suite 10", notes: "VIP regular customer" },
        { name: "David Miller", phone: "+1 555-0125", email: "david.m@example.com", address: "99 Maple Drive", notes: "Allergic to peanuts" }
      ];
      for (const c of sampleCustomers) {
        db.prepare(`
          INSERT INTO customers (id, branch_id, name, phone, email, address, notes, loyalty_points, total_spent_cents, order_count, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 50, 4500, 3, ?, ?)
        `).run(uuid$b(), branchId, c.name, c.phone, c.email, c.address, c.notes, now, now);
      }
    }
    try {
      const stationCount = db.prepare("SELECT COUNT(*) as count FROM kitchen_stations").get().count;
      if (stationCount === 0) {
        const insertStation = db.prepare(`
          INSERT INTO kitchen_stations (id, branch_id, name, code, color_code, display_order, is_active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        `);
        insertStation.run("station-grill", branchId, "Grill & Fryer", "GRILL", "#ef4444", 1, now);
        insertStation.run("station-pizza", branchId, "Pizza & Oven", "PIZZA", "#f59e0b", 2, now);
        insertStation.run("station-bar", branchId, "Bar & Beverages", "DRINKS", "#06b6d4", 3, now);
        insertStation.run("station-expo", branchId, "Packaging & Expo", "EXPO", "#10b981", 4, now);
      }
    } catch (e) {
    }
    const unitCount = db.prepare("SELECT COUNT(*) as count FROM inventory_units").get().count;
    if (unitCount === 0) {
      db.prepare("INSERT INTO inventory_units (id, name, abbreviation) VALUES (?, ?, ?)").run(uuid$b(), "Kilogram", "kg");
      db.prepare("INSERT INTO inventory_units (id, name, abbreviation) VALUES (?, ?, ?)").run(uuid$b(), "Gram", "g");
      db.prepare("INSERT INTO inventory_units (id, name, abbreviation) VALUES (?, ?, ?)").run(uuid$b(), "Piece", "pc");
      db.prepare("INSERT INTO inventory_units (id, name, abbreviation) VALUES (?, ?, ?)").run(uuid$b(), "Liter", "L");
    }
    const supplierCount = db.prepare("SELECT COUNT(*) as count FROM suppliers").get().count;
    const supplierMap = {};
    if (supplierCount === 0) {
      const sampleSuppliers = [
        { name: "Apex Prime Meats Ltd", contact: "Robert Jenkins", phone: "+1 555-4301", email: "orders@apexmeats.com", address: "12 Industrial Way" },
        { name: "Fresh Farms Produce", contact: "Maria Garcia", phone: "+1 555-4302", email: "sales@freshfarms.com", address: "88 Valley Road" },
        { name: "Dairy King Wholesale", contact: "Thomas Brown", phone: "+1 555-4303", email: "support@dairyking.com", address: "45 Cold Storage Blvd" },
        { name: "Metro Beverage Co", contact: "Elena Rostova", phone: "+1 555-4304", email: "orders@metrobev.com", address: "77 Port Street" }
      ];
      for (const s of sampleSuppliers) {
        const supId = uuid$b();
        supplierMap[s.name] = supId;
        db.prepare(`
          INSERT INTO suppliers (id, branch_id, company_name, contact_name, phone, email, address, is_active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        `).run(supId, branchId, s.name, s.contact, s.phone, s.email, s.address, now);
      }
    }
    const inventoryCount = db.prepare("SELECT COUNT(*) as count FROM inventory_items").get().count;
    const itemMap = {};
    if (inventoryCount === 0) {
      const kgUnit = (_a = db.prepare("SELECT id FROM inventory_units WHERE abbreviation = 'kg' LIMIT 1").get()) == null ? void 0 : _a.id;
      const pcUnit = (_b = db.prepare("SELECT id FROM inventory_units WHERE abbreviation = 'pc' LIMIT 1").get()) == null ? void 0 : _b.id;
      (_c = db.prepare("SELECT id FROM inventory_units WHERE abbreviation = 'L' LIMIT 1").get()) == null ? void 0 : _c.id;
      const rawItems = [
        { name: "Angus Beef Patties (150g)", sku: "RAW-BEEF-01", unit: pcUnit, stock: 120, min: 25, cost: 220, cat: "Meat & Poultry" },
        { name: "Artisan Brioche Burger Buns", sku: "RAW-BUN-01", unit: pcUnit, stock: 150, min: 30, cost: 45, cat: "Bakery" },
        { name: "Aged Cheddar Cheese Slices", sku: "RAW-CHED-01", unit: pcUnit, stock: 200, min: 40, cost: 35, cat: "Dairy & Cheese" },
        { name: "Fresh Pizza Dough Balls", sku: "RAW-DOUGH-01", unit: pcUnit, stock: 60, min: 15, cost: 110, cat: "Bakery" },
        { name: "Shredded Mozzarella Cheese", sku: "RAW-MOZZ-01", unit: kgUnit, stock: 25, min: 8, cost: 850, cat: "Dairy & Cheese" },
        { name: "Italian San Marzano Tomato Sauce", sku: "RAW-SAUCE-01", unit: kgUnit, stock: 30, min: 10, cost: 420, cat: "Produce" },
        { name: "Crispy Seasoning French Fries Cut", sku: "RAW-FRIES-01", unit: kgUnit, stock: 50, min: 15, cost: 180, cat: "Produce" },
        { name: "Fresh Sicilian Lemons", sku: "RAW-LEM-01", unit: kgUnit, stock: 15, min: 5, cost: 250, cat: "Produce" },
        { name: "Espresso Coffee Beans Blend", sku: "RAW-COF-01", unit: kgUnit, stock: 18, min: 6, cost: 1600, cat: "Beverages" }
      ];
      for (const item of rawItems) {
        if (!item.unit) continue;
        const itemId = uuid$b();
        itemMap[item.name] = itemId;
        db.prepare(`
          INSERT INTO inventory_items (id, branch_id, name, sku, unit_id, current_stock, minimum_level, cost_per_unit_cents, category, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(itemId, branchId, item.name, item.sku, item.unit, item.stock, item.min, item.cost, item.cat, now, now);
      }
      const burgerProd = db.prepare("SELECT id FROM products WHERE name LIKE '%Cheeseburger%' LIMIT 1").get();
      if (burgerProd && itemMap["Angus Beef Patties (150g)"] && itemMap["Artisan Brioche Burger Buns"]) {
        const recipeId = uuid$b();
        db.prepare("INSERT INTO recipes (id, product_id, yield_quantity, notes) VALUES (?, ?, 1.0, ?)").run(recipeId, burgerProd.id, "Standard Cheeseburger assembly");
        db.prepare("INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required) VALUES (?, ?, ?, 1.0)").run(uuid$b(), recipeId, itemMap["Angus Beef Patties (150g)"]);
        db.prepare("INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required) VALUES (?, ?, ?, 1.0)").run(uuid$b(), recipeId, itemMap["Artisan Brioche Burger Buns"]);
        if (itemMap["Aged Cheddar Cheese Slices"]) {
          db.prepare("INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required) VALUES (?, ?, ?, 1.0)").run(uuid$b(), recipeId, itemMap["Aged Cheddar Cheese Slices"]);
        }
      }
      const pizzaProd = db.prepare("SELECT id FROM products WHERE name LIKE '%Margherita%' LIMIT 1").get();
      if (pizzaProd && itemMap["Fresh Pizza Dough Balls"] && itemMap["Shredded Mozzarella Cheese"]) {
        const recipeId = uuid$b();
        db.prepare("INSERT INTO recipes (id, product_id, yield_quantity, notes) VALUES (?, ?, 1.0, ?)").run(recipeId, pizzaProd.id, "12-inch Woodfired Margherita");
        db.prepare("INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required) VALUES (?, ?, ?, 1.0)").run(uuid$b(), recipeId, itemMap["Fresh Pizza Dough Balls"]);
        db.prepare("INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required) VALUES (?, ?, ?, 0.20)").run(uuid$b(), recipeId, itemMap["Shredded Mozzarella Cheese"]);
        if (itemMap["Italian San Marzano Tomato Sauce"]) {
          db.prepare("INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required) VALUES (?, ?, ?, 0.15)").run(uuid$b(), recipeId, itemMap["Italian San Marzano Tomato Sauce"]);
        }
      }
    }
    const defaultSettings = [
      { key: "business_name", val: "FastBite Gourmet Grill", cat: "GENERAL" },
      { key: "tax_rate_percentage", val: "5.0", cat: "TAX" },
      { key: "service_charge_percentage", val: "0.0", cat: "TAX" },
      { key: "currency_code", val: "USD", cat: "LOCALIZATION" },
      { key: "currency_symbol", val: "$", cat: "LOCALIZATION" },
      { key: "receipt_header", val: "FastBite Gourmet Grill\n100 Gourmet Plaza, Suite 4\nTel: +1 555-0199", cat: "RECEIPT" },
      { key: "receipt_footer", val: "Thank you for dining with us!\nVisit again soon.", cat: "RECEIPT" },
      { key: "low_stock_threshold", val: "5.0", cat: "INVENTORY" }
    ];
    for (const s of defaultSettings) {
      db.prepare(`
        INSERT OR IGNORE INTO system_settings (setting_key, setting_value, category, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(s.key, s.val, s.cat, (/* @__PURE__ */ new Date()).toISOString());
    }
    try {
      const shiftCount = ((_d = db.prepare("SELECT COUNT(*) as count FROM staff_shifts").get()) == null ? void 0 : _d.count) || 0;
      if (shiftCount === 0) {
        const shifts = [
          { name: "Morning Shift", start: "08:00", end: "16:00" },
          { name: "Evening Shift", start: "16:00", end: "00:00" },
          { name: "Night Shift", start: "00:00", end: "08:00" }
        ];
        const insertShift = db.prepare(`
          INSERT INTO staff_shifts (id, branch_id, name, start_time, end_time, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        `);
        for (const s of shifts) {
          insertShift.run(uuid$b(), branchId, s.name, s.start, s.end, now, now);
        }
      }
      const empCount = ((_e = db.prepare("SELECT COUNT(*) as count FROM employees").get()) == null ? void 0 : _e.count) || 0;
      if (empCount === 0) {
        const users = db.prepare("SELECT id, username, display_name, role_id FROM users WHERE branch_id = ?").all(branchId);
        const insertEmp = db.prepare(`
          INSERT INTO employees (
            id, branch_id, user_id, employee_code, first_name, last_name,
            email, phone, designation, role_id, salary_type, base_rate_cents,
            hire_date, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        `);
        let codeIndex = 101;
        for (const u of users) {
          const names = u.display_name.split(" ");
          const firstName = names[0] || u.username;
          const lastName = names.slice(1).join(" ") || "Staff";
          const designation = u.username.includes("admin") ? "General Manager" : u.username.includes("manager") ? "Floor Manager" : u.username.includes("cashier") ? "Senior Cashier" : u.username.includes("waiter") ? "Head Waiter" : u.username.includes("chef") ? "Head Chef" : "Staff Member";
          insertEmp.run(
            uuid$b(),
            branchId,
            u.id,
            `EMP-${codeIndex++}`,
            firstName,
            lastName,
            `${u.username}@restaurant.local`,
            `+1 555-01${codeIndex}`,
            designation,
            u.role_id,
            "MONTHLY",
            25e4,
            "2026-01-01",
            now,
            now
          );
        }
      }
    } catch (e) {
      console.warn("Phase 8 staff seeds skipped:", e);
    }
    try {
      const couponCount = ((_f = db.prepare("SELECT COUNT(*) as count FROM coupons").get()) == null ? void 0 : _f.count) || 0;
      if (couponCount === 0) {
        const defaultCoupons = [
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
        ];
        const insertCoupon = db.prepare(`
          INSERT INTO coupons (
            id, branch_id, code, title, discount_type, discount_value,
            min_order_cents, max_discount_cents, start_date, end_date,
            usage_limit, times_used, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
        `);
        const now2 = (/* @__PURE__ */ new Date()).toISOString();
        for (const c of defaultCoupons) {
          insertCoupon.run(
            uuid$b(),
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
            now2,
            now2
          );
        }
      }
    } catch (e) {
      console.warn("Phase 9 coupons seeds skipped:", e);
    }
    try {
      const zoneCount = ((_g = db.prepare("SELECT COUNT(*) as count FROM delivery_zones").get()) == null ? void 0 : _g.count) || 0;
      if (zoneCount === 0) {
        const defaultZones = [
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
        ];
        const insertZone = db.prepare(`
          INSERT INTO delivery_zones (
            id, branch_id, name, delivery_charge_cents, min_order_cents,
            estimated_minutes, description, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `);
        const now2 = (/* @__PURE__ */ new Date()).toISOString();
        for (const z of defaultZones) {
          insertZone.run(
            uuid$b(),
            branchId,
            z.name,
            z.chargeCents,
            z.minOrderCents,
            z.minutes,
            z.desc,
            now2,
            now2
          );
        }
      }
      const riderCount = ((_h = db.prepare("SELECT COUNT(*) as count FROM riders").get()) == null ? void 0 : _h.count) || 0;
      if (riderCount === 0) {
        const defaultRiders = [
          { name: "Marco Silva", phone: "+1 555-8011", vehicle: "MOTORCYCLE", plate: "MTR-4491" },
          { name: "Lucas Bennett", phone: "+1 555-8012", vehicle: "SCOOTER", plate: "SCT-2208" },
          { name: "Derrick Vance", phone: "+1 555-8013", vehicle: "BICYCLE", plate: "BIKE-03" }
        ];
        const insertRider = db.prepare(`
          INSERT INTO riders (
            id, branch_id, name, phone, vehicle_type, license_plate,
            status, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE', 1, ?, ?)
        `);
        const now2 = (/* @__PURE__ */ new Date()).toISOString();
        for (const r of defaultRiders) {
          insertRider.run(
            uuid$b(),
            branchId,
            r.name,
            r.phone,
            r.vehicle,
            r.plate,
            now2,
            now2
          );
        }
      }
    } catch (e) {
      console.warn("Phase 10 delivery seeds skipped:", e);
    }
  });
  seedTx();
  console.log("[Database Seed] Seeding completed successfully.");
}
const require$1 = createRequire(import.meta.url);
let dbInstance = null;
let dbPath = null;
function resolveDatabasePath(customPath) {
  var _a;
  if (customPath) return customPath;
  if (process.env.DB_PATH) return process.env.DB_PATH;
  try {
    const electron = require$1("electron");
    const app2 = electron.app || ((_a = electron.remote) == null ? void 0 : _a.app);
    if (app2) {
      return path.join(app2.getPath("userData"), "restaurant_pos.sqlite");
    }
  } catch (e) {
  }
  const fallbackDir = path.resolve(process.cwd(), "database_storage");
  if (!fs.existsSync(fallbackDir)) {
    fs.mkdirSync(fallbackDir, { recursive: true });
  }
  return path.join(fallbackDir, "restaurant_pos.sqlite");
}
function initDatabase(options = {}) {
  if (dbInstance && dbInstance.open) {
    return dbInstance;
  }
  dbPath = resolveDatabasePath(options.dbPath);
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  console.log(`[Database] Connecting to SQLite persistent store at: ${dbPath}`);
  dbInstance = new Database(dbPath, {
    verbose: process.env.DB_DEBUG ? console.log : null,
    fileMustExist: false,
    timeout: 5e3
  });
  dbInstance.pragma("foreign_keys = ON");
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("synchronous = NORMAL");
  dbInstance.pragma("busy_timeout = 5000");
  const migrationResult = runMigrations(dbInstance);
  console.log(`[Database] Migrations applied: ${migrationResult.appliedCount}, Current Version: ${migrationResult.currentVersion}`);
  if (options.seed !== false && migrationResult.appliedCount > 0) {
    seedDatabase(dbInstance, {
      includeDemoUsers: options.includeDemoUsers ?? (options.seed === true || process.env.POS_DEMO_USERS === "1")
    });
  }
  try {
    const check = dbInstance.prepare("PRAGMA quick_check").get();
    if ((check == null ? void 0 : check.quick_check) !== "ok") {
      console.warn("[Database] PRAGMA quick_check detected issues, executing REINDEX...");
      dbInstance.prepare("REINDEX").run();
    }
    const activeBranch = dbInstance.prepare("SELECT id FROM branches LIMIT 1").get();
    if (activeBranch) {
      dbInstance.prepare(`
        UPDATE users 
        SET branch_id = ? 
        WHERE branch_id IS NOT NULL AND branch_id NOT IN (SELECT id FROM branches)
      `).run(activeBranch.id);
    }
  } catch (err) {
    console.warn("[Database] Self-healing maintenance check:", err);
  }
  return dbInstance;
}
function getDb() {
  if (!dbInstance || !dbInstance.open) {
    return initDatabase();
  }
  return dbInstance;
}
function closeDatabase() {
  if (dbInstance && dbInstance.open) {
    dbInstance.close();
    dbInstance = null;
    console.log("[Database] Closed connection successfully.");
  }
}
async function backupDatabase(destinationPath) {
  const db = getDb();
  const defaultDir = path.dirname(dbPath);
  const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const target = destinationPath || path.join(defaultDir, `restaurant_backup_${timestamp}.sqlite`);
  await db.backup(target);
  const stats = fs.statSync(target);
  return {
    success: true,
    destination: target,
    bytes: stats.size,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function restoreDatabase(backupFilePath, targetDbPath = null) {
  if (!fs.existsSync(backupFilePath)) {
    throw new Error(`Backup file not found at: ${backupFilePath}`);
  }
  const currentDbPath = resolveDatabasePath(targetDbPath || dbPath);
  const preRestoreDir = path.dirname(currentDbPath);
  const preRestoreBackup = path.join(preRestoreDir, `pre_restore_safety_${Date.now()}.sqlite`);
  if (fs.existsSync(currentDbPath)) {
    await backupDatabase(preRestoreBackup);
  }
  closeDatabase();
  fs.copyFileSync(backupFilePath, currentDbPath);
  const walPath = `${currentDbPath}-wal`;
  const shmPath = `${currentDbPath}-shm`;
  if (fs.existsSync(walPath)) {
    try {
      fs.unlinkSync(walPath);
    } catch (e) {
    }
  }
  if (fs.existsSync(shmPath)) {
    try {
      fs.unlinkSync(shmPath);
    } catch (e) {
    }
  }
  const db = initDatabase({ dbPath: currentDbPath, seed: false });
  const check = db.prepare("PRAGMA integrity_check").get();
  if (check.integrity_check !== "ok") {
    closeDatabase();
    fs.copyFileSync(preRestoreBackup, currentDbPath);
    initDatabase({ seed: false });
    throw new Error(`Restore failed integrity check: ${check.integrity_check}. Reverted to safety backup.`);
  }
  return {
    success: true,
    message: "Database restored and verified successfully.",
    preRestoreBackup
  };
}
const settingsRepository = {
  getAll: () => {
    const db = getDb();
    const rows = db.prepare("SELECT setting_key, setting_value, category, description, updated_at FROM system_settings").all();
    const settings = {};
    for (const r of rows) {
      settings[r.setting_key] = r.setting_value;
    }
    return settings;
  },
  get: (key) => {
    const db = getDb();
    const row = db.prepare("SELECT setting_value FROM system_settings WHERE setting_key = ?").get(key);
    return row ? row.setting_value : null;
  },
  set: (key, value, category = "GENERAL") => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(`
      INSERT INTO system_settings (setting_key, setting_value, category, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        category = excluded.category,
        updated_at = excluded.updated_at
    `).run(key, value, category, now);
    return true;
  }
};
function uuid$a() {
  return crypto.randomUUID();
}
function logAudit$7(branchId, action, entityType, entityId, details) {
  try {
    const db = getDb();
    const session = authRepository$1.getCurrentSession();
    let validUserId = null;
    if (session == null ? void 0 : session.id) {
      const exists = db.prepare("SELECT id FROM users WHERE id = ?").get(session.id);
      if (exists) validUserId = session.id;
    }
    db.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid$a(),
      branchId || (session == null ? void 0 : session.branchId) || null,
      validUserId,
      action,
      entityType,
      entityId,
      JSON.stringify(details),
      (/* @__PURE__ */ new Date()).toISOString()
    );
  } catch (err) {
    console.error("[Audit Log Error]:", err);
  }
}
const productRepository = {
  // ==========================================
  // CATEGORIES CRUD (Section 6.1)
  // ==========================================
  getCategories: (branchId) => {
    const db = getDb();
    return db.prepare(`
      SELECT c.id, c.name, c.code, c.display_order, c.is_active,
             c.parent_id, c.is_visible_pos, c.is_visible_online, c.image_url,
             COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
      WHERE (c.branch_id = ? OR c.branch_id IS NULL) AND c.is_active = 1
      GROUP BY c.id
      ORDER BY c.display_order ASC, c.name ASC
    `).all(branchId);
  },
  createCategory: ({ branchId, name, code, displayOrder = 0, parentId = null, isVisiblePos = 1, isVisibleOnline = 1, imageUrl = null }) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const id = uuid$a();
    db.prepare(`
      INSERT INTO categories (id, branch_id, name, code, display_order, parent_id, is_visible_pos, is_visible_online, image_url, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      id,
      branchId || null,
      name.trim(),
      code ? code.trim() : null,
      displayOrder,
      parentId || null,
      isVisiblePos !== void 0 ? isVisiblePos ? 1 : 0 : 1,
      isVisibleOnline !== void 0 ? isVisibleOnline ? 1 : 0 : 1,
      imageUrl || null,
      now
    );
    logAudit$7(branchId, "CREATE_CATEGORY", "CATEGORY", id, { name, code });
    return { id, name, code, displayOrder, is_active: 1 };
  },
  updateCategory: (id, { name, code, displayOrder, parentId, isVisiblePos = 1, isVisibleOnline = 1, isActive = 1, imageUrl }) => {
    const db = getDb();
    db.prepare(`
      UPDATE categories
      SET name = ?, code = ?, display_order = ?, parent_id = ?, is_visible_pos = ?, is_visible_online = ?, is_active = ?, image_url = COALESCE(?, image_url)
      WHERE id = ?
    `).run(
      name.trim(),
      code ? code.trim() : null,
      displayOrder || 0,
      parentId || null,
      isVisiblePos !== void 0 ? isVisiblePos ? 1 : 0 : 1,
      isVisibleOnline !== void 0 ? isVisibleOnline ? 1 : 0 : 1,
      isActive,
      imageUrl !== void 0 ? imageUrl : null,
      id
    );
    logAudit$7(null, "UPDATE_CATEGORY", "CATEGORY", id, { name, code, isActive });
    return true;
  },
  deleteCategory: (id) => {
    const db = getDb();
    const productCount = db.prepare("SELECT COUNT(*) as count FROM products WHERE category_id = ? AND is_active = 1").get(id).count;
    if (productCount > 0) {
      throw new Error(`Cannot delete category: Contains ${productCount} active products. Reassign or archive them first.`);
    }
    db.prepare("UPDATE categories SET is_active = 0 WHERE id = ?").run(id);
    logAudit$7(null, "ARCHIVE_CATEGORY", "CATEGORY", id, {});
    return true;
  },
  // ==========================================
  // PRODUCTS CRUD (Section 6.2 & 6.3)
  // ==========================================
  getProducts: (branchId, categoryId = null, searchQuery = "", includeInactive = false) => {
    const db = getDb();
    let sql = `
      SELECT p.id, p.category_id, c.name as category_name, p.name, p.sku, p.barcode,
             p.description, p.base_price_cents, p.cost_price_cents, p.tax_percentage,
             p.preparation_time_minutes, p.is_available, p.has_variations, p.track_inventory,
             p.is_featured, p.is_discount_eligible, p.min_order_qty, p.max_order_qty,
             p.price_dine_in_cents, p.price_takeaway_cents, p.price_delivery_cents,
             p.image_url, p.is_active, p.created_at, p.updated_at
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE (p.branch_id = ? OR p.branch_id IS NULL)
    `;
    const params = [branchId];
    if (!includeInactive) {
      sql += " AND p.is_active = 1";
    }
    if (categoryId) {
      sql += " AND p.category_id = ?";
      params.push(categoryId);
    }
    if (searchQuery && searchQuery.trim() !== "") {
      sql += " AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)";
      const term = `%${searchQuery.trim()}%`;
      params.push(term, term, term);
    }
    sql += " ORDER BY c.display_order ASC, p.name ASC";
    return db.prepare(sql).all(...params);
  },
  getProductDetails: (productId) => {
    const db = getDb();
    const product = db.prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `).get(productId);
    if (!product) return null;
    const variations = db.prepare(`
      SELECT id, name, sku, price_cents, cost_cents, is_default, is_active
      FROM product_variations
      WHERE product_id = ? AND is_active = 1
      ORDER BY price_cents ASC
    `).all(productId);
    const modifierGroups = db.prepare(`
      SELECT id, name, is_required, min_selection, max_selection
      FROM modifier_groups
      WHERE product_id = ?
    `).all(productId);
    for (const group of modifierGroups) {
      group.modifiers = db.prepare(`
        SELECT id, name, price_cents, is_active
        FROM modifiers
        WHERE group_id = ? AND is_active = 1
        ORDER BY price_cents ASC
      `).all(group.id);
    }
    return {
      ...product,
      variations,
      modifierGroups
    };
  },
  createProduct: (productData) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const productId = productData.id || uuid$a();
    const createTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO products (
          id, branch_id, category_id, name, sku, barcode, description, image_url,
          base_price_cents, cost_price_cents, tax_percentage, preparation_time_minutes,
          is_available, has_variations, track_inventory,
          is_featured, is_discount_eligible, min_order_qty, max_order_qty,
          price_dine_in_cents, price_takeaway_cents, price_delivery_cents,
          is_active, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          1, ?, ?
        )
      `).run(
        productId,
        productData.branchId || null,
        productData.categoryId,
        productData.name.trim(),
        productData.sku ? productData.sku.trim() : `SKU-${Date.now().toString().slice(-6)}`,
        productData.barcode ? productData.barcode.trim() : null,
        productData.description || null,
        productData.imageUrl || productData.image_url || null,
        productData.basePriceCents || 0,
        productData.costPriceCents || 0,
        productData.taxPercentage || 0,
        productData.preparationTimeMinutes || 15,
        productData.isAvailable !== void 0 ? productData.isAvailable ? 1 : 0 : 1,
        Array.isArray(productData.variations) && productData.variations.length > 0 ? 1 : 0,
        productData.trackInventory ? 1 : 0,
        productData.isFeatured ? 1 : 0,
        productData.isDiscountEligible !== void 0 ? productData.isDiscountEligible ? 1 : 0 : 1,
        productData.minOrderQty || 1,
        productData.maxOrderQty || 99,
        productData.priceDineInCents || null,
        productData.priceTakeawayCents || null,
        productData.priceDeliveryCents || null,
        now,
        now
      );
      if (Array.isArray(productData.variations)) {
        for (const v of productData.variations) {
          db.prepare(`
            INSERT INTO product_variations (id, product_id, name, sku, price_cents, cost_cents, is_default, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          `).run(
            v.id || uuid$a(),
            productId,
            v.name.trim(),
            v.sku || null,
            v.priceCents || 0,
            v.costCents || 0,
            v.isDefault ? 1 : 0
          );
        }
      }
      if (Array.isArray(productData.modifierGroups)) {
        for (const mg of productData.modifierGroups) {
          const groupId = mg.id || uuid$a();
          db.prepare(`
            INSERT INTO modifier_groups (id, product_id, name, is_required, min_selection, max_selection)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(groupId, productId, mg.name.trim(), mg.isRequired ? 1 : 0, mg.minSelection || 0, mg.maxSelection || 1);
          if (Array.isArray(mg.modifiers)) {
            for (const m of mg.modifiers) {
              db.prepare(`
                INSERT INTO modifiers (id, group_id, name, price_cents, is_active)
                VALUES (?, ?, ?, ?, 1)
              `).run(m.id || uuid$a(), groupId, m.name.trim(), m.priceCents || 0);
            }
          }
        }
      }
      logAudit$7(productData.branchId, "CREATE_PRODUCT", "PRODUCT", productId, {
        name: productData.name,
        priceCents: productData.basePriceCents
      });
      return productId;
    });
    const newId = createTx();
    return productRepository.getProductDetails(newId);
  },
  updateProduct: (id, productData) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const updateTx = db.transaction(() => {
      const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
      if (!existing) throw new Error(`Product not found: ${id}`);
      const categoryId = productData.categoryId || productData.category_id || existing.category_id;
      const basePrice = productData.basePriceCents !== void 0 ? productData.basePriceCents : productData.base_price_cents !== void 0 ? productData.base_price_cents : existing.base_price_cents;
      const costPrice = productData.costPriceCents !== void 0 ? productData.costPriceCents : productData.cost_price_cents !== void 0 ? productData.cost_price_cents : existing.cost_price_cents;
      const taxRate = productData.taxPercentage !== void 0 ? productData.taxPercentage : productData.tax_percentage !== void 0 ? productData.tax_percentage : existing.tax_percentage;
      const prepTime = productData.preparationTimeMinutes !== void 0 ? productData.preparationTimeMinutes : productData.preparation_time_minutes !== void 0 ? productData.preparation_time_minutes : existing.preparation_time_minutes;
      const isAvail = productData.isAvailable !== void 0 ? productData.isAvailable ? 1 : 0 : productData.is_available !== void 0 ? productData.is_available ? 1 : 0 : existing.is_available;
      const trackInv = productData.trackInventory !== void 0 ? productData.trackInventory ? 1 : 0 : productData.track_inventory !== void 0 ? productData.track_inventory ? 1 : 0 : existing.track_inventory;
      const isFeatured = productData.isFeatured !== void 0 ? productData.isFeatured ? 1 : 0 : productData.is_featured !== void 0 ? productData.is_featured ? 1 : 0 : existing.is_featured;
      const isDiscEligible = productData.isDiscountEligible !== void 0 ? productData.isDiscountEligible ? 1 : 0 : productData.is_discount_eligible !== void 0 ? productData.is_discount_eligible ? 1 : 0 : existing.is_discount_eligible;
      const minQty = productData.minOrderQty !== void 0 ? productData.minOrderQty : productData.min_order_qty !== void 0 ? productData.min_order_qty : existing.min_order_qty;
      const maxQty = productData.maxOrderQty !== void 0 ? productData.maxOrderQty : productData.max_order_qty !== void 0 ? productData.max_order_qty : existing.max_order_qty;
      const priceDineIn = productData.priceDineInCents !== void 0 ? productData.priceDineInCents : existing.price_dine_in_cents;
      const priceTakeaway = productData.priceTakeawayCents !== void 0 ? productData.priceTakeawayCents : existing.price_takeaway_cents;
      const priceDelivery = productData.priceDeliveryCents !== void 0 ? productData.priceDeliveryCents : existing.price_delivery_cents;
      if (existing.base_price_cents !== basePrice) {
        logAudit$7(productData.branchId, "PRICE_CHANGE", "PRODUCT", id, {
          oldPriceCents: existing.base_price_cents,
          newPriceCents: basePrice,
          productName: productData.name || existing.name
        });
      }
      db.prepare(`
        UPDATE products
        SET category_id = ?, name = ?, sku = ?, barcode = ?, description = ?, image_url = ?,
            base_price_cents = ?, cost_price_cents = ?, tax_percentage = ?,
            preparation_time_minutes = ?, is_available = ?, has_variations = ?,
            track_inventory = ?, is_featured = ?, is_discount_eligible = ?,
            min_order_qty = ?, max_order_qty = ?,
            price_dine_in_cents = ?, price_takeaway_cents = ?, price_delivery_cents = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        categoryId,
        (productData.name || existing.name).trim(),
        productData.sku ? productData.sku.trim() : existing.sku,
        productData.barcode !== void 0 ? productData.barcode ? productData.barcode.trim() : null : existing.barcode,
        productData.description !== void 0 ? productData.description : existing.description,
        productData.imageUrl !== void 0 ? productData.imageUrl : productData.image_url !== void 0 ? productData.image_url : existing.image_url,
        basePrice,
        costPrice,
        taxRate,
        prepTime,
        isAvail,
        Array.isArray(productData.variations) && productData.variations.length > 0 ? 1 : existing.has_variations,
        trackInv,
        isFeatured,
        isDiscEligible,
        minQty,
        maxQty,
        priceDineIn,
        priceTakeaway,
        priceDelivery,
        now,
        id
      );
      if (Array.isArray(productData.variations)) {
        db.prepare("DELETE FROM product_variations WHERE product_id = ?").run(id);
        for (const v of productData.variations) {
          db.prepare(`
            INSERT INTO product_variations (id, product_id, name, sku, price_cents, cost_cents, is_default, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          `).run(
            v.id || uuid$a(),
            id,
            v.name.trim(),
            v.sku || null,
            v.priceCents || 0,
            v.costCents || 0,
            v.isDefault ? 1 : 0
          );
        }
      }
      if (Array.isArray(productData.modifierGroups)) {
        const oldGroups = db.prepare("SELECT id FROM modifier_groups WHERE product_id = ?").all(id);
        for (const g of oldGroups) {
          db.prepare("DELETE FROM modifiers WHERE group_id = ?").run(g.id);
        }
        db.prepare("DELETE FROM modifier_groups WHERE product_id = ?").run(id);
        for (const mg of productData.modifierGroups) {
          const groupId = mg.id || uuid$a();
          db.prepare(`
            INSERT INTO modifier_groups (id, product_id, name, is_required, min_selection, max_selection)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(groupId, id, mg.name.trim(), mg.isRequired ? 1 : 0, mg.minSelection || 0, mg.maxSelection || 1);
          if (Array.isArray(mg.modifiers)) {
            for (const m of mg.modifiers) {
              db.prepare(`
                INSERT INTO modifiers (id, group_id, name, price_cents, is_active)
                VALUES (?, ?, ?, ?, 1)
              `).run(m.id || uuid$a(), groupId, m.name.trim(), m.priceCents || 0);
            }
          }
        }
      }
      logAudit$7(productData.branchId, "UPDATE_PRODUCT", "PRODUCT", id, { name: productData.name });
      return true;
    });
    updateTx();
    return productRepository.getProductDetails(id);
  },
  toggleProductAvailability: (id, isAvailable) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare("UPDATE products SET is_available = ?, updated_at = ? WHERE id = ?").run(isAvailable ? 1 : 0, now, id);
    return true;
  },
  archiveProduct: (id) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare("UPDATE products SET is_active = 0, is_available = 0, updated_at = ? WHERE id = ?").run(now, id);
    logAudit$7(null, "ARCHIVE_PRODUCT", "PRODUCT", id, {});
    return true;
  },
  // ==========================================
  // COMBOS & DEALS (Section 6.4)
  // ==========================================
  getCombos: (branchId) => {
    const db = getDb();
    const combos = db.prepare(`
      SELECT c.id, c.name, c.code, c.description, c.price_cents, c.is_available,
             c.available_from, c.available_to, c.image_url, c.is_active, c.created_at
      FROM combos c
      WHERE (c.branch_id = ? OR c.branch_id IS NULL) AND c.is_active = 1
      ORDER BY c.name ASC
    `).all(branchId);
    for (const combo of combos) {
      combo.items = db.prepare(`
        SELECT ci.id, ci.product_id, ci.quantity, p.name as product_name, p.base_price_cents
        FROM combo_items ci
        JOIN products p ON ci.product_id = p.id
        WHERE ci.combo_id = ?
      `).all(combo.id);
    }
    return combos;
  },
  createCombo: ({ branchId, name, code, description, priceCents, isAvailable = 1, availableFrom = null, availableTo = null, items, imageUrl = null }) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const comboId = uuid$a();
    const createTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO combos (id, branch_id, name, code, description, price_cents, image_url, is_available, available_from, available_to, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        comboId,
        branchId || null,
        name.trim(),
        code || null,
        description || null,
        priceCents,
        imageUrl || null,
        isAvailable ? 1 : 0,
        availableFrom || null,
        availableTo || null,
        now,
        now
      );
      if (Array.isArray(items)) {
        for (const item of items) {
          db.prepare(`
            INSERT INTO combo_items (id, combo_id, product_id, quantity)
            VALUES (?, ?, ?, ?)
          `).run(uuid$a(), comboId, item.productId, item.quantity || 1);
        }
      }
      logAudit$7(branchId, "CREATE_COMBO", "COMBO", comboId, { name, priceCents });
      return comboId;
    });
    return createTx();
  },
  updateCombo: (id, { name, code, description, priceCents, isAvailable, availableFrom, availableTo, items, imageUrl }) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const updateTx = db.transaction(() => {
      db.prepare(`
        UPDATE combos
        SET name = ?, code = ?, description = ?, price_cents = ?,
            is_available = ?, available_from = ?, available_to = ?, image_url = COALESCE(?, image_url), updated_at = ?
        WHERE id = ?
      `).run(
        name.trim(),
        code ? code.trim() : null,
        description ? description.trim() : null,
        priceCents,
        isAvailable !== void 0 ? isAvailable ? 1 : 0 : 1,
        availableFrom || null,
        availableTo || null,
        imageUrl !== void 0 ? imageUrl : null,
        now,
        id
      );
      if (Array.isArray(items)) {
        db.prepare("DELETE FROM combo_items WHERE combo_id = ?").run(id);
        for (const item of items) {
          db.prepare(`
            INSERT INTO combo_items (id, combo_id, product_id, quantity)
            VALUES (?, ?, ?, ?)
          `).run(uuid$a(), id, item.productId, item.quantity || 1);
        }
      }
      logAudit$7(null, "UPDATE_COMBO", "COMBO", id, { name, priceCents });
      return true;
    });
    return updateTx();
  },
  toggleComboAvailability: (id, isAvailable) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare("UPDATE combos SET is_available = ?, updated_at = ? WHERE id = ?").run(isAvailable ? 1 : 0, now, id);
    return true;
  },
  archiveCombo: (id) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare("UPDATE combos SET is_active = 0, updated_at = ? WHERE id = ?").run(now, id);
    logAudit$7(null, "ARCHIVE_COMBO", "COMBO", id, {});
    return true;
  }
};
function uuid$9() {
  return crypto.randomUUID();
}
function logAudit$6(branchId, action, entityType, entityId, details) {
  try {
    const db = getDb();
    const session = authRepository$1.getCurrentSession();
    let validUserId = null;
    if (session == null ? void 0 : session.id) {
      const exists = db.prepare("SELECT id FROM users WHERE id = ?").get(session.id);
      if (exists) validUserId = session.id;
    }
    db.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid$9(),
      branchId || (session == null ? void 0 : session.branchId) || null,
      validUserId,
      action,
      entityType,
      entityId,
      JSON.stringify(details),
      (/* @__PURE__ */ new Date()).toISOString()
    );
  } catch (err) {
    console.error("[Audit Log Error]:", err);
  }
}
const tableRepository = {
  getFloorsWithTables: (branchId) => {
    const db = getDb();
    const floors = db.prepare(`
      SELECT id, name, display_order, is_active
      FROM floors
      WHERE (branch_id = ? OR branch_id IS NULL) AND is_active = 1
      ORDER BY display_order ASC, name ASC
    `).all(branchId);
    const tables = db.prepare(`
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
    `).all(branchId);
    const now = Date.now();
    const tableMap = {};
    for (const t of tables) {
      let occupancyMinutes = 0;
      if (t.current_order_created_at) {
        occupancyMinutes = Math.max(0, Math.floor((now - new Date(t.current_order_created_at).getTime()) / 6e4));
      }
      const enrichedTable = {
        ...t,
        occupancyMinutes
      };
      if (!tableMap[t.floor_id]) tableMap[t.floor_id] = [];
      tableMap[t.floor_id].push(enrichedTable);
    }
    return floors.map((f) => ({
      ...f,
      tables: tableMap[f.id] || []
    }));
  },
  updateTableStatus: (tableId, status, currentOrderId = null) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(`
      UPDATE dining_tables
      SET status = ?, current_order_id = ?, updated_at = ?
      WHERE id = ?
    `).run(status, currentOrderId, now, tableId);
    return true;
  },
  createFloor: ({ branchId, name, displayOrder = 0 }) => {
    const db = getDb();
    const id = uuid$9();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(`
      INSERT INTO floors (id, branch_id, name, display_order, is_active, created_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(id, branchId || null, name.trim(), displayOrder, now);
    logAudit$6(branchId, "CREATE_FLOOR", "FLOOR", id, { name });
    return { id, name, displayOrder, is_active: 1 };
  },
  updateFloor: (id, { name, displayOrder = 0 }) => {
    const db = getDb();
    db.prepare(`
      UPDATE floors SET name = ?, display_order = ? WHERE id = ?
    `).run(name.trim(), displayOrder, id);
    logAudit$6(null, "UPDATE_FLOOR", "FLOOR", id, { name });
    return true;
  },
  createTable: ({ branchId, floorId, tableNumber, capacity = 4 }) => {
    const db = getDb();
    const id = uuid$9();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(`
      INSERT INTO dining_tables (id, branch_id, floor_id, table_number, capacity, status, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'AVAILABLE', 1, ?, ?)
    `).run(id, branchId || null, floorId, tableNumber.trim(), capacity, now, now);
    logAudit$6(branchId, "CREATE_TABLE", "TABLE", id, { tableNumber, capacity });
    return { id, floorId, tableNumber, capacity, status: "AVAILABLE", is_active: 1 };
  },
  updateTable: (id, { floorId, tableNumber, capacity, status }) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(`
      UPDATE dining_tables
      SET floor_id = COALESCE(?, floor_id),
          table_number = COALESCE(?, table_number),
          capacity = COALESCE(?, capacity),
          status = COALESCE(?, status),
          updated_at = ?
      WHERE id = ?
    `).run(floorId || null, tableNumber ? tableNumber.trim() : null, capacity || null, status || null, now, id);
    logAudit$6(null, "UPDATE_TABLE", "TABLE", id, { tableNumber, capacity, status });
    return true;
  },
  archiveTable: (id) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const table = db.prepare("SELECT status, current_order_id FROM dining_tables WHERE id = ?").get(id);
    if ((table == null ? void 0 : table.status) === "OCCUPIED" && (table == null ? void 0 : table.current_order_id)) {
      throw new Error("Cannot archive an occupied table with an active dining order.");
    }
    db.prepare("UPDATE dining_tables SET is_active = 0, updated_at = ? WHERE id = ?").run(now, id);
    logAudit$6(null, "ARCHIVE_TABLE", "TABLE", id, {});
    return true;
  },
  transferTable: ({ fromTableId, toTableId, reason = "Customer request" }) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const transferTx = db.transaction(() => {
      const fromTable = db.prepare("SELECT * FROM dining_tables WHERE id = ?").get(fromTableId);
      if (!fromTable) throw new Error("Source table not found.");
      if (!fromTable.current_order_id) throw new Error(`Table ${fromTable.table_number} does not have an active order to transfer.`);
      const toTable = db.prepare("SELECT * FROM dining_tables WHERE id = ?").get(toTableId);
      if (!toTable) throw new Error("Target table not found.");
      if (toTable.status === "OCCUPIED" && toTable.current_order_id) {
        throw new Error(`Target table ${toTable.table_number} is already occupied.`);
      }
      const activeOrderId = fromTable.current_order_id;
      db.prepare("UPDATE orders SET table_id = ?, updated_at = ? WHERE id = ?").run(toTableId, now, activeOrderId);
      db.prepare("UPDATE dining_tables SET status = 'AVAILABLE', current_order_id = NULL, updated_at = ? WHERE id = ?").run(now, fromTableId);
      db.prepare("UPDATE dining_tables SET status = 'OCCUPIED', current_order_id = ?, updated_at = ? WHERE id = ?").run(activeOrderId, now, toTableId);
      db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, 'OCCUPIED', 'TRANSFER', NULL, ?, ?)
      `).run(uuid$9(), activeOrderId, `Table transferred from ${fromTable.table_number} to ${toTable.table_number}. Reason: ${reason}`, now);
      logAudit$6(fromTable.branch_id, "TRANSFER_TABLE", "TABLE", activeOrderId, {
        fromTable: fromTable.table_number,
        toTable: toTable.table_number,
        reason
      });
      return {
        orderId: activeOrderId,
        fromTableNumber: fromTable.table_number,
        toTableNumber: toTable.table_number
      };
    });
    return transferTx();
  },
  mergeTables: ({ sourceTableId, targetTableId, reason = "Combine party" }) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const mergeTx = db.transaction(() => {
      const source = db.prepare("SELECT * FROM dining_tables WHERE id = ?").get(sourceTableId);
      const target = db.prepare("SELECT * FROM dining_tables WHERE id = ?").get(targetTableId);
      if (!source || !target) throw new Error("Source or target table was not found.");
      if (!source.current_order_id) throw new Error(`Table ${source.table_number} has no active order to merge.`);
      if (!target.current_order_id) throw new Error(`Table ${target.table_number} has no active order to receive the merge.`);
      if (source.current_order_id === target.current_order_id) {
        throw new Error("Both tables already share the same order.");
      }
      const sourceOrder = db.prepare("SELECT * FROM orders WHERE id = ?").get(source.current_order_id);
      const targetOrder = db.prepare("SELECT * FROM orders WHERE id = ?").get(target.current_order_id);
      if (!sourceOrder || !targetOrder) throw new Error("One of the table orders could not be loaded.");
      if (["COMPLETED", "CANCELLED", "REFUNDED"].includes(sourceOrder.status) || ["COMPLETED", "CANCELLED", "REFUNDED"].includes(targetOrder.status)) {
        throw new Error("Cannot merge completed, cancelled, or refunded orders.");
      }
      const sourceItems = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(sourceOrder.id);
      for (const item of sourceItems) {
        db.prepare("UPDATE order_items SET order_id = ? WHERE id = ?").run(targetOrder.id, item.id);
      }
      db.prepare(`
        UPDATE orders
        SET subtotal_cents = COALESCE(subtotal_cents, 0) + ?,
            discount_cents = COALESCE(discount_cents, 0) + ?,
            tax_cents = COALESCE(tax_cents, 0) + ?,
            service_charge_cents = COALESCE(service_charge_cents, 0) + ?,
            total_cents = COALESCE(total_cents, 0) + ?,
            paid_cents = COALESCE(paid_cents, 0) + ?,
            notes = TRIM(COALESCE(notes, '') || char(10) || 'Merged from table ' || ? || ' (' || ? || ')'),
            updated_at = ?
        WHERE id = ?
      `).run(
        sourceOrder.subtotal_cents || 0,
        sourceOrder.discount_cents || 0,
        sourceOrder.tax_cents || 0,
        sourceOrder.service_charge_cents || 0,
        sourceOrder.total_cents || 0,
        sourceOrder.paid_cents || 0,
        source.table_number,
        sourceOrder.order_number,
        now,
        targetOrder.id
      );
      db.prepare(`
        UPDATE orders
        SET status = 'CANCELLED',
            notes = TRIM(COALESCE(notes, '') || char(10) || '[Merged into ' || ? || ']'),
            updated_at = ?
        WHERE id = ?
      `).run(targetOrder.order_number, now, sourceOrder.id);
      db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, ?, 'CANCELLED', NULL, ?, ?)
      `).run(uuid$9(), sourceOrder.id, sourceOrder.status, `Merged into ${targetOrder.order_number}. ${reason}`, now);
      db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, ?, ?, NULL, ?, ?)
      `).run(uuid$9(), targetOrder.id, targetOrder.status, targetOrder.status, `Merged table ${source.table_number} into this order. ${reason}`, now);
      db.prepare("UPDATE dining_tables SET status = 'AVAILABLE', current_order_id = NULL, updated_at = ? WHERE id = ?").run(now, sourceTableId);
      logAudit$6(target.branch_id, "MERGE_TABLES", "TABLE", targetOrder.id, {
        sourceTable: source.table_number,
        targetTable: target.table_number,
        sourceOrder: sourceOrder.order_number,
        targetOrder: targetOrder.order_number,
        reason
      });
      return {
        survivingOrderId: targetOrder.id,
        sourceTableNumber: source.table_number,
        targetTableNumber: target.table_number
      };
    });
    return mergeTx();
  }
};
function uuid$8() {
  return crypto.randomUUID();
}
function logAudit$5(branchId, action, entityType, entityId, details) {
  try {
    const db = getDb();
    const session = authRepository$1.getCurrentSession();
    let validUserId = null;
    if (session == null ? void 0 : session.id) {
      const exists = db.prepare("SELECT id FROM users WHERE id = ?").get(session.id);
      if (exists) validUserId = session.id;
    }
    db.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid$8(),
      branchId || null,
      validUserId,
      action,
      entityType,
      entityId,
      typeof details === "string" ? details : JSON.stringify(details),
      (/* @__PURE__ */ new Date()).toISOString()
    );
  } catch (e) {
    console.error("Failed to log audit:", e);
  }
}
const inventoryRepository = {
  // ==========================================
  // 1. INVENTORY UNITS & ITEMS (STOCK MASTER)
  // ==========================================
  getUnits: () => {
    const db = getDb();
    return db.prepare("SELECT * FROM inventory_units ORDER BY name ASC").all();
  },
  createUnit: ({ name, abbreviation }) => {
    const db = getDb();
    const id = uuid$8();
    db.prepare("INSERT INTO inventory_units (id, name, abbreviation) VALUES (?, ?, ?)").run(id, name, abbreviation);
    return db.prepare("SELECT * FROM inventory_units WHERE id = ?").get(id);
  },
  getItems: (params = {}) => {
    var _a;
    const db = getDb();
    const branchId = params.branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    let query = `
      SELECT i.*, 
             u.name as unit_name, u.abbreviation as unit_abbr,
             s.company_name as supplier_name
      FROM inventory_items i
      LEFT JOIN inventory_units u ON i.unit_id = u.id
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.branch_id = ? AND i.is_active = 1
    `;
    const queryParams = [branchId];
    if (params.category && params.category !== "ALL") {
      query += " AND i.category = ?";
      queryParams.push(params.category);
    }
    if (params.search && params.search.trim() !== "") {
      query += " AND (LOWER(i.name) LIKE ? OR LOWER(i.sku) LIKE ?)";
      const term = `%${params.search.trim().toLowerCase()}%`;
      queryParams.push(term, term);
    }
    if (params.lowStockOnly) {
      query += " AND i.current_stock <= i.minimum_level";
    }
    query += " ORDER BY i.name ASC";
    const rows = db.prepare(query).all(...queryParams);
    return rows.map((row) => ({
      ...row,
      isLowStock: row.current_stock <= row.minimum_level,
      isOutOfStock: row.current_stock <= 0,
      totalValueCents: Math.round(row.current_stock * (row.cost_per_unit_cents || 0))
    }));
  },
  getItemById: (id) => {
    const db = getDb();
    const row = db.prepare(`
      SELECT i.*, 
             u.name as unit_name, u.abbreviation as unit_abbr,
             s.company_name as supplier_name
      FROM inventory_items i
      LEFT JOIN inventory_units u ON i.unit_id = u.id
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.id = ?
    `).get(id);
    if (!row) return null;
    return {
      ...row,
      isLowStock: row.current_stock <= row.minimum_level,
      isOutOfStock: row.current_stock <= 0,
      totalValueCents: Math.round(row.current_stock * (row.cost_per_unit_cents || 0))
    };
  },
  createItem: (itemData) => {
    var _a;
    const db = getDb();
    const id = uuid$8();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const branchId = itemData.branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const openingStock = parseFloat(itemData.currentStock || itemData.openingStock || 0);
    const createItemTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO inventory_items (
          id, branch_id, name, sku, unit_id, current_stock, minimum_level,
          cost_per_unit_cents, category, supplier_id, image_url, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        id,
        branchId,
        itemData.name,
        itemData.sku || `RAW-${Date.now().toString().slice(-6)}`,
        itemData.unitId,
        openingStock,
        parseFloat(itemData.minimumLevel || 5),
        parseInt(itemData.costPerUnitCents || 0, 10),
        itemData.category || "General",
        itemData.supplierId || null,
        itemData.imageUrl || itemData.image_url || null,
        now,
        now
      );
      if (openingStock > 0) {
        db.prepare(`
          INSERT INTO stock_movements (
            id, branch_id, inventory_item_id, movement_type, quantity,
            previous_stock, new_stock, unit_cost_cents, reference_type, reason, created_at
          ) VALUES (?, ?, ?, 'ADJUSTMENT', ?, 0, ?, ?, 'MANUAL', 'Initial opening stock', ?)
        `).run(
          uuid$8(),
          branchId,
          id,
          openingStock,
          openingStock,
          parseInt(itemData.costPerUnitCents || 0, 10),
          now
        );
      }
      logAudit$5(branchId, "CREATE_INVENTORY_ITEM", "INVENTORY_ITEM", id, {
        name: itemData.name,
        stock: openingStock
      });
      return inventoryRepository.getItemById(id);
    });
    return createItemTx();
  },
  updateItem: (id, itemData) => {
    const db = getDb();
    const existing = db.prepare("SELECT * FROM inventory_items WHERE id = ?").get(id);
    if (!existing) throw new Error(`Inventory item with ID "${id}" not found.`);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(`
      UPDATE inventory_items
      SET name = COALESCE(?, name),
          sku = COALESCE(?, sku),
          unit_id = COALESCE(?, unit_id),
          minimum_level = COALESCE(?, minimum_level),
          cost_per_unit_cents = COALESCE(?, cost_per_unit_cents),
          image_url = COALESCE(?, image_url),
          category = COALESCE(?, category),
          supplier_id = COALESCE(?, supplier_id),
          updated_at = ?
      WHERE id = ?
    `).run(
      itemData.name ?? null,
      itemData.sku ?? null,
      itemData.unitId ?? null,
      itemData.minimumLevel !== void 0 ? parseFloat(itemData.minimumLevel) : null,
      itemData.costPerUnitCents !== void 0 ? parseInt(itemData.costPerUnitCents, 10) : null,
      itemData.imageUrl !== void 0 ? itemData.imageUrl : itemData.image_url ?? null,
      itemData.category ?? null,
      itemData.supplierId ?? null,
      now,
      id
    );
    logAudit$5(existing.branch_id, "UPDATE_INVENTORY_ITEM", "INVENTORY_ITEM", id, itemData);
    return inventoryRepository.getItemById(id);
  },
  /**
   * Manual Stock Adjustment, Wastage or Return
   */
  adjustStock: ({ itemId, branchId, quantityChange, movementType, reason, userId }) => {
    const db = getDb();
    const item = db.prepare("SELECT * FROM inventory_items WHERE id = ?").get(itemId);
    if (!item) throw new Error(`Inventory item with ID "${itemId}" not found.`);
    const delta = parseFloat(quantityChange);
    if (isNaN(delta) || delta === 0) {
      throw new Error("Quantity change must be a non-zero number.");
    }
    const previousStock = parseFloat(item.current_stock);
    const newStock = previousStock + delta;
    if (newStock < 0) {
      throw new Error(`Insufficient stock for "${item.name}". Current: ${previousStock}, adjustment: ${delta}`);
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const targetBranchId = branchId || item.branch_id;
    const adjustTx = db.transaction(() => {
      db.prepare(`
        UPDATE inventory_items
        SET current_stock = ?,
            updated_at = ?
        WHERE id = ?
      `).run(newStock, now, itemId);
      db.prepare(`
        INSERT INTO stock_movements (
          id, branch_id, inventory_item_id, movement_type, quantity,
          previous_stock, new_stock, unit_cost_cents, reference_type,
          reason, user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?, ?)
      `).run(
        uuid$8(),
        targetBranchId,
        itemId,
        movementType || (delta > 0 ? "ADJUSTMENT" : "WASTAGE"),
        Math.abs(delta),
        previousStock,
        newStock,
        item.cost_per_unit_cents,
        reason || "Manual inventory adjustment",
        userId || null,
        now
      );
      logAudit$5(targetBranchId, "ADJUST_STOCK", "INVENTORY_ITEM", itemId, {
        previousStock,
        newStock,
        delta,
        movementType,
        reason
      });
      return inventoryRepository.getItemById(itemId);
    });
    return adjustTx();
  },
  getStockMovements: (params = {}) => {
    var _a;
    const db = getDb();
    const branchId = params.branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    let query = `
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
    const queryParams = [branchId];
    if (params.itemId) {
      query += " AND sm.inventory_item_id = ?";
      queryParams.push(params.itemId);
    }
    if (params.movementType) {
      query += " AND sm.movement_type = ?";
      queryParams.push(params.movementType);
    }
    query += " ORDER BY sm.created_at DESC LIMIT ?";
    queryParams.push(params.limit || 100);
    return db.prepare(query).all(...queryParams);
  },
  // ==========================================
  // 2. RECIPES & FOOD COST MANAGEMENT
  // ==========================================
  getRecipes: (params = {}) => {
    var _a;
    const db = getDb();
    const branchId = params.branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const recipes = db.prepare(`
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
    `).all(branchId);
    return recipes.map((rec) => {
      const ingredients = db.prepare(`
        SELECT ri.*, 
               i.name as item_name, i.current_stock, i.cost_per_unit_cents,
               u.abbreviation as unit_abbr
        FROM recipe_ingredients ri
        JOIN inventory_items i ON ri.inventory_item_id = i.id
        LEFT JOIN inventory_units u ON i.unit_id = u.id
        WHERE ri.recipe_id = ?
      `).all(rec.id);
      const foodCostCents = ingredients.reduce((sum, ing) => {
        const wasteFactor = 1 + (ing.wastage_percentage || 0) / 100;
        return sum + Math.round(ing.quantity_required * wasteFactor * (ing.cost_per_unit_cents || 0));
      }, 0);
      const sellingPriceCents = rec.variation_price_cents || rec.base_price_cents || 0;
      const grossMarginCents = Math.max(0, sellingPriceCents - foodCostCents);
      const foodCostPercentage = sellingPriceCents > 0 ? parseFloat((foodCostCents / sellingPriceCents * 100).toFixed(1)) : 0;
      return {
        ...rec,
        ingredients,
        foodCostCents,
        grossMarginCents,
        foodCostPercentage,
        sellingPriceCents
      };
    });
  },
  getRecipeForProduct: (productId, variationId = null) => {
    const db = getDb();
    const query = variationId ? "SELECT * FROM recipes WHERE product_id = ? AND variation_id = ? LIMIT 1" : "SELECT * FROM recipes WHERE product_id = ? LIMIT 1";
    const params = variationId ? [productId, variationId] : [productId];
    const recipe = db.prepare(query).get(...params);
    if (!recipe) return null;
    const ingredients = db.prepare(`
      SELECT ri.*, 
             i.name as item_name, i.current_stock, i.cost_per_unit_cents,
             u.abbreviation as unit_abbr
      FROM recipe_ingredients ri
      JOIN inventory_items i ON ri.inventory_item_id = i.id
      LEFT JOIN inventory_units u ON i.unit_id = u.id
      WHERE ri.recipe_id = ?
    `).all(recipe.id);
    const foodCostCents = ingredients.reduce((sum, ing) => {
      const wasteFactor = 1 + (ing.wastage_percentage || 0) / 100;
      return sum + Math.round(ing.quantity_required * wasteFactor * (ing.cost_per_unit_cents || 0));
    }, 0);
    return {
      ...recipe,
      ingredients,
      foodCostCents
    };
  },
  saveRecipe: ({ productId, variationId, yieldQuantity, notes, ingredients, imageUrl = null }) => {
    const db = getDb();
    const saveRecipeTx = db.transaction(() => {
      let existing = db.prepare(`
        SELECT id FROM recipes
        WHERE product_id = ? AND (variation_id = ? OR (variation_id IS NULL AND ? IS NULL))
      `).get(productId, variationId || null, variationId || null);
      let recipeId = existing == null ? void 0 : existing.id;
      if (recipeId) {
        db.prepare("UPDATE recipes SET yield_quantity = ?, notes = ?, image_url = COALESCE(?, image_url) WHERE id = ?").run(parseFloat(yieldQuantity || 1), notes || null, imageUrl, recipeId);
        db.prepare("DELETE FROM recipe_ingredients WHERE recipe_id = ?").run(recipeId);
      } else {
        recipeId = uuid$8();
        db.prepare(`
          INSERT INTO recipes (id, product_id, variation_id, yield_quantity, notes, image_url)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(recipeId, productId, variationId || null, parseFloat(yieldQuantity || 1), notes || null, imageUrl);
      }
      if (Array.isArray(ingredients)) {
        for (const ing of ingredients) {
          db.prepare(`
            INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required, wastage_percentage)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            uuid$8(),
            recipeId,
            ing.inventoryItemId,
            parseFloat(ing.quantityRequired),
            parseFloat(ing.wastagePercentage || 0)
          );
        }
      }
      const prod = db.prepare("SELECT branch_id, name FROM products WHERE id = ?").get(productId);
      logAudit$5(prod == null ? void 0 : prod.branch_id, "SAVE_RECIPE", "RECIPE", recipeId, {
        productId,
        productName: prod == null ? void 0 : prod.name,
        ingredientsCount: (ingredients == null ? void 0 : ingredients.length) || 0
      });
      return inventoryRepository.getRecipeForProduct(productId, variationId);
    });
    return saveRecipeTx();
  },
  /**
   * Automatic recipe stock deduction when POS order is completed/paid
   */
  deductRecipeStockForOrder: (orderId) => {
    const db = getDb();
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!order) return { success: false, reason: "Order not found" };
    if (order.stock_posted === 1) {
      return { success: true, skipped: true, reason: "Stock already posted for this sale" };
    }
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(orderId);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const deductions = [];
    const deductionTx = db.transaction(() => {
      for (const it of items) {
        const recipe = inventoryRepository.getRecipeForProduct(it.product_id, it.variation_id);
        if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) continue;
        const itemQty = it.quantity || 1;
        for (const ing of recipe.ingredients) {
          const wasteFactor = 1 + (ing.wastage_percentage || 0) / 100;
          const deductAmount = parseFloat((ing.quantity_required * itemQty * wasteFactor).toFixed(3));
          const rawItem = db.prepare("SELECT current_stock, cost_per_unit_cents FROM inventory_items WHERE id = ?").get(ing.inventory_item_id);
          if (!rawItem) continue;
          const prevStock = parseFloat(rawItem.current_stock);
          const newStock = Math.max(0, parseFloat((prevStock - deductAmount).toFixed(3)));
          db.prepare("UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?").run(newStock, now, ing.inventory_item_id);
          db.prepare(`
            INSERT INTO stock_movements (
              id, branch_id, inventory_item_id, movement_type, quantity,
              previous_stock, new_stock, unit_cost_cents, reference_type, reference_id,
              reason, created_at
            ) VALUES (?, ?, ?, 'SALE_DEDUCTION', ?, ?, ?, ?, 'ORDER', ?, ?, ?)
          `).run(
            uuid$8(),
            order.branch_id,
            ing.inventory_item_id,
            deductAmount,
            prevStock,
            newStock,
            rawItem.cost_per_unit_cents,
            orderId,
            `Auto recipe deduction for Order ${order.order_number} (${it.item_name} x${itemQty})`,
            now
          );
          deductions.push({
            itemId: ing.inventory_item_id,
            itemName: ing.item_name,
            deducted: deductAmount,
            remainingStock: newStock
          });
        }
      }
      db.prepare("UPDATE orders SET stock_posted = 1, updated_at = ? WHERE id = ?").run(now, orderId);
      return deductions;
    });
    return deductionTx();
  },
  reverseRecipeStockForOrder: (orderId, reason = "Refund restock") => {
    const db = getDb();
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!order) return { success: false, reason: "Order not found" };
    if (order.stock_posted !== 1) {
      return { success: true, skipped: true, reason: "No posted stock to reverse" };
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const reverseTx = db.transaction(() => {
      const movements = db.prepare(`
        SELECT * FROM stock_movements
        WHERE reference_type = 'ORDER' AND reference_id = ? AND movement_type = 'SALE_DEDUCTION'
      `).all(orderId);
      for (const mv of movements) {
        const rawItem = db.prepare("SELECT current_stock FROM inventory_items WHERE id = ?").get(mv.inventory_item_id);
        if (!rawItem) continue;
        const prevStock = parseFloat(rawItem.current_stock);
        const qty = parseFloat(mv.quantity);
        const newStock = parseFloat((prevStock + qty).toFixed(3));
        db.prepare("UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?").run(newStock, now, mv.inventory_item_id);
        db.prepare(`
          INSERT INTO stock_movements (
            id, branch_id, inventory_item_id, movement_type, quantity,
            previous_stock, new_stock, unit_cost_cents, reference_type, reference_id,
            reason, created_at
          ) VALUES (?, ?, ?, 'SALE_REVERSAL', ?, ?, ?, ?, 'ORDER', ?, ?, ?)
        `).run(
          uuid$8(),
          order.branch_id,
          mv.inventory_item_id,
          qty,
          prevStock,
          newStock,
          mv.unit_cost_cents,
          orderId,
          reason,
          now
        );
      }
      db.prepare("UPDATE orders SET stock_posted = 0, updated_at = ? WHERE id = ?").run(now, orderId);
      return { reversed: movements.length };
    });
    return reverseTx();
  },
  // ==========================================
  // 3. SUPPLIERS & PURCHASES
  // ==========================================
  getSuppliers: (branchId) => {
    var _a;
    const db = getDb();
    const targetBranchId = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const suppliers = db.prepare(`
      SELECT s.*,
             (SELECT COUNT(*) FROM purchase_orders WHERE supplier_id = s.id) as total_po_count,
             (SELECT COALESCE(SUM(total_cents), 0) FROM purchase_orders WHERE supplier_id = s.id AND status = 'RECEIVED') as total_purchases_cents,
             (SELECT COALESCE(SUM(amount_cents), 0) FROM vendor_payments WHERE supplier_id = s.id) as total_paid_cents
      FROM suppliers s
      WHERE s.branch_id = ? AND s.is_active = 1
      ORDER BY s.company_name ASC
    `).all(targetBranchId);
    return suppliers.map((sup) => ({
      ...sup,
      outstandingBalanceCents: Math.max(0, (sup.total_purchases_cents || 0) - (sup.total_paid_cents || 0))
    }));
  },
  createSupplier: (supplierData) => {
    var _a;
    const db = getDb();
    const id = uuid$8();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const branchId = supplierData.branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    db.prepare(`
      INSERT INTO suppliers (id, branch_id, company_name, contact_name, phone, email, address, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      id,
      branchId,
      supplierData.companyName,
      supplierData.contactName || null,
      supplierData.phone || null,
      supplierData.email || null,
      supplierData.address || null,
      now
    );
    logAudit$5(branchId, "CREATE_SUPPLIER", "SUPPLIER", id, { companyName: supplierData.companyName });
    return db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
  },
  updateSupplier: (id, supplierData) => {
    const db = getDb();
    const existing = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
    if (!existing) throw new Error(`Supplier with ID "${id}" not found.`);
    db.prepare(`
      UPDATE suppliers
      SET company_name = COALESCE(?, company_name),
          contact_name = COALESCE(?, contact_name),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          address = COALESCE(?, address),
          is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).run(
      supplierData.companyName ?? null,
      supplierData.contactName ?? null,
      supplierData.phone ?? null,
      supplierData.email ?? null,
      supplierData.address ?? null,
      supplierData.isActive ?? null,
      id
    );
    logAudit$5(existing.branch_id, "UPDATE_SUPPLIER", "SUPPLIER", id, supplierData);
    return db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
  },
  getPurchaseOrders: (params = {}) => {
    var _a;
    const db = getDb();
    const branchId = params.branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    let query = `
      SELECT po.*, s.company_name as supplier_name, s.phone as supplier_phone
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id = s.id
      WHERE po.branch_id = ?
    `;
    const queryParams = [branchId];
    if (params.supplierId) {
      query += " AND po.supplier_id = ?";
      queryParams.push(params.supplierId);
    }
    if (params.status) {
      query += " AND po.status = ?";
      queryParams.push(params.status);
    }
    query += " ORDER BY po.created_at DESC";
    const orders = db.prepare(query).all(...queryParams);
    return orders.map((o) => {
      const items = db.prepare(`
        SELECT poi.*, i.name as item_name, u.abbreviation as unit_abbr
        FROM purchase_order_items poi
        JOIN inventory_items i ON poi.inventory_item_id = i.id
        LEFT JOIN inventory_units u ON i.unit_id = u.id
        WHERE poi.po_id = ?
      `).all(o.id);
      return {
        ...o,
        items
      };
    });
  },
  /**
   * Create Purchase Order with optional auto-receive (Goods Received Note - GRN)
   */
  createPurchaseOrder: ({ branchId, supplierId, poNumber, notes, items, autoReceive }) => {
    var _a;
    const db = getDb();
    const targetBranchId = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const id = uuid$8();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const status = autoReceive ? "RECEIVED" : "ORDERED";
    const generatedPoNumber = poNumber || `PO-${Date.now().toString().slice(-6)}`;
    const createPoTx = db.transaction(() => {
      const totalCents = (items || []).reduce((acc, it) => acc + (it.totalCents || Math.round(it.quantity * it.unitCostCents)), 0);
      db.prepare(`
        INSERT INTO purchase_orders (id, branch_id, supplier_id, po_number, status, total_cents, notes, created_at, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        targetBranchId,
        supplierId,
        generatedPoNumber,
        status,
        totalCents,
        notes || null,
        now,
        autoReceive ? now : null
      );
      if (Array.isArray(items)) {
        for (const it of items) {
          const itemTotal = it.totalCents || Math.round(it.quantity * it.unitCostCents);
          db.prepare(`
            INSERT INTO purchase_order_items (id, po_id, inventory_item_id, quantity, unit_cost_cents, total_cents)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(uuid$8(), id, it.inventoryItemId, parseFloat(it.quantity), parseInt(it.unitCostCents, 10), itemTotal);
          if (autoReceive) {
            const rawItem = db.prepare("SELECT current_stock FROM inventory_items WHERE id = ?").get(it.inventoryItemId);
            if (rawItem) {
              const prev = parseFloat(rawItem.current_stock);
              const added = parseFloat(it.quantity);
              const next = prev + added;
              db.prepare(`
                UPDATE inventory_items
                SET current_stock = ?,
                    cost_per_unit_cents = ?,
                    updated_at = ?
                WHERE id = ?
              `).run(next, parseInt(it.unitCostCents, 10), now, it.inventoryItemId);
              db.prepare(`
                INSERT INTO stock_movements (
                  id, branch_id, inventory_item_id, movement_type, quantity,
                  previous_stock, new_stock, unit_cost_cents, reference_type, reference_id,
                  reason, created_at
                ) VALUES (?, ?, ?, 'PURCHASE', ?, ?, ?, ?, 'PO', ?, ?, ?)
              `).run(
                uuid$8(),
                targetBranchId,
                it.inventoryItemId,
                added,
                prev,
                next,
                parseInt(it.unitCostCents, 10),
                id,
                `Goods Received for PO ${generatedPoNumber}`,
                now
              );
            }
          }
        }
      }
      logAudit$5(targetBranchId, "CREATE_PURCHASE_ORDER", "PURCHASE_ORDER", id, {
        poNumber: generatedPoNumber,
        status,
        totalCents
      });
      return db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(id);
    });
    return createPoTx();
  },
  recordVendorPayment: ({ branchId, supplierId, poId, amountCents, paymentMethod, referenceNumber, notes }) => {
    var _a;
    const db = getDb();
    const targetBranchId = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const id = uuid$8();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(`
      INSERT INTO vendor_payments (
        id, branch_id, supplier_id, po_id, amount_cents, payment_method,
        reference_number, notes, payment_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      targetBranchId,
      supplierId,
      poId || null,
      parseInt(amountCents, 10),
      paymentMethod || "BANK_TRANSFER",
      referenceNumber || null,
      notes || null,
      now,
      now
    );
    logAudit$5(targetBranchId, "RECORD_VENDOR_PAYMENT", "VENDOR_PAYMENT", id, {
      supplierId,
      amountCents,
      paymentMethod
    });
    return db.prepare("SELECT * FROM vendor_payments WHERE id = ?").get(id);
  },
  // ==========================================
  // 4. EXPENSE MANAGEMENT
  // ==========================================
  getExpenseCategories: () => {
    const db = getDb();
    return db.prepare("SELECT * FROM expense_categories ORDER BY name ASC").all();
  },
  getExpenses: (params = {}) => {
    var _a;
    const db = getDb();
    const branchId = params.branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    let query = `
      SELECT e.*, c.name as category_name, c.code as category_code,
             u.display_name as recorded_by_name
      FROM expenses e
      JOIN expense_categories c ON e.category_id = c.id
      LEFT JOIN users u ON e.recorded_by_user_id = u.id
      WHERE e.branch_id = ?
    `;
    const queryParams = [branchId];
    if (params.categoryId && params.categoryId !== "ALL") {
      query += " AND e.category_id = ?";
      queryParams.push(params.categoryId);
    }
    if (params.startDate) {
      query += " AND date(e.expense_date) >= date(?)";
      queryParams.push(params.startDate);
    }
    if (params.endDate) {
      query += " AND date(e.expense_date) <= date(?)";
      queryParams.push(params.endDate);
    }
    query += " ORDER BY e.expense_date DESC, e.created_at DESC";
    return db.prepare(query).all(...queryParams);
  },
  createExpense: ({ branchId, categoryId, amountCents, paymentMethod, payee, description, expenseDate, userId }) => {
    var _a;
    const db = getDb();
    const targetBranchId = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const id = uuid$8();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const session = authRepository$1.getCurrentSession();
    db.prepare(`
      INSERT INTO expenses (
        id, branch_id, category_id, amount_cents, payment_method,
        payee, description, recorded_by_user_id, expense_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      targetBranchId,
      categoryId,
      parseInt(amountCents, 10),
      paymentMethod || "CASH",
      payee || null,
      description || null,
      userId || (session == null ? void 0 : session.id) || null,
      expenseDate || now,
      now
    );
    logAudit$5(targetBranchId, "RECORD_EXPENSE", "EXPENSE", id, {
      amountCents,
      categoryId,
      payee
    });
    return db.prepare(`
      SELECT e.*, c.name as category_name
      FROM expenses e
      JOIN expense_categories c ON e.category_id = c.id
      WHERE e.id = ?
    `).get(id);
  },
  getExpenseSummary: (params = {}) => {
    var _a;
    const db = getDb();
    const branchId = params.branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const totalCents = db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) as total FROM expenses
      WHERE branch_id = ?
    `).get(branchId).total;
    const categoryBreakdown = db.prepare(`
      SELECT c.name as category_name, COALESCE(SUM(e.amount_cents), 0) as amount_cents, COUNT(e.id) as count
      FROM expense_categories c
      LEFT JOIN expenses e ON e.category_id = c.id AND e.branch_id = ?
      GROUP BY c.id
      ORDER BY amount_cents DESC
    `).all(branchId);
    return {
      totalCents,
      categoryBreakdown
    };
  }
};
function uuid$7() {
  return crypto.randomUUID();
}
function resolveValidBranchId$5(db, branchId) {
  if (branchId) {
    const b = db.prepare("SELECT id FROM branches WHERE id = ?").get(branchId);
    if (b) return b.id;
  }
  const session = authRepository$1.getCurrentSession();
  if (session == null ? void 0 : session.branchId) {
    const b = db.prepare("SELECT id FROM branches WHERE id = ?").get(session.branchId);
    if (b) return b.id;
  }
  const fallback = db.prepare("SELECT id FROM branches LIMIT 1").get();
  return (fallback == null ? void 0 : fallback.id) || null;
}
function resolveValidUserId$4(db, userId) {
  const session = authRepository$1.getCurrentSession();
  if (session == null ? void 0 : session.id) {
    const u = db.prepare("SELECT id FROM users WHERE id = ?").get(session.id);
    if (u) return u.id;
  }
  const fallback = db.prepare("SELECT id FROM users WHERE is_active = 1 LIMIT 1").get();
  return (fallback == null ? void 0 : fallback.id) || null;
}
function logAudit$4(branchId, action, entityType, entityId, details) {
  try {
    const db = getDb();
    const validUserId = resolveValidUserId$4(db, null);
    const validBranchId = resolveValidBranchId$5(db, branchId);
    db.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid$7(),
      validBranchId,
      validUserId,
      action,
      entityType,
      entityId,
      JSON.stringify(details),
      (/* @__PURE__ */ new Date()).toISOString()
    );
  } catch (err) {
    console.error("[Customer Audit Log Error]:", err);
  }
}
const customerRepository = {
  getCustomers: (branchId, searchQuery = "", limit = 50, tag = null) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId$5(db, branchId);
    let sql = `
      SELECT id, branch_id, name, phone, email, address, tag,
             credit_balance_cents, loyalty_points, order_count, total_spent_cents,
             notes, birth_date, is_active, created_at, updated_at
      FROM customers
      WHERE (branch_id = ? OR branch_id IS NULL)
    `;
    const params = [validBranchId];
    if (tag && tag !== "ALL") {
      sql += " AND tag = ?";
      params.push(tag);
    }
    if (searchQuery && searchQuery.trim() !== "") {
      sql += " AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)";
      const term = `%${searchQuery.trim()}%`;
      params.push(term, term, term);
    }
    sql += " ORDER BY name ASC LIMIT ?";
    params.push(limit);
    return db.prepare(sql).all(...params);
  },
  getCustomerById: (id) => {
    const db = getDb();
    const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(id);
    if (!customer) return null;
    const recentOrders = db.prepare(`
      SELECT id, order_number, order_type, total_cents, status, created_at
      FROM orders
      WHERE customer_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(id);
    const loyaltyHistory = db.prepare(`
      SELECT * FROM loyalty_transactions
      WHERE customer_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(id);
    return { ...customer, recentOrders, loyaltyHistory };
  },
  createCustomer: ({ branchId, name, phone, email, address, tag = "REGULAR", birthDate = null, notes = null, imageUrl = null }) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId$5(db, branchId);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const id = uuid$7();
    if (phone && phone.trim() !== "") {
      const existing = db.prepare("SELECT id, name FROM customers WHERE phone = ?").get(phone.trim());
      if (existing) {
        throw new Error(`Customer with phone "${phone.trim()}" already exists (${existing.name}).`);
      }
    }
    db.prepare(`
      INSERT INTO customers (
        id, branch_id, name, phone, email, address, tag, birth_date,
        notes, image_url, loyalty_points, credit_balance_cents, total_spent_cents,
        order_count, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 1, ?, ?)
    `).run(
      id,
      validBranchId,
      name.trim(),
      phone ? phone.trim() : null,
      email ? email.trim() : null,
      address ? address.trim() : null,
      tag || "REGULAR",
      birthDate || null,
      notes ? notes.trim() : null,
      imageUrl || null,
      now,
      now
    );
    logAudit$4(validBranchId, "CREATE_CUSTOMER", "CUSTOMER", id, { name, phone, tag });
    return customerRepository.getCustomerById(id);
  },
  updateCustomer: (id, { name, phone, email, address, tag, birthDate, notes, isActive, imageUrl }) => {
    const db = getDb();
    const existing = db.prepare("SELECT * FROM customers WHERE id = ?").get(id);
    if (!existing) throw new Error("Customer not found.");
    if (phone && phone.trim() !== "" && phone.trim() !== existing.phone) {
      const duplicate = db.prepare("SELECT id, name FROM customers WHERE phone = ? AND id != ?").get(phone.trim(), id);
      if (duplicate) {
        throw new Error(`Another customer with phone "${phone.trim()}" already exists (${duplicate.name}).`);
      }
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(`
      UPDATE customers
      SET name = ?,
          phone = ?,
          email = ?,
          address = ?,
          tag = ?,
          birth_date = ?,
          notes = ?,
          image_url = ?,
          is_active = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      name !== void 0 ? name.trim() : existing.name,
      phone !== void 0 ? phone ? phone.trim() : null : existing.phone,
      email !== void 0 ? email ? email.trim() : null : existing.email,
      address !== void 0 ? address ? address.trim() : null : existing.address,
      tag !== void 0 ? tag : existing.tag,
      birthDate !== void 0 ? birthDate : existing.birth_date,
      notes !== void 0 ? notes ? notes.trim() : null : existing.notes,
      imageUrl !== void 0 ? imageUrl : existing.image_url,
      isActive !== void 0 ? isActive ? 1 : 0 : existing.is_active,
      now,
      id
    );
    logAudit$4(existing.branch_id, "UPDATE_CUSTOMER", "CUSTOMER", id, { name, phone, tag });
    return customerRepository.getCustomerById(id);
  },
  /**
   * Adjust or award/redeem loyalty points
   */
  adjustLoyaltyPoints: ({ customerId, branchId, orderId = null, pointsChanged, transactionType = "ADJUSTMENT", notes = null }) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId$5(db, branchId);
    const adjustTx = db.transaction(() => {
      const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(customerId);
      if (!customer) throw new Error("Customer not found.");
      const currentPoints = customer.loyalty_points || 0;
      const delta = parseInt(pointsChanged, 10) || 0;
      const balanceAfter = Math.max(0, currentPoints + delta);
      const txId = uuid$7();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      db.prepare(`
        INSERT INTO loyalty_transactions (
          id, customer_id, branch_id, order_id, points_changed,
          transaction_type, balance_after, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        txId,
        customerId,
        validBranchId,
        orderId,
        delta,
        transactionType.toUpperCase(),
        balanceAfter,
        notes || `Points ${delta >= 0 ? "earned" : "redeemed"}`,
        now
      );
      db.prepare("UPDATE customers SET loyalty_points = ?, updated_at = ? WHERE id = ?").run(balanceAfter, now, customerId);
      logAudit$4(validBranchId, "ADJUST_LOYALTY_POINTS", "CUSTOMER", customerId, {
        pointsChanged: delta,
        balanceAfter,
        transactionType
      });
      return {
        customerId,
        pointsChanged: delta,
        balanceAfter
      };
    });
    return adjustTx();
  },
  /**
   * Get CRM Analytics Summary
   */
  getCrmSummary: (branchId) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId$5(db, branchId);
    const stats = db.prepare(`
      SELECT COUNT(*) as total_customers,
             COALESCE(SUM(total_spent_cents), 0) as total_revenue_cents,
             COALESCE(SUM(order_count), 0) as total_orders,
             COALESCE(SUM(loyalty_points), 0) as total_active_points,
             COUNT(CASE WHEN tag = 'VIP' THEN 1 END) as vip_count,
             COUNT(CASE WHEN tag = 'REGULAR' THEN 1 END) as regular_count,
             COUNT(CASE WHEN tag = 'CORPORATE' THEN 1 END) as corporate_count
      FROM customers
      WHERE branch_id = ? OR branch_id IS NULL
    `).get(validBranchId);
    return stats;
  }
};
function enqueueOutbox(entityType, entityId, operation, payload = {}) {
  try {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(`
      INSERT INTO sync_outbox (id, entity_type, entity_id, operation, payload_json, status, retry_count, created_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?)
    `).run(
      crypto.randomUUID(),
      entityType,
      entityId,
      operation,
      JSON.stringify(payload),
      now
    );
  } catch (err) {
    console.warn("[Outbox] Could not enqueue:", err.message);
  }
}
function uuid$6() {
  return crypto.randomUUID();
}
function resolveValidUserId$3(db, userId) {
  if (userId) {
    const u = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    if (u) return u.id;
  }
  const session = authRepository$1.getCurrentSession();
  if (session == null ? void 0 : session.id) {
    const u = db.prepare("SELECT id FROM users WHERE id = ?").get(session.id);
    if (u) return u.id;
  }
  const fallback = db.prepare("SELECT id FROM users WHERE is_active = 1 LIMIT 1").get();
  return (fallback == null ? void 0 : fallback.id) || null;
}
function resolveValidBranchId$4(db, branchId) {
  if (branchId) {
    const b = db.prepare("SELECT id FROM branches WHERE id = ?").get(branchId);
    if (b) return b.id;
  }
  const session = authRepository$1.getCurrentSession();
  if (session == null ? void 0 : session.branchId) {
    const b = db.prepare("SELECT id FROM branches WHERE id = ?").get(session.branchId);
    if (b) return b.id;
  }
  const fallback = db.prepare("SELECT id FROM branches LIMIT 1").get();
  return (fallback == null ? void 0 : fallback.id) || null;
}
function logAudit$3(branchId, action, entityType, entityId, details) {
  try {
    const db = getDb();
    const validUserId = resolveValidUserId$3(db, null);
    const validBranchId = resolveValidBranchId$4(db, branchId);
    db.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid$6(),
      validBranchId,
      validUserId,
      action,
      entityType,
      entityId,
      JSON.stringify(details),
      (/* @__PURE__ */ new Date()).toISOString()
    );
  } catch (err) {
    console.error("[Audit Log Error]:", err);
  }
}
const orderRepository = {
  createOrder: (orderData) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const orderId = orderData.id || uuid$6();
    const orderNumber = orderData.orderNumber || `ORD-${Date.now().toString().slice(-6)}`;
    const status = orderData.status || "CONFIRMED";
    const orderType = orderData.orderType || "DINE_IN";
    const createOrderTx = db.transaction(() => {
      const branchId = resolveValidBranchId$4(db, orderData.branchId);
      const cashierId = resolveValidUserId$3(db, orderData.cashierId);
      db.prepare(`
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
        orderId,
        branchId,
        orderNumber,
        orderType,
        orderData.orderSource || "POS",
        status,
        orderData.tableId || null,
        orderData.customerId || null,
        cashierId,
        orderData.subtotalCents || 0,
        orderData.discountCents || 0,
        orderData.discountReason || null,
        orderData.taxCents || 0,
        orderData.serviceChargeCents || 0,
        orderData.deliveryChargeCents || 0,
        orderData.totalCents || 0,
        orderData.paidCents || 0,
        orderData.notes || null,
        status === "CONFIRMED" ? now : null,
        now,
        now
      );
      if (Array.isArray(orderData.items)) {
        for (const item of orderData.items) {
          const itemId = uuid$6();
          let stationId = item.kitchenStationId || null;
          if (!stationId && item.productId) {
            try {
              const prod = db.prepare("SELECT kitchen_station_id FROM products WHERE id = ?").get(item.productId);
              if (prod == null ? void 0 : prod.kitchen_station_id) stationId = prod.kitchen_station_id;
            } catch (e) {
            }
          }
          db.prepare(`
            INSERT INTO order_items (
              id, order_id, product_id, variation_id, item_name,
              quantity, unit_price_cents, discount_cents, total_cents,
              kitchen_station_id, kitchen_status, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
          `).run(
            itemId,
            orderId,
            item.productId,
            item.variationId || null,
            item.name || item.itemName || "Menu Item",
            item.quantity,
            item.unitPriceCents,
            item.discountCents || 0,
            item.totalCents,
            stationId,
            item.notes || null
          );
          if (Array.isArray(item.modifiers)) {
            for (const mod of item.modifiers) {
              db.prepare(`
                INSERT INTO order_item_modifiers (id, order_item_id, modifier_id, name, price_cents)
                VALUES (?, ?, ?, ?, ?)
              `).run(uuid$6(), itemId, mod.id || null, mod.name, mod.priceCents || 0);
            }
          }
        }
      }
      db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, NULL, ?, ?, 'Order created via POS', ?)
      `).run(uuid$6(), orderId, status, cashierId, now);
      if (orderType === "DINE_IN" && orderData.tableId && status !== "COMPLETED" && status !== "CANCELLED") {
        db.prepare("UPDATE dining_tables SET status = ?, current_order_id = ?, updated_at = ? WHERE id = ?").run("OCCUPIED", orderId, now, orderData.tableId);
      }
      db.prepare(`
        INSERT INTO sync_outbox (id, entity_type, entity_id, operation, payload_json, status, created_at)
        VALUES (?, 'ORDER', ?, 'INSERT', ?, 'PENDING', ?)
      `).run(uuid$6(), orderId, JSON.stringify({ id: orderId, orderNumber, totalCents: orderData.totalCents }), now);
      logAudit$3(orderData.branchId, "CREATE_ORDER", "ORDER", orderId, {
        orderNumber,
        orderType,
        totalCents: orderData.totalCents,
        status
      });
      const created = orderRepository.getOrderDetails(orderId);
      return {
        ...created,
        orderNumber: created.order_number,
        totalCents: created.total_cents
      };
    });
    return createOrderTx();
  },
  getOrderDetails: (orderId) => {
    const db = getDb();
    const order = db.prepare(`
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
    `).get(orderId);
    if (!order) return null;
    const items = db.prepare(`
      SELECT oi.*, p.sku as product_sku, v.name as variation_name
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      LEFT JOIN product_variations v ON oi.variation_id = v.id
      WHERE oi.order_id = ?
    `).all(orderId);
    for (const item of items) {
      item.modifiers = db.prepare(`
        SELECT id, name, price_cents
        FROM order_item_modifiers
        WHERE order_item_id = ?
      `).all(item.id);
    }
    const payments = db.prepare(`
      SELECT p.*, u.display_name as cashier_name
      FROM payments p
      LEFT JOIN users u ON p.cashier_id = u.id
      WHERE p.order_id = ?
      ORDER BY p.created_at ASC
    `).all(orderId);
    const statusHistory = db.prepare(`
      SELECT h.*, u.display_name as changed_by
      FROM order_status_history h
      LEFT JOIN users u ON h.changed_by_user_id = u.id
      WHERE h.order_id = ?
      ORDER BY h.created_at ASC
    `).all(orderId);
    const refunds = db.prepare(`
      SELECT r.*, u.display_name as cashier_name
      FROM refunds r
      LEFT JOIN users u ON r.cashier_id = u.id
      WHERE r.order_id = ?
      ORDER BY r.created_at ASC
    `).all(orderId);
    return {
      ...order,
      items,
      payments,
      refunds,
      statusHistory
    };
  },
  processPayment: ({ orderId, branchId, cashierId, payments, tenderedCents = 0, changeCents = 0 }) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const paymentTx = db.transaction(() => {
      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
      if (!order) throw new Error("Order not found.");
      if (order.status === "CANCELLED" || order.status === "REFUNDED") {
        throw new Error("Cannot process payment on a cancelled or refunded order.");
      }
      if (order.status === "COMPLETED" && (order.paid_cents || 0) >= (order.total_cents || 0)) {
        throw new Error("This sale is already fully paid. Duplicate completion was blocked.");
      }
      const validBranchId = resolveValidBranchId$4(db, branchId || order.branch_id);
      const validCashierId = resolveValidUserId$3(db, cashierId || order.cashier_id);
      let totalPaymentCents = 0;
      for (const p of payments) {
        totalPaymentCents += p.amountCents || 0;
      }
      if (totalPaymentCents <= 0) {
        throw new Error("Payment amount must be greater than zero.");
      }
      for (const p of payments) {
        db.prepare(`
          INSERT INTO payments (
            id, branch_id, order_id, cashier_id, payment_method,
            amount_cents, tendered_cents, change_cents, reference_number, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?)
        `).run(
          uuid$6(),
          validBranchId,
          orderId,
          validCashierId,
          p.paymentMethod.toUpperCase(),
          p.amountCents,
          p.paymentMethod.toUpperCase() === "CASH" ? tenderedCents : p.amountCents,
          p.paymentMethod.toUpperCase() === "CASH" ? changeCents : 0,
          p.referenceNumber || null,
          now
        );
      }
      const newPaidCents = (order.paid_cents || 0) + totalPaymentCents;
      const isFullyPaid = newPaidCents >= order.total_cents;
      const nextStatus = isFullyPaid ? "COMPLETED" : order.status;
      db.prepare(`
        UPDATE orders
        SET paid_cents = ?, status = ?, updated_at = ?
        WHERE id = ?
      `).run(newPaidCents, nextStatus, now, orderId);
      db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuid$6(),
        orderId,
        order.status,
        nextStatus,
        validCashierId,
        `Payment of $${(totalPaymentCents / 100).toFixed(2)} received (${payments.map((p) => p.paymentMethod).join(", ")})`,
        now
      );
      if (isFullyPaid && order.table_id) {
        db.prepare(`
          UPDATE dining_tables
          SET status = 'AVAILABLE', current_order_id = NULL, updated_at = ?
          WHERE id = ?
        `).run(now, order.table_id);
      }
      if (isFullyPaid) {
        try {
          inventoryRepository.deductRecipeStockForOrder(orderId);
        } catch (e) {
          console.warn("Recipe inventory auto-deduction failed:", e);
        }
        if (order.customer_id && order.loyalty_awarded !== 1) {
          const points = Math.max(0, Math.floor((order.total_cents || 0) / 100));
          if (points > 0) {
            customerRepository.adjustLoyaltyPoints({
              customerId: order.customer_id,
              branchId: validBranchId,
              orderId,
              pointsChanged: points,
              transactionType: "EARN",
              notes: `Loyalty earned for ${order.order_number}`
            });
            db.prepare("UPDATE orders SET loyalty_awarded = 1, updated_at = ? WHERE id = ?").run(now, orderId);
          }
        }
      }
      logAudit$3(branchId || order.branch_id, "PROCESS_PAYMENT", "ORDER", orderId, {
        orderNumber: order.order_number,
        totalPaymentCents,
        newPaidCents,
        isFullyPaid
      });
      enqueueOutbox("ORDER", orderId, isFullyPaid ? "SALE_COMPLETED" : "PAYMENT_RECORDED", {
        orderNumber: order.order_number,
        totalPaymentCents,
        isFullyPaid
      });
      return orderRepository.getOrderDetails(orderId);
    });
    return paymentTx();
  },
  holdOrder: (orderData) => {
    return orderRepository.createOrder({
      ...orderData,
      status: "DRAFT"
    });
  },
  getHeldOrders: (branchId) => {
    const db = getDb();
    return db.prepare(`
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
    `).all(branchId);
  },
  cancelOrder: (orderId, reason, cancelledByUserId = null) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const cancelTx = db.transaction(() => {
      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
      if (!order) throw new Error("Order not found.");
      if (order.status === "CANCELLED") throw new Error("Order is already cancelled.");
      if (!reason || reason.trim() === "") throw new Error("Cancellation reason is required.");
      db.prepare(`
        UPDATE orders
        SET status = 'CANCELLED', notes = COALESCE(notes || '
[Cancelled: ' || ? || ']', '[Cancelled: ' || ? || ']'), updated_at = ?
        WHERE id = ?
      `).run(reason.trim(), reason.trim(), now, orderId);
      const validCancelledBy = resolveValidUserId$3(db, cancelledByUserId);
      db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, ?, 'CANCELLED', ?, ?, ?)
      `).run(uuid$6(), orderId, order.status, validCancelledBy, `Cancelled: ${reason.trim()}`, now);
      if (order.table_id) {
        db.prepare("UPDATE dining_tables SET status = 'AVAILABLE', current_order_id = NULL, updated_at = ? WHERE id = ?").run(now, order.table_id);
      }
      if (order.stock_posted === 1) {
        inventoryRepository.reverseRecipeStockForOrder(orderId, `Void restock: ${reason.trim()}`);
      }
      logAudit$3(order.branch_id, "CANCEL_ORDER", "ORDER", orderId, {
        orderNumber: order.order_number,
        reason: reason.trim()
      });
      enqueueOutbox("ORDER", orderId, "CANCELLED", { reason: reason.trim() });
      return true;
    });
    return cancelTx();
  },
  getOrders: ({ branchId, status = null, orderType = null, search = "", limit = 50, offset = 0 } = {}) => {
    const db = getDb();
    let sql = `
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
    const params = [branchId];
    if (status && status !== "ALL") {
      sql += " AND o.status = ?";
      params.push(status);
    }
    if (orderType && orderType !== "ALL") {
      sql += " AND o.order_type = ?";
      params.push(orderType);
    }
    if (search && search.trim() !== "") {
      sql += " AND (o.order_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR t.table_number LIKE ?)";
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }
    sql += " ORDER BY o.created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);
    return db.prepare(sql).all(...params);
  },
  getRecentOrders: (branchId, limit = 20) => {
    return orderRepository.getOrders({ branchId, limit });
  },
  refundOrder: ({ orderId, amountCents, reason, restock = true, cashierId = null }) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const refundTx = db.transaction(() => {
      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
      if (!order) throw new Error("Order not found.");
      if (order.status === "CANCELLED") throw new Error("Cannot refund a cancelled order. Use a void/cancel record instead.");
      if (!reason || !String(reason).trim()) throw new Error("Refund reason is required.");
      const amount = Math.round(Number(amountCents) || 0);
      if (amount <= 0) throw new Error("Refund amount must be greater than zero.");
      const alreadyRefunded = order.refunded_cents || 0;
      const maxRefundable = Math.max(0, (order.paid_cents || 0) - alreadyRefunded);
      if (amount > maxRefundable) {
        throw new Error(`Refund exceeds remaining paid amount ($${(maxRefundable / 100).toFixed(2)}).`);
      }
      const validCashierId = resolveValidUserId$3(db, cashierId);
      const refundId = uuid$6();
      db.prepare(`
        INSERT INTO refunds (id, branch_id, order_id, payment_id, cashier_id, amount_cents, reason, restock, created_at)
        VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)
      `).run(
        refundId,
        order.branch_id,
        orderId,
        validCashierId,
        amount,
        String(reason).trim(),
        restock ? 1 : 0,
        now
      );
      const newRefunded = alreadyRefunded + amount;
      const fullyRefunded = newRefunded >= (order.paid_cents || 0);
      const nextStatus = fullyRefunded ? "REFUNDED" : order.status;
      db.prepare(`
        UPDATE orders
        SET refunded_cents = ?, status = ?, updated_at = ?
        WHERE id = ?
      `).run(newRefunded, nextStatus, now, orderId);
      db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuid$6(),
        orderId,
        order.status,
        nextStatus,
        validCashierId,
        `Refund $${(amount / 100).toFixed(2)}: ${String(reason).trim()}`,
        now
      );
      const openSession = db.prepare(`
        SELECT id FROM cash_sessions
        WHERE branch_id = ? AND status = 'OPEN'
        ORDER BY opened_at DESC LIMIT 1
      `).get(order.branch_id);
      if (openSession) {
        db.prepare(`
          UPDATE cash_sessions
          SET total_refunds_cents = COALESCE(total_refunds_cents, 0) + ?
          WHERE id = ?
        `).run(amount, openSession.id);
      }
      if (restock && fullyRefunded && order.stock_posted === 1) {
        inventoryRepository.reverseRecipeStockForOrder(orderId, `Refund restock: ${String(reason).trim()}`);
      }
      if (fullyRefunded && order.loyalty_awarded === 1 && order.customer_id) {
        const points = Math.max(0, Math.floor((order.total_cents || 0) / 100));
        if (points > 0) {
          customerRepository.adjustLoyaltyPoints({
            customerId: order.customer_id,
            branchId: order.branch_id,
            orderId,
            pointsChanged: -points,
            transactionType: "ADJUSTMENT",
            notes: `Loyalty reversal for refunded ${order.order_number}`
          });
          db.prepare("UPDATE orders SET loyalty_awarded = 0, updated_at = ? WHERE id = ?").run(now, orderId);
        }
      }
      logAudit$3(order.branch_id, "REFUND_ORDER", "ORDER", orderId, {
        orderNumber: order.order_number,
        amountCents: amount,
        restock: Boolean(restock),
        reason: String(reason).trim()
      });
      enqueueOutbox("ORDER", orderId, "REFUNDED", { amountCents: amount, fullyRefunded });
      return orderRepository.getOrderDetails(orderId);
    });
    return refundTx();
  }
};
function requireSession() {
  const session = authRepository$1.getCurrentSession();
  if (!session) {
    throw new Error("Unauthorized: Please sign in.");
  }
  return session;
}
function requirePermission(permCode) {
  var _a;
  const session = requireSession();
  if (session.roleCode === "super_admin") return session;
  if (!((_a = session.permissions) == null ? void 0 : _a.includes(permCode))) {
    throw new Error(`Unauthorized: Requires '${permCode}' permission.`);
  }
  return session;
}
function requireAnyPermission(permCodes) {
  const session = requireSession();
  if (session.roleCode === "super_admin") return session;
  const ok = permCodes.some((code) => {
    var _a;
    return (_a = session.permissions) == null ? void 0 : _a.includes(code);
  });
  if (!ok) {
    throw new Error(`Unauthorized: Requires one of: ${permCodes.join(", ")}`);
  }
  return session;
}
function getActiveBranchId(providedBranchId) {
  var _a;
  const session = authRepository$1.getCurrentSession();
  if (session && session.roleCode !== "super_admin" && session.branchId) {
    return session.branchId;
  }
  if (providedBranchId) return providedBranchId;
  if (session == null ? void 0 : session.branchId) return session.branchId;
  const db = getDb();
  return (_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id;
}
function assertSqliteBackup(filePath) {
  if (!filePath) throw new Error("Backup file path is required.");
  if (!fs.existsSync(filePath)) throw new Error(`Backup file not found at: ${filePath}`);
  const fd = fs.openSync(filePath, "r");
  try {
    const header = Buffer.alloc(16);
    fs.readSync(fd, header, 0, 16, 0);
    if (header.toString("utf8") !== "SQLite format 3\0") {
      throw new Error("The selected file is not a valid SQLite database backup.");
    }
  } finally {
    fs.closeSync(fd);
  }
}
function registerDatabaseIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.DB_STATUS, async () => {
    requireSession();
    try {
      const db = getDb();
      const versionRow = db.prepare("SELECT MAX(version) as version FROM schema_migrations").get();
      const tablesCount = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count;
      const fk = db.prepare("PRAGMA foreign_keys").get();
      const journal = db.prepare("PRAGMA journal_mode").get();
      const integrity = db.prepare("PRAGMA integrity_check").get();
      const branch = db.prepare("SELECT id, name, code, currency_symbol FROM branches LIMIT 1").get();
      const productCount = db.prepare("SELECT count(*) as count FROM products WHERE is_active = 1").get().count;
      const tableCount = db.prepare("SELECT count(*) as count FROM dining_tables WHERE is_active = 1").get().count;
      const orderCount = db.prepare("SELECT count(*) as count FROM orders").get().count;
      return {
        initialized: true,
        driver: "better-sqlite3",
        schemaVersion: (versionRow == null ? void 0 : versionRow.version) || 1,
        tablesCount,
        databasePath: resolveDatabasePath(),
        dbPath: resolveDatabasePath(),
        foreignKeys: fk.foreign_keys === 1,
        journalMode: journal.journal_mode,
        integrity: integrity.integrity_check,
        branch,
        stats: {
          products: productCount,
          tables: tableCount,
          orders: orderCount
        }
      };
    } catch (err) {
      console.error("[IPC db:status] Error:", err);
      return {
        initialized: false,
        error: err.message
      };
    }
  });
  ipcMain.handle("db:get-settings", async () => {
    requireSession();
    return settingsRepository.getAll();
  });
  ipcMain.handle("db:get-categories", async (_event, branchId) => {
    requireSession();
    return productRepository.getCategories(getActiveBranchId(branchId));
  });
  ipcMain.handle("db:get-products", async (_event, { branchId, categoryId, searchQuery } = {}) => {
    requireSession();
    return productRepository.getProducts(getActiveBranchId(branchId), categoryId, searchQuery);
  });
  ipcMain.handle("db:get-tables", async (_event, branchId) => {
    requireSession();
    return tableRepository.getFloorsWithTables(getActiveBranchId(branchId));
  });
  ipcMain.handle("db:create-order", async (_event, orderData) => {
    requirePermission("pos:create_order");
    return orderRepository.createOrder({
      ...orderData,
      branchId: getActiveBranchId(orderData.branchId)
    });
  });
  ipcMain.handle("db:get-recent-orders", async (_event, { branchId, limit } = {}) => {
    requireSession();
    return orderRepository.getRecentOrders(getActiveBranchId(branchId), limit || 20);
  });
  ipcMain.handle(IPC_CHANNELS.DB_BACKUP, async (_event, destinationPath) => {
    requirePermission("settings:manage");
    return backupDatabase(destinationPath);
  });
  ipcMain.handle("db:choose-backup-file", async () => {
    var _a;
    requirePermission("settings:manage");
    const result = await dialog.showOpenDialog({
      title: "Select SQLite Backup",
      properties: ["openFile"],
      filters: [{ name: "SQLite Database", extensions: ["sqlite", "db", "sqlite3"] }]
    });
    if (result.canceled || !((_a = result.filePaths) == null ? void 0 : _a[0])) return null;
    return result.filePaths[0];
  });
  ipcMain.handle(IPC_CHANNELS.DB_RESTORE, async (_event, backupFilePath) => {
    requirePermission("settings:manage");
    assertSqliteBackup(backupFilePath);
    return restoreDatabase(backupFilePath);
  });
}
function getDateRangeBounds(rangeType) {
  const now = /* @__PURE__ */ new Date();
  let start = /* @__PURE__ */ new Date();
  if (rangeType === "yesterday") {
    start.setDate(now.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  } else if (rangeType === "this_week") {
    start.setDate(now.getDate() - 7);
    start.setHours(0, 0, 0, 0);
  } else if (rangeType === "this_month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setHours(0, 0, 0, 0);
  }
  return { startIso: start.toISOString(), endIso: now.toISOString() };
}
const dashboardRepository = {
  getMetrics: (branchId, rangeType = "today") => {
    const db = getDb();
    const { startIso, endIso } = getDateRangeBounds(rangeType);
    const salesRow = db.prepare(`
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
    `).get(branchId, startIso, endIso);
    const totalOrders = salesRow.total_orders || 0;
    const grossSalesCents = salesRow.gross_sales_cents || 0;
    const avgOrderCents = totalOrders > 0 ? Math.round(grossSalesCents / totalOrders) : 0;
    const typeRows = db.prepare(`
      SELECT order_type, COUNT(id) as count, COALESCE(SUM(total_cents), 0) as total_cents
      FROM orders
      WHERE branch_id = ?
        AND created_at >= ? AND created_at <= ?
        AND status NOT IN ('CANCELLED')
      GROUP BY order_type
    `).all(branchId, startIso, endIso);
    const ordersByType = {
      DINE_IN: { count: 0, totalCents: 0 },
      TAKEAWAY: { count: 0, totalCents: 0 },
      DELIVERY: { count: 0, totalCents: 0 }
    };
    for (const r of typeRows) {
      if (ordersByType[r.order_type]) {
        ordersByType[r.order_type] = { count: r.count, totalCents: r.total_cents };
      }
    }
    const statusRows = db.prepare(`
      SELECT status, COUNT(id) as count
      FROM orders
      WHERE branch_id = ?
        AND created_at >= ? AND created_at <= ?
      GROUP BY status
    `).all(branchId, startIso, endIso);
    const statusCounts = {};
    for (const r of statusRows) {
      statusCounts[r.status] = r.count;
    }
    const paymentRows = db.prepare(`
      SELECT payment_method, COALESCE(SUM(amount_cents), 0) as total_cents, COUNT(id) as count
      FROM payments
      WHERE branch_id = ?
        AND created_at >= ? AND created_at <= ?
        AND status = 'COMPLETED'
      GROUP BY payment_method
    `).all(branchId, startIso, endIso);
    const paymentsByMethod = {};
    for (const p of paymentRows) {
      paymentsByMethod[p.payment_method] = { totalCents: p.total_cents, count: p.count };
    }
    const topProducts = db.prepare(`
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
    `).all(branchId, startIso, endIso);
    const lowStockItems = db.prepare(`
      SELECT i.id, i.name, i.sku, i.current_stock, i.minimum_level, u.abbreviation as unit
      FROM inventory_items i
      JOIN inventory_units u ON i.unit_id = u.id
      WHERE i.branch_id = ?
        AND i.is_active = 1
        AND i.current_stock <= i.minimum_level
      ORDER BY i.current_stock ASC
      LIMIT 6
    `).all(branchId);
    const expenseRow = db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) as total_cents
      FROM expenses
      WHERE branch_id = ?
        AND expense_date >= ? AND expense_date <= ?
    `).get(branchId, startIso.slice(0, 10), endIso.slice(0, 10));
    const totalExpenseCents = (expenseRow == null ? void 0 : expenseRow.total_cents) || 0;
    const activeCashSession = db.prepare(`
      SELECT id, user_id, opening_balance_cents, opened_at, status
      FROM cash_sessions
      WHERE branch_id = ? AND status = 'OPEN'
      ORDER BY opened_at DESC
      LIMIT 1
    `).get(branchId);
    return {
      rangeType,
      bounds: { start: startIso, end: endIso },
      sales: {
        grossSalesCents,
        discountCents: salesRow.total_discounts_cents || 0,
        taxCents: salesRow.total_tax_cents || 0,
        netSalesCents: grossSalesCents - (salesRow.total_discounts_cents || 0),
        totalOrders,
        avgOrderCents
      },
      ordersByType,
      statusCounts,
      paymentsByMethod,
      topProducts,
      lowStockItems,
      expenses: {
        totalExpenseCents
      },
      cashSession: activeCashSession || null
    };
  }
};
function registerAuthAndDashboardHandlers() {
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (_event, credentials) => {
    try {
      if (credentials.pin) {
        return authRepository$1.loginWithPin(credentials.pin, credentials.userId, credentials.username);
      } else if (credentials.username && credentials.password) {
        return authRepository$1.loginWithPassword(credentials.username, credentials.password);
      } else {
        throw new Error("Must provide PIN or username and password.");
      }
    } catch (err) {
      console.error("[IPC auth:login] Error:", err.message);
      throw err;
    }
  });
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, async () => {
    return authRepository$1.logout();
  });
  ipcMain.handle(IPC_CHANNELS.AUTH_CURRENT_USER, async () => {
    return authRepository$1.getCurrentSession();
  });
  ipcMain.handle("auth:get-login-users", async () => {
    return authRepository$1.getLoginUsers();
  });
  ipcMain.handle("auth:needs-setup", async () => {
    return authRepository$1.needsSetup();
  });
  ipcMain.handle("auth:complete-setup", async (_event, payload) => {
    return authRepository$1.completeInitialSetup(payload || {});
  });
  ipcMain.handle("dashboard:get-metrics", async (_event, { branchId, rangeType } = {}) => {
    var _a;
    try {
      const session = authRepository$1.getCurrentSession();
      if (!session) throw new Error("Unauthorized: Please sign in.");
      if (session.roleCode !== "super_admin" && !((_a = session.permissions) == null ? void 0 : _a.includes("dashboard:view"))) {
        throw new Error("Unauthorized: Requires 'dashboard:view' permission.");
      }
      const activeBranchId = session.roleCode === "super_admin" ? branchId || session.branchId : session.branchId;
      return dashboardRepository.getMetrics(activeBranchId, rangeType || "today");
    } catch (err) {
      console.error("[IPC dashboard:get-metrics] Error:", err.message);
      throw err;
    }
  });
}
function assertPermission$3(permCode) {
  return requirePermission(permCode);
}
function registerProductIpcHandlers() {
  ipcMain.handle("product:get-categories", async (_event, branchId) => {
    requireSession();
    return productRepository.getCategories(getActiveBranchId(branchId));
  });
  ipcMain.handle("product:create-category", async (_event, data) => {
    assertPermission$3("menu:manage");
    return productRepository.createCategory({
      ...data,
      branchId: getActiveBranchId(data.branchId)
    });
  });
  ipcMain.handle("product:update-category", async (_event, { id, ...data }) => {
    assertPermission$3("menu:manage");
    return productRepository.updateCategory(id, data);
  });
  ipcMain.handle("product:delete-category", async (_event, id) => {
    assertPermission$3("menu:manage");
    return productRepository.deleteCategory(id);
  });
  ipcMain.handle("product:get-products", async (_event, { branchId, categoryId, searchQuery, includeInactive } = {}) => {
    requireSession();
    return productRepository.getProducts(getActiveBranchId(branchId), categoryId, searchQuery, includeInactive);
  });
  ipcMain.handle("product:get-product-details", async (_event, productId) => {
    return productRepository.getProductDetails(productId);
  });
  ipcMain.handle("product:create-product", async (_event, productData) => {
    assertPermission$3("menu:manage");
    return productRepository.createProduct({
      ...productData,
      branchId: getActiveBranchId(productData.branchId)
    });
  });
  ipcMain.handle("product:update-product", async (_event, { id, ...productData }) => {
    assertPermission$3("menu:manage");
    return productRepository.updateProduct(id, {
      ...productData,
      branchId: getActiveBranchId(productData.branchId)
    });
  });
  ipcMain.handle("product:toggle-availability", async (_event, { id, isAvailable }) => {
    assertPermission$3("menu:manage");
    return productRepository.toggleProductAvailability(id, isAvailable);
  });
  ipcMain.handle("product:archive-product", async (_event, id) => {
    assertPermission$3("menu:manage");
    return productRepository.archiveProduct(id);
  });
  ipcMain.handle("product:get-combos", async (_event, branchId) => {
    return productRepository.getCombos(getActiveBranchId(branchId));
  });
  ipcMain.handle("product:create-combo", async (_event, comboData) => {
    assertPermission$3("menu:manage");
    return productRepository.createCombo({
      ...comboData,
      branchId: getActiveBranchId(comboData.branchId)
    });
  });
  ipcMain.handle("product:update-combo", async (_event, { id, ...comboData }) => {
    assertPermission$3("menu:manage");
    return productRepository.updateCombo(id, comboData);
  });
  ipcMain.handle("product:toggle-combo-availability", async (_event, { id, isAvailable }) => {
    assertPermission$3("menu:manage");
    return productRepository.toggleComboAvailability(id, isAvailable);
  });
  ipcMain.handle("product:archive-combo", async (_event, id) => {
    assertPermission$3("menu:manage");
    return productRepository.archiveCombo(id);
  });
}
function broadcast(channel, payload) {
  for (const win2 of BrowserWindow.getAllWindows()) {
    if (!win2.isDestroyed()) {
      win2.webContents.send(channel, payload);
    }
  }
}
function registerPosIpcHandlers() {
  ipcMain.handle("pos:create-order", async (_event, orderData) => {
    requirePermission("pos:create_order");
    const branchId = getActiveBranchId(orderData.branchId);
    const session = requireSession();
    const order = orderRepository.createOrder({
      ...orderData,
      branchId,
      cashierId: orderData.cashierId || session.id
    });
    if ((order == null ? void 0 : order.status) && order.status !== "DRAFT") {
      broadcast("kitchen:new-order", { orderId: order.id, orderNumber: order.orderNumber || order.order_number });
    }
    return order;
  });
  ipcMain.handle("pos:get-order", async (_event, orderId) => {
    requireSession();
    return orderRepository.getOrderDetails(orderId);
  });
  ipcMain.handle("pos:process-payment", async (_event, paymentData) => {
    requirePermission("pos:create_order");
    const branchId = getActiveBranchId(paymentData.branchId);
    const session = requireSession();
    const result = orderRepository.processPayment({
      ...paymentData,
      branchId,
      cashierId: paymentData.cashierId || session.id
    });
    broadcast("pos:status-change", { orderId: paymentData.orderId, status: result == null ? void 0 : result.status });
    return result;
  });
  ipcMain.handle("pos:hold-order", async (_event, orderData) => {
    requirePermission("pos:create_order");
    const branchId = getActiveBranchId(orderData.branchId);
    const session = requireSession();
    return orderRepository.holdOrder({
      ...orderData,
      branchId,
      cashierId: orderData.cashierId || session.id
    });
  });
  ipcMain.handle("pos:get-held-orders", async (_event, branchId) => {
    requireSession();
    return orderRepository.getHeldOrders(getActiveBranchId(branchId));
  });
  ipcMain.handle("pos:cancel-order", async (_event, { orderId, reason }) => {
    requirePermission("pos:create_order");
    const session = requireSession();
    const result = orderRepository.cancelOrder(orderId, reason, session.id);
    broadcast("kitchen:order-update", { orderId, status: "CANCELLED" });
    return result;
  });
  ipcMain.handle("pos:refund-order", async (_event, data) => {
    requirePermission("pos:process_refund");
    const session = requireSession();
    const result = orderRepository.refundOrder({
      ...data,
      cashierId: session.id
    });
    broadcast("pos:status-change", { orderId: data.orderId, status: result == null ? void 0 : result.status });
    return result;
  });
  ipcMain.handle("pos:get-orders", async (_event, params = {}) => {
    requireSession();
    return orderRepository.getOrders({
      ...params,
      branchId: getActiveBranchId(params.branchId)
    });
  });
}
function assertPermission$2(permCode) {
  return requirePermission(permCode);
}
function registerTableIpcHandlers() {
  ipcMain.handle("table:get-floors-tables", async (_event, branchId) => {
    requireSession();
    return tableRepository.getFloorsWithTables(getActiveBranchId(branchId));
  });
  ipcMain.handle("table:update-status", async (_event, { tableId, status, currentOrderId }) => {
    assertPermission$2("pos:create_order");
    return tableRepository.updateTableStatus(tableId, status, currentOrderId);
  });
  ipcMain.handle("table:transfer-table", async (_event, transferData) => {
    assertPermission$2("pos:create_order");
    return tableRepository.transferTable(transferData);
  });
  ipcMain.handle("table:create-floor", async (_event, floorData) => {
    assertPermission$2("settings:manage");
    const branchId = getActiveBranchId(floorData.branchId);
    return tableRepository.createFloor({ ...floorData, branchId });
  });
  ipcMain.handle("table:update-floor", async (_event, { id, ...floorData }) => {
    assertPermission$2("settings:manage");
    return tableRepository.updateFloor(id, floorData);
  });
  ipcMain.handle("table:create-table", async (_event, tableData) => {
    assertPermission$2("settings:manage");
    const branchId = getActiveBranchId(tableData.branchId);
    return tableRepository.createTable({ ...tableData, branchId });
  });
  ipcMain.handle("table:update-table", async (_event, { id, ...tableData }) => {
    assertPermission$2("settings:manage");
    return tableRepository.updateTable(id, tableData);
  });
  ipcMain.handle("table:archive-table", async (_event, id) => {
    assertPermission$2("settings:manage");
    return tableRepository.archiveTable(id);
  });
  ipcMain.handle("table:merge-tables", async (_event, data) => {
    requirePermission("pos:create_order");
    return tableRepository.mergeTables(data);
  });
}
function uuid$5() {
  return crypto.randomUUID();
}
function resolveValidBranchId$3(db, branchId) {
  if (branchId) {
    const b = db.prepare("SELECT id FROM branches WHERE id = ?").get(branchId);
    if (b) return b.id;
  }
  const session = authRepository$1.getCurrentSession();
  if (session == null ? void 0 : session.branchId) {
    const b = db.prepare("SELECT id FROM branches WHERE id = ?").get(session.branchId);
    if (b) return b.id;
  }
  const fallback = db.prepare("SELECT id FROM branches LIMIT 1").get();
  return (fallback == null ? void 0 : fallback.id) || null;
}
function resolveValidUserId$2(db, userId) {
  const session = authRepository$1.getCurrentSession();
  if (session == null ? void 0 : session.id) {
    const u = db.prepare("SELECT id FROM users WHERE id = ?").get(session.id);
    if (u) return u.id;
  }
  const fallback = db.prepare("SELECT id FROM users WHERE is_active = 1 LIMIT 1").get();
  return (fallback == null ? void 0 : fallback.id) || null;
}
function logAudit$2(branchId, action, entityType, entityId, details) {
  try {
    const db = getDb();
    const validUserId = resolveValidUserId$2(db, null);
    const validBranchId = resolveValidBranchId$3(db, branchId);
    db.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid$5(),
      validBranchId,
      validUserId,
      action,
      entityType,
      entityId,
      JSON.stringify(details),
      (/* @__PURE__ */ new Date()).toISOString()
    );
  } catch (err) {
    console.error("[Reservation Audit Log Error]:", err);
  }
}
const reservationRepository = {
  /**
   * Get list of reservations
   */
  getReservations: ({ branchId, date = null, status = null, search = "" } = {}) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId$3(db, branchId);
    let sql = `
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
    const params = [validBranchId];
    if (date) {
      sql += " AND (r.reservation_date = ? OR r.reservation_time LIKE ?)";
      params.push(date, `${date}%`);
    }
    if (status && status !== "ALL") {
      sql += " AND r.status = ?";
      params.push(status);
    }
    if (search && search.trim() !== "") {
      sql += " AND (r.customer_name LIKE ? OR r.customer_phone LIKE ? OR t.table_number LIKE ?)";
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }
    sql += " ORDER BY r.reservation_date ASC, r.reservation_time ASC";
    return db.prepare(sql).all(...params);
  },
  /**
   * Get single reservation by ID
   */
  getReservationById: (id) => {
    const db = getDb();
    return db.prepare(`
      SELECT r.*,
             t.table_number, t.capacity as table_capacity,
             f.name as floor_name,
             c.tag as customer_tag, c.email as customer_email
      FROM reservations r
      LEFT JOIN dining_tables t ON r.table_id = t.id
      LEFT JOIN floors f ON t.floor_id = f.id
      LEFT JOIN customers c ON r.customer_id = c.id
      WHERE r.id = ?
    `).get(id);
  },
  /**
   * Create new reservation with double-booking prevention
   */
  createReservation: (data) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId$3(db, data.branchId);
    const reservationId = uuid$5();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const createTx = db.transaction(() => {
      const resDate = data.reservationDate || data.reservationTime.slice(0, 10);
      const resTime = data.reservationTime;
      const durationMins = data.durationMinutes || 90;
      if (data.tableId) {
        const existingBookings = db.prepare(`
          SELECT id, customer_name, reservation_time, duration_minutes
          FROM reservations
          WHERE table_id = ? AND (reservation_date = ? OR reservation_time LIKE ?)
            AND status IN ('CONFIRMED', 'PENDING', 'SEATED')
        `).all(data.tableId, resDate, `${resDate}%`);
        for (const b of existingBookings) {
          const existingStart = new Date(b.reservation_time).getTime();
          const newStart = new Date(resTime).getTime();
          if (!isNaN(existingStart) && !isNaN(newStart)) {
            const existingEnd = existingStart + (b.duration_minutes || 90) * 60 * 1e3;
            const newEnd = newStart + durationMins * 60 * 1e3;
            if (newStart < existingEnd && newEnd > existingStart) {
              const table = db.prepare("SELECT table_number FROM dining_tables WHERE id = ?").get(data.tableId);
              throw new Error(
                `Table ${(table == null ? void 0 : table.table_number) || ""} is already booked by "${b.customer_name}" during this time window.`
              );
            }
          }
        }
      }
      let linkedCustomerId = data.customerId || null;
      if (!linkedCustomerId && data.customerPhone) {
        const cust = db.prepare("SELECT id FROM customers WHERE phone = ?").get(data.customerPhone.trim());
        if (cust) linkedCustomerId = cust.id;
      }
      const initialStatus = data.status || "CONFIRMED";
      db.prepare(`
        INSERT INTO reservations (
          id, branch_id, customer_id, table_id, customer_name, customer_phone,
          party_size, reservation_date, reservation_time, duration_minutes,
          status, deposit_cents, deposit_payment_method, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reservationId,
        validBranchId,
        linkedCustomerId,
        data.tableId || null,
        data.customerName.trim(),
        data.customerPhone.trim(),
        parseInt(data.partySize, 10) || 2,
        resDate,
        resTime,
        durationMins,
        initialStatus,
        Math.max(0, parseInt(data.depositCents, 10) || 0),
        data.depositPaymentMethod || null,
        data.notes || null,
        now,
        now
      );
      const today = now.slice(0, 10);
      if (resDate === today && data.tableId && initialStatus === "CONFIRMED") {
        db.prepare("UPDATE dining_tables SET status = 'RESERVED', updated_at = ? WHERE id = ? AND status = 'AVAILABLE'").run(now, data.tableId);
      }
      logAudit$2(validBranchId, "CREATE_RESERVATION", "RESERVATION", reservationId, {
        customerName: data.customerName,
        partySize: data.partySize,
        reservationDate: resDate,
        tableId: data.tableId
      });
      return reservationRepository.getReservationById(reservationId);
    });
    return createTx();
  },
  /**
   * Update reservation status (Seated, Cancelled, Completed, No-Show)
   */
  updateReservationStatus: (id, status) => {
    const db = getDb();
    const res = db.prepare("SELECT * FROM reservations WHERE id = ?").get(id);
    if (!res) throw new Error("Reservation not found.");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const normalizedStatus = status.toUpperCase();
    const updateTx = db.transaction(() => {
      db.prepare("UPDATE reservations SET status = ?, updated_at = ? WHERE id = ?").run(normalizedStatus, now, id);
      if (res.table_id) {
        if (normalizedStatus === "SEATED") {
          db.prepare("UPDATE dining_tables SET status = 'OCCUPIED', updated_at = ? WHERE id = ?").run(now, res.table_id);
        } else if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(normalizedStatus)) {
          db.prepare(`
            UPDATE dining_tables
            SET status = 'AVAILABLE', updated_at = ?
            WHERE id = ? AND status = 'RESERVED'
          `).run(now, res.table_id);
        }
      }
      logAudit$2(res.branch_id, `RESERVATION_${normalizedStatus}`, "RESERVATION", id, {
        previousStatus: res.status,
        newStatus: normalizedStatus
      });
      return reservationRepository.getReservationById(id);
    });
    return updateTx();
  },
  /**
   * Check Table Availability for a given date, time and party size
   */
  checkAvailability: ({ branchId, date, time, partySize, durationMinutes = 90 }) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId$3(db, branchId);
    const requiredCap = parseInt(partySize, 10) || 1;
    const targetStart = (/* @__PURE__ */ new Date(`${date}T${time}`)).getTime();
    const targetEnd = targetStart + durationMinutes * 60 * 1e3;
    const eligibleTables = db.prepare(`
      SELECT t.*, f.name as floor_name
      FROM dining_tables t
      JOIN floors f ON t.floor_id = f.id
      WHERE t.branch_id = ? AND t.is_active = 1 AND t.capacity >= ?
      ORDER BY t.capacity ASC, t.table_number ASC
    `).all(validBranchId, requiredCap);
    const dayBookings = db.prepare(`
      SELECT table_id, reservation_time, duration_minutes
      FROM reservations
      WHERE branch_id = ? AND (reservation_date = ? OR reservation_time LIKE ?)
        AND status IN ('CONFIRMED', 'PENDING', 'SEATED') AND table_id IS NOT NULL
    `).all(validBranchId, date, `${date}%`);
    const bookedTableIds = /* @__PURE__ */ new Set();
    for (const b of dayBookings) {
      const bStart = new Date(b.reservation_time).getTime();
      if (!isNaN(bStart) && !isNaN(targetStart)) {
        const bEnd = bStart + (b.duration_minutes || 90) * 60 * 1e3;
        if (targetStart < bEnd && targetEnd > bStart) {
          bookedTableIds.add(b.table_id);
        }
      }
    }
    return eligibleTables.map((t) => ({
      ...t,
      isAvailable: !bookedTableIds.has(t.id)
    }));
  }
};
function uuid$4() {
  return crypto.randomUUID();
}
function resolveValidBranchId$2(db, branchId) {
  if (branchId) {
    const b = db.prepare("SELECT id FROM branches WHERE id = ?").get(branchId);
    if (b) return b.id;
  }
  const session = authRepository$1.getCurrentSession();
  if (session == null ? void 0 : session.branchId) {
    const b = db.prepare("SELECT id FROM branches WHERE id = ?").get(session.branchId);
    if (b) return b.id;
  }
  const fallback = db.prepare("SELECT id FROM branches LIMIT 1").get();
  return (fallback == null ? void 0 : fallback.id) || null;
}
const couponRepository = {
  getCoupons: (branchId) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId$2(db, branchId);
    return db.prepare(`
      SELECT * FROM coupons
      WHERE branch_id = ? OR branch_id IS NULL
      ORDER BY is_active DESC, created_at DESC
    `).all(validBranchId);
  },
  createCoupon: (data) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId$2(db, data.branchId);
    const id = uuid$4();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const cleanCode = data.code.trim().toUpperCase();
    const existing = db.prepare("SELECT id FROM coupons WHERE code = ?").get(cleanCode);
    if (existing) throw new Error(`Coupon code "${cleanCode}" already exists.`);
    db.prepare(`
      INSERT INTO coupons (
        id, branch_id, code, title, discount_type, discount_value,
        min_order_cents, max_discount_cents, start_date, end_date,
        usage_limit, times_used, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(
      id,
      validBranchId,
      cleanCode,
      data.title.trim(),
      data.discountType || "PERCENTAGE",
      parseInt(data.discountValue, 10) || 10,
      Math.max(0, parseInt(data.minOrderCents, 10) || 0),
      data.maxDiscountCents ? parseInt(data.maxDiscountCents, 10) : null,
      data.startDate || null,
      data.endDate || null,
      parseInt(data.usageLimit, 10) || 0,
      data.isActive !== false ? 1 : 0,
      now,
      now
    );
    return db.prepare("SELECT * FROM coupons WHERE id = ?").get(id);
  },
  updateCoupon: (id, data) => {
    const db = getDb();
    const existing = db.prepare("SELECT * FROM coupons WHERE id = ?").get(id);
    if (!existing) throw new Error("Coupon not found.");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(`
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
      data.title !== void 0 ? data.title.trim() : existing.title,
      data.discountType !== void 0 ? data.discountType : existing.discount_type,
      data.discountValue !== void 0 ? parseInt(data.discountValue, 10) : existing.discount_value,
      data.minOrderCents !== void 0 ? parseInt(data.minOrderCents, 10) : existing.min_order_cents,
      data.maxDiscountCents !== void 0 ? data.maxDiscountCents ? parseInt(data.maxDiscountCents, 10) : null : existing.max_discount_cents,
      data.startDate !== void 0 ? data.startDate : existing.start_date,
      data.endDate !== void 0 ? data.endDate : existing.end_date,
      data.usageLimit !== void 0 ? parseInt(data.usageLimit, 10) : existing.usage_limit,
      data.isActive !== void 0 ? data.isActive ? 1 : 0 : existing.is_active,
      now,
      id
    );
    return db.prepare("SELECT * FROM coupons WHERE id = ?").get(id);
  },
  /**
   * Validate coupon and calculate discount amount
   */
  validateCoupon: ({ branchId, code, orderTotalCents = 0 }) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId$2(db, branchId);
    const cleanCode = (code || "").trim().toUpperCase();
    const coupon = db.prepare(`
      SELECT * FROM coupons
      WHERE code = ? AND (branch_id = ? OR branch_id IS NULL)
    `).get(cleanCode, validBranchId);
    if (!coupon) {
      throw new Error(`Invalid promo code "${cleanCode}".`);
    }
    if (!coupon.is_active) {
      throw new Error(`Promo code "${cleanCode}" is no longer active.`);
    }
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    if (coupon.start_date && today < coupon.start_date) {
      throw new Error(`Promo code "${cleanCode}" is not active yet (starts ${coupon.start_date}).`);
    }
    if (coupon.end_date && today > coupon.end_date) {
      throw new Error(`Promo code "${cleanCode}" has expired (ended ${coupon.end_date}).`);
    }
    if (coupon.usage_limit > 0 && coupon.times_used >= coupon.usage_limit) {
      throw new Error(`Promo code "${cleanCode}" has reached its maximum usage limit.`);
    }
    if (orderTotalCents < coupon.min_order_cents) {
      const minDollars = (coupon.min_order_cents / 100).toFixed(2);
      throw new Error(`Coupon "${cleanCode}" requires a minimum spend of $${minDollars}.`);
    }
    let discountCents = 0;
    if (coupon.discount_type === "PERCENTAGE") {
      discountCents = Math.round(orderTotalCents * coupon.discount_value / 100);
      if (coupon.max_discount_cents && discountCents > coupon.max_discount_cents) {
        discountCents = coupon.max_discount_cents;
      }
    } else {
      discountCents = Math.min(orderTotalCents, coupon.discount_value);
    }
    return {
      valid: true,
      code: coupon.code,
      title: coupon.title,
      discountType: coupon.discount_type,
      discountCents,
      coupon
    };
  }
};
function registerCustomerIpcHandlers() {
  ipcMain.handle("customer:get-customers", async (_event, params = {}) => {
    requireSession();
    return customerRepository.getCustomers(
      getActiveBranchId(params.branchId),
      params.searchQuery,
      params.limit,
      params.tag
    );
  });
  ipcMain.handle("customer:get-details", async (_event, id) => {
    return customerRepository.getCustomerById(id);
  });
  ipcMain.handle("customer:create", async (_event, customerData) => {
    requireSession();
    const branchId = getActiveBranchId(customerData.branchId);
    return customerRepository.createCustomer({
      ...customerData,
      branchId
    });
  });
  ipcMain.handle("customer:update", async (_event, { id, data }) => {
    return customerRepository.updateCustomer(id, data || {});
  });
  ipcMain.handle("customer:adjust-loyalty", async (_event, data) => {
    requirePermission("pos:process_refund");
    const branchId = getActiveBranchId(data.branchId);
    return customerRepository.adjustLoyaltyPoints({ ...data, branchId });
  });
  ipcMain.handle("customer:get-summary", async (_event, branchId) => {
    return customerRepository.getCrmSummary(getActiveBranchId(branchId));
  });
  ipcMain.handle("reservation:get-reservations", async (_event, params = {}) => {
    const branchId = getActiveBranchId(params.branchId);
    return reservationRepository.getReservations({ ...params, branchId });
  });
  ipcMain.handle("reservation:create", async (_event, data) => {
    requireAnyPermission(["reservations:manage", "pos:create_order"]);
    const branchId = getActiveBranchId(data.branchId);
    return reservationRepository.createReservation({ ...data, branchId });
  });
  ipcMain.handle("reservation:update-status", async (_event, { id, status }) => {
    return reservationRepository.updateReservationStatus(id, status);
  });
  ipcMain.handle("reservation:check-availability", async (_event, params = {}) => {
    const branchId = getActiveBranchId(params.branchId);
    return reservationRepository.checkAvailability({ ...params, branchId });
  });
  ipcMain.handle("coupon:get-coupons", async (_event, branchId) => {
    return couponRepository.getCoupons(getActiveBranchId(branchId));
  });
  ipcMain.handle("coupon:create", async (_event, data) => {
    const branchId = getActiveBranchId(data.branchId);
    return couponRepository.createCoupon({ ...data, branchId });
  });
  ipcMain.handle("coupon:update", async (_event, { id, data }) => {
    return couponRepository.updateCoupon(id, data);
  });
  ipcMain.handle("coupon:validate", async (_event, data) => {
    const branchId = getActiveBranchId(data.branchId);
    return couponRepository.validateCoupon({ ...data, branchId });
  });
}
function uuid$3() {
  return crypto.randomUUID();
}
const kitchenRepository = {
  /**
   * Retrieve active kitchen stations for a branch
   */
  getStations: (branchId) => {
    var _a;
    const db = getDb();
    const targetBranchId = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    return db.prepare(`
      SELECT * FROM kitchen_stations
      WHERE branch_id = ? AND is_active = 1
      ORDER BY display_order ASC, name ASC
    `).all(targetBranchId);
  },
  /**
   * Create a new kitchen station
   */
  createStation: (stationData) => {
    var _a;
    const db = getDb();
    const id = stationData.id || uuid$3();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const targetBranchId = stationData.branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    db.prepare(`
      INSERT INTO kitchen_stations (id, branch_id, name, code, color_code, display_order, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      id,
      targetBranchId,
      stationData.name,
      (stationData.code || stationData.name.slice(0, 5)).toUpperCase(),
      stationData.colorCode || "#f97316",
      stationData.displayOrder || 0,
      now
    );
    return db.prepare("SELECT * FROM kitchen_stations WHERE id = ?").get(id);
  },
  /**
   * Update an existing kitchen station
   */
  updateStation: (id, stationData) => {
    const db = getDb();
    const existing = db.prepare("SELECT * FROM kitchen_stations WHERE id = ?").get(id);
    if (!existing) throw new Error(`Kitchen station with ID "${id}" not found.`);
    db.prepare(`
      UPDATE kitchen_stations
      SET name = COALESCE(?, name),
          code = COALESCE(?, code),
          color_code = COALESCE(?, color_code),
          display_order = COALESCE(?, display_order),
          is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).run(
      stationData.name ?? null,
      stationData.code ? stationData.code.toUpperCase() : null,
      stationData.colorCode ?? null,
      stationData.displayOrder ?? null,
      stationData.isActive ?? null,
      id
    );
    return db.prepare("SELECT * FROM kitchen_stations WHERE id = ?").get(id);
  },
  /**
   * Get active kitchen orders and tickets
   * @param {object} params
   * @param {string} [params.branchId]
   * @param {string} [params.stationId] - Filter by station ID or 'ALL'
   * @param {string} [params.statusFilter] - 'ACTIVE' | 'READY' | 'COMPLETED' | 'ALL'
   */
  getKitchenOrders: (params = {}) => {
    var _a;
    const db = getDb();
    const branchId = params.branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const statusFilter = params.statusFilter || "ACTIVE";
    let statusCondition = "";
    if (statusFilter === "ACTIVE") {
      statusCondition = "o.status IN ('CONFIRMED', 'PREPARING', 'READY')";
    } else if (statusFilter === "READY") {
      statusCondition = "o.status = 'READY'";
    } else if (statusFilter === "COMPLETED") {
      statusCondition = "o.status IN ('SERVED', 'COMPLETED') AND datetime(o.updated_at) >= datetime('now', '-60 minutes')";
    } else if (statusFilter !== "ALL") {
      statusCondition = `o.status = '${statusFilter}'`;
    } else {
      statusCondition = "o.status NOT IN ('DRAFT', 'CANCELLED')";
    }
    const query = `
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
      WHERE o.branch_id = ? AND ${statusCondition}
      ORDER BY 
        CASE o.status
          WHEN 'CONFIRMED' THEN 1
          WHEN 'PREPARING' THEN 2
          WHEN 'READY' THEN 3
          ELSE 4
        END,
        o.created_at ASC
    `;
    const orders = db.prepare(query).all(branchId);
    const nowMs = Date.now();
    const enrichedOrders = [];
    for (const ord of orders) {
      const itemsQuery = `
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
      `;
      let items = db.prepare(itemsQuery).all(ord.id);
      items = items.map((item) => {
        const modifiers = db.prepare(`
          SELECT * FROM order_item_modifiers WHERE order_item_id = ?
        `).all(item.id);
        return {
          ...item,
          modifiers
        };
      });
      if (params.stationId && params.stationId !== "ALL") {
        const hasStationItem = items.some((it) => it.station_id === params.stationId);
        if (!hasStationItem) continue;
      }
      const orderCreatedMs = new Date(ord.created_at).getTime();
      const elapsedMinutes = Math.max(0, Math.floor((nowMs - orderCreatedMs) / 6e4));
      let delayStatus = "NORMAL";
      if (elapsedMinutes >= ord.target_prep_minutes) {
        delayStatus = "DELAYED";
      } else if (elapsedMinutes >= Math.floor(ord.target_prep_minutes * 0.65)) {
        delayStatus = "WARNING";
      }
      const totalItemsCount = items.reduce((acc, it) => acc + (it.quantity || 1), 0);
      const readyItemsCount = items.filter((it) => it.kitchen_status === "READY").reduce((acc, it) => acc + (it.quantity || 1), 0);
      const isAllItemsReady = items.length > 0 && items.every((it) => it.kitchen_status === "READY");
      enrichedOrders.push({
        ...ord,
        elapsedMinutes,
        delayStatus,
        totalItemsCount,
        readyItemsCount,
        isAllItemsReady,
        items
      });
    }
    return enrichedOrders;
  },
  /**
   * Update individual order item kitchen status
   * Transitions: PENDING -> PREPARING -> READY -> SERVED
   */
  updateOrderItemStatus: ({ orderItemId, status, userId }) => {
    const db = getDb();
    const allowed = ["PENDING", "PREPARING", "READY", "SERVED"];
    if (!allowed.includes(status)) {
      throw new Error(`Invalid item status "${status}". Allowed: ${allowed.join(", ")}`);
    }
    const item = db.prepare("SELECT * FROM order_items WHERE id = ?").get(orderItemId);
    if (!item) throw new Error(`Order item with ID "${orderItemId}" not found.`);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const updateItemTx = db.transaction(() => {
      let startedCooking = item.started_cooking_at;
      let completedCooking = item.completed_cooking_at;
      if (status === "PREPARING" && !startedCooking) {
        startedCooking = now;
      } else if (status === "READY" && !completedCooking) {
        completedCooking = now;
      }
      db.prepare(`
        UPDATE order_items
        SET kitchen_status = ?,
            started_cooking_at = ?,
            completed_cooking_at = ?
        WHERE id = ?
      `).run(status, startedCooking, completedCooking, orderItemId);
      const siblingItems = db.prepare("SELECT kitchen_status FROM order_items WHERE order_id = ?").all(item.order_id);
      const allReady = siblingItems.every((si) => si.kitchen_status === "READY");
      const anyPreparing = siblingItems.some((si) => si.kitchen_status === "PREPARING" || si.kitchen_status === "READY");
      const parentOrder = db.prepare("SELECT id, status, branch_id, order_number FROM orders WHERE id = ?").get(item.order_id);
      if (allReady && parentOrder && parentOrder.status !== "READY" && parentOrder.status !== "COMPLETED" && parentOrder.status !== "SERVED") {
        db.prepare(`
          UPDATE orders
          SET status = 'READY',
              kitchen_ready_at = ?,
              updated_at = ?
          WHERE id = ?
        `).run(now, now, item.order_id);
        db.prepare(`
          INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
          VALUES (?, ?, ?, 'READY', ?, 'All kitchen items prepared and ready', ?)
        `).run(uuid$3(), item.order_id, parentOrder.status, userId || null, now);
      } else if (anyPreparing && parentOrder && parentOrder.status === "CONFIRMED") {
        db.prepare(`
          UPDATE orders
          SET status = 'PREPARING',
              kitchen_accepted_at = COALESCE(kitchen_accepted_at, ?),
              updated_at = ?
          WHERE id = ?
        `).run(now, now, item.order_id);
        db.prepare(`
          INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
          VALUES (?, ?, 'CONFIRMED', 'PREPARING', ?, 'Kitchen started preparation', ?)
        `).run(uuid$3(), item.order_id, userId || null, now);
      }
      return db.prepare("SELECT * FROM order_items WHERE id = ?").get(orderItemId);
    });
    return updateItemTx();
  },
  /**
   * Update full order status in Kitchen workflow
   * @param {object} params
   * @param {string} params.orderId
   * @param {string} params.status - 'PREPARING' | 'READY' | 'SERVED' | 'COMPLETED'
   * @param {string} [params.userId]
   * @param {string} [params.notes]
   */
  updateOrderStatus: ({ orderId, status, userId, notes }) => {
    const db = getDb();
    const allowed = ["CONFIRMED", "PREPARING", "READY", "SERVED", "COMPLETED"];
    if (!allowed.includes(status)) {
      throw new Error(`Invalid status "${status}". Allowed: ${allowed.join(", ")}`);
    }
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!order) throw new Error(`Order with ID "${orderId}" not found.`);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const updateOrderTx = db.transaction(() => {
      let kitchenAcceptedAt = order.kitchen_accepted_at;
      let kitchenReadyAt = order.kitchen_ready_at;
      let kitchenCompletedAt = order.kitchen_completed_at;
      if (status === "PREPARING" && !kitchenAcceptedAt) {
        kitchenAcceptedAt = now;
      } else if (status === "READY" && !kitchenReadyAt) {
        kitchenReadyAt = now;
      } else if ((status === "SERVED" || status === "COMPLETED") && !kitchenCompletedAt) {
        kitchenCompletedAt = now;
      }
      db.prepare(`
        UPDATE orders
        SET status = ?,
            kitchen_accepted_at = ?,
            kitchen_ready_at = ?,
            kitchen_completed_at = ?,
            updated_at = ?
        WHERE id = ?
      `).run(status, kitchenAcceptedAt, kitchenReadyAt, kitchenCompletedAt, now, orderId);
      if (status === "PREPARING") {
        db.prepare(`
          UPDATE order_items
          SET kitchen_status = 'PREPARING',
              started_cooking_at = COALESCE(started_cooking_at, ?)
          WHERE order_id = ? AND kitchen_status = 'PENDING'
        `).run(now, orderId);
      } else if (status === "READY") {
        db.prepare(`
          UPDATE order_items
          SET kitchen_status = 'READY',
              completed_cooking_at = COALESCE(completed_cooking_at, ?)
          WHERE order_id = ? AND kitchen_status != 'READY'
        `).run(now, orderId);
      }
      db.prepare(`
        INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(uuid$3(), orderId, order.status, status, userId || null, notes || `Status updated to ${status}`, now);
      db.prepare(`
        INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
        VALUES (?, ?, ?, 'UPDATE_KITCHEN_STATUS', 'ORDER', ?, ?, ?)
      `).run(
        uuid$3(),
        order.branch_id,
        userId || null,
        orderId,
        JSON.stringify({ from: order.status, to: status, orderNumber: order.order_number }),
        now
      );
      return db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    });
    return updateOrderTx();
  },
  /**
   * Get KDS summary metrics (Active orders, Preparing, Ready, Delayed count, Avg cook time)
   */
  getKitchenMetrics: (branchId) => {
    var _a;
    const db = getDb();
    const targetBranchId = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const activeTickets = db.prepare(`
      SELECT COUNT(*) as count FROM orders
      WHERE branch_id = ? AND status IN ('CONFIRMED', 'PREPARING', 'READY')
    `).get(targetBranchId).count;
    const preparingTickets = db.prepare(`
      SELECT COUNT(*) as count FROM orders
      WHERE branch_id = ? AND status = 'PREPARING'
    `).get(targetBranchId).count;
    const readyTickets = db.prepare(`
      SELECT COUNT(*) as count FROM orders
      WHERE branch_id = ? AND status = 'READY'
    `).get(targetBranchId).count;
    const completedToday = db.prepare(`
      SELECT COUNT(*) as count FROM orders
      WHERE branch_id = ? AND status IN ('SERVED', 'COMPLETED')
        AND date(created_at) = date('now')
    `).get(targetBranchId).count;
    const activeOrders = db.prepare(`
      SELECT created_at, COALESCE(target_prep_minutes, 15) as target_prep_minutes
      FROM orders
      WHERE branch_id = ? AND status IN ('CONFIRMED', 'PREPARING')
    `).all(targetBranchId);
    const nowMs = Date.now();
    let delayedCount = 0;
    for (const o of activeOrders) {
      const elapsed = (nowMs - new Date(o.created_at).getTime()) / 6e4;
      if (elapsed >= o.target_prep_minutes) delayedCount++;
    }
    return {
      activeTickets,
      preparingTickets,
      readyTickets,
      delayedCount,
      completedToday
    };
  }
};
function assertPermission$1(permCode) {
  return requirePermission(permCode);
}
function registerKitchenIpcHandlers() {
  ipcMain.handle("kitchen:get-orders", async (_event, params = {}) => {
    assertPermission$1("kitchen:view");
    const branchId = getActiveBranchId(params.branchId);
    return kitchenRepository.getKitchenOrders({
      ...params,
      branchId
    });
  });
  ipcMain.handle("kitchen:update-item-status", async (_event, { orderItemId, status }) => {
    assertPermission$1("kitchen:view");
    const session = authRepository$1.getCurrentSession();
    const result = kitchenRepository.updateOrderItemStatus({
      orderItemId,
      status,
      userId: (session == null ? void 0 : session.id) || null
    });
    broadcast("kitchen:order-update", { orderItemId, status });
    return result;
  });
  ipcMain.handle("kitchen:update-order-status", async (_event, { orderId, status, notes }) => {
    assertPermission$1("kitchen:view");
    const session = authRepository$1.getCurrentSession();
    const result = kitchenRepository.updateOrderStatus({
      orderId,
      status,
      userId: (session == null ? void 0 : session.id) || null,
      notes
    });
    broadcast("kitchen:order-update", { orderId, status });
    broadcast("pos:status-change", { orderId, status });
    return result;
  });
  ipcMain.handle("kitchen:get-stations", async (_event, branchId) => {
    requireSession();
    return kitchenRepository.getStations(getActiveBranchId(branchId));
  });
  ipcMain.handle("kitchen:create-station", async (_event, stationData) => {
    assertPermission$1("settings:manage");
    const branchId = getActiveBranchId(stationData.branchId);
    return kitchenRepository.createStation({
      ...stationData,
      branchId
    });
  });
  ipcMain.handle("kitchen:update-station", async (_event, { id, data }) => {
    assertPermission$1("settings:manage");
    return kitchenRepository.updateStation(id, data);
  });
  ipcMain.handle("kitchen:get-metrics", async (_event, branchId) => {
    assertPermission$1("kitchen:view");
    return kitchenRepository.getKitchenMetrics(getActiveBranchId(branchId));
  });
}
function assertPermission(permCode) {
  return requirePermission(permCode);
}
function registerInventoryIpcHandlers() {
  ipcMain.handle("inventory:get-units", async () => {
    requireSession();
    return inventoryRepository.getUnits();
  });
  ipcMain.handle("inventory:create-unit", async (_event, data) => {
    assertPermission("inventory:manage");
    return inventoryRepository.createUnit(data);
  });
  ipcMain.handle("inventory:get-items", async (_event, params = {}) => {
    requireSession();
    return inventoryRepository.getItems({
      ...params,
      branchId: getActiveBranchId(params.branchId)
    });
  });
  ipcMain.handle("inventory:get-item", async (_event, id) => {
    return inventoryRepository.getItemById(id);
  });
  ipcMain.handle("inventory:create-item", async (_event, data) => {
    assertPermission("inventory:manage");
    return inventoryRepository.createItem({
      ...data,
      branchId: getActiveBranchId(data.branchId)
    });
  });
  ipcMain.handle("inventory:update-item", async (_event, { id, data }) => {
    assertPermission("inventory:manage");
    return inventoryRepository.updateItem(id, data);
  });
  ipcMain.handle("inventory:adjust-stock", async (_event, data) => {
    assertPermission("inventory:manage");
    const session = authRepository.getCurrentSession();
    return inventoryRepository.adjustStock({
      ...data,
      branchId: getActiveBranchId(data.branchId),
      userId: (session == null ? void 0 : session.id) || null
    });
  });
  ipcMain.handle("inventory:get-movements", async (_event, params = {}) => {
    assertPermission("inventory:manage");
    return inventoryRepository.getStockMovements({
      ...params,
      branchId: getActiveBranchId(params.branchId)
    });
  });
  ipcMain.handle("recipe:get-recipes", async (_event, params = {}) => {
    return inventoryRepository.getRecipes({
      ...params,
      branchId: getActiveBranchId(params.branchId)
    });
  });
  ipcMain.handle("recipe:get-recipe", async (_event, { productId, variationId }) => {
    return inventoryRepository.getRecipeForProduct(productId, variationId);
  });
  ipcMain.handle("recipe:save-recipe", async (_event, recipeData) => {
    assertPermission("inventory:manage");
    return inventoryRepository.saveRecipe(recipeData);
  });
  ipcMain.handle("supplier:get-suppliers", async (_event, branchId) => {
    return inventoryRepository.getSuppliers(getActiveBranchId(branchId));
  });
  ipcMain.handle("supplier:create", async (_event, data) => {
    assertPermission("inventory:manage");
    return inventoryRepository.createSupplier({
      ...data,
      branchId: getActiveBranchId(data.branchId)
    });
  });
  ipcMain.handle("supplier:update", async (_event, { id, data }) => {
    assertPermission("inventory:manage");
    return inventoryRepository.updateSupplier(id, data);
  });
  ipcMain.handle("purchase:get-orders", async (_event, params = {}) => {
    assertPermission("inventory:manage");
    return inventoryRepository.getPurchaseOrders({
      ...params,
      branchId: getActiveBranchId(params.branchId)
    });
  });
  ipcMain.handle("purchase:create-order", async (_event, orderData) => {
    assertPermission("inventory:manage");
    return inventoryRepository.createPurchaseOrder({
      ...orderData,
      branchId: getActiveBranchId(orderData.branchId)
    });
  });
  ipcMain.handle("purchase:record-payment", async (_event, paymentData) => {
    assertPermission("inventory:manage");
    return inventoryRepository.recordVendorPayment({
      ...paymentData,
      branchId: getActiveBranchId(paymentData.branchId)
    });
  });
  ipcMain.handle("expense:get-categories", async () => {
    return inventoryRepository.getExpenseCategories();
  });
  ipcMain.handle("expense:get-expenses", async (_event, params = {}) => {
    assertPermission("reports:view");
    return inventoryRepository.getExpenses({
      ...params,
      branchId: getActiveBranchId(params.branchId)
    });
  });
  ipcMain.handle("expense:create", async (_event, data) => {
    assertPermission("reports:view");
    const session = authRepository.getCurrentSession();
    return inventoryRepository.createExpense({
      ...data,
      branchId: getActiveBranchId(data.branchId),
      userId: (session == null ? void 0 : session.id) || null
    });
  });
  ipcMain.handle("expense:get-summary", async (_event, params = {}) => {
    assertPermission("reports:view");
    return inventoryRepository.getExpenseSummary({
      ...params,
      branchId: getActiveBranchId(params.branchId)
    });
  });
}
function uuid$2() {
  return crypto.randomUUID();
}
function resolveValidUserId$1(db, userId) {
  if (userId) {
    const u = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    if (u) return u.id;
  }
  const session = authRepository$1.getCurrentSession();
  if (session == null ? void 0 : session.id) {
    const u = db.prepare("SELECT id FROM users WHERE id = ?").get(session.id);
    if (u) return u.id;
  }
  const fallback = db.prepare("SELECT id FROM users WHERE is_active = 1 LIMIT 1").get();
  return (fallback == null ? void 0 : fallback.id) || null;
}
function resolveValidBranchId$1(db, branchId) {
  if (branchId) {
    const b = db.prepare("SELECT id FROM branches WHERE id = ?").get(branchId);
    if (b) return b.id;
  }
  const session = authRepository$1.getCurrentSession();
  if (session == null ? void 0 : session.branchId) {
    const b = db.prepare("SELECT id FROM branches WHERE id = ?").get(session.branchId);
    if (b) return b.id;
  }
  const fallback = db.prepare("SELECT id FROM branches LIMIT 1").get();
  return (fallback == null ? void 0 : fallback.id) || null;
}
function logAudit$1(branchId, action, entityType, entityId, details) {
  try {
    const db = getDb();
    const validUserId = resolveValidUserId$1(db, null);
    const validBranchId = resolveValidBranchId$1(db, branchId);
    db.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid$2(),
      validBranchId,
      validUserId,
      action,
      entityType,
      entityId,
      JSON.stringify(details),
      (/* @__PURE__ */ new Date()).toISOString()
    );
  } catch (err) {
    console.error("[Cash Drawer Audit Log Error]:", err);
  }
}
const cashDrawerRepository = {
  /**
   * Get currently active open session for user/branch
   */
  getCurrentSession: (branchId, userId = null) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId$1(db, branchId);
    const validUserId = resolveValidUserId$1(db, userId);
    let session = null;
    if (validUserId) {
      session = db.prepare(`
        SELECT cs.*, u.display_name as cashier_name, u.username as cashier_username
        FROM cash_sessions cs
        JOIN users u ON cs.user_id = u.id
        WHERE cs.branch_id = ? AND cs.user_id = ? AND cs.status = 'OPEN'
        ORDER BY cs.opened_at DESC LIMIT 1
      `).get(validBranchId, validUserId);
    }
    if (!session) {
      session = db.prepare(`
        SELECT cs.*, u.display_name as cashier_name, u.username as cashier_username
        FROM cash_sessions cs
        JOIN users u ON cs.user_id = u.id
        WHERE cs.branch_id = ? AND cs.status = 'OPEN'
        ORDER BY cs.opened_at DESC LIMIT 1
      `).get(validBranchId);
    }
    if (!session) return null;
    const liveMetrics = cashDrawerRepository.calculateSessionMetrics(session.id);
    return {
      ...session,
      liveMetrics
    };
  },
  /**
   * Open a new cash drawer session
   */
  openSession: ({ branchId, userId, openingBalanceCents = 0, notes = null }) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId$1(db, branchId);
    const validUserId = resolveValidUserId$1(db, userId);
    if (!validBranchId) throw new Error("Valid branch is required to open shift.");
    if (!validUserId) throw new Error("Valid cashier is required to open shift.");
    const existing = db.prepare(`
      SELECT id FROM cash_sessions
      WHERE branch_id = ? AND user_id = ? AND status = 'OPEN'
    `).get(validBranchId, validUserId);
    if (existing) {
      throw new Error("An active cash shift session is already open for this user. Please close it first.");
    }
    const sessionId = uuid$2();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(`
      INSERT INTO cash_sessions (
        id, branch_id, user_id, opened_at, opening_balance_cents,
        expected_cash_cents, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)
    `).run(
      sessionId,
      validBranchId,
      validUserId,
      now,
      Math.max(0, parseInt(openingBalanceCents, 10) || 0),
      Math.max(0, parseInt(openingBalanceCents, 10) || 0),
      notes || null
    );
    logAudit$1(validBranchId, "OPEN_CASH_SESSION", "CASH_SESSION", sessionId, {
      openingBalanceCents,
      userId: validUserId
    });
    return cashDrawerRepository.getSessionDetails(sessionId);
  },
  /**
   * Record Cash In or Cash Out (Petty Cash movement)
   */
  recordMovement: ({ sessionId, movementType, amountCents, reason }) => {
    const db = getDb();
    const session = db.prepare("SELECT * FROM cash_sessions WHERE id = ?").get(sessionId);
    if (!session) throw new Error("Shift session not found.");
    if (session.status !== "OPEN") throw new Error("Cannot add movement to a closed session.");
    const normalizedType = movementType.toUpperCase();
    if (normalizedType !== "CASH_IN" && normalizedType !== "CASH_OUT") {
      throw new Error("Movement type must be 'CASH_IN' or 'CASH_OUT'.");
    }
    const parsedAmount = Math.max(0, parseInt(amountCents, 10) || 0);
    if (parsedAmount <= 0) throw new Error("Amount must be greater than zero.");
    if (!reason || reason.trim() === "") throw new Error("Reason is required for cash movement.");
    const movementId = uuid$2();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(`
      INSERT INTO cash_movements (id, session_id, movement_type, amount_cents, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(movementId, sessionId, normalizedType, parsedAmount, reason.trim(), now);
    logAudit$1(session.branch_id, `CASH_MOVEMENT_${normalizedType}`, "CASH_SESSION", sessionId, {
      movementType: normalizedType,
      amountCents: parsedAmount,
      reason: reason.trim()
    });
    return {
      movementId,
      sessionId,
      movementType: normalizedType,
      amountCents: parsedAmount,
      reason: reason.trim(),
      createdAt: now,
      liveMetrics: cashDrawerRepository.calculateSessionMetrics(sessionId)
    };
  },
  /**
   * Calculate live or historical metrics for a shift session
   */
  calculateSessionMetrics: (sessionId) => {
    const db = getDb();
    const session = db.prepare("SELECT * FROM cash_sessions WHERE id = ?").get(sessionId);
    if (!session) return null;
    const startTime = session.opened_at;
    const endTime = session.closed_at || (/* @__PURE__ */ new Date()).toISOString();
    const payments = db.prepare(`
      SELECT payment_method, SUM(amount_cents) as total_cents, COUNT(*) as count
      FROM payments
      WHERE branch_id = ? AND cashier_id = ?
        AND created_at >= ? AND created_at <= ? AND status = 'COMPLETED'
      GROUP BY payment_method
    `).all(session.branch_id, session.user_id, startTime, endTime);
    let totalCashSalesCents = 0;
    let totalCardSalesCents = 0;
    let totalBankSalesCents = 0;
    let totalOnlineSalesCents = 0;
    let totalPaymentsCount = 0;
    for (const p of payments) {
      totalPaymentsCount += p.count;
      const method = p.payment_method.toUpperCase();
      if (method === "CASH") totalCashSalesCents += p.total_cents;
      else if (method === "CARD") totalCardSalesCents += p.total_cents;
      else if (method === "BANK_TRANSFER") totalBankSalesCents += p.total_cents;
      else if (method === "ONLINE") totalOnlineSalesCents += p.total_cents;
      else totalCashSalesCents += p.total_cents;
    }
    const movements = db.prepare(`
      SELECT movement_type, SUM(amount_cents) as total_cents, COUNT(*) as count
      FROM cash_movements
      WHERE session_id = ?
      GROUP BY movement_type
    `).all(sessionId);
    let totalCashInCents = 0;
    let totalCashOutCents = 0;
    for (const m of movements) {
      if (m.movement_type === "CASH_IN") totalCashInCents += m.total_cents;
      else if (m.movement_type === "CASH_OUT") totalCashOutCents += m.total_cents;
    }
    const openingBalanceCents = session.opening_balance_cents || 0;
    const totalRefundsCents = session.total_refunds_cents || 0;
    const expectedCashCents = openingBalanceCents + totalCashSalesCents + totalCashInCents - totalCashOutCents - totalRefundsCents;
    return {
      openingBalanceCents,
      totalCashSalesCents,
      totalCardSalesCents,
      totalBankSalesCents,
      totalOnlineSalesCents,
      totalGrossSalesCents: totalCashSalesCents + totalCardSalesCents + totalBankSalesCents + totalOnlineSalesCents,
      totalCashInCents,
      totalCashOutCents,
      totalRefundsCents,
      expectedCashCents,
      totalPaymentsCount
    };
  },
  /**
   * Get X-Report (Instantaneous, non-closing mid-shift audit report)
   */
  getXReport: (sessionId) => {
    const session = cashDrawerRepository.getSessionDetails(sessionId);
    if (!session) throw new Error("Shift session not found.");
    const metrics = cashDrawerRepository.calculateSessionMetrics(sessionId);
    return {
      reportType: "X_REPORT",
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      session,
      metrics
    };
  },
  /**
   * Close Cash Session and Generate Permanent Z-Report
   */
  closeSession: ({ sessionId, countedCashCents, closingNotes = null, denominations = [], managerApprovalUserId = null }) => {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const closeTx = db.transaction(() => {
      const session = db.prepare("SELECT * FROM cash_sessions WHERE id = ?").get(sessionId);
      if (!session) throw new Error("Shift session not found.");
      if (session.status === "CLOSED") throw new Error("Session is already closed.");
      const metrics = cashDrawerRepository.calculateSessionMetrics(sessionId);
      const parsedCounted = Math.max(0, parseInt(countedCashCents, 10) || 0);
      const varianceCents = parsedCounted - metrics.expectedCashCents;
      const validManagerId = managerApprovalUserId ? resolveValidUserId$1(db, managerApprovalUserId) : null;
      if (Array.isArray(denominations) && denominations.length > 0) {
        const insertDenom = db.prepare(`
          INSERT INTO cash_drawer_denominations (id, session_id, denomination_cents, count, total_cents)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const d of denominations) {
          const denomVal = parseInt(d.denominationCents, 10) || 0;
          const count = parseInt(d.count, 10) || 0;
          const total = denomVal * count;
          insertDenom.run(uuid$2(), sessionId, denomVal, count, total);
        }
      }
      db.prepare(`
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
        now,
        parsedCounted,
        metrics.expectedCashCents,
        varianceCents,
        metrics.totalCashSalesCents,
        metrics.totalCardSalesCents,
        metrics.totalBankSalesCents,
        metrics.totalOnlineSalesCents,
        metrics.totalCashInCents,
        metrics.totalCashOutCents,
        closingNotes || null,
        validManagerId,
        sessionId
      );
      logAudit$1(session.branch_id, "CLOSE_CASH_SESSION", "CASH_SESSION", sessionId, {
        countedCashCents: parsedCounted,
        expectedCashCents: metrics.expectedCashCents,
        varianceCents,
        closingNotes
      });
      return {
        reportType: "Z_REPORT",
        sessionId,
        generatedAt: now,
        openedAt: session.opened_at,
        closedAt: now,
        cashierId: session.user_id,
        openingBalanceCents: metrics.openingBalanceCents,
        countedCashCents: parsedCounted,
        expectedCashCents: metrics.expectedCashCents,
        varianceCents,
        metrics,
        denominations,
        closingNotes
      };
    });
    return closeTx();
  },
  /**
   * Get shift history list
   */
  getSessionHistory: (branchId, { limit = 30, offset = 0 } = {}) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId$1(db, branchId);
    return db.prepare(`
      SELECT cs.*,
             u.display_name as cashier_name, u.username as cashier_username,
             m.display_name as manager_name
      FROM cash_sessions cs
      JOIN users u ON cs.user_id = u.id
      LEFT JOIN users m ON cs.manager_approval_user_id = m.id
      WHERE cs.branch_id = ?
      ORDER BY cs.opened_at DESC
      LIMIT ? OFFSET ?
    `).all(validBranchId, limit, offset);
  },
  /**
   * Get full details of a session
   */
  getSessionDetails: (sessionId) => {
    const db = getDb();
    const session = db.prepare(`
      SELECT cs.*,
             u.display_name as cashier_name, u.username as cashier_username,
             m.display_name as manager_name,
             b.name as branch_name
      FROM cash_sessions cs
      JOIN users u ON cs.user_id = u.id
      JOIN branches b ON cs.branch_id = b.id
      LEFT JOIN users m ON cs.manager_approval_user_id = m.id
      WHERE cs.id = ?
    `).get(sessionId);
    if (!session) return null;
    const movements = db.prepare(`
      SELECT * FROM cash_movements WHERE session_id = ? ORDER BY created_at ASC
    `).all(sessionId);
    const denominations = db.prepare(`
      SELECT * FROM cash_drawer_denominations WHERE session_id = ? ORDER BY denomination_cents DESC
    `).all(sessionId);
    const metrics = cashDrawerRepository.calculateSessionMetrics(sessionId);
    return {
      ...session,
      movements,
      denominations,
      metrics
    };
  }
};
function registerCashDrawerIpcHandlers() {
  ipcMain.handle("cash:get-current-session", async (_event, params = {}) => {
    const session = requireSession();
    const branchId = getActiveBranchId(params.branchId);
    const userId = params.userId || session.id;
    return cashDrawerRepository.getCurrentSession(branchId, userId);
  });
  ipcMain.handle("cash:open-session", async (_event, data = {}) => {
    const session = requireAnyPermission(["cash:manage", "pos:create_order"]);
    const branchId = getActiveBranchId(data.branchId);
    return cashDrawerRepository.openSession({
      ...data,
      branchId,
      userId: data.userId || session.id
    });
  });
  ipcMain.handle("cash:record-movement", async (_event, data) => {
    requireAnyPermission(["cash:manage", "pos:create_order"]);
    return cashDrawerRepository.recordMovement(data);
  });
  ipcMain.handle("cash:get-x-report", async (_event, sessionId) => {
    requireSession();
    return cashDrawerRepository.getXReport(sessionId);
  });
  ipcMain.handle("cash:close-session", async (_event, data) => {
    requireAnyPermission(["cash:manage", "pos:create_order"]);
    return cashDrawerRepository.closeSession(data);
  });
  ipcMain.handle("cash:get-history", async (_event, params = {}) => {
    requireSession();
    const branchId = getActiveBranchId(params.branchId);
    return cashDrawerRepository.getSessionHistory(branchId, params);
  });
  ipcMain.handle("cash:get-details", async (_event, sessionId) => {
    requireSession();
    return cashDrawerRepository.getSessionDetails(sessionId);
  });
}
function uuid$1() {
  return crypto.randomUUID();
}
function resolveValidBranchId(db, branchId) {
  if (branchId) {
    const b = db.prepare("SELECT id FROM branches WHERE id = ?").get(branchId);
    if (b) return b.id;
  }
  const session = authRepository$1.getCurrentSession();
  if (session == null ? void 0 : session.branchId) {
    const b = db.prepare("SELECT id FROM branches WHERE id = ?").get(session.branchId);
    if (b) return b.id;
  }
  const fallback = db.prepare("SELECT id FROM branches LIMIT 1").get();
  return (fallback == null ? void 0 : fallback.id) || null;
}
function resolveValidUserId(db, userId) {
  const session = authRepository$1.getCurrentSession();
  if (session == null ? void 0 : session.id) {
    const u = db.prepare("SELECT id FROM users WHERE id = ?").get(session.id);
    if (u) return u.id;
  }
  const fallback = db.prepare("SELECT id FROM users WHERE is_active = 1 LIMIT 1").get();
  return (fallback == null ? void 0 : fallback.id) || null;
}
function logAudit(branchId, action, entityType, entityId, details) {
  try {
    const db = getDb();
    const validUserId = resolveValidUserId(db, null);
    const validBranchId = resolveValidBranchId(db, branchId);
    db.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid$1(),
      validBranchId,
      validUserId,
      action,
      entityType,
      entityId,
      JSON.stringify(details),
      (/* @__PURE__ */ new Date()).toISOString()
    );
  } catch (err) {
    console.error("[Staff Audit Log Error]:", err);
  }
}
const staffRepository = {
  /**
   * Get employee roster with today's live attendance status
   */
  getEmployees: ({ branchId, search = "", status = null, designation = null } = {}) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId(db, branchId);
    let sql = `
      SELECT e.*,
             r.name as role_name, r.code as role_code,
             u.username, u.display_name as user_display_name, u.is_active as user_active
      FROM employees e
      LEFT JOIN roles r ON e.role_id = r.id
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.branch_id = ?
    `;
    const params = [validBranchId];
    if (status) {
      sql += " AND e.status = ?";
      params.push(status);
    }
    if (designation) {
      sql += " AND e.designation = ?";
      params.push(designation);
    }
    if (search && search.trim() !== "") {
      sql += " AND (e.first_name LIKE ? OR e.last_name LIKE ? OR e.employee_code LIKE ? OR e.phone LIKE ?)";
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }
    sql += " ORDER BY e.employee_code ASC";
    const employees = db.prepare(sql).all(...params);
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    for (const emp of employees) {
      const att = db.prepare(`
        SELECT sa.*, ss.name as shift_name
        FROM staff_attendance sa
        LEFT JOIN staff_shifts ss ON sa.shift_id = ss.id
        WHERE sa.employee_id = ? AND sa.clock_in >= ?
        ORDER BY sa.clock_in DESC LIMIT 1
      `).get(emp.id, `${today}T00:00:00.000Z`);
      emp.todayAttendance = att || null;
    }
    return employees;
  },
  /**
   * Get employee by ID
   */
  getEmployeeById: (employeeId) => {
    const db = getDb();
    const emp = db.prepare(`
      SELECT e.*, r.name as role_name, r.code as role_code,
             u.username, u.display_name as user_display_name
      FROM employees e
      LEFT JOIN roles r ON e.role_id = r.id
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.id = ?
    `).get(employeeId);
    if (!emp) return null;
    emp.recentAttendance = db.prepare(`
      SELECT sa.*, ss.name as shift_name
      FROM staff_attendance sa
      LEFT JOIN staff_shifts ss ON sa.shift_id = ss.id
      WHERE sa.employee_id = ?
      ORDER BY sa.clock_in DESC LIMIT 15
    `).all(employeeId);
    return emp;
  },
  /**
   * Create new employee profile
   */
  createEmployee: (data) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId(db, data.branchId);
    const empId = uuid$1();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    let empCode = data.employeeCode;
    if (!empCode || empCode.trim() === "") {
      const maxCount = db.prepare("SELECT COUNT(*) as count FROM employees").get().count;
      empCode = `EMP-${(maxCount + 101).toString()}`;
    }
    db.prepare(`
      INSERT INTO employees (
        id, branch_id, user_id, employee_code, first_name, last_name,
        email, phone, designation, role_id, salary_type, base_rate_cents,
        hire_date, status, emergency_contact, notes, image_url, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      empId,
      validBranchId,
      data.userId || null,
      empCode.trim().toUpperCase(),
      data.firstName.trim(),
      data.lastName.trim(),
      data.email || null,
      data.phone || null,
      data.designation || "Staff Member",
      data.roleId || null,
      data.salaryType || "MONTHLY",
      Math.max(0, parseInt(data.baseRateCents, 10) || 0),
      data.hireDate || now.slice(0, 10),
      data.status || "ACTIVE",
      data.emergencyContact || null,
      data.notes || null,
      data.imageUrl || data.image_url || null,
      now,
      now
    );
    logAudit(validBranchId, "CREATE_EMPLOYEE", "EMPLOYEE", empId, {
      employeeCode: empCode,
      name: `${data.firstName} ${data.lastName}`,
      designation: data.designation
    });
    return staffRepository.getEmployeeById(empId);
  },
  /**
   * Update employee profile
   */
  updateEmployee: (id, data) => {
    const db = getDb();
    const existing = db.prepare("SELECT * FROM employees WHERE id = ?").get(id);
    if (!existing) throw new Error("Employee not found.");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(`
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
          image_url = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      data.firstName !== void 0 ? data.firstName.trim() : existing.first_name,
      data.lastName !== void 0 ? data.lastName.trim() : existing.last_name,
      data.email !== void 0 ? data.email : existing.email,
      data.phone !== void 0 ? data.phone : existing.phone,
      data.designation !== void 0 ? data.designation : existing.designation,
      data.roleId !== void 0 ? data.roleId : existing.role_id,
      data.userId !== void 0 ? data.userId : existing.user_id,
      data.salaryType !== void 0 ? data.salaryType : existing.salary_type,
      data.baseRateCents !== void 0 ? Math.max(0, parseInt(data.baseRateCents, 10) || 0) : existing.base_rate_cents,
      data.status !== void 0 ? data.status : existing.status,
      data.emergencyContact !== void 0 ? data.emergencyContact : existing.emergency_contact,
      data.notes !== void 0 ? data.notes : existing.notes,
      data.imageUrl !== void 0 ? data.imageUrl : data.image_url !== void 0 ? data.image_url : existing.image_url,
      now,
      id
    );
    logAudit(existing.branch_id, "UPDATE_EMPLOYEE", "EMPLOYEE", id, { ...data });
    return staffRepository.getEmployeeById(id);
  },
  /**
   * Clock in an employee
   */
  clockIn: ({ employeeId, branchId, shiftId = null, notes = null }) => {
    const db = getDb();
    const emp = db.prepare("SELECT * FROM employees WHERE id = ?").get(employeeId);
    if (!emp) throw new Error("Employee not found.");
    const validBranchId = resolveValidBranchId(db, branchId || emp.branch_id);
    (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const activeAttendance = db.prepare(`
      SELECT id FROM staff_attendance
      WHERE employee_id = ? AND clock_out IS NULL
    `).get(employeeId);
    if (activeAttendance) {
      throw new Error(`${emp.first_name} ${emp.last_name} is already clocked in. Please clock out first.`);
    }
    const attendanceId = uuid$1();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    let selectedShiftId = shiftId;
    if (!selectedShiftId) {
      const firstShift = db.prepare("SELECT id FROM staff_shifts WHERE branch_id = ? AND is_active = 1 LIMIT 1").get(validBranchId);
      selectedShiftId = (firstShift == null ? void 0 : firstShift.id) || null;
    }
    db.prepare(`
      INSERT INTO staff_attendance (
        id, branch_id, employee_id, shift_id, clock_in, clock_out,
        break_minutes, total_work_minutes, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, 0, 0, 'PRESENT', ?, ?, ?)
    `).run(
      attendanceId,
      validBranchId,
      employeeId,
      selectedShiftId,
      now,
      notes || null,
      now,
      now
    );
    logAudit(validBranchId, "CLOCK_IN", "ATTENDANCE", attendanceId, {
      employeeId,
      employeeCode: emp.employee_code,
      clockIn: now
    });
    return db.prepare("SELECT * FROM staff_attendance WHERE id = ?").get(attendanceId);
  },
  /**
   * Clock out an employee & compute total worked minutes
   */
  clockOut: ({ attendanceId, breakMinutes = 0, notes = null }) => {
    const db = getDb();
    const att = db.prepare("SELECT * FROM staff_attendance WHERE id = ?").get(attendanceId);
    if (!att) throw new Error("Attendance record not found.");
    if (att.clock_out) throw new Error("Employee has already clocked out for this session.");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const clockInTime = new Date(att.clock_in).getTime();
    const clockOutTime = new Date(now).getTime();
    const rawMinutes = Math.max(0, Math.round((clockOutTime - clockInTime) / (1e3 * 60)));
    const parsedBreak = Math.max(0, parseInt(breakMinutes, 10) || 0);
    const totalWorkMinutes = Math.max(0, rawMinutes - parsedBreak);
    db.prepare(`
      UPDATE staff_attendance
      SET clock_out = ?,
          break_minutes = ?,
          total_work_minutes = ?,
          notes = COALESCE(notes || ' | ' || ?, ?),
          updated_at = ?
      WHERE id = ?
    `).run(
      now,
      parsedBreak,
      totalWorkMinutes,
      notes,
      notes,
      now,
      attendanceId
    );
    logAudit(att.branch_id, "CLOCK_OUT", "ATTENDANCE", attendanceId, {
      clockOut: now,
      totalWorkMinutes,
      breakMinutes: parsedBreak
    });
    return db.prepare("SELECT * FROM staff_attendance WHERE id = ?").get(attendanceId);
  },
  /**
   * Get attendance logs
   */
  getAttendanceLogs: ({ branchId, date = null, employeeId = null, limit = 50, offset = 0 } = {}) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId(db, branchId);
    let sql = `
      SELECT sa.*,
             e.first_name, e.last_name, e.employee_code, e.designation,
             ss.name as shift_name
      FROM staff_attendance sa
      JOIN employees e ON sa.employee_id = e.id
      LEFT JOIN staff_shifts ss ON sa.shift_id = ss.id
      WHERE sa.branch_id = ?
    `;
    const params = [validBranchId];
    if (employeeId) {
      sql += " AND sa.employee_id = ?";
      params.push(employeeId);
    }
    if (date) {
      sql += " AND sa.clock_in LIKE ?";
      params.push(`${date}%`);
    }
    sql += " ORDER BY sa.clock_in DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);
    return db.prepare(sql).all(...params);
  },
  /**
   * Staff Performance Analytics (Sales generated, orders processed)
   */
  getStaffPerformance: ({ branchId, startDate = null, endDate = null } = {}) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId(db, branchId);
    let paymentDateFilter = "";
    const joinParams = [];
    if (startDate) {
      paymentDateFilter += " AND p.created_at >= ?";
      joinParams.push(startDate);
    }
    if (endDate) {
      paymentDateFilter += " AND p.created_at <= ?";
      joinParams.push(endDate);
    }
    const cashierStats = db.prepare(`
      SELECT u.id as user_id, u.display_name, u.username,
             COUNT(DISTINCT p.order_id) as orders_handled,
             COUNT(p.id) as transactions_count,
             COALESCE(SUM(p.amount_cents), 0) as total_collected_cents,
             COALESCE(SUM(CASE WHEN p.payment_method = 'CASH' THEN p.amount_cents ELSE 0 END), 0) as cash_collected_cents,
             COALESCE(SUM(CASE WHEN p.payment_method = 'CARD' THEN p.amount_cents ELSE 0 END), 0) as card_collected_cents
      FROM users u
      LEFT JOIN payments p ON p.cashier_id = u.id AND p.status = 'COMPLETED' ${paymentDateFilter}
      WHERE u.branch_id = ?
      GROUP BY u.id
      ORDER BY total_collected_cents DESC
    `).all(...joinParams, validBranchId);
    return {
      cashierPerformance: cashierStats
    };
  },
  /**
   * Get all shifts
   */
  getShifts: (branchId) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId(db, branchId);
    return db.prepare("SELECT * FROM staff_shifts WHERE branch_id = ? ORDER BY start_time ASC").all(validBranchId);
  },
  /**
   * Save or update shift
   */
  saveShift: (shiftData) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId(db, shiftData.branchId);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (shiftData.id) {
      db.prepare(`
        UPDATE staff_shifts
        SET name = ?, start_time = ?, end_time = ?, is_active = ?, updated_at = ?
        WHERE id = ?
      `).run(
        shiftData.name,
        shiftData.startTime,
        shiftData.endTime,
        shiftData.isActive !== false ? 1 : 0,
        now,
        shiftData.id
      );
      return db.prepare("SELECT * FROM staff_shifts WHERE id = ?").get(shiftData.id);
    }
    const id = uuid$1();
    db.prepare(`
      INSERT INTO staff_shifts (id, branch_id, name, start_time, end_time, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      validBranchId,
      shiftData.name,
      shiftData.startTime,
      shiftData.endTime,
      shiftData.isActive !== false ? 1 : 0,
      now,
      now
    );
    return db.prepare("SELECT * FROM staff_shifts WHERE id = ?").get(id);
  },
  /**
   * User Administration for managers
   */
  getUsers: (branchId) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId(db, branchId);
    return db.prepare(`
      SELECT u.id, u.branch_id, u.role_id, u.username, u.display_name,
             u.is_active, u.last_login_at, u.created_at,
             r.name as role_name, r.code as role_code
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.branch_id = ?
      ORDER BY u.created_at ASC
    `).all(validBranchId);
  },
  getRoles: () => {
    const db = getDb();
    return db.prepare("SELECT * FROM roles ORDER BY name ASC").all();
  },
  createUser: (userData) => {
    const db = getDb();
    const validBranchId = resolveValidBranchId(db, userData.branchId);
    const userId = uuid$1();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(userData.username.trim().toLowerCase());
    if (existing) throw new Error(`Username "${userData.username}" is already taken.`);
    const targetRole = db.prepare("SELECT code FROM roles WHERE id = ?").get(userData.roleId);
    if ((targetRole == null ? void 0 : targetRole.code) === "super_admin" && userData.actorRoleCode !== "super_admin") {
      throw new Error("Only a super administrator can create another super administrator.");
    }
    const pinHash = userData.pin ? hashSecret(String(userData.pin)) : null;
    const passwordHash = userData.password ? hashSecret(String(userData.password)) : null;
    db.prepare(`
      INSERT INTO users (
        id, branch_id, role_id, username, display_name, password_hash, pin_hash, image_url, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      userId,
      validBranchId,
      userData.roleId,
      userData.username.trim().toLowerCase(),
      userData.displayName.trim(),
      passwordHash,
      pinHash,
      userData.imageUrl || userData.image_url || null,
      now,
      now
    );
    logAudit(validBranchId, "CREATE_USER", "USER", userId, {
      username: userData.username,
      displayName: userData.displayName
    });
    return db.prepare(`
      SELECT u.id, u.branch_id, u.role_id, u.username, u.display_name,
             u.is_active, r.name as role_name, r.code as role_code
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = ?
    `).get(userId);
  },
  updateUser: (id, userData) => {
    const db = getDb();
    const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    if (!existing) throw new Error("User not found.");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const targetRoleId = userData.roleId !== void 0 ? userData.roleId : existing.role_id;
    const targetRole = db.prepare("SELECT code FROM roles WHERE id = ?").get(targetRoleId);
    if ((targetRole == null ? void 0 : targetRole.code) === "super_admin" && userData.actorRoleCode !== "super_admin") {
      throw new Error("Only a super administrator can assign the super administrator role.");
    }
    let pinHash = existing.pin_hash;
    if (userData.pin && userData.pin.trim() !== "") {
      pinHash = hashSecret(userData.pin.trim());
    }
    let passwordHash = existing.password_hash;
    if (userData.password && userData.password.trim() !== "") {
      passwordHash = hashSecret(userData.password.trim());
    }
    db.prepare(`
      UPDATE users
      SET display_name = ?,
          role_id = ?,
          is_active = ?,
          pin_hash = ?,
          password_hash = ?,
          image_url = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      userData.displayName !== void 0 ? userData.displayName.trim() : existing.display_name,
      targetRoleId,
      userData.isActive !== void 0 ? userData.isActive ? 1 : 0 : existing.is_active,
      pinHash,
      passwordHash,
      userData.imageUrl !== void 0 ? userData.imageUrl : userData.image_url !== void 0 ? userData.image_url : existing.image_url,
      now,
      id
    );
    logAudit(existing.branch_id, "UPDATE_USER", "USER", id, { ...userData });
    return db.prepare(`
      SELECT u.id, u.branch_id, u.role_id, u.username, u.display_name,
             u.is_active, r.name as role_name, r.code as role_code
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = ?
    `).get(id);
  }
};
function assertManagerOrAdmin() {
  return requirePermission("staff:manage");
}
function registerStaffIpcHandlers() {
  ipcMain.handle("staff:get-employees", async (_event, params = {}) => {
    requireSession();
    const branchId = getActiveBranchId(params.branchId);
    return staffRepository.getEmployees({ ...params, branchId });
  });
  ipcMain.handle("staff:get-employee-by-id", async (_event, employeeId) => {
    return staffRepository.getEmployeeById(employeeId);
  });
  ipcMain.handle("staff:create-employee", async (_event, data) => {
    assertManagerOrAdmin();
    const branchId = getActiveBranchId(data.branchId);
    return staffRepository.createEmployee({ ...data, branchId });
  });
  ipcMain.handle("staff:update-employee", async (_event, { id, data }) => {
    assertManagerOrAdmin();
    return staffRepository.updateEmployee(id, data);
  });
  ipcMain.handle("staff:clock-in", async (_event, data) => {
    const branchId = getActiveBranchId(data.branchId);
    return staffRepository.clockIn({ ...data, branchId });
  });
  ipcMain.handle("staff:clock-out", async (_event, data) => {
    return staffRepository.clockOut(data);
  });
  ipcMain.handle("staff:get-attendance-logs", async (_event, params = {}) => {
    const branchId = getActiveBranchId(params.branchId);
    return staffRepository.getAttendanceLogs({ ...params, branchId });
  });
  ipcMain.handle("staff:get-shifts", async (_event, branchId) => {
    return staffRepository.getShifts(getActiveBranchId(branchId));
  });
  ipcMain.handle("staff:save-shift", async (_event, shiftData) => {
    assertManagerOrAdmin();
    const branchId = getActiveBranchId(shiftData.branchId);
    return staffRepository.saveShift({ ...shiftData, branchId });
  });
  ipcMain.handle("staff:get-performance", async (_event, params = {}) => {
    const branchId = getActiveBranchId(params.branchId);
    return staffRepository.getStaffPerformance({ ...params, branchId });
  });
  ipcMain.handle("staff:get-users", async (_event, branchId) => {
    assertManagerOrAdmin();
    return staffRepository.getUsers(getActiveBranchId(branchId));
  });
  ipcMain.handle("staff:get-roles", async () => {
    return staffRepository.getRoles();
  });
  ipcMain.handle("staff:create-user", async (_event, userData) => {
    const session = assertManagerOrAdmin();
    const branchId = getActiveBranchId(userData.branchId);
    return staffRepository.createUser({ ...userData, branchId, actorRoleCode: session.roleCode });
  });
  ipcMain.handle("staff:update-user", async (_event, { id, data }) => {
    const session = assertManagerOrAdmin();
    if (id === session.id && (data == null ? void 0 : data.roleId)) {
      throw new Error("You cannot change your own role.");
    }
    return staffRepository.updateUser(id, { ...data, actorRoleCode: session.roleCode });
  });
}
function uuid() {
  return crypto.randomUUID();
}
const deliveryRepository = {
  // =========================================================================
  // 1. DELIVERY ZONES
  // =========================================================================
  getZones(branchId) {
    var _a;
    const db = getDb();
    const targetBranch = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    return db.prepare(`
        SELECT * FROM delivery_zones
        WHERE branch_id = ?
        ORDER BY delivery_charge_cents ASC
      `).all(targetBranch);
  },
  createZone(data) {
    var _a;
    const db = getDb();
    const branchId = data.branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const id = uuid();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(`
      INSERT INTO delivery_zones (
        id, branch_id, name, delivery_charge_cents, min_order_cents,
        estimated_minutes, description, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id,
      branchId,
      data.name.trim(),
      parseInt(data.deliveryChargeCents, 10) || 0,
      parseInt(data.minOrderCents, 10) || 0,
      parseInt(data.estimatedMinutes, 10) || 30,
      data.description || null,
      now,
      now
    );
    return db.prepare("SELECT * FROM delivery_zones WHERE id = ?").get(id);
  },
  updateZone(id, data) {
    const db = getDb();
    const fields = [];
    const params = [];
    if (data.name !== void 0) {
      fields.push("name = ?");
      params.push(data.name.trim());
    }
    if (data.deliveryChargeCents !== void 0) {
      fields.push("delivery_charge_cents = ?");
      params.push(parseInt(data.deliveryChargeCents, 10));
    }
    if (data.minOrderCents !== void 0) {
      fields.push("min_order_cents = ?");
      params.push(parseInt(data.minOrderCents, 10));
    }
    if (data.estimatedMinutes !== void 0) {
      fields.push("estimated_minutes = ?");
      params.push(parseInt(data.estimatedMinutes, 10));
    }
    if (data.description !== void 0) {
      fields.push("description = ?");
      params.push(data.description);
    }
    if (data.isActive !== void 0) {
      fields.push("is_active = ?");
      params.push(data.isActive ? 1 : 0);
    }
    if (fields.length === 0) return db.prepare("SELECT * FROM delivery_zones WHERE id = ?").get(id);
    fields.push("updated_at = ?");
    params.push((/* @__PURE__ */ new Date()).toISOString());
    params.push(id);
    db.prepare(`UPDATE delivery_zones SET ${fields.join(", ")} WHERE id = ?`).run(...params);
    return db.prepare("SELECT * FROM delivery_zones WHERE id = ?").get(id);
  },
  // =========================================================================
  // 2. RIDERS FLEET
  // =========================================================================
  getRiders(branchId, status = null) {
    var _a;
    const db = getDb();
    const targetBranch = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    let query = `
      SELECT r.*,
        (SELECT COUNT(*) FROM deliveries d WHERE d.rider_id = r.id AND d.status = 'OUT_FOR_DELIVERY') as active_deliveries_count,
        (SELECT SUM(d.cod_collected_cents) FROM deliveries d WHERE d.rider_id = r.id AND d.status = 'DELIVERED' AND d.cod_settled = 0) as unsettled_cod_cents
      FROM riders r
      WHERE r.branch_id = ? AND r.is_active = 1
    `;
    const params = [targetBranch];
    if (status) {
      query += " AND r.status = ?";
      params.push(status);
    }
    query += " ORDER BY r.name ASC";
    return db.prepare(query).all(...params);
  },
  getRiderById(id) {
    const db = getDb();
    return db.prepare(`
        SELECT r.*,
          (SELECT COUNT(*) FROM deliveries d WHERE d.rider_id = r.id AND d.status = 'OUT_FOR_DELIVERY') as active_deliveries_count,
          (SELECT SUM(d.cod_collected_cents) FROM deliveries d WHERE d.rider_id = r.id AND d.status = 'DELIVERED' AND d.cod_settled = 0) as unsettled_cod_cents
        FROM riders r
        WHERE r.id = ?
      `).get(id);
  },
  createRider(data) {
    var _a;
    const db = getDb();
    const branchId = data.branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const id = uuid();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare(`
      INSERT INTO riders (
        id, branch_id, employee_id, name, phone, vehicle_type,
        license_plate, status, image_url, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', ?, 1, ?, ?)
    `).run(
      id,
      branchId,
      data.employeeId || null,
      data.name.trim(),
      data.phone.trim(),
      data.vehicleType || "MOTORCYCLE",
      data.licensePlate ? data.licensePlate.trim() : null,
      data.imageUrl || data.image_url || null,
      now,
      now
    );
    return this.getRiderById(id);
  },
  updateRider(id, data) {
    const db = getDb();
    const fields = [];
    const params = [];
    if (data.name !== void 0) {
      fields.push("name = ?");
      params.push(data.name.trim());
    }
    if (data.phone !== void 0) {
      fields.push("phone = ?");
      params.push(data.phone.trim());
    }
    if (data.vehicleType !== void 0) {
      fields.push("vehicle_type = ?");
      params.push(data.vehicleType);
    }
    if (data.licensePlate !== void 0) {
      fields.push("license_plate = ?");
      params.push(data.licensePlate);
    }
    if (data.status !== void 0) {
      fields.push("status = ?");
      params.push(data.status);
    }
    if (data.isActive !== void 0) {
      fields.push("is_active = ?");
      params.push(data.isActive ? 1 : 0);
    }
    if (data.imageUrl !== void 0 || data.image_url !== void 0) {
      fields.push("image_url = ?");
      params.push(data.imageUrl !== void 0 ? data.imageUrl : data.image_url);
    }
    if (fields.length === 0) return this.getRiderById(id);
    fields.push("updated_at = ?");
    params.push((/* @__PURE__ */ new Date()).toISOString());
    params.push(id);
    db.prepare(`UPDATE riders SET ${fields.join(", ")} WHERE id = ?`).run(...params);
    return this.getRiderById(id);
  },
  updateRiderStatus(id, status) {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db.prepare("UPDATE riders SET status = ?, updated_at = ? WHERE id = ?").run(status, now, id);
    return this.getRiderById(id);
  },
  // =========================================================================
  // 3. DISPATCH & DELIVERIES
  // =========================================================================
  getDeliveries(branchId, filters = {}) {
    var _a;
    const db = getDb();
    const targetBranch = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    let query = `
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
    const params = [targetBranch];
    if (filters.status) {
      query += " AND d.status = ?";
      params.push(filters.status);
    }
    if (filters.riderId) {
      query += " AND d.rider_id = ?";
      params.push(filters.riderId);
    }
    if (filters.date) {
      query += " AND d.created_at LIKE ?";
      params.push(`${filters.date}%`);
    }
    query += " ORDER BY d.created_at DESC";
    return db.prepare(query).all(...params);
  },
  getDeliveryById(id) {
    const db = getDb();
    return db.prepare(`
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
      `).get(id);
  },
  createDelivery(data) {
    var _a;
    const db = getDb();
    const branchId = data.branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const id = uuid();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(data.orderId);
    if (!order) throw new Error(`Order not found: ${data.orderId}`);
    const codAmountCents = data.codAmountCents !== void 0 ? parseInt(data.codAmountCents, 10) : Math.max(0, order.total_cents - (order.paid_cents || 0));
    db.prepare(`
      INSERT INTO deliveries (
        id, order_id, branch_id, zone_id, rider_id,
        customer_name, customer_phone, delivery_address,
        delivery_instructions, status, cod_amount_cents,
        cod_collected_cents, cod_settled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, 0, 0, ?, ?)
    `).run(
      id,
      data.orderId,
      branchId,
      data.zoneId || null,
      data.riderId || null,
      data.customerName.trim(),
      data.customerPhone.trim(),
      data.deliveryAddress.trim(),
      data.deliveryInstructions || null,
      codAmountCents,
      now,
      now
    );
    if (data.riderId) {
      this.assignRider(id, data.riderId);
    }
    return this.getDeliveryById(id);
  },
  assignRider(deliveryId, riderId) {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const delivery = db.prepare("SELECT * FROM deliveries WHERE id = ?").get(deliveryId);
    if (!delivery) throw new Error("Delivery not found.");
    const rider = db.prepare("SELECT * FROM riders WHERE id = ?").get(riderId);
    if (!rider) throw new Error("Rider not found.");
    const assignTx = db.transaction(() => {
      db.prepare(`
        UPDATE deliveries
        SET rider_id = ?, status = 'ASSIGNED', updated_at = ?
        WHERE id = ?
      `).run(riderId, now, deliveryId);
      db.prepare(`
        UPDATE riders
        SET status = 'ASSIGNED', current_delivery_id = ?, updated_at = ?
        WHERE id = ?
      `).run(deliveryId, now, riderId);
    });
    assignTx();
    return this.getDeliveryById(deliveryId);
  },
  dispatchDelivery(deliveryId) {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const delivery = db.prepare("SELECT * FROM deliveries WHERE id = ?").get(deliveryId);
    if (!delivery) throw new Error("Delivery not found.");
    if (!delivery.rider_id) throw new Error("Cannot dispatch without an assigned rider.");
    const dispatchTx = db.transaction(() => {
      db.prepare(`
        UPDATE deliveries
        SET status = 'OUT_FOR_DELIVERY', dispatched_at = ?, updated_at = ?
        WHERE id = ?
      `).run(now, now, deliveryId);
      db.prepare(`
        UPDATE riders
        SET status = 'OUT_FOR_DELIVERY', updated_at = ?
        WHERE id = ?
      `).run(now, delivery.rider_id);
      db.prepare(`
        UPDATE orders
        SET status = 'OUT_FOR_DELIVERY', updated_at = ?
        WHERE id = ?
      `).run(now, delivery.order_id);
    });
    dispatchTx();
    return this.getDeliveryById(deliveryId);
  },
  completeDelivery(deliveryId, { codCollectedCents = null } = {}) {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const delivery = db.prepare("SELECT * FROM deliveries WHERE id = ?").get(deliveryId);
    if (!delivery) throw new Error("Delivery not found.");
    const collected = codCollectedCents !== null ? parseInt(codCollectedCents, 10) : delivery.cod_amount_cents;
    const completeTx = db.transaction(() => {
      var _a;
      db.prepare(`
        UPDATE deliveries
        SET status = 'DELIVERED', delivered_at = ?, cod_collected_cents = ?, updated_at = ?
        WHERE id = ?
      `).run(now, collected, now, deliveryId);
      if (delivery.rider_id) {
        const remainingOut = ((_a = db.prepare("SELECT COUNT(*) as count FROM deliveries WHERE rider_id = ? AND status = 'OUT_FOR_DELIVERY' AND id != ?").get(delivery.rider_id, deliveryId)) == null ? void 0 : _a.count) || 0;
        const newRiderStatus = remainingOut > 0 ? "OUT_FOR_DELIVERY" : "AVAILABLE";
        db.prepare(`
          UPDATE riders
          SET status = ?, current_delivery_id = NULL, updated_at = ?
          WHERE id = ?
        `).run(newRiderStatus, now, delivery.rider_id);
      }
      db.prepare(`
        UPDATE orders
        SET status = 'DELIVERED', paid_cents = total_cents, updated_at = ?
        WHERE id = ?
      `).run(now, delivery.order_id);
    });
    completeTx();
    return this.getDeliveryById(deliveryId);
  },
  failDelivery(deliveryId, reason) {
    const db = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const delivery = db.prepare("SELECT * FROM deliveries WHERE id = ?").get(deliveryId);
    if (!delivery) throw new Error("Delivery not found.");
    const failTx = db.transaction(() => {
      db.prepare(`
        UPDATE deliveries
        SET status = 'FAILED', failed_reason = ?, updated_at = ?
        WHERE id = ?
      `).run(reason || "Customer unavailable", now, deliveryId);
      if (delivery.rider_id) {
        db.prepare(`
          UPDATE riders
          SET status = 'AVAILABLE', current_delivery_id = NULL, updated_at = ?
          WHERE id = ?
        `).run(now, delivery.rider_id);
      }
    });
    failTx();
    return this.getDeliveryById(deliveryId);
  },
  // =========================================================================
  // 4. CASH-ON-DELIVERY (COD) SETTLEMENT
  // =========================================================================
  getRiderPendingCod(riderId) {
    const db = getDb();
    const row = db.prepare(`
        SELECT
          COUNT(*) as delivered_orders_count,
          COALESCE(SUM(cod_collected_cents), 0) as pending_cod_cents
        FROM deliveries
        WHERE rider_id = ? AND status = 'DELIVERED' AND cod_settled = 0
      `).get(riderId);
    const pendingDeliveries = db.prepare(`
        SELECT d.*, o.order_number
        FROM deliveries d
        JOIN orders o ON d.order_id = o.id
        WHERE d.rider_id = ? AND d.status = 'DELIVERED' AND d.cod_settled = 0
        ORDER BY d.delivered_at ASC
      `).all(riderId);
    return {
      riderId,
      deliveredOrdersCount: (row == null ? void 0 : row.delivered_orders_count) || 0,
      pendingCodCents: (row == null ? void 0 : row.pending_cod_cents) || 0,
      deliveries: pendingDeliveries
    };
  },
  settleRiderCod({ branchId, riderId, settledByUserId, notes = "" }) {
    var _a;
    const db = getDb();
    const targetBranch = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const settlementId = uuid();
    const pending = this.getRiderPendingCod(riderId);
    if (pending.deliveredOrdersCount === 0 || pending.pendingCodCents === 0) {
      throw new Error("No pending Cash-on-Delivery funds to settle for this rider.");
    }
    const settleTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO rider_settlements (
          id, branch_id, rider_id, settled_by_user_id,
          total_collected_cents, orders_count, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        settlementId,
        targetBranch,
        riderId,
        settledByUserId,
        pending.pendingCodCents,
        pending.deliveredOrdersCount,
        notes || null,
        now
      );
      db.prepare(`
        UPDATE deliveries
        SET cod_settled = 1, settlement_id = ?, settled_at = ?, updated_at = ?
        WHERE rider_id = ? AND status = 'DELIVERED' AND cod_settled = 0
      `).run(settlementId, now, now, riderId);
    });
    settleTx();
    return {
      settlementId,
      riderId,
      totalSettledCents: pending.pendingCodCents,
      ordersSettledCount: pending.deliveredOrdersCount,
      settledAt: now
    };
  },
  getSettlementHistory(branchId, { riderId = null, date = null } = {}) {
    var _a;
    const db = getDb();
    const targetBranch = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    let query = `
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
    const params = [targetBranch];
    if (riderId) {
      query += " AND s.rider_id = ?";
      params.push(riderId);
    }
    if (date) {
      query += " AND s.created_at LIKE ?";
      params.push(`${date}%`);
    }
    query += " ORDER BY s.created_at DESC";
    return db.prepare(query).all(...params);
  },
  // =========================================================================
  // 5. SUMMARY METRICS
  // =========================================================================
  getSummary(branchId) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const db = getDb();
    const targetBranch = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const totalRiders = ((_b = db.prepare("SELECT COUNT(*) as count FROM riders WHERE branch_id = ? AND is_active = 1").get(targetBranch)) == null ? void 0 : _b.count) || 0;
    const availableRiders = ((_c = db.prepare("SELECT COUNT(*) as count FROM riders WHERE branch_id = ? AND is_active = 1 AND status = 'AVAILABLE'").get(targetBranch)) == null ? void 0 : _c.count) || 0;
    const onTripRiders = ((_d = db.prepare("SELECT COUNT(*) as count FROM riders WHERE branch_id = ? AND is_active = 1 AND status = 'OUT_FOR_DELIVERY'").get(targetBranch)) == null ? void 0 : _d.count) || 0;
    const todayDate = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const pendingDispatches = ((_e = db.prepare("SELECT COUNT(*) as count FROM deliveries WHERE branch_id = ? AND status IN ('PENDING', 'ASSIGNED')").get(targetBranch)) == null ? void 0 : _e.count) || 0;
    const outForDelivery = ((_f = db.prepare("SELECT COUNT(*) as count FROM deliveries WHERE branch_id = ? AND status = 'OUT_FOR_DELIVERY'").get(targetBranch)) == null ? void 0 : _f.count) || 0;
    const deliveredToday = ((_g = db.prepare("SELECT COUNT(*) as count FROM deliveries WHERE branch_id = ? AND status = 'DELIVERED' AND created_at LIKE ?").get(targetBranch, `${todayDate}%`)) == null ? void 0 : _g.count) || 0;
    const pendingCodCents = ((_h = db.prepare("SELECT COALESCE(SUM(cod_collected_cents), 0) as total FROM deliveries WHERE branch_id = ? AND status = 'DELIVERED' AND cod_settled = 0").get(targetBranch)) == null ? void 0 : _h.total) || 0;
    return {
      totalRiders,
      availableRiders,
      onTripRiders,
      pendingDispatches,
      outForDelivery,
      deliveredToday,
      pendingCodCents
    };
  }
};
function registerDeliveryHandlers() {
  ipcMain.handle("delivery:get-zones", async (_event, branchId) => {
    requireSession();
    return deliveryRepository.getZones(getActiveBranchId(branchId));
  });
  ipcMain.handle("delivery:create-zone", async (_event, data) => {
    requirePermission("delivery:manage");
    return deliveryRepository.createZone({ ...data, branchId: getActiveBranchId(data.branchId) });
  });
  ipcMain.handle("delivery:update-zone", async (_event, { id, data }) => {
    requirePermission("delivery:manage");
    return deliveryRepository.updateZone(id, data);
  });
  ipcMain.handle("delivery:get-riders", async (_event, { branchId, status } = {}) => {
    requireSession();
    return deliveryRepository.getRiders(getActiveBranchId(branchId), status);
  });
  ipcMain.handle("delivery:get-rider-by-id", async (_event, id) => {
    requireSession();
    return deliveryRepository.getRiderById(id);
  });
  ipcMain.handle("delivery:create-rider", async (_event, data) => {
    requirePermission("delivery:manage");
    return deliveryRepository.createRider({ ...data, branchId: getActiveBranchId(data.branchId) });
  });
  ipcMain.handle("delivery:update-rider", async (_event, { id, data }) => {
    requirePermission("delivery:manage");
    return deliveryRepository.updateRider(id, data);
  });
  ipcMain.handle("delivery:update-rider-status", async (_event, { id, status }) => {
    requireAnyPermission(["delivery:manage", "pos:create_order"]);
    return deliveryRepository.updateRiderStatus(id, status);
  });
  ipcMain.handle("delivery:get-deliveries", async (_event, { branchId, filters } = {}) => {
    requireSession();
    return deliveryRepository.getDeliveries(getActiveBranchId(branchId), filters);
  });
  ipcMain.handle("delivery:get-delivery-by-id", async (_event, id) => {
    requireSession();
    return deliveryRepository.getDeliveryById(id);
  });
  ipcMain.handle("delivery:create-delivery", async (_event, data) => {
    requireAnyPermission(["delivery:manage", "pos:create_order"]);
    return deliveryRepository.createDelivery({ ...data, branchId: getActiveBranchId(data.branchId) });
  });
  ipcMain.handle("delivery:assign-rider", async (_event, { deliveryId, riderId }) => {
    requireAnyPermission(["delivery:manage", "pos:create_order"]);
    return deliveryRepository.assignRider(deliveryId, riderId);
  });
  ipcMain.handle("delivery:dispatch", async (_event, deliveryId) => {
    requireAnyPermission(["delivery:manage", "pos:create_order"]);
    return deliveryRepository.dispatchDelivery(deliveryId);
  });
  ipcMain.handle("delivery:complete", async (_event, { deliveryId, codCollectedCents }) => {
    requireAnyPermission(["delivery:manage", "pos:create_order"]);
    return deliveryRepository.completeDelivery(deliveryId, { codCollectedCents });
  });
  ipcMain.handle("delivery:fail", async (_event, { deliveryId, reason }) => {
    requireAnyPermission(["delivery:manage", "pos:create_order"]);
    return deliveryRepository.failDelivery(deliveryId, reason);
  });
  ipcMain.handle("delivery:get-rider-pending-cod", async (_event, riderId) => {
    requireSession();
    return deliveryRepository.getRiderPendingCod(riderId);
  });
  ipcMain.handle("delivery:settle-rider-cod", async (_event, { branchId, riderId, notes }) => {
    const session = requireAnyPermission(["delivery:manage", "cash:manage", "pos:create_order"]);
    return deliveryRepository.settleRiderCod({
      branchId: getActiveBranchId(branchId),
      riderId,
      settledByUserId: session.id,
      notes
    });
  });
  ipcMain.handle("delivery:get-settlement-history", async (_event, { branchId, params } = {}) => {
    requireSession();
    return deliveryRepository.getSettlementHistory(getActiveBranchId(branchId), params);
  });
  ipcMain.handle("delivery:get-summary", async (_event, branchId) => {
    requireSession();
    return deliveryRepository.getSummary(getActiveBranchId(branchId));
  });
}
const reportsRepository = {
  /**
   * Get Comprehensive Sales Summary for a Date Range
   * @param {string} branchId 
   * @param {{ startDate?: string, endDate?: string }} filter 
   */
  getSalesSummary(branchId, filter = {}) {
    var _a;
    const db = getDb();
    const targetBranch = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const startDate = filter.startDate || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const endDate = filter.endDate || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const overall = db.prepare(`
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
      `).get(targetBranch, startDate, endDate);
    const byOrderType = db.prepare(`
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
      `).all(targetBranch, startDate, endDate);
    const byPaymentMethod = db.prepare(`
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
      `).all(targetBranch, startDate, endDate);
    const dailyTimeline = db.prepare(`
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
      `).all(targetBranch, startDate, endDate);
    return {
      startDate,
      endDate,
      overall,
      byOrderType,
      byPaymentMethod,
      dailyTimeline
    };
  },
  /**
   * Top Selling & Slow Moving Items Report
   */
  getProductPerformance(branchId, filter = {}) {
    var _a;
    const db = getDb();
    const targetBranch = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const startDate = filter.startDate || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const endDate = filter.endDate || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const items = db.prepare(`
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
      `).all(targetBranch, startDate, endDate);
    const categoryBreakdown = db.prepare(`
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
      `).all(targetBranch, startDate, endDate);
    return {
      items,
      categoryBreakdown
    };
  },
  /**
   * Hourly Peak Rush Breakdown (00:00 to 23:00)
   */
  getHourlyBreakdown(branchId, filter = {}) {
    var _a, _b, _c;
    const db = getDb();
    const targetBranch = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const startDate = filter.startDate || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const endDate = filter.endDate || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const rows = db.prepare(`
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
      `).all(targetBranch, startDate, endDate);
    const hourMap = {};
    rows.forEach((r) => {
      hourMap[r.hour] = r;
    });
    const result = [];
    for (let h = 0; h < 24; h++) {
      result.push({
        hour: h,
        label: `${h.toString().padStart(2, "0")}:00`,
        orderCount: ((_b = hourMap[h]) == null ? void 0 : _b.order_count) || 0,
        totalCents: ((_c = hourMap[h]) == null ? void 0 : _c.total_cents) || 0
      });
    }
    return result;
  },
  /**
   * Financial Profit & Loss Overview
   */
  getProfitAndLoss(branchId, filter = {}) {
    var _a;
    const db = getDb();
    const targetBranch = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const startDate = filter.startDate || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const endDate = filter.endDate || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const revenueRow = db.prepare(`
        SELECT
          COALESCE(SUM(total_cents), 0) as total_revenue_cents,
          COALESCE(SUM(discount_cents), 0) as total_discount_cents,
          COALESCE(SUM(tax_cents), 0) as total_tax_cents
        FROM orders
        WHERE branch_id = ?
          AND status IN ('COMPLETED', 'DELIVERED', 'SERVED')
          AND created_at >= ?
          AND created_at <= ? || 'T23:59:59.999Z'
      `).get(targetBranch, startDate, endDate);
    const cogsRow = db.prepare(`
        SELECT
          COALESCE(SUM(quantity * unit_cost_cents), 0) as total_cogs_cents
        FROM stock_movements
        WHERE branch_id = ?
          AND movement_type = 'SALE_DEDUCTION'
          AND created_at >= ?
          AND created_at <= ? || 'T23:59:59.999Z'
      `).get(targetBranch, startDate, endDate);
    const expensesRow = db.prepare(`
        SELECT
          COALESCE(SUM(amount_cents), 0) as total_expenses_cents
        FROM expenses
        WHERE branch_id = ?
          AND expense_date >= ?
          AND expense_date <= ?
      `).get(targetBranch, startDate, endDate);
    const revenue = (revenueRow == null ? void 0 : revenueRow.total_revenue_cents) || 0;
    const cogs = (cogsRow == null ? void 0 : cogsRow.total_cogs_cents) || 0;
    const grossProfit = Math.max(0, revenue - cogs);
    const expenses = (expensesRow == null ? void 0 : expensesRow.total_expenses_cents) || 0;
    const netProfit = revenue - cogs - expenses;
    return {
      revenueCents: revenue,
      discountCents: (revenueRow == null ? void 0 : revenueRow.total_discount_cents) || 0,
      taxCents: (revenueRow == null ? void 0 : revenueRow.total_tax_cents) || 0,
      cogsCents: cogs,
      grossProfitCents: grossProfit,
      expensesCents: expenses,
      netProfitCents: netProfit,
      marginPercent: revenue > 0 ? (netProfit / revenue * 100).toFixed(1) : "0.0"
    };
  },
  /**
   * Void, Cancellation & Refund Audit
   */
  getVoidAndRefundAudits(branchId, filter = {}) {
    var _a;
    const db = getDb();
    const targetBranch = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const startDate = filter.startDate || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const endDate = filter.endDate || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const voidOrders = db.prepare(`
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
      `).all(targetBranch, startDate, endDate);
    const discountedOrders = db.prepare(`
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
      `).all(targetBranch, startDate, endDate);
    return {
      voidOrders,
      discountedOrders
    };
  },
  /**
   * System Audit Logs History
   */
  getAuditLogs(branchId, limit = 100) {
    var _a;
    const db = getDb();
    const targetBranch = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    return db.prepare(`
        SELECT
          a.*,
          u.username,
          u.display_name as user_display_name
        FROM audit_logs a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.branch_id = ? OR a.branch_id IS NULL
        ORDER BY a.created_at DESC
        LIMIT ?
      `).all(targetBranch, limit);
  },
  getStaffSales(branchId, filter = {}) {
    var _a;
    const db = getDb();
    const targetBranch = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const { startDate, endDate } = dateRange(filter);
    return db.prepare(`
      SELECT
        u.id as user_id,
        u.display_name,
        COALESCE(r.name, 'Staff') as role_name,
        COUNT(o.id) as order_count,
        COALESCE(SUM(o.total_cents), 0) as sales_cents,
        COALESCE(SUM(o.discount_cents), 0) as discount_cents,
        COALESCE(SUM(o.refunded_cents), 0) as refunded_cents
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN orders o ON o.cashier_id = u.id
        AND o.branch_id = ?
        AND o.status IN ('COMPLETED', 'DELIVERED', 'SERVED')
        AND o.created_at >= ? AND o.created_at <= ? || 'T23:59:59.999Z'
      WHERE u.branch_id = ? OR u.branch_id IS NULL
      GROUP BY u.id
      ORDER BY sales_cents DESC
    `).all(targetBranch, startDate, endDate, targetBranch);
  },
  getCustomerReport(branchId, filter = {}) {
    var _a;
    const db = getDb();
    const targetBranch = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const { startDate, endDate } = dateRange(filter);
    return db.prepare(`
      SELECT
        c.id, c.name, c.phone, c.tag, c.loyalty_points, c.image_url,
        COUNT(o.id) as order_count,
        COALESCE(SUM(o.total_cents), 0) as spent_cents,
        MAX(o.created_at) as last_order_at
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id
        AND o.status IN ('COMPLETED', 'DELIVERED', 'SERVED')
        AND o.created_at >= ? AND o.created_at <= ? || 'T23:59:59.999Z'
      WHERE c.branch_id = ? OR c.branch_id IS NULL
      GROUP BY c.id
      ORDER BY spent_cents DESC
    `).all(startDate, endDate, targetBranch);
  },
  getKitchenReport(branchId, filter = {}) {
    var _a;
    const db = getDb();
    const targetBranch = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const { startDate, endDate } = dateRange(filter);
    const byStatus = db.prepare(`
      SELECT status, COUNT(*) as order_count
      FROM orders
      WHERE branch_id = ?
        AND created_at >= ? AND created_at <= ? || 'T23:59:59.999Z'
      GROUP BY status
    `).all(targetBranch, startDate, endDate);
    const avgPrep = db.prepare(`
      SELECT AVG(
        (julianday(updated_at) - julianday(created_at)) * 24 * 60
      ) as avg_minutes
      FROM orders
      WHERE branch_id = ?
        AND status IN ('READY', 'COMPLETED', 'SERVED', 'DELIVERED')
        AND created_at >= ? AND created_at <= ? || 'T23:59:59.999Z'
    `).get(targetBranch, startDate, endDate);
    return { byStatus, avgPrepMinutes: Math.round((avgPrep == null ? void 0 : avgPrep.avg_minutes) || 0) };
  },
  getDeliveryReport(branchId, filter = {}) {
    var _a;
    const db = getDb();
    const targetBranch = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const { startDate, endDate } = dateRange(filter);
    const riders = db.prepare(`
      SELECT
        r.id, r.name, r.vehicle_type, r.status, r.image_url,
        COUNT(d.id) as delivery_count,
        COALESCE(SUM(CASE WHEN d.status = 'DELIVERED' THEN 1 ELSE 0 END), 0) as delivered_count,
        COALESCE(SUM(CASE WHEN d.status = 'FAILED' THEN 1 ELSE 0 END), 0) as failed_count,
        COALESCE(SUM(d.cod_collected_cents), 0) as cod_cents
      FROM riders r
      LEFT JOIN deliveries d ON d.rider_id = r.id
        AND d.created_at >= ? AND d.created_at <= ? || 'T23:59:59.999Z'
      WHERE r.branch_id = ?
      GROUP BY r.id
      ORDER BY delivered_count DESC
    `).all(startDate, endDate, targetBranch);
    return { riders };
  },
  getInventoryReport(branchId) {
    var _a;
    const db = getDb();
    const targetBranch = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const items = db.prepare(`
      SELECT
        i.id, i.name, i.current_stock, i.minimum_level, i.cost_per_unit_cents, i.image_url,
        u.abbreviation as unit,
        ROUND(i.current_stock * COALESCE(i.cost_per_unit_cents, 0), 0) as valuation_cents,
        CASE WHEN i.current_stock <= i.minimum_level THEN 1 ELSE 0 END as is_low
      FROM inventory_items i
      LEFT JOIN inventory_units u ON i.unit_id = u.id
      WHERE i.branch_id = ? OR i.branch_id IS NULL
      ORDER BY is_low DESC, i.name ASC
    `).all(targetBranch);
    const totalValuation = items.reduce((s, i) => s + (i.valuation_cents || 0), 0);
    return { items, totalValuationCents: totalValuation, lowStockCount: items.filter((i) => i.is_low).length };
  },
  getExpenseReport(branchId, filter = {}) {
    var _a;
    const db = getDb();
    const targetBranch = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const { startDate, endDate } = dateRange(filter);
    return db.prepare(`
      SELECT
        COALESCE(ec.name, 'Uncategorized') as category_name,
        COUNT(e.id) as expense_count,
        COALESCE(SUM(e.amount_cents), 0) as total_cents
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      WHERE e.branch_id = ?
        AND e.expense_date >= ? AND e.expense_date <= ?
      GROUP BY ec.id, ec.name
      ORDER BY total_cents DESC
    `).all(targetBranch, startDate, endDate);
  },
  getReservationReport(branchId, filter = {}) {
    var _a;
    const db = getDb();
    const targetBranch = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const { startDate, endDate } = dateRange(filter);
    return db.prepare(`
      SELECT status, COUNT(*) as count
      FROM reservations
      WHERE branch_id = ?
        AND COALESCE(reservation_date, substr(reservation_time, 1, 10)) >= ?
        AND COALESCE(reservation_date, substr(reservation_time, 1, 10)) <= ?
      GROUP BY status
    `).all(targetBranch, startDate, endDate);
  },
  getRefundReport(branchId, filter = {}) {
    var _a;
    const db = getDb();
    const targetBranch = branchId || ((_a = db.prepare("SELECT id FROM branches LIMIT 1").get()) == null ? void 0 : _a.id);
    const { startDate, endDate } = dateRange(filter);
    return db.prepare(`
      SELECT
        rf.id, rf.amount_cents, rf.reason, rf.restock, rf.created_at,
        o.order_number, u.display_name as cashier_name
      FROM refunds rf
      LEFT JOIN orders o ON rf.order_id = o.id
      LEFT JOIN users u ON rf.cashier_id = u.id
      WHERE rf.branch_id = ?
        AND rf.created_at >= ? AND rf.created_at <= ? || 'T23:59:59.999Z'
      ORDER BY rf.created_at DESC
    `).all(targetBranch, startDate, endDate);
  }
};
function dateRange(filter = {}) {
  return {
    startDate: filter.startDate || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10),
    endDate: filter.endDate || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)
  };
}
function registerReportSettingsHandlers() {
  ipcMain.handle("reports:get-sales-summary", async (_event, { branchId, filter } = {}) => {
    requirePermission("reports:view");
    return reportsRepository.getSalesSummary(getActiveBranchId(branchId), filter);
  });
  ipcMain.handle("reports:get-product-performance", async (_event, { branchId, filter } = {}) => {
    requirePermission("reports:view");
    return reportsRepository.getProductPerformance(getActiveBranchId(branchId), filter);
  });
  ipcMain.handle("reports:get-hourly-breakdown", async (_event, { branchId, filter } = {}) => {
    requirePermission("reports:view");
    return reportsRepository.getHourlyBreakdown(getActiveBranchId(branchId), filter);
  });
  ipcMain.handle("reports:get-profit-and-loss", async (_event, { branchId, filter } = {}) => {
    requirePermission("reports:view");
    return reportsRepository.getProfitAndLoss(getActiveBranchId(branchId), filter);
  });
  ipcMain.handle("reports:get-void-audits", async (_event, { branchId, filter } = {}) => {
    requirePermission("reports:view");
    return reportsRepository.getVoidAndRefundAudits(getActiveBranchId(branchId), filter);
  });
  ipcMain.handle("reports:get-audit-logs", async (_event, { branchId, limit } = {}) => {
    requirePermission("reports:view");
    return reportsRepository.getAuditLogs(getActiveBranchId(branchId), limit);
  });
  ipcMain.handle("reports:get-staff-sales", async (_event, { branchId, filter } = {}) => {
    requirePermission("reports:view");
    return reportsRepository.getStaffSales(getActiveBranchId(branchId), filter);
  });
  ipcMain.handle("reports:get-customer-report", async (_event, { branchId, filter } = {}) => {
    requirePermission("reports:view");
    return reportsRepository.getCustomerReport(getActiveBranchId(branchId), filter);
  });
  ipcMain.handle("reports:get-kitchen-report", async (_event, { branchId, filter } = {}) => {
    requirePermission("reports:view");
    return reportsRepository.getKitchenReport(getActiveBranchId(branchId), filter);
  });
  ipcMain.handle("reports:get-delivery-report", async (_event, { branchId, filter } = {}) => {
    requirePermission("reports:view");
    return reportsRepository.getDeliveryReport(getActiveBranchId(branchId), filter);
  });
  ipcMain.handle("reports:get-inventory-report", async (_event, { branchId } = {}) => {
    requirePermission("reports:view");
    return reportsRepository.getInventoryReport(getActiveBranchId(branchId));
  });
  ipcMain.handle("reports:get-expense-report", async (_event, { branchId, filter } = {}) => {
    requirePermission("reports:view");
    return reportsRepository.getExpenseReport(getActiveBranchId(branchId), filter);
  });
  ipcMain.handle("reports:get-reservation-report", async (_event, { branchId, filter } = {}) => {
    requirePermission("reports:view");
    return reportsRepository.getReservationReport(getActiveBranchId(branchId), filter);
  });
  ipcMain.handle("reports:get-refund-report", async (_event, { branchId, filter } = {}) => {
    requirePermission("reports:view");
    return reportsRepository.getRefundReport(getActiveBranchId(branchId), filter);
  });
  ipcMain.handle("settings:get-all", async () => {
    requireSession();
    return settingsRepository.getAll();
  });
  ipcMain.handle("settings:get", async (_event, key) => {
    requireSession();
    return settingsRepository.get(key);
  });
  ipcMain.handle("settings:save-batch", async (_event, settingsObj) => {
    requirePermission("settings:manage");
    for (const [key, val] of Object.entries(settingsObj || {})) {
      settingsRepository.set(key, String(val));
    }
    return settingsRepository.getAll();
  });
}
function mediaDir() {
  const dir = path.join(app.getPath("userData"), "media");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function safeId(id) {
  if (!id || !/^[a-zA-Z0-9._-]+$/.test(id)) {
    throw new Error("Invalid media identifier.");
  }
  return id;
}
function registerMediaHandlers() {
  ipcMain.handle("media:save", async (_event, { dataUrl, filename } = {}) => {
    requireSession();
    if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      throw new Error("A valid image data URL is required.");
    }
    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i);
    if (!match) throw new Error("Unsupported image type. Use PNG, JPEG, WEBP or GIF.");
    const ext = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > 4 * 1024 * 1024) {
      throw new Error("Image must be 4 MB or smaller.");
    }
    const id = `${crypto.randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(mediaDir(), id), buffer);
    return { id, filename: filename || id, dataUrl };
  });
  ipcMain.handle("media:get-data-url", async (_event, id) => {
    requireSession();
    const file = path.join(mediaDir(), safeId(id));
    if (!fs.existsSync(file)) return null;
    const ext = path.extname(file).slice(1).toLowerCase();
    const mime = ext === "jpg" ? "jpeg" : ext;
    const buf = fs.readFileSync(file);
    return `data:image/${mime};base64,${buf.toString("base64")}`;
  });
}
function registerIpcHandlers(mainWindow) {
  ipcMain.handle(IPC_CHANNELS.APP_GET_INFO, async () => {
    return {
      appName: "Restaurant & Fast Food Management System",
      version: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      userDataPath: app.getPath("userData"),
      appPath: app.getAppPath(),
      isPackaged: app.isPackaged,
      mode: process.env.NODE_ENV || "production",
      offlineOnly: true,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
  });
  ipcMain.handle(IPC_CHANNELS.APP_PING, async (_event, payload) => {
    return {
      pong: true,
      received: payload,
      time: Date.now()
    };
  });
  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });
  ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });
  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });
  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      return mainWindow.isMaximized();
    }
    return false;
  });
  registerDatabaseIpcHandlers();
  registerAuthAndDashboardHandlers();
  registerProductIpcHandlers();
  registerPosIpcHandlers();
  registerTableIpcHandlers();
  registerCustomerIpcHandlers();
  registerKitchenIpcHandlers();
  registerInventoryIpcHandlers();
  registerCashDrawerIpcHandlers();
  registerStaffIpcHandlers();
  registerDeliveryHandlers();
  registerReportSettingsHandlers();
  registerMediaHandlers();
}
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win = null;
function createWindow() {
  win = new BrowserWindow({
    title: "Restaurant & Fast Food Management System",
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    // Show gracefully when ready
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname$1, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Required for better-sqlite3 native IPC communication if needed
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });
  registerIpcHandlers(win);
  win.once("ready-to-show", () => {
    win.show();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:") || url.startsWith("http:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (VITE_DEV_SERVER_URL) {
      const devServerOrigin = new URL(VITE_DEV_SERVER_URL).origin;
      if (parsedUrl.origin !== devServerOrigin) {
        event.preventDefault();
      }
    } else if (parsedUrl.protocol !== "file:") {
      event.preventDefault();
    }
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
process.on("uncaughtException", (error) => {
  console.error("[Electron Main] Uncaught Exception:", error);
});
process.on("unhandledRejection", (reason) => {
  console.error("[Electron Main] Unhandled Rejection:", reason);
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(createWindow);
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
