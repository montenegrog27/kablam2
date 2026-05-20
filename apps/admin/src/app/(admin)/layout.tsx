"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, Store, Users, Tags, Package, Variable,
  ChefHat, Box, ShoppingBag, ShoppingCart, TicketPercent,
  Bike, Clock, CookingPot, Printer, Truck, CreditCard, Kanban,
  UserCog, Award, Zap, Settings, LogOut, ChevronDown, Menu,
  DollarSign, TrendingUp, Receipt, FileText, Truck as TruckIcon, BarChart3, Star,
} from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<any>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
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

  const toggle = (key: string) => setOpenMenus((prev) => ({ ...prev, [key]: !prev[key] }));

  const navItems = [
    { section: "Gestión", items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/branches", label: "Sucursales", icon: Store },
      { href: "/customers", label: "Clientes", icon: Users },
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
      { href: "/featured-order", label: "Orden Destacados", icon: Star },
      { href: "/loyalty", label: "Fidelización", icon: Award },
      { href: "/coupons", label: "Cupones", icon: TicketPercent },
      { href: "/riders", label: "Repartidores", icon: Bike },
      { href: "/day-parts", label: "Turnos", icon: Clock },
      { href: "/kitchens", label: "Cocinas", icon: CookingPot },
      { href: "/printers", label: "Impresoras", icon: Printer },
      { href: "/flash-sales", label: "Ofertas Flash", icon: Zap },
      { href: "/kds-config", label: "KDS Config", icon: Kanban },
    ]},
    { section: "Finanzas", items: [
      { href: "/ventas", label: "Ventas", icon: DollarSign },
      { href: "/ventas/productos", label: "Ventas x Producto", icon: BarChart3 },
      { href: "/reporte-diario", label: "Reporte Diario", icon: FileText },
      { href: "/reports", label: "Reportes", icon: Receipt },
      { href: "/expenses", label: "Gastos", icon: Receipt },
      { href: "/expense-categories", label: "Cat. Gastos", icon: Tags },
      { href: "/suppliers", label: "Proveedores", icon: TruckIcon },
    ]},
    { section: "Stock", items: [
      { href: "/purchases", label: "Compras", icon: FileText },
      { href: "/purchase-categories", label: "Cat. Compras", icon: Tags },
    ]},
    { section: "Configuración", items: [
      { href: "/delivery-settings", label: "Delivery", icon: Truck },
      { href: "/payment-methods", label: "Métodos de Pago", icon: CreditCard },
      { href: "/users", label: "Usuarios", icon: UserCog },
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
