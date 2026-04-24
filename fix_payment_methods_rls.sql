-- Corregir políticas RLS para payment_methods
-- Permitir acceso público (anon) a métodos de pago activos
-- Ejecutar en el SQL Editor de Supabase

-- 1. Verificar si RLS está habilitado
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'payment_methods';

-- 2. Agregar política para permitir a usuarios anónimos (y autenticados) ver métodos activos
--    Esto permitirá que la app customer (sin login) vea los métodos de pago
DROP POLICY IF EXISTS "Public can view active payment methods" ON payment_methods;
CREATE POLICY "Public can view active payment methods"
ON payment_methods
FOR SELECT
TO public
USING (is_active = true);

-- 3. Verificar políticas existentes
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'payment_methods'
ORDER BY policyname;

-- 4. Prueba: contar métodos activos visibles para público
SELECT COUNT(*) as active_methods_public_view
FROM payment_methods 
WHERE is_active = true;

-- 5. Para la sucursal santafe1583, ver qué métodos deberían verse
WITH target_branch AS (
  SELECT id, tenant_id, name as branch_name, slug
  FROM branches 
  WHERE slug = 'santafe1583'
)
SELECT 
  pm.id,
  pm.name as method_name,
  pm.type,
  pm.requires_reference,
  pm.is_active,
  b.branch_name,
  b.slug as branch_slug,
  CASE 
    WHEN pm.branch_id = b.id THEN 'branch-specific'
    WHEN pm.branch_id IS NULL THEN 'tenant-global'
    ELSE 'other-branch'
  END as scope
FROM target_branch b
LEFT JOIN payment_methods pm ON 
  (pm.branch_id = b.id OR pm.branch_id IS NULL)
  AND pm.tenant_id = b.tenant_id
  AND pm.is_active = true
ORDER BY pm.branch_id NULLS FIRST, pm.name;

-- 6. Nota: Las políticas INSERT/UPDATE/DELETE siguen restringidas a usuarios autenticados
--    Esto mantiene la seguridad mientras permite lectura pública de métodos activos