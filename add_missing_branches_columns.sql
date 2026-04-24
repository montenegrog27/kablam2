-- Agregar columnas faltantes a la tabla branches
-- Ejecutar en el SQL Editor de Supabase

-- 1. Agregar columnas si no existen
ALTER TABLE branches
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS pickup_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS dine_in_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Crear trigger para actualizar updated_at automáticamente (si no existe)
CREATE OR REPLACE FUNCTION update_branches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_branches_updated_at_trigger ON branches;
CREATE TRIGGER update_branches_updated_at_trigger
BEFORE UPDATE ON branches
FOR EACH ROW
EXECUTE FUNCTION update_branches_updated_at();

-- 3. Actualizar registros existentes para que tengan updated_at
UPDATE branches SET updated_at = created_at WHERE updated_at IS NULL;

-- 4. Comentarios para documentación
COMMENT ON COLUMN branches.address IS 'Dirección física de la sucursal';
COMMENT ON COLUMN branches.phone IS 'Teléfono de contacto de la sucursal';
COMMENT ON COLUMN branches.active IS 'Indica si la sucursal está activa (visible para clientes)';
COMMENT ON COLUMN branches.delivery_enabled IS 'Permite pedidos de delivery';
COMMENT ON COLUMN branches.pickup_enabled IS 'Permite pedidos para retirar';
COMMENT ON COLUMN branches.dine_in_enabled IS 'Permite pedidos para comer en el lugar';
COMMENT ON COLUMN branches.updated_at IS 'Fecha de última actualización del registro';

-- 5. Verificar que las columnas fueron agregadas
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'branches' 
ORDER BY ordinal_position;