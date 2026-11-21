import net from 'node:net'
import tls from 'node:tls'
import { loadDotEnv } from '../sync/config.js'
import { settingsRepository } from '../db/repositories/settingsRepository.js'

function readStored(key) {
  try {
    return settingsRepository.get(key) || ''
  } catch {
    return ''
  }
}

export function getSmtpConfig() {
  loadDotEnv()
  const host = String(process.env.SMTP_HOST || readStored('smtp_host') || '').trim()
  const user = String(process.env.SMTP_USER || readStored('smtp_user') || '').trim()
  const pass = String(process.env.SMTP_PASS || readStored('smtp_pass') || '')
  const from = String(process.env.SMTP_FROM || readStored('smtp_from') || user || '').trim()
  const port = Number(process.env.SMTP_PORT || readStored('smtp_port') || 587)
  if (!host || !user || !pass || !from) return null
  return { host, user, pass, from, port }
}

export function getPublicMailStatus() {
  const cfg = getSmtpConfig()
  if (!cfg) return { configured: false, host: '', port: 587, user: '', from: '' }
  return { configured: true, host: cfg.host, port: cfg.port, user: cfg.user, from: cfg.from }
}

function createReader(socket) {
  let buffer = ''
  let waiter = null

  const fail = (err) => {
    if (!waiter) return
    const current = waiter
    waiter = null
    current.reject(err)
  }

  const onData = (chunk) => {
    buffer += chunk.toString('utf8')
    flush()
  }
  const onError = fail
  const onClose = () => fail(new Error('Email server closed the connection.'))
  socket.on('data', onData)
  socket.on('error', onError)
  socket.on('close', onClose)

  function flush() {
    if (!waiter) return
    const lines = buffer.split(/\r\n/)
    const partial = buffer.endsWith('\r\n') ? '' : (lines.pop() ?? '')
    if (!lines.length) return
    const last = lines[lines.length - 1]
    if (!/^\d{3} /.test(last)) return
    buffer = partial
    const text = lines.join('\n')
    const current = waiter
    waiter = null
    current.resolve({ code: Number(last.slice(0, 3)), text })
  }

  return {
    read() {
      return new Promise((resolve, reject) => {
        waiter = { resolve, reject }
        flush()
      })
    },
    stop() {
      socket.off('data', onData)
      socket.off('error', onError)
      socket.off('close', onClose)
    },
  }
}

function expectCode(response, allowed, step) {
  if (!allowed.includes(response.code)) {
    throw new Error(`${step} failed (${response.code}). ${response.text}`)
  }
}

async function sendCommand(socket, reader, line, allowed, step) {
  socket.write(`${line}\r\n`)
  const response = await reader.read()
  expectCode(response, allowed, step)
  return response
}

function upgradeTls(socket, host) {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket, servername: host })
    secure.once('secureConnect', () => resolve(secure))
    secure.once('error', reject)
  })
}

async function smtpSend(cfg, { to, subject, text }) {
  const secureFromStart = cfg.port === 465
  const socket = await new Promise((resolve, reject) => {
    const connect = secureFromStart ? tls.connect : net.connect
    const options = secureFromStart
      ? { host: cfg.host, port: cfg.port, servername: cfg.host }
      : { host: cfg.host, port: cfg.port }
    const client = connect(options, () => resolve(client))
    client.once('error', reject)
    client.setTimeout(12000, () => {
      client.destroy(new Error('Email server timed out.'))
    })
  })

  let active = socket
  let reader = createReader(active)
  try {
    const greeting = await reader.read()
    expectCode(greeting, [220], 'Connect')
    await sendCommand(active, reader, 'EHLO restaurant-os', [250], 'Greeting')

    if (!secureFromStart) {
      await sendCommand(active, reader, 'STARTTLS', [220], 'Secure connection')
      reader.stop()
      active = await upgradeTls(active, cfg.host)
      active.setTimeout(12000, () => active.destroy(new Error('Email server timed out.')))
      reader = createReader(active)
      await sendCommand(active, reader, 'EHLO restaurant-os', [250], 'Secure greeting')
    }

    await sendCommand(active, reader, 'AUTH LOGIN', [334], 'Sign in to email server')
    await sendCommand(active, reader, Buffer.from(cfg.user).toString('base64'), [334], 'Email username')
    await sendCommand(active, reader, Buffer.from(cfg.pass).toString('base64'), [235], 'Email password')
    await sendCommand(active, reader, `MAIL FROM:<${cfg.from}>`, [250], 'Sender')
    await sendCommand(active, reader, `RCPT TO:<${to}>`, [250, 251], 'Recipient')
    await sendCommand(active, reader, 'DATA', [354], 'Message')

    const body = String(text).replace(/\r?\n/g, '\r\n')
    const stuffed = body.split('\r\n').map((line) => (line.startsWith('.') ? `.${line}` : line)).join('\r\n')
    const payload = [
      `From: ${cfg.from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      stuffed,
      '.',
    ].join('\r\n')
    active.write(`${payload}\r\n`)
    const accepted = await reader.read()
    expectCode(accepted, [250], 'Deliver message')
    active.write('QUIT\r\n')
  } finally {
    active.destroy()
  }
}

export async function sendSignupOtpEmail({ to, code, username }) {
  const cfg = getSmtpConfig()
  if (!cfg) {
    throw new Error('Email is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM to the .env file, then restart the app.')
  }
  const safeName = String(username || 'there').replace(/[^\w .@-]/g, '')
  const text = [
    `Hello ${safeName},`,
    '',
    `Your Restaurant OS verification code is ${code}.`,
    'It expires in 10 minutes.',
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n')
  try {
    await smtpSend(cfg, { to, subject: 'Your Restaurant OS verification code', text })
  } catch (err) {
    const detail = err?.message ? ` ${err.message}` : ''
    throw new Error(`Could not send the verification email.${detail}`)
  }
}
