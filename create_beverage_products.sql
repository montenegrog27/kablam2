-- Crear productos de bebidas para categoría "Bebidas sin alcohol"
-- Ejecutar en el SQL Editor de Supabase
-- Asegurarse de tener el branch_id correcto: 450b71ba-05b5-4714-acff-eb35a5e3e731 (santafe1583)
-- y category_id: 801747ab-4333-42c7-b995-cb122331f01a (Bebidas sin alcohol)

-- 1. Verificar que la categoría existe
SELECT id, name FROM categories WHERE id = '801747ab-4333-42c7-b995-cb122331f01a';

-- 2. Insertar productos de bebidas (marcados como suggestable para upsell)
INSERT INTO products (
  id,
  branch_id,
  category_id,
  name,
  description,
  is_active,
  is_suggestable,
  show_in_menu,
  allow_half,
  created_at
) VALUES 
-- Coca-Cola en Lata (sugerible, aparece en menú)
(
  gen_random_uuid(),
  '450b71ba-05b5-4714-acff-eb35a5e3e731',
  '801747ab-4333-42c7-b995-cb122331f01a',
  'Coca-Cola en Lata',
  'Lata 354ml',
  true,
  true,
  true,
  false,
  NOW()
),
-- Pepsi en Lata (sugerible, aparece en menú)
(
  gen_random_uuid(),
  '450b71ba-05b5-4714-acff-eb35a5e3e731',
  '801747ab-4333-42c7-b995-cb122331f01a',
  'Pepsi en Lata',
  'Lata 354ml',
  true,
  true,
  true,
  false,
  NOW()
),
-- Agua Mineral (producto complementario, NO aparece en menú)
(
  gen_random_uuid(),
  '450b71ba-05b5-4714-acff-eb35a5e3e731',
  '801747ab-4333-42c7-b995-cb122331f01a',
  'Agua Mineral 500ml',
  'Agua sin gas',
  true,
  false, -- No es sugerible por reglas, pero show_in_menu = false lo hace complementario
  false, -- NO aparece en menú → siempre se muestra como "Producto complementario"
  false,
  NOW()
),
-- Jugo de Naranja (sugerible, aparece en menú)
(
  gen_random_uuid(),
  '450b71ba-05b5-4714-acff-eb35a5e3e731',
  '801747ab-4333-42c7-b995-cb122331f01a',
  'Jugo de Naranja',
  'Jugo natural',
  true,
  true,
  true,
  false,
  NOW()
)
ON CONFLICT DO NOTHING;

-- 3. Obtener IDs de productos insertados
SELECT p.id as product_id, p.name, p.is_suggestable, p.show_in_menu
FROM products p
WHERE p.branch_id = '450b71ba-05b5-4714-acff-eb35a5e3e731'
  AND p.category_id = '801747ab-4333-42c7-b995-cb122331f01a'
  AND p.is_active = true;

-- 4. Insertar variantes de precio para cada producto
-- NOTA: Ejecutar después de conocer los IDs de productos, o usar subqueries
-- Para simplificar, usamos una consulta que inserta variantes para todos los productos de esta categoría
WITH inserted_products AS (
  SELECT id, name FROM products 
  WHERE branch_id = '450b71ba-05b5-4714-acff-eb35a5e3e731'
    AND category_id = '801747ab-4333-42c7-b995-cb122331f01a'
    AND is_active = true
)
INSERT INTO product_variants (
  id,
  product_id,
  name,
  price,
  is_default,
  created_at
)
SELECT 
  gen_random_uuid(),
  ip.id,
  'Única',
  CASE 
    WHEN ip.name LIKE '%Coca-Cola%' THEN 1200
    WHEN ip.name LIKE '%Pepsi%' THEN 1100
    WHEN ip.name LIKE '%Agua Mineral%' THEN 800
    WHEN ip.name LIKE '%Jugo de Naranja%' THEN 1500
    ELSE 1000
  END,
  true,
  NOW()
FROM inserted_products ip
ON CONFLICT DO NOTHING;

-- 5. Verificar productos y variantes creadas
SELECT 
  p.name as producto,
  p.is_suggestable,
  p.show_in_menu,
  pv.name as variante,
  pv.price,
  pv.is_default
FROM products p
LEFT JOIN product_variants pv ON p.id = pv.product_id
WHERE p.branch_id = '450b71ba-05b5-4714-acff-eb35a5e3e731'
  AND p.category_id = '801747ab-4333-42c7-b995-cb122331f01a'
  AND p.is_active = true
ORDER BY p.name;