-- ============================================
-- MIGRACIONES PARA SISTEMA DE AUTENTICACIÓN DE CLIENTES
-- Ejecutar en el SQL Editor de Supabase en este orden
-- ============================================

-- 1. Agregar columnas de perfil a la tabla customers
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS birth_date DATE,
ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Crear índice para búsqueda por email (opcional)
CREATE INDEX IF NOT EXISTS customers_email_idx ON customers(email) WHERE email IS NOT NULL;

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_customers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_customers_updated_at_trigger ON customers;
CREATE TRIGGER update_customers_updated_at_trigger
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION update_customers_updated_at();

-- Actualizar registros existentes para que tengan updated_at
UPDATE customers SET updated_at = created_at WHERE updated_at IS NULL;

-- Comentarios para documentación
COMMENT ON COLUMN customers.email IS 'Correo electrónico del cliente (opcional)';
COMMENT ON COLUMN customers.birth_date IS 'Fecha de nacimiento (opcional)';
COMMENT ON COLUMN customers.profile_completed IS 'Indica si el cliente completó su perfil';
COMMENT ON COLUMN customers.avatar_url IS 'URL de la imagen de perfil';
COMMENT ON COLUMN customers.updated_at IS 'Fecha de última actualización del registro';

-- ============================================
-- 2. Crear tabla de tokens de autenticación para clientes
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

-- Comentarios para documentación
COMMENT ON TABLE customer_auth_tokens IS 'Tokens de autenticación para login por WhatsApp';
COMMENT ON COLUMN customer_auth_tokens.token IS 'Token único para autenticación (UUID o string aleatorio)';
COMMENT ON COLUMN customer_auth_tokens.customer_id IS 'ID del cliente que solicita login';
COMMENT ON COLUMN customer_auth_tokens.branch_id IS 'ID de la sucursal donde se solicita login';
COMMENT ON COLUMN customer_auth_tokens.expires_at IS 'Fecha de expiración del token (generalmente 15 minutos)';
COMMENT ON COLUMN customer_auth_tokens.used IS 'Indica si el token ya fue usado para login';
COMMENT ON COLUMN customer_auth_tokens.created_at IS 'Fecha de creación del token';

-- ============================================
-- 3. Crear tabla de sesiones de clientes
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

-- Comentarios para documentación
COMMENT ON TABLE customer_sessions IS 'Sesiones activas de clientes autenticados';
COMMENT ON COLUMN customer_sessions.session_token IS 'Token único de sesión (almacenado en cookie)';
COMMENT ON COLUMN customer_sessions.customer_id IS 'ID del cliente autenticado';
COMMENT ON COLUMN customer_sessions.branch_id IS 'ID de la sucursal donde se autenticó';
COMMENT ON COLUMN customer_sessions.tenant_id IS 'ID del tenant';
COMMENT ON COLUMN customer_sessions.expires_at IS 'Fecha de expiración de la sesión (generalmente 30 días)';
COMMENT ON COLUMN customer_sessions.created_at IS 'Fecha de creación de la sesión';

-- ============================================
-- 4. Crear tabla de direcciones de clientes (versión corregida)
CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  address TEXT NOT NULL,
  apartment TEXT,
  floor TEXT,
  notes TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para búsquedas comunes
CREATE INDEX IF NOT EXISTS customer_addresses_customer_id_idx ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS customer_addresses_is_default_idx ON customer_addresses(is_default) WHERE is_default = TRUE;

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_customer_addresses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_customer_addresses_updated_at_trigger ON customer_addresses;
CREATE TRIGGER update_customer_addresses_updated_at_trigger
BEFORE UPDATE ON customer_addresses
FOR EACH ROW
EXECUTE FUNCTION update_customer_addresses_updated_at();

-- Comentarios para documentación
COMMENT ON TABLE customer_addresses IS 'Direcciones favoritas de los clientes para delivery';
COMMENT ON COLUMN customer_addresses.alias IS 'Alias de la dirección (ej: Casa, Trabajo, Depto)';
COMMENT ON COLUMN customer_addresses.address IS 'Dirección completa (calle, número, barrio, ciudad)';
COMMENT ON COLUMN customer_addresses.apartment IS 'Departamento/Unidad';
COMMENT ON COLUMN customer_addresses.floor IS 'Piso';
COMMENT ON COLUMN customer_addresses.notes IS 'Notas adicionales para la entrega';
COMMENT ON COLUMN customer_addresses.is_default IS 'Indica si es la dirección por defecto del cliente';

-- ============================================
-- 5. Crear tabla de logs de inicio de sesión
CREATE TABLE IF NOT EXISTS customer_login_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  login_method TEXT NOT NULL CHECK (login_method IN ('whatsapp', 'sms', 'email', 'social')),
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Índices para consultas frecuentes
  INDEX idx_customer_login_logs_customer_id (customer_id),
  INDEX idx_customer_login_logs_branch_id (branch_id),
  INDEX idx_customer_login_logs_created_at (created_at DESC)
);

-- Comentarios
COMMENT ON TABLE customer_login_logs IS 'Registro de inicios de sesión de clientes para auditoría';
COMMENT ON COLUMN customer_login_logs.login_method IS 'Método de autenticación utilizado';
COMMENT ON COLUMN customer_login_logs.ip_address IS 'Dirección IP del cliente (para seguridad)';
COMMENT ON COLUMN customer_login_logs.user_agent IS 'Agente de usuario del navegador';

-- ============================================
-- MIGRACIONES COMPLETADAS
-- ============================================