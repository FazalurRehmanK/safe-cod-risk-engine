-- =============================================================================
-- Migration 001: Add password_hash column to users table
-- =============================================================================
-- Safe to re-run: IF NOT EXISTS guard prevents duplicate column errors.
-- Run this against the production database BEFORE deploying the updated backend.
--
-- After running this migration, set passwords for existing users:
--   node backend/scripts/set-password.js <phoneNumber> <password>
-- =============================================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_hash VARCHAR(100);
