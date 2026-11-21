import React, { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react'

const fieldClass = 'mt-1.5 w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-[14px] text-slate-900 outline-none focus:border-orange-400'

function PasswordField({ label, value, onChange, autoComplete, hint, error }) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="block text-[13px] font-medium text-slate-600">
      {label}
      <span className="relative mt-1.5 block">
        <input
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          className="w-full bg-white border border-slate-200 rounded-xl pl-3 pr-10 py-2.5 text-[14px] text-slate-900 outline-none focus:border-orange-400"
        />
        <button
          type="button"
          onClick={() => setVisible((open) => !open)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-700"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </span>
      {hint && <span className="mt-1 block text-[12px] text-slate-400">{hint}</span>}
      {error && <span className="mt-1 block text-[12px] text-rose-600">{error}</span>}
    </label>
  )
}

function cleanError(err, fallback) {
  let raw = err?.message || fallback
  const wrapped = raw.match(/Error invoking remote method '[^']+':\s*(?:Error:\s*)?([\s\S]*)$/)
  if (wrapped?.[1]) raw = wrapped[1]
  return raw || fallback
}

function validateSignup(form) {
  const errors = {}
  const username = form.username.trim()
  const email = form.email.trim()
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
    errors.username = 'Use 3–32 letters, numbers, or underscores.'
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter a valid email address.'
  }
  if (form.password.length < 8 || form.password.length > 128 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) {
    errors.password = 'Use at least 8 characters, with a letter and a number.'
  }
  if (form.password !== form.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.'
  }
  if (!form.roleId) errors.roleId = 'Select a role.'
  return errors
}

export default function LoginScreen({ onLoginSuccess, notice }) {
  const [mode, setMode] = useState('login')
  const [roles, setRoles] = useState([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    roleId: '',
  })
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState(null)
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const bootstrap = async () => {
      try {
        if (window.api?.auth?.needsSetup) {
          const required = await window.api.auth.needsSetup()
          if (required) setMode('signup')
        }
        if (window.api?.auth?.listRoles) {
          setRoles((await window.api.auth.listRoles()) || [])
        }
      } catch (err) {
        setError(cleanError(err, 'Could not load sign-in.'))
      }
    }
    bootstrap()
  }, [])

  const switchMode = (next) => {
    setMode(next)
    setError(null)
    setFieldErrors({})
    if (next !== 'login') setInfo('')
  }

  const submitLogin = async (e) => {
    e?.preventDefault()
    if (!username.trim() || !password) {
      setError('Enter your username and password.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      if (!window.api?.auth?.login) {
        throw new Error('Desktop authentication is unavailable. Launch the Restaurant OS application.')
      }
      const session = await window.api.auth.login({ username: username.trim(), password })
      onLoginSuccess(session)
    } catch (err) {
      setError(cleanError(err, 'Invalid username or password.'))
    } finally {
      setLoading(false)
    }
  }

  const submitSignup = async (e) => {
    e.preventDefault()
    const errors = validateSignup(form)
    setFieldErrors(errors)
    if (Object.keys(errors).length) return

    setLoading(true)
    setError(null)
    try {
      if (!window.api?.auth?.signup) {
        throw new Error('Sign-up is unavailable. Launch the Restaurant OS application.')
      }
      const result = await window.api.auth.signup({
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
        roleId: form.roleId,
      })
      setUsername(result.username || form.username.trim().toLowerCase())
      setPassword('')
      setForm({ username: '', email: '', password: '', confirmPassword: '', roleId: '' })
      setInfo('Account created. Sign in with your username and password.')
      setMode('login')
    } catch (err) {
      const message = cleanError(err, 'Could not create the account.')
      if (/email already registered/i.test(message)) {
        setFieldErrors({ email: 'Email already registered.' })
      } else if (/username is already/i.test(message)) {
        setFieldErrors({ username: message })
      }
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#f3f5f8] p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-sm p-8 my-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-orange-600 flex items-center justify-center font-extrabold text-white">RF</div>
          <div>
            <h1 className="text-[20px] font-semibold text-slate-900">
              {mode === 'signup' ? 'Create an account' : 'Sign in'}
            </h1>
            <p className="text-[13px] text-slate-500">
              {mode === 'signup'
                ? 'Choose a username, email, password, and role.'
                : 'Use the username and password for this restaurant.'}
            </p>
          </div>
        </div>

        {info && mode === 'login' && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[13px] flex gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{info}</span>
          </div>
        )}
        {notice && !info && (
          <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[13px]">
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[13px] flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {mode === 'login' && (
          <form onSubmit={submitLogin} className="space-y-4">
            <label className="block text-[13px] font-medium text-slate-600">
              Username
              <input
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={fieldClass}
              />
            </label>
            <PasswordField
              label="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button disabled={loading} className="w-full py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-[15px] font-semibold disabled:opacity-60">
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
            <button type="button" onClick={() => switchMode('signup')} className="w-full text-[13px] font-medium text-orange-700 hover:text-orange-600">
              Create an account
            </button>
          </form>
        )}

        {mode === 'signup' && (
          <form onSubmit={submitSignup} className="space-y-4">
            <label className="block text-[13px] font-medium text-slate-600">
              Username
              <input
                autoComplete="username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className={fieldClass}
              />
              {fieldErrors.username && <span className="mt-1 block text-[12px] text-rose-600">{fieldErrors.username}</span>}
            </label>
            <label className="block text-[13px] font-medium text-slate-600">
              Email
              <input
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={fieldClass}
              />
              {fieldErrors.email && <span className="mt-1 block text-[12px] text-rose-600">{fieldErrors.email}</span>}
            </label>
            <PasswordField
              label="Password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              hint="At least 8 characters, with a letter and a number."
              error={fieldErrors.password}
            />
            <PasswordField
              label="Confirm password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              error={fieldErrors.confirmPassword}
            />
            <label className="block text-[13px] font-medium text-slate-600">
              Role
              <select
                value={form.roleId}
                onChange={(e) => setForm({ ...form, roleId: e.target.value })}
                className={fieldClass}
              >
                <option value="">Select a role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
              {fieldErrors.roleId && <span className="mt-1 block text-[12px] text-rose-600">{fieldErrors.roleId}</span>}
            </label>

            <button disabled={loading} className="w-full py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-[15px] font-semibold disabled:opacity-60">
              {loading ? 'Creating account...' : 'Create account'}
            </button>
            <button type="button" onClick={() => switchMode('login')} className="w-full text-[13px] font-medium text-slate-500 hover:text-slate-700">
              Already have an account? Sign in
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
