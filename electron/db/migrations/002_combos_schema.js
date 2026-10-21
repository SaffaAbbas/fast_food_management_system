/**
 * Migration 002: Combos & Deals Schema
 * Adds combo meals and bundle deal pricing support
 */
export const migration002 = {
  version: 2,
  name: 'combos_and_deals_schema',
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
    `)
  },
}
