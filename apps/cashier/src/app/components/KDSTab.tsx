"use client";

import { useEffect, useState, useRef } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Clock, Check, ChefHat, Package, Bike, Play, ChevronDown, ChevronUp } from "lucide-react";
import { useCurrentBranch } from "../(cashier)/context/BranchContext";

export default function KDSTab() {
  const { branchId, tenantId } = useCurrentBranch();
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cookingItems, setCookingItems] = useState<Record<string, Set<number>>>({});
  const [kdsIngredients, setKdsIngredients] = useState<any[]>([]);
  const [recipeMap, setRecipeMap] = useState<Record<string, any[]>>({});
  const [now, setNow] = useState(Date.now());
  const [showConfirmed, setShowConfirmed] = useState(false);
  const preparingRef = useRef<HTMLDivElement>(null);

  const confirmed = allOrders.filter((o) => o.status === "confirmed");
  const preparing = allOrders.filter((o) => o.status === "preparing");
  const ready = allOrders.filter((o) => o.status === "ready");

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Scroll automático al primer preparing cuando llega uno nuevo
  useEffect(() => {
    if (preparing.length > 0) {
      preparingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [preparing.length]);

  const loadOrders = async () => {
    if (!branchId) return;
    const { data } = await supabase
      .from("orders")
      .select("*, order_items(*, products(*))")
      .eq("branch_id", branchId)
      .in("status", ["confirmed", "preparing", "ready"])
      .order("created_at", { ascending: true });
    setAllOrders(data || []);
    // Also load recipes for all variants in these orders
    const variantIds = new Set<string>();
    (data || []).forEach((o: any) => (o.order_items || []).forEach((i: any) => {
      if (i.variant_id) variantIds.add(i.variant_id);
    }));
    if (variantIds.size > 0) {
      const { data: recipes } = await supabase
        .from("product_recipes")
        .select("variant_id, quantity, ingredients(id, name)")
        .in("variant_id", [...variantIds]);
      const map: Record<string, any[]> = {};
      (recipes || []).forEach((r) => {
        if (!map[r.variant_id]) map[r.variant_id] = [];
        map[r.variant_id].push(r);
      });
      setRecipeMap(map);
    }
  };

  const loadKdsConfig = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("kds_config")
      .select("*, ingredients(id, name)")
      .eq("tenant_id", tenantId)
      .order("sort_order");
    setKdsIngredients(data || []);
  };

  useEffect(() => {
    if (!branchId) return;
    loadOrders();
    loadKdsConfig();

    const channel = supabase.channel(`kds-realtime-${branchId}`);
    channel
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: `branch_id=eq.${branchId}` }, () => loadOrders())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `branch_id=eq.${branchId}` }, () => loadOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [branchId, tenantId]);

  const getRecipe = (item: any) => recipeMap[item.variant_id || item.product_id] || [];

  // Calcular total de ingredientes en preparing
  const totalIngredients: Record<string, { count: number; icon: string; name: string }> = {};
  preparing.forEach((order) => {
    (order.order_items || []).forEach((item: any) => {
      getRecipe(item).forEach((r: any) => {
        const kdsItem = kdsIngredients.find((k) => k.ingredient_id === r.ingredient_id);
        if (kdsItem) {
          const key = r.ingredient_id;
          if (!totalIngredients[key]) totalIngredients[key] = { count: 0, icon: kdsItem.icon || "🍔", name: kdsItem.name || r.ingredients?.name };
          totalIngredients[key].count += (r.quantity || 0) * (item.quantity || 1);
        }
      });
    });
  });

  const moveToPreparing = async (orderId: string) => {
    setLoading(true);
    await supabase.from("orders").update({ status: "preparing" }).eq("id", orderId);
    setLoading(false);
  };

  const markAsReady = async (order: any) => {
    setLoading(true);
    await supabase.from("orders").update({ status: "ready" }).eq("id", order.id);
    if (order.type === "takeaway") {
      const { data: conversation } = await supabase.from("conversations").select("*").eq("customer_id", order.customer_id).single();
      if (conversation) {
        await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: conversation.id, orderId: order.id, type: "template", templateName: "aviso_ready_takeaway" }) });
      }
    }
    setLoading(false);
  };

  const toggleCooking = (orderId: string, index: number) => {
    setCookingItems((prev) => {
      const s = new Set(prev[orderId] || []);
      s.has(index) ? s.delete(index) : s.add(index);
      return { ...prev, [orderId]: s };
    });
  };

  const getPreparableItems = (order: any) =>
    (order.order_items || []).filter((i: any) => i.products?.is_preparable !== false);

  const allItemsCooked = (order: any) => {
    const preparable = getPreparableItems(order);
    const cooked = cookingItems[order.id] || new Set();
    return preparable.length > 0 && preparable.every((_: any, i: number) => cooked.has(i));
  };

  const calcIngredients = (order: any) => {
    const counts: Record<string, { count: number; icon: string; name: string }> = {};
    (order.order_items || []).forEach((item: any) => {
      getRecipe(item).forEach((r: any) => {
        const kdsItem = kdsIngredients.find((k) => k.ingredient_id === r.ingredient_id);
        if (kdsItem) {
          const key = r.ingredient_id;
          if (!counts[key]) counts[key] = { count: 0, icon: kdsItem.icon || "🍔", name: kdsItem.name || r.ingredients?.name };
          counts[key].count += (r.quantity || 0) * (item.quantity || 1);
        }
      });
    });
    return Object.entries(counts);
  };

  const formatTime = (createdAt: string) => {
    const diff = Math.floor((now - new Date(createdAt).getTime()) / 60000);
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const getTimeColor = (createdAt: string) => {
    const diff = Math.floor((now - new Date(createdAt).getTime()) / 60000);
    if (diff < 10) return "text-green-400";
    if (diff < 20) return "text-yellow-400";
    return "text-red-400 font-bold animate-pulse";
  };

  const OrderCard = ({ order, compact = false }: { order: any; compact?: boolean }) => {
    const minutes = Math.floor((now - new Date(order.created_at).getTime()) / 60000);
    const isReady = order.status === "ready";
    const ingredientCounts = calcIngredients(order);

    return (
      <div className={`bg-gray-900 rounded-xl border ${isReady ? "border-green-900/40 opacity-50" : order.status === "preparing" ? "border-blue-500/30" : "border-gray-800"} p-4 space-y-3 transition-all ${compact ? "py-2 px-3" : ""}`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`font-bold ${compact ? "text-sm" : "text-base"} text-white`}>#{order.id.slice(-6).toUpperCase()}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${order.type === "takeaway" ? "bg-blue-600/20 text-blue-400" : "bg-green-600/20 text-green-400"}`}>
              {order.type === "takeaway" ? "Retiro" : "Delivery"}
            </span>
            {!compact && (
              <span className="text-xs text-gray-500 truncate">{order.customer_name}</span>
            )}
          </div>
          <div className={`flex items-center gap-1 text-sm font-bold flex-shrink-0 ${getTimeColor(order.created_at)}`}>
            <Clock size={compact ? 12 : 14} />
            <span>{formatTime(order.created_at)}</span>
          </div>
        </div>

        {/* Ingredient counters */}
        {!compact && ingredientCounts.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {ingredientCounts.map(([id, info]) => (
              <span key={id} className="text-xs px-2 py-0.5 bg-gray-800 rounded-full text-gray-300 flex items-center gap-1">
                {info.icon} {info.count}
              </span>
            ))}
          </div>
        )}

        {/* Items */}
        {!compact && (() => {
          const preparableItems = order.order_items?.filter((i: any) => i.products?.is_preparable !== false) || [];
          const skippedNonPreparable = (order.order_items?.length || 0) - preparableItems.length;
          return (
            <>
              {preparableItems.slice(0, 6).map((item: any, i: number) => {
                const isCooked = (cookingItems[order.id] || new Set()).has(i);
                const canToggle = order.status === "preparing";
                const extras = item.extras || [];
                return (
                  <div key={item.id}>
                    <div onClick={() => canToggle && toggleCooking(order.id, i)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition cursor-pointer ${
                        isReady ? "bg-gray-800/30 text-gray-500" :
                        isCooked ? "bg-orange-500/15 text-orange-300 border border-orange-500/20" :
                        "bg-gray-800 text-gray-300 hover:bg-gray-750"
                      }`}
                    >
                      {isReady ? <Check size={13} className="text-green-500" /> : isCooked ? <ChefHat size={13} className="text-orange-400" /> : <span className="w-3 h-3 rounded-full border-2 border-gray-600" />}
                      <span className="font-semibold">{item.quantity}x</span>
                      <span className="truncate">{item.products?.name || "Producto"}</span>
                    </div>
                    {extras.length > 0 && (
                      <div className="ml-9 flex flex-wrap gap-1 mt-0.5">
                        {extras.map((ex: any, ei: number) => (
                          <span key={ei} className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            ex.type === "sin" ? "bg-red-900/30 text-red-300" : "bg-emerald-900/30 text-emerald-300"
                          }`}>
                            {ex.type === "sin" ? `✕ ${ex.name}` : `+ ${ex.name}`}
                          </span>
                        ))}
                      </div>
                    )}
                    {item.note && <p className="text-yellow-500/80 text-xs ml-9 mt-0.5">📝 {item.note}</p>}
                  </div>
                );
              })}
              {skippedNonPreparable > 0 && (
                <p className="text-xs text-gray-600 text-center">+{skippedNonPreparable} producto(s) no preparable(s)</p>
              )}
            </>
          );
        })()}
        {!compact && (order.order_items?.length || 0) > 6 && (
          <p className="text-xs text-gray-500 text-center">+{(order.order_items?.length || 0) - 6} items más</p>
        )}

        {/* Actions */}
        {compact && order.status === "confirmed" && (
          <button onClick={() => moveToPreparing(order.id)} disabled={loading} className="w-full py-1.5 rounded-lg bg-blue-600/70 hover:bg-blue-600 text-white text-xs font-medium transition flex items-center justify-center gap-1">
            <Play size={11} /> Iniciar
          </button>
        )}
        {!compact && order.status === "preparing" && (
          <button onClick={() => markAsReady(order)} disabled={loading || !allItemsCooked(order)}
            className={`w-full py-2 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 ${
              allItemsCooked(order) ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-gray-700 text-gray-400 cursor-not-allowed"
            }`}
          ><Check size={14} /> {allItemsCooked(order) ? "Marcar listo" : `${((cookingItems[order.id] || new Set()).size)}/${getPreparableItems(order).length} items`}</button>
        )}
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-950 p-4 space-y-4">
      {/* Totales de ingredientes en preparación */}
      {Object.keys(totalIngredients).length > 0 && (
        <div className="flex flex-wrap gap-3 items-center bg-gray-900 rounded-xl px-4 py-3 border border-gray-800 sticky top-0 z-10">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">En cocina:</span>
          {Object.entries(totalIngredients).map(([id, info]) => (
            <span key={id} className="text-sm px-3 py-1 bg-gray-800 rounded-full text-gray-200 font-medium flex items-center gap-1.5">
              {info.icon} <span className="text-lg font-bold">{info.count}</span> {info.name}
            </span>
          ))}
        </div>
      )}

      {/* Confirmados (compactos) */}
      {confirmed.length > 0 && (
        <div>
          <button onClick={() => setShowConfirmed(!showConfirmed)} className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition mb-2">
            {showConfirmed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {confirmed.length} pedido(s) confirmado(s) — click para {showConfirmed ? "ocultar" : "ver"}
          </button>
          {showConfirmed && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {confirmed.map((o) => <OrderCard key={o.id} order={o} compact />)}
            </div>
          )}
        </div>
      )}

      {/* En preparación (foco principal) */}
      <div ref={preparingRef}>
        {preparing.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-600">
            <ChefHat size={48} className="mb-3 opacity-30" />
            <p className="text-lg">No hay pedidos en preparación</p>
            <p className="text-sm mt-1 text-gray-700">Los pedidos aparecerán aquí cuando pases a cocina</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {preparing.map((o) => <OrderCard key={o.id} order={o} />)}
          </div>
        )}
      </div>

      {/* Listos (compacto al final) */}
      {ready.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <Package size={14} className="text-green-500" />
            <span className="text-sm text-gray-500">{ready.length} listo(s) para entregar</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {ready.slice(-6).map((o) => (
              <div key={o.id} className="bg-gray-900/60 rounded-lg px-3 py-2 border border-green-900/30 text-xs text-gray-500 flex items-center gap-2">
                <Check size={12} className="text-green-500" />
                <span>#{o.id.slice(-6).toUpperCase()}</span>
                <span className="text-gray-600">{o.customer_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
