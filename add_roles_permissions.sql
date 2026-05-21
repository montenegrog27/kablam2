-- Roles
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Permissions
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  module TEXT NOT NULL,
  description TEXT
);

-- Role-Permission assignment
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  UNIQUE(role_id, permission_id)
);

-- Add role_id to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id);

-- Seed base permissions
INSERT INTO permissions (key, name, module, description) VALUES
  ('admin.dashboard.view', 'Ver Dashboard', 'admin', 'Acceso al dashboard principal'),
  ('admin.branches.view', 'Ver Sucursales', 'admin', 'Ver y editar sucursales'),
  ('admin.categories.view', 'Ver Categorías', 'admin', 'Gestionar categorías'),
  ('admin.products.view', 'Ver Productos', 'admin', 'Gestionar productos'),
  ('admin.ingredients.view', 'Ver Ingredientes', 'admin', 'Gestionar ingredientes'),
  ('admin.recipes.view', 'Ver Recetas', 'admin', 'Gestionar recetas y costos'),
  ('admin.combos.view', 'Ver Combos', 'admin', 'Gestionar combos'),
  ('admin.customers.view', 'Ver Clientes', 'admin', 'Ver clientes y pedidos'),
  ('admin.ventas.view', 'Ver Ventas', 'admin', 'Ver reportes de ventas'),
  ('admin.reports.view', 'Ver Reportes', 'admin', 'Ver reportes diarios y financieros'),
  ('admin.expenses.view', 'Ver Gastos', 'admin', 'Gestionar gastos'),
  ('admin.suppliers.view', 'Ver Proveedores', 'admin', 'Gestionar proveedores'),
  ('admin.purchases.view', 'Ver Compras', 'admin', 'Gestionar compras y stock'),
  ('admin.loyalty.view', 'Ver Fidelización', 'admin', 'Configurar programa de fidelización'),
  ('admin.coupons.view', 'Ver Cupones', 'admin', 'Gestionar cupones de descuento'),
  ('admin.flashsales.view', 'Ver Ofertas Flash', 'admin', 'Gestionar ofertas por tiempo limitado'),
  ('admin.printers.view', 'Ver Impresoras', 'admin', 'Configurar impresoras'),
  ('admin.kdsconfig.view', 'Ver KDS Config', 'admin', 'Configurar pantalla de cocina'),
  ('admin.featured.view', 'Ver Destacados', 'admin', 'Ordenar productos destacados'),
  ('admin.delivery.view', 'Ver Delivery', 'admin', 'Configurar delivery'),
  ('admin.paymentmethods.view', 'Ver Métodos de Pago', 'admin', 'Gestionar métodos de pago'),
  ('admin.users.view', 'Ver Usuarios', 'admin', 'Gestionar usuarios y roles'),
  ('admin.settings.view', 'Ver Configuración', 'admin', 'Configuración general'),
  ('cashier.orders.view', 'Ver Pedidos', 'cashier', 'Ver y gestionar pedidos en el panel'),
  ('cashier.kds.view', 'Ver KDS', 'cashier', 'Ver pantalla de cocina'),
  ('cashier.chat.view', 'Ver Chat', 'cashier', 'Ver y enviar mensajes WhatsApp'),
  ('cashier.menu.view', 'Ver Menú', 'cashier', 'Ver y crear pedidos desde el menú'),
  ('cashier.products.view', 'Ver Productos', 'cashier', 'Ver catálogo de productos'),
  ('cashier.close_cash.view', 'Cerrar Caja', 'cashier', 'Realizar arqueo y cierre de caja'),
  ('customer.menu.view', 'Ver Menú', 'customer', 'Ver menú y hacer pedidos'),
  ('customer.profile.view', 'Ver Perfil', 'customer', 'Ver perfil y puntos'),
  ('customer.orders.view', 'Ver Pedidos', 'customer', 'Ver historial de pedidos')
ON CONFLICT (key) DO NOTHING;

-- RLS
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roles_select" ON roles FOR SELECT USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "roles_insert" ON roles FOR INSERT WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "roles_update" ON roles FOR UPDATE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
CREATE POLICY "roles_delete" ON roles FOR DELETE USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "perms_select" ON permissions FOR SELECT USING (true);
CREATE POLICY "rp_select" ON role_permissions FOR SELECT USING (role_id IN (SELECT id FROM roles WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())));
CREATE POLICY "rp_insert" ON role_permissions FOR INSERT WITH CHECK (role_id IN (SELECT id FROM roles WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())));
CREATE POLICY "rp_delete" ON role_permissions FOR DELETE USING (role_id IN (SELECT id FROM roles WHERE tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())));
