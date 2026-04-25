CREATE TABLE IF NOT EXISTS combos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id       UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES categories(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  price           NUMERIC(10,2) NOT NULL DEFAULT 0,
  image_url       TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS combo_products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id        UUID NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity        INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(combo_id, product_id)
);

CREATE INDEX IF NOT EXISTS combos_tenant_id_idx ON combos(tenant_id);
CREATE INDEX IF NOT EXISTS combos_branch_id_idx ON combos(branch_id);
CREATE INDEX IF NOT EXISTS combos_is_active_idx ON combos(is_active);
CREATE INDEX IF NOT EXISTS combo_products_combo_id_idx ON combo_products(combo_id);

ALTER TABLE combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage combos"
ON combos FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role IN ('admin', 'owner')
    AND u.tenant_id = combos.tenant_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role IN ('admin', 'owner')
    AND u.tenant_id = combos.tenant_id
  )
);

CREATE POLICY "Public can view active combos"
ON combos FOR SELECT TO public
USING (is_active = true);

CREATE POLICY "Admins can manage combo_products"
ON combo_products FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM combos c
    JOIN users u ON u.tenant_id = c.tenant_id
    WHERE c.id = combo_products.combo_id
    AND u.id = auth.uid()
    AND u.role IN ('admin', 'owner')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM combos c
    JOIN users u ON u.tenant_id = c.tenant_id
    WHERE c.id = combo_products.combo_id
    AND u.id = auth.uid()
    AND u.role IN ('admin', 'owner')
  )
);
