-- Tabla para registrar inicios de sesión de clientes
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