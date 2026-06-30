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
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCurrentBranch } from "../(cashier)/context/BranchContext";
import {
  createKdsRealtimeClient,
  isKdsOrderEvent,
  type KdsRealtimeStatus,
} from "../../lib/kdsRealtime";
import { publishOrderRealtimeEvent } from "../../lib/publishOrderRealtimeEvent";

type KdsCounter = {
  count: number;
  icon: string;
  name: string;
  sortOrder: number;
};

type ExpandedKdsItem = {
  id: string;
  quantity: number;
  variant_id: string | null;
  products: any;
  extras?: any[];
  note?: string;
  parent_combo_name?: string;
};

type KdsCategoryConfig = {
  kds_sort_order?: number | null;
  kds_dimmed?: boolean | null;
  position?: number | null;
};

export default function KDSTab() {
  const { branchId, tenantId } = useCurrentBranch();
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cookingItems, setCookingItems] = useState<Record<string, Set<number>>>(
    {},
  );
  const [kdsIngredients, setKdsIngredients] = useState<Record<string, any>>(
    {},
  );
  const [ingredientOrder, setIngredientOrder] = useState<string[]>([]);
  const [recipeMap, setRecipeMap] = useState<Record<string, any[]>>({});
  const [comboMap, setComboMap] = useState<Record<string, any>>({});
  const [categoryConfig, setCategoryConfig] = useState<Record<string, KdsCategoryConfig>>({});
  const [now, setNow] = useState(Date.now());
  const [showConfirmed, setShowConfirmed] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [realtimeStatus, setRealtimeStatus] =
    useState<KdsRealtimeStatus>("disabled");
  const preparingRef = useRef<HTMLDivElement>(null);
  const preparingIdsRef = useRef<Set<string>>(new Set());
  const preparingWatchReadyRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const confirmed = allOrders.filter((o) => o.status === "confirmed");
  const preparing = allOrders.filter((o) => o.status === "preparing");
  const ready = allOrders.filter((o) => o.status === "ready");

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (preparing.length > 0) {
      preparingRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [preparing.length]);

  const playKdsBeep = async (force = false) => {
    if ((!force && !soundEnabled) || typeof window === "undefined") return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const context = audioContextRef.current || new AudioContextClass();
    audioContextRef.current = context;
    if (context.state === "suspended") await context.resume();

    const playTone = (frequency: number, delay: number) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime + delay;
      oscillator.type = "square";
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.18, startAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.22);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.24);
    };

    playTone(880, 0);
    playTone(1175, 0.28);
  };

  const enableSound = async () => {
    setSoundEnabled(true);
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      const context = audioContextRef.current || new AudioContextClass();
      audioContextRef.current = context;
      if (context.state === "suspended") await context.resume();
    }
    setTimeout(() => void playKdsBeep(true), 0);
  };

  useEffect(() => {
    const currentIds = new Set(preparing.map((order) => order.id));
    const hasNewPreparing = [...currentIds].some((id) => !preparingIdsRef.current.has(id));

    if (preparingWatchReadyRef.current && hasNewPreparing) {
      void playKdsBeep();
    }

    preparingIdsRef.current = currentIds;
    preparingWatchReadyRef.current = true;
  }, [preparing]);

  const loadOrders = async () => {
    if (!branchId) return;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const loadCombos = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return [];

      const response = await fetch(`/api/kds/combos?branchId=${encodeURIComponent(branchId)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) return [];

      const result = await response.json();
      return result.combos || [];
    };
    const [{ data }, { data: combos }] = await Promise.all([
      supabase
        .from("orders")
        .select("*, order_items(*, products(*), combos(*))")
        .eq("branch_id", branchId)
        .gte("created_at", since)
        .in("status", ["confirmed", "preparing", "ready"])
        .order("created_at", { ascending: true }),
      loadCombos().then((combos) => ({ data: combos })),
    ]);

    const nextComboMap: Record<string, any> = {};
    (combos || []).forEach((combo: any) => {
      nextComboMap[combo.id] = combo;
    });
    (data || []).forEach((order: any) => {
      (order.order_items || []).forEach((item: any) => {
        if (item.combo_id && item.combos && !nextComboMap[item.combo_id]) {
          nextComboMap[item.combo_id] = item.combos;
        }
      });
    });
    setComboMap(nextComboMap);
    setAllOrders(data || []);
    const variantIds = new Set<string>();
    (data || []).forEach((o: any) =>
      (o.order_items || []).forEach((i: any) => {
        const comboId = i.combo_id && nextComboMap[i.combo_id]
          ? i.combo_id
          : nextComboMap[i.product_id]
          ? i.product_id
            : typeof i.product_id === "string" && i.product_id.endsWith("-variant")
              ? i.product_id.replace(/-variant$/, "")
              : typeof i.variant_id === "string" && i.variant_id.endsWith("-variant")
                ? i.variant_id.replace(/-variant$/, "")
                : null;
        const combo = comboId ? nextComboMap[comboId] : null;

        if (combo) {
          (combo.combo_products || []).forEach((comboProduct: any) => {
            const variantId = getDefaultVariantId(comboProduct.products);
            if (variantId) variantIds.add(variantId);
          });
        } else if (i.variant_id) {
          variantIds.add(i.variant_id);
        }
      }),
    );
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
    const [{ data }, { data: categories }] = await Promise.all([
      supabase
        .from("kds_config")
        .select("*, ingredients(id, name)")
        .eq("tenant_id", tenantId)
        .order("sort_order"),
      supabase
        .from("categories")
        .select("id, position, kds_sort_order, kds_dimmed")
        .eq("tenant_id", tenantId),
    ]);
    const map: Record<string, any> = {};
    const order: string[] = [];
    (data || []).forEach((item: any) => {
      map[item.ingredient_id] = item;
      order.push(item.ingredient_id);
    });
    setKdsIngredients(map);
    setIngredientOrder(order);

    const categoryMap: Record<string, KdsCategoryConfig> = {};
    (categories || []).forEach((category: any) => {
      categoryMap[category.id] = {
        kds_sort_order: category.kds_sort_order,
        kds_dimmed: category.kds_dimmed,
        position: category.position,
      };
    });
    setCategoryConfig(categoryMap);
  };

  useEffect(() => {
    if (!branchId) return;
    loadOrders();
    loadKdsConfig();
    const pollInterval = setInterval(() => loadOrders(), 60000);

    const channel = supabase.channel(`kds-realtime-${branchId}`);
    channel
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "orders",
        filter: `branch_id=eq.${branchId}`,
      }, () => loadOrders())
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "orders",
        filter: `branch_id=eq.${branchId}`,
      }, () => loadOrders())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => loadOrders())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [branchId, tenantId]);

  useEffect(() => {
    if (!branchId || !tenantId) return;

    const client = createKdsRealtimeClient({ tenantId, branchId });

    if (!client) {
      setRealtimeStatus("disabled");
      return;
    }

    const cleanupEvent = client.onEvent((event) => {
      if (!isKdsOrderEvent(event)) return;
      loadOrders();
    });
    const cleanupState = client.onStateChange(setRealtimeStatus);
    const cleanupError = client.onError((error) => {
      console.warn("KDS realtime error:", error);
    });

    void client.connect().catch((error) => {
      console.warn("KDS realtime connection failed:", error);
      setRealtimeStatus("disconnected");
    });

    return () => {
      cleanupEvent();
      cleanupState();
      cleanupError();
      client.disconnect();
    };
  }, [branchId, tenantId]);

  const getDefaultVariantId = (product: any) => {
    const variants = product?.product_variants || [];
    return (
      variants.find((variant: any) => variant.is_default)?.id ||
      variants[0]?.id ||
      null
    );
  };

  const getComboIdFromOrderItem = (item: any) => {
    if (item.combo_id && comboMap[item.combo_id]) return item.combo_id;
    if (comboMap[item.product_id]) return item.product_id;
    if (typeof item.product_id === "string" && item.product_id.endsWith("-variant")) {
      return item.product_id.replace(/-variant$/, "");
    }
    if (typeof item.variant_id === "string" && item.variant_id.endsWith("-variant")) {
      return item.variant_id.replace(/-variant$/, "");
    }
    return null;
  };

  const normalizeItemExtras = (extras: any[] = [], productName?: string) =>
    extras
      .filter((extra) => extra?.name)
      .map((extra) => {
        if (productName && typeof extra.name === "string" && extra.name.startsWith(`${productName}:`)) {
          return { ...extra, name: extra.name.replace(`${productName}:`, "").trim() };
        }
        return extra;
      });

  const getComboExtrasForProduct = (extras: any[] = [], productName: string, includeComboLevel = false) =>
    extras
      .filter((extra) => {
        if (typeof extra?.name !== "string") return false;
        const belongsToProduct = extra.name.startsWith(`${productName}:`);
        const belongsToCombo = !extra.name.includes(":");
        return belongsToProduct || (includeComboLevel && belongsToCombo);
      })
      .map((extra) => {
        if (typeof extra.name === "string" && extra.name.startsWith(`${productName}:`)) {
          return { ...extra, name: extra.name.replace(`${productName}:`, "").trim() };
        }
        return extra;
      });

  const expandOrderItemsForKds = (order: any): ExpandedKdsItem[] => {
    const expanded: ExpandedKdsItem[] = [];

    (order.order_items || []).forEach((item: any) => {
      if (item.item_type === "promotion") {
        const includes = (item.extras || []).filter((extra: any) => extra?.type === "incluye");
        if (includes.length > 0) {
          includes.forEach((included: any, index: number) => {
            expanded.push({
              id: `${item.id || "promo"}-included-${index}`,
              quantity: item.quantity || 1,
              variant_id: null,
              products: {
                id: `${item.id || "promo"}-${index}`,
                name: included.name || "Producto promo",
                is_preparable: true,
              },
              extras: (item.extras || []).filter((extra: any) => extra?.type === "extra" || extra?.type === "sin"),
              note: `Promo: ${(item.extras || []).find((extra: any) => extra?.type === "promotion")?.name || "Promocion"}`,
              parent_combo_name: "Promo",
            });
          });
          return;
        }
      }

      const comboId = getComboIdFromOrderItem(item);
      const combo = comboId ? comboMap[comboId] : null;

      if (!combo) {
        expanded.push({
          ...item,
          extras: normalizeItemExtras(item.extras || [], item.products?.name),
        });
        return;
      }

      (combo.combo_products || []).forEach((comboProduct: any, index: number) => {
        const product = comboProduct.products;
        const productName = product?.name || "Producto";
        expanded.push({
          id: `${item.id || combo.id}-${comboProduct.id || comboProduct.product_id}-${index}`,
          quantity: (item.quantity || 1) * (comboProduct.quantity || 1),
          variant_id: getDefaultVariantId(product),
          products: product,
          extras: getComboExtrasForProduct(item.extras || [], productName, index === 0),
          note: item.note,
          parent_combo_name: combo.name,
        });
      });
    });

    return expanded;
  };

  const getItemCategoryConfig = (item: any) => {
    const categoryId = item.products?.category_id;
    return categoryId ? categoryConfig[categoryId] : undefined;
  };

  const sortItemsForKds = (items: ExpandedKdsItem[]) =>
    [...items].sort((a, b) => {
      const aConfig = getItemCategoryConfig(a);
      const bConfig = getItemCategoryConfig(b);
      const aOrder = aConfig?.kds_sort_order ?? aConfig?.position ?? 9999;
      const bOrder = bConfig?.kds_sort_order ?? bConfig?.position ?? 9999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (a.products?.name || "").localeCompare(b.products?.name || "");
    });

  const canGroupKdsItem = (item: ExpandedKdsItem) =>
    !item.note &&
    (!item.extras || item.extras.length === 0) &&
    Boolean(item.products?.id || item.variant_id);

  const getKdsGroupKey = (item: ExpandedKdsItem) =>
    [
      item.parent_combo_name || "",
      item.products?.id || "",
      item.variant_id || "",
      item.products?.name || "",
    ].join("|");

  const groupItemsForKds = (items: ExpandedKdsItem[]) => {
    const grouped: ExpandedKdsItem[] = [];
    const indexByKey = new Map<string, number>();

    items.forEach((item) => {
      if (!canGroupKdsItem(item)) {
        grouped.push(item);
        return;
      }

      const key = getKdsGroupKey(item);
      const existingIndex = indexByKey.get(key);
      if (existingIndex === undefined) {
        indexByKey.set(key, grouped.length);
        grouped.push({ ...item });
        return;
      }

      grouped[existingIndex] = {
        ...grouped[existingIndex],
        quantity: (grouped[existingIndex].quantity || 0) + (item.quantity || 0),
      };
    });

    return grouped;
  };

  const getRecipe = (item: any) => recipeMap[item.variant_id] || [];

  // Total ingredients across all preparing orders
  const totalIngredientCounts: Record<string, KdsCounter> = {};
  preparing.forEach((order) => {
    expandOrderItemsForKds(order).forEach((item) => {
      getRecipe(item).forEach((r: any) => {
        const kdsItem = kdsIngredients[r.ingredient_id];
        if (kdsItem) {
          if (!totalIngredientCounts[r.ingredient_id])
            totalIngredientCounts[r.ingredient_id] = {
              count: 0,
              icon: kdsItem.icon || "🍔",
              name: kdsItem.name || r.ingredients?.name,
              sortOrder: kdsItem.sort_order ?? 0,
            };
          totalIngredientCounts[r.ingredient_id].count +=
            (r.quantity || 0) * (item.quantity || 1);
        }
      });
    });
  });

  const moveToPreparing = async (orderId: string) => {
    setLoading(true);
    await supabase.from("orders").update({ status: "preparing" }).eq("id", orderId);
    await publishOrderRealtimeEvent({
      tenantId,
      branchId,
      eventType: "orders.preparing",
      payload: { orderId, status: "preparing", previousStatus: "confirmed" },
    });
    setLoading(false);
  };

  const markAsReady = async (order: any) => {
    setLoading(true);
    await supabase.from("orders").update({ status: "ready" }).eq("id", order.id);
    await publishOrderRealtimeEvent({
      tenantId,
      branchId,
      eventType: "orders.ready",
      payload: {
        orderId: order.id,
        status: "ready",
        previousStatus: order.status,
        order: compactOrderPayload(order),
      },
    });
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
      const s = new Set(prev[orderId] || []);
      s.has(index) ? s.delete(index) : s.add(index);
      return { ...prev, [orderId]: s };
    });
  };

  const getPreparableItems = (order: any) =>
    groupItemsForKds(sortItemsForKds(expandOrderItemsForKds(order).filter((i: any) => i.products?.is_preparable !== false)));

  const allItemsCooked = (order: any) => {
    const preparable = getPreparableItems(order);
    const cooked = cookingItems[order.id] || new Set();
    return preparable.length > 0 && preparable.every((_: any, i: number) => cooked.has(i));
  };

  const calcIngredients = (order: any) => {
    const counts: Record<string, KdsCounter> = {};
    expandOrderItemsForKds(order).forEach((item) => {
      getRecipe(item).forEach((r: any) => {
        const kdsItem = kdsIngredients[r.ingredient_id];
        if (kdsItem) {
          if (!counts[r.ingredient_id])
            counts[r.ingredient_id] = {
              count: 0,
              icon: kdsItem.icon || "🍔",
              name: kdsItem.name || r.ingredients?.name,
              sortOrder: kdsItem.sort_order ?? 0,
            };
          counts[r.ingredient_id].count +=
            (r.quantity || 0) * (item.quantity || 1);
        }
      });
    });
    return Object.entries(counts).sort(
      ([, a], [, b]) => (a as KdsCounter).sortOrder - (b as KdsCounter).sortOrder,
    );
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

  const sortedTotalIngredients = Object.entries(totalIngredientCounts).sort(
    ([, a], [, b]) => (a as KdsCounter).sortOrder - (b as KdsCounter).sortOrder,
  );

  return (
    <div className="h-full overflow-y-auto bg-gray-950 p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-900 px-5 py-4">
        <div className="flex items-center gap-3">
          <ChefHat size={22} className="text-emerald-300" />
          <div>
            <h2 className="text-lg font-black text-gray-100">KDS Cocina</h2>
            <p className="text-xs text-gray-500">Aviso sonoro para pedidos nuevos en preparacion</p>
          </div>
          <RealtimeBadge status={realtimeStatus} />
        </div>
        <button
          type="button"
          onClick={() => soundEnabled ? setSoundEnabled(false) : void enableSound()}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-black transition ${
            soundEnabled
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
              : "border-gray-700 bg-gray-950 text-gray-300 hover:bg-gray-800"
          }`}
        >
          {soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
          {soundEnabled ? "Sonido ON" : "Activar sonido"}
        </button>
      </div>

      {/* Totales sticky */}
      {sortedTotalIngredients.length > 0 && (
        <div className="flex flex-wrap gap-4 items-center bg-gray-900 rounded-2xl px-6 py-5 border border-gray-800 sticky top-0 z-10 shadow-lg">
          <span className="text-sm font-bold text-gray-500 uppercase tracking-widest">En cocina</span>
          {sortedTotalIngredients.map(([id, info]) => (
            <span
              key={id}
              className="text-xl px-4 py-1.5 bg-gray-800 rounded-full text-gray-100 font-bold flex items-center gap-2"
            >
              {info.icon} <span className="text-3xl font-black">{info.count}</span>{" "}
              <span className="text-base font-medium text-gray-300">{info.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* Confirmados compactos */}
      {confirmed.length > 0 && (
        <div>
          <button
            onClick={() => setShowConfirmed(!showConfirmed)}
            className="flex items-center gap-2 text-base text-gray-500 hover:text-gray-300 transition mb-3 font-medium"
          >
            {showConfirmed ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            {confirmed.length} pendiente(s) — {showConfirmed ? "ocultar" : "ver"}
          </button>
          {showConfirmed && (
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {confirmed.map((o) => (
                <ConfirmedCard
                  key={o.id}
                  order={o}
                  now={now}
                  onStart={() => moveToPreparing(o.id)}
                  loading={loading}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preparación (foco) */}
      <div ref={preparingRef}>
        {preparing.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-600">
            <ChefHat size={80} className="mb-4 opacity-20" />
            <p className="text-2xl font-bold">Sin pedidos en cocina</p>
            <p className="text-base mt-2 text-gray-700">
              Los pedidos aparecerán aquí al iniciar preparación
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {preparing.map((o) => (
              <PreparingCard
                key={o.id}
                order={o}
                now={now}
                cookingItems={cookingItems}
                onToggleCooking={toggleCooking}
                onReady={markAsReady}
                allItemsCooked={allItemsCooked}
                getPreparableItems={getPreparableItems}
                getItemCategoryConfig={getItemCategoryConfig}
                calcIngredients={calcIngredients}
                formatTime={formatTime}
                getTimeColor={getTimeColor}
                loading={loading}
              />
            ))}
          </div>
        )}
      </div>

      {/* Listos */}
      {ready.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <Package size={20} className="text-green-400" />
            <span className="text-base font-semibold text-gray-500">
              {ready.length} listo(s) para entregar
            </span>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-8 gap-3">
            {ready.slice(-8).map((o) => (
              <ReadyCard key={o.id} order={o} formatTime={formatTime} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function compactOrderPayload(order: any) {
  return {
    id: order.id,
    status: order.status,
    type: order.type,
    customerName: order.customer_name,
    createdAt: order.created_at,
  };
}

function RealtimeBadge({ status }: { status: KdsRealtimeStatus }) {
  const meta = {
    connected: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    connecting: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    disconnected: "bg-red-500/20 text-red-300 border-red-500/30",
    idle: "bg-gray-700 text-gray-300 border-gray-600",
    disabled: "bg-gray-700 text-gray-300 border-gray-600",
  }[status];

  const label = {
    connected: "Realtime",
    connecting: "Conectando",
    disconnected: "Sin realtime",
    idle: "Realtime idle",
    disabled: "Realtime off",
  }[status];

  return (
    <span className={`text-xs px-3 py-1 rounded-full border font-bold ${meta}`}>
      {label}
    </span>
  );
}

/* ── CONFIRMED (compact) ── */
function ConfirmedCard({
  order,
  now,
  onStart,
  loading,
}: {
  order: any;
  now: number;
  onStart: () => void;
  loading: boolean;
}) {
  const diff = Math.floor((now - new Date(order.created_at).getTime()) / 60000);
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-base font-bold text-white">#{order.id.slice(-6).toUpperCase()}</span>
        <span className="text-sm text-gray-500 flex items-center gap-1">
          <Clock size={14} /> {diff}m
        </span>
      </div>
      <p className="text-sm text-gray-400 truncate">{order.customer_name || ""}</p>
      <button
        onClick={onStart}
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition flex items-center justify-center gap-2"
      >
        <Play size={16} /> Iniciar
      </button>
    </div>
  );
}

/* ── PREPARING (main focus) ── */
function PreparingCard({
  order,
  now,
  cookingItems,
  onToggleCooking,
  onReady,
  allItemsCooked,
  getPreparableItems,
  getItemCategoryConfig,
  calcIngredients,
  formatTime,
  getTimeColor,
  loading,
}: {
  order: any;
  now: number;
  cookingItems: Record<string, Set<number>>;
  onToggleCooking: (id: string, idx: number) => void;
  onReady: (order: any) => void;
  allItemsCooked: (order: any) => boolean;
  getPreparableItems: (order: any) => any[];
  getItemCategoryConfig: (item: any) => KdsCategoryConfig | undefined;
  calcIngredients: (order: any) => [string, any][];
  formatTime: (t: string) => string;
  getTimeColor: (t: string) => string;
  loading: boolean;
}) {
  const preparable = getPreparableItems(order);
  const ingredientCounts = calcIngredients(order);
  const cookedSet = cookingItems[order.id] || new Set();
  const cookedCount = cookedSet.size;
  const allDone = allItemsCooked(order);

  return (
    <div className="bg-gray-900 border border-blue-500/30 rounded-2xl p-6 space-y-4 shadow-lg">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black text-white">
              #{order.id.slice(-6).toUpperCase()}
            </span>
            <span
              className={`text-xs px-3 py-1 rounded-full font-bold ${
                order.type === "takeaway"
                  ? "bg-blue-600/20 text-blue-300"
                  : "bg-green-600/20 text-green-300"
              }`}
            >
              {order.type === "takeaway" ? "RETIRO" : "DELIVERY"}
            </span>
          </div>
          <p className="text-lg text-gray-400 font-medium mt-1">
            {order.customer_name || ""}
          </p>
        </div>
        <div className={`flex items-center gap-2 text-2xl font-black flex-shrink-0 ${getTimeColor(order.created_at)}`}>
          <Clock size={24} />
          <span>{formatTime(order.created_at)}</span>
        </div>
      </div>

      {/* Ingredient counters */}
      {ingredientCounts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ingredientCounts.map(([id, info]) => (
            <span
              key={id}
              className="text-sm px-3 py-1 bg-gray-800 rounded-full text-gray-200 font-bold flex items-center gap-1.5"
            >
              {info.icon} <span className="text-xl">{info.count}</span> {info.name}
            </span>
          ))}
        </div>
      )}

      {/* Items */}
      <div className="space-y-2">
        {preparable.slice(0, 8).map((item: any, i: number) => {
          const isCooked = cookedSet.has(i);
          const extras = item.extras || [];
          const categoryConfig = getItemCategoryConfig(item);
          const dimmed = categoryConfig?.kds_dimmed === true;
          return (
            <div key={item.id} className={dimmed ? "opacity-55" : ""}>
              <button
                onClick={() => onToggleCooking(order.id, i)}
                className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl text-lg font-bold transition ${
                  isCooked
                    ? "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                    : dimmed
                      ? "bg-gray-900 text-gray-500 border border-gray-800"
                      : "bg-gray-800 text-gray-200 hover:bg-gray-750 border border-transparent"
                }`}
              >
                {isCooked ? (
                  <ChefHat size={22} className="text-orange-400 flex-shrink-0" />
                ) : (
                  <span className="w-5 h-5 rounded-full border-2 border-gray-500 flex-shrink-0" />
                )}
                <span className="font-black">{item.quantity}</span>
                <span className="min-w-0 flex flex-col">
      
                  <span className="truncate">{item.products?.name || "Producto"}</span>
                </span>
              </button>
              {extras.length > 0 && (
                <div className="ml-12 flex flex-wrap gap-1.5 mt-1.5">
                  {extras.map((ex: any, ei: number) => (
                    <span
                      key={ei}
                      className={`text-sm px-2.5 py-0.5 rounded-full font-medium ${
                        ex.type === "sin"
                          ? "bg-red-900/30 text-red-300"
                          : "bg-emerald-900/30 text-emerald-300"
                      }`}
                    >
                      {ex.type === "sin" ? `✕ ${ex.name}` : `+ ${ex.name}`}
                    </span>
                  ))}
                </div>
              )}
              {item.note && (
                <p className="text-sm text-yellow-400/80 ml-12 mt-1">
                  📝 {item.note}
                </p>
              )}
            </div>
          );
        })}
        {preparable.length > 8 && (
          <p className="text-sm text-gray-600 text-center py-1">
            +{preparable.length - 8} items más
          </p>
        )}
      </div>

      {/* Ready button */}
      <button
        onClick={() => onReady(order)}
        disabled={loading || !allDone}
        className={`w-full py-3.5 rounded-xl text-lg font-bold transition flex items-center justify-center gap-3 ${
          allDone
            ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg"
            : "bg-gray-700 text-gray-400 cursor-not-allowed"
        }`}
      >
        <Check size={22} />
        {allDone
          ? "✅ Listo"
          : `${cookedCount}/${preparable.length} items`}
      </button>
    </div>
  );
}

/* ── READY (compact) ── */
function ReadyCard({ order, formatTime }: { order: any; formatTime: (t: string) => string }) {
  return (
    <div className="bg-gray-900/60 rounded-xl px-4 py-3 border border-green-900/40 flex items-center gap-3">
      <Check size={18} className="text-green-400 flex-shrink-0" />
      <div className="min-w-0">
        <span className="text-sm font-bold text-gray-100 block truncate">
          #{order.id.slice(-6).toUpperCase()}
        </span>
        <span className="text-xs text-gray-500">{order.customer_name || ""}</span>
      </div>
    </div>
  );
}
