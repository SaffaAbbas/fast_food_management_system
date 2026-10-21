import crypto from 'node:crypto'

function uuid() {
  return crypto.randomUUID()
}

/**
 * Migration 008: Delivery & Dispatch Management (Section 8)
 * Adds:
 * - delivery_zones (Zone pricing, minimum order, estimated times)
 * - riders (Fleet & vehicle management, real-time availability states)
 * - deliveries (Order dispatching, status tracking, timestamps, COD management)
 * - rider_settlements (Cash-on-delivery cashier remittance ledger)
 */
export const migration008 = {
  version: 8,
  name: 'delivery_dispatch_riders_schema',
  up: (db) => {
    // 1. Delivery Zones
    db.exec(`
      CREATE TABLE IF NOT EXISTS delivery_zones (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        name TEXT NOT NULL,
        delivery_charge_cents INTEGER NOT NULL DEFAULT 300,
        min_order_cents INTEGER NOT NULL DEFAULT 1500,
        estimated_minutes INTEGER NOT NULL DEFAULT 35,
        description TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)

    // 2. Riders Fleet
    db.exec(`
      CREATE TABLE IF NOT EXISTS riders (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        employee_id TEXT REFERENCES employees(id),
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        vehicle_type TEXT NOT NULL DEFAULT 'MOTORCYCLE', -- MOTORCYCLE, BICYCLE, CAR, SCOOTER
        license_plate TEXT,
        status TEXT NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE, ASSIGNED, OUT_FOR_DELIVERY, OFFLINE
        current_delivery_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)

    // 3. Deliveries Dispatch Table
    db.exec(`
      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        zone_id TEXT REFERENCES delivery_zones(id),
        rider_id TEXT REFERENCES riders(id),
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        delivery_address TEXT NOT NULL,
        delivery_instructions TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, ASSIGNED, OUT_FOR_DELIVERY, DELIVERED, FAILED, CANCELLED
        dispatched_at TEXT,
        delivered_at TEXT,
        failed_reason TEXT,
        cod_amount_cents INTEGER NOT NULL DEFAULT 0,
        cod_collected_cents INTEGER NOT NULL DEFAULT 0,
        cod_settled INTEGER NOT NULL DEFAULT 0, -- 0 = pending remittance, 1 = settled
        settlement_id TEXT REFERENCES rider_settlements(id),
        settled_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)

    // 4. Rider COD Settlements Ledger
    db.exec(`
      CREATE TABLE IF NOT EXISTS rider_settlements (
        id TEXT PRIMARY KEY,
        branch_id TEXT NOT NULL REFERENCES branches(id),
        rider_id TEXT NOT NULL REFERENCES riders(id),
        settled_by_user_id TEXT NOT NULL REFERENCES users(id),
        total_collected_cents INTEGER NOT NULL,
        orders_count INTEGER NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL
      );
    `)
  },
}
