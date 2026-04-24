-- Crear tabla de reglas de upsell (sugerencias de productos)
-- Ejecutar en el SQL Editor de Supabase

CREATE TABLE IF NOT EXISTS upsell_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  suggested_category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  discount INTEGER NOT NULL DEFAULT 0 CHECK (discount >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- No permitir reglas duplicadas para misma combinación
  UNIQUE(tenant_id, category_id, suggested_category_id)
);

-- Índices para búsquedas comunes
CREATE INDEX IF NOT EXISTS upsell_rules_tenant_id_idx ON upsell_rules(tenant_id);
CREATE INDEX IF NOT EXISTS upsell_rules_category_id_idx ON upsell_rules(category_id);
CREATE INDEX IF NOT EXISTS upsell_rules_suggested_category_id_idx ON upsell_rules(suggested_category_id);
CREATE INDEX IF NOT EXISTS upsell_rules_is_active_idx ON upsell_rules(is_active);
CREATE INDEX IF NOT EXISTS upsell_rules_display_order_idx ON upsell_rules(display_order);

-- Índice compuesto para consultas frecuentes
CREATE INDEX IF NOT EXISTS upsell_rules_active_by_tenant_idx 
ON upsell_rules(tenant_id, is_active, display_order);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_upsell_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER upsell_rules_updated_at_trigger
BEFORE UPDATE ON upsell_rules
FOR EACH ROW
EXECUTE FUNCTION update_upsell_rules_updated_at();

-- Comentarios para documentación
COMMENT ON TABLE upsell_rules IS 'Reglas para sugerir productos relacionados en el checkout';
COMMENT ON COLUMN upsell_rules.tenant_id IS 'ID del tenant (empresa)';
COMMENT ON COLUMN upsell_rules.category_id IS 'ID de la categoría que activa la sugerencia (cuando el cliente agrega un producto de esta categoría al carrito)';
COMMENT ON COLUMN upsell_rules.suggested_category_id IS 'ID de la categoría sugerida (productos de esta categoría se mostrarán como sugerencia)';
COMMENT ON COLUMN upsell_rules.discount IS 'Descuento en pesos a aplicar al producto sugerido (ej: 100 = $100 de descuento)';
COMMENT ON COLUMN upsell_rules.is_active IS 'Indica si la regla está activa y visible';
COMMENT ON COLUMN upsell_rules.display_order IS 'Orden de visualización (menor primero)';

-- Habilitar RLS (Row Level Security)
ALTER TABLE upsell_rules ENABLE ROW LEVEL SECURITY;

-- Política para permitir lectura pública de reglas activas
-- (necesaria para que la app customer pueda ver las sugerencias)
DROP POLICY IF EXISTS "Public can view active upsell rules" ON upsell_rules;
CREATE POLICY "Public can view active upsell rules"
ON upsell_rules
FOR SELECT
TO public
USING (is_active = true);

-- Política para permitir a usuarios autenticados con rol 'admin' hacer CRUD
DROP POLICY IF EXISTS "Admins can manage upsell rules" ON upsell_rules;
CREATE POLICY "Admins can manage upsell rules"
ON upsell_rules
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
    AND u.tenant_id = upsell_rules.tenant_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid()
    AND u.role = 'admin'
    AND u.tenant_id = upsell_rules.tenant_id
  )
);

-- Verificar que la columna is_suggestable existe en products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'is_suggestable'
  ) THEN
    ALTER TABLE products ADD COLUMN is_suggestable BOOLEAN DEFAULT FALSE;
  END IF;
END
$$;

-- Verificar que la columna show_in_menu existe en products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'show_in_menu'
  ) THEN
    ALTER TABLE products ADD COLUMN show_in_menu BOOLEAN DEFAULT TRUE;
  END IF;
END
$$;

-- Crear índice para mejorar rendimiento de búsqueda de productos sugeribles
CREATE INDEX IF NOT EXISTS idx_products_suggestable 
ON products(branch_id, is_active, is_suggestable) 
WHERE is_active = true AND is_suggestable = true;

-- Ejemplo de inserción de regla de upsell
-- (cambiar tenant_id y category_ids según tus datos)
/*
INSERT INTO upsell_rules (tenant_id, category_id, suggested_category_id, discount, is_active, display_order)
SELECT 
  t.id as tenant_id,
  (SELECT id FROM categories WHERE tenant_id = t.id AND name LIKE '%Hamburguesas%' LIMIT 1) as cat1,
  (SELECT id FROM categories WHERE tenant_id = t.id AND name LIKE '%Bebidas%' LIMIT 1) as cat2,
  100,
  true,
  1
FROM tenants t
WHERE t.slug = 'mordiscoburgers'
ON CONFLICT DO NOTHING;
*/