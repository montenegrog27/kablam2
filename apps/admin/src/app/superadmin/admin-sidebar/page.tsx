"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Loader2, Eye, EyeOff, Search } from "lucide-react";

const ALL_NAV_ITEMS = [
  {
    section: "Gestión",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/branches", label: "Sucursales" },
      { href: "/customers", label: "Clientes" },
      { href: "/whatsapp", label: "WhatsApp" },
      { href: "/marketing-ai", label: "Marketing AI" },
      { href: "/ads", label: "Ads Center" },
      { href: "/anniversary", label: "Cumple Mordisco" },
      { href: "/prode", label: "Prode Mordisco" },
      { href: "/categories", label: "Categorías" },
      { href: "/products", label: "Productos" },
      { href: "/qr-menu", label: "Menu QR" },
      { href: "/delivery-menu", label: "Menu Delivery" },
      { href: "/catalog-menu", label: "Menu Catalogo" },
      { href: "/variant-types", label: "Tipos de Variante" },
    ],
  },
  {
    section: "Ingredientes",
    items: [
      { href: "/ingredients", label: "Ingredientes" },
      { href: "/packaging", label: "Packaging" },
      { href: "/recipes", label: "Recetas" },
      { href: "/product-ingredients", label: "Ingredientes x Producto" },
      { href: "/combos", label: "Combos" },
      { href: "/product-extras", label: "Extras x Producto" },
      { href: "/upsells", label: "Sugerencias Checkout" },
    ],
  },
  {
    section: "Operaciones",
    items: [
      { href: "/tables", label: "Mesas" },
      { href: "/evento", label: "Evento" },
      { href: "/featured-order", label: "Orden Destacados" },
      { href: "/loyalty", label: "Fidelización" },
      { href: "/promotions", label: "Promociones" },
      { href: "/customer-popups", label: "Popups Cliente" },
      { href: "/coupons", label: "Cupones" },
      { href: "/riders", label: "Repartidores" },
      { href: "/reservations", label: "Reservas" },
      { href: "/day-parts", label: "Turnos" },
      { href: "/cameras", label: "Camaras" },
      { href: "/kitchens", label: "Cocinas" },
      { href: "/printers", label: "Impresoras" },
      { href: "/flash-sales", label: "Ofertas Flash" },
      { href: "/kds-config", label: "KDS Config" },
      { href: "/realtime-diagnostics", label: "Realtime KDS" },
    ],
  },
  {
    section: "Finanzas",
    items: [
      { href: "/ventas", label: "Ventas" },
      { href: "/catalog-orders", label: "Pedidos" },
      { href: "/ventas/productos", label: "Ventas x Producto" },
      { href: "/arqueos", label: "Arqueos de Caja" },
      { href: "/central-cash", label: "Caja Central" },
      { href: "/petty-cash", label: "Caja Chica" },
      { href: "/mercadopago-treasury", label: "Mercado Pago" },
      { href: "/debts", label: "Deudas" },
      { href: "/reporte-diario", label: "Reporte Diario" },
      { href: "/reports", label: "Reportes" },
      { href: "/migration", label: "Importar ventas" },
      { href: "/expenses", label: "Gastos" },
      { href: "/expense-categories", label: "Cat. Gastos" },
      { href: "/suppliers", label: "Proveedores" },
      { href: "/purchases", label: "Compras" },
      { href: "/purchase-categories", label: "Cat. Compras" },
    ],
  },
  {
    section: "Configuración",
    items: [
      { href: "/roles", label: "Roles y Permisos" },
      { href: "/users", label: "Usuarios" },
      { href: "/employees", label: "Empleados" },
      { href: "/delivery-settings", label: "Delivery" },
      { href: "/delivery-zones", label: "Zonas Delivery" },
      { href: "/payment-methods", label: "Métodos de Pago" },
      { href: "/cash_registers", label: "Cajas" },
      { href: "/settings/financial", label: "Finanzas" },
      { href: "/media-library", label: "Mis Imagenes" },
      { href: "/customer-hub", label: "Hub Cliente" },
      { href: "/settings", label: "Configuración" },
    ],
  },
];

type Tenant = { id: string; name: string };

export default function AdminSidebarConfig() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase
      .from("tenants")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        setTenants(data || []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedTenant) return;
    supabase
      .from("admin_sidebar_hidden")
      .select("nav_key")
      .eq("tenant_id", selectedTenant)
      .then(({ data }) => setHidden(new Set((data || []).map((r) => r.nav_key))));
  }, [selectedTenant]);

  const toggleItem = async (navKey: string, isHidden: boolean) => {
    setToggling(navKey);
    if (isHidden) {
      await supabase
        .from("admin_sidebar_hidden")
        .delete()
        .eq("tenant_id", selectedTenant)
        .eq("nav_key", navKey);
      setHidden((prev) => { const next = new Set(prev); next.delete(navKey); return next; });
    } else {
      await supabase
        .from("admin_sidebar_hidden")
        .insert({ tenant_id: selectedTenant, nav_key: navKey });
      setHidden((prev) => { const next = new Set(prev); next.add(navKey); return next; });
    }
    setToggling(null);
  };

  const hiddenCount = hidden.size;
  const totalCount = ALL_NAV_ITEMS.reduce((s, sec) => s + sec.items.length, 0);

  const filteredSections = ALL_NAV_ITEMS.map((sec) => ({
    ...sec,
    items: sec.items.filter(
      (item) =>
        !search ||
        item.label.toLowerCase().includes(search.toLowerCase()) ||
        item.href.toLowerCase().includes(search.toLowerCase()),
    ),
  })).filter((sec) => sec.items.length > 0);

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Sidebar Admin</h1>
      <p className="text-gray-600 mb-8">
        Mostrar u ocultar elementos del sidebar de /admin para usuarios con rol &quot;admin&quot;. Los usuarios owner/manager siempre ven todo.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500"><Loader2 className="animate-spin" size={18} /> Cargando...</div>
      ) : (
        <>
          <select
            value={selectedTenant}
            onChange={(e) => setSelectedTenant(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 mb-6 shadow-sm"
          >
            <option value="">Seleccionar tenant...</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          {selectedTenant && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="relative flex-1 max-w-xs">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar..."
                    className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-gray-500"
                  />
                </div>
                <span className="text-xs text-gray-500">
                  {hiddenCount}/{totalCount} ocultos
                </span>
              </div>

              <div className="space-y-4">
                {filteredSections.map((section) => (
                  <div key={section.section} className="bg-white border rounded-xl overflow-hidden shadow-sm">
                    <div className="px-5 py-3 bg-gray-50 border-b text-sm font-semibold text-gray-700">
                      {section.section}
                    </div>
                    <div className="divide-y">
                      {section.items.map((item) => {
                        const isHidden = hidden.has(item.href);
                        const isToggling = toggling === item.href;
                        return (
                          <div key={item.href} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition">
                            <div>
                              <span className="text-sm font-medium text-gray-800">{item.label}</span>
                              <span className="text-xs text-gray-400 ml-2 font-mono">{item.href}</span>
                            </div>
                            <button
                              onClick={() => toggleItem(item.href, isHidden)}
                              disabled={!!isToggling}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                                isHidden
                                  ? "bg-red-100 text-red-700 hover:bg-red-200"
                                  : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                              } disabled:opacity-50`}
                            >
                              {isToggling ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : isHidden ? (
                                <EyeOff size={14} />
                              ) : (
                                <Eye size={14} />
                              )}
                              {isHidden ? "Oculto" : "Visible"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
