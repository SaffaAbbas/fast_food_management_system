import crypto from 'node:crypto'

/**
 * Local outbox for a future cloud sync layer, plus extra permission codes
 * for reservations, delivery, expenses, and cash drawer.
 */
export const migration010 = {
  version: 10,
  name: 'sync_outbox_and_granular_permissions',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sync_metadata (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT,
        updated_at TEXT NOT NULL
      );
    `)

    const extraPermissions = [
      ['reservations:manage', 'Manage Reservations', 'RESERVATIONS'],
      ['delivery:manage', 'Manage Delivery & Riders', 'DELIVERY'],
      ['expenses:manage', 'Manage Expenses', 'EXPENSES'],
      ['cash:manage', 'Manage Cash Drawer', 'CASH'],
    ]

    const now = new Date().toISOString()
    for (const [code, name, module] of extraPermissions) {
      const existing = db.prepare('SELECT id FROM permissions WHERE code = ?').get(code)
      let permId = existing?.id
      if (!permId) {
        permId = crypto.randomUUID()
        db.prepare('INSERT INTO permissions (id, code, name, module, description) VALUES (?, ?, ?, ?, ?)')
          .run(permId, code, name, module, name)
      }

      const roleCodes = ['super_admin', 'branch_admin', 'manager']
      if (code === 'reservations:manage') roleCodes.push('receptionist')
      if (code === 'delivery:manage') roleCodes.push('delivery_rider', 'cashier')
      if (code === 'expenses:manage') roleCodes.push('accountant')
      if (code === 'cash:manage') roleCodes.push('cashier')

      for (const roleCode of roleCodes) {
        const role = db.prepare('SELECT id FROM roles WHERE code = ?').get(roleCode)
        if (role) {
          db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)')
            .run(role.id, permId)
        }
      }
    }

    db.prepare(`
      INSERT INTO sync_metadata (setting_key, setting_value, updated_at)
      VALUES ('cloud_sync_enabled', '0', ?)
      ON CONFLICT(setting_key) DO NOTHING
    `).run(now)
  },
}

