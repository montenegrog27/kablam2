-- Agregar columnas de perfil a la tabla customers
-- Ejecutar en el SQL Editor de Supabase

ALTER TABLE customers
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS birth_date DATE,
ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Crear índice para búsqueda por email (opcional)
CREATE INDEX IF NOT EXISTS customers_email_idx ON customers(email) WHERE email IS NOT NULL;

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_customers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_customers_updated_at_trigger ON customers;
CREATE TRIGGER update_customers_updated_at_trigger
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION update_customers_updated_at();

-- Actualizar registros existentes para que tengan updated_at
UPDATE customers SET updated_at = created_at WHERE updated_at IS NULL;

-- Comentarios para documentación
COMMENT ON COLUMN customers.email IS 'Correo electrónico del cliente (opcional)';
COMMENT ON COLUMN customers.birth_date IS 'Fecha de nacimiento (opcional)';
COMMENT ON COLUMN customers.profile_completed IS 'Indica si el cliente completó su perfil';
COMMENT ON COLUMN customers.avatar_url IS 'URL de la imagen de perfil';
COMMENT ON COLUMN customers.updated_at IS 'Fecha de última actualización del registro';