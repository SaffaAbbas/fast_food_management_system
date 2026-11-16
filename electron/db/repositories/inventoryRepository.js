import { getDb } from '../index.js'
import crypto from 'node:crypto'
import { authRepository } from './authRepository.js'

function uuid() {
  return crypto.randomUUID()
}

function logAudit(branchId, action, entityType, entityId, details) {
  try {
    const db = getDb()
    const session = authRepository.getCurrentSession()
    let validUserId = null
    if (session?.id) {
      const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(session.id)
      if (exists) validUserId = session.id
    }
    db.prepare(`
      INSERT INTO audit_logs (id, branch_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid(),
      branchId || null,
      validUserId,
      action,
      entityType,
      entityId,
      typeof details === 'string' ? details : JSON.stringify(details),
      new Date().toISOString()
    )
  } catch (e) {
    console.error('Failed to log audit:', e)
  }
}

function enrichStockRow(row) {
  if (!row) return null
  const current = parseFloat(row.current_stock || 0)
  const reserved = Math.max(0, parseFloat(row.reserved_stock || 0))
  const available = Math.max(0, current - reserved)
  const minLevel = parseFloat(row.minimum_level || 0)
  const reorder = parseFloat(row.reorder_level != null ? row.reorder_level : minLevel)
  const avgCost = row.avg_cost_cents != null ? row.avg_cost_cents : (row.cost_per_unit_cents || 0)
  return {
    ...row,
    reserved_stock: reserved,
    available_stock: available,
    avg_cost_cents: avgCost,
    reorder_level: reorder,
    isLowStock: available <= reorder,
    isOutOfStock: available <= 0,
    totalValueCents: Math.round(current * avgCost),
  }
}

function weightedAverageCost(prevQty, prevCost, addQty, addCost) {
  const prev = Math.max(0, parseFloat(prevQty || 0))
  const add = parseFloat(addQty || 0)
  const pCost = parseInt(prevCost || 0, 10)
  const aCost = parseInt(addCost || 0, 10)
  if (add <= 0) return pCost
  if (prev <= 0) return aCost
  return Math.round((prev * pCost + add * aCost) / (prev + add))
}

function unitCostCents(item) {
  return item?.avg_cost_cents != null ? item.avg_cost_cents : (item?.cost_per_unit_cents || 0)
}

function postInboundStock(db, { branchId, itemId, qty, unitCost, now, referenceType, referenceId, reason, movementType = 'PURCHASE' }) {
  const rawItem = db.prepare('SELECT current_stock, cost_per_unit_cents, avg_cost_cents FROM inventory_items WHERE id = ?').get(itemId)
  if (!rawItem) return
  const prev = parseFloat(rawItem.current_stock || 0)
  const added = parseFloat(qty)
  if (!added) return
  const next = parseFloat((prev + added).toFixed(3))
  const cost = parseInt(unitCost, 10) || 0
  const avg = weightedAverageCost(prev, unitCostCents(rawItem), added, cost)
  db.prepare(`
    UPDATE inventory_items
    SET current_stock = ?, cost_per_unit_cents = ?, avg_cost_cents = ?, updated_at = ?
    WHERE id = ?
  `).run(next, avg, avg, now, itemId)
  db.prepare(`
    INSERT INTO stock_movements (
      id, branch_id, inventory_item_id, movement_type, quantity,
      previous_stock, new_stock, unit_cost_cents, reference_type, reference_id,
      reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuid(), branchId, itemId, movementType, Math.abs(added), prev, next, cost, referenceType, referenceId, reason, now)
}

function computeFoodCost(ingredients, yieldQuantity) {
  const batchCostCents = ingredients.reduce((sum, ing) => {
    const wasteFactor = 1 + (parseFloat(ing.wastage_percentage || ing.wastagePercentage || 0) / 100)
    const qty = parseFloat(ing.quantity_required || ing.quantityRequired || 0)
    const cost = unitCostCents(ing)
    return sum + Math.round(qty * wasteFactor * cost)
  }, 0)
  const yieldQty = Math.max(0.0001, parseFloat(yieldQuantity || 1))
  return {
    batchCostCents,
    foodCostCents: Math.round(batchCostCents / yieldQty),
  }
}

function loadRecipeIngredients(db, recipeId) {
  return db.prepare(`
    SELECT ri.*,
           i.name as item_name, i.current_stock, i.cost_per_unit_cents, i.avg_cost_cents,
           u.abbreviation as unit_abbr
    FROM recipe_ingredients ri
    JOIN inventory_items i ON ri.inventory_item_id = i.id
    LEFT JOIN inventory_units u ON i.unit_id = u.id
    WHERE ri.recipe_id = ?
  `).all(recipeId)
}

function collectOrderRecipeUsage(db, orderId) {
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId)
  const usage = []
  for (const it of items) {
    const recipe = it.variation_id
      ? db.prepare('SELECT * FROM recipes WHERE product_id = ? AND variation_id = ? AND COALESCE(is_active, 1) = 1 LIMIT 1').get(it.product_id, it.variation_id)
      : db.prepare('SELECT * FROM recipes WHERE product_id = ? AND COALESCE(is_active, 1) = 1 LIMIT 1').get(it.product_id)
    if (!recipe) continue
    const ingredients = loadRecipeIngredients(db, recipe.id)
    const itemQty = it.quantity || 1
    const yieldQty = Math.max(0.0001, parseFloat(recipe.yield_quantity || 1))
    for (const ing of ingredients) {
      const wasteFactor = 1 + (ing.wastage_percentage || 0) / 100
      const deductAmount = parseFloat(((ing.quantity_required * itemQty * wasteFactor) / yieldQty).toFixed(3))
      usage.push({
        inventoryItemId: ing.inventory_item_id,
        itemName: ing.item_name,
        deductAmount,
        unitCostCents: unitCostCents(ing),
        orderItemName: it.item_name,
        itemQty,
      })
    }
  }
  return usage
}

export const inventoryRepository = {
  // ==========================================
  // 1. INVENTORY UNITS & ITEMS (STOCK MASTER)
  // ==========================================

  getUnits: () => {
    const db = getDb()
    return db.prepare('SELECT * FROM inventory_units ORDER BY name ASC').all()
  },

  createUnit: ({ name, abbreviation }) => {
    const db = getDb()
    const id = uuid()
    db.prepare('INSERT INTO inventory_units (id, name, abbreviation) VALUES (?, ?, ?)').run(id, name, abbreviation)
    return db.prepare('SELECT * FROM inventory_units WHERE id = ?').get(id)
  },

  getItems: (params = {}) => {
    const db = getDb()
    const branchId = params.branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    let query = `
      SELECT i.*, 
             u.name as unit_name, u.abbreviation as unit_abbr,
             s.company_name as supplier_name
      FROM inventory_items i
      LEFT JOIN inventory_units u ON i.unit_id = u.id
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.branch_id = ? AND i.is_active = 1
    `
    const queryParams = [branchId]

    if (params.category && params.category !== 'ALL') {
      query += ' AND i.category = ?'
      queryParams.push(params.category)
    }

    if (params.search && params.search.trim() !== '') {
      query += ' AND (LOWER(i.name) LIKE ? OR LOWER(i.sku) LIKE ?)'
      const term = `%${params.search.trim().toLowerCase()}%`
      queryParams.push(term, term)
    }

    if (params.lowStockOnly) {
      query += ' AND (i.current_stock - COALESCE(i.reserved_stock, 0)) <= COALESCE(i.reorder_level, i.minimum_level)'
    }

    query += ' ORDER BY i.name ASC'

    const rows = db.prepare(query).all(...queryParams)

    return rows.map((row) => enrichStockRow(row))
  },

  getItemById: (id) => {
    const db = getDb()
    const row = db.prepare(`
      SELECT i.*, 
             u.name as unit_name, u.abbreviation as unit_abbr,
             s.company_name as supplier_name
      FROM inventory_items i
      LEFT JOIN inventory_units u ON i.unit_id = u.id
      LEFT JOIN suppliers s ON i.supplier_id = s.id
      WHERE i.id = ?
    `).get(id)

    if (!row) return null

    return enrichStockRow(row)
  },

  createItem: (itemData) => {
    const db = getDb()
    const id = uuid()
    const now = new Date().toISOString()
    const branchId = itemData.branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const openingStock = parseFloat(itemData.currentStock || itemData.openingStock || 0)

    const createItemTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO inventory_items (
          id, branch_id, name, sku, unit_id, current_stock, opening_stock, minimum_level,
          reorder_level, reserved_stock, cost_per_unit_cents, avg_cost_cents, category,
          supplier_id, conversion_factor, conversion_unit_id, image_url, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        id,
        branchId,
        itemData.name,
        itemData.sku || `RAW-${Date.now().toString().slice(-6)}`,
        itemData.unitId,
        openingStock,
        openingStock,
        parseFloat(itemData.minimumLevel || 5.0),
        parseFloat(itemData.reorderLevel != null ? itemData.reorderLevel : (itemData.minimumLevel || 5.0)),
        parseInt(itemData.costPerUnitCents || 0, 10),
        parseInt(itemData.costPerUnitCents || 0, 10),
        itemData.category || 'General',
        itemData.supplierId || null,
        itemData.conversionFactor ? parseFloat(itemData.conversionFactor) : null,
        itemData.conversionUnitId || null,
        itemData.imageUrl || itemData.image_url || null,
        now,
        now
      )

      // Initial opening stock movement record
      if (openingStock > 0) {
        db.prepare(`
          INSERT INTO stock_movements (
            id, branch_id, inventory_item_id, movement_type, quantity,
            previous_stock, new_stock, unit_cost_cents, reference_type, reason, created_at
          ) VALUES (?, ?, ?, 'ADJUSTMENT', ?, 0, ?, ?, 'MANUAL', 'Initial opening stock', ?)
        `).run(
          uuid(),
          branchId,
          id,
          openingStock,
          openingStock,
          parseInt(itemData.costPerUnitCents || 0, 10),
          now
        )
      }

      logAudit(branchId, 'CREATE_INVENTORY_ITEM', 'INVENTORY_ITEM', id, {
        name: itemData.name,
        stock: openingStock,
      })

      return inventoryRepository.getItemById(id)
    })

    return createItemTx()
  },

  updateItem: (id, itemData) => {
    const db = getDb()
    const existing = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id)
    if (!existing) throw new Error(`Inventory item with ID "${id}" not found.`)

    const now = new Date().toISOString()

    db.prepare(`
      UPDATE inventory_items
      SET name = COALESCE(?, name),
          sku = COALESCE(?, sku),
          unit_id = COALESCE(?, unit_id),
          minimum_level = COALESCE(?, minimum_level),
          reorder_level = COALESCE(?, reorder_level),
          cost_per_unit_cents = COALESCE(?, cost_per_unit_cents),
          conversion_factor = COALESCE(?, conversion_factor),
          conversion_unit_id = COALESCE(?, conversion_unit_id),
          image_url = COALESCE(?, image_url),
          category = COALESCE(?, category),
          supplier_id = COALESCE(?, supplier_id),
          updated_at = ?
      WHERE id = ?
    `).run(
      itemData.name ?? null,
      itemData.sku ?? null,
      itemData.unitId ?? null,
      itemData.minimumLevel !== undefined ? parseFloat(itemData.minimumLevel) : null,
      itemData.reorderLevel !== undefined ? parseFloat(itemData.reorderLevel) : null,
      itemData.costPerUnitCents !== undefined ? parseInt(itemData.costPerUnitCents, 10) : null,
      itemData.conversionFactor !== undefined ? (itemData.conversionFactor ? parseFloat(itemData.conversionFactor) : null) : null,
      itemData.conversionUnitId !== undefined ? (itemData.conversionUnitId || null) : null,
      itemData.imageUrl !== undefined ? itemData.imageUrl : (itemData.image_url ?? null),
      itemData.category ?? null,
      itemData.supplierId ?? null,
      now,
      id
    )

    logAudit(existing.branch_id, 'UPDATE_INVENTORY_ITEM', 'INVENTORY_ITEM', id, itemData)

    return inventoryRepository.getItemById(id)
  },

  getLowStockAlerts: (branchId) => {
    const db = getDb()
    const targetBranchId = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const rows = db.prepare(`
      SELECT i.*, u.abbreviation as unit_abbr
      FROM inventory_items i
      LEFT JOIN inventory_units u ON i.unit_id = u.id
      WHERE i.branch_id = ? AND i.is_active = 1
        AND (i.current_stock - COALESCE(i.reserved_stock, 0)) <= COALESCE(i.reorder_level, i.minimum_level)
      ORDER BY i.name ASC
    `).all(targetBranchId)
    return rows.map((row) => enrichStockRow(row))
  },

  getBranches: () => {
    const db = getDb()
    return db.prepare('SELECT id, name, code FROM branches ORDER BY name ASC').all()
  },

  /**
   * Manual Stock Adjustment, Wastage or Return
   */
  adjustStock: ({ itemId, branchId, quantityChange, movementType, reason, userId, packQuantity }) => {
    const db = getDb()
    const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId)
    if (!item) throw new Error(`Inventory item with ID "${itemId}" not found.`)

    let delta = parseFloat(quantityChange)
    const packs = parseFloat(packQuantity)
    if (!isNaN(packs) && packs !== 0 && item.conversion_factor) {
      delta = packs * parseFloat(item.conversion_factor)
    }
    if (isNaN(delta) || delta === 0) {
      throw new Error('Quantity change must be a non-zero number.')
    }

    const previousStock = parseFloat(item.current_stock)
    const newStock = previousStock + delta
    if (newStock < 0) {
      throw new Error(`Insufficient stock for "${item.name}". Current: ${previousStock}, adjustment: ${delta}`)
    }

    const now = new Date().toISOString()
    const targetBranchId = branchId || item.branch_id

    const adjustTx = db.transaction(() => {
      db.prepare(`
        UPDATE inventory_items
        SET current_stock = ?,
            updated_at = ?
        WHERE id = ?
      `).run(newStock, now, itemId)

      db.prepare(`
        INSERT INTO stock_movements (
          id, branch_id, inventory_item_id, movement_type, quantity,
          previous_stock, new_stock, unit_cost_cents, reference_type,
          reason, user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?, ?)
      `).run(
        uuid(),
        targetBranchId,
        itemId,
        movementType || (delta > 0 ? 'ADJUSTMENT' : 'WASTAGE'),
        Math.abs(delta),
        previousStock,
        newStock,
        item.cost_per_unit_cents,
        reason || 'Manual inventory adjustment',
        userId || null,
        now
      )

      logAudit(targetBranchId, 'ADJUST_STOCK', 'INVENTORY_ITEM', itemId, {
        previousStock,
        newStock,
        delta,
        movementType,
        reason,
      })

      return inventoryRepository.getItemById(itemId)
    })

    return adjustTx()
  },

  transferStock: ({ itemId, toBranchId, quantity, reason, userId }) => {
    const db = getDb()
    const source = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId)
    if (!source) throw new Error('Inventory item not found.')
    if (!toBranchId) throw new Error('Destination branch is required.')
    if (source.branch_id === toBranchId) throw new Error('Cannot transfer stock to the same branch.')

    const qty = parseFloat(quantity)
    if (isNaN(qty) || qty <= 0) throw new Error('Transfer quantity must be greater than zero.')

    const prev = parseFloat(source.current_stock)
    if (qty > prev) throw new Error(`Insufficient stock to transfer. Available: ${prev}`)

    const now = new Date().toISOString()
    const transferTx = db.transaction(() => {
      const nextSource = parseFloat((prev - qty).toFixed(3))
      db.prepare('UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?')
        .run(nextSource, now, source.id)

      db.prepare(`
        INSERT INTO stock_movements (
          id, branch_id, inventory_item_id, movement_type, quantity,
          previous_stock, new_stock, unit_cost_cents, reference_type,
          reason, user_id, created_at
        ) VALUES (?, ?, ?, 'TRANSFER_OUT', ?, ?, ?, ?, 'TRANSFER', ?, ?, ?)
      `).run(
        uuid(), source.branch_id, source.id, qty, prev, nextSource,
        unitCostCents(source), reason || 'Branch transfer', userId || null, now
      )

      let dest = db.prepare('SELECT * FROM inventory_items WHERE sku = ? AND branch_id = ?').get(source.sku, toBranchId)
      if (!dest) {
        const destId = uuid()
        db.prepare(`
          INSERT INTO inventory_items (
            id, branch_id, name, sku, unit_id, current_stock, opening_stock, minimum_level,
            reorder_level, reserved_stock, cost_per_unit_cents, avg_cost_cents, category,
            supplier_id, conversion_factor, conversion_unit_id, image_url, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `).run(
          destId, toBranchId, source.name, source.sku, source.unit_id,
          source.minimum_level, source.reorder_level, source.cost_per_unit_cents, source.avg_cost_cents,
          source.category, source.supplier_id, source.conversion_factor, source.conversion_unit_id,
          source.image_url, now, now
        )
        dest = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(destId)
      }

      const destPrev = parseFloat(dest.current_stock || 0)
      const destNext = parseFloat((destPrev + qty).toFixed(3))
      const avg = weightedAverageCost(destPrev, unitCostCents(dest), qty, unitCostCents(source))
      db.prepare(`
        UPDATE inventory_items
        SET current_stock = ?, avg_cost_cents = ?, cost_per_unit_cents = ?, updated_at = ?
        WHERE id = ?
      `).run(destNext, avg, avg, now, dest.id)

      db.prepare(`
        INSERT INTO stock_movements (
          id, branch_id, inventory_item_id, movement_type, quantity,
          previous_stock, new_stock, unit_cost_cents, reference_type, reference_id,
          reason, user_id, created_at
        ) VALUES (?, ?, ?, 'TRANSFER_IN', ?, ?, ?, ?, 'TRANSFER', ?, ?, ?, ?)
      `).run(
        uuid(), toBranchId, dest.id, qty, destPrev, destNext,
        unitCostCents(source), source.id, reason || 'Branch transfer', userId || null, now
      )

      logAudit(source.branch_id, 'TRANSFER_STOCK', 'INVENTORY_ITEM', source.id, {
        toBranchId, quantity: qty, destItemId: dest.id,
      })

      return inventoryRepository.getItemById(source.id)
    })

    return transferTx()
  },

  getStockMovements: (params = {}) => {
    const db = getDb()
    const branchId = params.branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    let query = `
      SELECT sm.*, 
             i.name as item_name, i.sku as item_sku,
             u.abbreviation as unit_abbr,
             usr.display_name as staff_name
      FROM stock_movements sm
      JOIN inventory_items i ON sm.inventory_item_id = i.id
      LEFT JOIN inventory_units u ON i.unit_id = u.id
      LEFT JOIN users usr ON sm.user_id = usr.id
      WHERE sm.branch_id = ?
    `
    const queryParams = [branchId]

    if (params.itemId) {
      query += ' AND sm.inventory_item_id = ?'
      queryParams.push(params.itemId)
    }

    if (params.movementType) {
      query += ' AND sm.movement_type = ?'
      queryParams.push(params.movementType)
    }

    query += ' ORDER BY sm.created_at DESC LIMIT ?'
    queryParams.push(params.limit || 100)

    return db.prepare(query).all(...queryParams)
  },

  // ==========================================
  // 2. RECIPES & FOOD COST MANAGEMENT
  // ==========================================

  getRecipes: (params = {}) => {
    const db = getDb()
    const branchId = params.branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    let sql = `
      SELECT r.*, 
             p.name as product_name, p.sku as product_sku, p.base_price_cents,
             c.name as category_name,
             pv.name as variation_name, pv.price_cents as variation_price_cents
      FROM recipes r
      JOIN products p ON r.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN product_variations pv ON r.variation_id = pv.id
      WHERE p.branch_id = ?
    `
    if (!params.includeInactive) {
      sql += ' AND COALESCE(r.is_active, 1) = 1'
    }
    sql += ' ORDER BY p.name ASC'

    const recipes = db.prepare(sql).all(branchId)

    return recipes.map((rec) => {
      const ingredients = loadRecipeIngredients(db, rec.id)
      const { foodCostCents } = computeFoodCost(ingredients, rec.yield_quantity)

      const sellingPriceCents = rec.variation_price_cents || rec.base_price_cents || 0
      const grossMarginCents = sellingPriceCents - foodCostCents
      const foodCostPercentage = sellingPriceCents > 0
        ? parseFloat(((foodCostCents / sellingPriceCents) * 100).toFixed(1))
        : 0

      return {
        ...rec,
        ingredients,
        foodCostCents,
        grossMarginCents,
        foodCostPercentage,
        sellingPriceCents,
      }
    })
  },

  getRecipeForProduct: (productId, variationId = null) => {
    const db = getDb()
    const query = variationId
      ? 'SELECT * FROM recipes WHERE product_id = ? AND variation_id = ? LIMIT 1'
      : 'SELECT * FROM recipes WHERE product_id = ? LIMIT 1'
    const params = variationId ? [productId, variationId] : [productId]

    const recipe = db.prepare(query).get(...params)
    if (!recipe) return null

    const ingredients = loadRecipeIngredients(db, recipe.id)
    const { foodCostCents } = computeFoodCost(ingredients, recipe.yield_quantity)

    return {
      ...recipe,
      ingredients,
      foodCostCents,
    }
  },

  saveRecipe: ({ productId, variationId, yieldQuantity, notes, ingredients, imageUrl = null }) => {
    const db = getDb()
    const saveRecipeTx = db.transaction(() => {
      let existing = db.prepare(`
        SELECT id FROM recipes
        WHERE product_id = ? AND (variation_id = ? OR (variation_id IS NULL AND ? IS NULL))
      `).get(productId, variationId || null, variationId || null)

      let recipeId = existing?.id
      if (recipeId) {
        const prev = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId)
        const prevIngredients = loadRecipeIngredients(db, recipeId)
        const { foodCostCents } = computeFoodCost(prevIngredients, prev.yield_quantity)
        const nextVersion = (prev.version || 1) + 1
        db.prepare(`
          INSERT INTO recipe_versions (
            id, recipe_id, version, product_id, yield_quantity, notes, ingredients_json, food_cost_cents, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          uuid(),
          recipeId,
          prev.version || 1,
          prev.product_id,
          prev.yield_quantity,
          prev.notes,
          JSON.stringify(prevIngredients),
          foodCostCents,
          new Date().toISOString()
        )
        db.prepare(`
          UPDATE recipes
          SET yield_quantity = ?, notes = ?, image_url = COALESCE(?, image_url),
              version = ?, is_active = 1, deactivated_at = NULL
          WHERE id = ?
        `).run(parseFloat(yieldQuantity || 1.0), notes || null, imageUrl, nextVersion, recipeId)
        db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(recipeId)
      } else {
        recipeId = uuid()
        db.prepare(`
          INSERT INTO recipes (id, product_id, variation_id, yield_quantity, notes, image_url, is_active, version)
          VALUES (?, ?, ?, ?, ?, ?, 1, 1)
        `).run(recipeId, productId, variationId || null, parseFloat(yieldQuantity || 1.0), notes || null, imageUrl)
      }

      if (Array.isArray(ingredients)) {
        for (const ing of ingredients) {
          db.prepare(`
            INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required, wastage_percentage)
            VALUES (?, ?, ?, ?, ?)
          `).run(
            uuid(),
            recipeId,
            ing.inventoryItemId,
            parseFloat(ing.quantityRequired),
            parseFloat(ing.wastagePercentage || 0)
          )
        }
      }

      const prod = db.prepare('SELECT branch_id, name FROM products WHERE id = ?').get(productId)
      logAudit(prod?.branch_id, 'SAVE_RECIPE', 'RECIPE', recipeId, {
        productId,
        productName: prod?.name,
        ingredientsCount: ingredients?.length || 0,
      })

      return inventoryRepository.getRecipeForProduct(productId, variationId)
    })

    return saveRecipeTx()
  },

  setRecipeActive: (recipeId, isActive) => {
    const db = getDb()
    const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId)
    if (!recipe) throw new Error('Recipe not found.')
    const now = new Date().toISOString()
    db.prepare(`
      UPDATE recipes
      SET is_active = ?, deactivated_at = ?
      WHERE id = ?
    `).run(isActive ? 1 : 0, isActive ? null : now, recipeId)
    logAudit(null, isActive ? 'ACTIVATE_RECIPE' : 'DEACTIVATE_RECIPE', 'RECIPE', recipeId, {})
    return inventoryRepository.getRecipeForProduct(recipe.product_id, recipe.variation_id)
  },

  getRecipeVersions: (recipeId) => {
    const db = getDb()
    return db.prepare(`
      SELECT * FROM recipe_versions
      WHERE recipe_id = ?
      ORDER BY version DESC
    `).all(recipeId)
  },

  reserveRecipeStockForOrder: (orderId) => {
    const db = getDb()
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
    if (!order || order.stock_posted === 1) return { reserved: 0 }
    const now = new Date().toISOString()
    const usage = collectOrderRecipeUsage(db, orderId)
    for (const line of usage) {
      db.prepare(`
        UPDATE inventory_items
        SET reserved_stock = COALESCE(reserved_stock, 0) + ?, updated_at = ?
        WHERE id = ?
      `).run(line.deductAmount, now, line.inventoryItemId)
    }
    return { reserved: usage.length }
  },

  releaseReservedStockForOrder: (orderId) => {
    const db = getDb()
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
    if (!order || order.stock_posted === 1) return { released: 0 }
    const now = new Date().toISOString()
    const usage = collectOrderRecipeUsage(db, orderId)
    for (const line of usage) {
      db.prepare(`
        UPDATE inventory_items
        SET reserved_stock = MAX(0, COALESCE(reserved_stock, 0) - ?), updated_at = ?
        WHERE id = ?
      `).run(line.deductAmount, now, line.inventoryItemId)
    }
    return { released: usage.length }
  },

  /**
   * Automatic recipe stock deduction when POS order is completed/paid
   */
  deductRecipeStockForOrder: (orderId) => {
    const db = getDb()
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
    if (!order) return { success: false, reason: 'Order not found' }
    if (order.stock_posted === 1) {
      return { success: true, skipped: true, reason: 'Stock already posted for this sale' }
    }

    const autoRow = db.prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'recipe_auto_deduct'").get()
    if (autoRow && String(autoRow.setting_value) === '0') {
      return { success: true, skipped: true, reason: 'Recipe auto-deduct disabled' }
    }

    const now = new Date().toISOString()
    const deductions = []

    const deductionTx = db.transaction(() => {
      const usage = collectOrderRecipeUsage(db, orderId)
      for (const line of usage) {
        const rawItem = db.prepare('SELECT current_stock, reserved_stock, cost_per_unit_cents, avg_cost_cents FROM inventory_items WHERE id = ?').get(line.inventoryItemId)
        if (!rawItem) continue

        const prevStock = parseFloat(rawItem.current_stock)
        const newStock = Math.max(0, parseFloat((prevStock - line.deductAmount).toFixed(3)))
        const reserved = Math.max(0, parseFloat((parseFloat(rawItem.reserved_stock || 0) - line.deductAmount).toFixed(3)))

        db.prepare('UPDATE inventory_items SET current_stock = ?, reserved_stock = ?, updated_at = ? WHERE id = ?')
          .run(newStock, reserved, now, line.inventoryItemId)

        db.prepare(`
          INSERT INTO stock_movements (
            id, branch_id, inventory_item_id, movement_type, quantity,
            previous_stock, new_stock, unit_cost_cents, reference_type, reference_id,
            reason, created_at
          ) VALUES (?, ?, ?, 'SALE_DEDUCTION', ?, ?, ?, ?, 'ORDER', ?, ?, ?)
        `).run(
          uuid(),
          order.branch_id,
          line.inventoryItemId,
          line.deductAmount,
          prevStock,
          newStock,
          line.unitCostCents,
          orderId,
          `Auto recipe deduction for Order ${order.order_number} (${line.orderItemName} x${line.itemQty})`,
          now
        )

        deductions.push({
          itemId: line.inventoryItemId,
          itemName: line.itemName,
          deducted: line.deductAmount,
          remainingStock: newStock,
        })
      }

      db.prepare('UPDATE orders SET stock_posted = 1, updated_at = ? WHERE id = ?').run(now, orderId)
      return deductions
    })

    return deductionTx()
  },

  reverseRecipeStockForOrder: (orderId, reason = 'Refund restock') => {
    const db = getDb()
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId)
    if (!order) return { success: false, reason: 'Order not found' }
    if (order.stock_posted !== 1) {
      return { success: true, skipped: true, reason: 'No posted stock to reverse' }
    }

    const now = new Date().toISOString()
    const reverseTx = db.transaction(() => {
      const movements = db.prepare(`
        SELECT * FROM stock_movements
        WHERE reference_type = 'ORDER' AND reference_id = ? AND movement_type = 'SALE_DEDUCTION'
      `).all(orderId)

      for (const mv of movements) {
        const rawItem = db.prepare('SELECT current_stock FROM inventory_items WHERE id = ?').get(mv.inventory_item_id)
        if (!rawItem) continue
        const prevStock = parseFloat(rawItem.current_stock)
        const qty = parseFloat(mv.quantity)
        const newStock = parseFloat((prevStock + qty).toFixed(3))

        db.prepare('UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?')
          .run(newStock, now, mv.inventory_item_id)

        db.prepare(`
          INSERT INTO stock_movements (
            id, branch_id, inventory_item_id, movement_type, quantity,
            previous_stock, new_stock, unit_cost_cents, reference_type, reference_id,
            reason, created_at
          ) VALUES (?, ?, ?, 'SALE_REVERSAL', ?, ?, ?, ?, 'ORDER', ?, ?, ?)
        `).run(
          uuid(),
          order.branch_id,
          mv.inventory_item_id,
          qty,
          prevStock,
          newStock,
          mv.unit_cost_cents,
          orderId,
          reason,
          now
        )
      }

      db.prepare('UPDATE orders SET stock_posted = 0, updated_at = ? WHERE id = ?').run(now, orderId)
      return { reversed: movements.length }
    })

    return reverseTx()
  },

  // ==========================================
  // 3. SUPPLIERS & PURCHASES
  // ==========================================

  getSuppliers: (branchId) => {
    const db = getDb()
    const targetBranchId = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    const suppliers = db.prepare(`
      SELECT s.*,
             (SELECT COUNT(*) FROM purchase_orders WHERE supplier_id = s.id) as total_po_count,
             (SELECT COALESCE(SUM(
               CASE WHEN poi.received_quantity IS NOT NULL
                 THEN ROUND(poi.received_quantity * poi.unit_cost_cents)
                 ELSE CASE WHEN po.status IN ('RECEIVED', 'PARTIAL') THEN poi.total_cents ELSE 0 END
               END), 0)
              FROM purchase_orders po
              JOIN purchase_order_items poi ON poi.po_id = po.id
              WHERE po.supplier_id = s.id) as total_purchases_cents,
             (SELECT COALESCE(SUM(amount_cents), 0) FROM purchase_returns WHERE supplier_id = s.id) as total_returns_cents,
             (SELECT COALESCE(SUM(amount_cents), 0) FROM vendor_payments WHERE supplier_id = s.id) as total_paid_cents
      FROM suppliers s
      WHERE s.branch_id = ? AND s.is_active = 1
      ORDER BY s.company_name ASC
    `).all(targetBranchId)

    return suppliers.map((sup) => ({
      ...sup,
      outstandingBalanceCents: Math.max(0, (sup.total_purchases_cents || 0) - (sup.total_paid_cents || 0) - (sup.total_returns_cents || 0)),
    }))
  },

  createSupplier: (supplierData) => {
    const db = getDb()
    const id = uuid()
    const now = new Date().toISOString()
    const branchId = supplierData.branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    db.prepare(`
      INSERT INTO suppliers (id, branch_id, company_name, contact_name, phone, email, address, tax_id, payment_terms, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      id,
      branchId,
      supplierData.companyName,
      supplierData.contactName || null,
      supplierData.phone || null,
      supplierData.email || null,
      supplierData.address || null,
      supplierData.taxId || null,
      supplierData.paymentTerms || null,
      now
    )

    logAudit(branchId, 'CREATE_SUPPLIER', 'SUPPLIER', id, { companyName: supplierData.companyName })

    return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id)
  },

  updateSupplier: (id, supplierData) => {
    const db = getDb()
    const existing = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id)
    if (!existing) throw new Error(`Supplier with ID "${id}" not found.`)

    db.prepare(`
      UPDATE suppliers
      SET company_name = COALESCE(?, company_name),
          contact_name = COALESCE(?, contact_name),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          address = COALESCE(?, address),
          tax_id = COALESCE(?, tax_id),
          payment_terms = COALESCE(?, payment_terms),
          is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).run(
      supplierData.companyName ?? null,
      supplierData.contactName ?? null,
      supplierData.phone ?? null,
      supplierData.email ?? null,
      supplierData.address ?? null,
      supplierData.taxId ?? null,
      supplierData.paymentTerms ?? null,
      supplierData.isActive ?? null,
      id
    )

    logAudit(existing.branch_id, 'UPDATE_SUPPLIER', 'SUPPLIER', id, supplierData)

    return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id)
  },

  getPurchaseOrders: (params = {}) => {
    const db = getDb()
    const branchId = params.branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    let query = `
      SELECT po.*, s.company_name as supplier_name, s.phone as supplier_phone
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id = s.id
      WHERE po.branch_id = ?
    `
    const queryParams = [branchId]

    if (params.supplierId) {
      query += ' AND po.supplier_id = ?'
      queryParams.push(params.supplierId)
    }

    if (params.status) {
      query += ' AND po.status = ?'
      queryParams.push(params.status)
    }

    query += ' ORDER BY po.created_at DESC'

    const orders = db.prepare(query).all(...queryParams)

    return orders.map((o) => {
      const items = db.prepare(`
        SELECT poi.*, i.name as item_name, u.abbreviation as unit_abbr
        FROM purchase_order_items poi
        JOIN inventory_items i ON poi.inventory_item_id = i.id
        LEFT JOIN inventory_units u ON i.unit_id = u.id
        WHERE poi.po_id = ?
      `).all(o.id)

      return {
        ...o,
        items,
      }
    })
  },

  /**
   * Create Purchase Order with optional auto-receive (Goods Received Note - GRN)
   */
  createPurchaseOrder: ({ branchId, supplierId, poNumber, notes, items, autoReceive }) => {
    const db = getDb()
    const targetBranchId = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const id = uuid()
    const now = new Date().toISOString()
    const status = autoReceive ? 'RECEIVED' : 'ORDERED'
    const generatedPoNumber = poNumber || `PO-${Date.now().toString().slice(-6)}`

    const createPoTx = db.transaction(() => {
      const totalCents = (items || []).reduce((acc, it) => {
        const line = it.totalCents || Math.round(it.quantity * it.unitCostCents)
        return acc + line + (parseInt(it.taxCents || 0, 10)) - (parseInt(it.discountCents || 0, 10))
      }, 0)

      db.prepare(`
        INSERT INTO purchase_orders (id, branch_id, supplier_id, po_number, status, total_cents, notes, created_at, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        targetBranchId,
        supplierId,
        generatedPoNumber,
        status,
        totalCents,
        notes || null,
        now,
        autoReceive ? now : null
      )

      if (Array.isArray(items)) {
        for (const it of items) {
          const qty = parseFloat(it.quantity)
          const discountCents = parseInt(it.discountCents || 0, 10)
          const taxCents = parseInt(it.taxCents || 0, 10)
          const itemTotal = it.totalCents || Math.round(qty * it.unitCostCents) - discountCents + taxCents
          const receivedQty = autoReceive ? qty : 0

          db.prepare(`
            INSERT INTO purchase_order_items (
              id, po_id, inventory_item_id, quantity, unit_cost_cents, total_cents,
              discount_cents, tax_cents, received_quantity
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            uuid(), id, it.inventoryItemId, qty, parseInt(it.unitCostCents, 10), itemTotal,
            discountCents, taxCents, receivedQty
          )

          if (autoReceive) {
            postInboundStock(db, {
              branchId: targetBranchId,
              itemId: it.inventoryItemId,
              qty,
              unitCost: it.unitCostCents,
              now,
              referenceType: 'PO',
              referenceId: id,
              reason: `Goods Received for PO ${generatedPoNumber}`,
            })
          }
        }
      }

      logAudit(targetBranchId, 'CREATE_PURCHASE_ORDER', 'PURCHASE_ORDER', id, {
        poNumber: generatedPoNumber,
        status,
        totalCents,
      })

      return db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id)
    })

    return createPoTx()
  },

  receivePurchaseOrder: ({ poId, items, userId }) => {
    const db = getDb()
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(poId)
    if (!po) throw new Error('Purchase order not found.')
    if (po.status === 'CANCELLED') throw new Error('Cannot receive a cancelled purchase order.')

    const now = new Date().toISOString()
    const receiveTx = db.transaction(() => {
      const lines = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(poId)
      const requested = Array.isArray(items) && items.length
        ? items
        : lines.map((l) => ({ itemId: l.id, quantity: Math.max(0, parseFloat(l.quantity) - parseFloat(l.received_quantity || 0)) }))

      for (const req of requested) {
        const line = lines.find((l) => l.id === req.itemId || l.inventory_item_id === req.inventoryItemId)
        if (!line) continue
        const remaining = Math.max(0, parseFloat(line.quantity) - parseFloat(line.received_quantity || 0))
        const qty = Math.min(remaining, parseFloat(req.quantity || remaining))
        if (qty <= 0) continue
        const nextReceived = parseFloat((parseFloat(line.received_quantity || 0) + qty).toFixed(3))
        db.prepare('UPDATE purchase_order_items SET received_quantity = ? WHERE id = ?').run(nextReceived, line.id)
        line.received_quantity = nextReceived
        postInboundStock(db, {
          branchId: po.branch_id,
          itemId: line.inventory_item_id,
          qty,
          unitCost: line.unit_cost_cents,
          now,
          referenceType: 'GRN',
          referenceId: poId,
          reason: `GRN posted for ${po.po_number}`,
        })
      }

      const updated = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(poId)
      const allReceived = updated.every((l) => parseFloat(l.received_quantity || 0) >= parseFloat(l.quantity))
      const anyReceived = updated.some((l) => parseFloat(l.received_quantity || 0) > 0)
      const status = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : po.status
      db.prepare('UPDATE purchase_orders SET status = ?, received_at = COALESCE(received_at, ?) WHERE id = ?')
        .run(status, now, poId)
      logAudit(po.branch_id, 'RECEIVE_PURCHASE', 'PURCHASE_ORDER', poId, { status, userId })
      return inventoryRepository.getPurchaseOrders({ branchId: po.branch_id }).find((o) => o.id === poId)
    })
    return receiveTx()
  },

  returnPurchaseItems: ({ poId, items, reason, userId }) => {
    const db = getDb()
    const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(poId)
    if (!po) throw new Error('Purchase order not found.')
    if (!Array.isArray(items) || items.length === 0) throw new Error('Select items to return.')
    const now = new Date().toISOString()
    const returnTx = db.transaction(() => {
      const returnId = uuid()
      let amount = 0
      db.prepare(`
        INSERT INTO purchase_returns (id, branch_id, supplier_id, po_id, amount_cents, reason, created_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `).run(returnId, po.branch_id, po.supplier_id, poId, reason || 'Purchase return', now)

      for (const it of items) {
        const line = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ? AND inventory_item_id = ?').get(poId, it.inventoryItemId)
        const qty = parseFloat(it.quantity)
        if (!qty || qty <= 0) continue
        const received = parseFloat(line?.received_quantity || 0)
        if (qty > received) throw new Error('Cannot return more than received quantity.')
        const cost = parseInt(line?.unit_cost_cents || it.unitCostCents || 0, 10)
        amount += Math.round(qty * cost)
        db.prepare(`
          INSERT INTO purchase_return_items (id, return_id, inventory_item_id, quantity, unit_cost_cents)
          VALUES (?, ?, ?, ?, ?)
        `).run(uuid(), returnId, it.inventoryItemId, qty, cost)
        db.prepare('UPDATE purchase_order_items SET received_quantity = received_quantity - ? WHERE id = ?')
          .run(qty, line.id)

        const rawItem = db.prepare('SELECT current_stock, cost_per_unit_cents FROM inventory_items WHERE id = ?').get(it.inventoryItemId)
        if (rawItem) {
          const prev = parseFloat(rawItem.current_stock)
          const next = Math.max(0, parseFloat((prev - qty).toFixed(3)))
          db.prepare('UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?').run(next, now, it.inventoryItemId)
          db.prepare(`
            INSERT INTO stock_movements (
              id, branch_id, inventory_item_id, movement_type, quantity,
              previous_stock, new_stock, unit_cost_cents, reference_type, reference_id, reason, created_at
            ) VALUES (?, ?, ?, 'RETURN', ?, ?, ?, ?, 'PO_RETURN', ?, ?, ?)
          `).run(uuid(), po.branch_id, it.inventoryItemId, qty, prev, next, cost, returnId, reason || `Return against ${po.po_number}`, now)
        }
      }

      db.prepare('UPDATE purchase_returns SET amount_cents = ? WHERE id = ?').run(amount, returnId)
      const remaining = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(poId)
      const anyLeft = remaining.some((l) => parseFloat(l.received_quantity || 0) > 0)
      const allLeft = remaining.every((l) => parseFloat(l.received_quantity || 0) >= parseFloat(l.quantity))
      db.prepare('UPDATE purchase_orders SET status = ? WHERE id = ?')
        .run(allLeft ? 'RECEIVED' : anyLeft ? 'PARTIAL' : 'ORDERED', poId)
      logAudit(po.branch_id, 'PURCHASE_RETURN', 'PURCHASE_ORDER', poId, { returnId, amount, userId })
      return { id: returnId, amountCents: amount }
    })
    return returnTx()
  },

  getVendorStatement: ({ supplierId, branchId }) => {
    const db = getDb()
    const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId)
    if (!supplier) throw new Error('Supplier not found.')
    const pos = inventoryRepository.getPurchaseOrders({ branchId: branchId || supplier.branch_id, supplierId })
    const payments = db.prepare('SELECT * FROM vendor_payments WHERE supplier_id = ? ORDER BY payment_date DESC').all(supplierId)
    const returns = db.prepare('SELECT * FROM purchase_returns WHERE supplier_id = ? ORDER BY created_at DESC').all(supplierId)
    const outstanding = inventoryRepository.getSuppliers(supplier.branch_id).find((s) => s.id === supplierId)?.outstandingBalanceCents || 0
    return { supplier, purchaseOrders: pos, payments, returns, outstandingBalanceCents: outstanding }
  },

  recordVendorPayment: ({ branchId, supplierId, poId, amountCents, paymentMethod, referenceNumber, notes }) => {
    const db = getDb()
    const targetBranchId = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const id = uuid()
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO vendor_payments (
        id, branch_id, supplier_id, po_id, amount_cents, payment_method,
        reference_number, notes, payment_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      targetBranchId,
      supplierId,
      poId || null,
      parseInt(amountCents, 10),
      paymentMethod || 'BANK_TRANSFER',
      referenceNumber || null,
      notes || null,
      now,
      now
    )

    logAudit(targetBranchId, 'RECORD_VENDOR_PAYMENT', 'VENDOR_PAYMENT', id, {
      supplierId,
      amountCents,
      paymentMethod,
    })

    return db.prepare('SELECT * FROM vendor_payments WHERE id = ?').get(id)
  },

  // ==========================================
  // 4. EXPENSE MANAGEMENT
  // ==========================================

  getExpenseCategories: () => {
    const db = getDb()
    return db.prepare('SELECT * FROM expense_categories ORDER BY name ASC').all()
  },

  getExpenses: (params = {}) => {
    const db = getDb()
    const branchId = params.branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    let query = `
      SELECT e.*, c.name as category_name, c.code as category_code,
             u.display_name as recorded_by_name
      FROM expenses e
      JOIN expense_categories c ON e.category_id = c.id
      LEFT JOIN users u ON e.recorded_by_user_id = u.id
      WHERE e.branch_id = ?
    `
    const queryParams = [branchId]

    if (params.categoryId && params.categoryId !== 'ALL') {
      query += ' AND e.category_id = ?'
      queryParams.push(params.categoryId)
    }

    if (params.startDate) {
      query += ' AND date(e.expense_date) >= date(?)'
      queryParams.push(params.startDate)
    }

    if (params.endDate) {
      query += ' AND date(e.expense_date) <= date(?)'
      queryParams.push(params.endDate)
    }

    query += ' ORDER BY e.expense_date DESC, e.created_at DESC'

    return db.prepare(query).all(...queryParams)
  },

  createExpense: ({ branchId, categoryId, amountCents, paymentMethod, payee, description, expenseDate, userId, referenceNumber, attachmentUrl, isRecurring, recurrence }) => {
    const db = getDb()
    const targetBranchId = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const id = uuid()
    const now = new Date().toISOString()
    const session = authRepository.getCurrentSession()
    const amount = parseInt(amountCents, 10)
    const threshold = parseInt(
      db.prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'expense_approval_threshold_cents'").get()?.setting_value || '50000',
      10
    )
    const needsApproval = amount >= threshold
    const status = needsApproval ? 'PENDING' : 'APPROVED'

    db.prepare(`
      INSERT INTO expenses (
        id, branch_id, category_id, amount_cents, payment_method,
        payee, description, recorded_by_user_id, expense_date, created_at,
        status, reference_number, attachment_url, is_recurring, recurrence,
        approved_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      targetBranchId,
      categoryId,
      amount,
      paymentMethod || 'CASH',
      payee || null,
      description || null,
      userId || session?.id || null,
      expenseDate || now,
      now,
      status,
      referenceNumber || null,
      attachmentUrl || null,
      isRecurring ? 1 : 0,
      recurrence || null,
      needsApproval ? null : (userId || session?.id || null)
    )

    logAudit(targetBranchId, 'RECORD_EXPENSE', 'EXPENSE', id, {
      amountCents: amount,
      categoryId,
      payee,
      status,
    })

    return db.prepare(`
      SELECT e.*, c.name as category_name
      FROM expenses e
      JOIN expense_categories c ON e.category_id = c.id
      WHERE e.id = ?
    `).get(id)
  },

  approveExpense: (id, userId) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id)
    if (!row) throw new Error('Expense not found.')
    if (row.status === 'CANCELLED') throw new Error('Cancelled expenses cannot be approved.')
    db.prepare("UPDATE expenses SET status = 'APPROVED', approved_by_user_id = ? WHERE id = ?")
      .run(userId || null, id)
    logAudit(row.branch_id, 'APPROVE_EXPENSE', 'EXPENSE', id, {})
    return db.prepare(`
      SELECT e.*, c.name as category_name FROM expenses e JOIN expense_categories c ON e.category_id = c.id WHERE e.id = ?
    `).get(id)
  },

  cancelExpense: (id, reason, userId) => {
    const db = getDb()
    const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id)
    if (!row) throw new Error('Expense not found.')
    const now = new Date().toISOString()
    db.prepare("UPDATE expenses SET status = 'CANCELLED', cancelled_at = ?, cancel_reason = ? WHERE id = ?")
      .run(now, reason || 'Cancelled', id)
    logAudit(row.branch_id, 'CANCEL_EXPENSE', 'EXPENSE', id, { reason, userId })
    return true
  },

  getExpenseSummary: (params = {}) => {
    const db = getDb()
    const branchId = params.branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    const totalCents = db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) as total FROM expenses
      WHERE branch_id = ? AND COALESCE(status, 'APPROVED') != 'CANCELLED'
    `).get(branchId).total

    const categoryBreakdown = db.prepare(`
      SELECT c.name as category_name, COALESCE(SUM(e.amount_cents), 0) as amount_cents, COUNT(e.id) as count
      FROM expense_categories c
      LEFT JOIN expenses e ON e.category_id = c.id AND e.branch_id = ?
      GROUP BY c.id
      ORDER BY amount_cents DESC
    `).all(branchId)

    return {
      totalCents,
      categoryBreakdown,
    }
  },
}
