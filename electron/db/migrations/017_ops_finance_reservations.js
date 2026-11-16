/**
 * Migration 017: purchases GRN/returns, expenses approval, refunds items, reservations/orders link
 */
export const migration017 = {
  version: 17,
  name: 'ops_finance_reservations',
  up: (db) => {
    const add = (table, col, def) => {
      try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`)
      } catch (e) {}
    }

    add('suppliers', 'tax_id', 'TEXT')
    add('suppliers', 'payment_terms', 'TEXT')
    add('purchase_order_items', 'discount_cents', 'INTEGER DEFAULT 0')
    add('purchase_order_items', 'tax_cents', 'INTEGER DEFAULT 0')
    add('purchase_order_items', 'received_quantity', 'REAL DEFAULT 0')
    add('expenses', 'status', "TEXT DEFAULT 'APPROVED'")
    add('expenses', 'reference_number', 'TEXT')
    add('expenses', 'attachment_url', 'TEXT')
    add('expenses', 'is_recurring', 'INTEGER DEFAULT 0')
    add('expenses', 'recurrence', 'TEXT')
    add('expenses', 'approved_by_user_id', 'TEXT')
    add('expenses', 'cancelled_at', 'TEXT')
    add('expenses', 'cancel_reason', 'TEXT')
    add('orders', 'reservation_id', 'TEXT')
    add('refunds', 'refund_method', 'TEXT')
    add('employees', 'commission_percent', 'REAL DEFAULT 0')

    db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_returns (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL,
        supplier_id TEXT,
        po_id TEXT,
        amount_cents INTEGER DEFAULT 0,
        reason TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS purchase_return_items (
        id TEXT PRIMARY KEY,
        return_id TEXT NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
        inventory_item_id TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_cost_cents INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS refund_items (
        id TEXT PRIMARY KEY,
        refund_id TEXT NOT NULL REFERENCES refunds(id) ON DELETE CASCADE,
        order_item_id TEXT,
        quantity REAL NOT NULL,
        amount_cents INTEGER DEFAULT 0,
        reason TEXT
      );
    `)

    const now = new Date().toISOString()
    const settings = [
      ['expense_approval_threshold_cents', '50000', 'expenses', 'Expenses at or above this amount need approval'],
      ['cash_variance_approval_cents', '0', 'cash', 'Absolute variance above this requires manager approval'],
      ['credit_billing_enabled', '0', 'pos', 'Allow unpaid/credit billing'],
      ['refund_restock_default', '1', 'inventory', 'Default restock on refund'],
    ]
    const insertSetting = db.prepare(`
      INSERT INTO system_settings (setting_key, setting_value, category, description, updated_at)
      SELECT ?, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE setting_key = ?)
    `)
    for (const [k, v, cat, desc] of settings) {
      insertSetting.run(k, v, cat, desc, now, k)
    }

    try {
      db.exec(`
        UPDATE purchase_order_items
        SET received_quantity = quantity
        WHERE received_quantity IS NULL OR received_quantity = 0
      `)
      db.exec(`
        UPDATE purchase_order_items
        SET received_quantity = 0
        WHERE po_id IN (SELECT id FROM purchase_orders WHERE status = 'ORDERED')
      `)
    } catch (e) {}
  },
}
