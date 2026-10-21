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
    // STEP 3: Validate Products & Calculate Total (inside the transaction)
    // =========================================================================
    // We begin the transaction here so that the address insert, order insert,
    // order_items insert — and stock deduction for prepaid — are all atomic.
    // If any step fails, ROLLBACK leaves no orphan rows.
    //
    // Product fetch strategy:
    //   - Prepaid:  SELECT ... ORDER BY id FOR UPDATE  (lock rows; stock is
    //               deducted in this same transaction)
    //   - COD:      SELECT ... ORDER BY id             (no lock needed; stock
    //               deduction happens later in verify-otp's own transaction)
    //
    // Consistent ORDER BY id on both paths eliminates deadlock risk if two
    // concurrent prepaid checkouts share product rows.
    // =========================================================================
    const productIds = cartItems.map((item) => item.productId);

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      // Fetch products — lock rows only for prepaid (stock deducted here).
      const productResult = await client.query(
        `SELECT id, name, price, stock_quantity
         FROM products
         WHERE id = ANY($1::uuid[]) AND is_active = true
         ORDER BY id${paymentMethod === 'prepaid' ? ' FOR UPDATE' : ''}`,
        [productIds]
      );

      // Ensure every product in the cart was found.
      if (productResult.rows.length !== productIds.length) {
        await client.query('ROLLBACK');
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
          await client.query('ROLLBACK');
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
      // STEP 4: Persist Address, Order & Order Items (all in one transaction)
      // =========================================================================

      // 4a. Create the address record.
      const addressResult = await client.query(
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

      // 4b. Prepare OTP values (COD only).
      // For this demo: OTP is always the DEMO_OTP env var (default '1234'),
      // simulating a WhatsApp Business API send.
      const plainOtp = process.env.DEMO_OTP || '1234';
      const otpHash = paymentMethod === 'cod' ? hashOtp(plainOtp) : null;
      const otpExpiresAt = paymentMethod === 'cod'
        ? new Date(Date.now() + (parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10) * 60 * 1000)
        : null;

      // 4c. Insert the order.
      //   - COD:     status = 'pending_otp', OTP hash stored, stock untouched
      //   - Prepaid: status = 'verified',    no OTP, stock deducted below
      const initialStatus = paymentMethod === 'cod' ? 'pending_otp' : 'verified';

      const orderResult = await client.query(
        `INSERT INTO orders
           (user_id, address_id, status, payment_method, total_amount,
            otp_hash, otp_expires_at, risk_score_snapshot, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, status, payment_method, total_amount, risk_score_snapshot, created_at`,
        [
          req.user.id,
          addressId,
          initialStatus,
          paymentMethod,
          totalAmount.toFixed(2),
          otpHash,
          otpExpiresAt,
          riskScoreSnapshot,
          notes || null,
        ]
      );
      const newOrder = orderResult.rows[0];

      // 4d. Insert all order items in a single multi-row INSERT.
      // Build parameterised placeholders: ($1,$2,$3,$4), ($5,$6,$7,$8), …
      const itemValues = [];
      const itemPlaceholders = enrichedItems.map((item, i) => {
        itemValues.push(newOrder.id, item.productId, item.quantity, item.unitPrice);
        return `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`;
      });

      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
         VALUES ${itemPlaceholders.join(', ')}`,
        itemValues
      );

      // 4e. Prepaid: deduct stock atomically in this same transaction.
      // The DB CHECK (stock_quantity >= 0) acts as the final backstop.
      if (paymentMethod === 'prepaid') {
        for (const item of enrichedItems) {
          await client.query(
            `UPDATE products
             SET stock_quantity = stock_quantity - $1
             WHERE id = $2`,
            [item.quantity, item.productId]
          );
        }
      }

      // =========================================================================
      // COMMIT — address, order, items (and prepaid stock deduction) are atomic.
      // =========================================================================
      await client.query('COMMIT');

      // =========================================================================
      // STEP 5: Return the newly created order.
      // The plain OTP is included in the response for demo purposes only —
      // in production it would be sent exclusively via WhatsApp Business API.
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
      if (client) await client.query('ROLLBACK').catch(() => {});
      return next(err);
    } finally {
      if (client) client.release();
    }
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
