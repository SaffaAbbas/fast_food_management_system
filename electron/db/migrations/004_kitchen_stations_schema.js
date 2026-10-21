/**
 * Migration 004: Kitchen Display System (KDS) & Stations Schema (Section 7 Specification)
 * Adds:
 * - kitchen_stations table for multi-station kitchen routing (Grill, Pizza, Drinks, Expo, etc.)
 * - Station routing columns on products and order_items
 * - Item-level cooking timestamps (started_cooking_at, completed_cooking_at)
 * - Order-level kitchen tracking timestamps (kitchen_accepted_at, kitchen_ready_at, kitchen_completed_at)
 * - Default kitchen stations seed data
 */
export const migration004 = {
  version: 4,
  name: 'kitchen_stations_schema',
  up: (db) => {
    // 1. Kitchen Stations Master Table
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
    `)

    // 2. Add kitchen station linkage to products
    try {
      db.exec('ALTER TABLE products ADD COLUMN kitchen_station_id TEXT REFERENCES kitchen_stations(id);')
    } catch (e) {}

    // 3. Add kitchen tracking columns to order_items
    try {
      db.exec('ALTER TABLE order_items ADD COLUMN kitchen_station_id TEXT REFERENCES kitchen_stations(id);')
    } catch (e) {}
    try {
      db.exec('ALTER TABLE order_items ADD COLUMN started_cooking_at TEXT;')
    } catch (e) {}
    try {
      db.exec('ALTER TABLE order_items ADD COLUMN completed_cooking_at TEXT;')
    } catch (e) {}

    // 4. Add kitchen tracking timestamps to orders
    try {
      db.exec('ALTER TABLE orders ADD COLUMN kitchen_accepted_at TEXT;')
    } catch (e) {}
    try {
      db.exec('ALTER TABLE orders ADD COLUMN kitchen_ready_at TEXT;')
    } catch (e) {}
    try {
      db.exec('ALTER TABLE orders ADD COLUMN kitchen_completed_at TEXT;')
    } catch (e) {}
    try {
      db.exec('ALTER TABLE orders ADD COLUMN target_prep_minutes INTEGER DEFAULT 15;')
    } catch (e) {}

    // 5. Seed default kitchen stations for default branch (BR-01)
    const branch = db.prepare('SELECT id FROM branches LIMIT 1').get()
    if (branch) {
      const existing = db.prepare('SELECT COUNT(*) as count FROM kitchen_stations WHERE branch_id = ?').get(branch.id)
      if (existing.count === 0) {
        const now = new Date().toISOString()
        const insertStation = db.prepare(`
          INSERT INTO kitchen_stations (id, branch_id, name, code, color_code, display_order, is_active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        `)

        insertStation.run('station-grill', branch.id, 'Grill & Fryer', 'GRILL', '#ef4444', 1, now)
        insertStation.run('station-pizza', branch.id, 'Pizza & Oven', 'PIZZA', '#f59e0b', 2, now)
        insertStation.run('station-bar', branch.id, 'Bar & Beverages', 'DRINKS', '#06b6d4', 3, now)
        insertStation.run('station-expo', branch.id, 'Packaging & Expo', 'EXPO', '#10b981', 4, now)
      }
    }
  },
}
