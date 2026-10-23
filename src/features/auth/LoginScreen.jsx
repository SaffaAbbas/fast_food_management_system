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
  WifiOff,
  UserPlus,
  Crown,
  Briefcase,
  CreditCard,
  UtensilsCrossed,
  ChefHat,
  ArrowRight
} from 'lucide-react'

const ALL_APP_PERMISSIONS = [
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
]

const FALLBACK_USERS = [
  { id: 'admin', username: 'admin', displayName: 'Administrator', display_name: 'Administrator', role_code: 'super_admin', roleCode: 'super_admin', role_name: 'Super Administrator', roleName: 'Super Administrator', pin: '1234', pass: 'admin123' },
  { id: 'manager', username: 'manager', displayName: 'Sarah Manager', display_name: 'Sarah Manager', role_code: 'manager', roleCode: 'manager', role_name: 'Restaurant Manager', roleName: 'Restaurant Manager', pin: '2345', pass: 'manager123' },
  { id: 'cashier', username: 'cashier', displayName: 'Sam Cashier', display_name: 'Sam Cashier', role_code: 'cashier', roleCode: 'cashier', role_name: 'Senior Cashier', roleName: 'Senior Cashier', pin: '3456', pass: 'cashier123' },
  { id: 'waiter', username: 'waiter', displayName: 'David Waiter', display_name: 'David Waiter', role_code: 'waiter', roleCode: 'waiter', role_name: 'Head Waiter', roleName: 'Head Waiter', pin: '4567', pass: 'waiter123' },
  { id: 'chef', username: 'chef', displayName: 'Gordon Head Chef', display_name: 'Gordon Head Chef', role_code: 'kitchen_staff', roleCode: 'kitchen_staff', role_name: 'Head Chef', roleName: 'Head Chef', pin: '5678', pass: 'chef123' },
]

const ROLE_OPTIONS = [
  { code: 'super_admin', name: 'Super Administrator', icon: Crown, defaultPin: '1234', badgeColor: 'text-amber-400 bg-amber-950/60 border-amber-800' },
  { code: 'manager', name: 'Restaurant Manager', icon: Briefcase, defaultPin: '2345', badgeColor: 'text-blue-400 bg-blue-950/60 border-blue-800' },
  { code: 'cashier', name: 'Senior Cashier', icon: CreditCard, defaultPin: '3456', badgeColor: 'text-emerald-400 bg-emerald-950/60 border-emerald-800' },
  { code: 'waiter', name: 'Dining Waiter', icon: UtensilsCrossed, defaultPin: '4567', badgeColor: 'text-purple-400 bg-purple-950/60 border-purple-800' },
  { code: 'kitchen_staff', name: 'Kitchen Head Chef', icon: ChefHat, defaultPin: '5678', badgeColor: 'text-orange-400 bg-orange-950/60 border-orange-800' },
]

export default function LoginScreen({ onLoginSuccess }) {
  const [users, setUsers] = useState(FALLBACK_USERS)
  const [selectedUser, setSelectedUser] = useState(FALLBACK_USERS[0])
  const [authMode, setAuthMode] = useState('pin') // 'pin', 'password', or 'signup'
  const [pin, setPin] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [loading, setLoading] = useState(false)

  // Registration Form State
  const [regFullName, setRegFullName] = useState('')
  const [regUsername, setRegUsername] = useState('')
  const [regRole, setRegRole] = useState('cashier')
  const [regPin, setRegPin] = useState('1234')
  const [regPassword, setRegPassword] = useState('123456')

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

  const completeLoginSession = (u) => {
    const roleCode = u.roleCode || u.role_code || 'super_admin'
    const roleName = u.roleName || u.role_name || 'Staff'
    onLoginSuccess({
      id: u.id || u.userId || `usr-${Date.now()}`,
      userId: u.id || u.userId || `usr-${Date.now()}`,
      username: u.username,
      displayName: u.displayName || u.display_name || u.username,
      display_name: u.displayName || u.display_name || u.username,
      roleCode,
      role_code: roleCode,
      roleName,
      role_name: roleName,
      branchId: u.branchId || 'br-01',
      branchName: u.branchName || 'Main Flagship Branch',
      permissions: ALL_APP_PERMISSIONS,
    })
  }

  const submitPin = async (pinValue = pin) => {
    if (!pinValue) return
    setLoading(true)
    setError(null)

    try {
      if (window.api?.auth?.login) {
        const session = await window.api.auth.login({
          pin: pinValue,
          userId: selectedUser?.id,
          username: selectedUser?.username,
        })
        completeLoginSession(session)
      } else {
        const matched = users.find(
          (u) => (selectedUser ? u.id === selectedUser.id : true) && u.pin === pinValue
        ) || users[0]
        completeLoginSession(matched)
      }
    } catch (err) {
      // In web browser testing mode, fallback to selected user gracefully
      if (!isElectron && selectedUser) {
        completeLoginSession(selectedUser)
      } else {
        setError(err.message || 'Invalid PIN code')
        setPin('')
      }
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
        const session = await window.api.auth.login({
          username,
          password,
        })
        completeLoginSession(session)
      } else {
        const matched = users.find(
          (u) => u.username?.toLowerCase() === username.toLowerCase()
        ) || selectedUser || users[0]
        completeLoginSession(matched)
      }
    } catch (err) {
      if (!isElectron && selectedUser) {
        completeLoginSession(selectedUser)
      } else {
        setError(err.message || 'Invalid username or password')
      }
    } finally {
      setLoading(false)
    }
  }

  // Instant 1-Click Direct Login for fast testing and demonstration
  const handleDirectLogin = (targetUser) => {
    const userToLogin = targetUser || selectedUser || users[0]
    completeLoginSession(userToLogin)
  }

  // Register New Staff / Role
  const handleRegisterStaff = async (e) => {
    e.preventDefault()
    if (!regFullName.trim() || !regUsername.trim()) {
      setError('Please provide full name and username.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const selectedRoleMeta = ROLE_OPTIONS.find((r) => r.code === regRole) || ROLE_OPTIONS[2]
      const payload = {
        username: regUsername.toLowerCase().trim(),
        displayName: regFullName.trim(),
        roleCode: regRole,
        pin: regPin || '1234',
        password: regPassword || '123456',
      }

      if (window.api?.auth?.registerUser) {
        const created = await window.api.auth.registerUser(payload)
        completeLoginSession(created)
      } else {
        const newUser = {
          id: `usr-${Date.now()}`,
          userId: `usr-${Date.now()}`,
          username: payload.username,
          displayName: payload.displayName,
          display_name: payload.displayName,
          roleCode: payload.roleCode,
          role_code: payload.roleCode,
          roleName: selectedRoleMeta.name,
          role_name: selectedRoleMeta.name,
          pin: payload.pin,
          pass: payload.password,
          branchId: 'br-01',
          branchName: 'Main Flagship Branch',
          permissions: ALL_APP_PERMISSIONS,
        }
        setUsers((prev) => [...prev, newUser])
        completeLoginSession(newUser)
      }
    } catch (err) {
      setError(err.message || 'Failed to create staff account.')
    } finally {
      setLoading(false)
    }
  }

  const selectRoleShortcut = (roleCode) => {
    const matched = users.find((u) => (u.roleCode || u.role_code) === roleCode)
    if (matched) {
      setSelectedUser(matched)
      setUsername(matched.username)
      setPin(matched.pin || '')
    } else {
      const roleMeta = ROLE_OPTIONS.find((r) => r.code === roleCode)
      if (roleMeta) {
        setRegRole(roleCode)
        setRegFullName(`${roleMeta.name.split(' ')[0]} Staff`)
        setRegUsername(roleCode)
        setAuthMode('signup')
      }
    }
    setError(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[560px]">
        {/* Left Side: Brand & Staff Selection */}
        <div className="w-full md:w-5/12 bg-slate-950 p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 flex items-center justify-center font-black text-white shadow-lg shadow-orange-950">
                RF
              </div>
              <div>
                <h2 className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                  RESTAURANT OS
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                </h2>
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Real-Time Cloud POS</p>
              </div>
            </div>

            {/* Quick Role Switcher Chips */}
            <div className="mb-4">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Quick Role Switcher
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {ROLE_OPTIONS.map((r) => {
                  const Icon = r.icon
                  const activeUser = users.find((u) => (u.roleCode || u.role_code) === r.code)
                  const isSelected = (selectedUser?.roleCode || selectedUser?.role_code) === r.code
                  return (
                    <button
                      key={r.code}
                      type="button"
                      onClick={() => selectRoleShortcut(r.code)}
                      className={`flex items-center gap-1.5 p-2 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-orange-600/20 border-orange-500 text-white shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                      <span className="truncate text-[11px]">{r.name.split(' ')[0]}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1 mb-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Active Staff Profiles</span>
            </div>

            {/* Staff list */}
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
              {users.map((u) => {
                const isSelected = selectedUser?.id === u.id
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      setSelectedUser(u)
                      setUsername(u.username)
                      setPin(u.pin || '')
                      setError(null)
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-orange-600/10 border-orange-500/80 text-white'
                        : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                        isSelected ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-300'
                      }`}>
                        {(u.displayName || u.display_name || u.username || 'U')[0]}
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-semibold text-white leading-tight truncate">{u.displayName || u.display_name}</div>
                        <span className="text-[10px] text-slate-400 capitalize">{u.roleName || u.role_name}</span>
                      </div>
                    </div>
                    {isSelected && <ChevronRight className="w-4 h-4 text-orange-400 shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Offline-First Enterprise POS</span>
            </span>
            <span className="font-mono text-[10px] text-slate-400">
              {isElectron ? 'Electron Native' : 'Cloud / Web Active'}
            </span>
          </div>
        </div>

        {/* Right Side: Keypad / Credentials / Sign Up */}
        <div className="w-full md:w-7/12 p-8 flex flex-col justify-between bg-slate-900">
          <div>
            {/* Mode Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4 mb-6">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-orange-400" />
                  Terminal Authorization
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Role: <span className="font-semibold text-white">{selectedUser?.roleName || selectedUser?.role_name || 'Staff'}</span>
                  {' '}• User: <span className="font-semibold text-orange-400">{selectedUser?.displayName || selectedUser?.display_name || 'Selected'}</span>
                </p>
              </div>

              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => { setAuthMode('pin'); setError(null); }}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                    authMode === 'pin' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Quick PIN
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode('password'); setError(null); }}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                    authMode === 'password' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Password
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode('signup'); setError(null); }}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                    authMode === 'signup' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <UserPlus className="w-3 h-3" />
                  <span>Register Staff</span>
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

            {/* Success Message */}
            {successMsg && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* PIN Keypad Mode */}
            {authMode === 'pin' && (
              <div className="flex flex-col items-center">
                {/* PIN Dots */}
                <div className="flex items-center gap-3 mb-5">
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
                <div className="grid grid-cols-3 gap-2 w-64">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handlePinDigit(num.toString())}
                      className="h-12 rounded-xl bg-slate-950 border border-slate-800 text-base font-bold text-white hover:bg-slate-800 hover:border-slate-700 active:scale-95 transition-all shadow-sm flex items-center justify-center cursor-pointer"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handlePinClear}
                    className="h-12 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePinDigit('0')}
                    className="h-12 rounded-xl bg-slate-950 border border-slate-800 text-base font-bold text-white hover:bg-slate-800 hover:border-slate-700 active:scale-95 transition-all shadow-sm flex items-center justify-center cursor-pointer"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handlePinBackspace}
                    className="h-12 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                  >
                    <Delete className="w-5 h-5" />
                  </button>
                </div>

                {/* 1-Click Direct Sign In */}
                <button
                  type="button"
                  onClick={() => handleDirectLogin(selectedUser)}
                  className="w-64 mt-4 py-2.5 px-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-xs transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>One-Click Sign In as {selectedUser?.displayName?.split(' ')[0]}</span>
                </button>

                <div className="mt-3 text-center">
                  <span className="text-[11px] text-slate-400">
                    PINs: Admin <code className="text-orange-400">1234</code> • Manager <code className="text-orange-400">2345</code> • Cashier <code className="text-orange-400">3456</code> • Waiter <code className="text-orange-400">4567</code> • Chef <code className="text-orange-400">5678</code>
                  </span>
                </div>
              </div>
            )}

            {/* Username & Password Mode */}
            {authMode === 'password' && (
              <form onSubmit={submitPassword} className="space-y-4 max-w-sm mx-auto">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Username</label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. admin, manager, cashier"
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
                  className="w-full py-2.5 px-4 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Authenticating...' : 'Sign In to Terminal'}
                </button>

                <button
                  type="button"
                  onClick={() => handleDirectLogin(selectedUser)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                  <span>One-Click Sign In as {selectedUser?.displayName?.split(' ')[0]}</span>
                </button>

                <div className="text-center pt-2">
                  <span className="text-[11px] text-slate-400">
                    Passwords: <code className="text-orange-400">admin123</code> • <code className="text-orange-400">manager123</code> • <code className="text-orange-400">cashier123</code>
                  </span>
                </div>
              </form>
            )}

            {/* Register Staff / Sign Up Mode */}
            {authMode === 'signup' && (
              <form onSubmit={handleRegisterStaff} className="space-y-3.5 max-w-sm mx-auto">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Full Name</label>
                    <input
                      type="text"
                      value={regFullName}
                      onChange={(e) => setRegFullName(e.target.value)}
                      placeholder="e.g. Maria Gonzalez"
                      required
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Username</label>
                    <input
                      type="text"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      placeholder="e.g. maria"
                      required
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Assigned Staff Role</label>
                  <select
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500 cursor-pointer"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">4-Digit PIN</label>
                    <input
                      type="password"
                      maxLength={4}
                      value={regPin}
                      onChange={(e) => setRegPin(e.target.value)}
                      placeholder="1234"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono tracking-widest text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Password</label>
                    <input
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-xs transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer mt-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{loading ? 'Creating Staff Account...' : 'Register Staff & Launch Terminal'}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
