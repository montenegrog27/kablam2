"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Users, Target, Zap, TrendingUp, CalendarClock, MessageCircle, Brain, Award, AlertTriangle, Clock, Send, Download, Play, Pause, ChevronRight, Star, DollarSign, ShoppingBag, FileText, Image as ImageIcon } from "lucide-react";

const fmt = (n: number) => n.toLocaleString("es-AR");
const currency = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

const SEGMENT_CONVERSIONS: Record<string, { conservative: number; probable: number; aggressive: number }> = {
  vip: { conservative: 0.15, probable: 0.25, aggressive: 0.4 },
  at_risk: { conservative: 0.08, probable: 0.15, aggressive: 0.25 },
  dormant_30: { conservative: 0.06, probable: 0.12, aggressive: 0.2 },
  dormant_60: { conservative: 0.03, probable: 0.08, aggressive: 0.15 },
  dormant_90: { conservative: 0.01, probable: 0.03, aggressive: 0.06 },
  frequent: { conservative: 0.06, probable: 0.12, aggressive: 0.2 },
  new: { conservative: 0.08, probable: 0.16, aggressive: 0.25 },
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const normalize = (value: number, max: number) => (max > 0 ? clamp((value / max) * 100) : 0);
const cleanPhone = (phone?: string) => String(phone || "").replace(/\D/g, "");
const hasValidPhone = (phone?: string) => cleanPhone(phone).length >= 10;
const dayLabels = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
type CampaignContentType = "text" | "image" | "image_text";

const campaignTypeLabels: Record<CampaignContentType, string> = {
  text: "Solo texto",
  image: "Solo imagen",
  image_text: "Imagen + texto",
};

function normalizeCampaignContentType(value?: string | null): CampaignContentType {
  if (value === "image" || value === "image_text") return value;
  return "text";
}

function buildCampaignWhatsAppBody({
  branchSlug,
  phone,
  message,
  imageUrl,
  contentType,
}: {
  branchSlug: string;
  phone: string;
  message?: string | null;
  imageUrl?: string | null;
  contentType: CampaignContentType;
}) {
  const cleanMessage = String(message || "").trim();
  const cleanImageUrl = String(imageUrl || "").trim();
  const base = {
    slug: "mordiscoburgers",
    branchId: branchSlug,
    phone,
  };

  if (contentType === "image" || contentType === "image_text") {
    return {
      ...base,
      type: "image",
      mediaUrl: cleanImageUrl,
      imageUrl: cleanImageUrl,
      caption: cleanMessage || undefined,
      message: cleanMessage || undefined,
    };
  }

  return {
    ...base,
    message: cleanMessage,
  };
}

function mostCommon<T extends string | number>(items: T[]) {
  const counts = new Map<T, number>();
  items.filter(Boolean).forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function segmentImpact(customers: any[], segment: string, fallbackTicket = 0) {
  const conversion = SEGMENT_CONVERSIONS[segment] || SEGMENT_CONVERSIONS.frequent;
  const avgTicket = customers.length
    ? customers.reduce((sum, customer) => sum + Number(customer.avgTicket || 0), 0) / customers.length
    : fallbackTicket;
  const base = customers.length * avgTicket;
  return {
    clientes_objetivo: customers.length,
    ticket_promedio: Math.round(avgTicket),
    conversion_conservadora: conversion.conservative,
    conversion_probable: conversion.probable,
    conversion_agresiva: conversion.aggressive,
    impacto_min: Math.round(base * conversion.conservative),
    impacto_estimado: Math.round(base * conversion.probable),
    impacto_max: Math.round(base * conversion.aggressive),
  };
}

function segmentMessage(customer: any) {
  const name = customer.name || "!";
  const favorite = customer.favorite_product || customer.favorite_category || "favorita";
  if (customer.value_tier === "vip" && customer.daysSinceLast >= 20) {
    return `Hola ${name}. Hace tiempo que sos parte de los clientes mas importantes de Mordisco. Queremos avisarte antes que a nadie que tenemos algo especial esta semana. Te lo paso?`;
  }
  if (customer.segment === "at_risk") {
    return `Hola ${name}. Hace unos dias que no pedis en Mordisco y pense en vos. Seguis siendo team ${favorite} o cambiaste de favorita?`;
  }
  if (customer.segment === "dormant_30") {
    return `Hola ${name}. Hace un tiempo que no te vemos por Mordisco. Esta semana te dejamos envio gratis para tu proximo pedido.`;
  }
  if (customer.segment === "dormant_60") {
    return `Hola ${name}. Hace bastante que no pedis. Te guardamos un beneficio especial valido hasta el domingo.`;
  }
  if (customer.segment === "dormant_90") {
    return `Hola ${name}. Paso mucho tiempo desde tu ultimo pedido. Antes de dejar de molestarte queria preguntarte algo: hay algo que podamos mejorar para que vuelvas a elegir Mordisco?`;
  }
  if (customer.segment === "new") {
    return `Hola ${name}. Gracias por tu primer pedido en Mordisco. La mayoria prueba la Drip primero. Ya conoces la Cheese Bacon?`;
  }
  return `Hola ${name}. Hoy puede ser buen dia para repetir tu ${favorite}. Te paso una recomendacion?`;
}

export default function MarketingAIPage() {
  const [tenantId, setTenantId] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"growth" | "dashboard" | "campaigns" | "insights" | "recovered" | "unrecovered">("growth");
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaignSegment, setCampaignSegment] = useState("dormant_30");
  const [campaignMessage, setCampaignMessage] = useState("");
  const [campaignContentType, setCampaignContentType] = useState<CampaignContentType>("text");
  const [campaignImageUrl, setCampaignImageUrl] = useState("");
  const [campaignBatchSize, setCampaignBatchSize] = useState(30);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return;
    const { data: r } = await supabase.from("users").select("tenant_id").eq("id", u.user.id).single();
    if (!r) return;
    setTenantId(r.tenant_id);

    const [ords, custs, ins, camps] = await Promise.all([
      supabase.from("orders").select("id, customer_id, customer_name, total, type, created_at").eq("tenant_id", r.tenant_id).in("status", ["delivered", "sent", "ready"]).order("created_at", { ascending: false }).limit(5000),
      supabase.from("customers").select("id, name, phone, address, created_at").eq("tenant_id", r.tenant_id),
      supabase.from("marketing_insights").select("*").eq("tenant_id", r.tenant_id).eq("status", "active").order("priority", { ascending: false }).limit(20),
      supabase.from("campaigns").select("*, campaign_deliveries(*)").eq("tenant_id", r.tenant_id).order("created_at", { ascending: false }).limit(20),
    ]);
    const orderRows = ords.data || [];
    const orderIds = orderRows.map((order: any) => order.id).filter(Boolean);
    let enrichedOrders = orderRows;
    if (orderIds.length > 0) {
      const { data: itemRows } = await supabase
        .from("order_items")
        .select("*, products(name, categories(name)), combos(name)")
        .in("order_id", orderIds);
      const itemsByOrder = new Map<string, any[]>();
      (itemRows || []).forEach((item: any) => {
        if (!item.order_id) return;
        const current = itemsByOrder.get(item.order_id) || [];
        current.push(item);
        itemsByOrder.set(item.order_id, current);
      });
      enrichedOrders = orderRows.map((order: any) => ({ ...order, order_items: itemsByOrder.get(order.id) || [] }));
    }
    setOrders(enrichedOrders);
    setCustomers(custs.data || []);
    setInsights(ins.data || []);
    setCampaigns(camps.data || []);
    // Run attribution check
    checkAttribution(enrichedOrders, camps.data || []);
    setLoading(false);
  };

  // Attribution: link customer orders to campaigns
  const checkAttribution = async (ordersData: any[], campaignsData: any[]) => {
    if (!tenantId || campaignsData.length === 0) return;
    for (const camp of campaignsData) {
      if (camp.status === "draft" && !camp.sent_at) continue;
      if (!camp.campaign_deliveries) continue;
      for (const delivery of camp.campaign_deliveries) {
        if (delivery.conversion_status === "converted" || delivery.conversion_status === "expired") continue;
        if (!delivery.customer_id || !delivery.sent_at) continue;
        // Find first purchase after campaign
        const purchase = ordersData
          .filter((o: any) => (o.customer_id === delivery.customer_id || o.customer_name === delivery.customer_id))
          .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .find((o: any) => new Date(o.created_at) > new Date(delivery.sent_at));
        if (purchase) {
          const days = Math.floor((new Date(purchase.created_at).getTime() - new Date(delivery.sent_at).getTime()) / 86400000);
          const updates: any = {
            first_purchase_after_campaign_at: purchase.created_at,
            first_purchase_after_campaign_id: purchase.id,
            first_purchase_after_campaign_amount: purchase.total,
            days_to_convert: days,
            conversion_status: "converted",
          };
          if (days <= 7) updates.converted_7d = true;
          if (days <= 30) updates.converted_30d = true;
          if (days <= 60) updates.converted_60d = true;
          if (days <= 90) updates.converted_90d = true;
          await supabase.from("campaign_deliveries").update(updates).eq("id", delivery.id);
        } else {
          // Check if enough time has passed to mark as expired
          const daysSinceSent = Math.floor((Date.now() - new Date(delivery.sent_at).getTime()) / 86400000);
          if (daysSinceSent > 90) {
            await supabase.from("campaign_deliveries").update({ conversion_status: "expired" }).eq("id", delivery.id);
          }
        }
      }
      // Recalculate campaign metrics
      const deliveries = camp.campaign_deliveries || [];
      const converted = deliveries.filter((d: any) => d.conversion_status === "converted");
      const converted7d = deliveries.filter((d: any) => d.converted_7d);
      const converted30d = deliveries.filter((d: any) => d.converted_30d);
      const converted60d = deliveries.filter((d: any) => d.converted_60d);
      const converted90d = deliveries.filter((d: any) => d.converted_90d);
      const sentCount = deliveries.filter((d: any) => d.status === "sent").length;
      const failedCount = deliveries.filter((d: any) => d.status === "failed").length;
      const revenue7d = converted7d.reduce((s: number, d: any) => s + Number(d.first_purchase_after_campaign_amount || 0), 0);
      const revenue30d = converted30d.reduce((s: number, d: any) => s + Number(d.first_purchase_after_campaign_amount || 0), 0);
      const revenue60d = converted60d.reduce((s: number, d: any) => s + Number(d.first_purchase_after_campaign_amount || 0), 0);
      const revenue90d = converted90d.reduce((s: number, d: any) => s + Number(d.first_purchase_after_campaign_amount || 0), 0);
      const avgDays = converted.length > 0 ? converted.reduce((s: number, d: any) => s + Number(d.days_to_convert || 0), 0) / converted.length : 0;
      const rate = sentCount > 0 ? (converted.length / sentCount) * 100 : 0;
      await supabase.from("campaigns").update({
        sent_count: sentCount, failed_count: failedCount, converted_count: converted.length,
        converted_7d_count: converted7d.length, converted_30d_count: converted30d.length,
        converted_60d_count: converted60d.length, converted_90d_count: converted90d.length,
        revenue_7d: revenue7d, revenue_30d: revenue30d, revenue_60d: revenue60d, revenue_90d: revenue90d,
        avg_days_to_convert: Math.round(avgDays), recovery_rate: Math.round(rate * 100) / 100,
      }).eq("id", camp.id);
    }
    load(); // Refresh data
  };

  // === Customer intelligence ===
  const customerData = useMemo(() => {
    const byCustId: Record<string, any[]> = {};
    orders.forEach((o) => {
      const cid = o.customer_id || ("anon-" + o.customer_name);
      if (!byCustId[cid]) byCustId[cid] = [];
      byCustId[cid].push(o);
    });

    const customerMap = new Map(customers.map((c) => [c.id, c]));
    const campaignResponses = new Map<string, number>();
    campaigns.forEach((campaign: any) => {
      (campaign.campaign_deliveries || []).forEach((delivery: any) => {
        if (!delivery.customer_id) return;
        const points = delivery.conversion_status === "converted" ? 100 : delivery.status === "sent" ? 45 : 20;
        campaignResponses.set(delivery.customer_id, Math.max(campaignResponses.get(delivery.customer_id) || 0, points));
      });
    });
    const baseRows: any[] = [];

    Object.entries(byCustId).forEach(([cid, ords]) => {
      const sorted = [...ords].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const customer = customerMap.get(cid);
      const totalOrders = sorted.length;
      const totalSpent = sorted.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
      const avgTicket = totalOrders > 0 ? totalSpent / totalOrders : 0;
      const firstOrderAt = sorted[sorted.length - 1]?.created_at || "";
      const lastOrderAt = sorted[0]?.created_at || "";
      const daysSinceLast = lastOrderAt ? Math.max(0, Math.floor((Date.now() - new Date(lastOrderAt).getTime()) / 86400000)) : 999;
      const freq = totalOrders > 1 && firstOrderAt ? Math.max(1, Math.floor((new Date(lastOrderAt).getTime() - new Date(firstOrderAt).getTime()) / 86400000)) / (totalOrders - 1) : 999;
      const orders30d = sorted.filter((o: any) => { const d = new Date(o.created_at); return Date.now() - d.getTime() < 30 * 86400000; }).length;
      const deliveryCount = sorted.filter((o: any) => o.type === "delivery").length;
      const pickupCount = sorted.filter((o: any) => o.type !== "delivery").length;
      const name = customer?.name || sorted[0]?.customer_name || "Anonimo";
      const phone = customer?.phone || "";
      const items = sorted.flatMap((order: any) => order.order_items || []);
      const productNames = items.flatMap((item: any) => {
        const quantity = Math.max(1, Number(item.quantity || 1));
        const label = item.products?.name || item.combos?.name || item.product_name || item.name || item.description || null;
        return label ? Array.from({ length: quantity }, () => String(label)) : [];
      });
      const categoryNames = items.flatMap((item: any) => {
        const quantity = Math.max(1, Number(item.quantity || 1));
        const label = item.products?.categories?.name || item.category_name || item.category || null;
        return label ? Array.from({ length: quantity }, () => String(label)) : [];
      });

      baseRows.push({
        id: cid,
        name,
        phone,
        totalOrders,
        totalSpent,
        avgTicket,
        firstOrderAt,
        lastOrderAt,
        daysSinceLast,
        freq,
        orders30d,
        deliveryCount,
        pickupCount,
        favorite_product: mostCommon(productNames),
        favorite_category: mostCommon(categoryNames),
        favorite_order_day: mostCommon(sorted.map((order: any) => dayLabels[new Date(order.created_at).getDay()])),
        favorite_order_hour: mostCommon(sorted.map((order: any) => new Date(order.created_at).getHours())),
        orders: sorted,
        ltv: totalSpent,
      });
    });

    const maxLtv = Math.max(1, ...baseRows.map((row) => row.ltv));
    const maxTicket = Math.max(1, ...baseRows.map((row) => row.avgTicket));
    const sortedLtv = [...baseRows].map((row) => row.ltv).sort((a, b) => b - a);
    const top10Index = Math.max(0, Math.ceil(sortedLtv.length * 0.1) - 1);
    const top10Threshold = sortedLtv[top10Index] || Infinity;

    return baseRows.map((customer) => {
      const isTop10Ltv = customer.ltv >= top10Threshold && customer.ltv > 0;
      const valueTier = customer.totalOrders >= 5 || isTop10Ltv ? "vip" : customer.totalOrders >= 2 ? "frequent" : "new";
      const highHistoricalFrequency = customer.totalOrders >= 3 && customer.freq <= 30;
      let lifecycleStage = "active";
      if (customer.daysSinceLast >= 120) lifecycleStage = "dormant_90";
      else if (customer.daysSinceLast >= 75) lifecycleStage = "dormant_60";
      else if (customer.daysSinceLast >= 45) lifecycleStage = "dormant_30";
      else if (customer.daysSinceLast >= 20 && (highHistoricalFrequency || valueTier !== "new")) lifecycleStage = "at_risk";

      const segment = lifecycleStage === "active" ? valueTier : lifecycleStage;
      const recencyScore = clamp(100 - customer.daysSinceLast * 1.35);
      const frequencyScore = customer.totalOrders === 1 ? 35 : customer.freq <= 14 ? 100 : customer.freq <= 30 ? 78 : customer.freq <= 45 ? 58 : customer.freq <= 75 ? 38 : 18;
      const ticketScore = normalize(customer.avgTicket, maxTicket);
      const ltvScore = normalize(customer.ltv, maxLtv);
      const campaignResponseScore = campaignResponses.get(customer.id) || 50;
      const customerHealthScore = Math.round(clamp(recencyScore * 0.35 + frequencyScore * 0.25 + ticketScore * 0.15 + ltvScore * 0.15 + campaignResponseScore * 0.1));
      const lifecycleOpportunity = lifecycleStage === "at_risk" ? 100 : lifecycleStage === "dormant_30" ? 86 : lifecycleStage === "dormant_60" ? 68 : lifecycleStage === "dormant_90" ? 48 : customer.daysSinceLast >= 7 ? 34 : 12;
      const probabilityBase = SEGMENT_CONVERSIONS[segment]?.probable || SEGMENT_CONVERSIONS[valueTier]?.probable || 0.1;
      const repurchase = Math.round(clamp(probabilityBase * 100 + recencyScore * 0.35 + frequencyScore * 0.22 + (valueTier === "vip" ? 12 : 0), 3, 96));
      const channelScore = hasValidPhone(customer.phone) ? 100 : 25;
      const priorityRankGroup =
        valueTier === "vip" && lifecycleStage.startsWith("dormant") ? 100 :
        valueTier === "vip" && lifecycleStage === "at_risk" ? 90 :
        valueTier === "frequent" && lifecycleStage === "at_risk" ? 80 :
        valueTier === "frequent" && lifecycleStage.startsWith("dormant") ? 70 :
        valueTier === "new" && repurchase >= 60 ? 60 :
        lifecycleStage === "dormant_90" ? 40 : 20;
      const priorityScore = Math.round(clamp(ltvScore * 0.35 + repurchase * 0.35 + lifecycleOpportunity * 0.2 + channelScore * 0.1));
      const opportunityScore = Math.round(clamp(ltvScore * 0.28 + ticketScore * 0.18 + frequencyScore * 0.18 + repurchase * 0.2 + lifecycleOpportunity * 0.16));
      const conversion = SEGMENT_CONVERSIONS[segment] || SEGMENT_CONVERSIONS[valueTier];
      const recoverable = Math.round(customer.avgTicket * (conversion?.probable || 0.1));
      const nextBestAction =
        valueTier === "vip" && lifecycleStage !== "active" ? "Enviar WhatsApp exclusivo VIP" :
        lifecycleStage === "at_risk" ? "Enviar WhatsApp preventivo" :
        lifecycleStage === "dormant_30" ? "Ofrecer envio gratis" :
        lifecycleStage === "dormant_60" ? "Ofrecer beneficio especial hasta domingo" :
        lifecycleStage === "dormant_90" ? "Ultimo intento y pedir feedback" :
        valueTier === "new" && customer.daysSinceLast >= 5 ? "Impulsar segunda compra" :
        customer.daysSinceLast < 7 ? "No contactar todavia" : "Esperar 7 dias";

      return {
        ...customer,
        value_tier: valueTier,
        lifecycle_stage: lifecycleStage,
        segment,
        high_historical_frequency: highHistoricalFrequency,
        customer_health_score: customerHealthScore,
        recency_score: Math.round(recencyScore),
        frequency_score: Math.round(frequencyScore),
        ticket_score: Math.round(ticketScore),
        ltv_score: Math.round(ltvScore),
        campaign_response_score: campaignResponseScore,
        probabilidad_recompra: repurchase,
        priority_rank_group: priorityRankGroup,
        priority_score: priorityScore,
        opportunity_score: opportunityScore,
        recoverable,
        next_best_action: nextBestAction,
      };
    }).sort((a, b) => b.ltv - a.ltv);
  }, [orders, customers, campaigns]);

  // === Segment counts ===
  const segments = ["vip", "frequent", "new", "at_risk", "dormant_30", "dormant_60", "dormant_90"];
  const segmentLabels: Record<string, string> = { vip: "VIP", frequent: "Frecuentes", new: "Nuevos", at_risk: "En riesgo", dormant_30: "Dormidos 30d", dormant_60: "Dormidos 60d", dormant_90: "Dormidos 90d" };
  const segmentColors: Record<string, string> = { vip: "text-purple-400 bg-purple-500", frequent: "text-blue-400 bg-blue-500", new: "text-emerald-400 bg-emerald-500", at_risk: "text-amber-400 bg-amber-500", dormant_30: "text-orange-400 bg-orange-500", dormant_60: "text-red-400 bg-red-500", dormant_90: "text-red-400 bg-red-500" };
  const segmentCounts: Record<string, number> = {};
  const segmentRevenue: Record<string, number> = {};
  segments.forEach((seg) => {
    const list = customerData.filter((c) => c.segment === seg);
    segmentCounts[seg] = list.length;
    segmentRevenue[seg] = list.reduce((s, c) => s + c.ltv, 0);
  });
  const totalRevenue = customerData.reduce((s, c) => s + c.ltv, 0);
  const vipShare = totalRevenue > 0 ? segmentRevenue["vip"] / totalRevenue : 0;
  const dormantTotal = (segmentCounts["dormant_30"] + segmentCounts["dormant_60"] + segmentCounts["dormant_90"]);
  const dormantValue = segmentRevenue["dormant_30"] + segmentRevenue["dormant_60"] + segmentRevenue["dormant_90"];

  // === Insights auto-generation ===
  const autoInsights = useMemo(() => {
    const msgs: { type: string; priority: number; title: string; description: string; action: string; revenue: number }[] = [];
    const avgTicketForImpact = customerData.reduce((sum, customer) => sum + customer.avgTicket, 0) / Math.max(1, customerData.length);
    const vipDormant = customerData.filter((c) => c.value_tier === "vip" && c.daysSinceLast > 30);
    const vipDormantImpact = segmentImpact(vipDormant, "vip", avgTicketForImpact);
    if (vipDormant.length > 0) {
      msgs.push({
        type: "vip",
        priority: 10,
        title: "Hay " + vipDormant.length + " VIP sin comprar hace mas de 30 dias",
        description: "Impacto probable: " + currency(vipDormantImpact.impacto_estimado) + ". Conviene tratarlos como club, no como campana masiva.",
        action: "Enviar WhatsApp exclusivo a VIP dormidos",
        revenue: vipDormantImpact.impacto_estimado,
      });
    }

    const secondPurchaseRows = customerData.filter((c) => c.orders.length >= 2).map((customer) => {
      const chronological = [...customer.orders].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const daysToSecond = Math.floor((new Date(chronological[1].created_at).getTime() - new Date(chronological[0].created_at).getTime()) / 86400000);
      return { ...customer, daysToSecond };
    });
    const fastSecond = secondPurchaseRows.filter((c) => c.daysToSecond <= 15);
    const slowSecond = secondPurchaseRows.filter((c) => c.daysToSecond > 15);
    const fastFrequentRate = fastSecond.length ? fastSecond.filter((c) => c.totalOrders >= 3).length / fastSecond.length : 0;
    const slowFrequentRate = slowSecond.length ? slowSecond.filter((c) => c.totalOrders >= 3).length / slowSecond.length : 0;
    if (fastSecond.length >= 3 && slowSecond.length >= 3) {
      const multiplier = slowFrequentRate > 0 ? fastFrequentRate / slowFrequentRate : fastFrequentRate > 0 ? 3 : 1;
      msgs.push({
        type: "frequency",
        priority: 9,
        title: "La segunda compra temprana multiplica frecuencia x" + multiplier.toFixed(1),
        description: "Quienes vuelven antes de 15 dias tienen mucha mas chance de ser frecuentes. Automatizar este momento es dinero oculto.",
        action: "Crear automatizacion post primera compra a 5-7 dias",
        revenue: Math.round((segmentRevenue.new || 0) * 0.16),
      });
    }

    const atRiskImpact = segmentImpact(customerData.filter((c) => c.segment === "at_risk"), "at_risk", avgTicketForImpact);
    const dormant90Impact = segmentImpact(customerData.filter((c) => c.segment === "dormant_90"), "dormant_90", avgTicketForImpact);
    if (atRiskImpact.clientes_objetivo > 0 || dormant90Impact.clientes_objetivo > 0) {
      const efficiency = SEGMENT_CONVERSIONS.at_risk.probable / SEGMENT_CONVERSIONS.dormant_90.probable;
      msgs.push({
        type: "reactivation",
        priority: 8,
        title: "Recuperar En Riesgo es " + efficiency.toFixed(1) + "x mas eficiente que Dormidos 90d",
        description: "At Risk probable: " + currency(atRiskImpact.impacto_estimado) + ". Dormidos 90d probable: " + currency(dormant90Impact.impacto_estimado) + ". La prioridad es prevenir antes que resucitar.",
        action: "Priorizar campana preventiva antes de campanas a dormidos 90d",
        revenue: atRiskImpact.impacto_estimado,
      });
    }

    const topOpportunity = [...customerData].sort((a, b) => b.opportunity_score - a.opportunity_score)[0];
    if (topOpportunity) {
      msgs.push({
        type: "opportunity",
        priority: 7,
        title: topOpportunity.name + " es la mayor oportunidad individual",
        description: "Score " + topOpportunity.opportunity_score + "/100, " + currency(topOpportunity.ltv) + " LTV, " + topOpportunity.daysSinceLast + " dias sin comprar. Accion: " + topOpportunity.next_best_action + ".",
        action: topOpportunity.next_best_action,
        revenue: topOpportunity.recoverable,
      });
    }

    return msgs.sort((a, b) => b.priority - a.priority);
  }, [customerData, segmentRevenue.new]);

  // === Growth Score ===
  const growthScore = useMemo(() => {
    let score = 50;
    const retentionRate = customerData.length > 0 ? customerData.filter((c) => c.totalOrders >= 2).length / customerData.length : 0;
    score += retentionRate * 20;
    const vipPct = customerData.length > 0 ? segmentCounts["vip"] / customerData.length : 0;
    score += vipPct * 100 * 0.1;
    const dormantPct = customerData.length > 0 ? dormantTotal / customerData.length : 0;
    score -= dormantPct * 100 * 0.1;
    const recent = customerData.filter((c) => c.daysSinceLast <= 7).length;
    score += Math.min(10, recent / Math.max(1, customerData.length) * 100 * 0.1);
    return Math.max(0, Math.min(100, Math.round(score)));
  }, [customerData]);

  const growthCenter = useMemo(() => {
    const now = Date.now();
    const active30 = customerData.filter((c) => c.daysSinceLast <= 30);
    const atRisk = customerData.filter((c) => c.segment === "at_risk");
    const dormant = customerData.filter((c) => c.segment.startsWith("dormant"));
    const recoveredDeliveries = campaigns.flatMap((campaign: any) =>
      (campaign.campaign_deliveries || []).filter((delivery: any) => delivery.conversion_status === "converted"),
    );
    const recoveredRevenue = recoveredDeliveries.reduce((sum: number, delivery: any) => sum + Number(delivery.first_purchase_after_campaign_amount || 0), 0);
    const recoverableRevenue = segments.reduce((sum, segment) => {
      const impact = segmentImpact(customerData.filter((customer) => customer.segment === segment), segment, 0);
      return sum + impact.impacto_estimado;
    }, 0);
    const totalLtv = customerData.reduce((sum, customer) => sum + customer.ltv, 0);
    const avgTicket = customerData.reduce((sum, customer) => sum + customer.avgTicket, 0) / Math.max(1, customerData.length);
    const likelyReturn = customerData.filter((customer) => customer.daysSinceLast <= Math.max(7, customer.freq + 3)).length;

    const attention = customerData
      .filter((customer) => customer.daysSinceLast >= 14 || customer.value_tier === "vip" || customer.opportunity_score >= 70)
      .map((customer) => ({ ...customer, repurchase: customer.probabilidad_recompra, impactScore: customer.priority_rank_group * 1000 + customer.priority_score }))
      .sort((a, b) => b.priority_rank_group - a.priority_rank_group || b.priority_score - a.priority_score || b.opportunity_score - a.opportunity_score)
      .slice(0, 8);

    const segmentCards = segments.map((segment) => {
      const list = customerData.filter((customer) => customer.segment === segment);
      const ltv = list.reduce((sum, customer) => sum + customer.ltv, 0);
      const avg = list.reduce((sum, customer) => sum + customer.avgTicket, 0) / Math.max(1, list.length);
      const avgDays = list.reduce((sum, customer) => sum + customer.daysSinceLast, 0) / Math.max(1, list.length);
      const impact = segmentImpact(list, segment, avgTicket);
      const potential = impact.impacto_estimado;
      return { id: segment, label: segmentLabels[segment], customers: list.length, ltv, avg, avgDays, potential, impact };
    });

    const impactFor = (segment: string) => segmentImpact(customerData.filter((customer) => customer.segment === segment), segment, avgTicket);
    const atRiskImpact = impactFor("at_risk");
    const dormant30Impact = impactFor("dormant_30");
    const vipDormant = customerData.filter((customer) => customer.value_tier === "vip" && customer.daysSinceLast >= 28);
    const vipImpact = segmentImpact(vipDormant, "vip", avgTicket);
    const opportunities = [
      {
        icon: AlertTriangle,
        title: `${atRiskImpact.clientes_objetivo} clientes estan por entrar en riesgo`,
        value: `${currency(atRiskImpact.impacto_min)} - ${currency(atRiskImpact.impacto_max)}`,
        action: "Crear campana a En Riesgo",
        segment: "at_risk",
        impact: atRiskImpact,
      },
      {
        icon: DollarSign,
        title: `Hay ${currency(recoverableRevenue)} probables para recuperar`,
        value: "Esta semana",
        action: "Ver segmentos",
        segment: "recoverable",
        impact: { impacto_estimado: recoverableRevenue },
      },
      {
        icon: Star,
        title: `${vipDormant.length} clientes VIP llevan casi un mes sin comprar`,
        value: `${currency(vipImpact.impacto_estimado)} probable`,
        action: "Crear beneficio VIP",
        segment: "vip",
        impact: vipImpact,
      },
      {
        icon: Target,
        title: "Dormidos 30d todavia son recuperables con incentivo simple",
        value: `${currency(dormant30Impact.impacto_min)} - ${currency(dormant30Impact.impacto_max)}`,
        action: "Crear cupon",
        segment: "dormant_30",
        impact: dormant30Impact,
      },
    ];

    const cohortMonths = Array.from(new Set(customerData.map((customer) => {
      const first = customer.firstOrderAt ? new Date(customer.firstOrderAt) : new Date();
      return `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}`;
    }))).sort().slice(-6);

    const cohorts = cohortMonths.map((month) => {
      const cohortCustomers = customerData.filter((customer) => {
        const first = customer.firstOrderAt ? new Date(customer.firstOrderAt) : new Date();
        return `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}` === month;
      });
      return {
        month,
        size: cohortCustomers.length,
        retention: [0, 1, 2, 3, 4, 5].map((offset) => {
          const retained = cohortCustomers.filter((customer) => {
            const first = customer.firstOrderAt ? new Date(customer.firstOrderAt).getTime() : now;
            const from = first + offset * 30 * 86400000;
            const to = from + 30 * 86400000;
            return customer.orders.some((order: any) => {
              const time = new Date(order.created_at).getTime();
              return time >= from && time < to;
            });
          }).length;
          return cohortCustomers.length ? Math.round((retained / cohortCustomers.length) * 100) : 0;
        }),
      };
    });

    const automationStats = campaigns.slice(0, 5).map((campaign: any) => {
      const deliveries = campaign.campaign_deliveries || [];
      const sent = deliveries.filter((delivery: any) => delivery.status === "sent").length;
      const recovered = deliveries.filter((delivery: any) => delivery.conversion_status === "converted").length;
      const revenue = deliveries.reduce((sum: number, delivery: any) => sum + Number(delivery.first_purchase_after_campaign_amount || 0), 0);
      return { name: campaign.name, sent, recovered, revenue, roi: sent ? revenue / Math.max(1, sent * 120) : 0 };
    });

    return {
      active30: active30.length,
      atRisk: atRisk.length,
      dormant: dormant.length,
      recovered: recoveredDeliveries.length,
      recoveredRevenue,
      recoverableRevenue,
      totalLtv,
      avgTicket,
      likelyReturn,
      attention,
      segmentCards,
      cohorts,
      automationStats,
      opportunities,
      projected7: Math.round((active30.length * avgTicket * 0.34) + (recoverableRevenue * 0.08)),
      projected30: Math.round((active30.length * avgTicket * 1.25) + (recoverableRevenue * 0.2)),
    };
  }, [campaigns, customerData, segments, segmentLabels]);

  const launchCampaign = async () => {
    if (!tenantId || !campaignName) return;
    const cleanMessage = campaignMessage.trim();
    const cleanImageUrl = campaignImageUrl.trim();
    const needsText = campaignContentType === "text" || campaignContentType === "image_text";
    const needsImage = campaignContentType === "image" || campaignContentType === "image_text";
    if ((needsText && !cleanMessage) || (needsImage && !cleanImageUrl)) {
      alert("Completa el contenido de la campana antes de lanzarla.");
      return;
    }
    const segMap: Record<string, string> = { dormant_30: "Dormidos 30d", dormant_60: "Dormidos 60d", dormant_90: "Dormidos 90d", at_risk: "En riesgo", new: "Nuevos", frequent: "Frecuentes", vip: "VIP" };
    const target = customerData.filter((c) => c.segment === campaignSegment);
    const { data: camp } = await supabase.from("campaigns").insert({
      tenant_id: tenantId, name: campaignName, segment_name: segMap[campaignSegment] || campaignSegment,
      target_count: target.length,
      message_template: cleanMessage || null,
      cta_text: campaignContentType,
      cta_url: cleanImageUrl || null,
      status: "draft",
    }).select().single();
    if (camp) {
      const batchSize = campaignBatchSize;
      let batch = 0;
      for (let i = 0; i < target.length; i += batchSize) {
        const batch_ = target.slice(i, i + batchSize);
        await supabase.from("campaign_deliveries").insert(batch_.map((c) => ({
          campaign_id: camp.id, customer_id: c.id, tenant_id: tenantId,
          phone: c.phone.replace(/\D/g, ""), batch_id: batch, status: "pending",
        })));
        batch++;
      }
    }
    setShowNewCampaign(false); setCampaignName(""); setCampaignMessage(""); setCampaignImageUrl(""); setCampaignContentType("text"); load();
  };

  const sendCampaignBatch = async (campaign: any) => {
    if (sendingCampaign) return;
    setSendingCampaign(true);

    // Get all pending deliveries for this campaign. Customer names are loaded separately
    // because campaign_deliveries may not have a declared FK to customers.
    const { data: deliveries, error: deliveriesError } = await supabase
      .from("campaign_deliveries")
      .select("*")
      .eq("campaign_id", campaign.id)
      .eq("status", "pending")
      .limit(campaignBatchSize);

    if (deliveriesError) {
      alert(`No se pudieron cargar los destinatarios: ${deliveriesError.message}`);
      setSendingCampaign(false);
      return;
    }

    if (!deliveries || deliveries.length === 0) {
      // Mark campaign as sent
      await supabase.from("campaigns").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", campaign.id);
      alert("Campaña completada");
      setSendingCampaign(false); load(); return;
    }

    const customerIds = Array.from(new Set(deliveries.map((delivery: any) => delivery.customer_id).filter(Boolean)));
    const { data: deliveryCustomers } = customerIds.length
      ? await supabase.from("customers").select("id, name").in("id", customerIds)
      : { data: [] as any[] };
    const customerNameById = new Map((deliveryCustomers || []).map((customer: any) => [customer.id, customer.name]));

    // Get branch slug for sending
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSendingCampaign(false); return; }
    const { data: r } = await supabase.from("users").select("tenant_id, branch_id").eq("id", u.user.id).single();
    if (!r?.branch_id) { setSendingCampaign(false); return; }
    const { data: branch } = await supabase.from("branches").select("slug").eq("id", r.branch_id).single();
    if (!branch) { setSendingCampaign(false); return; }

    let sent = 0, failed = 0;
    const contentType = normalizeCampaignContentType(campaign.cta_text);
    const imageUrl = String(campaign.cta_url || "");
    for (const delivery of deliveries) {
      const customerName = customerNameById.get(delivery.customer_id) || "cliente";
      const personalizedMessage = (campaign.message_template || "").replace(/\{nombre\}/gi, customerName);
      try {
        const res = await fetch("https://whatsapp.mordiscoburgers.com.ar/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildCampaignWhatsAppBody({
            branchSlug: branch.slug,
            phone: `549${delivery.phone}`,
            message: personalizedMessage,
            imageUrl,
            contentType,
          })),
        });
        if (res.ok) {
          await supabase.from("campaign_deliveries").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", delivery.id);
          sent++;
        } else {
          const errText = await res.text();
          await supabase.from("campaign_deliveries").update({ status: "failed", error: errText }).eq("id", delivery.id);
          failed++;
        }
      } catch (e: any) {
        await supabase.from("campaign_deliveries").update({ status: "failed", error: e.message }).eq("id", delivery.id);
        failed++;
      }
    }
    await supabase.from("campaigns").update({ status: "active" }).eq("id", campaign.id);
    alert(`Lote enviado: ${sent} enviados, ${failed} fallidos`);
    load();
    setSendingCampaign(false);
  };

  const testCampaign = async () => {
    const cleanMessage = campaignMessage.trim();
    const cleanImageUrl = campaignImageUrl.trim();
    const needsText = campaignContentType === "text" || campaignContentType === "image_text";
    const needsImage = campaignContentType === "image" || campaignContentType === "image_text";
    if (!testPhone || (needsText && !cleanMessage) || (needsImage && !cleanImageUrl)) return;
    setTesting(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setTesting(false); return; }
    const { data: r } = await supabase.from("users").select("tenant_id, branch_id").eq("id", u.user.id).single();
    if (!r?.branch_id) { alert("No hay sucursal asignada"); setTesting(false); return; }
    const { data: branch } = await supabase.from("branches").select("slug").eq("id", r.branch_id).single();
    if (!branch) { alert("Sucursal no encontrada"); setTesting(false); return; }

    const phone = `549${testPhone.replace(/\D/g, "")}`;
    // Replace {nombre} with "test" for the test message
    const personalizedMessage = cleanMessage.replace(/\{nombre\}/gi, "test");
    try {
      const response = await fetch("https://whatsapp.mordiscoburgers.com.ar/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCampaignWhatsAppBody({
          branchSlug: branch.slug,
          phone,
          message: personalizedMessage,
          imageUrl: cleanImageUrl,
          contentType: campaignContentType,
        })),
      });
      const text = await response.text();
      if (response.ok) alert("✅ Mensaje de prueba enviado correctamente");
      else alert(`Error: ${text}`);
    } catch (e: any) {
      alert(`Error de conexión: ${e.message}`);
    }
    setTesting(false);
  };

  const exportJSON = () => {
    const validPhone = hasValidPhone;
    const segmentPriority: Record<string, number> = { vip: 9, at_risk: 10, frequent: 7, dormant_30: 8, dormant_60: 6, dormant_90: 4, new: 3 };
    const segmentState: Record<string, string> = {
      vip: "alto_valor",
      frequent: "saludable",
      new: "activacion",
      at_risk: "riesgo_preventivo",
      dormant_30: "recuperacion_temprana",
      dormant_60: "recuperacion_media",
      dormant_90: "recuperacion_dificil",
    };
    const segmentRecommendation: Record<string, string> = {
      vip: "Enviar beneficio exclusivo o invitacion privada para proteger LTV.",
      frequent: "Mantener frecuencia con recordatorios suaves y bundles.",
      new: "Activar segunda compra antes de que se enfrie la relacion.",
      at_risk: "Crear campana preventiva antes de que pasen a dormidos.",
      dormant_30: "Enviar incentivo simple de reactivacion esta semana.",
      dormant_60: "Usar oferta mas fuerte y mensaje directo por WhatsApp.",
      dormant_90: "No sobreinvertir; probar campana de bajo costo o limpieza de base.",
    };
    const repurchaseFor = (customer: any) => customer.probabilidad_recompra ?? Math.max(8, Math.min(92, Math.round(100 - customer.daysSinceLast * 1.45 + customer.totalOrders * 3)));
    const recoverableFor = (customer: any) => customer.recoverable ?? Math.round(customer.avgTicket * (SEGMENT_CONVERSIONS[customer.segment]?.probable || 0.1));
    const priorityReasonFor = (customer: any) => {
      if (customer.value_tier === "vip" && customer.daysSinceLast >= 30) return "VIP dormido con alto LTV y riesgo de perdida de frecuencia.";
      if (customer.segment === "at_risk" && customer.avgTicket >= growthCenter.avgTicket) return "Cliente en riesgo con ticket superior al promedio.";
      if (customer.segment === "frequent" && customer.daysSinceLast >= 20) return "Frecuente cerca de dormirse; conviene intervenir antes.";
      if (customer.segment === "dormant_30") return "Dormido temprano: todavia es recuperable con buen incentivo.";
      if (customer.segment === "dormant_60") return "Dormido medio: requiere mensaje mas directo y oferta clara.";
      if (customer.segment === "dormant_90") return "Dormido avanzado: baja confianza, probar accion de bajo costo.";
      return "Cliente con oportunidad de recompra por historial y recencia.";
    };
    const actionFor = (customer: any) => {
      if (customer.next_best_action) return customer.next_best_action;
      if (customer.value_tier === "vip") return "Enviar mensaje exclusivo VIP con beneficio personalizado.";
      if (customer.segment === "at_risk") return "Enviar campana preventiva de recompra.";
      if (customer.segment.startsWith("dormant")) return "Enviar campana de reactivacion con incentivo.";
      if (customer.segment === "new") return "Impulsar segunda compra con recomendacion de producto.";
      return "Enviar recordatorio suave con producto favorito o combo recomendado.";
    };
    const whatsappFor = segmentMessage;
    const buildScenario = (name: string, rate: number) => {
      const baseCustomers = growthCenter.atRisk + growthCenter.dormant;
      const recovered = Math.round(baseCustomers * rate);
      const revenue = Math.round(growthCenter.recoverableRevenue * rate);
      return {
        tasa_conversion_estimada: rate,
        clientes_recuperados_estimados: recovered,
        revenue_estimado: revenue,
        ganancia_bruta_estimada: Math.round(revenue * 0.55),
        supuestos: [
          `Escenario ${name} basado en ${baseCustomers} clientes recuperables.`,
          "Se asume margen bruto aproximado del 55%.",
          "No descuenta costo de descuentos ni costo de envio.",
        ],
      };
    };
    const phoneCounts = customerData.reduce((acc, customer) => {
      if (!customer.phone) acc.missing += 1;
      else if (!validPhone(customer.phone)) acc.invalid += 1;
      return acc;
    }, { missing: 0, invalid: 0 });
    const phoneFrequency = customerData.reduce((map: Record<string, number>, customer) => {
      const digits = String(customer.phone || "").replace(/\D/g, "");
      if (digits) map[digits] = (map[digits] || 0) + 1;
      return map;
    }, {});
    const possibleDuplicates = Object.values(phoneFrequency).filter((count) => count > 1).length;
    const segmentsLowConfidence = growthCenter.segmentCards.filter((segment: any) => segment.customers > 0 && segment.customers < 3).map((segment: any) => segment.id);
    const campaignsWithoutTracking = campaigns.filter((campaign: any) => !(campaign.campaign_deliveries || []).some((delivery: any) => delivery.conversion_status)).length;
    const detailedSegments = segments.map((seg) => {
      const segment: any = growthCenter.segmentCards.find((item: any) => item.id === seg) || {};
      const list = customerData.filter((customer) => customer.segment === seg);
      const avgRepurchase = list.reduce((sum, customer) => sum + repurchaseFor(customer), 0) / Math.max(1, list.length);
      return {
        segmento: seg,
        label: segmentLabels[seg],
        clientes: segment.customers || 0,
        ltv_total: Math.round(segment.ltv || 0),
        ticket_promedio: Math.round(segment.avg || 0),
        dias_promedio_ultima_compra: Math.round(segment.avgDays || 0),
        potencial_recuperable: Math.round(segment.potential || 0),
        probabilidad_recompra_promedio: Math.round(avgRepurchase),
        prioridad: segmentPriority[seg] || 1,
        estado: segmentState[seg] || "sin_estado",
        recomendacion: segmentRecommendation[seg] || "Revisar segmento manualmente.",
        accion_sugerida: seg === "vip" ? "crear_beneficio_vip" : seg.includes("dormant") || seg === "at_risk" ? "crear_campana_whatsapp" : "nutrir_segmento",
      };
    });
    const attentionCustomers = customerData
      .filter((customer) => customer.daysSinceLast >= 14 || customer.value_tier === "vip" || customer.opportunity_score >= 70)
      .map((customer) => {
        const valid = validPhone(customer.phone);
        const recoverable = recoverableFor(customer);
        return {
          customer,
          score: (customer.priority_rank_group || 0) * 1000 + (customer.priority_score || 0) + (valid ? 15 : -15),
          recoverable,
          repurchase: repurchaseFor(customer),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map(({ customer, recoverable, repurchase }) => ({
        customer_id: customer.id,
        nombre: customer.name,
        telefono: customer.phone,
        segmento: customer.segment,
        value_tier: customer.value_tier,
        lifecycle_stage: customer.lifecycle_stage,
        pedidos: customer.totalOrders,
        dias_ultimo_pedido: customer.daysSinceLast,
        ticket_promedio: Math.round(customer.avgTicket),
        ltv: Math.round(customer.ltv),
        probabilidad_recompra: repurchase,
        customer_health_score: customer.customer_health_score,
        opportunity_score: customer.opportunity_score,
        favorite_product: customer.favorite_product,
        favorite_category: customer.favorite_category,
        favorite_order_day: customer.favorite_order_day,
        favorite_order_hour: customer.favorite_order_hour,
        next_best_action: customer.next_best_action,
        valor_recuperable: recoverable,
        motivo_prioridad: priorityReasonFor(customer),
        accion_recomendada: actionFor(customer),
        mensaje_sugerido_whatsapp: whatsappFor(customer),
      }));
    const topVip = customerData
      .filter((customer) => customer.value_tier === "vip")
      .sort((a, b) => b.ltv - a.ltv)
      .slice(0, 20)
      .map((customer, index) => ({
        rank: index + 1,
        customer_id: customer.id,
        nombre: customer.name,
        telefono: customer.phone,
        pedidos: customer.totalOrders,
        ltv: Math.round(customer.ltv),
        ticket_promedio: Math.round(customer.avgTicket),
        dias_ultimo_pedido: customer.daysSinceLast,
        estado: customer.daysSinceLast >= 30 ? "vip_en_riesgo" : "vip_activo",
        accion_recomendada: customer.daysSinceLast >= 30 ? "Enviar mensaje exclusivo de reactivacion VIP." : "Mantener con beneficio preventivo o invitacion privada.",
      }));
    const cohortInterpretation = (retention: number[]) => {
      const m1 = retention[1] || 0;
      const m3 = retention[3] || 0;
      if (m1 < 20) return { interpretacion: "Baja segunda compra temprana.", alerta: "retencion_inicial_baja", recomendacion: "Crear automatizacion post primera compra antes de 7 dias." };
      if (m3 < 15) return { interpretacion: "La base pierde frecuencia despues del segundo o tercer mes.", alerta: "caida_retencion_media", recomendacion: "Crear campaña de frecuencia para clientes de 30 a 60 dias." };
      return { interpretacion: "Cohorte con retencion saludable para el tamaño de muestra.", alerta: "sin_alerta_critica", recomendacion: "Mantener nutricion y medir impacto por segmento." };
    };
    const atRiskImpact = segmentImpact(customerData.filter((c) => c.segment === "at_risk"), "at_risk", growthCenter.avgTicket);
    const dormantImpacts = ["dormant_30", "dormant_60", "dormant_90"].map((seg) => segmentImpact(customerData.filter((c) => c.segment === seg), seg, growthCenter.avgTicket));
    const combinedDormantImpact = dormantImpacts.reduce((acc, impact) => ({
      clientes_objetivo: acc.clientes_objetivo + impact.clientes_objetivo,
      impacto_min: acc.impacto_min + impact.impacto_min,
      impacto_estimado: acc.impacto_estimado + impact.impacto_estimado,
      impacto_max: acc.impacto_max + impact.impacto_max,
    }), { clientes_objetivo: 0, impacto_min: 0, impacto_estimado: 0, impacto_max: 0 });
    const vipDormantCustomers = customerData.filter((c) => c.value_tier === "vip" && c.daysSinceLast >= 28);
    const vipDormantImpact = segmentImpact(vipDormantCustomers, "vip", growthCenter.avgTicket);
    const report = {
      generado: new Date().toISOString(),
      tenant_id: tenantId,
      dashboard_summary: {
        growth_score: growthScore,
        clientes_totales: customerData.length,
        activos_30d: growthCenter.active30,
        en_riesgo: growthCenter.atRisk,
        dormidos: growthCenter.dormant,
        recuperados: growthCenter.recovered,
        recovered_revenue: Math.round(growthCenter.recoveredRevenue),
        ltv_total: Math.round(growthCenter.totalLtv),
        revenue_recuperable_estimado: Math.round(growthCenter.recoverableRevenue),
        ticket_promedio: Math.round(growthCenter.avgTicket),
        descripcion_general: "CRM & Growth Center prioriza oportunidades accionables de retencion, reactivacion y aumento de frecuencia.",
      },
      oportunidades_hoy: [
        {
          titulo: atRiskImpact.clientes_objetivo + " clientes estan por entrar en riesgo",
          descripcion: "Clientes con senales tempranas de perdida de frecuencia. Conviene actuar antes de que pasen a dormidos.",
          segmento_relacionado: "at_risk",
          clientes_afectados: atRiskImpact.clientes_objetivo,
          impacto_estimado: atRiskImpact.impacto_estimado,
          impacto_min: atRiskImpact.impacto_min,
          impacto_max: atRiskImpact.impacto_max,
          prioridad: 10,
          severidad: "alta",
          accion_recomendada: "Crear campana preventiva para clientes en riesgo.",
          cta_label: "Enviar campana",
          cta_action: "create_campaign_at_risk",
        },
        {
          titulo: "Hay " + currency(combinedDormantImpact.impacto_estimado) + " probables para recuperar en dormidos",
          descripcion: "Impacto calculado por segmento usando conversion conservadora, probable y agresiva.",
          segmento_relacionado: "dormant_30+dormant_60+dormant_90",
          clientes_afectados: combinedDormantImpact.clientes_objetivo,
          impacto_estimado: combinedDormantImpact.impacto_estimado,
          impacto_min: combinedDormantImpact.impacto_min,
          impacto_max: combinedDormantImpact.impacto_max,
          prioridad: 9,
          severidad: "media_alta",
          accion_recomendada: "Separar campanas por antiguedad: dormidos 30, 60 y 90 dias.",
          cta_label: "Ver segmentos",
          cta_action: "open_segments",
        },
        {
          titulo: vipDormantCustomers.length + " clientes VIP llevan casi un mes sin comprar",
          descripcion: "Clientes de alto LTV con riesgo de perder habito de recompra.",
          segmento_relacionado: "vip_dormant",
          clientes_afectados: vipDormantCustomers.length,
          impacto_estimado: vipDormantImpact.impacto_estimado,
          impacto_min: vipDormantImpact.impacto_min,
          impacto_max: vipDormantImpact.impacto_max,
          prioridad: 8,
          severidad: "alta",
          accion_recomendada: "Enviar mensaje exclusivo VIP con beneficio o invitacion privada.",
          cta_label: "Crear beneficio VIP",
          cta_action: "create_vip_benefit",
        },
      ],
      segmentos_detallados: detailedSegments,
      clientes_atencion: attentionCustomers,
      revenue_recovery: {
        total_recuperable: Math.round(growthCenter.recoverableRevenue),
        recuperable_semana: Math.round(growthCenter.recoverableRevenue * 0.22),
        recuperable_mes: Math.round(growthCenter.recoverableRevenue * 0.55),
        escenarios: {
          conservador: buildScenario("conservador", 0.06),
          probable: buildScenario("probable", 0.14),
          agresivo: buildScenario("agresivo", 0.24),
        },
      },
      prediccion_ingresos: {
        proximos_7_dias: growthCenter.projected7,
        proximos_30_dias: growthCenter.projected30,
        probables_regresos: growthCenter.likelyReturn,
        clientes_recuperables: growthCenter.atRisk + growthCenter.dormant,
        supuestos: [
          "Proyección basada en clientes activos 30d, ticket promedio y revenue recuperable estimado.",
          "No contempla clima, feriados, campañas externas ni cambios de precio.",
          "La confianza mejora con mayor volumen histórico de órdenes y tracking de campañas.",
        ],
        nivel_confianza: customerData.length >= 100 ? "media_alta" : customerData.length >= 30 ? "media" : "baja",
      },
      vip_club: {
        total_vip: customerData.filter((c) => c.value_tier === "vip").length,
        ltv_vip_total: Math.round(customerData.filter((c) => c.value_tier === "vip").reduce((s, c) => s + c.ltv, 0)),
        ticket_promedio_vip: Math.round(customerData.filter((c) => c.value_tier === "vip").reduce((s, c) => s + c.avgTicket, 0) / Math.max(1, customerData.filter((c) => c.value_tier === "vip").length)),
        top_vip: topVip,
      },
      mapa_retencion: growthCenter.cohorts.map((cohort: any) => {
        const interp = cohortInterpretation(cohort.retention);
        return {
          mes_adquisicion: cohort.month,
          clientes_iniciales: cohort.size,
          retencion_m0: cohort.retention[0] || 0,
          retencion_m1: cohort.retention[1] || 0,
          retencion_m2: cohort.retention[2] || 0,
          retencion_m3: cohort.retention[3] || 0,
          retencion_m4: cohort.retention[4] || 0,
          retencion_m5: cohort.retention[5] || 0,
          ...interp,
        };
      }),
      automatizaciones: campaigns.map((campaign: any) => {
        const deliveries = campaign.campaign_deliveries || [];
        const sent = deliveries.filter((delivery: any) => delivery.status === "sent").length;
        const recovered = deliveries.filter((delivery: any) => delivery.conversion_status === "converted").length;
        const revenue = deliveries.reduce((sum: number, delivery: any) => sum + Number(delivery.first_purchase_after_campaign_amount || 0), 0);
        return {
          id: campaign.id,
          nombre: campaign.name,
          segmento: campaign.segment_name,
          estado: campaign.status,
          target: campaign.target_count,
          enviados: sent,
          recuperados: recovered,
          revenue_generado: Math.round(revenue),
          roi: sent ? Math.round((revenue / Math.max(1, sent * 120)) * 100) / 100 : 0,
          conversion_rate: sent ? Math.round((recovered / sent) * 10000) / 100 : 0,
          fecha_creacion: campaign.created_at,
          ultima_ejecucion: campaign.sent_at || deliveries.map((delivery: any) => delivery.sent_at).filter(Boolean).sort().at(-1) || null,
          recomendacion: recovered === 0 && sent > 0 ? "Revisar mensaje, incentivo o segmentacion antes de repetir." : "Mantener medicion y comparar ticket recuperado contra promedio.",
        };
      }),
      growth_ai_diagnosis: {
        diagnostico_principal: "Mordisco no tiene solo un problema de datos; el mayor potencial visible esta en retencion, frecuencia y recuperacion segmentada de clientes con historial.",
        cuello_de_botella_principal: dormantTotal > growthCenter.active30 ? "reactivacion_de_dormidos" : "retencion_y_frecuencia",
        hipotesis: [
          "Una campaña preventiva a clientes en riesgo recupera más barato que reactivar dormidos de 90 días.",
          "Los clientes VIP requieren trato diferencial para proteger LTV.",
          "La segunda compra temprana es clave para transformar nuevos en frecuentes.",
        ],
        evidencia: [
          `${growthCenter.atRisk} clientes en riesgo y ${growthCenter.dormant} dormidos detectados.`,
          `${currency(growthCenter.recoverableRevenue)} de revenue recuperable estimado.`,
          `${segmentCounts.vip} clientes VIP concentran ${currency(segmentRevenue.vip)} de LTV.`,
        ],
        riesgos: [
          "Telefonos faltantes o invalidos reducen capacidad de contacto.",
          "Campañas sin tracking dificultan aprender qué mensaje funciona.",
          "Segmentos pequeños pueden generar conclusiones de baja confianza.",
        ],
        acciones_prioritarias: [
          "Crear campaña preventiva para at_risk.",
          "Crear beneficio VIP para clientes con alto LTV y más de 28 días sin compra.",
          "Configurar automatización post primera compra para aumentar segunda compra.",
        ],
        proximos_pasos: [
          "Exportar clientes_atencion y contactar los primeros 20 por WhatsApp.",
          "Lanzar campaña dormidos_30 con incentivo moderado.",
          "Medir recuperados, ticket y ROI a 7 y 30 días.",
        ],
      },
      quality_warnings: {
        clientes_sin_telefono: phoneCounts.missing,
        telefonos_invalidos: phoneCounts.invalid,
        clientes_duplicados_posibles: possibleDuplicates,
        segmentos_con_baja_confianza: segmentsLowConfidence,
        campañas_sin_tracking: campaignsWithoutTracking,
        datos_insuficientes: customerData.length < 30,
      },
      next_best_actions: [
        {
          prioridad: 1,
          accion: "Lanzar campaña preventiva a clientes en riesgo",
          segmento: "at_risk",
          impacto_estimado: atRiskImpact.impacto_estimado,
          esfuerzo: "medio",
          tiempo_resultado: "7 dias",
          razon: "Es más barato prevenir dormidos que recuperarlos después.",
          paso_1: "Filtrar segmento at_risk.",
          paso_2: "Enviar WhatsApp con beneficio leve o producto recomendado.",
          paso_3: "Medir recompra a 7 dias.",
        },
        {
          prioridad: 2,
          accion: "Crear trato exclusivo para VIP en riesgo",
          segmento: "vip",
          impacto_estimado: vipDormantImpact.impacto_estimado,
          esfuerzo: "bajo",
          tiempo_resultado: "72 horas",
          razon: "Proteger clientes de alto LTV tiene mejor retorno que campañas masivas.",
          paso_1: "Tomar top_vip con dias_ultimo_pedido mayor a 28.",
          paso_2: "Enviar mensaje personalizado, no masivo.",
          paso_3: "Registrar conversion y ticket.",
        },
        {
          prioridad: 3,
          accion: "Automatizar segunda compra para clientes nuevos",
          segmento: "new",
          impacto_estimado: segmentImpact(customerData.filter((c) => c.segment === "new"), "new", growthCenter.avgTicket).impacto_estimado,
          esfuerzo: "medio",
          tiempo_resultado: "14 dias",
          razon: "La segunda compra convierte clientes casuales en frecuentes.",
          paso_1: "Detectar primera compra.",
          paso_2: "Enviar recomendacion a los 5-7 dias.",
          paso_3: "Comparar tasa de segunda compra por cohorte.",
        },
      ],
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `marketing_ai_${new Date().toISOString().split("T")[0]}.json`; a.click();
  };

  const exportCSV = () => {
    const headers = ["Nombre", "Teléfono", "Segmento", "Pedidos", "Ticket Prom.", "LTV", "Días sin comprar", "Frecuencia (días)"];
    const rows = customerData.slice(0, 1000).map((c) => [
      c.name, c.phone, segmentLabels[c.segment] || c.segment, c.totalOrders.toString(),
      Math.round(c.avgTicket).toString(), Math.round(c.ltv).toString(),
      c.daysSinceLast.toString(), c.freq < 999 ? Math.round(c.freq).toString() : "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `clientes_marketing_${new Date().toISOString().split("T")[0]}.csv`; a.click();
  };

  if (loading) return <div className="p-12 text-center text-gray-500 text-lg">Cargando Marketing AI...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2"><Brain size={24} className="text-purple-400" /> Marketing AI</h1>
          <p className="text-sm text-gray-500 mt-0.5">Director de Marketing automático · {customerData.length} clientes analizados</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={exportJSON} className="flex items-center gap-2 px-3 py-2 bg-gray-900 text-gray-300 border border-gray-700 rounded-lg text-xs font-medium hover:bg-gray-800 transition"><FileText size={14} /> JSON</button>
          <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 bg-emerald-700 text-white rounded-lg text-xs font-medium hover:bg-emerald-600 transition"><Download size={14} /> Excel</button>
          <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-center">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Growth Score</p>
            <p className={`text-2xl font-black ${growthScore >= 70 ? "text-emerald-400" : growthScore >= 40 ? "text-amber-400" : "text-red-400"}`}>{growthScore}/100</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto bg-gray-900 border border-gray-700 rounded-xl p-1">
        {([{ id: "growth", label: "Growth Center", icon: TrendingUp }, { id: "dashboard", label: "Dashboard IA", icon: Brain }, { id: "campaigns", label: "Campanas", icon: Send }, { id: "insights", label: "Insights", icon: Zap }] as const).map((tab) => (
        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition ${activeTab === tab.id ? "bg-purple-600 text-white" : "text-gray-500 hover:text-gray-300"}`}>
          <tab.icon size={14} /> {tab.label}
        </button>
      ))}
      <button onClick={() => setActiveTab("recovered")}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition ${activeTab === "recovered" ? "bg-emerald-600 text-white" : "text-gray-500 hover:text-gray-300"}`}>
        <TrendingUp size={14} /> Recuperados
      </button>
      <button onClick={() => setActiveTab("unrecovered")}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition ${activeTab === "unrecovered" ? "bg-red-600 text-white" : "text-gray-500 hover:text-gray-300"}`}>
        <AlertTriangle size={14} /> Sin resultado
      </button>
      </div>

      {/* ===== GROWTH CENTER ===== */}
      {activeTab === "growth" && (
        <GrowthCenterTab
          customerData={customerData}
          growthCenter={growthCenter}
          growthScore={growthScore}
          segmentCards={growthCenter.segmentCards}
          autoInsights={autoInsights}
          setActiveTab={setActiveTab}
        />
      )}
      {/* ===== DASHBOARD ===== */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {/* Segment cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
            {segments.map((seg) => (
              <div key={seg} className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-center">
                <div className={`w-2 h-2 rounded-full mx-auto mb-2 ${segmentColors[seg].split(" ")[1]}`} />
                <p className="text-lg font-bold text-gray-100">{segmentCounts[seg]}</p>
                <p className="text-[10px] text-gray-500 uppercase mt-0.5">{segmentLabels[seg]}</p>
                <p className="text-[10px] text-gray-600 mt-0.5">{currency(segmentRevenue[seg])}</p>
              </div>
            ))}
          </div>

          {/* Insights + Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Daily summary */}
            <div className="lg:col-span-2 bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-100 flex items-center gap-2"><Brain size={16} className="text-purple-400" /> Resumen del día</h3>
              <div className="space-y-2">
                {autoInsights.slice(0, 4).map((insight, i) => (
                  <div key={i} className="flex items-start gap-3 bg-gray-800 rounded-xl p-3 border border-gray-700">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      insight.type === "reactivation" ? "bg-red-900/30 text-red-400" :
                      insight.type === "vip" ? "bg-purple-900/30 text-purple-400" :
                      "bg-blue-900/30 text-blue-400"}`}>
                      {insight.type === "reactivation" ? <AlertTriangle size={16} /> :
                       insight.type === "vip" ? <Star size={16} /> : <TrendingUp size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-100">{insight.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{insight.description}</p>
                      <p className="text-xs font-semibold text-purple-400 mt-1">→ {insight.action}</p>
                    </div>
                    {insight.revenue > 0 && (
                      <div className="text-right flex-shrink-0">
                        <p className="text-[10px] text-gray-500">Impacto est.</p>
                        <p className="text-sm font-bold text-emerald-400">{currency(insight.revenue)}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Quick stats */}
            <div className="space-y-3">
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-gray-100">KPIs rápidos</h3>
                <div className="grid grid-cols-2 gap-3">
                  <QuickStat label="Clientes activos" value={customerData.filter((c) => c.daysSinceLast <= 7).length.toString()} />
                  <QuickStat label="Nuevos (30d)" value={customerData.filter((c) => c.orders30d > 0 && c.totalOrders <= 2).length.toString()} />
                  <QuickStat label="Ticket prom." value={currency(customerData.reduce((s, c) => s + c.avgTicket, 0) / Math.max(1, customerData.length))} />
                  <QuickStat label="Recurrencia" value={customerData.length > 0 ? `${Math.round(customerData.filter((c) => c.totalOrders >= 2).length / customerData.length * 100)}%` : "0%"} />
                </div>
              </div>
              <button onClick={() => setActiveTab("campaigns")} className="w-full py-3 bg-purple-700 text-white rounded-xl font-bold hover:bg-purple-600 transition flex items-center justify-center gap-2">
                <Send size={16} /> Ir a Campañas
              </button>
            </div>
          </div>

          {/* Segment table */}
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700 text-xs font-semibold text-gray-500 uppercase tracking-wider">Top clientes por segmento</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
                  <tr><th className="px-4 py-2">Cliente</th><th className="px-4 py-2">Segmento</th><th className="px-4 py-2 text-right">Pedidos</th><th className="px-4 py-2 text-right">Ticket</th><th className="px-4 py-2 text-right">LTV</th><th className="px-4 py-2 text-right">Días</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {customerData.slice(0, 15).map((c) => (
                    <tr key={c.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5"><span className="text-gray-100 font-medium">{c.name}</span></td>
                      <td className="px-4 py-2.5"><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${segmentColors[c.segment]}/20 ${segmentColors[c.segment].split(" ")[0]}`}>{segmentLabels[c.segment] || c.segment}</span></td>
                      <td className="px-4 py-2.5 text-right text-gray-300">{c.totalOrders}</td>
                      <td className="px-4 py-2.5 text-right text-gray-300">{currency(c.avgTicket)}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-emerald-400">{currency(c.ltv)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-400">{c.daysSinceLast}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== CAMPAÑAS ===== */}
      {activeTab === "campaigns" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-100">Campañas</h3>
            <button onClick={() => setShowNewCampaign(true)} className="px-4 py-2 bg-purple-700 text-white rounded-lg text-sm font-bold hover:bg-purple-600 transition flex items-center gap-2"><Zap size={16} /> Nueva campaña IA</button>
          </div>

          {showNewCampaign && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
              <h4 className="text-sm font-semibold text-gray-100">Nueva campaña inteligente</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase mb-1">Nombre</label>
                  <input value={campaignName} onChange={(e) => setCampaignName(e.target.value)}
                    className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Ej: Reactivar dormidos 30d" />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase mb-1">Segmento</label>
                  <select value={campaignSegment} onChange={(e) => setCampaignSegment(e.target.value)}
                    className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100">
                    {segments.map((seg) => (
                      <option key={seg} value={seg}>{segmentLabels[seg]} ({segmentCounts[seg]} clientes · {currency(segmentRevenue[seg])})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase mb-1">Envío por lote</label>
                  <select value={campaignBatchSize} onChange={(e) => setCampaignBatchSize(Number(e.target.value))}
                    className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100">
                    <option value={10}>10 mensajes por lote</option>
                    <option value={30}>30 mensajes por lote</option>
                    <option value={50}>50 mensajes por lote</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase mb-1">Contenido</label>
                  <select value={campaignContentType} onChange={(e) => setCampaignContentType(e.target.value as CampaignContentType)}
                    className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100">
                    <option value="text">Solo texto</option>
                    <option value="image">Solo imagen</option>
                    <option value="image_text">Imagen + texto</option>
                  </select>
                  <p className="mt-2 text-[11px] text-gray-500">Para ofertas visuales, usa Solo imagen y pega la URL de Mis imagenes.</p>
                </div>
                {(campaignContentType === "image" || campaignContentType === "image_text") && (
                  <div>
                    <label className="block text-[10px] text-gray-500 uppercase mb-1">URL de imagen</label>
                    <input value={campaignImageUrl} onChange={(e) => setCampaignImageUrl(e.target.value)}
                      className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500"
                      placeholder="https://res.cloudinary.com/.../oferta.jpg" />
                  </div>
                )}
              </div>
              {(campaignContentType === "image" || campaignContentType === "image_text") && (
                <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 rounded-xl border border-gray-700 bg-gray-950 p-3">
                  <div className="aspect-[4/5] overflow-hidden rounded-lg border border-gray-800 bg-gray-900 flex items-center justify-center">
                    {campaignImageUrl.trim() ? (
                      <img src={campaignImageUrl.trim()} alt="Vista previa de campana" className="h-full w-full object-cover" />
                    ) : (
                      <div className="text-center text-gray-600">
                        <ImageIcon size={28} className="mx-auto mb-2" />
                        <p className="text-xs font-bold">Preview</p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col justify-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-purple-300">{campaignTypeLabels[campaignContentType]}</p>
                    <p className="mt-2 text-sm text-gray-300">WhatsApp recibira la imagen como pieza principal{campaignContentType === "image_text" ? " con el texto como caption." : "."}</p>
                    <p className="mt-2 text-xs text-gray-500">Tip: usa imagen vertical 4:5 o cuadrada, texto grande y poco detalle para que se entienda rapido en mobile.</p>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-[10px] text-gray-500 uppercase mb-1">
                  Mensaje personalizado <span className="text-gray-600">(usá <code className="text-purple-400 bg-purple-900/30 px-1 rounded">{'{nombre}'}</code> para el nombre del cliente)</span>
                </label>
                <textarea value={campaignMessage} onChange={(e) => setCampaignMessage(e.target.value)} rows={3}
                  className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder={campaignContentType === "image" ? "Opcional: texto que acompana la imagen" : "Ej: Hola {nombre}! Vimos que hace tiempo no vienes. Te invitamos un 20% OFF."} />
              </div>
              {/* Test send */}
              <div className="bg-gray-800 rounded-xl p-3 border border-gray-700">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">📱 Probar campaña</p>
                <div className="flex gap-2">
                  <input value={testPhone} onChange={(e) => setTestPhone(e.target.value.replace(/\D/g, ""))}
                    className="flex-1 border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-900 text-gray-100 placeholder-gray-500"
                    placeholder="Tu número de WhatsApp (ej: 3794123456)" />
                  <button onClick={testCampaign} disabled={!testPhone || testing || ((campaignContentType === "text" || campaignContentType === "image_text") && !campaignMessage.trim()) || ((campaignContentType === "image" || campaignContentType === "image_text") && !campaignImageUrl.trim())}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-500 transition disabled:opacity-40 flex items-center gap-2 whitespace-nowrap">
                    {testing ? "Enviando..." : "Enviar prueba"}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">Segmento: {segmentLabels[campaignSegment]} · {customerData.filter((c) => c.segment === campaignSegment).length} clientes</p>
                <div className="flex gap-2">
                  <button onClick={() => setShowNewCampaign(false)} className="px-4 py-2 bg-gray-800 text-gray-400 rounded-lg text-sm hover:bg-gray-750 border border-gray-700">Cancelar</button>
                  <button onClick={launchCampaign} disabled={!campaignName || ((campaignContentType === "text" || campaignContentType === "image_text") && !campaignMessage.trim()) || ((campaignContentType === "image" || campaignContentType === "image_text") && !campaignImageUrl.trim())}
                    className="px-4 py-2 bg-purple-700 text-white rounded-lg text-sm font-bold hover:bg-purple-600 disabled:opacity-40 flex items-center gap-2">
                    <Send size={14} /> Lanzar campaña
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {campaigns.length === 0 ? (
              <div className="text-center py-12 text-gray-500 text-sm">Sin campañas creadas</div>
            ) : campaigns.map((camp) => {
              const deliveries = camp.campaign_deliveries || [];
              const pending = deliveries.filter((d: any) => d.status === "pending").length;
              const sent = deliveries.filter((d: any) => d.status === "sent").length;
              const failed = deliveries.filter((d: any) => d.status === "failed").length;
              const total = deliveries.length;
              const contentType = normalizeCampaignContentType(camp.cta_text);
              const recovered = customerData.filter((c) =>
                deliveries.some((d: any) => d.customer_id === c.id) && c.daysSinceLast <= 7
              ).length;
              return (
                <div key={camp.id} className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-100">{camp.name}</p>
                      <p className="mt-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-purple-300">
                        {contentType === "text" ? <FileText size={12} /> : <ImageIcon size={12} />}
                        {campaignTypeLabels[contentType]}
                      </p>
                      <p className="text-xs text-gray-500">{camp.segment_name} · {total} clientes</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                      camp.status === "sent" ? "bg-emerald-900/30 text-emerald-300" :
                      camp.status === "active" ? "bg-blue-900/30 text-blue-300" :
                      "bg-gray-800 text-gray-500"
                    }`}>{camp.status === "sent" ? "Completada" : camp.status === "active" ? "Enviando" : "Borrador"}</span>
                  </div>
                  {/* Stats */}
                  <div className="flex gap-4 text-xs">
                    <span className="text-gray-400">📨 <strong className="text-gray-200">{sent}</strong> enviados</span>
                    <span className="text-gray-400">⏳ <strong className="text-gray-200">{pending}</strong> pendientes</span>
                    <span className="text-gray-400">❌ <strong className="text-red-400">{failed}</strong> fallidos</span>
                    <span className="text-gray-400">🔄 <strong className="text-emerald-400">{recovered}</strong> recuperados</span>
                  </div>
                  {/* Progress bar */}
                  {total > 0 && (
                    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${(sent / total) * 100}%` }} />
                    </div>
                  )}
                  {/* Actions */}
                  {pending > 0 && (
                    <button onClick={() => sendCampaignBatch(camp)} disabled={sendingCampaign}
                      className="px-4 py-2 bg-purple-700 text-white rounded-lg text-xs font-bold hover:bg-purple-600 transition disabled:opacity-40 flex items-center gap-2">
                      <Send size={14} /> Enviar lote ({Math.min(pending, campaignBatchSize)} de {pending})
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== INSIGHTS ===== */}
      {activeTab === "insights" && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-100">Insights de Marketing</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {autoInsights.map((insight, i) => (
              <div key={i} className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${insight.priority >= 8 ? "bg-red-500" : insight.priority >= 5 ? "bg-amber-500" : "bg-blue-500"}`} />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{insight.type}</span>
                  <span className="text-[10px] text-gray-600">Prioridad {insight.priority}</span>
                </div>
                <p className="text-sm font-bold text-gray-100">{insight.title}</p>
                <p className="text-xs text-gray-500">{insight.description}</p>
                <div className="flex items-center justify-between pt-2 border-t border-gray-800">
                  <span className="text-xs text-purple-400 font-medium">→ {insight.action}</span>
                  {insight.revenue > 0 && <span className="text-xs font-bold text-emerald-400">Impacto: {currency(insight.revenue)}</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
            <h4 className="text-sm font-semibold text-gray-100 mb-4">Automatización programada</h4>
            <div className="space-y-2">
              {["Dormidos 30 días", "Dormidos 60 días", "Clientes recuperados"].map((auto) => (
                <label key={auto} className="flex items-center gap-3 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded border-gray-600 text-purple-600 focus:ring-purple-500" />
                  {auto}
                </label>
              ))}
              <p className="text-xs text-gray-600 mt-2">Las campañas automáticas se ejecutan cada lunes a las 10:00 AM</p>
            </div>
          </div>
        </div>
      )}

      {/* ===== RECUPERADOS ===== */}
      {activeTab === "recovered" && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2"><TrendingUp size={20} className="text-emerald-400" /> Clientes Recuperados</h3>
          {(() => {
            const allDeliveries = campaigns.flatMap((c: any) => (c.campaign_deliveries || []).filter((d: any) => d.conversion_status === "converted"));
            const monthDeliveries = allDeliveries.filter((d: any) => d.first_purchase_after_campaign_at && new Date(d.first_purchase_after_campaign_at) > new Date(Date.now() - 30 * 86400000));
            const monthRevenue = monthDeliveries.reduce((s: number, d: any) => s + Number(d.first_purchase_after_campaign_amount || 0), 0);
            const byCampaign: Record<string, { count: number; revenue: number }> = {};
            allDeliveries.forEach((d: any) => {
              const cid = d.campaign_id;
              if (!byCampaign[cid]) byCampaign[cid] = { count: 0, revenue: 0 };
              byCampaign[cid].count++;
              byCampaign[cid].revenue += Number(d.first_purchase_after_campaign_amount || 0);
            });
            const topCampaigns = Object.entries(byCampaign).sort(([, a], [, b]) => b.count - a.count).slice(0, 5);
            return (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Recuperados este mes</p>
                  <p className="text-3xl font-bold text-emerald-400">{monthDeliveries.length}</p>
                  <p className="text-xs text-gray-500 mt-1">Facturación: <span className="text-emerald-400 font-bold">{currency(monthRevenue)}</span></p>
                </div>
                <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Total recuperados</p>
                  <p className="text-3xl font-bold text-white">{allDeliveries.length}</p>
                  <p className="text-xs text-gray-500 mt-1">Facturación: <span className="font-bold text-white">{currency(allDeliveries.reduce((s: number, d: any) => s + Number(d.first_purchase_after_campaign_amount || 0), 0))}</span></p>
                </div>
                <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Ticket prom. recuperado</p>
                  <p className="text-3xl font-bold text-purple-400">
                    {currency(allDeliveries.length > 0 ? allDeliveries.reduce((s: number, d: any) => s + Number(d.first_purchase_after_campaign_amount || 0), 0) / allDeliveries.length : 0)}
                  </p>
                </div>
                <div className="lg:col-span-3 bg-gray-900 border border-gray-700 rounded-xl p-5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Campañas que más recuperaron</p>
                  <div className="space-y-2">
                    {topCampaigns.map(([cid, data]) => {
                      const camp = campaigns.find((c) => c.id === cid);
                      return (
                        <div key={cid} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-2.5">
                          <span className="text-sm font-medium text-gray-100">{camp?.name || "Sin nombre"}</span>
                          <div className="flex gap-4 text-xs">
                            <span className="text-gray-400"><strong className="text-emerald-400">{data.count}</strong> recuperados</span>
                            <span className="text-gray-400"><strong className="text-white">{currency(data.revenue)}</strong></span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ===== SIN RESULTADO ===== */}
      {activeTab === "unrecovered" && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2"><AlertTriangle size={20} className="text-red-400" /> Clientes sin resultado</h3>
          {(() => {
            const allDeliveries = campaigns.flatMap((c: any) => (c.campaign_deliveries || []).filter((d: any) => d.status === "sent" && d.conversion_status !== "converted"));
            const byCustomer: Record<string, { count: number; lastCampaign: string; lastSent: string }> = {};
            allDeliveries.forEach((d: any) => {
              if (!byCustomer[d.customer_id]) byCustomer[d.customer_id] = { count: 0, lastCampaign: "", lastSent: "" };
              byCustomer[d.customer_id].count++;
              if (!byCustomer[d.customer_id].lastSent || d.sent_at > byCustomer[d.customer_id].lastSent) {
                byCustomer[d.customer_id].lastSent = d.sent_at;
                byCustomer[d.customer_id].lastCampaign = d.campaign_id;
              }
            });
            const entries = Object.entries(byCustomer);
            const campaing1 = entries.filter(([, v]) => v.count === 1).length;
            const campaing2 = entries.filter(([, v]) => v.count === 2).length;
            const campaing3 = entries.filter(([, v]) => v.count >= 3).length;
            return (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 text-center">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">1 campaña sin respuesta</p>
                  <p className="text-3xl font-bold text-gray-100">{campaing1}</p>
                </div>
                <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 text-center">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">2 campañas sin respuesta</p>
                  <p className="text-3xl font-bold text-amber-400">{campaing2}</p>
                </div>
                <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 text-center">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">3+ campañas sin respuesta</p>
                  <p className="text-3xl font-bold text-red-400">{campaing3}</p>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return <div className="bg-gray-800 rounded-xl p-3"><p className="text-[10px] text-gray-500 uppercase">{label}</p><p className="text-base font-bold text-white">{value}</p></div>;
}

function GrowthCenterTab({
  customerData,
  growthCenter,
  growthScore,
  segmentCards,
  autoInsights,
  setActiveTab,
}: {
  customerData: any[];
  growthCenter: any;
  growthScore: number;
  segmentCards: any[];
  autoInsights: any[];
  setActiveTab: (tab: "growth" | "dashboard" | "campaigns" | "insights" | "recovered" | "unrecovered") => void;
}) {
  const totalCustomers = customerData.length;
  const topVip = customerData.filter((customer) => customer.value_tier === "vip").slice(0, 5);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[#07070A] p-5 text-white md:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-purple-300">CRM & Growth Center</p>
            <h2 className="mt-3 max-w-3xl text-4xl font-black uppercase leading-[0.9] tracking-[-0.06em] text-white md:text-6xl">
              Dinero escondido en tu base de clientes.
            </h2>
            <p className="mt-4 max-w-2xl text-sm font-medium leading-6 text-gray-400">
              Tu base de clientes esta generando oportunidades de venta automaticamente. Priorizamos impacto, no ruido.
            </p>
          </div>
          <div className="rounded-3xl border border-purple-500/30 bg-purple-500/10 p-5 text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-purple-300">Growth Score</p>
            <p className="mt-2 text-5xl font-black tracking-[-0.07em] text-white">{growthScore}</p>
            <p className="mt-1 text-xs font-bold uppercase text-gray-500">sobre 100</p>
          </div>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          <GrowthKpi label="Clientes totales" value={fmt(totalCustomers)} delta="+ base CRM" tone="purple" />
          <GrowthKpi label="Activos 30d" value={fmt(growthCenter.active30)} delta="+ ventas vivas" tone="emerald" />
          <GrowthKpi label="En riesgo" value={fmt(growthCenter.atRisk)} delta="accion hoy" tone="amber" />
          <GrowthKpi label="Dormidos" value={fmt(growthCenter.dormant)} delta="recuperables" tone="red" />
          <GrowthKpi label="Recuperados" value={fmt(growthCenter.recovered)} delta={currency(growthCenter.recoveredRevenue)} tone="emerald" />
          <GrowthKpi label="LTV total" value={currency(growthCenter.totalLtv)} delta="historico" tone="slate" />
          <GrowthKpi label="Recuperable" value={currency(growthCenter.recoverableRevenue)} delta="estimado" tone="amber" />
          <GrowthKpi label="Ticket prom." value={currency(growthCenter.avgTicket)} delta="base" tone="slate" />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-[24px] border border-white/10 bg-gray-950 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">Oportunidades de hoy</p>
              <h3 className="mt-2 text-2xl font-black uppercase tracking-[-0.05em] text-white">Acciones que pueden recuperar ventas</h3>
            </div>
            <button onClick={() => setActiveTab("campaigns")} className="rounded-full bg-purple-600 px-4 py-2 text-xs font-black uppercase text-white hover:bg-purple-500">
              Enviar campana
            </button>
          </div>
          <div className="mt-5 grid gap-3">
            {growthCenter.opportunities.map((opportunity: any, index: number) => (
              <OpportunityCard key={`${opportunity.segment}-${index}`} icon={opportunity.icon} title={opportunity.title} value={opportunity.value} action={opportunity.action} onClick={() => setActiveTab(index === 1 ? "dashboard" : "campaigns")} />
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-purple-500/20 bg-purple-950/20 p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-purple-300">Mordisco Growth AI</p>
          <h3 className="mt-3 text-3xl font-black uppercase leading-none tracking-[-0.06em] text-white">Copilot de crecimiento</h3>
          <div className="mt-5 space-y-3">
            {(autoInsights.length ? autoInsights : [{ title: "La IA esta esperando mas datos", description: "Cuando haya compras suficientes, va a detectar oportunidades automaticamente.", revenue: 0 }]).slice(0, 3).map((insight, index) => (
              <div key={index} className="rounded-2xl border border-white/10 bg-black/35 p-4">
                <p className="text-sm font-bold text-white">{insight.title}</p>
                <p className="mt-1 text-xs leading-5 text-gray-400">{insight.description}</p>
                {insight.revenue > 0 && <p className="mt-3 text-lg font-black text-emerald-400">Impacto estimado: {currency(insight.revenue)}</p>}
              </div>
            ))}
          </div>
          <button onClick={() => setActiveTab("insights")} className="mt-4 w-full rounded-full border border-purple-400/40 py-3 text-xs font-black uppercase text-purple-200 hover:bg-purple-500 hover:text-white">
            Ver analisis
          </button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-[24px] border border-white/10 bg-gray-950 p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">Funnel de clientes</p>
          <div className="mt-5 space-y-3">
            <FunnelStep label="Nuevos" count={segmentCards.find((s) => s.id === "new")?.customers || 0} value={segmentCards.find((s) => s.id === "new")?.ltv || 0} tone="emerald" />
            <FunnelStep label="Frecuentes" count={segmentCards.find((s) => s.id === "frequent")?.customers || 0} value={segmentCards.find((s) => s.id === "frequent")?.ltv || 0} tone="blue" />
            <FunnelStep label="VIP" count={segmentCards.find((s) => s.id === "vip")?.customers || 0} value={segmentCards.find((s) => s.id === "vip")?.ltv || 0} tone="purple" />
            <div className="my-4 h-px bg-white/10" />
            <FunnelStep label="En riesgo" count={growthCenter.atRisk} value={segmentCards.find((s) => s.id === "at_risk")?.potential || 0} tone="amber" />
            <FunnelStep label="Dormidos" count={growthCenter.dormant} value={growthCenter.recoverableRevenue} tone="red" />
          </div>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-gray-950 p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">Segmentos accionables</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {segmentCards.map((segment) => (
              <div key={segment.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black uppercase text-white">{segment.label}</p>
                    <p className="mt-1 text-xs text-gray-500">{segment.customers} clientes</p>
                  </div>
                  <p className="text-sm font-black text-emerald-400">{currency(segment.potential)}</p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <MiniMetric label="LTV" value={currency(segment.ltv)} />
                  <MiniMetric label="Ticket" value={currency(segment.avg)} />
                  <MiniMetric label="Ultima compra" value={`${Math.round(segment.avgDays || 0)}d`} />
                  <MiniMetric label="Potencial" value={currency(segment.potential)} />
                </div>
                <button onClick={() => setActiveTab("campaigns")} className="mt-4 w-full rounded-full bg-white px-3 py-2 text-[10px] font-black uppercase text-black hover:bg-purple-500 hover:text-white">
                  Crear campana
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[24px] border border-white/10 bg-gray-950 p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">Clientes que necesitan atencion</p>
          <div className="mt-5 grid gap-3">
            {growthCenter.attention.map((customer: any) => (
              <div key={customer.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-purple-600 text-sm font-black uppercase text-white">{String(customer.name || "M").slice(0, 1)}</div>
                  <div>
                    <p className="font-bold text-white">{customer.name}</p>
                    <p className="text-xs text-gray-500">{customer.totalOrders} pedidos / hace {customer.daysSinceLast} dias / {customer.segment}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-right sm:min-w-[330px]">
                  <MiniMetric label="LTV" value={currency(customer.ltv)} />
                  <MiniMetric label="Recompra" value={`${customer.repurchase}%`} />
                  <MiniMetric label="Recuperable" value={currency(customer.recoverable)} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[24px] border border-white/10 bg-gray-950 p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">Prediccion de ingresos</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <PredictionCard label="Proximos 7 dias" value={currency(growthCenter.projected7)} />
              <PredictionCard label="Proximos 30 dias" value={currency(growthCenter.projected30)} />
              <PredictionCard label="Probables regresos" value={fmt(growthCenter.likelyReturn)} />
              <PredictionCard label="Recuperables" value={fmt(growthCenter.atRisk + growthCenter.dormant)} />
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-gray-950 p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">VIP Club</p>
            <div className="mt-4 space-y-2">
              {topVip.map((customer, index) => (
                <div key={customer.id} className="flex items-center justify-between rounded-2xl bg-white/[0.04] px-3 py-2">
                  <span className="text-sm font-bold text-white">#{index + 1} {customer.name}</span>
                  <span className="text-xs font-black text-purple-300">{currency(customer.ltv)}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setActiveTab("campaigns")} className="mt-4 w-full rounded-full bg-purple-600 py-3 text-xs font-black uppercase text-white hover:bg-purple-500">Enviar mensaje exclusivo</button>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-white/10 bg-gray-950 p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">Mapa de retencion</p>
        <div className="mt-5 overflow-x-auto">
          <div className="min-w-[620px] space-y-2">
            <div className="grid grid-cols-[120px_repeat(6,1fr)] gap-2 text-[10px] font-bold uppercase text-gray-500">
              <span>Alta</span><span>M0</span><span>M1</span><span>M2</span><span>M3</span><span>M4</span><span>M5</span>
            </div>
            {growthCenter.cohorts.map((cohort: any) => (
              <div key={cohort.month} className="grid grid-cols-[120px_repeat(6,1fr)] gap-2">
                <div className="rounded-xl bg-white/[0.04] px-3 py-2 text-xs font-bold text-white">{cohort.month} <span className="text-gray-500">({cohort.size})</span></div>
                {cohort.retention.map((value: number, index: number) => (
                  <div key={index} className="rounded-xl px-3 py-2 text-center text-xs font-black text-white" style={{ backgroundColor: `rgba(139, 92, 246, ${Math.max(0.08, value / 100)})` }}>
                    {value}%
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-white/10 bg-gray-950 p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">Automatizaciones</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(growthCenter.automationStats.length ? growthCenter.automationStats : [{ name: "Dormidos 30d", sent: 0, recovered: 0, revenue: 0, roi: 0 }]).map((automation: any, index: number) => (
            <div key={index} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="font-black uppercase text-white">{automation.name}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <MiniMetric label="Enviados" value={fmt(automation.sent)} />
                <MiniMetric label="Recuperados" value={fmt(automation.recovered)} />
                <MiniMetric label="Revenue" value={currency(automation.revenue)} />
                <MiniMetric label="ROI" value={`${automation.roi.toFixed(1)}x`} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function GrowthKpi({ label, value, delta, tone }: { label: string; value: string; delta: string; tone: "purple" | "emerald" | "amber" | "red" | "slate" }) {
  const toneClass: Record<string, string> = {
    purple: "from-purple-500/25 to-purple-500/5 text-purple-300",
    emerald: "from-emerald-500/25 to-emerald-500/5 text-emerald-300",
    amber: "from-amber-500/25 to-amber-500/5 text-amber-300",
    red: "from-red-500/25 to-red-500/5 text-red-300",
    slate: "from-slate-500/20 to-slate-500/5 text-slate-300",
  };
  return (
    <div className={`rounded-2xl border border-white/10 bg-gradient-to-br ${toneClass[tone]} p-4`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">{label}</p>
      <p className="mt-3 truncate text-2xl font-black tracking-[-0.06em] text-white">{value}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase">{delta}</span>
        <span className="flex h-5 w-12 items-end gap-0.5">
          {[35, 55, 42, 76, 62].map((height, index) => (
            <i key={index} className="w-full rounded-full bg-current opacity-70" style={{ height: `${height}%` }} />
          ))}
        </span>
      </div>
    </div>
  );
}

function OpportunityCard({ icon: Icon, title, value, action, onClick }: { icon: any; title: string; value: string; action: string; onClick: () => void }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-purple-500/15 text-purple-300">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">{title}</p>
          <p className="mt-1 text-xl font-black tracking-[-0.04em] text-emerald-400">{value}</p>
        </div>
      </div>
      <button onClick={onClick} className="mt-4 rounded-full border border-white/10 px-4 py-2 text-[10px] font-black uppercase text-gray-300 hover:border-purple-400 hover:bg-purple-500 hover:text-white">
        {action}
      </button>
    </div>
  );
}

function FunnelStep({ label, count, value, tone }: { label: string; count: number; value: number; tone: "emerald" | "blue" | "purple" | "amber" | "red" }) {
  const color: Record<string, string> = {
    emerald: "bg-emerald-500",
    blue: "bg-sky-500",
    purple: "bg-purple-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
  };
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${color[tone]}`} />
          <p className="font-black uppercase text-white">{label}</p>
        </div>
        <p className="text-sm font-bold text-gray-400">{count} clientes</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${color[tone]}`} style={{ width: `${Math.min(100, Math.max(8, count * 4))}%` }} />
      </div>
      <p className="mt-2 text-xs font-bold uppercase text-gray-500">Valor asociado: <span className="text-white">{currency(value)}</span></p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/30 px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 truncate text-xs font-black text-white">{value}</p>
    </div>
  );
}

function PredictionCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-black tracking-[-0.06em] text-white">{value}</p>
    </div>
  );
}
