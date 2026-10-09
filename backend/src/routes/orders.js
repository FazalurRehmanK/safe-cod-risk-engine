// =============================================================================
// src/routes/orders.js
// Order Management: OTP Verification (ACID) + Admin Dashboard APIs
// =============================================================================

const express = require('express');
const pool = require('../config/db');
const AppError = require('../utils/AppError');
const hashOtp = require('../utils/hashOtp');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// =============================================================================
// POST /api/orders/:orderId/verify-otp
// THE ACID TRANSACTION — The Technical Centrepiece of This Portfolio Project
// =============================================================================
//
// This endpoint is the most important in the entire system. It performs THREE
// operations that MUST either ALL succeed or ALL fail together:
//
//   [1] Verify the OTP hash and expiry (READ + VALIDATE)
//   [2] Update the order status from 'pending_otp' → 'verified' (WRITE)
//   [3] Deduct stock quantity for every item in the order (WRITE × N)
//
// Without ACID guarantees:
//   - Two simultaneous verifications could both read the same stock level,
//     both think there's enough, and both deduct — resulting in negative stock.
//   - A crash between steps 2 and 3 would leave the order verified but stock
//     still not deducted — inventory would be permanently inaccurate.
//
// Our approach:
//   - pool.connect() → gets a DEDICATED connection for this transaction.
//     Using pool.query() would not work because each call might get a
//     different connection from the pool, breaking the transaction context.
//   - SELECT ... FOR UPDATE → row-level lock on the order. If two requests
//     hit this endpoint simultaneously for the same order, the second one
//     waits until the first COMMITS or ROLLBACKs.
//   - The CHECK (stock_quantity >= 0) on the products table is the FINAL
//     safety net. If our application-level check missed something, PostgreSQL
//     itself will throw and trigger our ROLLBACK.
// =============================================================================

router.post('/:orderId/verify-otp', protect, async (req, res, next) => {
  // Acquire a dedicated client from the pool for this transaction.
  // This client holds a single DB connection exclusively for us.
  const client = await pool.connect();

  try {
    const { orderId } = req.params;
    const { otp } = req.body;

    if (!otp) {
      return next(new AppError('OTP is required.', 400));
    }

    // =========================================================================
    // BEGIN TRANSACTION
    // All subsequent queries on `client` are now part of this transaction.
    // =========================================================================
    await client.query('BEGIN');

    // -------------------------------------------------------------------------
    // STEP 1: Lock & Read the Order Row
    // `FOR UPDATE` acquires a row-level lock on this order.
    // Any other transaction trying to update this row will BLOCK here until
    // we COMMIT or ROLLBACK. This prevents race conditions.
    // -------------------------------------------------------------------------
    const orderResult = await client.query(
      `SELECT o.id, o.status, o.otp_hash, o.otp_expires_at, o.payment_method, o.user_id
       FROM orders o
       WHERE o.id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return next(new AppError('Order not found.', 404));
    }

    const order = orderResult.rows[0];

    // -------------------------------------------------------------------------
    // STEP 2: Business Rule Validations (inside the transaction)
    // -------------------------------------------------------------------------

    // Guard: Only the order's owner can verify their OTP.
    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return next(new AppError('You are not authorized to verify this order.', 403));
    }

    // Guard: Order must be in 'pending_otp' state.
    if (order.status !== 'pending_otp') {
      await client.query('ROLLBACK');
      return next(
        new AppError(
          `This order cannot be verified. Current status: "${order.status}".`,
          409
        )
      );
    }

    // Guard: Prepaid orders don't use OTPs.
    if (order.payment_method !== 'cod') {
      await client.query('ROLLBACK');
      return next(new AppError('OTP verification is only required for COD orders.', 400));
    }

    // Guard: Check OTP expiry.
    if (new Date() > new Date(order.otp_expires_at)) {
      await client.query('ROLLBACK');
      return next(
        new AppError('This OTP has expired. Please request a new one.', 410)
      );
    }

    // Guard: Verify the OTP hash.
    const submittedHash = hashOtp(otp);
    if (submittedHash !== order.otp_hash) {
      await client.query('ROLLBACK');
      return next(new AppError('Incorrect OTP. Please try again.', 401));
    }

    // -------------------------------------------------------------------------
    // STEP 3: Update Order Status → 'verified'
    // The updated_at trigger fires automatically here.
    // -------------------------------------------------------------------------
    await client.query(
      `UPDATE orders
       SET status = 'verified', otp_hash = NULL, otp_expires_at = NULL
       WHERE id = $1`,
      [orderId]
    );

    // -------------------------------------------------------------------------
    // STEP 4: Fetch All Order Items for Stock Deduction
    // -------------------------------------------------------------------------
    const itemsResult = await client.query(
      `SELECT oi.product_id, oi.quantity, p.name, p.stock_quantity
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = $1
       FOR UPDATE OF p`,    // Lock the product rows too during deduction
      [orderId]
    );

    // -------------------------------------------------------------------------
    // STEP 5: Deduct Stock for Each Item
    // We deduct one product at a time. If ANY deduction would violate the
    // CHECK (stock_quantity >= 0) constraint, PostgreSQL raises an exception,
    // which our catch block intercepts → ROLLBACK.
    //
    // This is ACID Isolation + Consistency working together: the DB enforces
    // the business rule even if our application logic has a gap.
    // -------------------------------------------------------------------------
    for (const item of itemsResult.rows) {
      // Application-level pre-check (for a clear error message).
      if (item.stock_quantity < item.quantity) {
        // Manually rollback before throwing — stock is insufficient.
        await client.query('ROLLBACK');
        return next(
          new AppError(
            `Insufficient stock for "${item.name}". ` +
            `Required: ${item.quantity}, Available: ${item.stock_quantity}. ` +
            `The order has been rolled back. Please contact support.`,
            409
          )
        );
      }

      await client.query(
        `UPDATE products
         SET stock_quantity = stock_quantity - $1
         WHERE id = $2`,
        [item.quantity, item.product_id]
      );
      // Note: Even if our check above passes, the DB-level CHECK constraint
      // on stock_quantity >= 0 acts as a final atomic guarantee. A concurrent
      // transaction that also deducted stock between our check and this UPDATE
      // would be caught here, triggering the catch block → ROLLBACK.
    }

    // =========================================================================
    // COMMIT — All three operations succeeded. Changes are now permanent.
    // =========================================================================
    await client.query('COMMIT');

    return res.status(200).json({
      status: 'success',
      message: 'OTP verified successfully. Your order is confirmed!',
      data: {
        orderId,
        newStatus: 'verified',
        itemsDeducted: itemsResult.rows.map((i) => ({
          product: i.name,
          quantityDeducted: i.quantity,
          remainingStock: i.stock_quantity - i.quantity,
        })),
      },
    });
  } catch (err) {
    // =========================================================================
    // ROLLBACK — Something failed. Every change within this transaction
    // is undone atomically. The database is left exactly as it was before
    // the BEGIN statement.
    // =========================================================================
    await client.query('ROLLBACK');
    return next(err);
  } finally {
    // ALWAYS release the client back to the pool, whether we succeeded or failed.
    // Failing to release causes connection leaks that will eventually
    // exhaust the pool and crash the server.
    client.release();
  }
});

// =============================================================================
// GET /api/orders
// Customer: view their own orders.
// =============================================================================
router.get('/', protect, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
          o.id, o.status, o.payment_method, o.total_amount,
          o.risk_score_snapshot, o.notes, o.created_at, o.updated_at,
          -- Reconstruct the full address for display
          bs.name  AS block_sector,
          t.name   AS town,
          d.name   AS district,
          a.street_address, a.apartment, a.landmark,
          -- Aggregate order items into a JSON array
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'productId',  oi.product_id,
                'name',       p.name,
                'quantity',   oi.quantity,
                'unitPrice',  oi.unit_price,
                'lineTotal',  (oi.quantity * oi.unit_price)
              )
            ) FILTER (WHERE oi.id IS NOT NULL),
            '[]'
          ) AS items
       FROM orders o
       JOIN addresses a      ON a.id = o.address_id
       JOIN block_sectors bs ON bs.id = a.block_sector_id
       JOIN towns t          ON t.id = bs.town_id
       JOIN districts d      ON d.id = t.district_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN products p     ON p.id = oi.product_id
       WHERE o.user_id = $1
       GROUP BY o.id, bs.name, t.name, d.name, a.street_address, a.apartment, a.landmark
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );

    return res.status(200).json({
      status: 'success',
      results: result.rows.length,
      data: { orders: result.rows },
    });
  } catch (err) {
    return next(err);
  }
});

// =============================================================================
// GET /api/orders/admin/all
// Admin: view ALL orders with customer risk scores. Protected + admin only.
// =============================================================================
router.get('/admin/all', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    // Build a conditional WHERE clause for optional status filtering.
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`o.status = $${params.length}::order_status`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Pagination params
    params.push(parseInt(limit, 10));
    const limitParam = `$${params.length}`;
    params.push(offset);
    const offsetParam = `$${params.length}`;

    const result = await pool.query(
      `SELECT
          o.id, o.status, o.payment_method, o.total_amount,
          o.risk_score_snapshot, o.created_at, o.updated_at,
          -- Customer info
          u.id          AS customer_id,
          u.full_name   AS customer_name,
          u.phone_number,
          -- Live risk score from the VIEW (may differ from snapshot)
          COALESCE(crs.risk_score, 100)       AS live_risk_score,
          COALESCE(crs.is_cod_eligible, true) AS is_cod_eligible,
          COALESCE(crs.total_rto, 0)          AS total_rto,
          COALESCE(crs.total_delivered, 0)    AS total_delivered,
          COALESCE(crs.total_orders, 0)       AS total_orders,
          -- Delivery address
          bs.name AS block_sector,
          t.name  AS town,
          d.name  AS district,
          a.street_address, a.landmark
       FROM orders o
       JOIN users u          ON u.id = o.user_id
       JOIN addresses a      ON a.id = o.address_id
       JOIN block_sectors bs ON bs.id = a.block_sector_id
       JOIN towns t          ON t.id = bs.town_id
       JOIN districts d      ON d.id = t.district_id
       LEFT JOIN customer_risk_scores crs ON crs.user_id = u.id
       ${whereClause}
       ORDER BY o.created_at DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params
    );

    // Get total count for pagination metadata.
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM orders o ${whereClause}`,
      status ? [status] : []
    );
    const totalOrders = parseInt(countResult.rows[0].count, 10);

    return res.status(200).json({
      status: 'success',
      results: result.rows.length,
      pagination: {
        total: totalOrders,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(totalOrders / parseInt(limit, 10)),
      },
      data: { orders: result.rows },
    });
  } catch (err) {
    return next(err);
  }
});

// =============================================================================
// PATCH /api/orders/:orderId/status
// Admin: update an order's status (e.g., verified → dispatched, dispatched → rto).
// =============================================================================
router.patch('/:orderId/status', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ['verified', 'dispatched', 'delivered', 'rto'];
    if (!validStatuses.includes(status)) {
      return next(
        new AppError(
          `Invalid status. Admin can set: ${validStatuses.join(', ')}`,
          400
        )
      );
    }

    // Fetch the current order to validate the transition.
    const current = await pool.query(
      'SELECT id, status FROM orders WHERE id = $1',
      [orderId]
    );
    if (current.rows.length === 0) {
      return next(new AppError('Order not found.', 404));
    }

    const currentStatus = current.rows[0].status;

    // Enforce valid status transitions. An order cannot go backward.
    const allowedTransitions = {
      pending_otp: [],           // Only the OTP endpoint can move from pending_otp
      verified:    ['dispatched', 'rto'],
      dispatched:  ['delivered', 'rto'],
      delivered:   [],           // Terminal state
      rto:         [],           // Terminal state
    };

    if (!allowedTransitions[currentStatus].includes(status)) {
      return next(
        new AppError(
          `Invalid transition: "${currentStatus}" → "${status}". ` +
          `Allowed from "${currentStatus}": [${allowedTransitions[currentStatus].join(', ') || 'none'}]`,
          400
        )
      );
    }

    const result = await pool.query(
      `UPDATE orders SET status = $1 WHERE id = $2
       RETURNING id, status, updated_at`,
      [status, orderId]
    );

    return res.status(200).json({
      status: 'success',
      message: `Order status updated to "${status}".`,
      data: { order: result.rows[0] },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
