"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { GripVertical, ChevronUp, ChevronDown, Star } from "lucide-react";

export default function FeaturedOrderPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: r } = await supabase.from("users").select("tenant_id").eq("id", u.user.id).single();
    if (!r) return;
    setTenantId(r.tenant_id);

    const { data } = await supabase
      .from("products")
      .select("id, name, is_featured, featured_order, product_variants(image_url)")
      .eq("tenant_id", r.tenant_id)
      .eq("is_featured", true)
      .order("featured_order", { ascending: true, nullsFirst: false })
      .order("name");

    setProducts(data || []);
    setLoading(false);
  };

  const moveUp = async (idx: number) => {
    if (idx === 0) return;
    const items = [...products];
    [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
    setProducts(items);
    await saveOrder(items);
  };

  const moveDown = async (idx: number) => {
    if (idx === products.length - 1) return;
    const items = [...products];
    [items[idx], items[idx + 1]] = [items[idx + 1], items[idx]];
    setProducts(items);
    await saveOrder(items);
  };

  const saveOrder = async (items: any[]) => {
    for (let i = 0; i < items.length; i++) {
      await supabase.from("products").update({ featured_order: (i + 1) * 10 }).eq("id", items[i].id);
    }
  };

  const removeFeatured = async (id: string) => {
    await supabase.from("products").update({ is_featured: false, featured_order: 0 }).eq("id", id);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Orden de Destacados</h1>
          <p className="text-sm text-gray-500 mt-0.5">Arrastrá o mové los productos para ordenar el carrusel del customer</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500 text-sm">Cargando...</div>
      ) : products.length === 0 ? (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-12 text-center">
          <Star size={40} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">No hay productos destacados</p>
          <p className="text-gray-600 text-xs mt-1">Marcá productos como "Destacado" en la sección Productos para que aparezcan acá</p>
        </div>
      ) : (
        <div className="space-y-2">
          {products.map((p, idx) => (
            <div key={p.id} className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 flex items-center gap-4">
              <div className="flex flex-col gap-0.5">
                <button onClick={() => moveUp(idx)} disabled={idx === 0} className="p-0.5 rounded hover:bg-gray-800 text-gray-500 disabled:opacity-20">
                  <ChevronUp size={14} />
                </button>
                <button onClick={() => moveDown(idx)} disabled={idx === products.length - 1} className="p-0.5 rounded hover:bg-gray-800 text-gray-500 disabled:opacity-20">
                  <ChevronDown size={14} />
                </button>
              </div>
              <div className="w-1 h-8 bg-gray-700 rounded-full" />
              <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-800">
                {p.product_variants?.[0]?.image_url ? (
                  <img src={p.product_variants[0].image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-lg">🍔</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-100 truncate">{p.name}</p>
                <p className="text-xs text-gray-500">Posición {idx + 1}</p>
              </div>
              <span className="text-xs text-gray-600 tabular-nums mr-2">
                #{idx + 1}
              </span>
              <button onClick={() => removeFeatured(p.id)} className="px-2 py-1 text-xs rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 transition">
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 bg-gray-900 border border-gray-700 rounded-xl p-4">
        <p className="text-xs text-gray-400">
          <strong className="text-gray-300">Vista previa del orden:</strong> Los productos se mostrarán en este orden en el carrusel de destacados de la app del cliente.
          Usá las flechas para subir/bajar cada producto.
        </p>
      </div>
    </div>
  );
}
