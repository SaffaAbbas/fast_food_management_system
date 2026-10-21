/**
 * Migration 005: Inventory, Recipes, Purchases & Expenses Enhancements (Sections 10, 11, 12, 13)
 * Adds:
 * - Inventory item category, reorder level, and supplier linkage
 * - Recipe ingredient wastage percentage
 * - Purchase order items table for itemized POs & GRNs
 * - Vendor payments ledger for supplier outstanding tracking
 * - Seed default inventory units, expense categories, and sample ingredients
 */
export const migration005 = {
  version: 5,
  name: 'inventory_recipe_purchases_schema',
  up: (db) => {
    // 1. Inventory Items Enhancements
    try {
      db.exec("ALTER TABLE inventory_items ADD COLUMN category TEXT DEFAULT 'General';")
    } catch (e) {}
    try {
      db.exec('ALTER TABLE inventory_items ADD COLUMN reorder_level REAL DEFAULT 10.0;')
    } catch (e) {}
    try {
      db.exec('ALTER TABLE inventory_items ADD COLUMN supplier_id TEXT REFERENCES suppliers(id);')
    } catch (e) {}

    // 2. Recipe Ingredients Enhancements
    try {
      db.exec('ALTER TABLE recipe_ingredients ADD COLUMN wastage_percentage REAL DEFAULT 0.0;')
    } catch (e) {}

    // 3. Purchase Order Items Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_order_items (
        id TEXT PRIMARY KEY,
        po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
        quantity REAL NOT NULL,
        unit_cost_cents INTEGER NOT NULL,
        total_cents INTEGER NOT NULL
      );
    `)

    // 4. Vendor Payments Ledger
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
    `)

    // 5. Seed default expense categories if empty
    const expCatCount = db.prepare('SELECT COUNT(*) as count FROM expense_categories').get().count
    if (expCatCount === 0) {
      const insertCat = db.prepare('INSERT INTO expense_categories (id, name, code) VALUES (?, ?, ?)')
      insertCat.run('exp-rent', 'Rent & Property', 'RENT')
      insertCat.run('exp-util', 'Utilities (Electricity, Water, Gas)', 'UTILITIES')
      insertCat.run('exp-salary', 'Staff Salaries & Wages', 'SALARY')
      insertCat.run('exp-maint', 'Repairs & Maintenance', 'MAINTENANCE')
      insertCat.run('exp-mkt', 'Marketing & Social Media Ads', 'MARKETING')
      insertCat.run('exp-trans', 'Delivery & Fuel / Transport', 'TRANSPORT')
      insertCat.run('exp-pack', 'Packaging & Disposables', 'PACKAGING')
      insertCat.run('exp-misc', 'Miscellaneous Operational Expenses', 'MISC')
    }
  },
}
