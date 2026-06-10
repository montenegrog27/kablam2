CREATE TABLE IF NOT EXISTS delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3B82F6',
  coordinates JSONB NOT NULL DEFAULT '[]', -- [[lat,lng],[lat,lng],...]
  min_amount DECIMAL(12,2) DEFAULT 0,
  delivery_fee DECIMAL(12,2) DEFAULT 0,
  estimated_minutes INT DEFAULT 30,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dz_select" ON delivery_zones FOR SELECT USING (
  branch_id IN (SELECT id FROM branches WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()))
);
CREATE POLICY "dz_insert" ON delivery_zones FOR INSERT WITH CHECK (
  branch_id IN (SELECT id FROM branches WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()))
);
CREATE POLICY "dz_update" ON delivery_zones FOR UPDATE USING (
  branch_id IN (SELECT id FROM branches WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()))
);
CREATE POLICY "dz_delete" ON delivery_zones FOR DELETE USING (
  branch_id IN (SELECT id FROM branches WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()))
);

-- Add delivery_zone_id to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_zone_id UUID REFERENCES delivery_zones(id) ON DELETE SET NULL;
