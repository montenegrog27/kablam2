-- ============================
-- 1. TABLES WITHOUT FK DEPS
-- ============================

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  cuit TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6B7280',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================
-- 2. TABLES WITH FK DEPS
-- ============================

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID REFERENCES branches(id),
  category_id UUID REFERENCES expense_categories(id),
  supplier_id UUID REFERENCES suppliers(id),
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) NOT NULL,
  reference TEXT,
  expense_date DATE NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID REFERENCES branches(id),
  supplier_id UUID REFERENCES suppliers(id),
  category_id UUID REFERENCES purchase_categories(id),
  invoice_number TEXT,
  description TEXT,
  subtotal DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  purchase_date DATE NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID REFERENCES purchases(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredients(id),
  quantity DECIMAL(12,2) NOT NULL,
  unit_cost DECIMAL(12,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================
-- 3. STOCK COLUMNS
-- ============================

ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS stock DECIMAL(12,2) DEFAULT 0;

-- ============================
-- 4. RLS
-- ============================

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;

-- ============================
-- 5. RLS POLICIES
-- ============================

CREATE POLICY "tenant_select_suppliers" ON suppliers FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert_suppliers" ON suppliers FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update_suppliers" ON suppliers FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_delete_suppliers" ON suppliers FOR DELETE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "tenant_select_expcats" ON expense_categories FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert_expcats" ON expense_categories FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update_expcats" ON expense_categories FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_delete_expcats" ON expense_categories FOR DELETE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "tenant_select_purcats" ON purchase_categories FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert_purcats" ON purchase_categories FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update_purcats" ON purchase_categories FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_delete_purcats" ON purchase_categories FOR DELETE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "tenant_select_expenses" ON expenses FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert_expenses" ON expenses FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update_expenses" ON expenses FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_delete_expenses" ON expenses FOR DELETE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "tenant_select_purchases" ON purchases FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_insert_purchases" ON purchases FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_update_purchases" ON purchases FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "tenant_delete_purchases" ON purchases FOR DELETE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "tenant_select_puritems" ON purchase_items FOR SELECT USING (purchase_id IN (SELECT id FROM purchases WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())));
CREATE POLICY "tenant_insert_puritems" ON purchase_items FOR INSERT WITH CHECK (purchase_id IN (SELECT id FROM purchases WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())));
CREATE POLICY "tenant_update_puritems" ON purchase_items FOR UPDATE USING (purchase_id IN (SELECT id FROM purchases WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())));
CREATE POLICY "tenant_delete_puritems" ON purchase_items FOR DELETE USING (purchase_id IN (SELECT id FROM purchases WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())));
