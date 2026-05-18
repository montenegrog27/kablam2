CREATE TABLE IF NOT EXISTS kds_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID,
  name TEXT NOT NULL,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE,
  icon TEXT DEFAULT '🍔',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE kds_config ENABLE ROW LEVEL SECURITY;

-- Allow select for authenticated users within same tenant
CREATE POLICY "kds_config_select" ON kds_config
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

-- Allow insert for authenticated users within same tenant
CREATE POLICY "kds_config_insert" ON kds_config
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

-- Allow update for authenticated users within same tenant
CREATE POLICY "kds_config_update" ON kds_config
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

-- Allow delete for authenticated users within same tenant
CREATE POLICY "kds_config_delete" ON kds_config
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );
