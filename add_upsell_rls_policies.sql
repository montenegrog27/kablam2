-- Políticas RLS para upsell_rules y acceso a productos sugeribles
-- Ejecutar en el SQL Editor de Supabase

-- 1. Verificar si upsell_rules existe y tiene RLS
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'upsell_rules';

-- Si la tabla no existe, créala (copiar estructura desde admin app)
-- NOTA: La tabla debería haberse creado desde la app admin

-- 2. Habilitar RLS si no está habilitado
ALTER TABLE upsell_rules ENABLE ROW LEVEL SECURITY;

-- 3. Crear política para permitir lectura pública de reglas activas
DROP POLICY IF EXISTS "Public can view active upsell rules" ON upsell_rules;
CREATE POLICY "Public can view active upsell rules"
ON upsell_rules
FOR SELECT
TO public
USING (is_active = true);

-- 4. Verificar políticas existentes para products
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'products';

-- 5. Asegurar que products tenga política pública para productos activos
-- (Asumiendo que ya existe, si no, crearla)
-- Ejemplo de política para productos activos:
/*
DROP POLICY IF EXISTS "Public can view active products" ON products;
CREATE POLICY "Public can view active products"
ON products
FOR SELECT
TO public
USING (is_active = true);
*/

-- 6. Verificar que la columna is_suggestable existe en products
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'products' AND column_name = 'is_suggestable';

-- Si no existe, agregarla:
-- ALTER TABLE products ADD COLUMN IF NOT EXISTS is_suggestable BOOLEAN DEFAULT FALSE;

-- 7. Verificar que la columna show_in_menu existe
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'products' AND column_name = 'show_in_menu';

-- 8. Crear índice para mejorar rendimiento de búsqueda de productos sugeribles
CREATE INDEX IF NOT EXISTS idx_products_suggestable 
ON products(branch_id, is_active, is_suggestable) 
WHERE is_active = true AND is_suggestable = true;

-- 9. Verificar inserción de datos de prueba
-- Insertar regla de upsell de ejemplo (cambiar tenant_id y category_ids)
/*
INSERT INTO upsell_rules (tenant_id, category_id, suggested_category_id, discount, is_active, display_order)
SELECT 
  t.id as tenant_id,
  (SELECT id FROM categories WHERE tenant_id = t.id AND name LIKE '%Hamburguesas%' LIMIT 1) as cat1,
  (SELECT id FROM categories WHERE tenant_id = t.id AND name LIKE '%Bebidas%' LIMIT 1) as cat2,
  100,
  true,
  1
FROM tenants t
WHERE t.slug = 'mordiscoburgers'
ON CONFLICT DO NOTHING;
*/

-- 10. Verificar que todo funciona
SELECT 
  ur.id,
  ur.discount,
  c1.name as cuando_categoria,
  c2.name as sugerir_categoria
FROM upsell_rules ur
LEFT JOIN categories c1 ON ur.category_id = c1.id
LEFT JOIN categories c2 ON ur.suggested_category_id = c2.id
WHERE ur.is_active = true
LIMIT 5;