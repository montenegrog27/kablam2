CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL,
  alias TEXT NOT NULL,
  address TEXT NOT NULL,
  apartment TEXT,
  floor TEXT,
  notes TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ca_select" ON customer_addresses FOR SELECT USING (customer_id IN (SELECT id FROM customers WHERE id = customer_id));
CREATE POLICY "ca_insert" ON customer_addresses FOR INSERT WITH CHECK (customer_id IN (SELECT id FROM customers WHERE id = customer_id));
CREATE POLICY "ca_update" ON customer_addresses FOR UPDATE USING (customer_id IN (SELECT id FROM customers WHERE id = customer_id));
CREATE POLICY "ca_delete" ON customer_addresses FOR DELETE USING (customer_id IN (SELECT id FROM customers WHERE id = customer_id));
