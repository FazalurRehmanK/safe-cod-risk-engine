// =============================================================================
// src/routes/products.js
// Public Product Catalog Endpoints
// =============================================================================

const express = require('express');
const pool = require('../config/db');
const AppError = require('../utils/AppError');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/products
// Returns all active products for the storefront.
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, price, stock_quantity, image_url
       FROM products
       WHERE is_active = true
       ORDER BY name ASC`
    );

    return res.status(200).json({
      status: 'success',
      results: result.rows.length,
      data: { products: result.rows },
    });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/products/:id
// Returns a single product by ID.
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, name, description, price, stock_quantity, image_url
       FROM products
       WHERE id = $1 AND is_active = true`,
      [id]
    );

    if (result.rows.length === 0) {
      return next(new AppError('Product not found.', 404));
    }

    return res.status(200).json({
      status: 'success',
      data: { product: result.rows[0] },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
