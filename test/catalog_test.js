import path from 'node:path'
import fs from 'node:fs'
import { initDatabase, closeDatabase, getDb } from '../electron/db/index.js'
import { productRepository } from '../electron/db/repositories/productRepository.js'
import { authRepository } from '../electron/db/repositories/authRepository.js'

async function runCatalogTests() {
  console.log('====================================================')
  console.log('🧪 Starting Phase 4: Products, Categories & Combos Test Suite')
  console.log('====================================================')

  const testDir = path.resolve(process.cwd(), 'test_catalog_scratch')
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true })
  const testDbPath = path.join(testDir, 'test_catalog.sqlite')

  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath)
  if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`)
  if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`)

  // 1. Initialize DB with Migrations (v1 + v2)
  console.log('\n--- Test 1: Initialize Database & Run Migration 002 ---')
  const db = initDatabase({ dbPath: testDbPath, seed: true })
  const latestMigration = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get()
  console.log(`✓ Database at Schema Version: ${latestMigration.version}`)
  if (latestMigration.version < 2) throw new Error('Expected schema version 2 for combos!')

  const branch = db.prepare('SELECT id FROM branches LIMIT 1').get()
  authRepository.loginWithPassword('admin', 'admin123') // Authenticate as admin for audit logging

  // 2. Category CRUD
  console.log('\n--- Test 2: Category CRUD ---')
  const newCat = productRepository.createCategory({
    branchId: branch.id,
    name: 'Artisan Pastas',
    code: 'CAT-PST',
    displayOrder: 5,
  })
  console.log(`✓ Created Category: ${newCat.name} (ID: ${newCat.id})`)

  productRepository.updateCategory(newCat.id, {
    name: 'Gourmet Handcrafted Pastas',
    code: 'CAT-PST-V2',
    displayOrder: 5,
  })
  const updatedCat = db.prepare('SELECT name FROM categories WHERE id = ?').get(newCat.id)
  console.log(`✓ Updated Category Name: ${updatedCat.name}`)
  if (updatedCat.name !== 'Gourmet Handcrafted Pastas') throw new Error('Category update failed!')

  // 3. Product with Variations & Modifiers
  console.log('\n--- Test 3: Product Creation with Variations & Modifiers ---')
  const product = productRepository.createProduct({
    branchId: branch.id,
    categoryId: newCat.id,
    name: 'Truffle Mushroom Fettuccine',
    sku: 'PST-TRF-01',
    basePriceCents: 1650, // $16.50
    costPriceCents: 520,  // $5.20
    taxPercentage: 5.0,
    preparationTimeMinutes: 18,
    isAvailable: true,
    trackInventory: true,
    variations: [
      { name: 'Regular Portion', priceCents: 1650, costCents: 520, isDefault: true },
      { name: 'Family Bowl', priceCents: 2450, costCents: 850, isDefault: false },
    ],
    modifierGroups: [
      {
        name: 'Extra Cheese & Sauces',
        isRequired: false,
        minSelection: 0,
        maxSelection: 2,
        modifiers: [
          { name: 'Parmigiano-Reggiano Shavings', priceCents: 200 },
          { name: 'Truffle Cream Drizzle', priceCents: 350 },
        ],
      },
    ],
  })

  console.log(`✓ Created Product: ${product.name} at $${(product.base_price_cents / 100).toFixed(2)}`)
  console.log(`   - Variations (${product.variations.length}): ${product.variations.map((v) => `${v.name} ($${(v.price_cents / 100).toFixed(2)})`).join(', ')}`)
  console.log(`   - Modifier Groups (${product.modifierGroups.length}): ${product.modifierGroups[0]?.name}`)
  if (product.variations.length !== 2) throw new Error('Expected 2 product variations!')
  if (product.modifierGroups[0]?.modifiers.length !== 2) throw new Error('Expected 2 modifiers in group!')

  // 4. Price Change Audit Log Test
  console.log('\n--- Test 4: Price Update & Audit Log Verification ---')
  productRepository.updateProduct(product.id, {
    ...product,
    basePriceCents: 1800, // Price increased to $18.00
  })
  const auditPriceChange = db.prepare(`
    SELECT action, details_json FROM audit_logs
    WHERE entity_type = 'PRODUCT' AND action = 'PRICE_CHANGE'
    ORDER BY created_at DESC LIMIT 1
  `).get()
  console.log(`✓ Price change audit captured: ${auditPriceChange.details_json}`)
  if (!auditPriceChange) throw new Error('Price change audit record was not created!')

  // 5. Availability Toggle
  console.log('\n--- Test 5: Availability Toggle ---')
  productRepository.toggleProductAvailability(product.id, false)
  const toggled = db.prepare('SELECT is_available FROM products WHERE id = ?').get(product.id)
  console.log(`✓ Product availability toggled to: ${toggled.is_available === 0 ? 'UNAVAILABLE' : 'AVAILABLE'}`)
  if (toggled.is_available !== 0) throw new Error('Availability toggle failed!')

  // 6. Soft-delete / Archive Product
  console.log('\n--- Test 6: Safe Soft Delete / Archiving ---')
  productRepository.archiveProduct(product.id)
  const archived = db.prepare('SELECT is_active FROM products WHERE id = ?').get(product.id)
  console.log(`✓ Product archived (is_active = ${archived.is_active}). Historical record preserved in database.`)
  if (archived.is_active !== 0) throw new Error('Product was not archived properly!')

  // 7. Combos & Bundle Deals (Section 6.4)
  console.log('\n--- Test 7: Combos & Deals Creation ---')
  const allProducts = db.prepare('SELECT id, name FROM products WHERE is_active = 1 LIMIT 2').all()
  const comboId = productRepository.createCombo({
    branchId: branch.id,
    name: 'Burger & Drink Combo Meal',
    code: 'CMB-001',
    description: 'Choice of gourmet burger and artisan cooler with fries',
    priceCents: 1299, // $12.99
    items: [
      { productId: allProducts[0].id, quantity: 1 },
      { productId: allProducts[1].id, quantity: 1 },
    ],
  })
  const combos = productRepository.getCombos(branch.id)
  console.log(`✓ Combos Retrieved (${combos.length}): ${combos[0].name} at $${(combos[0].price_cents / 100).toFixed(2)} with ${combos[0].items.length} items`)
  if (combos.length === 0 || combos[0].items.length !== 2) throw new Error('Combo creation failed!')

  // 8. Combos Update & Availability Toggle
  console.log('\n--- Test 8: Combo Update & Availability Toggle ---')
  productRepository.updateCombo(comboId, {
    name: 'Super Deluxe Burger & Drink Combo',
    code: 'CMB-001-V2',
    description: 'Updated bundle description',
    priceCents: 1499,
    isAvailable: true,
    availableFrom: '2026-01-01',
    availableTo: '2026-12-31',
    items: [
      { productId: allProducts[0].id, quantity: 2 },
    ],
  })
  const updatedCombo = db.prepare('SELECT name, price_cents FROM combos WHERE id = ?').get(comboId)
  console.log(`✓ Updated Combo: ${updatedCombo.name} at $${(updatedCombo.price_cents / 100).toFixed(2)}`)
  if (updatedCombo.price_cents !== 1499) throw new Error('Combo update failed!')

  productRepository.toggleComboAvailability(comboId, false)
  const toggledCombo = db.prepare('SELECT is_available FROM combos WHERE id = ?').get(comboId)
  console.log(`✓ Combo availability toggled to: ${toggledCombo.is_available === 0 ? 'UNAVAILABLE' : 'AVAILABLE'}`)
  if (toggledCombo.is_available !== 0) throw new Error('Combo availability toggle failed!')

  // Clean up
  closeDatabase()
  try {
    fs.rmSync(testDir, { recursive: true, force: true })
    console.log('✓ Cleaned up test artifacts.')
  } catch (e) {}

  console.log('\n====================================================')
  console.log('🎉 ALL PHASE 4 CATALOG & COMBO TESTS PASSED!')
  console.log('====================================================')
}

runCatalogTests().then(() => {
  process.exit(0)
}).catch((err) => {
  console.error('\n❌ Test failed with error:', err)
  process.exit(1)
})

