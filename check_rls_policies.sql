-- Verificar políticas RLS actuales para payment_methods
-- Ejecutar en el SQL Editor de Supabase

-- 1. Ver todas las políticas de payment_methods
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
WHERE tablename = 'payment_methods'
ORDER BY policyname;

-- 2. Verificar si la política para 'public' existe
SELECT EXISTS (
  SELECT 1 FROM pg_policies 
  WHERE tablename = 'payment_methods' 
    AND 'public' = ANY(roles)
    AND cmd = 'SELECT'
) as has_public_select_policy;

-- 3. Contar métodos activos visibles para diferentes roles
-- Para público (anónimo)
SELECT COUNT(*) as public_view_count
FROM payment_methods 
WHERE is_active = true;

-- Para usuario autenticado del tenant (simulado)
WITH user_tenant AS (
  SELECT tenant_id FROM users LIMIT 1  -- Tomar un tenant de ejemplo
)
SELECT COUNT(*) as authenticated_view_count
FROM payment_methods pm
JOIN user_tenant ut ON pm.tenant_id = ut.tenant_id
WHERE pm.is_active = true;

-- 4. Verificar acceso para la sucursal santafe1583 como público
WITH target_branch AS (
  SELECT id, tenant_id FROM branches WHERE slug = 'santafe1583'
)
SELECT 
  COUNT(pm.*) as available_methods_count,
  ARRAY_AGG(pm.name) as available_methods
FROM target_branch b
LEFT JOIN payment_methods pm ON 
  (pm.branch_id = b.id OR pm.branch_id IS NULL)
  AND pm.tenant_id = b.tenant_id
  AND pm.is_active = true;

-- 5. Si falta política pública, crearla
-- NOTA: Descomenta y ejecuta solo si falta la política
/*
DROP POLICY IF EXISTS "Public can view active payment methods" ON payment_methods;
CREATE POLICY "Public can view active payment methods"
ON payment_methods
FOR SELECT
TO public
USING (is_active = true);
*/