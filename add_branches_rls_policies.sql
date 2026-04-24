-- Políticas RLS para la tabla branches
-- Ejecutar en el SQL Editor de Supabase

-- 1. Verificar si RLS está habilitado
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

-- 2. Política para permitir a usuarios autenticados ver todas las branches
CREATE POLICY "Authenticated users can view all branches"
ON branches
FOR SELECT
TO authenticated
USING (true);

-- 3. Política para permitir a usuarios autenticados insertar branches
-- (esto permite al SuperAdmin crear branches)
CREATE POLICY "Authenticated users can insert branches"
ON branches
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 4. Política para permitir a usuarios autenticados actualizar branches
CREATE POLICY "Authenticated users can update branches"
ON branches
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 5. Política para permitir a usuarios autenticados eliminar branches
CREATE POLICY "Authenticated users can delete branches"
ON branches
FOR DELETE
TO authenticated
USING (true);

-- Nota: Estas políticas son amplias y permiten a cualquier usuario autenticado
-- realizar operaciones CRUD en branches. En producción, deberías restringir
-- según tenant_id o roles específicos.