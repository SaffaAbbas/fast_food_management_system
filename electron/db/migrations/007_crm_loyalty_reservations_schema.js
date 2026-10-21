import crypto from 'node:crypto'

function uuid() {
  return crypto.randomUUID()
}

/**
 * Migration 007: Customer CRM, Loyalty Transactions, Reservations & Promotions (Sections 9, 18, 19)
 * Adds:
 * - Customer tags (VIP, Regular, Corporate), credit balance, birth date
 * - Traceable loyalty transactions ledger
 * - Enhanced reservation fields (linked customer, duration, deposit)
 * - Promotional coupons engine
 * - Seed default promo coupons and sample CRM data
 */
export const migration007 = {
  version: 7,
  name: 'crm_loyalty_reservations_schema',
  up: (db) => {
    // 1. Enhance customers table
    const customerCols = [
      "tag TEXT DEFAULT 'REGULAR'",
      'credit_balance_cents INTEGER DEFAULT 0',
      'birth_date TEXT',
      'is_active INTEGER DEFAULT 1',
    ]
    for (const col of customerCols) {
      try {
        db.exec(`ALTER TABLE customers ADD COLUMN ${col};`)
      } catch (e) {}
    }

    // 2. Loyalty Transactions Ledger
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
    `)

    // 3. Enhance reservations table
    const reservationCols = [
      'customer_id TEXT REFERENCES customers(id)',
      'reservation_date TEXT',
      'duration_minutes INTEGER DEFAULT 90',
      'deposit_cents INTEGER DEFAULT 0',
      'deposit_payment_method TEXT',
      'updated_at TEXT',
    ]
    for (const col of reservationCols) {
      try {
        db.exec(`ALTER TABLE reservations ADD COLUMN ${col};`)
      } catch (e) {}
    }

    // 4. Coupons & Promotions Engine
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
    `)

    // 5. Seed default coupons if branch exists
    const branch = db.prepare('SELECT id FROM branches LIMIT 1').get()
    if (branch?.id) {
      const now = new Date().toISOString()
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, ?, ?)
        `)

        for (const c of defaultCoupons) {
          insertCoupon.run(
            uuid(),
            branch.id,
            c.code,
            c.title,
            c.type,
            c.val,
            c.min,
            c.max,
            '2026-01-01',
            '2026-12-31',
            now,
            now
          )
        }
      }
    }
  },
}
