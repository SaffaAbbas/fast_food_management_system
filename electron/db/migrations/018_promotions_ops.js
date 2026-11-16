/**
 * Migration 018: promotions — scoped discounts, BXGY, happy hour, segments, redemptions
 */
import crypto from 'node:crypto'
import { applyRoleMatrix } from '../rbac.js'

export const migration018 = {
  version: 18,
  name: 'promotions_ops',
  up: (db) => {
    const add = (table, col, def) => {
      try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`)
      } catch (e) {}
    }

    add('coupons', 'applies_to', "TEXT DEFAULT 'ALL'")
    add('coupons', 'target_id', 'TEXT')
    add('coupons', 'buy_qty', 'INTEGER DEFAULT 0')
    add('coupons', 'get_qty', 'INTEGER DEFAULT 0')
    add('coupons', 'get_product_id', 'TEXT')
    add('coupons', 'start_time', 'TEXT')
    add('coupons', 'end_time', 'TEXT')
    add('coupons', 'days_of_week', 'TEXT')
    add('coupons', 'customer_segment', "TEXT DEFAULT 'ALL'")
    add('coupons', 'is_auto_apply', 'INTEGER DEFAULT 0')
    add('coupons', 'per_customer_limit', 'INTEGER DEFAULT 0')
    add('orders', 'coupon_id', 'TEXT')
    add('orders', 'coupon_code', 'TEXT')
    add('combos', 'available_from_time', 'TEXT')
    add('combos', 'available_to_time', 'TEXT')

    try {
      applyRoleMatrix(db)
    } catch (e) {}

    db.exec(`
      CREATE TABLE IF NOT EXISTS coupon_redemptions (
        id TEXT PRIMARY KEY,
        coupon_id TEXT NOT NULL,
        order_id TEXT,
        customer_id TEXT,
        discount_cents INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON coupon_redemptions(coupon_id);
      CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_order ON coupon_redemptions(order_id);
      CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_customer ON coupon_redemptions(customer_id);
    `)

    const branch = db.prepare('SELECT id FROM branches LIMIT 1').get()
    if (!branch?.id) return
    const now = new Date().toISOString()
    const exists = (code) => db.prepare('SELECT id FROM coupons WHERE code = ?').get(code)
    const insert = db.prepare(`
      INSERT INTO coupons (
        id, branch_id, code, title, discount_type, discount_value,
        min_order_cents, max_discount_cents, start_date, end_date,
        usage_limit, times_used, is_active, customer_id, applies_to, target_id,
        buy_qty, get_qty, get_product_id, start_time, end_time, days_of_week,
        customer_segment, is_auto_apply, per_customer_limit, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, 0, 1, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    if (!exists('HAPPYHOUR')) {
      insert.run(
        crypto.randomUUID(),
        branch.id,
        'HAPPYHOUR',
        'Happy Hour 15% (4–7pm)',
        'PERCENTAGE',
        15,
        0,
        1500,
        'ALL',
        null,
        0,
        0,
        null,
        '16:00',
        '19:00',
        '0,1,2,3,4,5,6',
        'ALL',
        1,
        0,
        now,
        now
      )
    }

    const product = db.prepare('SELECT id FROM products WHERE is_active = 1 LIMIT 1').get()
    if (product?.id && !exists('BUY2GET1')) {
      insert.run(
        crypto.randomUUID(),
        branch.id,
        'BUY2GET1',
        'Buy 2 Get 1 Free',
        'BOGO',
        0,
        0,
        null,
        'PRODUCT',
        product.id,
        2,
        1,
        product.id,
        null,
        null,
        null,
        'ALL',
        0,
        0,
        now,
        now
      )
    }

    const category = db.prepare('SELECT id FROM categories WHERE is_active = 1 LIMIT 1').get()
    if (category?.id && !exists('CAT10')) {
      insert.run(
        crypto.randomUUID(),
        branch.id,
        'CAT10',
        '10% off category',
        'PERCENTAGE',
        10,
        0,
        800,
        'CATEGORY',
        category.id,
        0,
        0,
        null,
        null,
        null,
        null,
        'ALL',
        0,
        0,
        now,
        now
      )
    }

    if (!exists('VIPONLY')) {
      insert.run(
        crypto.randomUUID(),
        branch.id,
        'VIPONLY',
        'VIP 12% off',
        'PERCENTAGE',
        12,
        2000,
        1000,
        'ALL',
        null,
        0,
        0,
        null,
        null,
        null,
        null,
        'VIP',
        0,
        0,
        now,
        now
      )
    }
  },
}
