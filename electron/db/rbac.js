import crypto from 'node:crypto'

export const ROLE_DEFS = [
  { code: 'super_admin', name: 'Super Administrator', desc: 'All branches, all modules, system configuration' },
  { code: 'branch_admin', name: 'Branch Admin / Owner', desc: 'Full branch management, reports, inventory, staff' },
  { code: 'manager', name: 'Manager', desc: 'Orders, tables, inventory, staff, reports, expenses' },
  { code: 'cashier', name: 'Cashier', desc: 'POS, orders, payments, customer lookup' },
  { code: 'waiter', name: 'Waiter', desc: 'Tables, dine-in orders, customer lookup' },
  { code: 'kitchen_staff', name: 'Kitchen Staff', desc: 'Kitchen display and preparation statuses' },
  { code: 'inventory_officer', name: 'Inventory Officer', desc: 'Inventory, purchases, vendors, stock adjustments' },
  { code: 'accountant', name: 'Accountant', desc: 'Expenses, payments, settlements, financial reports' },
  { code: 'delivery_rider', name: 'Delivery Rider', desc: 'Assigned deliveries and delivery status' },
  { code: 'receptionist', name: 'Reception / Reservation', desc: 'Reservations, customers, tables' },
]

export const PERMISSION_DEFS = [
  { code: 'dashboard:view', name: 'View dashboard', module: 'DASHBOARD' },
  { code: 'pos:create_order', name: 'Create and send orders', module: 'POS' },
  { code: 'pos:process_payment', name: 'Take payments', module: 'POS' },
  { code: 'pos:apply_discount', name: 'Apply discounts', module: 'POS' },
  { code: 'pos:process_refund', name: 'Process refunds', module: 'POS' },
  { code: 'pos:print_receipt', name: 'Print and reprint receipts', module: 'POS' },
  { code: 'pos:void_order', name: 'Cancel / void orders', module: 'POS' },
  { code: 'pos:void_prepared', name: 'Cancel orders after kitchen has started', module: 'POS' },
  { code: 'menu:manage', name: 'Manage menu and recipes', module: 'MENU' },
  { code: 'inventory:manage', name: 'Manage inventory and purchases', module: 'INVENTORY' },
  { code: 'inventory:adjust', name: 'Adjust stock quantities', module: 'INVENTORY' },
  { code: 'reports:view', name: 'View reports', module: 'REPORTS' },
  { code: 'audit:view', name: 'View security audit log', module: 'SECURITY' },
  { code: 'staff:manage', name: 'Manage staff login accounts', module: 'STAFF' },
  { code: 'users:delete', name: 'Delete user accounts', module: 'STAFF' },
  { code: 'settings:manage', name: 'Global / system configuration', module: 'SETTINGS' },
  { code: 'settings:branch', name: 'Branch tax, charges, receipt settings', module: 'SETTINGS' },
  { code: 'kitchen:view', name: 'Kitchen display', module: 'KITCHEN' },
  { code: 'reservations:manage', name: 'Manage reservations', module: 'RESERVATIONS' },
  { code: 'delivery:manage', name: 'Manage delivery dispatch', module: 'DELIVERY' },
  { code: 'delivery:assigned', name: 'Update assigned deliveries', module: 'DELIVERY' },
  { code: 'expenses:manage', name: 'Manage expenses', module: 'EXPENSES' },
  { code: 'cash:manage', name: 'Cash drawer and settlements', module: 'CASH' },
  { code: 'customers:view', name: 'Look up customers', module: 'CRM' },
  { code: 'customers:manage', name: 'Create and edit customers', module: 'CRM' },
  { code: 'tables:view', name: 'View and seat tables', module: 'TABLES' },
  { code: 'tables:manage', name: 'Manage table layout', module: 'TABLES' },
]

const BRANCH_OPS = [
  'dashboard:view',
  'pos:create_order',
  'pos:process_payment',
  'pos:apply_discount',
  'pos:process_refund',
  'pos:print_receipt',
  'pos:void_order',
  'pos:void_prepared',
  'menu:manage',
  'inventory:manage',
  'inventory:adjust',
  'reports:view',
  'audit:view',
  'staff:manage',
  'kitchen:view',
  'reservations:manage',
  'delivery:manage',
  'delivery:assigned',
  'expenses:manage',
  'cash:manage',
  'customers:view',
  'customers:manage',
  'tables:view',
  'tables:manage',
  'settings:branch',
]

export const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  branch_admin: BRANCH_OPS,
  manager: BRANCH_OPS.filter((code) => code !== 'settings:branch' && code !== 'users:delete'),
  cashier: [
    'dashboard:view',
    'pos:create_order',
    'pos:process_payment',
    'pos:print_receipt',
    'pos:void_order',
    'customers:view',
    'tables:view',
    'cash:manage',
  ],
  waiter: [
    'pos:create_order',
    'pos:print_receipt',
    'tables:view',
    'customers:view',
  ],
  kitchen_staff: ['kitchen:view'],
  inventory_officer: [
    'dashboard:view',
    'inventory:manage',
    'inventory:adjust',
  ],
  accountant: [
    'dashboard:view',
    'reports:view',
    'audit:view',
    'expenses:manage',
    'cash:manage',
  ],
  delivery_rider: ['delivery:assigned'],
  receptionist: [
    'dashboard:view',
    'reservations:manage',
    'customers:view',
    'customers:manage',
    'tables:view',
    'tables:manage',
  ],
}

export const ROLE_HOME = {
  super_admin: 'dashboard',
  branch_admin: 'dashboard',
  manager: 'dashboard',
  cashier: 'pos',
  waiter: 'tables',
  kitchen_staff: 'kitchen',
  inventory_officer: 'inventory',
  accountant: 'reports',
  delivery_rider: 'delivery',
  receptionist: 'reservations',
}

export function applyRoleMatrix(db) {
  const now = new Date().toISOString()
  const roleIds = {}

  for (const role of ROLE_DEFS) {
    let row = db.prepare('SELECT id FROM roles WHERE code = ?').get(role.code)
    if (!row) {
      const id = crypto.randomUUID()
      db.prepare(`
        INSERT INTO roles (id, code, name, description, is_system, created_at)
        VALUES (?, ?, ?, ?, 1, ?)
      `).run(id, role.code, role.name, role.desc, now)
      roleIds[role.code] = id
    } else {
      db.prepare('UPDATE roles SET name = ?, description = ? WHERE id = ?')
        .run(role.name, role.desc, row.id)
      roleIds[role.code] = row.id
    }
  }

  const permIds = {}
  for (const perm of PERMISSION_DEFS) {
    let row = db.prepare('SELECT id FROM permissions WHERE code = ?').get(perm.code)
    if (!row) {
      const id = crypto.randomUUID()
      db.prepare(`
        INSERT INTO permissions (id, code, name, module, description)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, perm.code, perm.name, perm.module, perm.name)
      permIds[perm.code] = id
    } else {
      permIds[perm.code] = row.id
    }
  }

  const systemRoleIds = Object.values(roleIds)
  if (systemRoleIds.length) {
    db.prepare(`
      DELETE FROM role_permissions
      WHERE role_id IN (${systemRoleIds.map(() => '?').join(',')})
    `).run(...systemRoleIds)
  }

  const insert = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)')

  for (const [roleCode, codes] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleIds[roleCode]
    if (!roleId) continue
    const list = codes.includes('*') ? PERMISSION_DEFS.map((p) => p.code) : codes
    for (const code of list) {
      const permId = permIds[code]
      if (permId) insert.run(roleId, permId)
    }
  }

  return { roleIds, permIds }
}
