CREATE TABLE IF NOT EXISTS event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_slug TEXT NOT NULL,
  event_slug TEXT NOT NULL DEFAULT 'cumple-mordisco',
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  companions INT DEFAULT 0,
  status TEXT DEFAULT 'confirmed',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "er_insert" ON event_registrations FOR INSERT WITH CHECK (true);
CREATE POLICY "er_select" ON event_registrations FOR SELECT USING (true);
