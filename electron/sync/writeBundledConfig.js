import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const envPath = path.join(root, '.env')
const outDir = path.join(root, 'build')
const outFile = path.join(outDir, 'sync-config.json')

function readEnv(file) {
  const map = {}
  if (!fs.existsSync(file)) return map
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    map[trimmed.slice(0, eq).trim()] = value
  }
  return map
}

const env = readEnv(envPath)
const payload = {
  SUPABASE_URL: env.SUPABASE_URL || '',
  SUPABASE_KEY: env.SUPABASE_KEY || '',
}
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`)
const ready = Boolean(payload.SUPABASE_URL && payload.SUPABASE_KEY)
console.log(ready
  ? '[sync-config] bundled Supabase URL + key for the Windows installer (file is gitignored).'
  : '[sync-config] wrote empty bundle — restaurant PCs must paste keys in Settings → Cloud sync.')
