// =============================================================================
// scripts/set-password.js
// CLI utility: set or reset the password for a user identified by phone number.
//
// Usage:
//   node scripts/set-password.js <phoneNumber> <newPassword>
//
// Example:
//   node scripts/set-password.js +923001234567 "mySecurePassword123"
//
// The script loads DATABASE_URL and other env vars from backend/.env.
// Run it from the repo root or the backend/ directory.
// NEVER hard-code a password in this file or commit one to the repo.
// =============================================================================

'use strict';

const path = require('path');

// Load .env from the backend directory (works whether called from repo root
// or from inside backend/).
require('dotenv').config({
  path: path.resolve(__dirname, '../.env'),
});

const bcrypt  = require('bcryptjs');
const { Pool } = require('pg');

// ---------------------------------------------------------------------------
// Argument validation
// ---------------------------------------------------------------------------
const [, , phoneNumber, plainPassword] = process.argv;

if (!phoneNumber || !plainPassword) {
  console.error('Usage: node scripts/set-password.js <phoneNumber> <newPassword>');
  process.exit(1);
}

if (plainPassword.length < 6) {
  console.error('Error: Password must be at least 6 characters long.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Database connection
// ---------------------------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Disable SSL for localhost; enable for remote (e.g. Render, Supabase).
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1')
    ? { rejectUnauthorized: false }
    : false,
});

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
(async () => {
  try {
    console.log(`Hashing password for ${phoneNumber}…`);

    // bcrypt cost factor 12: ~300 ms on modern hardware — appropriate for
    // a one-off admin script where latency is irrelevant.
    const passwordHash = await bcrypt.hash(plainPassword, 12);

    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE phone_number = $2',
      [passwordHash, phoneNumber]
    );

    if (result.rowCount === 0) {
      console.warn(`Warning: No user found with phone number "${phoneNumber}". No rows updated.`);
    } else {
      console.log(`✓ Password updated for ${phoneNumber}. Rows affected: ${result.rowCount}`);
    }
  } catch (err) {
    console.error('Error updating password:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
