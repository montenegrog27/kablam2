-- Add printing configuration to printers
ALTER TABLE printers ADD COLUMN IF NOT EXISTS print_comandas BOOLEAN DEFAULT false;
ALTER TABLE printers ADD COLUMN IF NOT EXISTS print_ticket BOOLEAN DEFAULT false;
ALTER TABLE printers ADD COLUMN IF NOT EXISTS port INTEGER DEFAULT 9100;

-- Category routing for comandas
CREATE TABLE IF NOT EXISTS printer_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  printer_id UUID REFERENCES printers(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(printer_id, category_id)
);
