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
      query += ' AND i.current_stock <= i.minimum_level'
    }

    query += ' ORDER BY i.name ASC'

    const rows = db.prepare(query).all(...queryParams)

    return rows.map((row) => ({
      ...row,
      isLowStock: row.current_stock <= row.minimum_level,
      isOutOfStock: row.current_stock <= 0,
      totalValueCents: Math.round(row.current_stock * (row.cost_per_unit_cents || 0)),
    }))
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

    return {
      ...row,
      isLowStock: row.current_stock <= row.minimum_level,
      isOutOfStock: row.current_stock <= 0,
      totalValueCents: Math.round(row.current_stock * (row.cost_per_unit_cents || 0)),
    }
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
          id, branch_id, name, sku, unit_id, current_stock, minimum_level,
          cost_per_unit_cents, category, supplier_id, image_url, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        id,
        branchId,
        itemData.name,
        itemData.sku || `RAW-${Date.now().toString().slice(-6)}`,
        itemData.unitId,
        openingStock,
        parseFloat(itemData.minimumLevel || 5.0),
        parseInt(itemData.costPerUnitCents || 0, 10),
        itemData.category || 'General',
        itemData.supplierId || null,
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
          cost_per_unit_cents = COALESCE(?, cost_per_unit_cents),
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
      itemData.costPerUnitCents !== undefined ? parseInt(itemData.costPerUnitCents, 10) : null,
      itemData.imageUrl !== undefined ? itemData.imageUrl : (itemData.image_url ?? null),
      itemData.category ?? null,
      itemData.supplierId ?? null,
      now,
      id
    )

    logAudit(existing.branch_id, 'UPDATE_INVENTORY_ITEM', 'INVENTORY_ITEM', id, itemData)

    return inventoryRepository.getItemById(id)
  },

  /**
   * Manual Stock Adjustment, Wastage or Return
   */
  adjustStock: ({ itemId, branchId, quantityChange, movementType, reason, userId }) => {
    const db = getDb()
    const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId)
    if (!item) throw new Error(`Inventory item with ID "${itemId}" not found.`)

    const delta = parseFloat(quantityChange)
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

    const recipes = db.prepare(`
      SELECT r.*, 
             p.name as product_name, p.sku as product_sku, p.base_price_cents,
             c.name as category_name,
             pv.name as variation_name, pv.price_cents as variation_price_cents
      FROM recipes r
      JOIN products p ON r.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN product_variations pv ON r.variation_id = pv.id
      WHERE p.branch_id = ? AND p.is_active = 1
      ORDER BY p.name ASC
    `).all(branchId)

    return recipes.map((rec) => {
      const ingredients = db.prepare(`
        SELECT ri.*, 
               i.name as item_name, i.current_stock, i.cost_per_unit_cents,
               u.abbreviation as unit_abbr
        FROM recipe_ingredients ri
        JOIN inventory_items i ON ri.inventory_item_id = i.id
        LEFT JOIN inventory_units u ON i.unit_id = u.id
        WHERE ri.recipe_id = ?
      `).all(rec.id)

      // Food cost calculation
      const foodCostCents = ingredients.reduce((sum, ing) => {
        const wasteFactor = 1 + (ing.wastage_percentage || 0) / 100
        return sum + Math.round(ing.quantity_required * wasteFactor * (ing.cost_per_unit_cents || 0))
      }, 0)

      const sellingPriceCents = rec.variation_price_cents || rec.base_price_cents || 0
      const grossMarginCents = Math.max(0, sellingPriceCents - foodCostCents)
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

    const ingredients = db.prepare(`
      SELECT ri.*, 
             i.name as item_name, i.current_stock, i.cost_per_unit_cents,
             u.abbreviation as unit_abbr
      FROM recipe_ingredients ri
      JOIN inventory_items i ON ri.inventory_item_id = i.id
      LEFT JOIN inventory_units u ON i.unit_id = u.id
      WHERE ri.recipe_id = ?
    `).all(recipe.id)

    const foodCostCents = ingredients.reduce((sum, ing) => {
      const wasteFactor = 1 + (ing.wastage_percentage || 0) / 100
      return sum + Math.round(ing.quantity_required * wasteFactor * (ing.cost_per_unit_cents || 0))
    }, 0)

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
        db.prepare('UPDATE recipes SET yield_quantity = ?, notes = ?, image_url = COALESCE(?, image_url) WHERE id = ?')
          .run(parseFloat(yieldQuantity || 1.0), notes || null, imageUrl, recipeId)
        db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(recipeId)
      } else {
        recipeId = uuid()
        db.prepare(`
          INSERT INTO recipes (id, product_id, variation_id, yield_quantity, notes, image_url)
          VALUES (?, ?, ?, ?, ?, ?)
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

    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId)
    const now = new Date().toISOString()
    const deductions = []

    const deductionTx = db.transaction(() => {
      for (const it of items) {
        const recipe = inventoryRepository.getRecipeForProduct(it.product_id, it.variation_id)
        if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) continue

        const itemQty = it.quantity || 1

        for (const ing of recipe.ingredients) {
          const wasteFactor = 1 + (ing.wastage_percentage || 0) / 100
          const deductAmount = parseFloat((ing.quantity_required * itemQty * wasteFactor).toFixed(3))

          const rawItem = db.prepare('SELECT current_stock, cost_per_unit_cents FROM inventory_items WHERE id = ?').get(ing.inventory_item_id)
          if (!rawItem) continue

          const prevStock = parseFloat(rawItem.current_stock)
          const newStock = Math.max(0, parseFloat((prevStock - deductAmount).toFixed(3)))

          db.prepare('UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?')
            .run(newStock, now, ing.inventory_item_id)

          db.prepare(`
            INSERT INTO stock_movements (
              id, branch_id, inventory_item_id, movement_type, quantity,
              previous_stock, new_stock, unit_cost_cents, reference_type, reference_id,
              reason, created_at
            ) VALUES (?, ?, ?, 'SALE_DEDUCTION', ?, ?, ?, ?, 'ORDER', ?, ?, ?)
          `).run(
            uuid(),
            order.branch_id,
            ing.inventory_item_id,
            deductAmount,
            prevStock,
            newStock,
            rawItem.cost_per_unit_cents,
            orderId,
            `Auto recipe deduction for Order ${order.order_number} (${it.item_name} x${itemQty})`,
            now
          )

          deductions.push({
            itemId: ing.inventory_item_id,
            itemName: ing.item_name,
            deducted: deductAmount,
            remainingStock: newStock,
          })
        }
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
             (SELECT COALESCE(SUM(total_cents), 0) FROM purchase_orders WHERE supplier_id = s.id AND status = 'RECEIVED') as total_purchases_cents,
             (SELECT COALESCE(SUM(amount_cents), 0) FROM vendor_payments WHERE supplier_id = s.id) as total_paid_cents
      FROM suppliers s
      WHERE s.branch_id = ? AND s.is_active = 1
      ORDER BY s.company_name ASC
    `).all(targetBranchId)

    return suppliers.map((sup) => ({
      ...sup,
      outstandingBalanceCents: Math.max(0, (sup.total_purchases_cents || 0) - (sup.total_paid_cents || 0)),
    }))
  },

  createSupplier: (supplierData) => {
    const db = getDb()
    const id = uuid()
    const now = new Date().toISOString()
    const branchId = supplierData.branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    db.prepare(`
      INSERT INTO suppliers (id, branch_id, company_name, contact_name, phone, email, address, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      id,
      branchId,
      supplierData.companyName,
      supplierData.contactName || null,
      supplierData.phone || null,
      supplierData.email || null,
      supplierData.address || null,
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
          is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).run(
      supplierData.companyName ?? null,
      supplierData.contactName ?? null,
      supplierData.phone ?? null,
      supplierData.email ?? null,
      supplierData.address ?? null,
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
      const totalCents = (items || []).reduce((acc, it) => acc + (it.totalCents || Math.round(it.quantity * it.unitCostCents)), 0)

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
          const itemTotal = it.totalCents || Math.round(it.quantity * it.unitCostCents)

          db.prepare(`
            INSERT INTO purchase_order_items (id, po_id, inventory_item_id, quantity, unit_cost_cents, total_cents)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(uuid(), id, it.inventoryItemId, parseFloat(it.quantity), parseInt(it.unitCostCents, 10), itemTotal)

          // If auto-received, increment stock immediately & record movement
          if (autoReceive) {
            const rawItem = db.prepare('SELECT current_stock FROM inventory_items WHERE id = ?').get(it.inventoryItemId)
            if (rawItem) {
              const prev = parseFloat(rawItem.current_stock)
              const added = parseFloat(it.quantity)
              const next = prev + added

              db.prepare(`
                UPDATE inventory_items
                SET current_stock = ?,
                    cost_per_unit_cents = ?,
                    updated_at = ?
                WHERE id = ?
              `).run(next, parseInt(it.unitCostCents, 10), now, it.inventoryItemId)

              db.prepare(`
                INSERT INTO stock_movements (
                  id, branch_id, inventory_item_id, movement_type, quantity,
                  previous_stock, new_stock, unit_cost_cents, reference_type, reference_id,
                  reason, created_at
                ) VALUES (?, ?, ?, 'PURCHASE', ?, ?, ?, ?, 'PO', ?, ?, ?)
              `).run(
                uuid(),
                targetBranchId,
                it.inventoryItemId,
                added,
                prev,
                next,
                parseInt(it.unitCostCents, 10),
                id,
                `Goods Received for PO ${generatedPoNumber}`,
                now
              )
            }
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

  createExpense: ({ branchId, categoryId, amountCents, paymentMethod, payee, description, expenseDate, userId }) => {
    const db = getDb()
    const targetBranchId = branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id
    const id = uuid()
    const now = new Date().toISOString()
    const session = authRepository.getCurrentSession()

    db.prepare(`
      INSERT INTO expenses (
        id, branch_id, category_id, amount_cents, payment_method,
        payee, description, recorded_by_user_id, expense_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      targetBranchId,
      categoryId,
      parseInt(amountCents, 10),
      paymentMethod || 'CASH',
      payee || null,
      description || null,
      userId || session?.id || null,
      expenseDate || now,
      now
    )

    logAudit(targetBranchId, 'RECORD_EXPENSE', 'EXPENSE', id, {
      amountCents,
      categoryId,
      payee,
    })

    return db.prepare(`
      SELECT e.*, c.name as category_name
      FROM expenses e
      JOIN expense_categories c ON e.category_id = c.id
      WHERE e.id = ?
    `).get(id)
  },

  getExpenseSummary: (params = {}) => {
    const db = getDb()
    const branchId = params.branchId || db.prepare('SELECT id FROM branches LIMIT 1').get()?.id

    const totalCents = db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) as total FROM expenses
      WHERE branch_id = ?
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
