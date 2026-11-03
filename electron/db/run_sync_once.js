import { app } from 'electron'
import { initDatabase } from './index.js'
import { runSyncCycle } from '../sync/engine.js'

app.whenReady().then(async () => {
  initDatabase()
  const status = await runSyncCycle({ retryFailed: true })
  console.log(JSON.stringify({
    online: status.online,
    enabled: status.enabled,
    pending: status.pending,
    failed: status.failed,
    message: status.message,
    lastError: status.lastError,
  }))
  app.quit()
})
