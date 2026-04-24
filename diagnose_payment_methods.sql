-- Diagnóstico: Métodos de pago no visibles en checkout
-- Ejecutar en el SQL Editor de Supabase

-- 1. Verificar estructura de la tabla payment_methods
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'payment_methods' 
ORDER BY ordinal_position;

-- 2. Verificar si RLS está habilitado
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'payment_methods';

-- 3. Mostrar TODOS los métodos de pago (incluyendo inactivos)
SELECT 
  id,
  tenant_id,
  branch_id,
  name,
  type,
  affects_cash,
  requires_reference,
  is_active,
  created_at
FROM payment_methods 
ORDER BY tenant_id, branch_id NULLS FIRST, name;

-- 4. Para diagnosticar el problema específico de una sucursal:
--    Reemplaza 'santafe1583' con el slug de tu sucursal
WITH target_branch AS (
  SELECT id, tenant_id, slug, name
  FROM branches 
  WHERE slug = 'santafe1583'  -- Cambia este slug
)
SELECT 
  pm.*,
  b.name as branch_name,
  b.slug as branch_slug
FROM target_branch b
LEFT JOIN payment_methods pm ON 
  (pm.branch_id = b.id OR pm.branch_id IS NULL)
  AND pm.tenant_id = b.tenant_id
  AND pm.is_active = true
ORDER BY pm.branch_id NULLS FIRST, pm.name;

-- 5. Verificar si hay políticas RLS que bloqueen el acceso
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'payment_methods';

-- 6. Crear métodos de pago de prueba si no existen:
--    NOTA: Cambia 'TU_TENANT_ID' por el ID real de tu tenant
/*
INSERT INTO payment_methods (tenant_id, name, type, affects_cash, requires_reference, is_active)
VALUES 
  ('TU_TENANT_ID', 'Efectivo', 'cash', true, false, true),
  ('TU_TENANT_ID', 'Tarjeta de débito', 'card', false, false, true),
  ('TU_TENANT_ID', 'Transferencia', 'transfer', false, true, true)
ON CONFLICT DO NOTHING;
*/

-- 7. Para obtener el tenant_id de una sucursal:
SELECT 
  b.id as branch_id,
  b.slug as branch_slug,
  b.name as branch_name,
  t.id as tenant_id,
  t.name as tenant_name,
  t.slug as tenant_slug
FROM branches b
JOIN tenants t ON b.tenant_id = t.id
WHERE b.slug = 'santafe1583';  -- Cambia este slug