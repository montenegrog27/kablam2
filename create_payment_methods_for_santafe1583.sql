-- Crear métodos de pago para la sucursal santafe1583
-- Ejecutar en el SQL Editor de Supabase

-- 1. Obtener tenant_id de la sucursal santafe1583
WITH target_tenant AS (
  SELECT 
    t.id as tenant_id,
    t.name as tenant_name,
    b.id as branch_id,
    b.name as branch_name,
    b.slug as branch_slug
  FROM branches b
  JOIN tenants t ON b.tenant_id = t.id
  WHERE b.slug = 'santafe1583'
)
-- 2. Insertar métodos de pago de ejemplo (globales del tenant)
INSERT INTO payment_methods (
  id,
  tenant_id,
  branch_id,
  name,
  type,
  affects_cash,
  requires_reference,
  is_active,
  created_at
)
SELECT 
  gen_random_uuid(),
  tt.tenant_id,
  NULL, -- branch_id NULL = método global del tenant
  'Efectivo',
  'cash',
  true, -- afecta caja física
  false, -- no requiere referencia
  true, -- activo
  NOW()
FROM target_tenant tt
UNION ALL
SELECT 
  gen_random_uuid(),
  tt.tenant_id,
  NULL,
  'Tarjeta de débito',
  'card',
  false,
  false,
  true,
  NOW()
FROM target_tenant tt
UNION ALL
SELECT 
  gen_random_uuid(),
  tt.tenant_id,
  NULL,
  'Tarjeta de crédito',
  'card',
  false,
  false,
  true,
  NOW()
FROM target_tenant tt
UNION ALL
SELECT 
  gen_random_uuid(),
  tt.tenant_id,
  NULL,
  'Transferencia bancaria',
  'transfer',
  false,
  true, -- requiere referencia (número de transferencia)
  true,
  NOW()
FROM target_tenant tt
UNION ALL
SELECT 
  gen_random_uuid(),
  tt.tenant_id,
  NULL,
  'MercadoPago',
  'qr',
  false,
  false,
  true,
  NOW()
FROM target_tenant tt
-- Solo insertar si no existen métodos para este tenant
WHERE NOT EXISTS (
  SELECT 1 FROM payment_methods WHERE tenant_id = tt.tenant_id AND is_active = true
)
RETURNING *;

-- 3. Verificar inserción
SELECT 
  pm.id,
  pm.name as method_name,
  pm.type,
  pm.affects_cash,
  pm.requires_reference,
  pm.is_active,
  pm.branch_id,
  CASE 
    WHEN pm.branch_id IS NULL THEN 'Global (todo el tenant)'
    ELSE 'Específico de sucursal'
  END as scope,
  t.name as tenant_name,
  b.name as branch_name,
  b.slug as branch_slug
FROM payment_methods pm
JOIN tenants t ON pm.tenant_id = t.id
LEFT JOIN branches b ON pm.branch_id = b.id
WHERE pm.is_active = true
ORDER BY pm.branch_id NULLS FIRST, pm.name;

-- 4. Verificar que la sucursal santafe1583 puede ver estos métodos
SELECT 
  b.slug as branch_slug,
  b.name as branch_name,
  pm.name as payment_method,
  pm.type,
  pm.requires_reference
FROM branches b
CROSS JOIN LATERAL (
  SELECT * FROM payment_methods 
  WHERE tenant_id = b.tenant_id 
    AND is_active = true
    AND (branch_id = b.id OR branch_id IS NULL)
  ORDER BY branch_id NULLS FIRST, name
) pm
WHERE b.slug = 'santafe1583';