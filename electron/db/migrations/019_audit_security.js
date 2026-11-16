import crypto from 'node:crypto'
import { applyRoleMatrix } from '../rbac.js'

export const migration019 = {
  version: 19,
  name: 'audit_security',
  up: (db) => {
    try {
      applyRoleMatrix(db)
    } catch (e) {}
    try {
      db.prepare(`
        INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
        VALUES (?, NULL, NULL, 'PERMISSION_CHANGE', 'ROLE_MATRIX', 'system', ?, ?)
      `).run(
        crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
        JSON.stringify({ source: 'migration019', added: 'audit:view' }),
        new Date().toISOString()
      )
    } catch (e) {}
  },
}
