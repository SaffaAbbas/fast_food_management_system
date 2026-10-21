/**
 * Migration 001: Initial Core Enterprise Schema
 * Defines the complete relational database structure for offline-first restaurant operations.
 */
export const migration001 = {
  version: 1,
  name: 'initial_core_schema',
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
    `)
  },
}
