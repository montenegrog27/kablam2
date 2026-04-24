-- Crear tabla de direcciones de clientes
-- Ejecutar en el SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  branch_id UUID,
  alias TEXT NOT NULL DEFAULT 'Casa',
  street TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip_code TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Restricciones
  CONSTRAINT valid_alias CHECK (alias IN ('Casa', 'Trabajo', 'Otro') OR alias ~ '^[A-Za-z0-9\s]+$'),
  CONSTRAINT valid_coordinates CHECK (
    (latitude IS NULL AND longitude IS NULL) OR
    (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  )
);

-- Índices para búsquedas comunes
CREATE INDEX IF NOT EXISTS customer_addresses_customer_id_idx ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS customer_addresses_tenant_id_idx ON customer_addresses(tenant_id);
CREATE INDEX IF NOT EXISTS customer_addresses_branch_id_idx ON customer_addresses(branch_id);
CREATE INDEX IF NOT EXISTS customer_addresses_is_default_idx ON customer_addresses(is_default) WHERE is_default = TRUE;

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_customer_addresses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_customer_addresses_updated_at_trigger ON customer_addresses;
CREATE TRIGGER update_customer_addresses_updated_at_trigger
BEFORE UPDATE ON customer_addresses
FOR EACH ROW
EXECUTE FUNCTION update_customer_addresses_updated_at();

-- Política RLS (Row Level Security) - opcional si usas RLS
-- ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Customers can view their own addresses" ON customer_addresses
--   FOR SELECT USING (customer_id = auth.uid());
-- CREATE POLICY "Customers can insert their own addresses" ON customer_addresses
--   FOR INSERT WITH CHECK (customer_id = auth.uid());
-- CREATE POLICY "Customers can update their own addresses" ON customer_addresses
--   FOR UPDATE USING (customer_id = auth.uid());

-- Comentarios para documentación
COMMENT ON TABLE customer_addresses IS 'Direcciones favoritas de los clientes';
COMMENT ON COLUMN customer_addresses.alias IS 'Alias de la dirección (ej: Casa, Trabajo, Otro)';
COMMENT ON COLUMN customer_addresses.street IS 'Calle y número';
COMMENT ON COLUMN customer_addresses.city IS 'Ciudad';
COMMENT ON COLUMN customer_addresses.state IS 'Provincia/Estado';
COMMENT ON COLUMN customer_addresses.zip_code IS 'Código postal';
COMMENT ON COLUMN customer_addresses.latitude IS 'Latitud para geolocalización';
COMMENT ON COLUMN customer_addresses.longitude IS 'Longitud para geolocalización';
COMMENT ON COLUMN customer_addresses.is_default IS 'Indica si es la dirección por defecto';