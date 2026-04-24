-- Crear tabla de tokens de autenticación para clientes
-- Ejecutar en el SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS customer_auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Índices para búsquedas rápidas
  CONSTRAINT valid_token CHECK (token ~ '^[a-zA-Z0-9\-_]+$')
);

-- Índices para búsquedas comunes
CREATE INDEX IF NOT EXISTS customer_auth_tokens_token_idx ON customer_auth_tokens(token) WHERE used = FALSE;
CREATE INDEX IF NOT EXISTS customer_auth_tokens_customer_id_idx ON customer_auth_tokens(customer_id);
CREATE INDEX IF NOT EXISTS customer_auth_tokens_expires_at_idx ON customer_auth_tokens(expires_at);
CREATE INDEX IF NOT EXISTS customer_auth_tokens_used_idx ON customer_auth_tokens(used);

-- Índice compuesto para búsquedas de tokens válidos
CREATE INDEX IF NOT EXISTS customer_auth_tokens_valid_idx 
ON customer_auth_tokens(token, customer_id, branch_id) 
WHERE used = FALSE AND expires_at > NOW();

-- Función para limpiar tokens expirados automáticamente (opcional)
CREATE OR REPLACE FUNCTION cleanup_expired_auth_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM customer_auth_tokens 
  WHERE expires_at < NOW() - INTERVAL '7 days'; -- Conservar tokens expirados por 7 días para auditoría
END;
$$ LANGUAGE plpgsql;

-- Podrías programar esta función con pg_cron si está disponible
-- SELECT cron.schedule('0 0 * * *', 'SELECT cleanup_expired_auth_tokens()');

-- Política RLS (opcional)
-- ALTER TABLE customer_auth_tokens ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Service role can manage auth tokens" ON customer_auth_tokens
--   FOR ALL USING (true); -- Solo accesible desde la aplicación, no desde el cliente directo

-- Comentarios para documentación
COMMENT ON TABLE customer_auth_tokens IS 'Tokens de autenticación para login por WhatsApp';
COMMENT ON COLUMN customer_auth_tokens.token IS 'Token único para autenticación (UUID o string aleatorio)';
COMMENT ON COLUMN customer_auth_tokens.customer_id IS 'ID del cliente que solicita login';
COMMENT ON COLUMN customer_auth_tokens.branch_id IS 'ID de la sucursal donde se solicita login';
COMMENT ON COLUMN customer_auth_tokens.expires_at IS 'Fecha de expiración del token (generalmente 15 minutos)';
COMMENT ON COLUMN customer_auth_tokens.used IS 'Indica si el token ya fue usado para login';
COMMENT ON COLUMN customer_auth_tokens.created_at IS 'Fecha de creación del token';

-- Ejemplo de inserción (solo para referencia):
-- INSERT INTO customer_auth_tokens (token, customer_id, branch_id, expires_at)
-- VALUES (
--   'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
--   'customer-uuid-here',
--   'branch-uuid-here',
--   NOW() + INTERVAL '15 minutes'
-- );