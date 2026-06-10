"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Users, Target, Zap, TrendingUp, CalendarClock, MessageCircle, Brain, Award, AlertTriangle, Clock, Send, Download, Play, Pause, ChevronRight, Star, DollarSign, ShoppingBag, FileText } from "lucide-react";

const fmt = (n: number) => n.toLocaleString("es-AR");
const currency = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function MarketingAIPage() {
  const [tenantId, setTenantId] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"dashboard" | "campaigns" | "insights" | "recovered" | "unrecovered">("dashboard");
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaignSegment, setCampaignSegment] = useState("dormant_30");
  const [campaignMessage, setCampaignMessage] = useState("");
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
      supabase.from("orders").select("customer_id, customer_name, total, type, created_at").eq("tenant_id", r.tenant_id).in("status", ["delivered", "sent", "ready"]).order("created_at", { ascending: false }).limit(5000),
      supabase.from("customers").select("id, name, phone, address, created_at").eq("tenant_id", r.tenant_id),
      supabase.from("marketing_insights").select("*").eq("tenant_id", r.tenant_id).eq("status", "active").order("priority", { ascending: false }).limit(20),
      supabase.from("campaigns").select("*, campaign_deliveries(customer_id, phone, status, sent_at)").eq("tenant_id", r.tenant_id).order("created_at", { ascending: false }).limit(20),
    ]);
    setOrders(ords.data || []);
    setCustomers(custs.data || []);
    setInsights(ins.data || []);
    setCampaigns(camps.data || []);
    // Run attribution check
    checkAttribution(ords.data || [], camps.data || []);
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
      const cid = o.customer_id || `anon-${o.customer_name}`;
      if (!byCustId[cid]) byCustId[cid] = [];
      byCustId[cid].push(o);
    });

    const customerMap = new Map(customers.map((c) => [c.id, c]));
    const result: any[] = [];

    Object.entries(byCustId).forEach(([cid, ords]) => {
      const customer = customerMap.get(cid);
      const totalOrders = ords.length;
      const totalSpent = ords.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
      const avgTicket = totalOrders > 0 ? totalSpent / totalOrders : 0;
      const firstOrderAt = ords[ords.length - 1]?.created_at || "";
      const lastOrderAt = ords[0]?.created_at || "";
      const daysSinceLast = lastOrderAt ? Math.max(0, Math.floor((Date.now() - new Date(lastOrderAt).getTime()) / 86400000)) : 999;
      const freq = totalOrders > 1 && firstOrderAt ? Math.max(1, Math.floor((new Date(lastOrderAt).getTime() - new Date(firstOrderAt).getTime()) / 86400000)) / (totalOrders - 1) : 999;
      const orders30d = ords.filter((o: any) => { const d = new Date(o.created_at); return Date.now() - d.getTime() < 30 * 86400000; }).length;
      const deliveryCount = ords.filter((o: any) => o.type === "delivery").length;
      const pickupCount = ords.filter((o: any) => o.type !== "delivery").length;
      const name = customer?.name || ords[0]?.customer_name || "Anónimo";
      const phone = customer?.phone || "";

      // Segment
      let segment = "new";
      if (totalOrders >= 5) segment = "vip";
      else if (totalOrders >= 2) segment = "frequent";
      else if (daysSinceLast >= 30 && daysSinceLast < 60) segment = "dormant_30";
      else if (daysSinceLast >= 60 && daysSinceLast < 90) segment = "dormant_60";
      else if (daysSinceLast >= 90) segment = "dormant_90";
      else if (daysSinceLast >= 15) segment = "at_risk";

      result.push({ id: cid, name, phone, totalOrders, totalSpent, avgTicket, firstOrderAt, lastOrderAt, daysSinceLast, freq, orders30d, deliveryCount, pickupCount, segment, orders: ords, ltv: totalSpent });
    });

    return result.sort((a, b) => b.ltv - a.ltv);
  }, [orders, customers]);

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
    if (dormantTotal > 0) msgs.push({ type: "reactivation", priority: 10, title: `Hay ${dormantTotal} clientes dormidos`, description: `${dormantTotal} clientes sin comprar hace m\u00e1s de 30 d\u00edas representan ${currency(dormantValue)} en LTV`, action: "Lanzar campa\u00f1a de reactivaci\u00f3n segmentada", revenue: dormantValue * 0.15 });
    if (vipShare > 0.3) msgs.push({ type: "vip", priority: 8, title: `VIP generan ${fmtPct(vipShare)} de facturaci\u00f3n`, description: `${segmentCounts["vip"]} clientes VIP concentran ${fmtPct(vipShare)} de los ingresos`, action: "Programar campa\u00f1a exclusiva VIP", revenue: segmentRevenue["vip"] * 0.05 });
    const freqOrders = customerData.filter((c) => c.freq > 0 && c.totalOrders >= 3);
    if (freqOrders.length > 0) {
      const avgFreq = freqOrders.reduce((s, c) => s + c.freq, 0) / freqOrders.length;
      msgs.push({ type: "frequency", priority: 6, title: `Frecuencia promedio: ${Math.round(avgFreq)} d\u00edas`, description: `Los clientes recurrentes vuelven cada ${Math.round(avgFreq)} d\u00edas en promedio`, action: "Optimizar campa\u00f1as seg\u00fan frecuencia", revenue: 0 });
    }
    const recovered = customerData.filter((c) => c.totalOrders >= 2 && c.daysSinceLast <= 15);
    if (recovered.length > 0) msgs.push({ type: "recovered", priority: 5, title: `${recovered.length} clientes recuperados`, description: `Clientes que volvieron a comprar despu\u00e9s de estar inactivos`, action: "Reforzar retenci\u00f3n de recuperados", revenue: recovered.reduce((s, c) => s + c.avgTicket, 0) * 0.1 });
    return msgs.sort((a, b) => b.priority - a.priority);
  }, [customerData]);

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

  const launchCampaign = async () => {
    if (!tenantId || !campaignName) return;
    const segMap: Record<string, string> = { dormant_30: "Dormidos 30d", dormant_60: "Dormidos 60d", dormant_90: "Dormidos 90d", at_risk: "En riesgo", new: "Nuevos", frequent: "Frecuentes", vip: "VIP" };
    const target = customerData.filter((c) => c.segment === campaignSegment);
    const { data: camp } = await supabase.from("campaigns").insert({
      tenant_id: tenantId, name: campaignName, segment_name: segMap[campaignSegment] || campaignSegment,
      target_count: target.length, message_template: campaignMessage || null, status: "draft",
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
    setShowNewCampaign(false); setCampaignName(""); load();
  };

  const sendCampaignBatch = async (campaign: any) => {
    if (sendingCampaign) return;
    setSendingCampaign(true);

    // Get all pending deliveries for this campaign
    const { data: deliveries } = await supabase
      .from("campaign_deliveries")
      .select("*, customers(name)")
      .eq("campaign_id", campaign.id)
      .eq("status", "pending")
      .limit(campaignBatchSize);

    if (!deliveries || deliveries.length === 0) {
      // Mark campaign as sent
      await supabase.from("campaigns").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", campaign.id);
      alert("Campaña completada");
      setSendingCampaign(false); load(); return;
    }

    // Get branch slug for sending
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSendingCampaign(false); return; }
    const { data: r } = await supabase.from("users").select("tenant_id, branch_id").eq("id", u.user.id).single();
    if (!r?.branch_id) { setSendingCampaign(false); return; }
    const { data: branch } = await supabase.from("branches").select("slug").eq("id", r.branch_id).single();
    if (!branch) { setSendingCampaign(false); return; }

    let sent = 0, failed = 0;
    for (const delivery of deliveries) {
      const customerName = (delivery as any).customers?.name || "cliente";
      const personalizedMessage = (campaign.message_template || "").replace(/\{nombre\}/gi, customerName);
      try {
        const res = await fetch("https://whatsapp.mordiscoburgers.com.ar/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: "mordiscoburgers",
            branchId: branch.slug,
            phone: `549${delivery.phone}`,
            message: personalizedMessage,
          }),
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
    if (!testPhone || !campaignMessage) return;
    setTesting(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setTesting(false); return; }
    const { data: r } = await supabase.from("users").select("tenant_id, branch_id").eq("id", u.user.id).single();
    if (!r?.branch_id) { alert("No hay sucursal asignada"); setTesting(false); return; }
    const { data: branch } = await supabase.from("branches").select("slug").eq("id", r.branch_id).single();
    if (!branch) { alert("Sucursal no encontrada"); setTesting(false); return; }

    const phone = `549${testPhone.replace(/\D/g, "")}`;
    // Replace {nombre} with "test" for the test message
    const personalizedMessage = campaignMessage.replace(/\{nombre\}/gi, "test");
    try {
      const response = await fetch("https://whatsapp.mordiscoburgers.com.ar/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: "mordiscoburgers",
          branchId: branch.slug,
          phone,
          message: personalizedMessage,
        }),
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
    const report = {
      generado: new Date().toISOString(),
      tenant_id: tenantId,
      growth_score: growthScore,
      segmentos: segments.map((seg) => ({ segmento: seg, label: segmentLabels[seg], clientes: segmentCounts[seg], ltv_total: Math.round(segmentRevenue[seg]) })),
      insights: autoInsights.map((i) => ({ tipo: i.type, prioridad: i.priority, titulo: i.title, descripcion: i.description, accion: i.action, impacto_estimado: Math.round(i.revenue) })),
      campanas: campaigns.map((c: any) => ({ id: c.id, nombre: c.name, segmento: c.segment_name, target: c.target_count, estado: c.status, creada: c.created_at })),
      top_clientes: customerData.slice(0, 50).map((c) => ({
        nombre: c.name, telefono: c.phone, segmento: c.segment, pedidos: c.totalOrders,
        ticket_promedio: Math.round(c.avgTicket), ltv: Math.round(c.ltv), dias_ultimo_pedido: c.daysSinceLast,
      })),
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
      <div className="flex gap-1 bg-gray-900 border border-gray-700 rounded-xl p-1">
        {([{ id: "dashboard", label: "Dashboard IA", icon: Brain }, { id: "campaigns", label: "Campañas", icon: Send }, { id: "insights", label: "Insights", icon: Zap }] as const).map((tab) => (
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
              <div>
                <label className="block text-[10px] text-gray-500 uppercase mb-1">
                  Mensaje personalizado <span className="text-gray-600">(usá <code className="text-purple-400 bg-purple-900/30 px-1 rounded">{'{nombre}'}</code> para el nombre del cliente)</span>
                </label>
                <textarea value={campaignMessage} onChange={(e) => setCampaignMessage(e.target.value)} rows={3}
                  className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Ej: Hola {nombre}! Vimos que hace tiempo no vienes. Te invitamos un 20% OFF." />
              </div>
              {/* Test send */}
              <div className="bg-gray-800 rounded-xl p-3 border border-gray-700">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">📱 Probar campaña</p>
                <div className="flex gap-2">
                  <input value={testPhone} onChange={(e) => setTestPhone(e.target.value.replace(/\D/g, ""))}
                    className="flex-1 border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-900 text-gray-100 placeholder-gray-500"
                    placeholder="Tu número de WhatsApp (ej: 3794123456)" />
                  <button onClick={testCampaign} disabled={!testPhone || !campaignMessage || testing}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-500 transition disabled:opacity-40 flex items-center gap-2 whitespace-nowrap">
                    {testing ? "Enviando..." : "Enviar prueba"}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">Segmento: {segmentLabels[campaignSegment]} · {customerData.filter((c) => c.segment === campaignSegment).length} clientes</p>
                <div className="flex gap-2">
                  <button onClick={() => setShowNewCampaign(false)} className="px-4 py-2 bg-gray-800 text-gray-400 rounded-lg text-sm hover:bg-gray-750 border border-gray-700">Cancelar</button>
                  <button onClick={launchCampaign} disabled={!campaignName}
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
              const recovered = customerData.filter((c) =>
                deliveries.some((d: any) => d.customer_id === c.id) && c.daysSinceLast <= 7
              ).length;
              return (
                <div key={camp.id} className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-100">{camp.name}</p>
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
