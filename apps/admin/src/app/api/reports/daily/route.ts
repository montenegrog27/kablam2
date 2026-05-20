import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const dateStr = url.searchParams.get("date") || new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const tenantId = url.searchParams.get("tenantId");

  if (!tenantId) {
    return NextResponse.json({ error: "tenantId required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const start = `${dateStr}T00:00:00`;
  const end = `${dateStr}T23:59:59`;

  // 1. Orders
  const { data: orders } = await supabase
    .from("orders")
    .select("*, order_items(*, products(name)), order_payments(*), riders(name)")
    .eq("tenant_id", tenantId)
    .gte("created_at", start)
    .lte("created_at", end)
    .in("status", ["delivered", "sent", "ready", "confirmed", "preparing"]);

  const totalOrders = orders?.length || 0;
  const grossRevenue = orders?.reduce((s, o) => s + Number(o.total), 0) || 0;
  const subtotalRev = orders?.reduce((s, o) => s + Number(o.subtotal || o.total), 0) || 0;
  const shippingRev = orders?.reduce((s, o) => s + Number(o.shipping_cost || 0), 0) || 0;
  const discountTotal = orders?.reduce((s, o) => s + Number(o.discount || 0), 0) || 0;
  const deliveryOrders = orders?.filter((o) => o.type === "delivery").length || 0;
  const takeawayOrders = orders?.filter((o) => o.type === "takeaway").length || 0;
  const avgTicket = totalOrders > 0 ? grossRevenue / totalOrders : 0;

  // 2. Sales by hour
  const hourBuckets: Record<number, { count: number; revenue: number }> = {};
  for (let i = 0; i < 24; i++) hourBuckets[i] = { count: 0, revenue: 0 };
  orders?.forEach((o) => {
    const h = new Date(o.created_at).getHours();
    if (!hourBuckets[h]) hourBuckets[h] = { count: 0, revenue: 0 };
    hourBuckets[h].count++;
    hourBuckets[h].revenue += Number(o.total);
  });

  // 3. Top products
  const productSales: Record<string, { name: string; qty: number; revenue: number }> = {};
  orders?.forEach((o) => {
    (o.order_items || []).forEach((item: any) => {
      const pid = item.product_id;
      if (!productSales[pid]) productSales[pid] = { name: item.products?.name || "Producto", qty: 0, revenue: 0 };
      productSales[pid].qty += item.quantity || 1;
      productSales[pid].revenue += Number(item.total) || 0;
    });
  });

  // 4. Sales by payment method
  const payMethods: Record<string, { count: number; total: number }> = {};
  orders?.forEach((o) => {
    const pm = o.order_payments?.[0]?.payment_method_id || "unknown";
    if (!payMethods[pm]) payMethods[pm] = { count: 0, total: 0 };
    payMethods[pm].count++;
    payMethods[pm].total += Number(o.total);
  });

  // 5. Expenses
  const { data: expenses } = await supabase
    .from("expenses")
    .select("*, expense_categories(name)")
    .eq("tenant_id", tenantId)
    .gte("expense_date", dateStr)
    .lte("expense_date", dateStr);

  const totalExpenses = expenses?.reduce((s, e) => s + Number(e.total), 0) || 0;

  // Expenses by category
  const expByCat: Record<string, number> = {};
  expenses?.forEach((e) => {
    const cat = e.expense_categories?.name || "Sin categoría";
    expByCat[cat] = (expByCat[cat] || 0) + Number(e.total);
  });

  // 6. CMV (Cost of Goods Sold)
  // Get all variant IDs from order items, then get recipes with ingredient costs
  let cmv = 0;
  let cmvDetails: { product: string; cost: number }[] = [];
  try {
    const itemVariantIds = orders?.flatMap((o) =>
      (o.order_items || []).map((i: any) => i.variant_id).filter(Boolean)
    ) || [];
    const uniqueVariantIds = [...new Set(itemVariantIds)];

    if (uniqueVariantIds.length > 0) {
      const { data: recipes } = await supabase
        .from("product_recipes")
        .select("variant_id, quantity, ingredients(name, cost_per_unit)")
        .in("variant_id", uniqueVariantIds);

      // Calculate cost per variant
      const variantCost: Record<string, number> = {};
      recipes?.forEach((r) => {
        variantCost[r.variant_id] = (variantCost[r.variant_id] || 0) + (r.quantity || 0) * Number((r.ingredients as any)?.cost_per_unit || 0);
      });

      // Calculate CMV from order items
      orders?.forEach((o) => {
        (o.order_items || []).forEach((item: any) => {
          const cost = variantCost[item.variant_id] || 0;
          cmv += cost * (item.quantity || 1);
          cmvDetails.push({ product: item.products?.name || "N/A", cost: cost * (item.quantity || 1) });
        });
      });
    }
  } catch (e) {
    console.error("CMV calculation error:", e);
  }

  // 7. Summary
  const netRevenue = grossRevenue - discountTotal;
  const grossProfit = netRevenue - cmv;
  const netProfit = grossProfit - totalExpenses;
  const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
  const netMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

  const report = {
    date: dateStr,
    generated_at: new Date().toISOString(),

    resumen_ejecutivo: {
      ingresos_brutos: Math.round(grossRevenue),
      descuentos: Math.round(discountTotal),
      ingresos_netos: Math.round(netRevenue),
      envios: Math.round(shippingRev),
      cmv: Math.round(cmv),
      ganancia_bruta: Math.round(grossProfit),
      margen_bruto: Math.round(grossMargin * 100) / 100,
      gastos_operativos: Math.round(totalExpenses),
      ganancia_neta: Math.round(netProfit),
      margen_neto: Math.round(netMargin * 100) / 100,
    },

    ventas: {
      total_pedidos: totalOrders,
      ticket_promedio: Math.round(avgTicket),
      delivery: deliveryOrders,
      takeaway: takeawayOrders,
      subtotal: Math.round(subtotalRev),
      envio: Math.round(shippingRev),
      descuentos: Math.round(discountTotal),
      total: Math.round(grossRevenue),
    },

    ventas_por_hora: Object.entries(hourBuckets).map(([h, data]) => ({
      hora: `${h.padStart(2, "0")}:00`,
      pedidos: data.count,
      ingresos: Math.round(data.revenue),
    })),

    top_productos: Object.entries(productSales)
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .slice(0, 20)
      .map(([id, data], i) => ({
        rank: i + 1,
        producto: data.name,
        unidades: data.qty,
        ingresos: Math.round(data.revenue),
      })),

    ventas_por_pago: Object.entries(payMethods).map(([method, data]) => ({
      metodo: method,
      pedidos: data.count,
      total: Math.round(data.total),
    })),

    gastos: {
      total: Math.round(totalExpenses),
      por_categoria: Object.entries(expByCat).map(([cat, amt]) => ({
        categoria: cat,
        monto: Math.round(amt),
      })),
    },

    cmv_detalle: cmvDetails.slice(0, 50).map((d) => ({
      producto: d.product,
      costo: Math.round(d.cost),
    })),
  };

  return NextResponse.json(report);
}
