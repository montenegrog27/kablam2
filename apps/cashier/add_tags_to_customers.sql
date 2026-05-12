-- Agregar columna tags a customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
