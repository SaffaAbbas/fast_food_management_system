import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '../db/index.js'

function applyEnvPair(name, value) {
  if (!name || value == null || value === '') return
  if (process.env[name] == null || process.env[name] === '') {
    process.env[name] = String(value)
  }
}

function loadBundledJson() {
  const candidates = [
    process.resourcesPath && path.join(process.resourcesPath, 'sync-config.json'),
    process.env.APP_ROOT && path.join(process.env.APP_ROOT, 'build', 'sync-config.json'),
    path.join(process.cwd(), 'build', 'sync-config.json'),
  ].filter(Boolean)
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
      applyEnvPair('SUPABASE_URL', parsed.SUPABASE_URL || parsed.url)
      applyEnvPair('SUPABASE_KEY', parsed.SUPABASE_KEY || parsed.key)
      break
    } catch {
      /* ignore */
    }
  }
}

export function loadDotEnv() {
  loadBundledJson()
  const candidates = [
    process.env.APP_ROOT && path.join(process.env.APP_ROOT, '.env'),
    path.join(process.cwd(), '.env'),
    process.resourcesPath && path.join(process.resourcesPath, '.env'),
  ].filter(Boolean)
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue
      const text = fs.readFileSync(file, 'utf8')
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq < 1) continue
        const name = trimmed.slice(0, eq).trim()
        let value = trimmed.slice(eq + 1).trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        applyEnvPair(name, value)
      }
      break
    } catch {
      /* ignore missing env file */
    }
  }
}

/** Turn cloud sync on whenever URL+key exist, unless the user turned it off. */
export function ensureCloudSyncReady() {
  loadDotEnv()
  const url = (getMeta('supabase_url', '') || process.env.SUPABASE_URL || '').trim()
  const key = (getMeta('supabase_key', '') || process.env.SUPABASE_KEY || '').trim()
  if (!url || !key) return getSyncConfig()
  if (getMeta('cloud_sync_disabled_by_user') === '1') return getSyncConfig()
  setMeta('cloud_sync_enabled', '1')
  if (!getMeta('supabase_url')) setMeta('supabase_url', url)
  if (!getMeta('supabase_key')) setMeta('supabase_key', key)
  return getSyncConfig()
}

function nowIso() {
  return new Date().toISOString()
}

export function getMeta(key, fallback = null) {
  const db = getDb()
  const row = db.prepare('SELECT setting_value FROM sync_metadata WHERE setting_key = ?').get(key)
  return row ? row.setting_value : fallback
}

export function setMeta(key, value) {
  const db = getDb()
  db.prepare(`
    INSERT INTO sync_metadata (setting_key, setting_value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at
  `).run(key, value == null ? null : String(value), nowIso())
}

export function getDeviceId() {
  let id = getMeta('device_id')
  if (!id) {
    id = crypto.randomUUID()
    setMeta('device_id', id)
  }
  return id
}

export function getSyncConfig() {
  loadDotEnv()
  const enabled = getMeta('cloud_sync_enabled', '0') === '1'
  const url = (getMeta('supabase_url', '') || process.env.SUPABASE_URL || '').trim()
  const key = (getMeta('supabase_key', '') || process.env.SUPABASE_KEY || '').trim()
  return {
    enabled,
    url,
    key,
    hasKey: Boolean(key),
    deviceId: getDeviceId(),
    lastSyncedAt: getMeta('last_synced_at'),
    lastPullAt: getMeta('last_pull_at'),
    lastError: getMeta('last_error'),
  }
}

export function saveSyncConfig({ enabled, url, key }) {
  if (typeof enabled === 'boolean') {
    setMeta('cloud_sync_enabled', enabled ? '1' : '0')
    setMeta('cloud_sync_disabled_by_user', enabled ? '0' : '1')
  }
  if (url !== undefined) setMeta('supabase_url', (url || '').trim())
  if (key !== undefined && key !== '') setMeta('supabase_key', key.trim())
  return getSyncConfig()
}

export function countOutbox(status = 'PENDING') {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) AS n FROM sync_outbox WHERE status = ?').get(status)
  return row?.n || 0
}
