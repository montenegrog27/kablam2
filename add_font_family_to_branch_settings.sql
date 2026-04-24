-- Agregar columnas de branding a branch_settings
ALTER TABLE branch_settings 
ADD COLUMN IF NOT EXISTS brand_color TEXT DEFAULT '#FF6B35',
ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#1A1A1A',
ADD COLUMN IF NOT EXISTS font_family TEXT DEFAULT 'Arial, sans-serif',
ADD COLUMN IF NOT EXISTS font_url TEXT;

-- Actualizar registros existentes con valores por defecto si las columnas son NULL
UPDATE branch_settings 
SET 
  brand_color = COALESCE(brand_color, '#FF6B35'),
  accent_color = COALESCE(accent_color, '#1A1A1A'),
  font_family = COALESCE(font_family, 'Arial, sans-serif')
WHERE brand_color IS NULL OR accent_color IS NULL OR font_family IS NULL;