/**
 * Migration 015: KDS delay/loyalty settings, customer discounts, notifications, coupon targeting
 */
export const migration015 = {
  version: 15,
  name: 'kds_crm_delivery_ops',
  up: (db) => {
    try {
      db.exec('ALTER TABLE customers ADD COLUMN discount_percent REAL DEFAULT 0;')
    } catch (e) {}
    try {
      db.exec('ALTER TABLE coupons ADD COLUMN customer_id TEXT;')
    } catch (e) {}

    db.exec(`
      CREATE TABLE IF NOT EXISTS customer_notifications (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id),
        order_id TEXT,
        channel TEXT DEFAULT 'IN_APP',
        message TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)

    const now = new Date().toISOString()
    const seeds = [
      ['kds_delay_minutes', '15', 'KITCHEN'],
      ['loyalty_earn_per_dollar', '1', 'LOYALTY'],
      ['loyalty_redeem_min', '50', 'LOYALTY'],
      ['loyalty_cents_per_point', '1', 'LOYALTY'],
      ['notify_customer_on_status', '1', 'CRM'],
      ['auto_print_kds', '0', 'KITCHEN'],
    ]
    const insert = db.prepare(`
      INSERT OR IGNORE INTO system_settings (setting_key, setting_value, category, updated_at)
      VALUES (?, ?, ?, ?)
    `)
    for (const [key, value, category] of seeds) {
      insert.run(key, value, category, now)
    }
  },
}
