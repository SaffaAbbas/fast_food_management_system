export const migration009 = {
  version: 9,
  name: 'refunds_financial_integrity',
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
    `)

    const orderCols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name)
    if (!orderCols.includes('refunded_cents')) {
      db.exec('ALTER TABLE orders ADD COLUMN refunded_cents INTEGER DEFAULT 0')
    }
    if (!orderCols.includes('loyalty_awarded')) {
      db.exec('ALTER TABLE orders ADD COLUMN loyalty_awarded INTEGER DEFAULT 0')
    }
    if (!orderCols.includes('stock_posted')) {
      db.exec('ALTER TABLE orders ADD COLUMN stock_posted INTEGER DEFAULT 0')
    }
  },
}
