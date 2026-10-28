import { ipcMain, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { requireSession } from './authGuard.js'

function mediaDir() {
  const dir = path.join(app.getPath('userData'), 'media')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function safeId(id) {
  if (!id || !/^[a-zA-Z0-9._-]+$/.test(id)) {
    throw new Error('Invalid media identifier.')
  }
  return id
}

export function registerMediaHandlers() {
  ipcMain.handle('media:save', async (_event, { dataUrl, filename } = {}) => {
    requireSession()
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      throw new Error('A valid image data URL is required.')
    }
    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i)
    if (!match) throw new Error('Unsupported image type. Use PNG, JPEG, WEBP or GIF.')
    const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase()
    const buffer = Buffer.from(match[2], 'base64')
    if (buffer.length > 4 * 1024 * 1024) {
      throw new Error('Image must be 4 MB or smaller.')
    }
    const id = `${crypto.randomUUID()}.${ext}`
    fs.writeFileSync(path.join(mediaDir(), id), buffer)
    return { id, filename: filename || id, dataUrl }
  })

  ipcMain.handle('media:get-data-url', async (_event, id) => {
    requireSession()
    const file = path.join(mediaDir(), safeId(id))
    if (!fs.existsSync(file)) return null
    const ext = path.extname(file).slice(1).toLowerCase()
    const mime = ext === 'jpg' ? 'jpeg' : ext
    const buf = fs.readFileSync(file)
    return `data:image/${mime};base64,${buf.toString('base64')}`
  })
}
