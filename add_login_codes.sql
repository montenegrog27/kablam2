CREATE TABLE IF NOT EXISTS login_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  customer_id UUID,
  branch_slug TEXT NOT NULL,
  return_to TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE login_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lc_insert" ON login_codes FOR INSERT WITH CHECK (true);
CREATE POLICY "lc_select" ON login_codes FOR SELECT USING (true);
