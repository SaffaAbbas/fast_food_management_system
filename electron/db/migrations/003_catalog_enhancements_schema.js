/**
 * Migration 003: Catalog Enhancements (Section 6 Specification)
 * Adds:
 * - Category visibility settings (POS & Online) and subcategory parent_id (Section 6.1)
 * - Product-level featured flag, discount eligibility, min/max order quantity (Section 6.2)
 * - Optional order-type pricing: Dine-in, Takeaway, Delivery (Section 6.2)
 * - Combo scheduling and active availability window (Section 6.4)
 */
export const migration003 = {
  version: 3,
  name: 'catalog_enhancements_schema',
  up: (db) => {
    // Categories enhancements (Section 6.1)
    try { db.exec('ALTER TABLE categories ADD COLUMN parent_id TEXT;') } catch (e) {}
    try { db.exec('ALTER TABLE categories ADD COLUMN is_visible_pos INTEGER DEFAULT 1;') } catch (e) {}
    try { db.exec('ALTER TABLE categories ADD COLUMN is_visible_online INTEGER DEFAULT 1;') } catch (e) {}

    // Products enhancements (Section 6.2)
    try { db.exec('ALTER TABLE products ADD COLUMN is_featured INTEGER DEFAULT 0;') } catch (e) {}
    try { db.exec('ALTER TABLE products ADD COLUMN is_discount_eligible INTEGER DEFAULT 1;') } catch (e) {}
    try { db.exec('ALTER TABLE products ADD COLUMN min_order_qty INTEGER DEFAULT 1;') } catch (e) {}
    try { db.exec('ALTER TABLE products ADD COLUMN max_order_qty INTEGER DEFAULT 99;') } catch (e) {}
    try { db.exec('ALTER TABLE products ADD COLUMN price_dine_in_cents INTEGER DEFAULT NULL;') } catch (e) {}
    try { db.exec('ALTER TABLE products ADD COLUMN price_takeaway_cents INTEGER DEFAULT NULL;') } catch (e) {}
    try { db.exec('ALTER TABLE products ADD COLUMN price_delivery_cents INTEGER DEFAULT NULL;') } catch (e) {}

    // Combos enhancements (Section 6.4)
    try { db.exec('ALTER TABLE combos ADD COLUMN is_available INTEGER DEFAULT 1;') } catch (e) {}
    try { db.exec('ALTER TABLE combos ADD COLUMN available_from TEXT DEFAULT NULL;') } catch (e) {}
    try { db.exec('ALTER TABLE combos ADD COLUMN available_to TEXT DEFAULT NULL;') } catch (e) {}
  },
}
