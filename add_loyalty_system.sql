-- Sistema de Fidelización Kablam
-- Ejecutar en Supabase SQL Editor

-- 1. REGLAS DE FIDELIZACIÓN (configurables desde admin)
CREATE TABLE IF NOT EXISTS loyalty_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL, -- ej: "Hamburguesas Dobles", "Puntos por $"
  type TEXT NOT NULL CHECK (type IN ('points', 'product_accumulation')),
  
  -- Para puntos: cada $X = 1 punto
  points_per_amount DECIMAL DEFAULT 1000, -- cada $1000 = 1 punto
  
  -- Para acumulación de productos: comprar X = 1 gratis
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  required_quantity INT DEFAULT 5,
  reward_product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  reward_type TEXT DEFAULT 'free_product', -- free_product, discount_percent, discount_amount
  reward_value DECIMAL, -- porcentaje o monto de descuento
  
  is_active BOOLEAN DEFAULT true,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  max_redemptions_per_user INT DEFAULT 99,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. PROGRESO DE RECOMPENSAS POR USUARIO
CREATE TABLE IF NOT EXISTS user_rewards_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES loyalty_rules(id) ON DELETE CASCADE,
  current_count INT DEFAULT 0,
  total_required INT NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT now(),
  UNIQUE(customer_id, rule_id)
);

-- 3. CANJES DE RECOMPENSAS
CREATE TABLE IF NOT EXISTS reward_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES loyalty_rules(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  reward_type TEXT NOT NULL,
  reward_value DECIMAL,
  redeemed_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMPTZ
);

-- 4. PRODUCTOS FAVORITOS
CREATE TABLE IF NOT EXISTS user_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(customer_id, product_id)
);

-- 5. PUNTOS DE FIDELIDAD
ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_points INT DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_points_earned INT DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS lifetime_orders INT DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS lifetime_spent DECIMAL DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_order_at TIMESTAMPTZ;

-- 6. NOTIFICACIONES
CREATE TABLE IF NOT EXISTS user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'order_status', 'reward_unlocked', 'promotion', 'points'
  title TEXT NOT NULL,
  body TEXT,
  data JSONB,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_user_rewards_progress_customer ON user_rewards_progress(customer_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_customer ON user_favorites(customer_id);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_customer ON reward_redemptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_customer ON user_notifications(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_rules_tenant ON loyalty_rules(tenant_id);

-- Función para agregar puntos
CREATE OR REPLACE FUNCTION add_loyalty_points(p_customer_id UUID, p_points INT)
RETURNS void AS $$
BEGIN
  UPDATE customers SET
    loyalty_points = COALESCE(loyalty_points, 0) + p_points,
    total_points_earned = COALESCE(total_points_earned, 0) + p_points
  WHERE id = p_customer_id;
END;
$$ LANGUAGE plpgsql;
