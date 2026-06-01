CREATE TABLE IF NOT EXISTS sales_period_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('month', 'year')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_orders INTEGER NOT NULL DEFAULT 0,
  gross_revenue NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  shipping_revenue NUMERIC NOT NULL DEFAULT 0,
  discount_total NUMERIC NOT NULL DEFAULT 0,
  paid_revenue NUMERIC NOT NULL DEFAULT 0,
  delivery_orders INTEGER NOT NULL DEFAULT 0,
  takeaway_orders INTEGER NOT NULL DEFAULT 0,
  pedidosya_orders INTEGER NOT NULL DEFAULT 0,
  cancelled_orders INTEGER NOT NULL DEFAULT 0,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, branch_id, period_type, period_start)
);

CREATE INDEX IF NOT EXISTS sales_period_snapshots_tenant_period_idx
ON sales_period_snapshots(tenant_id, period_type, period_start DESC);

CREATE OR REPLACE FUNCTION refresh_sales_period_snapshot(
  p_tenant_id UUID,
  p_period_type TEXT,
  p_period_start DATE,
  p_branch_id UUID DEFAULT NULL
)
RETURNS sales_period_snapshots
LANGUAGE plpgsql
AS $$
DECLARE
  v_start DATE;
  v_end DATE;
  v_snapshot sales_period_snapshots;
BEGIN
  IF p_period_type NOT IN ('month', 'year') THEN
    RAISE EXCEPTION 'Invalid period_type: %', p_period_type;
  END IF;

  IF p_period_type = 'month' THEN
    v_start := date_trunc('month', p_period_start)::date;
    v_end := (v_start + INTERVAL '1 month - 1 day')::date;
  ELSE
    v_start := date_trunc('year', p_period_start)::date;
    v_end := (v_start + INTERVAL '1 year - 1 day')::date;
  END IF;

  INSERT INTO sales_period_snapshots (
    tenant_id,
    branch_id,
    period_type,
    period_start,
    period_end,
    total_orders,
    gross_revenue,
    subtotal,
    shipping_revenue,
    discount_total,
    paid_revenue,
    delivery_orders,
    takeaway_orders,
    pedidosya_orders,
    cancelled_orders,
    metrics,
    generated_at,
    updated_at
  )
  SELECT
    p_tenant_id,
    p_branch_id,
    p_period_type,
    v_start,
    v_end,
    COUNT(*)::integer,
    COALESCE(SUM(total), 0),
    COALESCE(SUM(COALESCE(subtotal, total)), 0),
    COALESCE(SUM(COALESCE(shipping_cost, 0)), 0),
    COALESCE(SUM(COALESCE(discount, 0)), 0),
    COALESCE(SUM(CASE WHEN is_paid THEN total ELSE 0 END), 0),
    COUNT(*) FILTER (WHERE type = 'delivery')::integer,
    COUNT(*) FILTER (WHERE type = 'takeaway')::integer,
    COUNT(*) FILTER (WHERE type = 'pedidosya')::integer,
    COUNT(*) FILTER (WHERE status = 'cancelled')::integer,
    jsonb_build_object(
      'by_status',
      COALESCE((
        SELECT jsonb_object_agg(status_key, order_count)
        FROM (
          SELECT COALESCE(status, 'unknown') AS status_key, COUNT(*) AS order_count
          FROM orders
          WHERE tenant_id = p_tenant_id
            AND (p_branch_id IS NULL OR branch_id = p_branch_id)
            AND created_at >= v_start::timestamptz
            AND created_at < (v_end + 1)::timestamptz
          GROUP BY COALESCE(status, 'unknown')
        ) status_rows
      ), '{}'::jsonb),
      'by_type',
      COALESCE((
        SELECT jsonb_object_agg(type_key, order_count)
        FROM (
          SELECT COALESCE(type, 'unknown') AS type_key, COUNT(*) AS order_count
          FROM orders
          WHERE tenant_id = p_tenant_id
            AND (p_branch_id IS NULL OR branch_id = p_branch_id)
            AND created_at >= v_start::timestamptz
            AND created_at < (v_end + 1)::timestamptz
          GROUP BY COALESCE(type, 'unknown')
        ) type_rows
      ), '{}'::jsonb)
    ),
    NOW(),
    NOW()
  FROM orders
  WHERE tenant_id = p_tenant_id
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND created_at >= v_start::timestamptz
    AND created_at < (v_end + 1)::timestamptz
  ON CONFLICT (tenant_id, branch_id, period_type, period_start)
  DO UPDATE SET
    period_end = EXCLUDED.period_end,
    total_orders = EXCLUDED.total_orders,
    gross_revenue = EXCLUDED.gross_revenue,
    subtotal = EXCLUDED.subtotal,
    shipping_revenue = EXCLUDED.shipping_revenue,
    discount_total = EXCLUDED.discount_total,
    paid_revenue = EXCLUDED.paid_revenue,
    delivery_orders = EXCLUDED.delivery_orders,
    takeaway_orders = EXCLUDED.takeaway_orders,
    pedidosya_orders = EXCLUDED.pedidosya_orders,
    cancelled_orders = EXCLUDED.cancelled_orders,
    metrics = EXCLUDED.metrics,
    generated_at = NOW(),
    updated_at = NOW()
  RETURNING * INTO v_snapshot;

  RETURN v_snapshot;
END;
$$;
