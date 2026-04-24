# Kablam POS - Agent Instructions

## Commands

```bash
# Monorepo root commands (use npm from root)
npm run dev          # Start all apps
npm run build        # Build all apps
npm run lint         # Lint all packages
npm run check-types  # TypeScript check all packages
npm run format       # Format with Prettier

# Individual apps (from root)
turbo dev --filter=admin       # Admin panel only (port 3000)
turbo dev --filter=cashier    # POS cashier only (port 3001)
turbo dev --filter=customer   # Customer app only (port 3002)
```

## Architecture

```
apps/
  admin/     - Management panel (Next.js 16, Tailwind 4)
  cashier/   - POS terminal (Next.js 16, Tailwind 4)
  customer/  - Customer ordering app (Next.js 16, Tailwind 4)
packages/
  ui/        - Shared components (@repo/ui)
  supabase/  - Supabase client utilities
  eslint-config/
  typescript-config/
```

## Tech Stack

- **Framework**: Next.js 16.1.6 + React 19.2.3
- **Styling**: Tailwind CSS 4 (CSS-first config, no tailwind.config.js)
- **Backend**: Supabase (auth, realtime, storage)
- **Package Manager**: npm 10.7.0
- **Monorepo**: Turborepo 2.8.10
- **Icons**: lucide-react
- **NO UI library** - All custom Tailwind styling (not shadcn/ui, MUI, etc.)

## Environment Variables (required for full functionality)

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_ANON_KEY
WHATSAPP_VERIFY_TOKEN
```

## Menu Structure (IMPORTANT)

Products are organized in a **category hierarchy** (not variants for sizes/types):

```
Hamburguesas
├── Dobles con Papas
│   ├── Cheese Bacon Doble con Papas → $12900 (producto)
│   └── Cheese Doble con Papas → $12000 (producto)
├── Simples con Papas
│   └── ...
├── Dobles sin Papas
│   └── ...
└── Simples sin Papas
    └── ...

Pizzas
├── Clasicas
│   ├── Muzzarella
│   ├── Fugazzetta
│   └── Rucula
├── Slices
│   ├── Especial
│   └── Jamon y Morrones
```

**Regla**: Cada precio = 1 producto. Variantes SOLO para pizzas por mitades (`allow_half`).

1. **UI components**: Use `@repo/ui` for shared components. Individual apps have local components in `/components`
2. **Tailwind 4**: Uses CSS-based config (no JS config files). Import via `@import "tailwindcss"`
3. **Supabase**: All apps use `@supabase/ssr` for server-side auth with cookies
4. **Realtime**: Cashier app subscribes to Supabase realtime for order status updates
5. **No database migrations tool** - Database schema managed manually in Supabase dashboard

---

## Project Status: v0.75

### Currently Implemented

**Admin App:**

- Dashboard basico (nombre, rol, plan, trial)
- Sucursales con branding y redes sociales
- Categorias con subcategorias jerarquicas y turnos
- Productos con precio unico (no variantes), imagen, allow_half
- Modificadores/Extras agrupados por grupo
- Cocinas/Barras
- Impresoras de red
- Metodos de pago
- Sistema de cupones completo
- Configuracion de delivery
- Cajas registradoras
- Turnos/Day parts

**Cashier App:**

- Login de cajeros
- Pedidos en tiempo real (Supabase Realtime)
- Board kanban (No confirmados > Confirmados > En preparacion > Listos > Enviados)
- Constructor de pedidos y checkout
- Division de pagos (multiples metodos)
- Cupones en POS
- Chat WhatsApp con clientes
- Apertura/cierre de caja
- Arqueo de caja
- Analiticas basicas de ordenes

**Customer App:**

- Landing con seleccion de sucursal
- Menu con tabs por categoria raiz y subcategorias
- Modal de producto con modifiers agrupados y seleccion de mitades (allow_half)
- Carrito persistente en sessionStorage
- Checkout con validacion
- Confirmacion de pedido
- Branding personalizado por sucursal

---

## Roadmap - Features to Implement

### Customer App Improvements (Priority: HIGH)

- [ ] **Login/Registro de clientes**
  - Autenticacion via Supabase Auth
  - Registro con email/telefono
  - Login social (Google)
  - Perfil del cliente

- [ ] **Historial de compras**
  - Pagina de pedidos anteriores
  - Detalle de cada pedido
  - Reordenar desde historial
  - Estados: pendiente, confirmado, en camino, entregado

- [ ] **Sistema de puntos/loyalty**
  - Puntos por cada compra (configurable $x = 1 punto)
  - Canje de puntos por descuentos o productos gratis
  - Visualizacion de saldo de puntos
  - Historial de puntos ganados/canjeados

- [ ] **Autocompletado de datos**
  - Guardar direccion en perfil
  - Telefono y nombre prellenados
  - Multiple direcciones guardadas
  - Seleccionar direccion favorita

- [ ] **Tracking de pedidos**
  - Seguimiento en tiempo real del pedido
  - Notificaciones de estado
  - Estimacion de tiempo de entrega

- [ ] **Favoritos**
  - Marcar productos como favoritos
  - Pagina de favoritos
  - Agregar favoritos directamente al carrito

### Cashier App Improvements (Priority: HIGH)

- [x] **Auto-refresh de pedidos**
  - Refrescar automaticamente cuando cliente hace pedido
  - Badge de nuevos pedidos

- [x] **KDS (Kitchen Display System)**
  - Vista de cocina para mostrar pedidos en preparacion
  - Timer por pedido con colores (verde <10min, amarillo <20min, rojo >20min)
  - Marcar items como listos con WhatsApp automatico para takeaway
  - Timer por pedido
  - Marcar items como listos
  - Alertas de demora

- [ ] **Reportes de caja**
  - Reporte X (parcial)
  - Reporte Z (cierre)
  - Resumen de ventas por metodo de pago
  - Resumen de cupones aplicados

- [ ] **Notas globales de orden**
  - Notas que aplican a toda la orden
  - Notas por producto (ya existe)

### Admin App Improvements (Priority: MEDIUM)

- [ ] **Inventario/Stock**
  - Control de stock por producto
  - Alertas de stock bajo
  - Historial de inventario

- [ ] **Reportes y Analiticas**
  - Reporte de ventas diarias/semanales/mensuales
  - Productos mas vendidos
  - Ganancias y costos
  - Graficos y visualizaciones

- [ ] **Modulo de empleados**
  - CRUD de usuarios
  - Roles y permisos
  - Historial de actividad

- [ ] **Rutas pendientes**
  - `/users` - Gestion de usuarios
  - `/settings` - Configuraciones generales

- [ ] **Sistema de mesas/reservas**
  - Gestion de mesas
  - Sistema de reservas
  - Estado de mesas en tiempo real

### Future Enhancements (Priority: LOW)

- [ ] Pagos online (MercadoPago, Stripe)
- [ ] Notificaciones push
- [ ] Multi-idioma
- [ ] 2FA
- [ ] Modulo de gastos
- [ ] Integracion con impresoras de tickets
- [ ] API para integraciones de terceros
