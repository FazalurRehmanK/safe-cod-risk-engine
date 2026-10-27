-- =============================================================================
-- Migration 003: Add otp_attempts column to orders table
-- =============================================================================
-- Adds brute-force protection for the OTP verification endpoint.
-- The application logic uses this counter to lock out an order after 5 failed
-- attempts by nullifying otp_hash (making it permanently unverifiable).
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS is idempotent.
-- Run BEFORE deploying the updated backend code.
-- =============================================================================

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS otp_attempts INTEGER NOT NULL DEFAULT 0;
