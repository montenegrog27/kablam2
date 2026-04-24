-- Seed simplificado para sucursal santafe1583
-- Ejecutar en el SQL Editor de Supabase

-- 1. Verificar/crear sucursal (sin updated_at si no existe)
INSERT INTO branches (
  id,
  tenant_id,
  name,
  slug,
  address,
  phone,
  active,
  delivery_enabled,
  pickup_enabled,
  dine_in_enabled,
  created_at
)
SELECT 
  '22222222-2222-2222-2222-222222222222',
  id, -- Obtener el ID del tenant mordiscoburgers
  'Sucursal Santa Fe 1583',
  'santafe1583',
  'Santa Fe 1583, CABA',
  '+541112345678',
  true,
  true,
  true,
  true,
  NOW()
FROM tenants 
WHERE slug = 'mordiscoburgers'
ON CONFLICT (slug) DO NOTHING;

-- 2. Crear configuración de branding (sin updated_at si no existe)
INSERT INTO branch_settings (
  id,
  branch_id,
  background_color,
  primary_color,
  secondary_color,
  font_primary,
  font_secondary,
  logo_url,
  created_at
)
SELECT 
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  '#FFFFFF',
  '#000000',
  '#666666',
  'Inter, sans-serif',
  'Inter, sans-serif',
  'https://via.placeholder.com/150',
  NOW()
ON CONFLICT (branch_id) DO NOTHING;

-- 3. Verificar que se creó
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