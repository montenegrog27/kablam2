-- Políticas RLS para la tabla users
-- Ejecutar en el SQL Editor de Supabase

-- 1. Verificar si RLS está habilitado
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 2. Política para permitir a usuarios autenticados ver todos los usuarios
-- (En producción, considera restringir por tenant_id)
CREATE POLICY "Authenticated users can view all users"
ON users
FOR SELECT
TO authenticated
USING (true);

-- 3. Política para permitir a usuarios autenticados insertar usuarios
-- (esto permite al SuperAdmin crear usuarios)
CREATE POLICY "Authenticated users can insert users"
ON users
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 4. Política para permitir a usuarios autenticados actualizar usuarios
CREATE POLICY "Authenticated users can update users"
ON users
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 5. Política para permitir a usuarios autenticados eliminar usuarios
CREATE POLICY "Authenticated users can delete users"
ON users
FOR DELETE
TO authenticated
USING (true);

-- Nota: Estas políticas son amplias y permiten a cualquier usuario autenticado
-- realizar operaciones CRUD en users. En producción, deberías restringir
-- según tenant_id o roles específicos.
-- Por ejemplo, para restringir por tenant_id:
-- USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));