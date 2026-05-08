-- Agregar columna address a customers si no existe
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;