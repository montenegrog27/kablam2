INSERT INTO customer_login_logs (
  customer_id,
  branch_id,
  login_method,
  ip_address,
  user_agent,
  created_at
)
SELECT DISTINCT ON (lc.customer_id, lc.used_at)
  lc.customer_id,
  b.id AS branch_id,
  'whatsapp' AS login_method,
  'backfill_login_code' AS ip_address,
  'backfill_login_code' AS user_agent,
  lc.used_at AS created_at
FROM login_codes lc
JOIN branches b ON b.slug = lc.branch_slug
WHERE lc.used_at IS NOT NULL
  AND lc.customer_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM customer_login_logs cl
    WHERE cl.customer_id = lc.customer_id
      AND cl.created_at = lc.used_at
  )
ORDER BY lc.customer_id, lc.used_at DESC;

