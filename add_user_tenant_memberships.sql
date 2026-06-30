-- Multi-tenant access for admin users.
-- Keep public.users.tenant_id as the active tenant used by the current app.
-- This table stores every tenant a user can operate.

CREATE TABLE IF NOT EXISTS public.user_tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_tenant_memberships_role_check
    CHECK (role IN ('owner', 'manager', 'admin', 'cashier')),
  CONSTRAINT user_tenant_memberships_unique_user_tenant
    UNIQUE (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_user_tenant_memberships_user_id
  ON public.user_tenant_memberships(user_id);

CREATE INDEX IF NOT EXISTS idx_user_tenant_memberships_tenant_id
  ON public.user_tenant_memberships(tenant_id);

CREATE INDEX IF NOT EXISTS idx_user_tenant_memberships_active
  ON public.user_tenant_memberships(user_id, is_active);

CREATE OR REPLACE FUNCTION public.touch_user_tenant_memberships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_tenant_memberships_updated_at
  ON public.user_tenant_memberships;

CREATE TRIGGER trg_user_tenant_memberships_updated_at
BEFORE UPDATE ON public.user_tenant_memberships
FOR EACH ROW
EXECUTE FUNCTION public.touch_user_tenant_memberships_updated_at();

-- Backfill current one-tenant users as their active membership.
INSERT INTO public.user_tenant_memberships (
  user_id,
  tenant_id,
  branch_id,
  role,
  is_active
)
SELECT
  id,
  tenant_id,
  branch_id,
  role,
  true
FROM public.users
WHERE tenant_id IS NOT NULL
ON CONFLICT (user_id, tenant_id) DO UPDATE
SET
  branch_id = EXCLUDED.branch_id,
  role = EXCLUDED.role,
  is_active = true,
  updated_at = NOW();

-- Only one active tenant per user.
CREATE OR REPLACE FUNCTION public.ensure_single_active_user_tenant_membership()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active THEN
    UPDATE public.user_tenant_memberships
    SET is_active = false
    WHERE user_id = NEW.user_id
      AND id <> NEW.id
      AND is_active = true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_single_active_user_tenant_membership
  ON public.user_tenant_memberships;

CREATE TRIGGER trg_single_active_user_tenant_membership
AFTER INSERT OR UPDATE OF is_active ON public.user_tenant_memberships
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_active_user_tenant_membership();

ALTER TABLE public.user_tenant_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_tenant_memberships_authenticated_select
  ON public.user_tenant_memberships;

CREATE POLICY user_tenant_memberships_authenticated_select
ON public.user_tenant_memberships
FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS user_tenant_memberships_service_all
  ON public.user_tenant_memberships;

CREATE POLICY user_tenant_memberships_service_all
ON public.user_tenant_memberships
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
