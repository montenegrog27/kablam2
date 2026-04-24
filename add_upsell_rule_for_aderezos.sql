-- Agregar regla de upsell para categoría "Aderezos" (que ya tiene productos suggestable)
-- Ejecutar en el SQL Editor de Supabase
-- Tenant: 3e3b5ec7-376e-4f5d-9735-c437a8849e95
-- Branch: santafe1583 (450b71ba-05b5-4714-acff-eb35a5e3e731)

-- 1. Encontrar ID de categoría "Aderezos"
SELECT id, name FROM categories 
WHERE tenant_id = '3e3b5ec7-376e-4f5d-9735-c437a8849e95'
  AND name ILIKE '%aderezo%'
LIMIT 1;

-- 2. Encontrar ID de categoría "Dobles con Papas" (ya debería existir en la regla actual)
SELECT ur.category_id, c.name 
FROM upsell_rules ur
LEFT JOIN categories c ON ur.category_id = c.id
WHERE ur.tenant_id = '3e3b5ec7-376e-4f5d-9735-c437a8849e95'
LIMIT 1;

-- 3. Insertar nueva regla (si encontramos Aderezos)
-- NOTA: Reemplazar 'CATEGORIA_ADEREZOS_ID' con el ID real del paso 1
INSERT INTO upsell_rules (
  id,
  tenant_id,
  category_id,
  suggested_category_id,
  discount,
  is_active,
  display_order
) 
SELECT 
  gen_random_uuid(),
  '3e3b5ec7-376e-4f5d-9735-c437a8849e95',
  ur.category_id, -- Usar misma categoría origen que la regla existente
  (SELECT id FROM categories WHERE tenant_id = '3e3b5ec7-376e-4f5d-9735-c437a8849e95' AND name ILIKE '%aderezo%' LIMIT 1),
  200, -- $200 de descuento
  true,
  2 -- Segunda posición
FROM upsell_rules ur
WHERE ur.tenant_id = '3e3b5ec7-376e-4f5d-9735-c437a8849e95'
LIMIT 1
ON CONFLICT DO NOTHING;

-- 4. Verificar reglas actualizadas
SELECT 
  ur.id,
  ur.discount,
  c1.name as cuando_categoria,
  c2.name as sugerir_categoria,
  ur.is_active
FROM upsell_rules ur
LEFT JOIN categories c1 ON ur.category_id = c1.id
LEFT JOIN categories c2 ON ur.suggested_category_id = c2.id
WHERE ur.tenant_id = '3e3b5ec7-376e-4f5d-9735-c437a8849e95'
ORDER BY ur.display_order;