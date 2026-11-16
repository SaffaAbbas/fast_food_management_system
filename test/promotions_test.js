import path from 'node:path'
import fs from 'node:fs'
import { initDatabase, getDb, closeDatabase } from '../electron/db/index.js'
import { authRepository } from '../electron/db/repositories/authRepository.js'
import { couponRepository } from '../electron/db/repositories/couponRepository.js'
import { orderRepository } from '../electron/db/repositories/orderRepository.js'

async function runTests() {
  console.log('====================================================')
  console.log('Promotions & Coupons engine')
  console.log('====================================================')

  const testDbDir = path.resolve(process.cwd(), 'test_promo_scratch')
  const testDbPath = path.join(testDbDir, 'test_promo.sqlite')
  if (fs.existsSync(testDbDir)) fs.rmSync(testDbDir, { recursive: true, force: true })
  fs.mkdirSync(testDbDir, { recursive: true })

  try {
    initDatabase({ dbPath: testDbPath, seed: true })
    const db = getDb()
    const branch = db.prepare('SELECT id FROM branches LIMIT 1').get()
    const adminUser = db.prepare("SELECT * FROM users WHERE username = 'admin'").get()
    authRepository.loginWithPin('1234', adminUser.id)
    const product = db.prepare('SELECT id, category_id, base_price_cents FROM products WHERE is_active = 1 LIMIT 1').get()
    const version = db.prepare('SELECT MAX(version) as v FROM schema_migrations').get()
    if (version.v < 18) throw new Error(`Expected schema v18+, got ${version.v}`)
    console.log('✓ schema v18 promotions applied')

    const welcome = couponRepository.validateCoupon({
      branchId: branch.id,
      code: 'WELCOME10',
      orderTotalCents: 3000,
    })
    if (welcome.discountCents !== 300) throw new Error(`WELCOME10 expected 300, got ${welcome.discountCents}`)
    console.log('✓ percentage discount')

    const capped = couponRepository.createCoupon({
      branchId: branch.id,
      code: 'CAP50',
      title: '50% with $5 cap',
      discountType: 'PERCENTAGE',
      discountValue: 50,
      minOrderCents: 0,
      maxDiscountCents: 500,
    })
    const capResult = couponRepository.validateCoupon({
      branchId: branch.id,
      code: 'CAP50',
      orderTotalCents: 4000,
    })
    if (capResult.discountCents !== 500) throw new Error(`Cap expected 500, got ${capResult.discountCents}`)
    console.log('✓ maximum discount cap')

    try {
      couponRepository.validateCoupon({ branchId: branch.id, code: 'LUNCH5', orderTotalCents: 1000 })
      throw new Error('min spend should fail')
    } catch (err) {
      if (!String(err.message).includes('minimum spend')) throw err
    }
    console.log('✓ minimum order condition')

    const future = couponRepository.createCoupon({
      branchId: branch.id,
      code: 'FUTURE1',
      title: 'Future window',
      discountType: 'FIXED_AMOUNT',
      discountValue: 100,
      startDate: '2099-01-01T00:00',
      endDate: '2099-12-31T23:59',
    })
    try {
      couponRepository.validateCoupon({ branchId: branch.id, code: 'FUTURE1', orderTotalCents: 5000 })
      throw new Error('future coupon should fail')
    } catch (err) {
      if (!String(err.message).includes('not active yet')) throw err
    }
    console.log('✓ start/end datetime')

    if (!db.prepare("SELECT id FROM coupons WHERE code = 'HAPPYHOUR'").get()) {
      couponRepository.createCoupon({
        branchId: branch.id,
        code: 'HAPPYHOUR',
        title: 'Happy Hour 15% (4–7pm)',
        discountType: 'PERCENTAGE',
        discountValue: 15,
        maxDiscountCents: 1500,
        startTime: '16:00',
        endTime: '19:00',
        daysOfWeek: '0,1,2,3,4,5,6',
        isAutoApply: true,
      })
    }
    if (!db.prepare("SELECT id FROM coupons WHERE code = 'VIPONLY'").get()) {
      couponRepository.createCoupon({
        branchId: branch.id,
        code: 'VIPONLY',
        title: 'VIP 12% off',
        discountType: 'PERCENTAGE',
        discountValue: 12,
        minOrderCents: 2000,
        maxDiscountCents: 1000,
        customerSegment: 'VIP',
      })
    }

    const happyNow = { iso: '2026-11-16T12:00:00.000Z', date: '2026-11-16', time: '17:00', day: '1' }
    const happyOff = { iso: '2026-11-16T08:00:00.000Z', date: '2026-11-16', time: '10:00', day: '1' }
    const hh = couponRepository.validateCoupon({
      branchId: branch.id,
      code: 'HAPPYHOUR',
      orderTotalCents: 2000,
      now: happyNow,
    })
    if (hh.discountCents !== 300) throw new Error(`Happy hour 15% of 2000 expected 300, got ${hh.discountCents}`)
    try {
      couponRepository.validateCoupon({
        branchId: branch.id,
        code: 'HAPPYHOUR',
        orderTotalCents: 2000,
        now: happyOff,
      })
      throw new Error('happy hour off-peak should fail')
    } catch (err) {
      if (!String(err.message).toLowerCase().includes('valid')) throw err
    }
    const autoOn = couponRepository.evaluateAutoPromotions({
      branchId: branch.id,
      orderTotalCents: 2000,
      now: happyNow,
    })
    if (!autoOn || autoOn.code !== 'HAPPYHOUR') throw new Error('auto happy hour should apply')
    console.log('✓ happy-hour / time-based + auto-apply')

    let vip = db.prepare("SELECT id FROM customers WHERE tag = 'VIP' LIMIT 1").get()
    let regular = db.prepare("SELECT id FROM customers WHERE tag IS NULL OR tag != 'VIP' LIMIT 1").get()
    if (!vip) {
      const { customerRepository } = await import('../electron/db/repositories/customerRepository.js')
      vip = customerRepository.createCustomer({ branchId: branch.id, name: 'VIP Promo', phone: '+15550100', tag: 'VIP' })
    }
    if (!regular) {
      const { customerRepository } = await import('../electron/db/repositories/customerRepository.js')
      regular = customerRepository.createCustomer({ branchId: branch.id, name: 'Regular Promo', phone: '+15550101', tag: 'REGULAR' })
    }
    couponRepository.validateCoupon({
      branchId: branch.id,
      code: 'VIPONLY',
      orderTotalCents: 3000,
      customerId: vip?.id,
    })
    try {
      couponRepository.validateCoupon({
        branchId: branch.id,
        code: 'VIPONLY',
        orderTotalCents: 3000,
        customerId: regular?.id,
      })
      throw new Error('segment should fail for non-VIP')
    } catch (err) {
      if (!String(err.message).includes('VIP')) throw err
    }
    console.log('✓ customer-segment offers')

    let catCoupon = db.prepare("SELECT * FROM coupons WHERE code = 'CAT10'").get()
    if (!catCoupon) {
      catCoupon = couponRepository.createCoupon({
        branchId: branch.id,
        code: 'CAT10',
        title: '10% off category',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        appliesTo: 'CATEGORY',
        targetId: product.category_id,
        maxDiscountCents: 800,
      })
    }
    const catPromo = couponRepository.validateCoupon({
      branchId: branch.id,
      code: 'CAT10',
      orderTotalCents: 2000,
      items: [
        { productId: product.id, categoryId: catCoupon?.target_id || product.category_id, quantity: 1, unitPriceCents: 2000, totalCents: 2000 },
        { productId: 'other', categoryId: 'none', quantity: 1, unitPriceCents: 5000, totalCents: 5000 },
      ],
    })
    if (catPromo.discountCents !== 200) throw new Error(`category 10% of 2000 expected 200, got ${catPromo.discountCents}`)
    console.log('✓ product/category-specific discount')

    couponRepository.createCoupon({
      branchId: branch.id,
      code: 'BXGYTEST',
      title: 'Buy 2 get 1',
      discountType: 'BOGO',
      discountValue: 0,
      appliesTo: 'PRODUCT',
      targetId: product.id,
      buyQty: 2,
      getQty: 1,
      getProductId: product.id,
    })
    const bogo = couponRepository.validateCoupon({
      branchId: branch.id,
      code: 'BXGYTEST',
      orderTotalCents: 3000,
      items: [
        { productId: product.id, quantity: 3, unitPriceCents: 1000, totalCents: 3000 },
      ],
    })
    if (bogo.discountCents !== 1000) throw new Error(`BOGO expected 1000, got ${bogo.discountCents}`)
    console.log('✓ Buy X Get Y')

    const limited = couponRepository.createCoupon({
      branchId: branch.id,
      code: 'ONCE10',
      title: 'Once',
      discountType: 'FIXED_AMOUNT',
      discountValue: 100,
      usageLimit: 1,
    })
    couponRepository.recordRedemption({
      couponId: limited.id,
      orderId: 'ord-test-1',
      discountCents: 100,
      status: 'CONFIRMED',
    })
    const after = db.prepare('SELECT times_used FROM coupons WHERE id = ?').get(limited.id)
    if (after.times_used !== 1) throw new Error('times_used should increment')
    try {
      couponRepository.validateCoupon({ branchId: branch.id, code: 'ONCE10', orderTotalCents: 5000 })
      throw new Error('usage limit should fail')
    } catch (err) {
      if (!String(err.message).includes('usage limit')) throw err
    }
    console.log('✓ coupon usage limits')

    const order = orderRepository.createOrder({
      branchId: branch.id,
      cashierId: adminUser.id,
      orderType: 'TAKEAWAY',
      status: 'CONFIRMED',
      subtotalCents: 3000,
      discountCents: 300,
      discountReason: 'Coupon: WELCOME10',
      couponCode: 'WELCOME10',
      taxCents: 0,
      totalCents: 2700,
      items: [
        {
          productId: product.id,
          name: 'Promo item',
          quantity: 1,
          unitPriceCents: 3000,
          totalCents: 3000,
        },
      ],
    })
    const used = db.prepare("SELECT times_used FROM coupons WHERE code = 'WELCOME10'").get()
    const redemption = db.prepare('SELECT * FROM coupon_redemptions WHERE order_id = ?').get(order.id)
    if (!redemption) throw new Error('expected coupon redemption on confirm')
    if (used.times_used < 1) throw new Error('WELCOME10 times_used not incremented on order')
    console.log(`✓ usage recorded on order ${order.orderNumber || order.order_number}`)

    const otherBranch = couponRepository.createCoupon({
      branchId: branch.id,
      code: 'BRANCHME',
      title: 'This branch only',
      discountType: 'PERCENTAGE',
      discountValue: 5,
    })
    const listed = couponRepository.getCoupons(branch.id).some((c) => c.code === 'BRANCHME')
    if (!listed || otherBranch.branch_id !== branch.id) throw new Error('branch-specific coupon missing')
    console.log('✓ branch-specific promotion')

    console.log('\nAll promotion checks passed.')
    process.exit(0)
  } finally {
    closeDatabase()
  }
}

runTests().catch((err) => {
  console.error(err)
  process.exit(1)
})
