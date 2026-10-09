// =============================================================================
// src/utils/hashOtp.js
// OTP Hashing Utility
// =============================================================================
// OTPs must NEVER be stored in plain text. We SHA-256 hash them before
// writing to the DB, the same way passwords are hashed.
//
// We use Node's built-in 'crypto' module — no third-party dependency needed.
// SHA-256 is sufficient here (OTPs are short-lived; bcrypt is overkill).
// =============================================================================

const crypto = require('crypto');

/**
 * Produces a SHA-256 hex digest of the given OTP string.
 * @param {string} otp - The plain-text OTP (e.g. "1234")
 * @returns {string} - 64-character hex string
 */
const hashOtp = (otp) => {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
};

module.exports = hashOtp;
