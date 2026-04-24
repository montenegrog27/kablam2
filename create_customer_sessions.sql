-- Crear tabla de sesiones de clientes
-- Ejecutar en el SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS customer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  tenant_id UUID NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Índices para búsquedas rápidas
  CONSTRAINT valid_token CHECK (session_token ~ '^[a-zA-Z0-9\-_]+$')
);

-- Índices para búsquedas comunes
CREATE INDEX IF NOT EXISTS customer_sessions_token_idx ON customer_sessions(session_token);
CREATE INDEX IF NOT EXISTS customer_sessions_customer_id_idx ON customer_sessions(customer_id);
CREATE INDEX IF NOT EXISTS customer_sessions_branch_id_idx ON customer_sessions(branch_id);
CREATE INDEX IF NOT EXISTS customer_sessions_expires_at_idx ON customer_sessions(expires_at);
CREATE INDEX IF NOT EXISTS customer_sessions_valid_idx 
ON customer_sessions(session_token, customer_id, branch_id) 
WHERE expires_at > NOW();

-- Función para limpiar sesiones expiradas automáticamente
CREATE OR REPLACE FUNCTION cleanup_expired_customer_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM customer_sessions 
  WHERE expires_at < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

-- Comentarios para documentación
COMMENT ON TABLE customer_sessions IS 'Sesiones activas de clientes autenticados';
COMMENT ON COLUMN customer_sessions.session_token IS 'Token único de sesión (almacenado en cookie)';
COMMENT ON COLUMN customer_sessions.customer_id IS 'ID del cliente autenticado';
COMMENT ON COLUMN customer_sessions.branch_id IS 'ID de la sucursal donde se autenticó';
COMMENT ON COLUMN customer_sessions.tenant_id IS 'ID del tenant';
COMMENT ON COLUMN customer_sessions.expires_at IS 'Fecha de expiración de la sesión (generalmente 30 días)';
COMMENT ON COLUMN customer_sessions.created_at IS 'Fecha de creación de la sesión';

-- Ejemplo de inserción (solo para referencia):
-- INSERT INTO customer_sessions (session_token, customer_id, branch_id, tenant_id, expires_at)
-- VALUES (
--   'session-uuid-here',
--   'customer-uuid-here',
--   'branch-uuid-here',
--   'tenant-uuid-here',
--   NOW() + INTERVAL '30 days'
-- );