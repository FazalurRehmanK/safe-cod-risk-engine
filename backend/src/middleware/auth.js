// =============================================================================
// src/middleware/auth.js
// JWT Authentication & Role-Based Authorization Middleware
// =============================================================================

const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const pool = require('../config/db');

/**
 * protect — Verifies the JWT token from the Authorization header.
 * Attaches the decoded user payload to req.user for downstream use.
 * Usage: router.get('/route', protect, handler)
 */
const protect = async (req, res, next) => {
  try {
    // 1. Extract token from "Authorization: Bearer <token>" header.
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('You are not logged in. Please log in to continue.', 401));
    }

    const token = authHeader.split(' ')[1];

    // 2. Verify the token's signature and expiry.
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return next(new AppError('Your session has expired. Please log in again.', 401));
      }
      return next(new AppError('Invalid token. Please log in again.', 401));
    }

    // 3. Check the user still exists and is active in the DB.
    //    This handles the edge case where a token is valid but the user
    //    was deactivated (e.g., banned for high RTO abuse) after login.
    const result = await pool.query(
      'SELECT id, full_name, phone_number, role, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return next(new AppError('The user associated with this token no longer exists.', 401));
    }

    const user = result.rows[0];
    if (!user.is_active) {
      return next(new AppError('Your account has been deactivated. Please contact support.', 403));
    }

    // 4. Attach the fresh user data to the request object.
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
};

/**
 * restrictTo — Role-based authorization guard.
 * Must be used AFTER protect.
 * Usage: router.get('/admin/route', protect, restrictTo('admin'), handler)
 * @param {...string} roles - Allowed roles (e.g., 'admin', 'customer')
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action.', 403)
      );
    }
    return next();
  };
};

module.exports = { protect, restrictTo };
