CREATE TABLE IF NOT EXISTS anniversary_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  invitation_code TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  dni TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  benefit_tier TEXT NOT NULL DEFAULT 'general',
  price NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'issued',
  checked_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS anniversary_invitations_tenant_idx
ON anniversary_invitations(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS anniversary_invitations_whatsapp_idx
ON anniversary_invitations(tenant_id, whatsapp);
