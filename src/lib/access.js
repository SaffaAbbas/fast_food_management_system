export function userCan(user, permissionCode) {
  if (!user || !permissionCode) return false
  const role = user.roleCode || user.role_code
  if (role === 'super_admin') return true
  return (user.permissions || []).includes(permissionCode)
}

export function homeModuleFor(user) {
  const role = user?.roleCode || user?.role_code
  const map = {
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
  return map[role] || 'dashboard'
}
