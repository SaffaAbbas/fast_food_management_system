import { app } from 'electron'
import { initDatabase, getDb } from './index.js'

app.whenReady().then(() => {
  initDatabase()
  const db = getDb()
  const outbox = db.prepare(`
    SELECT status, COUNT(*) AS n FROM sync_outbox GROUP BY status
  `).all()
  const samples = db.prepare(`
    SELECT entity_type, operation, status, created_at FROM sync_outbox
    ORDER BY created_at DESC LIMIT 8
  `).all()
  const counts = {
    orders: db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,
    products: db.prepare('SELECT COUNT(*) AS n FROM products').get().n,
    customers: db.prepare('SELECT COUNT(*) AS n FROM customers').get().n,
  }
  console.log(JSON.stringify({ counts, outbox, samples }, null, 2))
  app.quit()
})
