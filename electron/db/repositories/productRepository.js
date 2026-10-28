import crypto from 'node:crypto'
import { getDb } from '../index.js'
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
      branchId || session?.branchId || null,
      validUserId,
      action,
      entityType,
      entityId,
      JSON.stringify(details),
      new Date().toISOString()
    )
  } catch (err) {
    console.error('[Audit Log Error]:', err)
  }
}

export const productRepository = {
  // ==========================================
  // CATEGORIES CRUD (Section 6.1)
  // ==========================================

  getCategories: (branchId) => {
    const db = getDb()
    return db.prepare(`
      SELECT c.id, c.name, c.code, c.display_order, c.is_active,
             c.parent_id, c.is_visible_pos, c.is_visible_online, c.image_url,
             COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
      WHERE (c.branch_id = ? OR c.branch_id IS NULL) AND c.is_active = 1
      GROUP BY c.id
      ORDER BY c.display_order ASC, c.name ASC
    `).all(branchId)
  },

  createCategory: ({ branchId, name, code, displayOrder = 0, parentId = null, isVisiblePos = 1, isVisibleOnline = 1, imageUrl = null }) => {
    const db = getDb()
    const now = new Date().toISOString()
    const id = uuid()

    db.prepare(`
      INSERT INTO categories (id, branch_id, name, code, display_order, parent_id, is_visible_pos, is_visible_online, image_url, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      id,
      branchId || null,
      name.trim(),
      code ? code.trim() : null,
      displayOrder,
      parentId || null,
      isVisiblePos !== undefined ? (isVisiblePos ? 1 : 0) : 1,
      isVisibleOnline !== undefined ? (isVisibleOnline ? 1 : 0) : 1,
      imageUrl || null,
      now
    )

    logAudit(branchId, 'CREATE_CATEGORY', 'CATEGORY', id, { name, code })
    return { id, name, code, displayOrder, is_active: 1 }
  },

  updateCategory: (id, { name, code, displayOrder, parentId, isVisiblePos = 1, isVisibleOnline = 1, isActive = 1, imageUrl }) => {
    const db = getDb()
    db.prepare(`
      UPDATE categories
      SET name = ?, code = ?, display_order = ?, parent_id = ?, is_visible_pos = ?, is_visible_online = ?, is_active = ?, image_url = COALESCE(?, image_url)
      WHERE id = ?
    `).run(
      name.trim(),
      code ? code.trim() : null,
      displayOrder || 0,
      parentId || null,
      isVisiblePos !== undefined ? (isVisiblePos ? 1 : 0) : 1,
      isVisibleOnline !== undefined ? (isVisibleOnline ? 1 : 0) : 1,
      isActive,
      imageUrl !== undefined ? imageUrl : null,
      id
    )

    logAudit(null, 'UPDATE_CATEGORY', 'CATEGORY', id, { name, code, isActive })
    return true
  },

  deleteCategory: (id) => {
    const db = getDb()
    // Check if category has active products
    const productCount = db.prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ? AND is_active = 1').get(id).count
    if (productCount > 0) {
      throw new Error(`Cannot delete category: Contains ${productCount} active products. Reassign or archive them first.`)
    }

    // Soft delete category
    db.prepare('UPDATE categories SET is_active = 0 WHERE id = ?').run(id)
    logAudit(null, 'ARCHIVE_CATEGORY', 'CATEGORY', id, {})
    return true
  },

  // ==========================================
  // PRODUCTS CRUD (Section 6.2 & 6.3)
  // ==========================================

  getProducts: (branchId, categoryId = null, searchQuery = '', includeInactive = false) => {
    const db = getDb()
    let sql = `
      SELECT p.id, p.category_id, c.name as category_name, p.name, p.sku, p.barcode,
             p.description, p.base_price_cents, p.cost_price_cents, p.tax_percentage,
             p.preparation_time_minutes, p.is_available, p.has_variations, p.track_inventory,
             p.is_featured, p.is_discount_eligible, p.min_order_qty, p.max_order_qty,
             p.price_dine_in_cents, p.price_takeaway_cents, p.price_delivery_cents,
             p.image_url, p.is_active, p.created_at, p.updated_at
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE (p.branch_id = ? OR p.branch_id IS NULL)
    `
    const params = [branchId]

    if (!includeInactive) {
      sql += ' AND p.is_active = 1'
    }

    if (categoryId) {
      sql += ' AND p.category_id = ?'
      params.push(categoryId)
    }

    if (searchQuery && searchQuery.trim() !== '') {
      sql += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)'
      const term = `%${searchQuery.trim()}%`
      params.push(term, term, term)
    }

    sql += ' ORDER BY c.display_order ASC, p.name ASC'
    return db.prepare(sql).all(...params)
  },

  getProductDetails: (productId) => {
    const db = getDb()
    const product = db.prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `).get(productId)

    if (!product) return null

    // Variations (Sizes, etc.)
    const variations = db.prepare(`
      SELECT id, name, sku, price_cents, cost_cents, is_default, is_active
      FROM product_variations
      WHERE product_id = ? AND is_active = 1
      ORDER BY price_cents ASC
    `).all(productId)

    // Modifier Groups
    const modifierGroups = db.prepare(`
      SELECT id, name, is_required, min_selection, max_selection
      FROM modifier_groups
      WHERE product_id = ?
    `).all(productId)

    for (const group of modifierGroups) {
      group.modifiers = db.prepare(`
        SELECT id, name, price_cents, is_active
        FROM modifiers
        WHERE group_id = ? AND is_active = 1
        ORDER BY price_cents ASC
      `).all(group.id)
    }

    return {
      ...product,
      variations,
      modifierGroups,
    }
  },

  createProduct: (productData) => {
    const db = getDb()
    const now = new Date().toISOString()
    const productId = productData.id || uuid()

    const createTx = db.transaction(() => {
      // 1. Insert product
      db.prepare(`
        INSERT INTO products (
          id, branch_id, category_id, name, sku, barcode, description, image_url,
          base_price_cents, cost_price_cents, tax_percentage, preparation_time_minutes,
          is_available, has_variations, track_inventory,
          is_featured, is_discount_eligible, min_order_qty, max_order_qty,
          price_dine_in_cents, price_takeaway_cents, price_delivery_cents,
          is_active, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          1, ?, ?
        )
      `).run(
        productId,
        productData.branchId || null,
        productData.categoryId,
        productData.name.trim(),
        productData.sku ? productData.sku.trim() : `SKU-${Date.now().toString().slice(-6)}`,
        productData.barcode ? productData.barcode.trim() : null,
        productData.description || null,
        productData.imageUrl || productData.image_url || null,
        productData.basePriceCents || 0,
        productData.costPriceCents || 0,
        productData.taxPercentage || 0.0,
        productData.preparationTimeMinutes || 15,
        productData.isAvailable !== undefined ? (productData.isAvailable ? 1 : 0) : 1,
        Array.isArray(productData.variations) && productData.variations.length > 0 ? 1 : 0,
        productData.trackInventory ? 1 : 0,
        productData.isFeatured ? 1 : 0,
        productData.isDiscountEligible !== undefined ? (productData.isDiscountEligible ? 1 : 0) : 1,
        productData.minOrderQty || 1,
        productData.maxOrderQty || 99,
        productData.priceDineInCents || null,
        productData.priceTakeawayCents || null,
        productData.priceDeliveryCents || null,
        now,
        now
      )

      // 2. Insert Variations if provided
      if (Array.isArray(productData.variations)) {
        for (const v of productData.variations) {
          db.prepare(`
            INSERT INTO product_variations (id, product_id, name, sku, price_cents, cost_cents, is_default, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          `).run(
            v.id || uuid(),
            productId,
            v.name.trim(),
            v.sku || null,
            v.priceCents || 0,
            v.costCents || 0,
            v.isDefault ? 1 : 0
          )
        }
      }

      // 3. Insert Modifier Groups if provided
      if (Array.isArray(productData.modifierGroups)) {
        for (const mg of productData.modifierGroups) {
          const groupId = mg.id || uuid()
          db.prepare(`
            INSERT INTO modifier_groups (id, product_id, name, is_required, min_selection, max_selection)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(groupId, productId, mg.name.trim(), mg.isRequired ? 1 : 0, mg.minSelection || 0, mg.maxSelection || 1)

          if (Array.isArray(mg.modifiers)) {
            for (const m of mg.modifiers) {
              db.prepare(`
                INSERT INTO modifiers (id, group_id, name, price_cents, is_active)
                VALUES (?, ?, ?, ?, 1)
              `).run(m.id || uuid(), groupId, m.name.trim(), m.priceCents || 0)
            }
          }
        }
      }

      logAudit(productData.branchId, 'CREATE_PRODUCT', 'PRODUCT', productId, {
        name: productData.name,
        priceCents: productData.basePriceCents,
      })

      return productId
    })

    const newId = createTx()
    return productRepository.getProductDetails(newId)
  },

  updateProduct: (id, productData) => {
    const db = getDb()
    const now = new Date().toISOString()

    const updateTx = db.transaction(() => {
      const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id)
      if (!existing) throw new Error(`Product not found: ${id}`)

      const categoryId = productData.categoryId || productData.category_id || existing.category_id
      const basePrice = productData.basePriceCents !== undefined ? productData.basePriceCents : (productData.base_price_cents !== undefined ? productData.base_price_cents : existing.base_price_cents)
      const costPrice = productData.costPriceCents !== undefined ? productData.costPriceCents : (productData.cost_price_cents !== undefined ? productData.cost_price_cents : existing.cost_price_cents)
      const taxRate = productData.taxPercentage !== undefined ? productData.taxPercentage : (productData.tax_percentage !== undefined ? productData.tax_percentage : existing.tax_percentage)
      const prepTime = productData.preparationTimeMinutes !== undefined ? productData.preparationTimeMinutes : (productData.preparation_time_minutes !== undefined ? productData.preparation_time_minutes : existing.preparation_time_minutes)
      const isAvail = productData.isAvailable !== undefined ? (productData.isAvailable ? 1 : 0) : (productData.is_available !== undefined ? (productData.is_available ? 1 : 0) : existing.is_available)
      const trackInv = productData.trackInventory !== undefined ? (productData.trackInventory ? 1 : 0) : (productData.track_inventory !== undefined ? (productData.track_inventory ? 1 : 0) : existing.track_inventory)

      const isFeatured = productData.isFeatured !== undefined ? (productData.isFeatured ? 1 : 0) : (productData.is_featured !== undefined ? (productData.is_featured ? 1 : 0) : existing.is_featured)
      const isDiscEligible = productData.isDiscountEligible !== undefined ? (productData.isDiscountEligible ? 1 : 0) : (productData.is_discount_eligible !== undefined ? (productData.is_discount_eligible ? 1 : 0) : existing.is_discount_eligible)
      const minQty = productData.minOrderQty !== undefined ? productData.minOrderQty : (productData.min_order_qty !== undefined ? productData.min_order_qty : existing.min_order_qty)
      const maxQty = productData.maxOrderQty !== undefined ? productData.maxOrderQty : (productData.max_order_qty !== undefined ? productData.max_order_qty : existing.max_order_qty)
      const priceDineIn = productData.priceDineInCents !== undefined ? productData.priceDineInCents : existing.price_dine_in_cents
      const priceTakeaway = productData.priceTakeawayCents !== undefined ? productData.priceTakeawayCents : existing.price_takeaway_cents
      const priceDelivery = productData.priceDeliveryCents !== undefined ? productData.priceDeliveryCents : existing.price_delivery_cents

      // Price change audit check (Section 24 requirement: record price changes)
      if (existing.base_price_cents !== basePrice) {
        logAudit(productData.branchId, 'PRICE_CHANGE', 'PRODUCT', id, {
          oldPriceCents: existing.base_price_cents,
          newPriceCents: basePrice,
          productName: productData.name || existing.name,
        })
      }

      db.prepare(`
        UPDATE products
        SET category_id = ?, name = ?, sku = ?, barcode = ?, description = ?, image_url = ?,
            base_price_cents = ?, cost_price_cents = ?, tax_percentage = ?,
            preparation_time_minutes = ?, is_available = ?, has_variations = ?,
            track_inventory = ?, is_featured = ?, is_discount_eligible = ?,
            min_order_qty = ?, max_order_qty = ?,
            price_dine_in_cents = ?, price_takeaway_cents = ?, price_delivery_cents = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        categoryId,
        (productData.name || existing.name).trim(),
        productData.sku ? productData.sku.trim() : existing.sku,
        productData.barcode !== undefined ? (productData.barcode ? productData.barcode.trim() : null) : existing.barcode,
        productData.description !== undefined ? productData.description : existing.description,
        productData.imageUrl !== undefined ? productData.imageUrl : (productData.image_url !== undefined ? productData.image_url : existing.image_url),
        basePrice,
        costPrice,
        taxRate,
        prepTime,
        isAvail,
        Array.isArray(productData.variations) && productData.variations.length > 0 ? 1 : existing.has_variations,
        trackInv,
        isFeatured,
        isDiscEligible,
        minQty,
        maxQty,
        priceDineIn,
        priceTakeaway,
        priceDelivery,
        now,
        id
      )

      // Replace variations if provided
      if (Array.isArray(productData.variations)) {
        db.prepare('DELETE FROM product_variations WHERE product_id = ?').run(id)
        for (const v of productData.variations) {
          db.prepare(`
            INSERT INTO product_variations (id, product_id, name, sku, price_cents, cost_cents, is_default, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          `).run(
            v.id || uuid(),
            id,
            v.name.trim(),
            v.sku || null,
            v.priceCents || 0,
            v.costCents || 0,
            v.isDefault ? 1 : 0
          )
        }
      }

      // Replace modifier groups if provided
      if (Array.isArray(productData.modifierGroups)) {
        const oldGroups = db.prepare('SELECT id FROM modifier_groups WHERE product_id = ?').all(id)
        for (const g of oldGroups) {
          db.prepare('DELETE FROM modifiers WHERE group_id = ?').run(g.id)
        }
        db.prepare('DELETE FROM modifier_groups WHERE product_id = ?').run(id)

        for (const mg of productData.modifierGroups) {
          const groupId = mg.id || uuid()
          db.prepare(`
            INSERT INTO modifier_groups (id, product_id, name, is_required, min_selection, max_selection)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(groupId, id, mg.name.trim(), mg.isRequired ? 1 : 0, mg.minSelection || 0, mg.maxSelection || 1)

          if (Array.isArray(mg.modifiers)) {
            for (const m of mg.modifiers) {
              db.prepare(`
                INSERT INTO modifiers (id, group_id, name, price_cents, is_active)
                VALUES (?, ?, ?, ?, 1)
              `).run(m.id || uuid(), groupId, m.name.trim(), m.priceCents || 0)
            }
          }
        }
      }

      logAudit(productData.branchId, 'UPDATE_PRODUCT', 'PRODUCT', id, { name: productData.name })
      return true
    })

    updateTx()
    return productRepository.getProductDetails(id)
  },

  toggleProductAvailability: (id, isAvailable) => {
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare('UPDATE products SET is_available = ?, updated_at = ? WHERE id = ?')
      .run(isAvailable ? 1 : 0, now, id)
    return true
  },

  archiveProduct: (id) => {
    const db = getDb()
    const now = new Date().toISOString()
    // Soft-delete to preserve all historical order records!
    db.prepare('UPDATE products SET is_active = 0, is_available = 0, updated_at = ? WHERE id = ?')
      .run(now, id)
    logAudit(null, 'ARCHIVE_PRODUCT', 'PRODUCT', id, {})
    return true
  },

  // ==========================================
  // COMBOS & DEALS (Section 6.4)
  // ==========================================

  getCombos: (branchId) => {
    const db = getDb()
    const combos = db.prepare(`
      SELECT c.id, c.name, c.code, c.description, c.price_cents, c.is_available,
             c.available_from, c.available_to, c.image_url, c.is_active, c.created_at
      FROM combos c
      WHERE (c.branch_id = ? OR c.branch_id IS NULL) AND c.is_active = 1
      ORDER BY c.name ASC
    `).all(branchId)

    for (const combo of combos) {
      combo.items = db.prepare(`
        SELECT ci.id, ci.product_id, ci.quantity, p.name as product_name, p.base_price_cents
        FROM combo_items ci
        JOIN products p ON ci.product_id = p.id
        WHERE ci.combo_id = ?
      `).all(combo.id)
    }

    return combos
  },

  createCombo: ({ branchId, name, code, description, priceCents, isAvailable = 1, availableFrom = null, availableTo = null, items, imageUrl = null }) => {
    const db = getDb()
    const now = new Date().toISOString()
    const comboId = uuid()

    const createTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO combos (id, branch_id, name, code, description, price_cents, image_url, is_available, available_from, available_to, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        comboId,
        branchId || null,
        name.trim(),
        code || null,
        description || null,
        priceCents,
        imageUrl || null,
        isAvailable ? 1 : 0,
        availableFrom || null,
        availableTo || null,
        now,
        now
      )

      if (Array.isArray(items)) {
        for (const item of items) {
          db.prepare(`
            INSERT INTO combo_items (id, combo_id, product_id, quantity)
            VALUES (?, ?, ?, ?)
          `).run(uuid(), comboId, item.productId, item.quantity || 1)
        }
      }

      logAudit(branchId, 'CREATE_COMBO', 'COMBO', comboId, { name, priceCents })
      return comboId
    })

    return createTx()
  },

  updateCombo: (id, { name, code, description, priceCents, isAvailable, availableFrom, availableTo, items, imageUrl }) => {
    const db = getDb()
    const now = new Date().toISOString()

    const updateTx = db.transaction(() => {
      db.prepare(`
        UPDATE combos
        SET name = ?, code = ?, description = ?, price_cents = ?,
            is_available = ?, available_from = ?, available_to = ?, image_url = COALESCE(?, image_url), updated_at = ?
        WHERE id = ?
      `).run(
        name.trim(),
        code ? code.trim() : null,
        description ? description.trim() : null,
        priceCents,
        isAvailable !== undefined ? (isAvailable ? 1 : 0) : 1,
        availableFrom || null,
        availableTo || null,
        imageUrl !== undefined ? imageUrl : null,
        now,
        id
      )

      if (Array.isArray(items)) {
        db.prepare('DELETE FROM combo_items WHERE combo_id = ?').run(id)
        for (const item of items) {
          db.prepare(`
            INSERT INTO combo_items (id, combo_id, product_id, quantity)
            VALUES (?, ?, ?, ?)
          `).run(uuid(), id, item.productId, item.quantity || 1)
        }
      }

      logAudit(null, 'UPDATE_COMBO', 'COMBO', id, { name, priceCents })
      return true
    })

    return updateTx()
  },

  toggleComboAvailability: (id, isAvailable) => {
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare('UPDATE combos SET is_available = ?, updated_at = ? WHERE id = ?')
      .run(isAvailable ? 1 : 0, now, id)
    return true
  },

  archiveCombo: (id) => {
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare('UPDATE combos SET is_active = 0, updated_at = ? WHERE id = ?').run(now, id)
    logAudit(null, 'ARCHIVE_COMBO', 'COMBO', id, {})
    return true
  },
}
