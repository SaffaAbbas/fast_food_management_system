import crypto from 'node:crypto'

function uuid() {
  return crypto.randomUUID()
}

/**
 * Migration 006: Cash Drawer Shift Management, Staff Profiles & Attendance (Sections 16 & 17)
 * Adds:
 * - Cash session financial breakdown fields and manager approval
 * - Cash drawer denomination counts for reconciliation
 * - Staff shifts (timings, morning/evening/night)
 * - Employee profiles (linked users, designation, pay rate, contact, status)
 * - Staff attendance (clock-in, clock-out, break tracking, total hours worked)
 * - Initial operational staff seeds
 */
export const migration006 = {
  version: 6,
  name: 'shifts_staff_attendance_schema',
  up: (db) => {
    // 1. Enhance cash_sessions with financial breakdowns
    const columnsToAdd = [
      'total_cash_sales_cents INTEGER DEFAULT 0',
      'total_card_sales_cents INTEGER DEFAULT 0',
      'total_bank_sales_cents INTEGER DEFAULT 0',
      'total_online_sales_cents INTEGER DEFAULT 0',
      'total_refunds_cents INTEGER DEFAULT 0',
      'total_cash_in_cents INTEGER DEFAULT 0',
      'total_cash_out_cents INTEGER DEFAULT 0',
      'closing_notes TEXT',
      'manager_approval_user_id TEXT REFERENCES users(id)',
    ]

    for (const col of columnsToAdd) {
      try {
        db.exec(`ALTER TABLE cash_sessions ADD COLUMN ${col};`)
      } catch (e) {
        // Ignore if column already exists
      }
    }

    // 2. Cash Drawer Denominations for precise physical cash count
    db.exec(`
      CREATE TABLE IF NOT EXISTS cash_drawer_denominations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
        denomination_cents INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        total_cents INTEGER NOT NULL DEFAULT 0
      );
    `)

    // 3. Staff Shifts
    db.exec(`
      CREATE TABLE IF NOT EXISTS staff_shifts (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        name TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)

    // 4. Employee Profiles
    db.exec(`
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        user_id TEXT REFERENCES users(id),
        employee_code TEXT UNIQUE NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        designation TEXT NOT NULL,
        role_id TEXT REFERENCES roles(id),
        salary_type TEXT DEFAULT 'MONTHLY',
        base_rate_cents INTEGER DEFAULT 0,
        hire_date TEXT NOT NULL,
        status TEXT DEFAULT 'ACTIVE',
        emergency_contact TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)

    // 5. Staff Attendance
    db.exec(`
      CREATE TABLE IF NOT EXISTS staff_attendance (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        shift_id TEXT REFERENCES staff_shifts(id),
        clock_in TEXT NOT NULL,
        clock_out TEXT,
        break_minutes INTEGER DEFAULT 0,
        total_work_minutes INTEGER DEFAULT 0,
        status TEXT DEFAULT 'PRESENT',
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)

    // 6. Seed default staff shifts if empty
    const now = new Date().toISOString()
    const activeBranch = db.prepare('SELECT id FROM branches LIMIT 1').get()
    const branchId = activeBranch?.id

    if (branchId) {
      const shiftCount = db.prepare('SELECT COUNT(*) as count FROM staff_shifts').get().count
      if (shiftCount === 0) {
        const shifts = [
          { name: 'Morning Shift', start: '08:00', end: '16:00' },
          { name: 'Evening Shift', start: '16:00', end: '00:00' },
          { name: 'Night Shift', start: '00:00', end: '08:00' },
        ]

        const insertShift = db.prepare(`
          INSERT INTO staff_shifts (id, branch_id, name, start_time, end_time, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        `)

        for (const s of shifts) {
          insertShift.run(uuid(), branchId, s.name, s.start, s.end, now, now)
        }
      }

      // 7. Seed employees linked to default seeded users
      const empCount = db.prepare('SELECT COUNT(*) as count FROM employees').get().count
      if (empCount === 0) {
        const users = db.prepare('SELECT id, username, display_name, role_id FROM users').all()
        const insertEmp = db.prepare(`
          INSERT INTO employees (
            id, branch_id, user_id, employee_code, first_name, last_name,
            email, phone, designation, role_id, salary_type, base_rate_cents,
            hire_date, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
        `)

        let codeIndex = 101
        for (const u of users) {
          const names = u.display_name.split(' ')
          const firstName = names[0] || u.username
          const lastName = names.slice(1).join(' ') || 'Staff'
          const designation = u.username.includes('admin')
            ? 'General Manager'
            : u.username.includes('manager')
            ? 'Floor Manager'
            : u.username.includes('cashier')
            ? 'Senior Cashier'
            : u.username.includes('waiter')
            ? 'Head Waiter'
            : u.username.includes('chef')
            ? 'Head Chef'
            : 'Staff Member'

          insertEmp.run(
            uuid(),
            branchId,
            u.id,
            `EMP-${codeIndex++}`,
            firstName,
            lastName,
            `${u.username}@restaurant.local`,
            '+1 555-01' + codeIndex,
            designation,
            u.role_id,
            'MONTHLY',
            250000, // $2,500/mo base
            '2026-01-01',
            now,
            now
          )
        }
      }
    }
  },
}
