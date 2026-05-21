"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  Check,
  ChefHat,
  ChevronDown,
  ChevronUp,
  Clock,
  Package,
  Play,
} from "lucide-react";
import { useCurrentBranch } from "../(cashier)/context/BranchContext";

type KdsCounter = {
  count: number;
  icon: string;
  name: string;
  sortOrder: number;
};

function formatCounter(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

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

  const confirmed = allOrders.filter((order) => order.status === "confirmed");
  const preparing = allOrders.filter((order) => order.status === "preparing");
  const ready = allOrders.filter((order) => order.status === "ready");

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

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

    const variantIds = new Set<string>();
    (data || []).forEach((order: any) => {
      (order.order_items || []).forEach((item: any) => {
        if (item.variant_id) variantIds.add(item.variant_id);
      });
    });

    if (variantIds.size === 0) {
      setRecipeMap({});
      return;
    }

    const { data: recipes } = await supabase
      .from("product_recipes")
      .select("variant_id, ingredient_id, quantity, ingredients(id, name)")
      .in("variant_id", [...variantIds]);

    const nextRecipeMap: Record<string, any[]> = {};
    (recipes || []).forEach((recipe) => {
      if (!nextRecipeMap[recipe.variant_id]) nextRecipeMap[recipe.variant_id] = [];
      nextRecipeMap[recipe.variant_id].push(recipe);
    });
    setRecipeMap(nextRecipeMap);
  };

  const loadKdsConfig = async () => {
    if (!tenantId) return;

    const { data } = await supabase
      .from("kds_config")
      .select("*, ingredients(id, name)")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("sort_order");

    setKdsIngredients(data || []);
  };

  useEffect(() => {
    if (!branchId) return;

    loadOrders();
    loadKdsConfig();

    const channel = supabase.channel(`kds-realtime-${branchId}`);
    channel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `branch_id=eq.${branchId}` },
        () => loadOrders(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `branch_id=eq.${branchId}` },
        () => loadOrders(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () =>
        loadOrders(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [branchId, tenantId]);

  const getRecipe = (item: any) => recipeMap[item.variant_id] || [];

  const kdsConfigByIngredient = kdsIngredients.reduce(
    (acc: Record<string, any>, item: any) => {
      if (item.ingredient_id) acc[item.ingredient_id] = item;
      return acc;
    },
    {},
  );

  const countKdsIngredients = (orders: any[]) => {
    const counts: Record<string, KdsCounter> = {};

    orders.forEach((order) => {
      (order.order_items || []).forEach((item: any) => {
        if (item.products?.is_preparable === false) return;

        getRecipe(item).forEach((recipeItem: any) => {
          const kdsItem = kdsConfigByIngredient[recipeItem.ingredient_id];
          if (!kdsItem) return;

          const key = recipeItem.ingredient_id;
          if (!counts[key]) {
            counts[key] = {
              count: 0,
              icon: kdsItem.icon || "#",
              name: kdsItem.name || recipeItem.ingredients?.name || "Insumo",
              sortOrder: Number(kdsItem.sort_order || 0),
            };
          }

          counts[key].count +=
            Number(recipeItem.quantity || 0) * Number(item.quantity || 1);
        });
      });
    });

    return Object.entries(counts).sort(([, a], [, b]) => a.sortOrder - b.sortOrder);
  };

  const totalIngredients = countKdsIngredients(preparing);

  const moveToPreparing = async (orderId: string) => {
    setLoading(true);
    await supabase.from("orders").update({ status: "preparing" }).eq("id", orderId);
    setLoading(false);
  };

  const markAsReady = async (order: any) => {
    setLoading(true);
    await supabase.from("orders").update({ status: "ready" }).eq("id", order.id);

    if (order.type === "takeaway") {
      const { data: conversation } = await supabase
        .from("conversations")
        .select("*")
        .eq("customer_id", order.customer_id)
        .single();

      if (conversation) {
        await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversation.id,
            orderId: order.id,
            type: "template",
            templateName: "aviso_ready_takeaway",
          }),
        });
      }
    }

    setLoading(false);
  };

  const toggleCooking = (orderId: string, index: number) => {
    setCookingItems((prev) => {
      const nextSet = new Set(prev[orderId] || []);
      if (nextSet.has(index)) nextSet.delete(index);
      else nextSet.add(index);
      return { ...prev, [orderId]: nextSet };
    });
  };

  const getPreparableItems = (order: any) =>
    (order.order_items || []).filter((item: any) => item.products?.is_preparable !== false);

  const allItemsCooked = (order: any) => {
    const preparable = getPreparableItems(order);
    const cooked = cookingItems[order.id] || new Set();
    return preparable.length > 0 && preparable.every((_: any, index: number) => cooked.has(index));
  };

  const formatTime = (createdAt: string) => {
    const diff = Math.floor((now - new Date(createdAt).getTime()) / 60000);
    const hours = Math.floor(diff / 60);
    const minutes = diff % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const getTimeColor = (createdAt: string) => {
    const diff = Math.floor((now - new Date(createdAt).getTime()) / 60000);
    if (diff < 10) return "text-green-400";
    if (diff < 20) return "text-yellow-400";
    return "text-red-400 font-bold animate-pulse";
  };

  const OrderCard = ({ order, compact = false }: { order: any; compact?: boolean }) => {
    const isReady = order.status === "ready";
    const ingredientCounts = countKdsIngredients([order]);

    return (
      <div
        className={`space-y-3 rounded-xl border bg-gray-900 p-4 transition-all ${
          isReady
            ? "border-green-900/40 opacity-50"
            : order.status === "preparing"
              ? "border-blue-500/30"
              : "border-gray-800"
        } ${compact ? "px-3 py-2" : ""}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`font-bold ${compact ? "text-sm" : "text-base"} text-white`}>
              #{order.id.slice(-6).toUpperCase()}
            </span>
            <span
              className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${
                order.type === "takeaway"
                  ? "bg-blue-600/20 text-blue-400"
                  : "bg-green-600/20 text-green-400"
              }`}
            >
              {order.type === "takeaway" ? "Retiro" : "Delivery"}
            </span>
            {!compact && <span className="truncate text-xs text-gray-500">{order.customer_name}</span>}
          </div>
          <div
            className={`flex flex-shrink-0 items-center gap-1 text-sm font-bold ${getTimeColor(
              order.created_at,
            )}`}
          >
            <Clock size={compact ? 12 : 14} />
            <span>{formatTime(order.created_at)}</span>
          </div>
        </div>

        {!compact && ingredientCounts.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ingredientCounts.map(([id, info]) => (
              <div
                key={id}
                className="flex items-center justify-between gap-2 rounded-lg bg-gray-800 px-3 py-2 text-gray-200"
                title={info.name}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-lg leading-none">{info.icon}</span>
                  <span className="truncate text-xs text-gray-400">{info.name}</span>
                </span>
                <span className="text-lg font-black tabular-nums text-white">
                  {formatCounter(info.count)}
                </span>
              </div>
            ))}
          </div>
        )}

        {!compact &&
          (() => {
            const preparableItems = getPreparableItems(order);
            const skippedNonPreparable = (order.order_items?.length || 0) - preparableItems.length;

            return (
              <>
                {preparableItems.slice(0, 6).map((item: any, index: number) => {
                  const isCooked = (cookingItems[order.id] || new Set()).has(index);
                  const canToggle = order.status === "preparing";
                  const extras = item.extras || [];

                  return (
                    <div key={item.id}>
                      <div
                        onClick={() => canToggle && toggleCooking(order.id, index)}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition ${
                          isReady
                            ? "bg-gray-800/30 text-gray-500"
                            : isCooked
                              ? "border border-orange-500/20 bg-orange-500/15 text-orange-300"
                              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                        }`}
                      >
                        {isReady ? (
                          <Check size={13} className="text-green-500" />
                        ) : isCooked ? (
                          <ChefHat size={13} className="text-orange-400" />
                        ) : (
                          <span className="h-3 w-3 rounded-full border-2 border-gray-600" />
                        )}
                        <span className="font-semibold">{item.quantity}x</span>
                        <span className="truncate">{item.products?.name || "Producto"}</span>
                      </div>

                      {extras.length > 0 && (
                        <div className="ml-9 mt-0.5 flex flex-wrap gap-1">
                          {extras.map((extra: any, extraIndex: number) => (
                            <span
                              key={extraIndex}
                              className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                                extra.type === "sin"
                                  ? "bg-red-900/30 text-red-300"
                                  : "bg-emerald-900/30 text-emerald-300"
                              }`}
                            >
                              {extra.type === "sin" ? `Sin ${extra.name}` : `+ ${extra.name}`}
                            </span>
                          ))}
                        </div>
                      )}

                      {item.note && (
                        <p className="ml-9 mt-0.5 text-xs text-yellow-500/80">
                          Nota: {item.note}
                        </p>
                      )}
                    </div>
                  );
                })}

                {skippedNonPreparable > 0 && (
                  <p className="text-center text-xs text-gray-600">
                    +{skippedNonPreparable} producto(s) no preparable(s)
                  </p>
                )}
              </>
            );
          })()}

        {!compact && (order.order_items?.length || 0) > 6 && (
          <p className="text-center text-xs text-gray-500">
            +{(order.order_items?.length || 0) - 6} items mas
          </p>
        )}

        {compact && order.status === "confirmed" && (
          <button
            onClick={() => moveToPreparing(order.id)}
            disabled={loading}
            className="flex w-full items-center justify-center gap-1 rounded-lg bg-blue-600/70 py-1.5 text-xs font-medium text-white transition hover:bg-blue-600"
          >
            <Play size={11} /> Iniciar
          </button>
        )}

        {!compact && order.status === "preparing" && (
          <button
            onClick={() => markAsReady(order)}
            disabled={loading || !allItemsCooked(order)}
            className={`flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${
              allItemsCooked(order)
                ? "bg-emerald-600 text-white hover:bg-emerald-500"
                : "cursor-not-allowed bg-gray-700 text-gray-400"
            }`}
          >
            <Check size={14} />
            {allItemsCooked(order)
              ? "Marcar listo"
              : `${(cookingItems[order.id] || new Set()).size}/${getPreparableItems(order).length} items`}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="h-full space-y-4 overflow-y-auto bg-gray-950 p-4">
      <div className="sticky top-0 z-10 flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-950/95 px-4 py-3 backdrop-blur md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Cocina</p>
          <h2 className="text-lg font-bold text-white">
            {preparing.length} pedido(s) en preparacion
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {totalIngredients.length > 0 ? (
            totalIngredients.map(([id, info]) => (
              <div
                key={id}
                className="flex min-w-[112px] items-center justify-between gap-3 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2"
                title={info.name}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-xl leading-none">{info.icon}</span>
                  <span className="truncate text-xs text-gray-400">{info.name}</span>
                </span>
                <span className="text-2xl font-black tabular-nums text-white">
                  {formatCounter(info.count)}
                </span>
              </div>
            ))
          ) : (
            <span className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-gray-500">
              Sin insumos configurados en preparacion
            </span>
          )}
        </div>
      </div>

      {confirmed.length > 0 && (
        <div>
          <button
            onClick={() => setShowConfirmed(!showConfirmed)}
            className="mb-2 flex items-center gap-2 text-sm text-gray-400 transition hover:text-gray-200"
          >
            {showConfirmed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {confirmed.length} pedido(s) confirmado(s) - click para{" "}
            {showConfirmed ? "ocultar" : "ver"}
          </button>

          {showConfirmed && (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {confirmed.map((order) => (
                <OrderCard key={order.id} order={order} compact />
              ))}
            </div>
          )}
        </div>
      )}

      <div ref={preparingRef}>
        {preparing.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-600">
            <ChefHat size={48} className="mb-3 opacity-30" />
            <p className="text-lg">No hay pedidos en preparacion</p>
            <p className="mt-1 text-sm text-gray-700">
              Los pedidos apareceran aca cuando pases a cocina
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {preparing.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </div>

      {ready.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-2">
            <Package size={14} className="text-green-500" />
            <span className="text-sm text-gray-500">{ready.length} listo(s) para entregar</span>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
            {ready.slice(-6).map((order) => (
              <div
                key={order.id}
                className="flex items-center gap-2 rounded-lg border border-green-900/30 bg-gray-900/60 px-3 py-2 text-xs text-gray-500"
              >
                <Check size={12} className="text-green-500" />
                <span>#{order.id.slice(-6).toUpperCase()}</span>
                <span className="text-gray-600">{order.customer_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
