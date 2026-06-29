"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, Store, Users, Tags, Package, Variable,
  ChefHat, Box, ShoppingBag, ShoppingCart, TicketPercent,
  Bike, Clock, CookingPot, Printer, Truck, CreditCard, Kanban,
  UserCog, Award, Zap, Settings, LogOut, Menu,
  DollarSign, Receipt, FileText, Truck as TruckIcon, BarChart3, Star, Shield, Gift,
  Calculator, Link as LinkIcon,
  CalendarCheck, MapPin,
  Upload, Cake, Trophy,
  RadioTower,
  Megaphone, Brain, Target,
  Wallet,
  BadgeDollarSign,
  Landmark,
  QrCode,
  Camera,
  Search,
  MessageCircle,
} from "lucide-react";

const NAV_PERMISSIONS: Record<string, string> = {
  "/dashboard": "admin.dashboard.view",
  "/branches": "admin.branches.view",
  "/customers": "admin.customers.view",
  "/whatsapp": "admin.customers.view",
  "/marketing-ai": "admin.customers.view",
  "/ads": "admin.ads.view",
  "/anniversary": "admin.reservations.view",
  "/prode": "admin.reservations.view",
  "/categories": "admin.categories.view",
  "/products": "admin.products.view",
  "/qr-menu": "admin.products.view",
  "/delivery-menu": "admin.products.view",
  "/catalog-menu": "admin.catalog_orders.manage",
  "/variant-types": "admin.products.view",
  "/ingredients": "admin.ingredients.view",
  "/packaging": "admin.recipes.view",
  "/recipes": "admin.recipes.view",
  "/product-ingredients": "admin.recipes.view",
  "/combos": "admin.combos.view",
  "/product-extras": "admin.products.view",
  "/upsells": "admin.products.view",
  "/featured-order": "admin.featured.view",
  "/loyalty": "admin.loyalty.view",
  "/promotions": "admin.coupons.view",
  "/customer-popups": "admin.settings.view",
  "/coupons": "admin.coupons.view",
  "/reservations": "admin.reservations.view",
  "/kitchens": "admin.settings.view",
  "/printers": "admin.printers.view",
  "/flash-sales": "admin.flashsales.view",
  "/kds-config": "admin.kdsconfig.view",
  "/ventas": "admin.ventas.view",
  "/catalog-orders": "admin.catalog_orders.view",
  "/ventas/productos": "admin.ventas.view",
  "/arqueos": "admin.ventas.view",
  "/central-cash": "admin.central_cash.view",
  "/petty-cash": "admin.central_cash.view",
  "/mercadopago-treasury": "admin.mercadopago.view",
  "/debts": "admin.debts.view",
  "/reporte-diario": "admin.reports.view",
  "/reports": "admin.reports.view",
  "/expenses": "admin.expenses.view",
  "/expense-categories": "admin.expenses.view",
  "/suppliers": "admin.suppliers.view",
  "/purchases": "admin.purchases.view",
  "/purchase-categories": "admin.purchases.view",
  "/roles": "admin.users.view",
  "/users": "admin.users.view",
  "/employees": "admin.employees.view",
  "/delivery-settings": "admin.delivery.view",
  "/delivery-zones": "admin.delivery.view",
  "/payment-methods": "admin.paymentmethods.view",
  "/settings/financial": "admin.reports.view",
  "/customer-hub": "admin.customerhub.view",
  "/settings": "admin.settings.view",
};

const BASE_ADMIN_HIDDEN = new Set([
  "/roles",
  "/users",
  "/employees",
  "/central-cash",
  "/petty-cash",
  "/mercadopago-treasury",
  "/debts",
  "/settings/financial",
  "/settings",
]);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<{ name?: string } | null>(null);
  const [userRole, setUserRole] = useState("");
  const [permissionKeys, setPermissionKeys] = useState<string[] | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    async function loadUser() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) { router.push("/login"); return; }

      const { data: userRecord } = await supabase
        .from("users")
        .select("*, tenants(*), roles(role_permissions(permissions(key)))")
        .eq("id", user.id)
        .single();
      if (!userRecord) { router.push("/dashboard"); return; }

      setTenant(userRecord.tenants);
      setUserRole(userRecord.role || "");
      if (userRecord.role_id) {
        const keys = (userRecord.roles?.role_permissions || [])
          .map((row: any) => row.permissions?.key)
          .filter(Boolean);
        setPermissionKeys(keys);
      } else {
        setPermissionKeys(null);
      }
      setLoading(false);
    }
    loadUser();
  }, []);

  const navItems = [
    { section: "Gestión", items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/branches", label: "Sucursales", icon: Store },
      { href: "/customers", label: "Clientes", icon: Users },
      { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
      { href: "/marketing-ai", label: "Marketing AI", icon: Brain },
      { href: "/ads", label: "Ads Center", icon: Target },
      { href: "/anniversary", label: "Cumple Mordisco", icon: Cake },
      { href: "/prode", label: "Prode Mordisco", icon: Trophy },
      { href: "/categories", label: "Categorías", icon: Tags },
      { href: "/products", label: "Productos", icon: Package },
      { href: "/qr-menu", label: "Menu QR", icon: QrCode },
      { href: "/delivery-menu", label: "Menu Delivery", icon: Truck },
      { href: "/catalog-menu", label: "Menu Catalogo", icon: ShoppingBag },
      { href: "/variant-types", label: "Tipos de Variante", icon: Variable },
    ]},
    { section: "Ingredientes", items: [
      { href: "/ingredients", label: "Ingredientes", icon: ChefHat },
      { href: "/packaging", label: "Packaging", icon: Box },
      { href: "/recipes", label: "Recetas", icon: Package },
      { href: "/product-ingredients", label: "Ingredientes x Producto", icon: Box },
      { href: "/combos", label: "Combos", icon: ShoppingBag },
      { href: "/product-extras", label: "Extras x Producto", icon: ShoppingCart },
      { href: "/upsells", label: "Sugerencias Checkout", icon: ShoppingBag },
    ]},
    { section: "Operaciones", items: [
      { href: "/tables", label: "Mesas", icon: LayoutDashboard },
      { href: "/evento", label: "Evento", icon: Gift },
      { href: "/featured-order", label: "Orden Destacados", icon: Star },
      { href: "/loyalty", label: "Fidelización", icon: Award },
      { href: "/promotions", label: "Promociones", icon: Megaphone },
      { href: "/customer-popups", label: "Popups Cliente", icon: Megaphone },
      { href: "/coupons", label: "Cupones", icon: TicketPercent },
      { href: "/riders", label: "Repartidores", icon: Bike },
      { href: "/reservations", label: "Reservas", icon: CalendarCheck },
      { href: "/day-parts", label: "Turnos", icon: Clock },
      { href: "/cameras", label: "Camaras", icon: Camera },
      { href: "/kitchens", label: "Cocinas", icon: CookingPot },
      { href: "/printers", label: "Impresoras", icon: Printer },
      { href: "/flash-sales", label: "Ofertas Flash", icon: Zap },
      { href: "/kds-config", label: "KDS Config", icon: Kanban },
      { href: "/realtime-diagnostics", label: "Realtime KDS", icon: RadioTower },
    ]},
    { section: "Finanzas", items: [
      { href: "/ventas", label: "Ventas", icon: DollarSign },
      { href: "/catalog-orders", label: "Pedidos", icon: ShoppingBag },
      { href: "/ventas/productos", label: "Ventas x Producto", icon: BarChart3 },
      { href: "/arqueos", label: "Arqueos de Caja", icon: Calculator },
      { href: "/central-cash", label: "Caja Central", icon: Wallet },
      { href: "/petty-cash", label: "Caja Chica", icon: Wallet },
      { href: "/mercadopago-treasury", label: "Mercado Pago", icon: Landmark },
      { href: "/debts", label: "Deudas", icon: BadgeDollarSign },
      { href: "/reporte-diario", label: "Reporte Diario", icon: FileText },
      { href: "/reports", label: "Reportes", icon: Receipt },
      { href: "/migration", label: "Importar ventas", icon: Upload },
      { href: "/expenses", label: "Gastos", icon: Receipt },
      { href: "/expense-categories", label: "Cat. Gastos", icon: Tags },
      { href: "/suppliers", label: "Proveedores", icon: TruckIcon },
    ]},
    { section: "Stock", items: [
      { href: "/purchases", label: "Compras", icon: FileText },
      { href: "/purchase-categories", label: "Cat. Compras", icon: Tags },
    ]},
    { section: "Configuración", items: [
      { href: "/roles", label: "Roles y Permisos", icon: Shield },
      { href: "/users", label: "Usuarios", icon: UserCog },
      { href: "/employees", label: "Empleados", icon: Users },
      { href: "/delivery-settings", label: "Delivery", icon: Truck },
      { href: "/delivery-zones", label: "Zonas Delivery", icon: MapPin },
      { href: "/payment-methods", label: "Métodos de Pago", icon: CreditCard },
      { href: "/cash_registers", label: "Cajas", icon: Calculator },
      { href: "/settings/financial", label: "Finanzas", icon: Calculator },
      { href: "/media-library", label: "Mis Imagenes", icon: Upload },
      { href: "/customer-hub", label: "Hub Cliente", icon: LinkIcon },
      { href: "/settings", label: "Configuración", icon: Settings },
    ]},
  ];

  const permittedNavItems = useMemo(() => {
    const canSee = (href: string) => {
      if (["owner", "manager"].includes(userRole)) return true;
      if (userRole === "admin" && permissionKeys === null && BASE_ADMIN_HIDDEN.has(href)) return false;
      const permission = NAV_PERMISSIONS[href];
      if (!permission) return true;
      if (permissionKeys === null) return true;
      return permissionKeys.includes(permission);
    };

    return navItems
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => canSee(item.href)),
      }))
      .filter((section) => section.items.length > 0);
  }, [navItems, permissionKeys, userRole]);

  const filteredNavItems = useMemo(() => {
    const query = sidebarSearch.trim().toLowerCase();
    if (!query) return permittedNavItems;

    return permittedNavItems
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          `${section.section} ${item.label} ${item.href}`.toLowerCase().includes(query),
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [permittedNavItems, sidebarSearch]);

  if (loading) return <div className="h-screen flex items-center justify-center bg-gray-950 text-gray-400">Cargando...</div>;

  return (
    <div className="h-screen flex bg-gray-950 text-white">
      {/* Sidebar */}
      <aside className={`${collapsed ? "w-16" : "w-64"} bg-gray-900 border-r border-gray-800 flex flex-col transition-all duration-200 overflow-hidden flex-shrink-0`}>
        {/* Header */}
        <div className="h-14 flex items-center gap-3 px-4 border-b border-gray-800 flex-shrink-0">
          {!collapsed && <span className="font-bold text-lg truncate">{tenant?.name || "Kablam"}</span>}
          <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 rounded-lg hover:bg-gray-800 transition ml-auto">
            <Menu size={18} />
          </button>
        </div>

        {!collapsed && (
          <div className="border-b border-gray-800 p-2">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                className="w-full rounded-lg border border-gray-800 bg-gray-950 py-2 pl-9 pr-3 text-sm text-gray-100 outline-none placeholder:text-gray-600 focus:border-gray-600"
                value={sidebarSearch}
                onChange={(event) => setSidebarSearch(event.target.value)}
                placeholder="Buscar seccion..."
              />
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredNavItems.length === 0 && !collapsed ? (
            <div className="px-3 py-6 text-center text-xs text-gray-500">
              Sin resultados
            </div>
          ) : filteredNavItems.map((section) => (
            <div key={section.section}>
              {!collapsed && (
                <div className="px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  {section.section}
                </div>
              )}
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link key={item.href} href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                      active
                        ? "bg-white/10 text-white font-medium"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                    }`}
                    title={collapsed ? item.label : ""}
                  >
                    <item.icon size={18} className="flex-shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-2 border-t border-gray-800">
          <button onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-white/5 transition"
          >
            <LogOut size={18} />
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-gray-950 text-gray-100">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
