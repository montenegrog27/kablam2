-- Seed para datos de prueba de sucursal
-- Ejecutar en el SQL Editor de Supabase

-- 1. Verificar si el tenant "mordiscoburgers" existe, si no, crearlo
INSERT INTO tenants (id, name, slug, plan, trial_ends_at, created_at, updated_at)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Mordisco Burgers',
  'mordiscoburgers',
  'premium',
  NOW() + INTERVAL '30 days',
  NOW(),
  NOW()
)
ON CONFLICT (slug) DO NOTHING;

-- 2. Crear sucursal de prueba (santafe1583)
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
  created_at,
  updated_at
)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Sucursal Santa Fe 1583',
  'santafe1583',
  'Santa Fe 1583, CABA',
  '+541112345678',
  true,
  true,
  true,
  true,
  NOW(),
  NOW()
)
ON CONFLICT (slug) DO NOTHING;

-- 3. Crear configuración de branding para la sucursal
INSERT INTO branch_settings (
  id,
  branch_id,
  background_color,
  primary_color,
  secondary_color,
  font_primary,
  font_secondary,
  logo_url,
  created_at,
  updated_at
)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  '#FFFFFF',
  '#000000',
  '#666666',
  'Inter, sans-serif',
  'Inter, sans-serif',
  'https://via.placeholder.com/150',
  NOW(),
  NOW()
)
ON CONFLICT (branch_id) DO NOTHING;

-- 4. Verificar inserción
SELECT 
  t.name as tenant_name,
  t.slug as tenant_slug,
  b.name as branch_name,
  b.slug as branch_slug,
  b.active
FROM tenants t
JOIN branches b ON b.tenant_id = t.id
WHERE t.slug = 'mordiscoburgers';