import { getDb } from '../index.js'
import crypto from 'node:crypto'
import { authRepository } from './authRepository.js'

function uuid() {
  return crypto.randomUUID()
}

function resolveValidBranchId(db, branchId) {
  if (branchId) {
    const b = db.prepare('SELECT id FROM branches WHERE id = ?').get(branchId)
    if (b) return b.id
  }
  const session = authRepository.getCurrentSession()
  if (session?.branchId) {
    const b = db.prepare('SELECT id FROM branches WHERE id = ?').get(session.branchId)
    if (b) return b.id
  }
  const fallback = db.prepare('SELECT id FROM branches LIMIT 1').get()
  return fallback?.id || null
}

function resolveValidUserId(db, userId) {
  if (userId) {
    const u = db.prepare('SELECT id FROM users WHERE id = ?').get(userId)
    if (u) return u.id
  }
  const session = authRepository.getCurrentSession()
  if (session?.id) {
    const u = db.prepare('SELECT id FROM users WHERE id = ?').get(session.id)
    if (u) return u.id
  }
  const fallback = db.prepare('SELECT id FROM users WHERE is_active = 1 LIMIT 1').get()
  return fallback?.id || null
}

function logAudit(branchId, action, entityType, entityId, details) {
  try {
    const db = getDb()
    const validUserId = resolveValidUserId(db, null)
    const validBranchId = resolveValidBranchId(db, branchId)
    db.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid(),
      validBranchId,
      validUserId,
      action,
      entityType,
      entityId,
      JSON.stringify(details),
      new Date().toISOString()
    )
  } catch (err) {
    console.error('[Staff Audit Log Error]:', err)
  }
}

export const staffRepository = {
  /**
   * Get employee roster with today's live attendance status
   */
  getEmployees: ({ branchId, search = '', status = null, designation = null } = {}) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, branchId)

    let sql = `
      SELECT e.*,
             r.name as role_name, r.code as role_code,
             u.username, u.display_name as user_display_name, u.is_active as user_active
      FROM employees e
      LEFT JOIN roles r ON e.role_id = r.id
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.branch_id = ?
    `
    const params = [validBranchId]

    if (status) {
      sql += ' AND e.status = ?'
      params.push(status)
    }

    if (designation) {
      sql += ' AND e.designation = ?'
      params.push(designation)
    }

    if (search && search.trim() !== '') {
      sql += ' AND (e.first_name LIKE ? OR e.last_name LIKE ? OR e.employee_code LIKE ? OR e.phone LIKE ?)'
      const term = `%${search.trim()}%`
      params.push(term, term, term, term)
    }

    sql += ' ORDER BY e.employee_code ASC'
    const employees = db.prepare(sql).all(...params)

    // Attach today's attendance record for each employee
    const today = new Date().toISOString().slice(0, 10)
    for (const emp of employees) {
      const att = db.prepare(`
        SELECT sa.*, ss.name as shift_name
        FROM staff_attendance sa
        LEFT JOIN staff_shifts ss ON sa.shift_id = ss.id
        WHERE sa.employee_id = ? AND sa.clock_in >= ?
        ORDER BY sa.clock_in DESC LIMIT 1
      `).get(emp.id, `${today}T00:00:00.000Z`)

      emp.todayAttendance = att || null
    }

    return employees
  },

  /**
   * Get employee by ID
   */
  getEmployeeById: (employeeId) => {
    const db = getDb()
    const emp = db.prepare(`
      SELECT e.*, r.name as role_name, r.code as role_code,
             u.username, u.display_name as user_display_name
      FROM employees e
      LEFT JOIN roles r ON e.role_id = r.id
      LEFT JOIN users u ON e.user_id = u.id
      WHERE e.id = ?
    `).get(employeeId)

    if (!emp) return null

    // Fetch last 15 attendance records
    emp.recentAttendance = db.prepare(`
      SELECT sa.*, ss.name as shift_name
      FROM staff_attendance sa
      LEFT JOIN staff_shifts ss ON sa.shift_id = ss.id
      WHERE sa.employee_id = ?
      ORDER BY sa.clock_in DESC LIMIT 15
    `).all(employeeId)

    return emp
  },

  /**
   * Create new employee profile
   */
  createEmployee: (data) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, data.branchId)
    const empId = uuid()
    const now = new Date().toISOString()

    // Generate unique employee code if not provided
    let empCode = data.employeeCode
    if (!empCode || empCode.trim() === '') {
      const maxCount = db.prepare('SELECT COUNT(*) as count FROM employees').get().count
      empCode = `EMP-${(maxCount + 101).toString()}`
    }

    db.prepare(`
      INSERT INTO employees (
        id, branch_id, user_id, employee_code, first_name, last_name,
        email, phone, designation, role_id, salary_type, base_rate_cents,
        hire_date, status, emergency_contact, notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `).run(
      empId,
      validBranchId,
      data.userId || null,
      empCode.trim().toUpperCase(),
      data.firstName.trim(),
      data.lastName.trim(),
      data.email || null,
      data.phone || null,
      data.designation || 'Staff Member',
      data.roleId || null,
      data.salaryType || 'MONTHLY',
      Math.max(0, parseInt(data.baseRateCents, 10) || 0),
      data.hireDate || now.slice(0, 10),
      data.status || 'ACTIVE',
      data.emergencyContact || null,
      data.notes || null,
      now,
      now
    )

    logAudit(validBranchId, 'CREATE_EMPLOYEE', 'EMPLOYEE', empId, {
      employeeCode: empCode,
      name: `${data.firstName} ${data.lastName}`,
      designation: data.designation,
    })

    return staffRepository.getEmployeeById(empId)
  },

  /**
   * Update employee profile
   */
  updateEmployee: (id, data) => {
    const db = getDb()
    const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(id)
    if (!existing) throw new Error('Employee not found.')

    const now = new Date().toISOString()
    db.prepare(`
      UPDATE employees
      SET first_name = ?,
          last_name = ?,
          email = ?,
          phone = ?,
          designation = ?,
          role_id = ?,
          user_id = ?,
          salary_type = ?,
          base_rate_cents = ?,
          status = ?,
          emergency_contact = ?,
          notes = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      data.firstName !== undefined ? data.firstName.trim() : existing.first_name,
      data.lastName !== undefined ? data.lastName.trim() : existing.last_name,
      data.email !== undefined ? data.email : existing.email,
      data.phone !== undefined ? data.phone : existing.phone,
      data.designation !== undefined ? data.designation : existing.designation,
      data.roleId !== undefined ? data.roleId : existing.role_id,
      data.userId !== undefined ? data.userId : existing.user_id,
      data.salaryType !== undefined ? data.salaryType : existing.salary_type,
      data.baseRateCents !== undefined ? Math.max(0, parseInt(data.baseRateCents, 10) || 0) : existing.base_rate_cents,
      data.status !== undefined ? data.status : existing.status,
      data.emergencyContact !== undefined ? data.emergencyContact : existing.emergency_contact,
      data.notes !== undefined ? data.notes : existing.notes,
      now,
      id
    )

    logAudit(existing.branch_id, 'UPDATE_EMPLOYEE', 'EMPLOYEE', id, { ...data })
    return staffRepository.getEmployeeById(id)
  },

  /**
   * Clock in an employee
   */
  clockIn: ({ employeeId, branchId, shiftId = null, notes = null }) => {
    const db = getDb()
    const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId)
    if (!emp) throw new Error('Employee not found.')

    const validBranchId = resolveValidBranchId(db, branchId || emp.branch_id)
    const today = new Date().toISOString().slice(0, 10)

    // Check if currently clocked in without clock out
    const activeAttendance = db.prepare(`
      SELECT id FROM staff_attendance
      WHERE employee_id = ? AND clock_out IS NULL
    `).get(employeeId)

    if (activeAttendance) {
      throw new Error(`${emp.first_name} ${emp.last_name} is already clocked in. Please clock out first.`)
    }

    const attendanceId = uuid()
    const now = new Date().toISOString()

    // Determine default shift if not specified
    let selectedShiftId = shiftId
    if (!selectedShiftId) {
      const firstShift = db.prepare('SELECT id FROM staff_shifts WHERE branch_id = ? AND is_active = 1 LIMIT 1').get(validBranchId)
      selectedShiftId = firstShift?.id || null
    }

    db.prepare(`
      INSERT INTO staff_attendance (
        id, branch_id, employee_id, shift_id, clock_in, clock_out,
        break_minutes, total_work_minutes, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, NULL, 0, 0, 'PRESENT', ?, ?, ?)
    `).run(
      attendanceId,
      validBranchId,
      employeeId,
      selectedShiftId,
      now,
      notes || null,
      now,
      now
    )

    logAudit(validBranchId, 'CLOCK_IN', 'ATTENDANCE', attendanceId, {
      employeeId,
      employeeCode: emp.employee_code,
      clockIn: now,
    })

    return db.prepare('SELECT * FROM staff_attendance WHERE id = ?').get(attendanceId)
  },

  /**
   * Clock out an employee & compute total worked minutes
   */
  clockOut: ({ attendanceId, breakMinutes = 0, notes = null }) => {
    const db = getDb()
    const att = db.prepare('SELECT * FROM staff_attendance WHERE id = ?').get(attendanceId)
    if (!att) throw new Error('Attendance record not found.')
    if (att.clock_out) throw new Error('Employee has already clocked out for this session.')

    const now = new Date().toISOString()
    const clockInTime = new Date(att.clock_in).getTime()
    const clockOutTime = new Date(now).getTime()

    const rawMinutes = Math.max(0, Math.round((clockOutTime - clockInTime) / (1000 * 60)))
    const parsedBreak = Math.max(0, parseInt(breakMinutes, 10) || 0)
    const totalWorkMinutes = Math.max(0, rawMinutes - parsedBreak)

    db.prepare(`
      UPDATE staff_attendance
      SET clock_out = ?,
          break_minutes = ?,
          total_work_minutes = ?,
          notes = COALESCE(notes || ' | ' || ?, ?),
          updated_at = ?
      WHERE id = ?
    `).run(
      now,
      parsedBreak,
      totalWorkMinutes,
      notes,
      notes,
      now,
      attendanceId
    )

    logAudit(att.branch_id, 'CLOCK_OUT', 'ATTENDANCE', attendanceId, {
      clockOut: now,
      totalWorkMinutes,
      breakMinutes: parsedBreak,
    })

    return db.prepare('SELECT * FROM staff_attendance WHERE id = ?').get(attendanceId)
  },

  /**
   * Get attendance logs
   */
  getAttendanceLogs: ({ branchId, date = null, employeeId = null, limit = 50, offset = 0 } = {}) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, branchId)

    let sql = `
      SELECT sa.*,
             e.first_name, e.last_name, e.employee_code, e.designation,
             ss.name as shift_name
      FROM staff_attendance sa
      JOIN employees e ON sa.employee_id = e.id
      LEFT JOIN staff_shifts ss ON sa.shift_id = ss.id
      WHERE sa.branch_id = ?
    `
    const params = [validBranchId]

    if (employeeId) {
      sql += ' AND sa.employee_id = ?'
      params.push(employeeId)
    }

    if (date) {
      sql += ' AND sa.clock_in LIKE ?'
      params.push(`${date}%`)
    }

    sql += ' ORDER BY sa.clock_in DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    return db.prepare(sql).all(...params)
  },

  /**
   * Staff Performance Analytics (Sales generated, orders processed)
   */
  getStaffPerformance: ({ branchId, startDate = null, endDate = null } = {}) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, branchId)

    let paymentDateFilter = ''
    const joinParams = []
    if (startDate) {
      paymentDateFilter += ' AND p.created_at >= ?'
      joinParams.push(startDate)
    }
    if (endDate) {
      paymentDateFilter += ' AND p.created_at <= ?'
      joinParams.push(endDate)
    }

    // Cashier performance
    const cashierStats = db.prepare(`
      SELECT u.id as user_id, u.display_name, u.username,
             COUNT(DISTINCT p.order_id) as orders_handled,
             COUNT(p.id) as transactions_count,
             COALESCE(SUM(p.amount_cents), 0) as total_collected_cents,
             COALESCE(SUM(CASE WHEN p.payment_method = 'CASH' THEN p.amount_cents ELSE 0 END), 0) as cash_collected_cents,
             COALESCE(SUM(CASE WHEN p.payment_method = 'CARD' THEN p.amount_cents ELSE 0 END), 0) as card_collected_cents
      FROM users u
      LEFT JOIN payments p ON p.cashier_id = u.id AND p.status = 'COMPLETED' ${paymentDateFilter}
      WHERE u.branch_id = ?
      GROUP BY u.id
      ORDER BY total_collected_cents DESC
    `).all(...joinParams, validBranchId)

    return {
      cashierPerformance: cashierStats,
    }
  },

  /**
   * Get all shifts
   */
  getShifts: (branchId) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, branchId)
    return db.prepare('SELECT * FROM staff_shifts WHERE branch_id = ? ORDER BY start_time ASC').all(validBranchId)
  },

  /**
   * Save or update shift
   */
  saveShift: (shiftData) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, shiftData.branchId)
    const now = new Date().toISOString()

    if (shiftData.id) {
      db.prepare(`
        UPDATE staff_shifts
        SET name = ?, start_time = ?, end_time = ?, is_active = ?, updated_at = ?
        WHERE id = ?
      `).run(
        shiftData.name,
        shiftData.startTime,
        shiftData.endTime,
        shiftData.isActive !== false ? 1 : 0,
        now,
        shiftData.id
      )
      return db.prepare('SELECT * FROM staff_shifts WHERE id = ?').get(shiftData.id)
    }

    const id = uuid()
    db.prepare(`
      INSERT INTO staff_shifts (id, branch_id, name, start_time, end_time, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      validBranchId,
      shiftData.name,
      shiftData.startTime,
      shiftData.endTime,
      shiftData.isActive !== false ? 1 : 0,
      now,
      now
    )
    return db.prepare('SELECT * FROM staff_shifts WHERE id = ?').get(id)
  },

  /**
   * User Administration for managers
   */
  getUsers: (branchId) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, branchId)
    return db.prepare(`
      SELECT u.id, u.branch_id, u.role_id, u.username, u.display_name,
             u.is_active, u.last_login_at, u.created_at,
             r.name as role_name, r.code as role_code
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.branch_id = ?
      ORDER BY u.created_at ASC
    `).all(validBranchId)
  },

  getRoles: () => {
    const db = getDb()
    return db.prepare('SELECT * FROM roles ORDER BY name ASC').all()
  },

  createUser: (userData) => {
    const db = getDb()
    const validBranchId = resolveValidBranchId(db, userData.branchId)
    const userId = uuid()
    const now = new Date().toISOString()

    // Check duplicate username
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(userData.username.trim().toLowerCase())
    if (existing) throw new Error(`Username "${userData.username}" is already taken.`)

    // Simple hash for pin/password
    const pin = userData.pin || '1234'
    const pinHash = crypto.createHash('sha256').update(pin).digest('hex')

    db.prepare(`
      INSERT INTO users (
        id, branch_id, role_id, username, display_name, pin_hash, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      userId,
      validBranchId,
      userData.roleId,
      userData.username.trim().toLowerCase(),
      userData.displayName.trim(),
      pinHash,
      now,
      now
    )

    logAudit(validBranchId, 'CREATE_USER', 'USER', userId, {
      username: userData.username,
      displayName: userData.displayName,
    })

    return db.prepare(`
      SELECT u.id, u.branch_id, u.role_id, u.username, u.display_name,
             u.is_active, r.name as role_name, r.code as role_code
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = ?
    `).get(userId)
  },

  updateUser: (id, userData) => {
    const db = getDb()
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    if (!existing) throw new Error('User not found.')

    const now = new Date().toISOString()
    let pinHash = existing.pin_hash
    if (userData.pin && userData.pin.trim() !== '') {
      pinHash = crypto.createHash('sha256').update(userData.pin.trim()).digest('hex')
    }

    db.prepare(`
      UPDATE users
      SET display_name = ?,
          role_id = ?,
          is_active = ?,
          pin_hash = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      userData.displayName !== undefined ? userData.displayName.trim() : existing.display_name,
      userData.roleId !== undefined ? userData.roleId : existing.role_id,
      userData.isActive !== undefined ? (userData.isActive ? 1 : 0) : existing.is_active,
      pinHash,
      now,
      id
    )

    logAudit(existing.branch_id, 'UPDATE_USER', 'USER', id, { ...userData })

    return db.prepare(`
      SELECT u.id, u.branch_id, u.role_id, u.username, u.display_name,
             u.is_active, r.name as role_name, r.code as role_code
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = ?
    `).get(id)
  },
}
