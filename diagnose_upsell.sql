-- Diagnóstico del sistema de Upsell
-- Ejecutar en el SQL Editor de Supabase

-- 1. Verificar tabla upsell_rules y sus datos
SELECT 
  COUNT(*) as total_rules,
  COUNT(CASE WHEN is_active = true THEN 1 END) as active_rules,
  COUNT(CASE WHEN is_active = false THEN 1 END) as inactive_rules
FROM upsell_rules;

-- 2. Verificar reglas específicas para el tenant 3e3b5ec7-376e-4f5d-9735-c437a8849e95
SELECT 
  ur.id,
  ur.tenant_id,
  ur.category_id,
  ur.suggested_category_id,
  ur.discount,
  ur.is_active,
  ur.display_order,
  c1.name as category_name,
  c2.name as suggested_category_name
FROM upsell_rules ur
LEFT JOIN categories c1 ON ur.category_id = c1.id
LEFT JOIN categories c2 ON ur.suggested_category_id = c2.id
WHERE ur.tenant_id = '3e3b5ec7-376e-4f5d-9735-c437a8849e95'
ORDER BY ur.display_order;

-- 3. Verificar productos en la sucursal santafe1583
SELECT 
  p.id,
  p.name,
  p.category_id,
  c.name as category_name,
  p.is_active,
  p.is_suggestable,
  p.show_in_menu,
  pv.id as variant_id,
  pv.name as variant_name,
  pv.price
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
LEFT JOIN product_variants pv ON p.id = pv.product_id
WHERE p.branch_id = (
  SELECT id FROM branches WHERE slug = 'santafe1583' LIMIT 1
)
AND p.is_active = true
LIMIT 20;

-- 4. Verificar productos marcados como suggestable
SELECT 
  p.id,
  p.name,
  p.category_id,
  c.name as category_name,
  p.is_suggestable,
  pv.price
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
LEFT JOIN product_variants pv ON p.id = pv.product_id AND (pv.is_default = true OR pv.is_default IS NULL)
WHERE p.branch_id = (
  SELECT id FROM branches WHERE slug = 'santafe1583' LIMIT 1
)
AND p.is_active = true
AND p.is_suggestable = true;

-- 5. Verificar categorías existentes para el tenant
SELECT 
  id,
  name,
  parent_id,
  (SELECT COUNT(*) FROM products WHERE category_id = categories.id AND is_active = true) as product_count
FROM categories
WHERE tenant_id = '3e3b5ec7-376e-4f5d-9735-c437a8849e95'
ORDER BY name;

-- 6. Verificar estructura de la tabla upsell_rules
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'upsell_rules'
ORDER BY ordinal_position;

-- 7. Verificar políticas RLS para upsell_rules
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'upsell_rules'
ORDER BY policyname;