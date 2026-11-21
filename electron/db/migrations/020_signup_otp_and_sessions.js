import crypto from 'node:crypto'

function addColumn(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString('hex')
  const derived = crypto.scryptSync(String(secret), salt, 64).toString('hex')
  return `${salt}:${derived}`
}

export const migration020 = {
  version: 20,
  name: 'signup_otp_and_sessions',
  up: (db) => {
    addColumn(db, 'users', 'email', 'TEXT')
    addColumn(db, 'users', 'email_verified', 'INTEGER DEFAULT 0')

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
        ON users(lower(email))
        WHERE email IS NOT NULL AND trim(email) != '';

      CREATE TABLE IF NOT EXISTS signup_otps (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        display_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role_id TEXT NOT NULL,
        otp_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        resend_available_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        method TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
    `)

    const now = new Date().toISOString()
    const demoPasswords = [
      ['waiter1', 'waiter123'],
      ['chef1', 'chef123'],
    ]
    for (const [username, password] of demoPasswords) {
      const row = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(username)
      if (row && !row.password_hash) {
        db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
          .run(hashSecret(password), now, row.id)
      }
    }
  },
}
