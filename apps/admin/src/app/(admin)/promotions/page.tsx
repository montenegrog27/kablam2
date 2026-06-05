"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  BarChart3,
  Calendar,
  Check,
  ChevronRight,
  Gift,
  Image as ImageIcon,
  Layers3,
  Package,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Tags,
  TicketPercent,
  ToggleLeft,
  ToggleRight,
  Truck,
  X,
} from "lucide-react";

type TabKey = "promotions" | "rules" | "analytics";
type CatalogItem = { id: string; name: string; type?: string; price?: number | null };
type Promotion = {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  start_date?: string | null;
  end_date?: string | null;
  show_in_home: boolean;
  badge?: string | null;
  promotion_type?: string | null;
  image_type?: string | null;
  image_url?: string | null;
  usage_count?: number | null;
  generated_sales?: number | null;
  discount_granted?: number | null;
  promotion_targets?: Array<{ target_type: string; target_id: string }>;
};
type PromotionRule = {
  id: string;
  promotion_id?: string | null;
  name: string;
  description?: string | null;
  type: string;
  discount_type?: string | null;
  discount_value?: number | null;
  minimum_amount?: number | null;
  priority: number;
  stackable: boolean;
  active: boolean;
  valid_products?: string[] | null;
  valid_combos?: string[] | null;
  valid_categories?: string[] | null;
  valid_branches?: string[] | null;
  days_of_week?: number[] | null;
  start_date?: string | null;
  end_date?: string | null;
  start_hour?: string | null;
  end_hour?: string | null;
  payment_methods?: string[] | null;
  buy_quantity?: number | null;
  get_quantity?: number | null;
  second_unit_discount_percent?: number | null;
  usage_limit?: number | null;
  usage_per_customer?: number | null;
  usage_count?: number | null;
};
type AnalyticsRow = {
  id: string;
  order_id?: string | null;
  promotion_id?: string | null;
  promotion_name: string;
  promotion_type: string;
  subtotal_before_discount: number;
  discount_amount: number;
  final_total: number;
  extras_total: number;
  items_count: number;
  created_at: string;
};

const ruleTypes = [
  { value: "percentage", label: "Descuento porcentual", hint: "15% OFF", icon: TicketPercent },
  { value: "fixed", label: "Descuento fijo", hint: "$2.000 OFF", icon: Gift },
  { value: "free_shipping", label: "Envio gratis", hint: "Desde $25.000", icon: Truck },
  { value: "minimum_amount", label: "Compra minima", hint: "10% superando un monto", icon: Sparkles },
  { value: "buy_x_get_y", label: "Buy X Get Y", hint: "3x2 o 2x1", icon: Layers3 },
  { value: "second_unit", label: "Segunda unidad", hint: "50% en segunda unidad", icon: Package },
  { value: "category", label: "Categoria", hint: "20% en hamburguesas", icon: Tags },
  { value: "days", label: "Dias especificos", hint: "Martes Mordisco", icon: Calendar },
  { value: "hours", label: "Horarios especificos", hint: "Happy Hour", icon: Calendar },
  { value: "payment_method", label: "Metodo de pago", hint: "Transferencia", icon: Settings2 },
];

const dayLabels = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mie" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Dom" },
];

const currency = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const emptyPromotionForm = {
  name: "",
  description: "",
  active: true,
  startDate: "",
  endDate: "",
  showInHome: true,
  badge: "20% OFF",
  promotionType: "Producto",
  imageType: "product",
  imageUrl: "",
  products: [] as string[],
  combos: [] as string[],
  categories: [] as string[],
  additionalTriggerType: "product",
  additionalTriggerId: "",
  additionalRewardType: "product",
  additionalRewardId: "",
  additionalDiscountType: "percentage",
  additionalDiscountValue: "",
};

const emptyRuleForm = {
  promotionId: "",
  name: "",
  description: "",
  type: "percentage",
  discountType: "percentage",
  discountValue: "",
  minimumAmount: "",
  priority: "50",
  stackable: false,
  active: true,
  products: [] as string[],
  combos: [] as string[],
  categories: [] as string[],
  branches: [] as string[],
  paymentMethods: [] as string[],
  daysOfWeek: [] as number[],
  startDate: "",
  endDate: "",
  startHour: "",
  endHour: "",
  buyQuantity: "2",
  getQuantity: "1",
  secondUnitDiscountPercent: "50",
  usageLimit: "",
  usagePerCustomer: "",
};

function numberOrNull(value: string) {
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOrNull(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function sum(rows: AnalyticsRow[], key: keyof Pick<AnalyticsRow, "subtotal_before_discount" | "discount_amount" | "final_total" | "extras_total">) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

export default function PromotionsPage({ initialTab = "promotions" }: { initialTab?: TabKey }) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [tenantId, setTenantId] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [rules, setRules] = useState<PromotionRule[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([]);
  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [combos, setCombos] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<CatalogItem[]>([]);
  const [branches, setBranches] = useState<CatalogItem[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<CatalogItem[]>([]);
  const [showPromotionForm, setShowPromotionForm] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [promotionForm, setPromotionForm] = useState(emptyPromotionForm);
  const [ruleForm, setRuleForm] = useState(emptyRuleForm);

  useEffect(() => {
    loadData();
  }, []);

  const promotionMap = useMemo(() => Object.fromEntries(promotions.map((promo) => [promo.id, promo.name])), [promotions]);

  const analyticsSummary = useMemo(() => {
    const ordersWithPromo = new Set(analytics.map((row) => row.order_id || row.id));
    const totalDiscount = sum(analytics, "discount_amount");
    const totalSales = sum(analytics, "final_total");
    return {
      promoOrders: ordersWithPromo.size,
      totalDiscount,
      totalSales,
      avgTicket: analytics.length ? totalSales / analytics.length : 0,
      extras: sum(analytics, "extras_total"),
    };
  }, [analytics]);

  const analyticsByPromotion = useMemo(() => {
    const map = new Map<string, AnalyticsRow[]>();
    analytics.forEach((row) => {
      const key = row.promotion_id || row.promotion_name;
      map.set(key, [...(map.get(key) || []), row]);
    });
    return Array.from(map.entries()).map(([id, rows]) => ({
      id,
      name: rows[0]?.promotion_name || promotionMap[id] || "Promocion",
      type: rows[0]?.promotion_type || "rule",
      uses: rows.length,
      sales: sum(rows, "final_total"),
      revenue: sum(rows, "subtotal_before_discount"),
      discount: sum(rows, "discount_amount"),
      avgTicket: rows.length ? sum(rows, "final_total") / rows.length : 0,
      extras: sum(rows, "extras_total"),
      items: rows.reduce((total, row) => total + Number(row.items_count || 0), 0),
    })).sort((a, b) => b.sales - a.sales);
  }, [analytics, promotionMap]);

  const promotionStatsMap = useMemo(() => {
    const map = new Map<string, { uses: number; sales: number; discount: number }>();
    analyticsByPromotion.forEach((row) => {
      map.set(row.id, {
        uses: row.uses,
        sales: row.sales,
        discount: row.discount,
      });
    });
    return map;
  }, [analyticsByPromotion]);

  async function loadData() {
    setLoading(true);
    setNotice("");
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: userRecord } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
    if (!userRecord?.tenant_id) {
      setLoading(false);
      return;
    }

    setTenantId(userRecord.tenant_id);

    const [productsRes, combosRes, categoriesRes, branchesRes, paymentsRes] = await Promise.all([
      supabase.from("products").select("id, name").eq("tenant_id", userRecord.tenant_id).order("name"),
      supabase.from("combos").select("id, name, price").eq("tenant_id", userRecord.tenant_id).order("name"),
      supabase.from("categories").select("id, name").eq("tenant_id", userRecord.tenant_id).order("name"),
      supabase.from("branches").select("id, name").eq("tenant_id", userRecord.tenant_id).order("name"),
      supabase.from("payment_methods").select("id, name").or(`tenant_id.eq.${userRecord.tenant_id},tenant_id.is.null`).order("name"),
    ]);

    setProducts(productsRes.data || []);
    setCombos(combosRes.data || []);
    setCategories(categoriesRes.data || []);
    setBranches(branchesRes.data || []);
    setPaymentMethods(paymentsRes.data || []);

    const promotionsRes = await supabase
      .from("promotions")
      .select("*, promotion_targets(target_type, target_id)")
      .eq("tenant_id", userRecord.tenant_id)
      .order("created_at", { ascending: false });

    if (promotionsRes.error) {
      setNotice(`Falta aplicar create_promotions_engine.sql: ${promotionsRes.error.message}`);
      setLoading(false);
      return;
    }

    const [rulesRes, analyticsRes, ordersWithPromosRes] = await Promise.all([
      supabase.from("promotion_rules").select("*").eq("tenant_id", userRecord.tenant_id).order("priority", { ascending: false }),
      supabase.from("promotion_analytics").select("*").eq("tenant_id", userRecord.tenant_id).order("created_at", { ascending: false }).limit(500),
      supabase
        .from("orders")
        .select("id, customer_id, promotion_ids, promotion_names, discount_amount, discount_breakdown, subtotal_before_discount, final_total, total, created_at")
        .eq("tenant_id", userRecord.tenant_id)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    setPromotions(promotionsRes.data || []);
    setRules(rulesRes.data || []);
    const persistedAnalytics = analyticsRes.data || [];
    const persistedKeys = new Set(
      persistedAnalytics.map((row: any) => `${row.order_id || ""}:${row.promotion_id || row.promotion_name}`),
    );
    const reconstructedAnalytics = (ordersWithPromosRes.data || []).flatMap((order: any) => {
      const breakdown = Array.isArray(order.discount_breakdown) ? order.discount_breakdown : [];
      if (breakdown.length > 0) {
        return breakdown.map((entry: any, index: number) => {
          const quantity = Number(entry.quantity || 1);
          return {
            id: `order-${order.id}-${entry.promotionId || index}`,
            order_id: order.id,
            promotion_id: entry.promotionId || null,
            promotion_name: entry.promotionName || order.promotion_names?.[index] || "Promocion",
            promotion_type: "visual",
            subtotal_before_discount: Number(entry.originalPrice || 0) * quantity,
            discount_amount: Number(entry.discountAmount || 0) * quantity,
            final_total: Number(entry.finalPrice || 0) * quantity,
            extras_total: Number(entry.extrasTotal || 0) * quantity,
            items_count: Array.isArray(entry.items) ? entry.items.length * quantity : quantity,
            created_at: order.created_at,
          };
        });
      }

      const ids = Array.isArray(order.promotion_ids) ? order.promotion_ids : [];
      const names = Array.isArray(order.promotion_names) ? order.promotion_names : [];
      return ids.map((id: string, index: number) => ({
        id: `order-${order.id}-${id}`,
        order_id: order.id,
        promotion_id: id,
        promotion_name: names[index] || "Promocion",
        promotion_type: "visual",
        subtotal_before_discount: Number(order.subtotal_before_discount || order.total || 0),
        discount_amount: Number(order.discount_amount || 0),
        final_total: Number(order.final_total || order.total || 0),
        extras_total: 0,
        items_count: 1,
        created_at: order.created_at,
      }));
    }).filter((row: AnalyticsRow) => row.promotion_id || row.promotion_name);

    const missingAnalytics = reconstructedAnalytics.filter(
      (row: AnalyticsRow) => !persistedKeys.has(`${row.order_id || ""}:${row.promotion_id || row.promotion_name}`),
    );

    setAnalytics([...persistedAnalytics, ...missingAnalytics]);
    setLoading(false);
  }

  async function createPromotion(event: React.FormEvent) {
    event.preventDefault();
    if (!tenantId || !promotionForm.name.trim()) return;

    const { data, error } = await supabase.from("promotions").insert({
      tenant_id: tenantId,
      name: promotionForm.name.trim(),
      description: promotionForm.description || null,
      active: promotionForm.active,
      start_date: dateOrNull(promotionForm.startDate),
      end_date: dateOrNull(promotionForm.endDate),
      show_in_home: promotionForm.showInHome,
      badge: promotionForm.badge || null,
      promotion_type: promotionForm.promotionType,
      image_type: promotionForm.imageType,
      image_url: promotionForm.imageType === "custom" ? promotionForm.imageUrl || null : null,
      additional_product_config: {
        triggerType: promotionForm.additionalTriggerType,
        triggerId: promotionForm.additionalTriggerId || null,
        rewardType: promotionForm.additionalRewardType,
        rewardId: promotionForm.additionalRewardId || null,
        discountType: promotionForm.additionalDiscountType,
        discountValue: numberOrNull(promotionForm.additionalDiscountValue),
      },
    }).select("id").single();

    if (error || !data?.id) {
      setNotice(error?.message || "No se pudo crear la promocion");
      return;
    }

    const targets = [
      ...promotionForm.products.map((id) => ({ tenant_id: tenantId, promotion_id: data.id, target_type: "product", target_id: id })),
      ...promotionForm.combos.map((id) => ({ tenant_id: tenantId, promotion_id: data.id, target_type: "combo", target_id: id })),
      ...promotionForm.categories.map((id) => ({ tenant_id: tenantId, promotion_id: data.id, target_type: "category", target_id: id })),
    ];
    if (targets.length > 0) await supabase.from("promotion_targets").insert(targets);

    setPromotionForm(emptyPromotionForm);
    setShowPromotionForm(false);
    loadData();
  }

  async function createRule(event: React.FormEvent) {
    event.preventDefault();
    if (!tenantId || !ruleForm.name.trim()) return;

    const { error } = await supabase.from("promotion_rules").insert({
      tenant_id: tenantId,
      promotion_id: ruleForm.promotionId || null,
      name: ruleForm.name.trim(),
      description: ruleForm.description || null,
      type: ruleForm.type,
      discount_type: ruleForm.discountType,
      discount_value: numberOrNull(ruleForm.discountValue),
      minimum_amount: numberOrNull(ruleForm.minimumAmount),
      buy_quantity: numberOrNull(ruleForm.buyQuantity),
      get_quantity: numberOrNull(ruleForm.getQuantity),
      second_unit_discount_percent: numberOrNull(ruleForm.secondUnitDiscountPercent),
      priority: Number(ruleForm.priority || 0),
      stackable: ruleForm.stackable,
      active: ruleForm.active,
      valid_products: ruleForm.products,
      valid_combos: ruleForm.combos,
      valid_categories: ruleForm.categories,
      valid_branches: ruleForm.branches,
      days_of_week: ruleForm.daysOfWeek,
      start_date: dateOrNull(ruleForm.startDate),
      end_date: dateOrNull(ruleForm.endDate),
      start_hour: ruleForm.startHour || null,
      end_hour: ruleForm.endHour || null,
      payment_methods: ruleForm.paymentMethods,
      usage_limit: numberOrNull(ruleForm.usageLimit),
      usage_per_customer: numberOrNull(ruleForm.usagePerCustomer),
    });

    if (error) {
      setNotice(error.message);
      return;
    }

    setRuleForm(emptyRuleForm);
    setShowRuleForm(false);
    loadData();
  }

  async function togglePromotion(promo: Promotion) {
    await supabase.from("promotions").update({ active: !promo.active }).eq("id", promo.id);
    loadData();
  }

  async function toggleRule(rule: PromotionRule) {
    await supabase.from("promotion_rules").update({ active: !rule.active }).eq("id", rule.id);
    loadData();
  }

  const tabs = [
    { key: "promotions" as const, label: "Promociones", icon: Sparkles },
    { key: "rules" as const, label: "Reglas", icon: Settings2 },
    { key: "analytics" as const, label: "Analytics", icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
            <Sparkles size={14} />
            Motor de promociones
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Promociones</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-400">
            Crea campañas visibles, reglas automáticas de checkout y mide el impacto financiero de cada acción.
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-800 bg-gray-900/80 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Sparkles size={16} className="text-emerald-300" />
                Promociones
              </div>
              <p className="mt-2 text-sm leading-6 text-gray-400">
                Usalas para mostrar campañas al cliente: banners, badges, productos destacados, combos y ofertas visuales como "20% OFF" o "Combo finde".
              </p>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/80 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Settings2 size={16} className="text-blue-300" />
                Reglas
              </div>
              <p className="mt-2 text-sm leading-6 text-gray-400">
                Usalas para que el descuento se aplique solo en checkout: monto mínimo, días, horarios, método de pago, 2x1, 3x2, segunda unidad o envío gratis.
              </p>
            </div>
          </div>
        </div>
        <div className="flex rounded-xl border border-gray-800 bg-gray-900 p-1">
          {tabs.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                tab === item.key ? "bg-white text-gray-950" : "text-gray-400 hover:text-white"
              }`}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-10 text-center text-gray-400">Cargando promociones...</div>
      ) : (
        <>
          {tab === "promotions" && (
            <section className="space-y-5">
              <div className="grid gap-4 md:grid-cols-4">
                <MetricCard label="Activas" value={promotions.filter((p) => p.active).length.toString()} />
                <MetricCard label="Usos" value={promotions.reduce((total, p) => total + Math.max(Number(p.usage_count || 0), Number(promotionStatsMap.get(p.id)?.uses || 0)), 0).toString()} />
                <MetricCard label="Ventas generadas" value={currency.format(promotions.reduce((total, p) => total + Math.max(Number(p.generated_sales || 0), Number(promotionStatsMap.get(p.id)?.sales || 0)), 0))} />
                <MetricCard label="Descuento otorgado" value={currency.format(promotions.reduce((total, p) => total + Math.max(Number(p.discount_granted || 0), Number(promotionStatsMap.get(p.id)?.discount || 0)), 0))} />
              </div>

              <div className="rounded-2xl border border-gray-800 bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
                  <div>
                    <h2 className="text-lg font-bold">Promociones visibles</h2>
                    <p className="text-sm text-gray-400">Campañas para home, banners, productos y combos destacados.</p>
                  </div>
                  <button onClick={() => setShowPromotionForm(true)} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-bold text-gray-950">
                    <Plus size={16} />
                    Nueva Promoción
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wider text-gray-500">
                      <tr>
                        <th className="px-5 py-3">Estado</th>
                        <th className="px-5 py-3">Imagen</th>
                        <th className="px-5 py-3">Nombre</th>
                        <th className="px-5 py-3">Tipo</th>
                        <th className="px-5 py-3">Inicio</th>
                        <th className="px-5 py-3">Fin</th>
                        <th className="px-5 py-3">Usos</th>
                        <th className="px-5 py-3">Ventas</th>
                        <th className="px-5 py-3">Descuento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {promotions.map((promo) => (
                        <tr key={promo.id} className="hover:bg-white/[0.02]">
                          <td className="px-5 py-4">
                            <button onClick={() => togglePromotion(promo)} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${promo.active ? "bg-emerald-400/10 text-emerald-300" : "bg-gray-800 text-gray-400"}`}>
                              {promo.active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                              {promo.active ? "Activa" : "Pausada"}
                            </button>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-gray-800">
                              {promo.image_url ? <img src={promo.image_url} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={18} className="text-gray-500" />}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <p className="font-semibold text-white">{promo.name}</p>
                            <p className="text-xs text-gray-500">{promo.badge || "Sin badge"} · {promo.show_in_home ? "Home" : "Oculta"}</p>
                          </td>
                          <td className="px-5 py-4 text-gray-300">{promo.promotion_type || "Visual"}</td>
                          <td className="px-5 py-4 text-gray-400">{formatDate(promo.start_date)}</td>
                          <td className="px-5 py-4 text-gray-400">{formatDate(promo.end_date)}</td>
                          <td className="px-5 py-4 font-semibold">{Math.max(Number(promo.usage_count || 0), Number(promotionStatsMap.get(promo.id)?.uses || 0))}</td>
                          <td className="px-5 py-4">{currency.format(Math.max(Number(promo.generated_sales || 0), Number(promotionStatsMap.get(promo.id)?.sales || 0)))}</td>
                          <td className="px-5 py-4 text-rose-300">{currency.format(Math.max(Number(promo.discount_granted || 0), Number(promotionStatsMap.get(promo.id)?.discount || 0)))}</td>
                        </tr>
                      ))}
                      {promotions.length === 0 && <EmptyRow colSpan={9} label="No hay promociones creadas." />}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {tab === "rules" && (
            <section className="space-y-5">
              <div className="rounded-2xl border border-gray-800 bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
                  <div>
                    <h2 className="text-lg font-bold">Reglas automaticas</h2>
                    <p className="text-sm text-gray-400">Estas reglas son evaluadas por `calculatePromotions(cart)` durante checkout.</p>
                  </div>
                  <button onClick={() => setShowRuleForm(true)} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-bold text-gray-950">
                    <Plus size={16} />
                    Nueva Regla
                  </button>
                </div>
                <div className="grid gap-3 p-4">
                  {rules.map((rule) => {
                    const type = ruleTypes.find((item) => item.value === rule.type);
                    const Icon = type?.icon || Settings2;
                    return (
                      <div key={rule.id} className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex items-start gap-4">
                            <div className="rounded-2xl bg-white/5 p-3 text-emerald-300"><Icon size={22} /></div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-bold text-white">{rule.name}</h3>
                                <span className="rounded-full bg-gray-800 px-2 py-1 text-[11px] font-bold text-gray-300">{type?.label || rule.type}</span>
                                <span className="rounded-full bg-blue-400/10 px-2 py-1 text-[11px] font-bold text-blue-200">Prioridad {rule.priority || 0}</span>
                                <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${rule.stackable ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-200"}`}>
                                  {rule.stackable ? "Combinable" : "No combinable"}
                                </span>
                              </div>
                              <p className="mt-1 text-sm text-gray-400">{rule.description || type?.hint || "Sin descripcion"}</p>
                              <p className="mt-2 text-xs text-gray-500">
                                {rule.minimum_amount ? `Minimo ${currency.format(rule.minimum_amount)} · ` : ""}
                                {rule.discount_value ? `Valor ${rule.discount_value}${rule.discount_type === "percentage" ? "%" : ""} · ` : ""}
                                Usos {rule.usage_count || 0}
                              </p>
                            </div>
                          </div>
                          <button onClick={() => toggleRule(rule)} className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${rule.active ? "bg-emerald-400/10 text-emerald-300" : "bg-gray-800 text-gray-400"}`}>
                            {rule.active ? <Check size={16} /> : <X size={16} />}
                            {rule.active ? "Activa" : "Pausada"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {rules.length === 0 && <div className="rounded-2xl border border-dashed border-gray-800 p-8 text-center text-gray-400">No hay reglas configuradas.</div>}
                </div>
              </div>
            </section>
          )}

          {tab === "analytics" && (
            <section className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                <MetricCard label="Ventas con promo" value={currency.format(analyticsSummary.totalSales)} />
                <MetricCard label="Ventas sin promo" value="Conectar ordenes" muted />
                <MetricCard label="Total descontado" value={currency.format(analyticsSummary.totalDiscount)} />
                <MetricCard label="Ticket prom. promo" value={currency.format(analyticsSummary.avgTicket)} />
                <MetricCard label="Pedidos con promo" value={analyticsSummary.promoOrders.toString()} />
                <MetricCard label="Extras vendidos" value={currency.format(analyticsSummary.extras)} />
              </div>

              <div className="rounded-2xl border border-gray-800 bg-gray-900">
                <div className="border-b border-gray-800 px-5 py-4">
                  <h2 className="text-lg font-bold">Metricas por promocion</h2>
                  <p className="text-sm text-gray-400">Usos, ventas, facturacion atribuida, descuento, ticket promedio, extras y productos vendidos.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px] text-left text-sm">
                    <thead className="text-xs uppercase tracking-wider text-gray-500">
                      <tr>
                        <th className="px-5 py-3">Promocion</th>
                        <th className="px-5 py-3">Usos</th>
                        <th className="px-5 py-3">Ventas generadas</th>
                        <th className="px-5 py-3">Facturacion atribuida</th>
                        <th className="px-5 py-3">Descuento</th>
                        <th className="px-5 py-3">Ticket prom.</th>
                        <th className="px-5 py-3">Extras</th>
                        <th className="px-5 py-3">Productos</th>
                        <th className="px-5 py-3">Conversion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {analyticsByPromotion.map((row) => (
                        <tr key={row.id}>
                          <td className="px-5 py-4">
                            <p className="font-semibold">{row.name}</p>
                            <p className="text-xs text-gray-500">{row.type}</p>
                          </td>
                          <td className="px-5 py-4">{row.uses}</td>
                          <td className="px-5 py-4">{currency.format(row.sales)}</td>
                          <td className="px-5 py-4">{currency.format(row.revenue)}</td>
                          <td className="px-5 py-4 text-rose-300">{currency.format(row.discount)}</td>
                          <td className="px-5 py-4">{currency.format(row.avgTicket)}</td>
                          <td className="px-5 py-4">{currency.format(row.extras)}</td>
                          <td className="px-5 py-4">{row.items}</td>
                          <td className="px-5 py-4">{row.uses > 0 ? "Registrada" : "-"}</td>
                        </tr>
                      ))}
                      {analyticsByPromotion.length === 0 && <EmptyRow colSpan={9} label="Todavia no hay usos registrados." />}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {showPromotionForm && (
        <Modal title="Nueva Promocion" subtitle="Promocion visual para cliente" onClose={() => setShowPromotionForm(false)}>
          <form onSubmit={createPromotion} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nombre"><input className="input" value={promotionForm.name} onChange={(e) => setPromotionForm({ ...promotionForm, name: e.target.value })} /></Field>
              <Field label="Badge"><input className="input" value={promotionForm.badge} onChange={(e) => setPromotionForm({ ...promotionForm, badge: e.target.value })} placeholder="20% OFF, 2x1, COMBO" /></Field>
              <Field label="Fecha inicio"><input type="datetime-local" className="input" value={promotionForm.startDate} onChange={(e) => setPromotionForm({ ...promotionForm, startDate: e.target.value })} /></Field>
              <Field label="Fecha fin"><input type="datetime-local" className="input" value={promotionForm.endDate} onChange={(e) => setPromotionForm({ ...promotionForm, endDate: e.target.value })} /></Field>
            </div>
            <Field label="Descripcion"><textarea className="input min-h-24" value={promotionForm.description} onChange={(e) => setPromotionForm({ ...promotionForm, description: e.target.value })} /></Field>
            <div className="grid gap-4 md:grid-cols-3">
              <Toggle label="Activa" checked={promotionForm.active} onChange={(value) => setPromotionForm({ ...promotionForm, active: value })} />
              <Toggle label="Mostrar en home" checked={promotionForm.showInHome} onChange={(value) => setPromotionForm({ ...promotionForm, showInHome: value })} />
              <Field label="Imagen">
                <select className="input" value={promotionForm.imageType} onChange={(e) => setPromotionForm({ ...promotionForm, imageType: e.target.value })}>
                  <option value="product">Usar imagen del producto</option>
                  <option value="custom">Usar imagen personalizada</option>
                </select>
              </Field>
            </div>
            {promotionForm.imageType === "custom" && (
              <Field label="URL de imagen"><input className="input" value={promotionForm.imageUrl} onChange={(e) => setPromotionForm({ ...promotionForm, imageUrl: e.target.value })} /></Field>
            )}

            <div className="grid gap-4 lg:grid-cols-3">
              <MultiSelect label="Productos afectados" items={products} selected={promotionForm.products} onChange={(products) => setPromotionForm({ ...promotionForm, products })} />
              <MultiSelect label="Combos afectados" items={combos} selected={promotionForm.combos} onChange={(combos) => setPromotionForm({ ...promotionForm, combos })} />
              <MultiSelect label="Categorias afectadas" items={categories} selected={promotionForm.categories} onChange={(categories) => setPromotionForm({ ...promotionForm, categories })} />
            </div>

            <PromotionPreview
              form={promotionForm}
              products={products}
              combos={combos}
              categories={categories}
            />

            <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
              <h3 className="font-bold">Productos adicionales</h3>
              <p className="mt-1 text-sm text-gray-400">Ejemplo: comprando hamburguesa, bebida al 50% o papas gratis.</p>
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <Field label="Comprando"><select className="input" value={promotionForm.additionalTriggerType} onChange={(e) => setPromotionForm({ ...promotionForm, additionalTriggerType: e.target.value })}><option value="product">Producto</option><option value="combo">Combo</option></select></Field>
                <Field label="Item base"><select className="input" value={promotionForm.additionalTriggerId} onChange={(e) => setPromotionForm({ ...promotionForm, additionalTriggerId: e.target.value })}><option value="">Sin item</option>{(promotionForm.additionalTriggerType === "product" ? products : combos).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <Field label="Beneficio"><select className="input" value={promotionForm.additionalRewardId} onChange={(e) => setPromotionForm({ ...promotionForm, additionalRewardId: e.target.value })}><option value="">Sin item</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <Field label="Descuento"><input className="input" type="number" value={promotionForm.additionalDiscountValue} onChange={(e) => setPromotionForm({ ...promotionForm, additionalDiscountValue: e.target.value })} placeholder="50 o 100" /></Field>
              </div>
            </div>

            <FormActions onCancel={() => setShowPromotionForm(false)} submit="Crear promocion" />
          </form>
        </Modal>
      )}

      {showRuleForm && (
        <Modal title="Nueva Regla" subtitle="Regla automatica para checkout" onClose={() => setShowRuleForm(false)}>
          <form onSubmit={createRule} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nombre"><input className="input" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} /></Field>
              <Field label="Promocion vinculada"><select className="input" value={ruleForm.promotionId} onChange={(e) => setRuleForm({ ...ruleForm, promotionId: e.target.value })}><option value="">Sin vincular</option>{promotions.map((promo) => <option key={promo.id} value={promo.id}>{promo.name}</option>)}</select></Field>
              <Field label="Tipo"><select className="input" value={ruleForm.type} onChange={(e) => setRuleForm({ ...ruleForm, type: e.target.value })}>{ruleTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></Field>
              <Field label="Valor descuento"><input className="input" type="number" value={ruleForm.discountValue} onChange={(e) => setRuleForm({ ...ruleForm, discountValue: e.target.value })} placeholder="15, 2000, etc." /></Field>
              <Field label="Compra minima"><input className="input" type="number" value={ruleForm.minimumAmount} onChange={(e) => setRuleForm({ ...ruleForm, minimumAmount: e.target.value })} /></Field>
              <Field label="Prioridad"><input className="input" type="number" value={ruleForm.priority} onChange={(e) => setRuleForm({ ...ruleForm, priority: e.target.value })} /></Field>
            </div>
            <Field label="Descripcion"><textarea className="input min-h-20" value={ruleForm.description} onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })} /></Field>
            <div className="grid gap-4 md:grid-cols-3">
              <Toggle label="Activa" checked={ruleForm.active} onChange={(active) => setRuleForm({ ...ruleForm, active })} />
              <Toggle label="Combinable" checked={ruleForm.stackable} onChange={(stackable) => setRuleForm({ ...ruleForm, stackable })} />
              <Field label="Tipo descuento"><select className="input" value={ruleForm.discountType} onChange={(e) => setRuleForm({ ...ruleForm, discountType: e.target.value })}><option value="percentage">Porcentaje</option><option value="fixed">Monto fijo</option><option value="free_shipping">Envio gratis</option></select></Field>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Buy X"><input className="input" type="number" value={ruleForm.buyQuantity} onChange={(e) => setRuleForm({ ...ruleForm, buyQuantity: e.target.value })} /></Field>
              <Field label="Get Y"><input className="input" type="number" value={ruleForm.getQuantity} onChange={(e) => setRuleForm({ ...ruleForm, getQuantity: e.target.value })} /></Field>
              <Field label="% segunda unidad"><input className="input" type="number" value={ruleForm.secondUnitDiscountPercent} onChange={(e) => setRuleForm({ ...ruleForm, secondUnitDiscountPercent: e.target.value })} /></Field>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <MultiSelect label="Productos validos" items={products} selected={ruleForm.products} onChange={(products) => setRuleForm({ ...ruleForm, products })} />
              <MultiSelect label="Combos validos" items={combos} selected={ruleForm.combos} onChange={(combos) => setRuleForm({ ...ruleForm, combos })} />
              <MultiSelect label="Categorias validas" items={categories} selected={ruleForm.categories} onChange={(categories) => setRuleForm({ ...ruleForm, categories })} />
              <MultiSelect label="Sucursales validas" items={branches} selected={ruleForm.branches} onChange={(branches) => setRuleForm({ ...ruleForm, branches })} />
              <MultiSelect label="Metodos de pago" items={paymentMethods} selected={ruleForm.paymentMethods} onChange={(paymentMethods) => setRuleForm({ ...ruleForm, paymentMethods })} />
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
              <p className="text-sm font-bold">Dias, horarios y limites</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {dayLabels.map((day) => (
                  <button key={day.value} type="button" onClick={() => setRuleForm({ ...ruleForm, daysOfWeek: toggleNumber(ruleForm.daysOfWeek, day.value) })} className={`rounded-full px-3 py-1.5 text-xs font-bold ${ruleForm.daysOfWeek.includes(day.value) ? "bg-white text-gray-950" : "bg-gray-800 text-gray-400"}`}>{day.label}</button>
                ))}
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Field label="Inicio"><input type="datetime-local" className="input" value={ruleForm.startDate} onChange={(e) => setRuleForm({ ...ruleForm, startDate: e.target.value })} /></Field>
                <Field label="Fin"><input type="datetime-local" className="input" value={ruleForm.endDate} onChange={(e) => setRuleForm({ ...ruleForm, endDate: e.target.value })} /></Field>
                <Field label="Uso por cliente"><input className="input" type="number" value={ruleForm.usagePerCustomer} onChange={(e) => setRuleForm({ ...ruleForm, usagePerCustomer: e.target.value })} /></Field>
                <Field label="Hora inicio"><input type="time" className="input" value={ruleForm.startHour} onChange={(e) => setRuleForm({ ...ruleForm, startHour: e.target.value })} /></Field>
                <Field label="Hora fin"><input type="time" className="input" value={ruleForm.endHour} onChange={(e) => setRuleForm({ ...ruleForm, endHour: e.target.value })} /></Field>
                <Field label="Limite total"><input className="input" type="number" value={ruleForm.usageLimit} onChange={(e) => setRuleForm({ ...ruleForm, usageLimit: e.target.value })} /></Field>
              </div>
            </div>
            <FormActions onCancel={() => setShowRuleForm(false)} submit="Crear regla" />
          </form>
        </Modal>
      )}

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgb(55 65 81);
          background: rgb(17 24 39);
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(243 244 246);
          outline: none;
        }
        .input:focus {
          border-color: rgb(156 163 175);
        }
      `}</style>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("es-AR");
}

function toggleNumber(values: number[], value: number) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function MetricCard({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`rounded-2xl border border-gray-800 bg-gray-900 p-4 ${muted ? "opacity-70" : ""}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-10 text-center text-gray-500">{label}</td>
    </tr>
  );
}

function Modal({ title, subtitle, children, onClose }: { title: string; subtitle: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-800 px-5 py-4">
          <div>
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="text-sm text-gray-400">{subtitle}</p>
          </div>
          <button onClick={onClose} className="rounded-lg bg-gray-800 p-2 text-gray-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="max-h-[78vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-bold ${checked ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-gray-800 bg-gray-950 text-gray-400"}`}>
      {label}
      {checked ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
    </button>
  );
}

function FormActions({ onCancel, submit }: { onCancel: () => void; submit: string }) {
  return (
    <div className="flex justify-end gap-3 border-t border-gray-800 pt-4">
      <button type="button" onClick={onCancel} className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-bold text-gray-300">Cancelar</button>
      <button className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-bold text-gray-950">
        {submit}
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function MultiSelect({ label, items, selected, onChange }: { label: string; items: CatalogItem[]; selected: string[]; onChange: (values: string[]) => void }) {
  const [query, setQuery] = useState("");
  const visible = items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())).slice(0, 80);

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  }

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold">{label}</p>
        <span className="rounded-full bg-gray-800 px-2 py-1 text-[11px] font-bold text-gray-400">{selected.length}</span>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-900 px-3 py-2">
        <Search size={15} className="text-gray-500" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar..." className="w-full bg-transparent text-sm outline-none placeholder:text-gray-600" />
      </div>
      <div className="mt-3 max-h-52 space-y-1 overflow-y-auto pr-1">
        {visible.map((item) => (
          <button key={item.id} type="button" onClick={() => toggle(item.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${selected.includes(item.id) ? "bg-white text-gray-950" : "text-gray-300 hover:bg-white/5"}`}>
            <span className="truncate">{item.name}</span>
            {selected.includes(item.id) && <Check size={15} />}
          </button>
        ))}
        {visible.length === 0 && <p className="py-4 text-center text-xs text-gray-500">Sin resultados</p>}
      </div>
    </div>
  );
}

function PromotionPreview({
  form,
  products,
  combos,
  categories,
}: {
  form: typeof emptyPromotionForm;
  products: CatalogItem[];
  combos: CatalogItem[];
  categories: CatalogItem[];
}) {
  const selectedNames = [
    ...products.filter((item) => form.products.includes(item.id)).map((item) => item.name),
    ...combos.filter((item) => form.combos.includes(item.id)).map((item) => item.name),
    ...categories.filter((item) => form.categories.includes(item.id)).map((item) => item.name),
  ];
  const reward = products.find((item) => item.id === form.additionalRewardId);
  const title = form.name || "Cheese Burger 20% OFF";
  const description = form.description || "Promo especial para mostrar en la app del cliente.";
  const imageUrl = form.imageType === "custom" ? form.imageUrl : "";

  return (
    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-white">Vista previa cliente</h3>
          <p className="text-sm text-gray-400">Referencia visual de cómo podría verse la promoción en home o destacados.</p>
        </div>
        <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200">
          Preview
        </span>
      </div>

      <div className="max-w-md overflow-hidden rounded-[28px] border border-white/10 bg-[#111827] shadow-2xl">
        <div className="relative h-48 bg-gradient-to-br from-gray-800 via-gray-900 to-black">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="rounded-3xl bg-white/8 p-6 text-gray-500">
                <ImageIcon size={42} />
              </div>
            </div>
          )}
          <div className="absolute left-4 top-4 rounded-full bg-white px-3 py-1.5 text-xs font-black text-gray-950 shadow-lg">
            {form.badge || "20% OFF"}
          </div>
          {form.showInHome && (
            <div className="absolute right-4 top-4 rounded-full bg-emerald-400 px-3 py-1.5 text-xs font-black text-gray-950 shadow-lg">
              HOME
            </div>
          )}
        </div>

        <div className="p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">{form.promotionType || "Promocion"}</p>
          <h4 className="mt-2 text-2xl font-black leading-tight text-white">{title}</h4>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-400">{description}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {(selectedNames.length ? selectedNames : ["Producto destacado"]).slice(0, 4).map((name) => (
              <span key={name} className="rounded-full bg-white/8 px-3 py-1 text-xs font-semibold text-gray-300">
                {name}
              </span>
            ))}
            {selectedNames.length > 4 && (
              <span className="rounded-full bg-white/8 px-3 py-1 text-xs font-semibold text-gray-300">
                +{selectedNames.length - 4}
              </span>
            )}
          </div>

          {reward && (
            <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-200">Producto adicional</p>
              <p className="mt-1 text-sm font-bold text-white">
                {reward.name} {form.additionalDiscountValue ? `al ${form.additionalDiscountValue}%` : "con beneficio"}
              </p>
            </div>
          )}

          <button type="button" className="mt-5 w-full rounded-full bg-white px-4 py-3 text-sm font-black text-gray-950">
            Ver promoción
          </button>
        </div>
      </div>
    </div>
  );
}
