CREATE TABLE IF NOT EXISTS packaging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  cost_per_unit DECIMAL(12,4) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_packaging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  packaging_id UUID REFERENCES packaging(id) ON DELETE CASCADE,
  quantity DECIMAL(12,2) DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE packaging ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_packaging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pkg_select" ON packaging FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "pkg_insert" ON packaging FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "pkg_update" ON packaging FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "pkg_delete" ON packaging FOR DELETE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "pp_select" ON product_packaging FOR SELECT USING (variant_id IN (SELECT id FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()))));
CREATE POLICY "pp_insert" ON product_packaging FOR INSERT WITH CHECK (variant_id IN (SELECT id FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()))));
CREATE POLICY "pp_delete" ON product_packaging FOR DELETE USING (variant_id IN (SELECT id FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()))));
