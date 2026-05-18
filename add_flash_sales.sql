CREATE TABLE IF NOT EXISTS flash_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID,
  discount_percentage INT NOT NULL,
  display_type TEXT DEFAULT 'percentage', -- 'percentage' | 'label'
  display_label TEXT DEFAULT 'SALE',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS flash_sale_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flash_sale_id UUID REFERENCES flash_sales(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE
);

ALTER TABLE flash_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE flash_sale_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flash_sales_select" ON flash_sales FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
);
CREATE POLICY "flash_sales_insert" ON flash_sales FOR INSERT WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
);
CREATE POLICY "flash_sales_update" ON flash_sales FOR UPDATE USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
);
CREATE POLICY "flash_sales_delete" ON flash_sales FOR DELETE USING (
  tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
);

CREATE POLICY "flash_sale_categories_select" ON flash_sale_categories FOR SELECT USING (
  flash_sale_id IN (SELECT id FROM flash_sales WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);
CREATE POLICY "flash_sale_categories_insert" ON flash_sale_categories FOR INSERT WITH CHECK (
  flash_sale_id IN (SELECT id FROM flash_sales WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);
CREATE POLICY "flash_sale_categories_delete" ON flash_sale_categories FOR DELETE USING (
  flash_sale_id IN (SELECT id FROM flash_sales WHERE tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
);
