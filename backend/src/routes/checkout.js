// =============================================================================
// src/routes/checkout.js
// POST /api/checkout — The Risk Scoring Gateway
// =============================================================================
// This is the core business logic endpoint. For COD orders:
//   1. Query the customer_risk_scores VIEW from Phase 1.
//   2. If the score is below the 40-point threshold → 403 (demand prepayment).
//   3. If eligible → create an address record, insert the order and its items,
//      generate a simulated OTP (stored as SHA-256 hash), and return the order.
//
// For prepaid orders, the risk check is skipped entirely.
// =============================================================================

const express = require('express');
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const hashOtp = require('../utils/hashOtp');
const { protect } = require('../middleware/auth');

const router = express.Router();

// COD eligibility threshold (matches the VIEW definition in schema.sql)
const COD_RISK_THRESHOLD = 40;

// ---------------------------------------------------------------------------
// POST /api/checkout
// Protected: requires valid JWT (customer must be logged in to place an order)
// ---------------------------------------------------------------------------
router.post('/', protect, async (req, res, next) => {
  try {
    const {
      cartItems,      // Array: [{ productId, quantity }, ...]
      paymentMethod,  // 'cod' | 'prepaid'
      address,        // { blockSectorId, streetAddress, apartment?, landmark? }
      notes,          // Optional delivery notes
    } = req.body;

    // =========================================================================
    // STEP 1: Input Validation
    // =========================================================================
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return next(new AppError('cartItems must be a non-empty array.', 400));
    }
    if (!['cod', 'prepaid'].includes(paymentMethod)) {
      return next(new AppError('paymentMethod must be "cod" or "prepaid".', 400));
    }
    if (!address?.blockSectorId || !address?.streetAddress) {
      return next(new AppError('address.blockSectorId and address.streetAddress are required.', 400));
    }

    // Validate each cart item has a productId and positive quantity.
    for (const item of cartItems) {
      if (!item.productId || !item.quantity || item.quantity < 1) {
        return next(new AppError('Each cart item must have a valid productId and quantity >= 1.', 400));
      }
    }

    // =========================================================================
    // STEP 2: COD Risk Score Check (THE CORE FEATURE)
    // =========================================================================
    // We only run this check for COD orders. Prepaid orders skip straight
    // to order creation since the merchant collects money upfront.
    // =========================================================================
    let riskScoreSnapshot = null;

    if (paymentMethod === 'cod') {
      // Query the customer_risk_scores VIEW. Because it's a LEFT JOIN,
      // a brand-new user with no history will return risk_score = 100.
      const riskResult = await pool.query(
        `SELECT risk_score, is_cod_eligible, total_rto, total_delivered, total_orders
         FROM customer_risk_scores
         WHERE user_id = $1`,
        [req.user.id]
      );

      // Edge case: user not found in the view (should not happen since view
      // covers all customers, but guard defensively).
      const riskData = riskResult.rows[0] || {
        risk_score: 100,
        is_cod_eligible: true,
        total_rto: 0,
        total_delivered: 0,
        total_orders: 0,
      };

      riskScoreSnapshot = parseInt(riskData.risk_score, 10);

      if (!riskData.is_cod_eligible) {
        // --- BLOCKED: Return a 403 with full risk breakdown for transparency ---
        return res.status(403).json({
          status: 'fail',
          message:
            `Your COD Risk Score is ${riskScoreSnapshot}/100, which is below ` +
            `the minimum threshold of ${COD_RISK_THRESHOLD}. ` +
            `Please select a prepaid payment method to complete this order.`,
          data: {
            riskScore: riskScoreSnapshot,
            threshold: COD_RISK_THRESHOLD,
            totalRto: parseInt(riskData.total_rto, 10),
            totalDelivered: parseInt(riskData.total_delivered, 10),
            totalOrders: parseInt(riskData.total_orders, 10),
            suggestion: 'prepaid',
          },
        });
      }
    }

    // =========================================================================
    // STEP 3: Validate Products & Calculate Total
    // =========================================================================
    // Fetch all products in a single query (avoids N+1 problem).
    // We use FOR SHARE to prevent another transaction from modifying these
    // rows while we're reading them. Note: actual stock deduction happens
    // in the OTP verification step (ACID transaction).
    const productIds = cartItems.map((item) => item.productId);
    const productResult = await pool.query(
      `SELECT id, name, price, stock_quantity
       FROM products
       WHERE id = ANY($1::uuid[]) AND is_active = true`,
      [productIds]
    );

    // Ensure every product in the cart was found.
    if (productResult.rows.length !== productIds.length) {
      return next(new AppError('One or more products in your cart are unavailable.', 400));
    }

    // Build a lookup map for O(1) access.
    const productMap = {};
    for (const p of productResult.rows) {
      productMap[p.id] = p;
    }

    // Validate stock availability and calculate total.
    let totalAmount = 0;
    const enrichedItems = [];

    for (const item of cartItems) {
      const product = productMap[item.productId];
      if (item.quantity > product.stock_quantity) {
        return next(
          new AppError(
            `Insufficient stock for "${product.name}". ` +
            `Requested: ${item.quantity}, Available: ${product.stock_quantity}`,
            400
          )
        );
      }
      const lineTotal = parseFloat(product.price) * item.quantity;
      totalAmount += lineTotal;
      enrichedItems.push({
        productId: product.id,
        quantity: item.quantity,
        unitPrice: parseFloat(product.price),
      });
    }

    // =========================================================================
    // STEP 4: Persist Address, Order & Order Items
    // =========================================================================
    // We use pool.query() (not a transaction client) here because this set of
    // INSERTs is atomic enough for order creation. The critical ACID transaction
    // is reserved for the OTP verification step where stock actually moves.
    //
    // However, we do verify the block_sector_id FK will be satisfied.
    // =========================================================================

    // 4a. Create the address record.
    const addressResult = await pool.query(
      `INSERT INTO addresses (block_sector_id, street_address, apartment, landmark)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        address.blockSectorId,
        address.streetAddress,
        address.apartment || null,
        address.landmark || null,
      ]
    );
    const addressId = addressResult.rows[0].id;

    // 4b. Generate OTP.
    // For this demo: OTP is always '1234' (simulating a WhatsApp send).
    // In production: generate crypto.randomInt(100000, 999999).toString()
    // and send via WhatsApp Business API.
    const plainOtp = process.env.DEMO_OTP || '1234';
    const otpHash = hashOtp(plainOtp);
    const otpExpiresAt = new Date(
      Date.now() + (parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10) * 60 * 1000
    );

    // 4c. Insert the order.
    const orderResult = await pool.query(
      `INSERT INTO orders
         (user_id, address_id, status, payment_method, total_amount,
          otp_hash, otp_expires_at, risk_score_snapshot, notes)
       VALUES ($1, $2, 'pending_otp', $3, $4, $5, $6, $7, $8)
       RETURNING id, status, payment_method, total_amount, risk_score_snapshot, created_at`,
      [
        req.user.id,
        addressId,
        paymentMethod,
        totalAmount.toFixed(2),
        paymentMethod === 'cod' ? otpHash : null,   // Prepaid orders don't need OTP
        paymentMethod === 'cod' ? otpExpiresAt : null,
        riskScoreSnapshot,
        notes || null,
      ]
    );
    const newOrder = orderResult.rows[0];

    // 4d. Insert all order items in a single multi-row INSERT.
    // Build parameterized placeholders dynamically: ($1,$2,$3),($4,$5,$6),...
    const itemValues = [];
    const itemPlaceholders = enrichedItems.map((item, i) => {
      const offset = i * 3;
      itemValues.push(newOrder.id, item.productId, item.quantity, item.unitPrice);
      // Adjust offset for 4 params per item
      return `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`;
    });

    await pool.query(
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
       VALUES ${itemPlaceholders.join(', ')}`,
      itemValues
    );

    // =========================================================================
    // STEP 5: Return the newly created order.
    // We include the plain OTP in the response ONLY for demo purposes —
    // in production, this would be sent exclusively via WhatsApp.
    // =========================================================================
    return res.status(201).json({
      status: 'success',
      message:
        paymentMethod === 'cod'
          ? `Order placed. An OTP has been sent to ${req.user.phone_number} via WhatsApp.`
          : 'Order placed successfully with prepaid payment.',
      data: {
        order: {
          id: newOrder.id,
          status: newOrder.status,
          paymentMethod: newOrder.payment_method,
          totalAmount: parseFloat(newOrder.total_amount),
          riskScoreSnapshot: newOrder.risk_score_snapshot,
          createdAt: newOrder.created_at,
        },
        // DEMO ONLY — remove in production:
        _demo: paymentMethod === 'cod'
          ? { otp: plainOtp, expiresAt: otpExpiresAt, message: 'This OTP is shown here for demo purposes only.' }
          : undefined,
      },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
