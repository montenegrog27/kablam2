CREATE TABLE IF NOT EXISTS admin_sidebar_hidden (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nav_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, nav_key)
);

ALTER TABLE admin_sidebar_hidden ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant users can read their own hidden items"
  ON admin_sidebar_hidden FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "superadmin can insert"
  ON admin_sidebar_hidden FOR INSERT
  WITH CHECK (true);

CREATE POLICY "superadmin can delete"
  ON admin_sidebar_hidden FOR DELETE
  USING (true);
