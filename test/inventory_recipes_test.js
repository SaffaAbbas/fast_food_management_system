/**
 * Phase 7: Inventory, Recipes, Purchases & Expenses Integration Test Suite
 * Validates:
 * - Migration 005 schema application
 * - Inventory items CRUD and stock movement ledger
 * - Recipe definition, ingredient linkages, and food cost / gross margin calculation
 * - Automatic recipe ingredient deduction upon POS payment settlement (Sections 1.1 & 11)
 * - Suppliers, Purchase Orders / GRN with automatic stock intake
 * - Vendor payment recording and outstanding balance tracking
 * - Expense recording and categorization
 * - Full audit trail verification
 */

import { initDatabase, closeDatabase } from '../electron/db/index.js'
import { authRepository } from '../electron/db/repositories/authRepository.js'
import { inventoryRepository } from '../electron/db/repositories/inventoryRepository.js'
import { orderRepository } from '../electron/db/repositories/orderRepository.js'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'

const TEST_DIR = path.resolve(process.cwd(), 'test_inventory_scratch')
const TEST_DB_PATH = path.join(TEST_DIR, 'test_inventory.sqlite')

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
  }
}

async function runTestSuite() {
  console.log('\n====================================================')
  console.log('🧪 Starting Phase 7: Inventory, Recipes & Expenses Test Suite')
  console.log('====================================================\n')

  cleanup()
  fs.mkdirSync(TEST_DIR, { recursive: true })

  // 1. Initialize DB with Migration 005
  console.log('--- Test 1: Initialize Database & Run Migration 005 ---')
  const db = initDatabase({ dbPath: TEST_DB_PATH, seed: true })

  const versionRow = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get()
  assert.strictEqual(versionRow.version >= 5, true, 'Schema version must be at least 5')
  console.log(`✓ Database initialized at Schema Version: ${versionRow.version}`)

  // 2. Authenticate as Manager
  console.log('\n--- Test 2: Authenticate Manager for Inventory Operations ---')
  const managerUser = db.prepare("SELECT * FROM users WHERE username = 'manager'").get()
  assert.ok(managerUser, 'Manager user must exist')
  const session = authRepository.loginWithPin('4321', managerUser.id)
  console.log(`✓ Authenticated as: ${session.displayName} (Role: ${session.roleCode})`)

  // 3. Inventory Units & Raw Items Master
  console.log('\n--- Test 3: Inventory Units & Stock Master ---')
  const units = inventoryRepository.getUnits()
  assert.strictEqual(units.length >= 4, true, 'Must have default units (kg, g, pc, L)')
  console.log(`✓ Units verified (${units.length}): ${units.map((u) => u.abbreviation).join(', ')}`)

  const pcUnit = units.find((u) => u.abbreviation === 'pc')
  assert.ok(pcUnit, 'Piece unit must exist')

  const items = inventoryRepository.getItems()
  assert.strictEqual(items.length >= 8, true, 'Must have seeded raw inventory items')
  console.log(`✓ Retrieved ${items.length} raw inventory items. Sample items:`)
  items.slice(0, 4).forEach((it) => {
    console.log(`   - ${it.name} | Stock: ${it.current_stock} ${it.unit_abbr} | Cost: $${(it.cost_per_unit_cents / 100).toFixed(2)} | Cat: ${it.category}`)
  })

  // Create a new raw item
  const branch = db.prepare('SELECT id FROM branches LIMIT 1').get()
  const createdItem = inventoryRepository.createItem({
    branchId: branch.id,
    name: 'Gourmet Truffle Oil',
    sku: 'RAW-TRUF-01',
    unitId: units.find((u) => u.abbreviation === 'L')?.id || pcUnit.id,
    openingStock: 5.0,
    minimumLevel: 1.0,
    costPerUnitCents: 3500, // $35.00/L
    category: 'Pantry & Oils',
  })
  assert.strictEqual(createdItem.name, 'Gourmet Truffle Oil')
  assert.strictEqual(createdItem.current_stock, 5.0)
  console.log(`✓ Created New Inventory Item: ${createdItem.name} (Stock: ${createdItem.current_stock})`)

  // 4. Stock Adjustment & Wastage Ledger
  console.log('\n--- Test 4: Stock Adjustment & Movement Ledger ---')
  const beefItem = items.find((it) => it.name.includes('Beef Patties'))
  assert.ok(beefItem, 'Beef patties item must exist')
  const initialBeefStock = beefItem.current_stock

  // Add 10 patties via manual adjustment
  const adjustedItem = inventoryRepository.adjustStock({
    itemId: beefItem.id,
    branchId: branch.id,
    quantityChange: 10,
    movementType: 'ADJUSTMENT',
    reason: 'Weekly stock recount correction',
    userId: session.id,
  })
  assert.strictEqual(adjustedItem.current_stock, initialBeefStock + 10)
  console.log(`✓ Stock adjusted for "${beefItem.name}": ${initialBeefStock} -> ${adjustedItem.current_stock}`)

  // Record 2 wasted patties
  const wastedItem = inventoryRepository.adjustStock({
    itemId: beefItem.id,
    branchId: branch.id,
    quantityChange: -2,
    movementType: 'WASTAGE',
    reason: 'Dropped on floor during prep',
    userId: session.id,
  })
  assert.strictEqual(wastedItem.current_stock, initialBeefStock + 8)
  console.log(`✓ Wastage recorded: ${wastedItem.current_stock} remaining`)

  // Check movement ledger
  const movements = inventoryRepository.getStockMovements({ itemId: beefItem.id })
  assert.strictEqual(movements.length >= 2, true, 'Must record adjustments in ledger')
  console.log(`✓ Movement Ledger verified (${movements.length} records for ${beefItem.name})`)

  // 5. Recipes & Food Cost Calculation
  console.log('\n--- Test 5: Recipes & Food Cost Calculation ---')
  const recipes = inventoryRepository.getRecipes({ branchId: branch.id })
  assert.strictEqual(recipes.length >= 1, true, 'Seeded recipes must be present')
  const burgerRecipe = recipes.find((r) => r.product_name.includes('Cheeseburger'))
  assert.ok(burgerRecipe, 'Burger recipe must exist')
  assert.strictEqual(burgerRecipe.ingredients.length >= 2, true, 'Must have at least 2 ingredients')
  console.log(`✓ Recipe Retrieved for: ${burgerRecipe.product_name}`)
  console.log(`   - Selling Price: $${(burgerRecipe.sellingPriceCents / 100).toFixed(2)}`)
  console.log(`   - Calculated Food Cost: $${(burgerRecipe.foodCostCents / 100).toFixed(2)}`)
  console.log(`   - Gross Margin: $${(burgerRecipe.grossMarginCents / 100).toFixed(2)}`)
  console.log(`   - Food Cost %: ${burgerRecipe.foodCostPercentage}%`)
  assert.strictEqual(burgerRecipe.foodCostCents > 0, true, 'Food cost must be positive')

  // 6. Automatic Recipe Ingredient Deduction on Order Payment
  console.log('\n--- Test 6: Automatic Recipe Stock Deduction on POS Payment ---')
  const burgerProduct = db.prepare("SELECT * FROM products WHERE name LIKE '%Cheeseburger%' LIMIT 1").get()
  const table = db.prepare("SELECT id, table_number FROM dining_tables WHERE status = 'AVAILABLE' LIMIT 1").get()

  // Note current stock of beef patties before order
  const currentBeefBeforeOrder = inventoryRepository.getItemById(beefItem.id).current_stock

  // Create POS Dine-In Order with 2x Cheeseburgers
  const testOrder = orderRepository.createOrder({
    branchId: branch.id,
    orderNumber: 'INV-ORD-RECIPE-01',
    orderType: 'DINE_IN',
    tableId: table.id,
    subtotalCents: 1900,
    totalCents: 1995,
    cashierId: session.id,
    items: [
      {
        productId: burgerProduct.id,
        name: burgerProduct.name,
        quantity: 2,
        unitPriceCents: 950,
        totalCents: 1900,
      },
    ],
  })

  console.log(`✓ Created Order ${testOrder.order_number} for 2x ${burgerProduct.name}`)

  // Process full payment -> triggers auto recipe deduction
  const settled = orderRepository.processPayment({
    orderId: testOrder.id,
    branchId: branch.id,
    cashierId: session.id,
    payments: [{ paymentMethod: 'CASH', amountCents: 1995 }],
    tenderedCents: 2000,
    changeCents: 5,
  })
  assert.strictEqual(settled.status, 'COMPLETED')

  // Verify beef patties stock was automatically reduced by exactly 2 units!
  const currentBeefAfterPayment = inventoryRepository.getItemById(beefItem.id).current_stock
  const expectedBeefStock = currentBeefBeforeOrder - 2.0
  assert.strictEqual(currentBeefAfterPayment, expectedBeefStock, 'Stock must be deducted by exactly 2 units')
  console.log(`✓ Automatic Recipe Stock Deduction Confirmed!`)
  console.log(`   - Beef Patties Before Order: ${currentBeefBeforeOrder}`)
  console.log(`   - Beef Patties After Order (2 sold): ${currentBeefAfterPayment}`)

  // Verify stock movement ledger captured SALE_DEDUCTION
  const saleDeductions = db.prepare(`
    SELECT * FROM stock_movements
    WHERE movement_type = 'SALE_DEDUCTION' AND reference_id = ?
  `).all(testOrder.id)
  assert.strictEqual(saleDeductions.length >= 1, true, 'Must record SALE_DEDUCTION in movement ledger')
  console.log(`✓ Stock movement recorded with type: ${saleDeductions[0].movement_type} (Reason: ${saleDeductions[0].reason})`)

  // 7. Suppliers & Purchase Order / GRN Stock Intake
  console.log('\n--- Test 7: Suppliers, Purchase Orders & Auto Stock In ---')
  const suppliers = inventoryRepository.getSuppliers(branch.id)
  assert.strictEqual(suppliers.length >= 3, true, 'Seeded suppliers must exist')
  const apexSupplier = suppliers.find((s) => s.company_name.includes('Apex Prime Meats'))
  assert.ok(apexSupplier, 'Apex supplier must exist')
  console.log(`✓ Retrieved ${suppliers.length} Suppliers. Selected: ${apexSupplier.company_name}`)

  // Record a Goods Received Purchase Order for 50 fresh patties
  const beefStockBeforePO = inventoryRepository.getItemById(beefItem.id).current_stock
  const createdPo = inventoryRepository.createPurchaseOrder({
    branchId: branch.id,
    supplierId: apexSupplier.id,
    poNumber: 'PO-APEX-101',
    notes: 'Weekly fresh meat delivery',
    autoReceive: true,
    items: [
      {
        inventoryItemId: beefItem.id,
        quantity: 50.0,
        unitCostCents: 215, // new negotiated rate
        totalCents: 10750,
      },
    ],
  })
  assert.strictEqual(createdPo.status, 'RECEIVED')

  // Check that stock was automatically incremented by 50!
  const beefStockAfterPO = inventoryRepository.getItemById(beefItem.id).current_stock
  assert.strictEqual(beefStockAfterPO, beefStockBeforePO + 50.0)
  console.log(`✓ Purchase Order received & stock automatically updated: ${beefStockBeforePO} + 50 -> ${beefStockAfterPO}`)

  // Record payment to supplier
  const paymentRecord = inventoryRepository.recordVendorPayment({
    branchId: branch.id,
    supplierId: apexSupplier.id,
    poId: createdPo.id,
    amountCents: 10750,
    paymentMethod: 'BANK_TRANSFER',
    referenceNumber: 'TX-WIRE-7788',
    notes: 'Paid in full via Bank Wire',
  })
  assert.strictEqual(paymentRecord.amount_cents, 10750)
  console.log(`✓ Vendor Payment recorded: $${(paymentRecord.amount_cents / 100).toFixed(2)} to ${apexSupplier.company_name}`)

  // 8. Expense Management
  console.log('\n--- Test 8: Expense Management & Categorization ---')
  const expenseCategories = inventoryRepository.getExpenseCategories()
  assert.strictEqual(expenseCategories.length >= 6, true, 'Default expense categories must exist')
  console.log(`✓ Expense Categories verified (${expenseCategories.length}): ${expenseCategories.map((c) => c.name).join(', ')}`)

  const rentCat = expenseCategories.find((c) => c.code === 'RENT')
  assert.ok(rentCat, 'Rent category must exist')

  const createdExpense = inventoryRepository.createExpense({
    branchId: branch.id,
    categoryId: rentCat.id,
    amountCents: 250000, // $2,500.00
    paymentMethod: 'BANK_TRANSFER',
    payee: 'Grand Plaza Properties LLC',
    description: 'Monthly store location rent for Main Branch',
    userId: session.id,
  })
  assert.strictEqual(createdExpense.amount_cents, 250000)
  console.log(`✓ Created Expense: $${(createdExpense.amount_cents / 100).toFixed(2)} under ${createdExpense.category_name}`)

  const summary = inventoryRepository.getExpenseSummary({ branchId: branch.id })
  assert.strictEqual(summary.totalCents >= 250000, true)
  console.log(`✓ Expense Summary Verified: Total $${(summary.totalCents / 100).toFixed(2)} across ${summary.categoryBreakdown.length} categories`)

  // 9. Audit Logs Check
  console.log('\n--- Test 9: Inventory Audit Logs Verification ---')
  const invAuditLogs = db.prepare(`
    SELECT * FROM audit_logs
    WHERE action IN ('CREATE_INVENTORY_ITEM', 'ADJUST_STOCK', 'CREATE_PURCHASE_ORDER', 'RECORD_EXPENSE')
  `).all()
  assert.strictEqual(invAuditLogs.length >= 4, true, 'All inventory actions must be logged')
  console.log(`✓ Captured ${invAuditLogs.length} Phase 7 Audit Logs!`)

  // Cleanup
  closeDatabase()
  cleanup()
  console.log('✓ Cleaned up test artifacts.')

  console.log('\n====================================================')
  console.log('🎉 ALL PHASE 7 INVENTORY, RECIPE & EXPENSE TESTS PASSED!')
  console.log('====================================================\n')
}

runTestSuite().catch((err) => {
  console.error('\n❌ INVENTORY TEST SUITE FAILED:', err)
  closeDatabase()
  cleanup()
  process.exit(1)
})
