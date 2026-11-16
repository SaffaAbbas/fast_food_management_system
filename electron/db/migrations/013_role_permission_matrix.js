import { applyRoleMatrix } from '../rbac.js'

function addColumn(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

export const migration013 = {
  version: 13,
  name: 'role_permission_matrix',
  up: (db) => {
    addColumn(db, 'riders', 'user_id', 'TEXT')
    applyRoleMatrix(db)
  },
}
