// =============================================================================
// src/routes/addresses.js
// Karachi Address Hierarchy Endpoints
// =============================================================================
// These endpoints power the cascading dropdown menus on the checkout form:
//   1. Fetch all districts
//   2. Fetch towns for a selected district
//   3. Fetch block/sectors for a selected town
// =============================================================================

const express = require('express');
const pool = require('../config/db');
const AppError = require('../utils/AppError');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/addresses/districts
// Returns all Karachi districts (Level 1).
// ---------------------------------------------------------------------------
router.get('/districts', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name FROM districts ORDER BY name ASC`
    );
    return res.status(200).json({
      status: 'success',
      data: { districts: result.rows },
    });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/addresses/districts/:districtId/towns
// Returns towns within a specific district (Level 2).
// ---------------------------------------------------------------------------
router.get('/districts/:districtId/towns', async (req, res, next) => {
  try {
    const { districtId } = req.params;

    // Verify the parent district exists first.
    const districtCheck = await pool.query(
      'SELECT id FROM districts WHERE id = $1',
      [districtId]
    );
    if (districtCheck.rows.length === 0) {
      return next(new AppError('District not found.', 404));
    }

    const result = await pool.query(
      `SELECT id, name FROM towns WHERE district_id = $1 ORDER BY name ASC`,
      [districtId]
    );

    return res.status(200).json({
      status: 'success',
      data: { towns: result.rows },
    });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/addresses/towns/:townId/block-sectors
// Returns block/sectors within a specific town (Level 3).
// ---------------------------------------------------------------------------
router.get('/towns/:townId/block-sectors', async (req, res, next) => {
  try {
    const { townId } = req.params;

    const townCheck = await pool.query(
      'SELECT id FROM towns WHERE id = $1',
      [townId]
    );
    if (townCheck.rows.length === 0) {
      return next(new AppError('Town not found.', 404));
    }

    const result = await pool.query(
      `SELECT id, name FROM block_sectors WHERE town_id = $1 ORDER BY name ASC`,
      [townId]
    );

    return res.status(200).json({
      status: 'success',
      data: { blockSectors: result.rows },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
