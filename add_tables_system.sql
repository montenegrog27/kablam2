-- Tables management
CREATE TABLE IF NOT EXISTS tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  number INT NOT NULL,
  capacity INT DEFAULT 4,
  shape TEXT DEFAULT 'rect', -- 'rect' | 'round'
  pos_x DECIMAL(10,2) DEFAULT 0,
  pos_y DECIMAL(10,2) DEFAULT 0,
  width DECIMAL(10,2) DEFAULT 60,
  height DECIMAL(10,2) DEFAULT 40,
  rotation DECIMAL(5,2) DEFAULT 0,
  color TEXT DEFAULT '#ffffff',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(branch_id, number)
);

-- Floor objects (walls, trees, counters, etc.)
CREATE TABLE IF NOT EXISTS floor_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'wall' | 'tree' | 'counter' | 'column' | 'decoration'
  label TEXT,
  pos_x DECIMAL(10,2) DEFAULT 0,
  pos_y DECIMAL(10,2) DEFAULT 0,
  width DECIMAL(10,2) DEFAULT 40,
  height DECIMAL(10,2) DEFAULT 10,
  rotation DECIMAL(5,2) DEFAULT 0,
  color TEXT DEFAULT '#4B5563',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table sessions (orders on tables)
CREATE TABLE IF NOT EXISTS table_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID REFERENCES tables(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'open', -- 'open' | 'paying' | 'closed'
  customer_count INT DEFAULT 1,
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ,
  total DECIMAL(12,2) DEFAULT 0
);

ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tables_select" ON tables FOR SELECT USING (
  branch_id IN (SELECT id FROM branches WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()))
);
CREATE POLICY "tables_insert" ON tables FOR INSERT WITH CHECK (
  branch_id IN (SELECT id FROM branches WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()))
);
CREATE POLICY "tables_update" ON tables FOR UPDATE USING (
  branch_id IN (SELECT id FROM branches WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()))
);
CREATE POLICY "tables_delete" ON tables FOR DELETE USING (
  branch_id IN (SELECT id FROM branches WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()))
);

CREATE POLICY "ts_select" ON table_sessions FOR SELECT USING (
  table_id IN (SELECT id FROM tables WHERE branch_id IN (SELECT id FROM branches WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())))
);
CREATE POLICY "ts_insert" ON table_sessions FOR INSERT WITH CHECK (
  table_id IN (SELECT id FROM tables WHERE branch_id IN (SELECT id FROM branches WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())))
);
CREATE POLICY "ts_update" ON table_sessions FOR UPDATE USING (
  table_id IN (SELECT id FROM tables WHERE branch_id IN (SELECT id FROM branches WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())))
);
CREATE POLICY "ts_delete" ON table_sessions FOR DELETE USING (
  table_id IN (SELECT id FROM tables WHERE branch_id IN (SELECT id FROM branches WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())))
);

ALTER TABLE floor_objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fo_select" ON floor_objects FOR SELECT USING (
  branch_id IN (SELECT id FROM branches WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()))
);
CREATE POLICY "fo_insert" ON floor_objects FOR INSERT WITH CHECK (
  branch_id IN (SELECT id FROM branches WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()))
);
CREATE POLICY "fo_update" ON floor_objects FOR UPDATE USING (
  branch_id IN (SELECT id FROM branches WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()))
);
CREATE POLICY "fo_delete" ON floor_objects FOR DELETE USING (
  branch_id IN (SELECT id FROM branches WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()))
);
