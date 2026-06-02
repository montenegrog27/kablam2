CREATE TABLE IF NOT EXISTS anniversary_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  invitation_code TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  dni TEXT,
  whatsapp TEXT NOT NULL,
  benefit_tier TEXT NOT NULL DEFAULT 'general',
  lot_key TEXT,
  lot_name TEXT,
  base_price NUMERIC NOT NULL DEFAULT 0,
  discount_percent NUMERIC NOT NULL DEFAULT 0,
  price NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'issued',
  last_whatsapp_sent_at TIMESTAMPTZ,
  last_whatsapp_message TEXT,
  checked_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS anniversary_invitations_tenant_idx
ON anniversary_invitations(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS anniversary_invitations_whatsapp_idx
ON anniversary_invitations(tenant_id, whatsapp);

CREATE TABLE IF NOT EXISTS anniversary_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  lot_key TEXT NOT NULL,
  name TEXT NOT NULL,
  base_price NUMERIC NOT NULL DEFAULT 0,
  capacity INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, branch_id, lot_key)
);

CREATE INDEX IF NOT EXISTS anniversary_lots_tenant_idx
ON anniversary_lots(tenant_id, branch_id, position);

CREATE TABLE IF NOT EXISTS anniversary_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  event_date TEXT NOT NULL DEFAULT '6 de junio',
  event_time TEXT NOT NULL DEFAULT '20hs',
  event_location TEXT NOT NULL DEFAULT 'Terraza Vera - San Juan 635',
  payment_alias TEXT NOT NULL DEFAULT 'mordisco.arg',
  payment_deadline_minutes INTEGER NOT NULL DEFAULT 60,
  general_min_orders INTEGER NOT NULL DEFAULT 0,
  community_min_orders INTEGER NOT NULL DEFAULT 4,
  founder_min_orders INTEGER NOT NULL DEFAULT 0,
  founder_top_percent INTEGER NOT NULL DEFAULT 10,
  general_discount NUMERIC NOT NULL DEFAULT 0,
  community_discount NUMERIC NOT NULL DEFAULT 25,
  founder_discount NUMERIC NOT NULL DEFAULT 50,
  tier_messages JSONB NOT NULL DEFAULT '{}'::jsonb,
  tier_perks JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS anniversary_settings_tenant_idx
ON anniversary_settings(tenant_id, branch_id, updated_at DESC);

ALTER TABLE anniversary_settings
  ADD COLUMN IF NOT EXISTS tier_perks JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE anniversary_invitations
  ALTER COLUMN dni DROP NOT NULL;

ALTER TABLE anniversary_invitations
  ADD COLUMN IF NOT EXISTS lot_key TEXT,
  ADD COLUMN IF NOT EXISTS lot_name TEXT,
  ADD COLUMN IF NOT EXISTS base_price NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS birthdate DATE,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS companion_name TEXT,
  ADD COLUMN IF NOT EXISTS companion_dni TEXT,
  ADD COLUMN IF NOT EXISTS last_whatsapp_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_whatsapp_message TEXT;
