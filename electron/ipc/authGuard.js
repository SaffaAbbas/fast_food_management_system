import { authRepository } from '../db/repositories/authRepository.js'
import { getDb } from '../db/index.js'

export function requireSession() {
  const session = authRepository.getCurrentSession()
  if (!session) {
    throw new Error('Unauthorized: Please sign in.')
  }
  return session
}

export function requirePermission(permCode) {
  const session = requireSession()
  if (session.roleCode === 'super_admin') return session
  if (!session.permissions?.includes(permCode)) {
    throw new Error(`Unauthorized: Requires '${permCode}' permission.`)
  }
  return session
}

export function requireAnyPermission(permCodes) {
  const session = requireSession()
  if (session.roleCode === 'super_admin') return session
  const ok = permCodes.some((code) => session.permissions?.includes(code))
  if (!ok) {
    throw new Error(`Unauthorized: Requires one of: ${permCodes.join(', ')}`)
  }
  return session
}

export function requireRole(...roleCodes) {
  const session = requireSession()
  if (session.roleCode === 'super_admin') return session
  if (!roleCodes.includes(session.roleCode)) {
    throw new Error(`Unauthorized: Requires role ${roleCodes.join(' or ')}.`)
  }
  return session
}

export function getActiveBranchId(providedBranchId) {
  const session = authRepository.getCurrentSession()
  if (session && session.roleCode !== 'super_admin' && session.branchId) {
    return session.branchId
  }
  if (providedBranchId) return providedBranchId
  if (session?.branchId) return session.branchId
  const db = getDb()
  return db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
}

export function assertPermission(permCode) {
  return requirePermission(permCode)
}
