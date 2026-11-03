import { app } from 'electron'
import { initDatabase } from './index.js'
import { saveSyncConfig, getSyncConfig } from '../sync/config.js'

app.whenReady().then(() => {
  initDatabase()
  const fromEnv = getSyncConfig()
  const enabled = Boolean(fromEnv.url && fromEnv.key)
  const saved = saveSyncConfig({
    key: fromEnv.key,
    url: fromEnv.url,
    enabled,
  })
  console.log(JSON.stringify({
    hasKey: saved.hasKey,
    hasUrl: Boolean(saved.url),
    enabled: saved.enabled,
  }))
  app.quit()
})
