"use client";

import { useEffect, useState } from "react";
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
  Megaphone, Brain,
  Wallet,
  BadgeDollarSign,
  Landmark,
} from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<{ name?: string } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    async function loadUser() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user) { router.push("/login"); return; }

      const { data: userRecord } = await supabase
        .from("users").select("*, tenants(*)").eq("id", user.id).single();
      if (!userRecord) { router.push("/dashboard"); return; }

      setTenant(userRecord.tenants);
      setLoading(false);
    }
    loadUser();
  }, []);

  const navItems = [
    { section: "Gestión", items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/branches", label: "Sucursales", icon: Store },
      { href: "/customers", label: "Clientes", icon: Users },
      { href: "/marketing-ai", label: "Marketing AI", icon: Brain },
      { href: "/anniversary", label: "Cumple Mordisco", icon: Cake },
      { href: "/prode", label: "Prode Mordisco", icon: Trophy },
      { href: "/categories", label: "Categorías", icon: Tags },
      { href: "/products", label: "Productos", icon: Package },
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
      { href: "/kitchens", label: "Cocinas", icon: CookingPot },
      { href: "/printers", label: "Impresoras", icon: Printer },
      { href: "/flash-sales", label: "Ofertas Flash", icon: Zap },
      { href: "/kds-config", label: "KDS Config", icon: Kanban },
      { href: "/realtime-diagnostics", label: "Realtime KDS", icon: RadioTower },
    ]},
    { section: "Finanzas", items: [
      { href: "/ventas", label: "Ventas", icon: DollarSign },
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
      { href: "/settings/financial", label: "Finanzas", icon: Calculator },
      { href: "/media-library", label: "Mis Imagenes", icon: Upload },
      { href: "/customer-hub", label: "Hub Cliente", icon: LinkIcon },
      { href: "/settings", label: "Configuración", icon: Settings },
    ]},
  ];

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

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {navItems.map((section) => (
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
