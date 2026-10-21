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
  Sparkles,
  WifiOff
} from 'lucide-react'

const FALLBACK_USERS = [
  { id: 'admin', username: 'admin', displayName: 'Administrator', display_name: 'Administrator', role_code: 'super_admin', roleCode: 'super_admin', role_name: 'Super Administrator', roleName: 'Super Administrator', pin: '1234', pass: 'admin123' },
  { id: 'manager', username: 'manager', displayName: 'Sarah Manager', display_name: 'Sarah Manager', role_code: 'manager', roleCode: 'manager', role_name: 'Restaurant Manager', roleName: 'Restaurant Manager', pin: '2345', pass: 'manager123' },
  { id: 'cashier', username: 'cashier', displayName: 'Sam Cashier', display_name: 'Sam Cashier', role_code: 'cashier', roleCode: 'cashier', role_name: 'Cashier', roleName: 'Cashier', pin: '3456', pass: 'cashier123' },
  { id: 'waiter', username: 'waiter', displayName: 'David Waiter', display_name: 'David Waiter', role_code: 'waiter', roleCode: 'waiter', role_name: 'Waiter', roleName: 'Waiter', pin: '4567', pass: 'waiter123' },
  { id: 'chef', username: 'chef', displayName: 'Gordon Head Chef', display_name: 'Gordon Head Chef', role_code: 'kitchen_staff', roleCode: 'kitchen_staff', role_name: 'Kitchen Staff', roleName: 'Kitchen Staff', pin: '5678', pass: 'chef123' },
]

export default function LoginScreen({ onLoginSuccess }) {
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [authMode, setAuthMode] = useState('pin') // 'pin' or 'password'
  const [pin, setPin] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const isElectron = typeof window !== 'undefined' && Boolean(window.api?.auth)

  useEffect(() => {
    if (window.api?.auth?.getLoginUsers) {
      window.api.auth.getLoginUsers()
        .then((userList) => {
          if (userList && userList.length > 0) {
            setUsers(userList)
            setSelectedUser(userList[0])
            setUsername(userList[0].username)
          } else {
            setUsers(FALLBACK_USERS)
            setSelectedUser(FALLBACK_USERS[0])
            setUsername(FALLBACK_USERS[0].username)
          }
        })
        .catch((err) => {
          console.warn('Using fallback user list:', err)
          setUsers(FALLBACK_USERS)
          setSelectedUser(FALLBACK_USERS[0])
          setUsername(FALLBACK_USERS[0].username)
        })
    } else {
      // Browser fallback mode
      setUsers(FALLBACK_USERS)
      setSelectedUser(FALLBACK_USERS[0])
      setUsername(FALLBACK_USERS[0].username)
    }
  }, [])

  const handlePinDigit = (digit) => {
    if (pin.length < 6) {
      const newPin = pin + digit
      setPin(newPin)
      setError(null)
      // Auto-submit on 4 digits if user is selected
      if (newPin.length === 4 && selectedUser) {
        submitPin(newPin)
      }
    }
  }

  const handlePinBackspace = () => {
    setPin((prev) => prev.slice(0, -1))
    setError(null)
  }

  const handlePinClear = () => {
    setPin('')
    setError(null)
  }

  const submitPin = async (pinValue = pin) => {
    if (!pinValue) return
    setLoading(true)
    setError(null)

    try {
      if (window.api?.auth?.login) {
        // Native Electron SQLite verification
        const session = await window.api.auth.login({
          pin: pinValue,
          userId: selectedUser?.id,
          username: selectedUser?.username,
        })
        onLoginSuccess(session)
      } else {
        // Web browser testing verification
        const matched = FALLBACK_USERS.find(
          (u) => (selectedUser ? u.id === selectedUser.id : true) && u.pin === pinValue
        )
        if (matched) {
          onLoginSuccess({
            id: matched.id,
            userId: matched.id,
            username: matched.username,
            displayName: matched.displayName,
            roleCode: matched.roleCode || matched.role_code,
            roleName: matched.roleName || matched.role_name,
            branchId: 'br-01',
            branchName: 'Main Flagship Branch',
            permissions: [
              'dashboard:view',
              'pos:create_order',
              'pos:apply_discount',
              'pos:process_refund',
              'menu:manage',
              'inventory:manage',
              'reports:view',
              'staff:manage',
              'settings:manage',
              'kitchen:view',
            ],
          })
        } else {
          throw new Error('Invalid PIN code.')
        }
      }
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
      if (window.api?.auth?.login) {
        // Native Electron SQLite verification
        const session = await window.api.auth.login({
          username,
          password,
        })
        onLoginSuccess(session)
      } else {
        // Web browser testing verification
        const matched = FALLBACK_USERS.find(
          (u) => u.username.toLowerCase() === username.toLowerCase() && u.pass === password
        )
        if (matched) {
          onLoginSuccess({
            id: matched.id,
            userId: matched.id,
            username: matched.username,
            displayName: matched.displayName,
            roleCode: matched.roleCode || matched.role_code,
            roleName: matched.roleName || matched.role_name,
            branchId: 'br-01',
            branchName: 'Main Flagship Branch',
            permissions: [
              'dashboard:view',
              'pos:create_order',
              'pos:apply_discount',
              'pos:process_refund',
              'menu:manage',
              'inventory:manage',
              'reports:view',
              'staff:manage',
              'settings:manage',
              'kitchen:view',
            ],
          })
        } else {
          throw new Error('Invalid username or password.')
        }
      }
    } catch (err) {
      setError(err.message || 'Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[520px]">
        {/* Left Side: Brand & Staff Selection */}
        <div className="w-full md:w-5/12 bg-slate-950 p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center font-black text-white shadow-lg shadow-orange-950">
                RF
              </div>
              <div>
                <h2 className="font-bold text-sm tracking-tight text-white">RESTAURANT OS</h2>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Local Desktop POS</p>
              </div>
            </div>

            <div className="space-y-1 mb-4">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Select Staff Member</span>
              <p className="text-[11px] text-slate-500">Choose your profile for fast PIN or password login.</p>
            </div>

            {/* Staff list */}
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
              {users.map((u) => {
                const isSelected = selectedUser?.id === u.id
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      setSelectedUser(u)
                      setUsername(u.username)
                      setPin('')
                      setError(null)
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-orange-600/10 border-orange-500/80 text-white'
                        : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                        isSelected ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-300'
                      }`}>
                        {u.displayName?.[0] || 'U'}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white leading-tight">{u.displayName}</div>
                        <span className="text-[10px] text-slate-400 capitalize">{u.role_name}</span>
                      </div>
                    </div>
                    {isSelected && <ChevronRight className="w-4 h-4 text-orange-400" />}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Offline-First POS</span>
            </span>
            <span className="font-mono text-[10px] text-slate-400">
              {isElectron ? 'Electron Native' : 'Web View'}
            </span>
          </div>
        </div>

        {/* Right Side: Keypad / Credentials */}
        <div className="w-full md:w-7/12 p-8 flex flex-col justify-between bg-slate-900">
          <div>
            {/* Mode Tabs */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-orange-400" />
                  Staff Authorization
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Signing in as <span className="font-semibold text-white">{selectedUser?.displayName || 'User'}</span>
                </p>
              </div>

              <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => { setAuthMode('pin'); setError(null); }}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    authMode === 'pin' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Quick PIN
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode('password'); setError(null); }}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    authMode === 'password' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Password
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* PIN Keypad Mode */}
            {authMode === 'pin' ? (
              <div className="flex flex-col items-center">
                {/* PIN Dots */}
                <div className="flex items-center gap-3 mb-6">
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className={`w-4 h-4 rounded-full border transition-all ${
                        pin.length > idx
                          ? 'bg-orange-500 border-orange-400 scale-110 shadow-sm shadow-orange-500'
                          : 'bg-slate-800 border-slate-700'
                      }`}
                    />
                  ))}
                </div>

                {/* 3x4 Touch Keypad */}
                <div className="grid grid-cols-3 gap-2.5 w-64">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handlePinDigit(num.toString())}
                      className="h-14 rounded-xl bg-slate-950 border border-slate-800 text-lg font-bold text-white hover:bg-slate-800 hover:border-slate-700 active:scale-95 transition-all shadow-sm flex items-center justify-center"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handlePinClear}
                    className="h-14 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePinDigit('0')}
                    className="h-14 rounded-xl bg-slate-950 border border-slate-800 text-lg font-bold text-white hover:bg-slate-800 hover:border-slate-700 active:scale-95 transition-all shadow-sm flex items-center justify-center"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handlePinBackspace}
                    className="h-14 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center"
                  >
                    <Delete className="w-5 h-5" />
                  </button>
                </div>

                <div className="mt-4 text-center">
                  <span className="text-[11px] text-slate-500">
                    Default PINs: Admin <code className="text-orange-400">1234</code> • Cashier <code className="text-orange-400">0000</code> • Manager <code className="text-orange-400">4321</code>
                  </span>
                </div>
              </div>
            ) : (
              /* Username & Password Mode */
              <form onSubmit={submitPassword} className="space-y-4 max-w-sm mx-auto">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Username</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. admin or manager"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Password</label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  {loading ? 'Authenticating...' : 'Sign In to Terminal'}
                </button>

                <div className="text-center pt-2">
                  <span className="text-[11px] text-slate-500">
                    Default Passwords: Admin <code className="text-orange-400">admin123</code> • Manager <code className="text-orange-400">manager123</code>
                  </span>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
