import { getDb } from '../index.js'

export const settingsRepository = {
  getAll: () => {
    const db = getDb()
    const rows = db.prepare('SELECT setting_key, setting_value, category, description, updated_at FROM system_settings').all()
    const settings = {}
    for (const r of rows) {
      settings[r.setting_key] = r.setting_value
    }
    return settings
  },

  get: (key) => {
    const db = getDb()
    const row = db.prepare('SELECT setting_value FROM system_settings WHERE setting_key = ?').get(key)
    return row ? row.setting_value : null
  },

  set: (key, value, category = 'GENERAL') => {
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO system_settings (setting_key, setting_value, category, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        category = excluded.category,
        updated_at = excluded.updated_at
    `).run(key, value, category, now)
    return true
  },
}
