import { net } from 'electron'
import { WebSocket } from 'ws'
import { createClient } from '@supabase/supabase-js'
import { getDb } from '../db/index.js'
import { queueLocalSnapshot } from '../db/outbox.js'

if (typeof globalThis.WebSocket !== 'function') {
  globalThis.WebSocket = WebSocket
}
import { getSyncConfig, setMeta, countOutbox, getDeviceId } from './config.js'
import { buildEntityPayload } from './payloads.js'
import { applyRemoteRecord } from './applyRemote.js'

const TABLE = 'pos_sync_records'
const BATCH = 40
const MAX_RETRY = 8

let mainWindow = null
let timer = null
let running = false
let lastStatus = {
  online: false,
  enabled: false,
  configured: false,
  pending: 0,
  failed: 0,
  lastSyncedAt: null,
  lastError: null,
  message: 'Cloud sync is off. POS still works on this PC.',
}

function emit() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('db:sync-status', lastStatus)
  }
}

function refreshCounts(cfg) {
  lastStatus.enabled = Boolean(cfg.enabled)
  lastStatus.configured = Boolean(cfg.url && cfg.key)
  lastStatus.pending = countOutbox('PENDING')
  lastStatus.failed = countOutbox('FAILED')
  lastStatus.lastSyncedAt = cfg.lastSyncedAt
  lastStatus.lastError = cfg.lastError
}

async function probeOnline(cfg) {
  if (!net.isOnline()) return false
  if (!cfg.url) return net.isOnline()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(`${cfg.url.replace(/\/$/, '')}/auth/v1/health`, {
      method: 'GET',
      signal: controller.signal,
    })
    clearTimeout(timeout)
    return res.ok || res.status === 401 || res.status === 404
  } catch {
    return false
  }
}

function markOutbox(id, status, errorMessage = null) {
  const db = getDb()
  const now = new Date().toISOString()
  if (status === 'SYNCED') {
    db.prepare(`
      UPDATE sync_outbox SET status = 'SYNCED', error_message = NULL, synced_at = ? WHERE id = ?
    `).run(now, id)
    return
  }
  db.prepare(`
    UPDATE sync_outbox
    SET status = ?, retry_count = retry_count + 1, error_message = ?
    WHERE id = ?
  `).run(status, errorMessage, id)
}

async function pushOutbox(client, cfg) {
  const db = getDb()
  const rows = db.prepare(`
    SELECT * FROM sync_outbox
    WHERE status IN ('PENDING', 'FAILED') AND retry_count < ?
    ORDER BY created_at ASC
    LIMIT ?
  `).all(MAX_RETRY, BATCH)

  for (const row of rows) {
    const live = buildEntityPayload(row.entity_type, row.entity_id)
    let payload
    try {
      payload = live || JSON.parse(row.payload_json || '{}')
    } catch {
      payload = { raw: row.payload_json }
    }

    const record = {
      id: `${row.entity_type}:${row.entity_id}`,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      operation: row.operation,
      payload,
      device_id: cfg.deviceId,
      updated_at: new Date().toISOString(),
    }

    const { error } = await client.from(TABLE).upsert(record, { onConflict: 'id' })
    if (error) {
      const nextStatus = row.retry_count + 1 >= MAX_RETRY ? 'FAILED' : 'PENDING'
      markOutbox(row.id, nextStatus, error.message)
    } else {
      markOutbox(row.id, 'SYNCED')
    }
  }
}

async function pullRemote(client, cfg) {
  const since = cfg.lastPullAt || '1970-01-01T00:00:00.000Z'
  const { data, error } = await client
    .from(TABLE)
    .select('*')
    .gt('updated_at', since)
    .neq('device_id', cfg.deviceId)
    .order('updated_at', { ascending: true })
    .limit(200)

  if (error) throw new Error(error.message)

  let newest = since
  for (const record of data || []) {
    applyRemoteRecord(record)
    if (record.updated_at > newest) newest = record.updated_at
  }
  if (newest !== since) setMeta('last_pull_at', newest)
}

export function getSyncStatus() {
  refreshCounts(getSyncConfig())
  return { ...lastStatus, deviceId: getDeviceId() }
}

export async function runSyncCycle({ retryFailed = false } = {}) {
  if (running) return lastStatus
  running = true
  if (retryFailed) {
    getDb().prepare(`UPDATE sync_outbox SET status = 'PENDING', retry_count = 0 WHERE status = 'FAILED'`).run()
  }
  const cfg = getSyncConfig()
  refreshCounts(cfg)

  try {
    const online = await probeOnline(cfg)
    lastStatus.online = online

    if (!cfg.enabled || !cfg.url || !cfg.key) {
      lastStatus.message = cfg.enabled
        ? 'Add your Supabase URL and key in Settings → Cloud sync.'
        : 'Working fully offline on this PC. Enable cloud sync when you want a backup.'
      emit()
      return lastStatus
    }

    if (!online) {
      lastStatus.message = `Offline. ${lastStatus.pending} change(s) waiting to sync.`
      emit()
      return lastStatus
    }

    const client = createClient(cfg.url, cfg.key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WebSocket },
    })
    queueLocalSnapshot()
    refreshCounts(getSyncConfig())
    await pushOutbox(client, cfg)
    await pullRemote(client, getSyncConfig())

    const syncedAt = new Date().toISOString()
    setMeta('last_synced_at', syncedAt)
    setMeta('last_error', '')
    refreshCounts(getSyncConfig())
    lastStatus.online = true
    lastStatus.lastSyncedAt = syncedAt
    lastStatus.lastError = null
    lastStatus.message = lastStatus.pending
      ? `Online. ${lastStatus.pending} still queued.`
      : 'Online and synced with Supabase.'
  } catch (err) {
    const message = err.message || 'Sync failed'
    setMeta('last_error', message)
    lastStatus.lastError = message
    lastStatus.message = `Sync error: ${message}`
  } finally {
    running = false
    emit()
  }

  return lastStatus
}

export function startSyncScheduler(win) {
  mainWindow = win
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    runSyncCycle().catch((err) => console.warn('[Sync]', err.message))
  }, 20000)
  runSyncCycle().catch((err) => console.warn('[Sync]', err.message))
}

export function stopSyncScheduler() {
  if (timer) clearInterval(timer)
  timer = null
}
