/**
 * Migration 016: stock conversions, reserved/avg cost, recipe versions/active flag
 */
export const migration016 = {
  version: 16,
  name: 'inventory_recipe_ops',
  up: (db) => {
    const itemCols = [
      ['opening_stock', 'REAL DEFAULT 0'],
      ['reorder_level', 'REAL'],
      ['reserved_stock', 'REAL DEFAULT 0'],
      ['avg_cost_cents', 'INTEGER'],
      ['conversion_factor', 'REAL'],
      ['conversion_unit_id', 'TEXT'],
    ]
    for (const [name, def] of itemCols) {
      try {
        db.exec(`ALTER TABLE inventory_items ADD COLUMN ${name} ${def};`)
      } catch (e) {}
    }

    try {
      db.exec('ALTER TABLE recipes ADD COLUMN is_active INTEGER DEFAULT 1;')
    } catch (e) {}
    try {
      db.exec('ALTER TABLE recipes ADD COLUMN version INTEGER DEFAULT 1;')
    } catch (e) {}
    try {
      db.exec('ALTER TABLE recipes ADD COLUMN deactivated_at TEXT;')
    } catch (e) {}

    db.exec(`
      CREATE TABLE IF NOT EXISTS recipe_versions (
        id TEXT PRIMARY KEY,
        recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        product_id TEXT,
        yield_quantity REAL,
        notes TEXT,
        ingredients_json TEXT NOT NULL,
        food_cost_cents INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `)

    db.exec(`
      CREATE TABLE IF NOT EXISTS inventory_unit_conversions (
        id TEXT PRIMARY KEY,
        from_unit_id TEXT NOT NULL REFERENCES inventory_units(id),
        to_unit_id TEXT NOT NULL REFERENCES inventory_units(id),
        factor REAL NOT NULL,
        created_at TEXT NOT NULL
      );
    `)

    const extraUnits = [
      ['Millilitre', 'ml'],
      ['Pack', 'pack'],
      ['Box', 'box'],
    ]
    const insertUnit = db.prepare(
      'INSERT INTO inventory_units (id, name, abbreviation) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM inventory_units WHERE abbreviation = ?)'
    )
    for (const [name, abbr] of extraUnits) {
      insertUnit.run(`unit-${abbr}`, name, abbr, abbr)
    }

    try {
      db.exec(`
        UPDATE inventory_items
        SET avg_cost_cents = COALESCE(avg_cost_cents, cost_per_unit_cents),
            opening_stock = COALESCE(opening_stock, current_stock),
            reorder_level = COALESCE(reorder_level, minimum_level)
      `)
    } catch (e) {}

    try {
      db.prepare(`
        INSERT INTO system_settings (setting_key, setting_value, category, description, updated_at)
        SELECT 'recipe_auto_deduct', '1', 'inventory', 'Deduct recipe ingredients when an order is paid', ?
        WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE setting_key = 'recipe_auto_deduct')
      `).run(new Date().toISOString())
    } catch (e) {}
  },
}
