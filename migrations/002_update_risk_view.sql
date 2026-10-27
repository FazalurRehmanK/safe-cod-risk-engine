-- =============================================================================
-- Migration 002: Update customer_risk_scores view
-- =============================================================================
-- Change: delivered orders of ANY payment method earn the +10 bonus.
--         Penalties (RTO, pending) still apply to COD orders only.
--
-- This fixes the bug where a customer blocked from COD could never recover
-- their score because prepaid deliveries did not count as positive history.
--
-- The LEFT JOIN previously filtered to AND o.payment_method = 'cod', which
-- meant prepaid delivered orders were invisible to the scoring engine.
--
-- Safe to re-run: DROP VIEW IF EXISTS + CREATE VIEW is idempotent.
-- Run BEFORE deploying the updated backend code.
-- =============================================================================

DROP VIEW IF EXISTS customer_risk_scores;

CREATE VIEW customer_risk_scores AS
WITH counts AS (
  SELECT
    u.id           AS user_id,
    u.phone_number,
    u.full_name,
    -- Delivered bonus: any payment method (COD or prepaid) counts.
    -- A successful delivery proves reliability regardless of how it was paid.
    COUNT(*) FILTER (WHERE o.status = 'delivered')                                AS total_delivered,
    -- RTO and pending penalties: COD only.
    -- Prepaid RTOs are the merchant's financial loss, not a COD trust signal.
    COUNT(*) FILTER (WHERE o.status = 'rto'         AND o.payment_method = 'cod') AS total_rto,
    COUNT(*) FILTER (WHERE o.status = 'pending_otp' AND o.payment_method = 'cod') AS total_pending,
    COUNT(*) FILTER (WHERE o.status IS NOT NULL)                                   AS total_orders
  FROM users u
  LEFT JOIN orders o ON o.user_id = u.id
  WHERE u.role = 'customer'
  GROUP BY u.id, u.phone_number, u.full_name
)
SELECT
  user_id, phone_number, full_name,
  total_delivered, total_rto, total_pending, total_orders,
  LEAST(GREATEST(100 + total_rto * -30 + total_delivered * 10 + total_pending * -5, 0), 100) AS risk_score,
  (LEAST(GREATEST(100 + total_rto * -30 + total_delivered * 10 + total_pending * -5, 0), 100) >= 40) AS is_cod_eligible
FROM counts;
