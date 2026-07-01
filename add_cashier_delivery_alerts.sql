-- Cashier delivery/hand-off alerts.
-- Use this to warn cashiers before moving an order from ready/sent to sent/delivered
-- when the order contains specific products or categories.

CREATE TABLE IF NOT EXISTS public.cashier_delivery_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('product', 'category')),
  target_id UUID NOT NULL,
  message TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cashier_delivery_alerts_tenant_id
  ON public.cashier_delivery_alerts(tenant_id);

CREATE INDEX IF NOT EXISTS idx_cashier_delivery_alerts_branch_id
  ON public.cashier_delivery_alerts(branch_id);

CREATE INDEX IF NOT EXISTS idx_cashier_delivery_alerts_target
  ON public.cashier_delivery_alerts(target_type, target_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cashier_delivery_alerts_unique_scope
  ON public.cashier_delivery_alerts(
    tenant_id,
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    target_type,
    target_id
  );

CREATE OR REPLACE FUNCTION public.touch_cashier_delivery_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cashier_delivery_alerts_updated_at
  ON public.cashier_delivery_alerts;

CREATE TRIGGER trg_cashier_delivery_alerts_updated_at
BEFORE UPDATE ON public.cashier_delivery_alerts
FOR EACH ROW
EXECUTE FUNCTION public.touch_cashier_delivery_alerts_updated_at();

ALTER TABLE public.cashier_delivery_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cashier_delivery_alerts_authenticated_select
  ON public.cashier_delivery_alerts;

CREATE POLICY cashier_delivery_alerts_authenticated_select
ON public.cashier_delivery_alerts
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS cashier_delivery_alerts_authenticated_write
  ON public.cashier_delivery_alerts;

CREATE POLICY cashier_delivery_alerts_authenticated_write
ON public.cashier_delivery_alerts
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
