import React, { useState, useEffect } from 'react'
import {
  Lock,
  KeyRound,
  User,
  ShieldCheck,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Delete,
  Store,
  WifiOff,
} from 'lucide-react'

export default function LoginScreen({ onLoginSuccess }) {
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [checkingSetup, setCheckingSetup] = useState(true)
  const [authMode, setAuthMode] = useState('pin')
  const [pin, setPin] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const [setup, setSetup] = useState({
    restaurantName: '',
    displayName: '',
    username: '',
    password: '',
    confirmPassword: '',
    pin: '',
  })

  const isElectron = typeof window !== 'undefined' && Boolean(window.api?.auth)

  useEffect(() => {
    const bootstrap = async () => {
      try {
        if (window.api?.auth?.needsSetup) {
          const required = await window.api.auth.needsSetup()
          setNeedsSetup(Boolean(required))
        }
        if (window.api?.auth?.getLoginUsers) {
          const userList = await window.api.auth.getLoginUsers()
          setUsers(userList || [])
          if (userList?.length) {
            setSelectedUser(userList[0])
            setUsername(userList[0].username)
          }
        }
      } catch (err) {
        setError(err.message || 'Could not load local authentication.')
      } finally {
        setCheckingSetup(false)
      }
    }
    bootstrap()
  }, [])

  const submitPin = async (pinValue = pin) => {
    if (!pinValue) return
    setLoading(true)
    setError(null)
    try {
      if (!window.api?.auth?.login) {
        throw new Error('Desktop authentication is unavailable. Launch the Electron application.')
      }
      const session = await window.api.auth.login({
        pin: pinValue,
        userId: selectedUser?.id,
        username: selectedUser?.username,
      })
      onLoginSuccess(session)
    } catch (err) {
      setError(err.message || 'Invalid PIN code')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  const submitPassword = async (e) => {
    e?.preventDefault()
    if (!username || !password) {
      setError('Please enter username and password')
      return
    }
    setLoading(true)
    setError(null)
    try {
      if (!window.api?.auth?.login) {
        throw new Error('Desktop authentication is unavailable. Launch the Electron application.')
      }
      const session = await window.api.auth.login({ username, password })
      onLoginSuccess(session)
    } catch (err) {
      setError(err.message || 'Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  const submitSetup = async (e) => {
    e.preventDefault()
    if (setup.password !== setup.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const session = await window.api.auth.completeSetup({
        restaurantName: setup.restaurantName,
        displayName: setup.displayName,
        username: setup.username,
        password: setup.password,
        pin: setup.pin,
      })
      onLoginSuccess(session)
    } catch (err) {
      setError(err.message || 'Initial setup failed.')
    } finally {
      setLoading(false)
    }
  }

  const handlePinDigit = (digit) => {
    if (pin.length >= 6) return
    const next = pin + digit
    setPin(next)
    setError(null)
    if (next.length === 4 && selectedUser) submitPin(next)
  }

  const fieldClass = 'mt-1.5 w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-[14px] text-slate-900'

  if (checkingSetup) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#f3f5f8] text-slate-500 text-[15px]">
        Checking restaurant setup...
      </div>
    )
  }

  if (needsSetup) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#f3f5f8] p-6">
        <form onSubmit={submitSetup} className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-8 space-y-4 shadow-sm">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-11 h-11 rounded-2xl bg-orange-600 flex items-center justify-center text-white font-extrabold">RF</div>
            <div>
              <h1 className="text-[20px] font-semibold text-slate-900">Set up your restaurant</h1>
              <p className="text-[13px] text-slate-500">Create the owner account. This is only done once.</p>
            </div>
          </div>
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[13px] flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <label className="block text-[13px] font-medium text-slate-600">
            Restaurant name
            <input required value={setup.restaurantName} onChange={(e) => setSetup({ ...setup, restaurantName: e.target.value })} className={fieldClass} />
          </label>
          <label className="block text-[13px] font-medium text-slate-600">
            Your name
            <input required value={setup.displayName} onChange={(e) => setSetup({ ...setup, displayName: e.target.value })} className={fieldClass} />
          </label>
          <label className="block text-[13px] font-medium text-slate-600">
            Username
            <input required value={setup.username} onChange={(e) => setSetup({ ...setup, username: e.target.value })} className={fieldClass} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[13px] font-medium text-slate-600">
              Password (min 8)
              <input required type="password" minLength={8} value={setup.password} onChange={(e) => setSetup({ ...setup, password: e.target.value })} className={fieldClass} />
            </label>
            <label className="block text-[13px] font-medium text-slate-600">
              Confirm password
              <input required type="password" value={setup.confirmPassword} onChange={(e) => setSetup({ ...setup, confirmPassword: e.target.value })} className={fieldClass} />
            </label>
          </div>
          <label className="block text-[13px] font-medium text-slate-600">
            4–6 digit PIN
            <input required pattern="\d{4,6}" value={setup.pin} onChange={(e) => setSetup({ ...setup, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })} className={`${fieldClass} tracking-[0.35em]`} />
          </label>
          <button disabled={loading} className="w-full py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-[15px] font-semibold">
            {loading ? 'Creating restaurant...' : 'Create account and continue'}
          </button>
          <p className="text-[13px] text-slate-500 flex items-center gap-1.5">
            <Store className="w-4 h-4" /> Extra staff can be added later from Staff.
          </p>
        </form>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#f3f5f8] p-4">
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col md:flex-row min-h-[540px]">
        <div className="w-full md:w-5/12 bg-slate-50 p-7 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-200">
          <div>
            <div className="flex items-center gap-3 mb-7">
              <div className="w-11 h-11 rounded-2xl bg-orange-600 flex items-center justify-center font-extrabold text-white">RF</div>
              <div>
                <h2 className="font-semibold text-[16px] text-slate-900">Restaurant OS</h2>
                <p className="text-[13px] text-slate-500">Offline POS for this PC</p>
              </div>
            </div>
            <span className="text-[12px] font-semibold text-slate-400 uppercase tracking-[0.08em]">Choose staff</span>
            <div className="space-y-1.5 mt-2 max-h-[320px] overflow-y-auto pr-1">
              {users.length === 0 && (
                <p className="text-[13px] text-slate-500">No local users found. Restart the app or restore a backup.</p>
              )}
              {users.map((u) => {
                const isSelected = selectedUser?.id === u.id
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedUser(u)
                      setUsername(u.username)
                      setPin('')
                      setError(null)
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border text-left ${
                      isSelected ? 'bg-orange-50 border-orange-300' : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-[13px] font-bold ${isSelected ? 'bg-orange-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                        {(u.displayName || u.display_name || u.username || 'U')[0]}
                      </div>
                      <div className="truncate">
                        <div className="text-[14px] font-semibold text-slate-900 truncate">{u.displayName || u.display_name}</div>
                        <span className="text-[12px] text-slate-500">{u.roleName || u.role_name}</span>
                      </div>
                    </div>
                    {isSelected && <ChevronRight className="w-4 h-4 text-orange-600" />}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="pt-4 border-t border-slate-200 text-[12px] text-slate-500 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Local password hashing
            </span>
            <span className="flex items-center gap-1">
              <WifiOff className="w-3.5 h-3.5" />
              {isElectron ? 'Desktop' : 'Browser'}
            </span>
          </div>
        </div>

        <div className="w-full md:w-7/12 p-8 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
            <div>
              <h3 className="text-[18px] font-semibold text-slate-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-orange-600" /> Sign in
              </h3>
              <p className="text-[13px] text-slate-500 mt-0.5">
                {selectedUser?.displayName || selectedUser?.display_name || 'Select a staff profile'}
              </p>
            </div>
            <div className="flex bg-slate-100 p-1 rounded-xl text-[13px]">
              <button type="button" onClick={() => { setAuthMode('pin'); setError(null) }} className={`px-3 py-1.5 rounded-lg font-semibold ${authMode === 'pin' ? 'bg-orange-600 text-white' : 'text-slate-500'}`}>PIN</button>
              <button type="button" onClick={() => { setAuthMode('password'); setError(null) }} className={`px-3 py-1.5 rounded-lg font-semibold ${authMode === 'password' ? 'bg-orange-600 text-white' : 'text-slate-500'}`}>Password</button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[13px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          {authMode === 'pin' && (
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-3 mb-5">
                {[0, 1, 2, 3].map((idx) => (
                  <div key={idx} className={`w-3.5 h-3.5 rounded-full border ${pin.length > idx ? 'bg-orange-500 border-orange-500' : 'bg-slate-200 border-slate-300'}`} />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2.5 w-64">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button key={num} type="button" onClick={() => handlePinDigit(String(num))} className="h-14 rounded-xl bg-slate-50 border border-slate-200 text-[18px] font-semibold text-slate-900 hover:bg-orange-50 hover:border-orange-200">
                    {num}
                  </button>
                ))}
                <button type="button" onClick={() => { setPin(''); setError(null) }} className="h-14 rounded-xl bg-slate-50 border border-slate-200 text-[13px] text-slate-500">Clear</button>
                <button type="button" onClick={() => handlePinDigit('0')} className="h-14 rounded-xl bg-slate-50 border border-slate-200 text-[18px] font-semibold text-slate-900 hover:bg-orange-50">0</button>
                <button type="button" onClick={() => { setPin((p) => p.slice(0, -1)); setError(null) }} className="h-14 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 flex items-center justify-center">
                  <Delete className="w-5 h-5" />
                </button>
              </div>
              {pin.length >= 4 && pin.length !== 4 && (
                <button type="button" onClick={() => submitPin()} className="w-64 mt-4 py-3 rounded-xl bg-orange-600 text-white text-[14px] font-semibold">Unlock</button>
              )}
            </div>
          )}

          {authMode === 'password' && (
            <form onSubmit={submitPassword} className="space-y-4 max-w-sm mx-auto">
              <label className="block text-[13px] font-medium text-slate-600">
                Username
                <div className="relative mt-1.5">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-[14px] text-slate-900" />
                </div>
              </label>
              <label className="block text-[13px] font-medium text-slate-600">
                Password
                <div className="relative mt-1.5">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-[14px] text-slate-900" />
                </div>
              </label>
              <button disabled={loading} className="w-full py-3 rounded-xl bg-orange-600 text-white text-[15px] font-semibold">
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
              <p className="text-[13px] text-slate-500 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Checked against the local staff list on this PC.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
