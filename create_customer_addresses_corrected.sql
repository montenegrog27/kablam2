-- Crear tabla de direcciones de clientes (versión corregida para la app)
-- Ejecutar en el SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  address TEXT NOT NULL,
  apartment TEXT,
  floor TEXT,
  notes TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Restricción para asegurar que solo haya una dirección predeterminada por cliente
  -- Se manejará con lógica de aplicación
);

-- Índices para búsquedas comunes
CREATE INDEX IF NOT EXISTS customer_addresses_customer_id_idx ON customer_addresses(customer_id);
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

-- Comentarios para documentación
COMMENT ON TABLE customer_addresses IS 'Direcciones favoritas de los clientes para delivery';
COMMENT ON COLUMN customer_addresses.alias IS 'Alias de la dirección (ej: Casa, Trabajo, Depto)';
COMMENT ON COLUMN customer_addresses.address IS 'Dirección completa (calle, número, barrio, ciudad)';
COMMENT ON COLUMN customer_addresses.apartment IS 'Departamento/Unidad';
COMMENT ON COLUMN customer_addresses.floor IS 'Piso';
COMMENT ON COLUMN customer_addresses.notes IS 'Notas adicionales para la entrega';
COMMENT ON COLUMN customer_addresses.is_default IS 'Indica si es la dirección por defecto del cliente';