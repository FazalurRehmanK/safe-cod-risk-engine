// =============================================================================
// src/middleware/errorHandler.js
// Centralized Error Handling Middleware
// =============================================================================
// Express requires error-handling middleware to have exactly 4 parameters.
// This single handler catches ALL errors thrown anywhere in the app via
// next(err) or throw (with express-async-errors or manual catches).
// =============================================================================

/**
 * Handles PostgreSQL-specific errors and maps them to clean HTTP responses.
 * @param {Error} err - The PostgreSQL error object
 * @param {import('express').Response} res - Express response object
 */
const handleDbError = (err, res) => {
  // 23505: Unique constraint violation (e.g., duplicate phone number)
  if (err.code === '23505') {
    return res.status(409).json({
      status: 'fail',
      message: `A record with this value already exists. Detail: ${err.detail}`,
    });
  }
  // 23514: CHECK constraint violation (e.g., stock_quantity < 0)
  if (err.code === '23514') {
    return res.status(409).json({
      status: 'fail',
      message: 'Operation failed due to a data constraint. Insufficient stock.',
    });
  }
  // 23503: Foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({
      status: 'fail',
      message: `Referenced record not found. Detail: ${err.detail}`,
    });
  }
  // 22P02: Invalid UUID format sent by client
  if (err.code === '22P02') {
    return res.status(400).json({
      status: 'fail',
      message: 'Invalid ID format provided.',
    });
  }

  return null; // Signal: not a handled PG error
};

/**
 * Express error-handling middleware (must have 4 params).
 */
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  // Attempt to handle known PostgreSQL errors first.
  const pgHandled = handleDbError(err, res);
  if (pgHandled !== null) return pgHandled;

  // Handle our own operational AppErrors.
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  }

  // Unknown / programming error: log it but don't leak internals to client.
  console.error('💥 UNHANDLED ERROR:', err);
  return res.status(500).json({
    status: 'error',
    message: 'An unexpected internal server error occurred.',
  });
};

module.exports = errorHandler;
