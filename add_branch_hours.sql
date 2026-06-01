-- New columns for branch_settings
ALTER TABLE branch_settings ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN DEFAULT true;
ALTER TABLE branch_settings ADD COLUMN IF NOT EXISTS takeaway_enabled BOOLEAN DEFAULT true;
ALTER TABLE branch_settings ADD COLUMN IF NOT EXISTS web_closed_reason TEXT;
ALTER TABLE branch_settings ADD COLUMN IF NOT EXISTS web_closed_until TIMESTAMPTZ;

-- Branch hours table (day-by-day schedule)
CREATE TABLE IF NOT EXISTS branch_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  is_closed BOOLEAN DEFAULT false,
  UNIQUE(branch_id, day_of_week)
);

ALTER TABLE branch_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bh_select" ON branch_hours FOR SELECT USING (
  branch_id IN (SELECT id FROM branches WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()))
);
CREATE POLICY "bh_insert" ON branch_hours FOR INSERT WITH CHECK (
  branch_id IN (SELECT id FROM branches WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()))
);
CREATE POLICY "bh_update" ON branch_hours FOR UPDATE USING (
  branch_id IN (SELECT id FROM branches WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()))
);
CREATE POLICY "bh_delete" ON branch_hours FOR DELETE USING (
  branch_id IN (SELECT id FROM branches WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()))
);
