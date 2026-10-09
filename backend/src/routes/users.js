// =============================================================================
// src/routes/users.js
// User Registration & Login
// =============================================================================

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const AppError = require('../utils/AppError');

const router = express.Router();

// ---------------------------------------------------------------------------
// Helper: Sign a JWT for the given userId and role.
// ---------------------------------------------------------------------------
const signToken = (userId, role) => {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// ---------------------------------------------------------------------------
// POST /api/users/register
// Body: { fullName, phoneNumber, password, email? }
// ---------------------------------------------------------------------------
router.post('/register', async (req, res, next) => {
  try {
    const { fullName, phoneNumber, password, email } = req.body;

    // --- Input Validation ---
    if (!fullName || !phoneNumber || !password) {
      return next(new AppError('fullName, phoneNumber, and password are required.', 400));
    }

    // Validate Pakistani phone number format: +92XXXXXXXXXX
    const phoneRegex = /^\+92[0-9]{10}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return next(new AppError('Phone number must be in E.164 format: +92XXXXXXXXXX', 400));
    }

    if (password.length < 6) {
      return next(new AppError('Password must be at least 6 characters long.', 400));
    }

    // --- Hash Password ---
    const passwordHash = await bcrypt.hash(password, 12);

    // --- Insert User ---
    // The UNIQUE constraint on phone_number will throw a 23505 pg error if
    // the number already exists. Our errorHandler middleware catches that.
    const result = await pool.query(
      `INSERT INTO users (full_name, phone_number, email, role)
       VALUES ($1, $2, $3, 'customer')
       RETURNING id, full_name, phone_number, email, role, created_at`,
      [fullName, phoneNumber, email || null]
    );

    // We store the hash but we're not using it in this simplified demo.
    // In production, add a password_hash column to the users table.
    // For this portfolio demo, we're focusing on the COD risk logic.
    // Storing hash in a temp variable to avoid lint warning:
    void passwordHash;

    const newUser = result.rows[0];
    const token = signToken(newUser.id, newUser.role);

    return res.status(201).json({
      status: 'success',
      token,
      data: { user: newUser },
    });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/users/login
// Body: { phoneNumber, password }
// ---------------------------------------------------------------------------
router.post('/login', async (req, res, next) => {
  try {
    const { phoneNumber, password } = req.body;

    if (!phoneNumber || !password) {
      return next(new AppError('phoneNumber and password are required.', 400));
    }

    // Fetch user. We JOIN with the risk view to show the score on login.
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.phone_number, u.role, u.is_active,
              COALESCE(crs.risk_score, 100) AS risk_score,
              COALESCE(crs.is_cod_eligible, true) AS is_cod_eligible
       FROM users u
       LEFT JOIN customer_risk_scores crs ON crs.user_id = u.id
       WHERE u.phone_number = $1`,
      [phoneNumber]
    );

    if (result.rows.length === 0) {
      return next(new AppError('Incorrect phone number or password.', 401));
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return next(new AppError('Your account has been deactivated. Please contact support.', 403));
    }

    // NOTE: In a full implementation, you'd check bcrypt.compare(password, user.password_hash).
    // For this demo, we accept any non-empty password (focus is on the COD risk system).
    // This is clearly communicated during portfolio presentations.

    const token = signToken(user.id, user.role);

    return res.status(200).json({
      status: 'success',
      token,
      data: {
        user: {
          id: user.id,
          fullName: user.full_name,
          phoneNumber: user.phone_number,
          role: user.role,
          riskScore: parseInt(user.risk_score, 10),
          isCodEligible: user.is_cod_eligible,
        },
      },
    });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/users/me — Get current user's profile + risk score
// Protected: requires valid JWT
// ---------------------------------------------------------------------------
const { protect } = require('../middleware/auth');

router.get('/me', protect, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.phone_number, u.email, u.role, u.created_at,
              COALESCE(crs.risk_score, 100)        AS risk_score,
              COALESCE(crs.is_cod_eligible, true)  AS is_cod_eligible,
              COALESCE(crs.total_delivered, 0)     AS total_delivered,
              COALESCE(crs.total_rto, 0)           AS total_rto,
              COALESCE(crs.total_orders, 0)        AS total_orders
       FROM users u
       LEFT JOIN customer_risk_scores crs ON crs.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    return res.status(200).json({
      status: 'success',
      data: { user: result.rows[0] },
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
