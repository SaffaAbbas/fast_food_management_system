import React, { useState, useEffect } from 'react'
import {
  Users,
  UserCheck,
  UserPlus,
  Clock,
  ShieldCheck,
  Award,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Edit,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  KeyRound,
  DollarSign,
  Phone,
  Mail,
  Calendar,
  Coffee,
  Check,
  ArrowLeft
} from 'lucide-react'

export default function StaffManagerView({ onBack }) {
  const [activeTab, setActiveTab] = useState('roster') // roster, attendance, performance, users
  const [employees, setEmployees] = useState([])
  const [attendanceLogs, setAttendanceLogs] = useState([])
  const [performanceData, setPerformanceData] = useState([])
  const [usersList, setUsersList] = useState([])
  const [roles, setRoles] = useState([])
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  // Filters & search
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDesignation, setSelectedDesignation] = useState('ALL')
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().slice(0, 10))

  // Modals
  const [showAddEmpModal, setShowAddEmpModal] = useState(false)
  const [editingEmp, setEditingEmp] = useState(null)
  const [showClockInOutModal, setShowClockInOutModal] = useState(false)
  const [selectedEmpForClock, setSelectedEmpForClock] = useState(null)
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)

  // Employee Form State
  const [empForm, setEmpForm] = useState({
    employeeCode: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    designation: 'Senior Cashier',
    roleId: '',
    salaryType: 'MONTHLY',
    baseRate: '2500.00',
    hireDate: new Date().toISOString().slice(0, 10),
    emergencyContact: '',
    notes: '',
  })

  // Clock In/Out Form State
  const [clockAction, setClockAction] = useState('IN') // IN or OUT
  const [breakMins, setBreakMins] = useState('0')
  const [clockNotes, setClockNotes] = useState('')

  // User Form State
  const [userForm, setUserForm] = useState({
    username: '',
    displayName: '',
    roleId: '',
    pin: '1234',
    isActive: true,
  })

  useEffect(() => {
    loadAllStaffData()
  }, [])

  const loadAllStaffData = async () => {
    setLoading(true)
    setError(null)
    try {
      if (window.api?.staff) {
        const [empData, rolesData, shiftsData] = await Promise.all([
          window.api.staff.getEmployees(),
          window.api.staff.getRoles(),
          window.api.staff.getShifts(),
        ])
        setEmployees(empData || [])
        setRoles(rolesData || [])
        setShifts(shiftsData || [])

        if (rolesData && rolesData.length > 0 && !empForm.roleId) {
          setEmpForm((prev) => ({ ...prev, roleId: rolesData[0].id }))
          setUserForm((prev) => ({ ...prev, roleId: rolesData[0].id }))
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load staff roster.')
    } finally {
      setLoading(false)
    }
  }

  // Load Attendance
  const loadAttendance = async (date) => {
    try {
      if (window.api?.staff) {
        const logs = await window.api.staff.getAttendanceLogs({ date: date || attendanceDate })
        setAttendanceLogs(logs || [])
      }
    } catch (err) {
      setError(err.message || 'Failed to load attendance.')
    }
  }

  // Load Performance
  const loadPerformance = async () => {
    try {
      if (window.api?.staff) {
        const perf = await window.api.staff.getPerformance()
        setPerformanceData(perf?.cashierPerformance || [])
      }
    } catch (err) {
      setError(err.message || 'Failed to load performance metrics.')
    }
  }

  // Load Users
  const loadUsers = async () => {
    try {
      if (window.api?.staff) {
        const users = await window.api.staff.getUsers()
        setUsersList(users || [])
      }
    } catch (err) {
      setError(err.message || 'Failed to load user accounts.')
    }
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (tab === 'attendance') loadAttendance()
    else if (tab === 'performance') loadPerformance()
    else if (tab === 'users') loadUsers()
  }

  // Handle Save Employee
  const handleSaveEmployee = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      const baseRateCents = Math.round(parseFloat(empForm.baseRate || 0) * 100)
      if (editingEmp) {
        await window.api.staff.updateEmployee(editingEmp.id, {
          ...empForm,
          baseRateCents,
        })
        setSuccessMsg(`Employee ${empForm.firstName} ${empForm.lastName} updated!`)
      } else {
        await window.api.staff.createEmployee({
          ...empForm,
          baseRateCents,
        })
        setSuccessMsg(`Employee ${empForm.firstName} ${empForm.lastName} created!`)
      }
      setShowAddEmpModal(false)
      setEditingEmp(null)
      loadAllStaffData()
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (err) {
      setError(err.message || 'Failed to save employee.')
    }
  }

  // Open Edit Modal
  const handleEditClick = (emp) => {
    setEditingEmp(emp)
    setEmpForm({
      employeeCode: emp.employee_code,
      firstName: emp.first_name,
      lastName: emp.last_name,
      email: emp.email || '',
      phone: emp.phone || '',
      designation: emp.designation,
      roleId: emp.role_id || '',
      salaryType: emp.salary_type || 'MONTHLY',
      baseRate: ((emp.base_rate_cents || 0) / 100).toFixed(2),
      hireDate: emp.hire_date || '',
      emergencyContact: emp.emergency_contact || '',
      notes: emp.notes || '',
    })
    setShowAddEmpModal(true)
  }

  // Open Quick Clock In/Out Modal
  const handleOpenClockModal = (emp) => {
    setSelectedEmpForClock(emp)
    if (emp.todayAttendance && !emp.todayAttendance.clock_out) {
      setClockAction('OUT')
    } else {
      setClockAction('IN')
    }
    setBreakMins('0')
    setClockNotes('')
    setShowClockInOutModal(true)
  }

  // Submit Clock In/Out
  const handleSubmitClock = async (e) => {
    e.preventDefault()
    if (!selectedEmpForClock) return
    setError(null)
    try {
      if (clockAction === 'IN') {
        await window.api.staff.clockIn({
          employeeId: selectedEmpForClock.id,
          notes: clockNotes,
        })
        setSuccessMsg(`Clocked In: ${selectedEmpForClock.first_name} ${selectedEmpForClock.last_name}`)
      } else {
        if (!selectedEmpForClock.todayAttendance) throw new Error('No active clock-in session found.')
        await window.api.staff.clockOut({
          attendanceId: selectedEmpForClock.todayAttendance.id,
          breakMinutes: parseInt(breakMins, 10) || 0,
          notes: clockNotes,
        })
        setSuccessMsg(`Clocked Out: ${selectedEmpForClock.first_name} ${selectedEmpForClock.last_name}`)
      }
      setShowClockInOutModal(false)
      loadAllStaffData()
      if (activeTab === 'attendance') loadAttendance()
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (err) {
      setError(err.message || 'Attendance action failed.')
    }
  }

  // Handle Save User
  const handleSaveUser = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      if (editingUser) {
        await window.api.staff.updateUser(editingUser.id, {
          displayName: userForm.displayName,
          roleId: userForm.roleId,
          pin: userForm.pin,
          isActive: userForm.isActive,
        })
        setSuccessMsg(`User ${userForm.displayName} updated!`)
      } else {
        await window.api.staff.createUser({
          ...userForm,
        })
        setSuccessMsg(`User ${userForm.username} created!`)
      }
      setShowAddUserModal(false)
      setEditingUser(null)
      loadUsers()
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (err) {
      setError(err.message || 'Failed to save system user.')
    }
  }

  // Filtered employees
  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      searchTerm === '' ||
      emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.phone && emp.phone.includes(searchTerm))

    const matchesDesig = selectedDesignation === 'ALL' || emp.designation === selectedDesignation
    return matchesSearch && matchesDesig
  })

  const uniqueDesignations = ['ALL', ...new Set(employees.map((e) => e.designation))]

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-medium transition-all shadow-sm"
                title="Back to Dashboard"
              >
                <ArrowLeft className="w-4 h-4 text-orange-400" />
                <span>Back</span>
              </button>
            )}
            <div className="p-3.5 rounded-xl bg-orange-950/40 border border-orange-700/60 text-orange-400">
              <Users className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-white">Staff, Shifts & Attendance Management</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-orange-900/40 text-orange-300 border border-orange-700/50">
                  {employees.length} Staff Members
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Full employee roster, daily attendance clock-in/out, performance tracking, and role access security (Section 16).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadAllStaffData}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all"
              title="Refresh Staff Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {activeTab === 'roster' && (
              <button
                onClick={() => {
                  setEditingEmp(null)
                  setEmpForm({
                    employeeCode: '',
                    firstName: '',
                    lastName: '',
                    email: '',
                    phone: '',
                    designation: 'Senior Cashier',
                    roleId: roles[0]?.id || '',
                    salaryType: 'MONTHLY',
                    baseRate: '2500.00',
                    hireDate: new Date().toISOString().slice(0, 10),
                    emergencyContact: '',
                    notes: '',
                  })
                  setShowAddEmpModal(true)
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs shadow-lg shadow-orange-950 transition-all"
              >
                <UserPlus className="w-4 h-4" /> Add Employee
              </button>
            )}

            {activeTab === 'users' && (
              <button
                onClick={() => {
                  setEditingUser(null)
                  setUserForm({
                    username: '',
                    displayName: '',
                    roleId: roles[0]?.id || '',
                    pin: '1234',
                    isActive: true,
                  })
                  setShowAddUserModal(true)
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg shadow-emerald-950 transition-all"
              >
                <Plus className="w-4 h-4" /> Add System User
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-t border-slate-800 pt-4 mt-5">
          <button
            onClick={() => handleTabChange('roster')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'roster' ? 'bg-orange-600 text-white shadow-md shadow-orange-950' : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" /> Employee Roster
          </button>
          <button
            onClick={() => handleTabChange('attendance')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'attendance' ? 'bg-orange-600 text-white shadow-md shadow-orange-950' : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4" /> Daily Attendance Sheet
          </button>
          <button
            onClick={() => handleTabChange('performance')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'performance' ? 'bg-orange-600 text-white shadow-md shadow-orange-950' : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <Award className="w-4 h-4" /> Staff Sales Performance
          </button>
          <button
            onClick={() => handleTabChange('users')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'users' ? 'bg-orange-600 text-white shadow-md shadow-orange-950' : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-4 h-4" /> System Users & PINs
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)}><X className="w-4 h-4 text-rose-400" /></button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)}><X className="w-4 h-4 text-emerald-400" /></button>
        </div>
      )}

      {/* TAB 1: EMPLOYEE ROSTER */}
      {activeTab === 'roster' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-slate-950/70 border border-slate-800 rounded-xl p-4">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search staff by name, code, phone..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-slate-500" />
              <select
                value={selectedDesignation}
                onChange={(e) => setSelectedDesignation(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-orange-500"
              >
                {uniqueDesignations.map((d) => (
                  <option key={d} value={d}>
                    {d === 'ALL' ? 'All Roles & Designations' : d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Employee Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEmployees.map((emp) => {
              const isClockedIn = emp.todayAttendance && !emp.todayAttendance.clock_out
              return (
                <div
                  key={emp.id}
                  className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all space-y-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-orange-400">
                          {emp.employee_code}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          isClockedIn ? 'bg-emerald-950 border border-emerald-700 text-emerald-400' : 'bg-slate-900 text-slate-500 border border-slate-800'
                        }`}>
                          {isClockedIn ? 'Clocked In' : 'Not Working'}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-white mt-1.5">
                        {emp.first_name} {emp.last_name}
                      </h3>
                      <div className="text-xs text-orange-400 font-semibold">{emp.designation}</div>
                    </div>

                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEditClick(emp)}
                        className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800"
                        title="Edit Profile"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Info list */}
                  <div className="space-y-1.5 text-xs text-slate-400 border-t border-slate-900 pt-3">
                    {emp.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-500" />
                        <span>{emp.phone}</span>
                      </div>
                    )}
                    {emp.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-500" />
                        <span className="truncate">{emp.email}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-3.5 h-3.5 text-slate-500" />
                      <span className="font-mono text-slate-300 font-semibold">
                        ${((emp.base_rate_cents || 0) / 100).toFixed(2)} / {emp.salary_type}
                      </span>
                    </div>
                  </div>

                  {/* Quick Attendance Action */}
                  <div className="border-t border-slate-800/60 pt-3 flex items-center justify-between">
                    <div className="text-[11px] text-slate-500 font-mono">
                      {isClockedIn ? `In: ${new Date(emp.todayAttendance.clock_in).toLocaleTimeString()}` : 'Off Duty'}
                    </div>
                    <button
                      onClick={() => handleOpenClockModal(emp)}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
                        isClockedIn
                          ? 'bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/80'
                          : 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/80'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      {isClockedIn ? 'Clock Out' : 'Clock In'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* TAB 2: ATTENDANCE SHEET */}
      {activeTab === 'attendance' && (
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-400" />
                Staff Daily Attendance Log
              </h3>
              <p className="text-[11px] text-slate-500">Track clock-in, clock-out, break times, and total work hours.</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold">Date:</span>
              <input
                type="date"
                value={attendanceDate}
                onChange={(e) => {
                  setAttendanceDate(e.target.value)
                  loadAttendance(e.target.value)
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none"
              />
            </div>
          </div>

          {attendanceLogs.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">No attendance records logged for {attendanceDate}.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Employee</th>
                    <th className="py-2.5 px-3">Designation</th>
                    <th className="py-2.5 px-3">Shift</th>
                    <th className="py-2.5 px-3">Clock In</th>
                    <th className="py-2.5 px-3">Clock Out</th>
                    <th className="py-2.5 px-3">Break</th>
                    <th className="py-2.5 px-3">Total Worked</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {attendanceLogs.map((log) => {
                    const hours = Math.floor((log.total_work_minutes || 0) / 60)
                    const mins = (log.total_work_minutes || 0) % 60
                    return (
                      <tr key={log.id} className="hover:bg-slate-900/40">
                        <td className="py-3 px-3 font-semibold text-white">
                          <div>{log.first_name} {log.last_name}</div>
                          <span className="text-[10px] font-mono text-slate-500">{log.employee_code}</span>
                        </td>
                        <td className="py-3 px-3 text-slate-400">{log.designation}</td>
                        <td className="py-3 px-3 font-mono text-slate-400">{log.shift_name || 'Standard'}</td>
                        <td className="py-3 px-3 font-mono text-emerald-400">{new Date(log.clock_in).toLocaleTimeString()}</td>
                        <td className="py-3 px-3 font-mono">
                          {log.clock_out ? (
                            <span className="text-rose-400">{new Date(log.clock_out).toLocaleTimeString()}</span>
                          ) : (
                            <span className="text-emerald-400 font-bold animate-pulse">● On Duty</span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-400">{log.break_minutes || 0}m</td>
                        <td className="py-3 px-3 font-mono font-bold text-white">
                          {log.clock_out ? `${hours}h ${mins}m` : 'In Progress'}
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-950 text-emerald-400 border border-emerald-800">
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: STAFF PERFORMANCE LEADERBOARD */}
      {activeTab === 'performance' && (
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Award className="w-4 h-4 text-orange-400" />
              Cashier & Waiter Sales Leaderboard
            </h3>
            <p className="text-[11px] text-slate-500">Track total revenue collected, transactions processed, and tender distribution by staff.</p>
          </div>

          {performanceData.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">No transactions recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-400 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Rank</th>
                    <th className="py-2.5 px-3">Staff Member</th>
                    <th className="py-2.5 px-3">Username</th>
                    <th className="py-2.5 px-3">Orders Handled</th>
                    <th className="py-2.5 px-3">Cash Collected</th>
                    <th className="py-2.5 px-3">Card Collected</th>
                    <th className="py-2.5 px-3 font-bold text-white">Total Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {performanceData.map((staff, idx) => (
                    <tr key={staff.user_id} className="hover:bg-slate-900/40">
                      <td className="py-3 px-3 font-bold">
                        <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-[10px] font-mono ${
                          idx === 0 ? 'bg-amber-500 text-black font-black' : idx === 1 ? 'bg-slate-300 text-black font-bold' : 'bg-slate-800 text-slate-400'
                        }`}>
                          #{idx + 1}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-white">{staff.display_name}</td>
                      <td className="py-3 px-3 font-mono text-slate-500">{staff.username}</td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-300">{staff.orders_handled}</td>
                      <td className="py-3 px-3 font-mono text-emerald-400">${((staff.cash_collected_cents || 0) / 100).toFixed(2)}</td>
                      <td className="py-3 px-3 font-mono text-cyan-400">${((staff.card_collected_cents || 0) / 100).toFixed(2)}</td>
                      <td className="py-3 px-3 font-mono font-black text-sm text-emerald-400">
                        ${((staff.total_collected_cents || 0) / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SYSTEM USERS & ACCESS */}
      {activeTab === 'users' && (
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-emerald-400" />
                POS & Terminal User Logins
              </h3>
              <p className="text-[11px] text-slate-500">Configure username, roles, and 4-digit PINs for terminal access.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {usersList.map((u) => (
              <div key={u.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-white text-xs">{u.display_name}</h4>
                    <span className="text-[11px] font-mono text-slate-500">@{u.username}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    u.is_active ? 'bg-emerald-950 border border-emerald-800 text-emerald-400' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {u.is_active ? 'Active' : 'Disabled'}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                  <span className="text-orange-400 font-semibold">{u.role_name}</span>
                  <button
                    onClick={() => {
                      setEditingUser(u)
                      setUserForm({
                        username: u.username,
                        displayName: u.display_name,
                        roleId: u.role_id,
                        pin: '',
                        isActive: u.is_active === 1,
                      })
                      setShowAddUserModal(true)
                    }}
                    className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300"
                  >
                    Edit / Reset PIN
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: Add / Edit Employee */}
      {showAddEmpModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-orange-400" />
                {editingEmp ? 'Edit Employee Profile' : 'Add New Employee'}
              </h3>
              <button onClick={() => setShowAddEmpModal(false)}><X className="w-5 h-5 text-slate-400 hover:text-white" /></button>
            </div>

            <form onSubmit={handleSaveEmployee} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">First Name *</label>
                  <input
                    type="text"
                    value={empForm.firstName}
                    onChange={(e) => setEmpForm({ ...empForm, firstName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-orange-500"
                    placeholder="e.g. Samantha"
                    required
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">Last Name *</label>
                  <input
                    type="text"
                    value={empForm.lastName}
                    onChange={(e) => setEmpForm({ ...empForm, lastName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-orange-500"
                    placeholder="e.g. Miller"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">Designation / Title *</label>
                  <input
                    type="text"
                    value={empForm.designation}
                    onChange={(e) => setEmpForm({ ...empForm, designation: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-orange-500"
                    placeholder="e.g. Senior Cashier"
                    required
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">System Role Access</label>
                  <select
                    value={empForm.roleId}
                    onChange={(e) => setEmpForm({ ...empForm, roleId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-orange-500"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={empForm.phone}
                    onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-orange-500"
                    placeholder="+1 555-0199"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">Email Address</label>
                  <input
                    type="email"
                    value={empForm.email}
                    onChange={(e) => setEmpForm({ ...empForm, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-orange-500"
                    placeholder="staff@restaurant.local"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">Pay Type</label>
                  <select
                    value={empForm.salaryType}
                    onChange={(e) => setEmpForm({ ...empForm, salaryType: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-orange-500"
                  >
                    <option value="HOURLY">Hourly Rate ($/hr)</option>
                    <option value="MONTHLY">Monthly Salary ($/mo)</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">Base Rate ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={empForm.baseRate}
                    onChange={(e) => setEmpForm({ ...empForm, baseRate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-orange-500"
                    placeholder="2500.00"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Emergency Contact Info</label>
                <input
                  type="text"
                  value={empForm.emergencyContact}
                  onChange={(e) => setEmpForm({ ...empForm, emergencyContact: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-orange-500"
                  placeholder="e.g. John Doe (Spouse) - +1 555-8822"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddEmpModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold transition-all"
                >
                  {editingEmp ? 'Save Changes' : 'Create Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Clock In / Clock Out Quick Action */}
      {showClockInOutModal && selectedEmpForClock && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-orange-400" />
                {clockAction === 'IN' ? 'Clock In Staff' : 'Clock Out Staff'}
              </h3>
              <button onClick={() => setShowClockInOutModal(false)}><X className="w-5 h-5 text-slate-400 hover:text-white" /></button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <div className="font-bold text-white text-sm">{selectedEmpForClock.first_name} {selectedEmpForClock.last_name}</div>
              <div className="text-orange-400 font-semibold">{selectedEmpForClock.designation}</div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">Code: {selectedEmpForClock.employee_code}</div>
            </div>

            <form onSubmit={handleSubmitClock} className="space-y-3.5 text-xs">
              {clockAction === 'OUT' && (
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">Unpaid Break Duration (Minutes)</label>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={breakMins}
                    onChange={(e) => setBreakMins(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-orange-500"
                    placeholder="30"
                  />
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  value={clockNotes}
                  onChange={(e) => setClockNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-orange-500"
                  placeholder={clockAction === 'IN' ? 'Morning shift start' : 'Completed shift'}
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowClockInOutModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 rounded-xl text-white font-bold transition-all ${
                    clockAction === 'IN' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                  }`}
                >
                  Confirm {clockAction === 'IN' ? 'Clock In' : 'Clock Out'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: System User Account */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-emerald-400" />
                {editingUser ? `Edit User: @${editingUser.username}` : 'Create Terminal User'}
              </h3>
              <button onClick={() => setShowAddUserModal(false)}><X className="w-5 h-5 text-slate-400 hover:text-white" /></button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-3.5 text-xs">
              {!editingUser && (
                <div>
                  <label className="font-semibold text-slate-300 block mb-1">Username *</label>
                  <input
                    type="text"
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-emerald-500"
                    placeholder="cashier2"
                    required
                  />
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Display Name *</label>
                <input
                  type="text"
                  value={userForm.displayName}
                  onChange={(e) => setUserForm({ ...userForm, displayName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                  placeholder="John Cashier"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">Role Permission Preset</label>
                <select
                  value={userForm.roleId}
                  onChange={(e) => setUserForm({ ...userForm, roleId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-300 block mb-1">
                  {editingUser ? 'Reset 4-Digit PIN (leave blank to keep current)' : '4-Digit Fast Login PIN *'}
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={userForm.pin}
                  onChange={(e) => setUserForm({ ...userForm, pin: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-center tracking-widest text-sm focus:outline-none focus:border-emerald-500"
                  placeholder="••••"
                  required={!editingUser}
                />
              </div>

              {editingUser && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="isActiveToggle"
                    checked={userForm.isActive}
                    onChange={(e) => setUserForm({ ...userForm, isActive: e.target.checked })}
                    className="rounded border-slate-800"
                  />
                  <label htmlFor="isActiveToggle" className="text-xs text-slate-300 font-semibold cursor-pointer">
                    Account Active (Permitted to log in)
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all"
                >
                  {editingUser ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
