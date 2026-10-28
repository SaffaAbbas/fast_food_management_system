function addColumn(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

export const migration012 = {
  version: 12,
  name: 'roles_and_media_columns_guard',
  up: (db) => {
    addColumn(db, 'products', 'image_url', 'TEXT')
    addColumn(db, 'categories', 'image_url', 'TEXT')
    addColumn(db, 'combos', 'image_url', 'TEXT')
    addColumn(db, 'customers', 'image_url', 'TEXT')
    addColumn(db, 'employees', 'image_url', 'TEXT')
    addColumn(db, 'users', 'image_url', 'TEXT')
    addColumn(db, 'recipes', 'image_url', 'TEXT')
    addColumn(db, 'riders', 'image_url', 'TEXT')
    addColumn(db, 'inventory_items', 'image_url', 'TEXT')
    addColumn(db, 'branches', 'logo_url', 'TEXT')
    addColumn(db, 'roles', 'image_url', 'TEXT')
  },
}
