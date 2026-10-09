// =============================================================================
// src/utils/AppError.js
// Custom Error Class
// =============================================================================
// Extending the native Error class lets us attach an HTTP status code to any
// error we throw. The centralized errorHandler middleware catches these and
// sends consistent JSON responses without try/catch boilerplate in every route.
// =============================================================================

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    // 'fail' for 4xx (client errors), 'error' for 5xx (server errors).
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    // Mark as an operational error (safe to expose to client).
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
