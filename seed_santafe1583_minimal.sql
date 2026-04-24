-- Seed mínima para sucursal santafe1583
-- Solo columnas esenciales que probablemente existen
-- Ejecutar en el SQL Editor de Supabase

-- 1. Crear sucursal con columnas básicas
INSERT INTO branches (
  id,
  tenant_id,
  name,
  slug,
  active,
  created_at
)
SELECT 
  '22222222-2222-2222-2222-222222222222',
  id,
  'Sucursal Santa Fe 1583',
  'santafe1583',
  true,
  NOW()
FROM tenants 
WHERE slug = 'mordiscoburgers'
ON CONFLICT (slug) DO NOTHING;

-- 2. Verificar inserción
SELECT 
  t.name as tenant_name,
  t.slug as tenant_slug,
  b.name as branch_name,
  b.slug as branch_slug,
  b.active,
  b.id as branch_id
FROM tenants t
JOIN branches b ON b.tenant_id = t.id
WHERE t.slug = 'mordiscoburgers'
  AND b.slug = 'santafe1583';