-- Actualizar campos de fuentes para sucursal existente
-- Ejecutar en el SQL Editor de Supabase

-- 1. Actualizar font_family con el valor de font_primary si está vacío
UPDATE branch_settings 
SET font_family = font_primary 
WHERE (font_family IS NULL OR font_family = '') 
  AND font_primary IS NOT NULL;

-- 2. Si font_family es 'Inter' y font_url está vacío, agregar URL de Google Fonts
UPDATE branch_settings 
SET font_url = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
WHERE font_family = 'Inter' 
  AND (font_url IS NULL OR font_url = '');

-- 3. También puedes configurar fuentes personalizadas manualmente:
-- UPDATE branch_settings 
-- SET 
--   font_family = 'NombreDeTuFuente',
--   font_url = 'https://tuservidor.com/fuente.woff'
-- WHERE branch_id = 'tu-branch-id';

-- Verificar cambios
SELECT branch_id, font_primary, font_secondary, font_family, font_url FROM branch_settings;