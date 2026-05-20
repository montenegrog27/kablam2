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

  // Previous day & week for comparisons
  const prevDate = new Date(dateStr);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDayStr = prevDate.toISOString().split("T")[0];

  const weekAgo = new Date(dateStr);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().split("T")[0];
  const weekStart = `${weekAgoStr}T00:00:00`;

  // ──────────────────────────────────────────────
  // 1. ORDERS (current day)
  // ──────────────────────────────────────────────
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
  const cashIn = orders?.reduce((s, o) => s + Number(o.paid_amount || o.total), 0) || 0;
  const deliveryOrders = orders?.filter((o) => o.type === "delivery").length || 0;
  const takeawayOrders = orders?.filter((o) => o.type === "takeaway").length || 0;
  const avgTicket = totalOrders > 0 ? grossRevenue / totalOrders : 0;

  // ──────────────────────────────────────────────
  // 2. PREVIOUS DAY & WEEK (for comparisons)
  // ──────────────────────────────────────────────
  const { data: prevOrders } = await supabase
    .from("orders")
    .select("total, shipping_cost, discount")
    .eq("tenant_id", tenantId)
    .gte("created_at", `${prevDayStr}T00:00:00`)
    .lte("created_at", `${prevDayStr}T23:59:59`)
    .in("status", ["delivered", "sent", "ready", "confirmed", "preparing"]);

  const prevRevenue = prevOrders?.reduce((s, o) => s + Number(o.total), 0) || 0;

  const { data: weekOrders } = await supabase
    .from("orders")
    .select("total, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", weekStart)
    .lte("created_at", end)
    .in("status", ["delivered", "sent", "ready", "confirmed", "preparing"]);

  // Daily averages over last 7 days
  const weekDays = new Map<string, number>();
  weekOrders?.forEach((o) => {
    const day = new Date(o.created_at).toISOString().split("T")[0];
    weekDays.set(day, (weekDays.get(day) || 0) + Number(o.total));
  });
  const avgDailySales = weekDays.size > 0 ? [...weekDays.values()].reduce((a, b) => a + b, 0) / weekDays.size : 0;

  // Previous day sales total for comparison
  const prevDaySales = weekDays.get(prevDayStr) || 0;

  // Sales 7 days ago (same weekday last week)
  const lastWeekDay = new Date(dateStr);
  lastWeekDay.setDate(lastWeekDay.getDate() - 7);
  const lastWeekStr = lastWeekDay.toISOString().split("T")[0];
  const lastWeekSales = weekDays.get(lastWeekStr) || 0;

  // ──────────────────────────────────────────────
  // 3. SALES BY HOUR
  // ──────────────────────────────────────────────
  const hourBuckets: Record<number, { count: number; revenue: number }> = {};
  for (let i = 0; i < 24; i++) hourBuckets[i] = { count: 0, revenue: 0 };
  orders?.forEach((o) => {
    const h = new Date(o.created_at).getHours();
    if (!hourBuckets[h]) hourBuckets[h] = { count: 0, revenue: 0 };
    hourBuckets[h].count++;
    hourBuckets[h].revenue += Number(o.total);
  });

  // ──────────────────────────────────────────────
  // 4. TOP PRODUCTS
  // ──────────────────────────────────────────────
  const productSales: Record<string, { name: string; qty: number; revenue: number }> = {};
  orders?.forEach((o) => {
    (o.order_items || []).forEach((item: any) => {
      const pid = item.product_id;
      if (!productSales[pid]) productSales[pid] = { name: item.products?.name || "Producto", qty: 0, revenue: 0 };
      productSales[pid].qty += item.quantity || 1;
      productSales[pid].revenue += Number(item.total) || 0;
    });
  });

  // ──────────────────────────────────────────────
  // 5. PAYMENT METHODS
  // ──────────────────────────────────────────────
  const payMethods: Record<string, { count: number; total: number }> = {};
  orders?.forEach((o) => {
    const pm = o.order_payments?.[0]?.payment_method_id || "unknown";
    if (!payMethods[pm]) payMethods[pm] = { count: 0, total: 0 };
    payMethods[pm].count++;
    payMethods[pm].total += Number(o.total);
  });

  // ──────────────────────────────────────────────
  // 6. EXPENSES (current day)
  // ──────────────────────────────────────────────
  const { data: expenses } = await supabase
    .from("expenses")
    .select("*, expense_categories(name)")
    .eq("tenant_id", tenantId)
    .gte("expense_date", dateStr)
    .lte("expense_date", dateStr);

  const totalExpenses = expenses?.reduce((s, e) => s + Number(e.total), 0) || 0;

  const expByCat: Record<string, number> = {};
  expenses?.forEach((e) => {
    const cat = e.expense_categories?.name || "Sin categoría";
    expByCat[cat] = (expByCat[cat] || 0) + Number(e.total);
  });

  // Classify expenses into financial categories
  const catLower = Object.fromEntries(
    Object.entries(expByCat).map(([k, v]) => [k.toLowerCase(), v])
  );

  const deliveryCosts = Object.entries(catLower)
    .filter(([k]) => /delivery|envío|transporte|combustible|envio|flete|logística/i.test(k))
    .reduce((s, [, v]) => s + v, 0);
  const marketingCosts = Object.entries(catLower)
    .filter(([k]) => /marketing|publicidad|ads|facebook|instagram|google|promoción/i.test(k))
    .reduce((s, [, v]) => s + v, 0);
  const salaryCosts = Object.entries(catLower)
    .filter(([k]) => /sueldo|salario|personal|empleado|honorario|sueldos/i.test(k))
    .reduce((s, [, v]) => s + v, 0);
  const fixedCosts = Object.entries(catLower)
    .filter(([k]) => /alquiler|servicio|electricidad|agua|gas|internet|seguro|impuesto|municipal/i.test(k))
    .reduce((s, [, v]) => s + v, 0);
  const otherCosts = totalExpenses - deliveryCosts - marketingCosts - salaryCosts - fixedCosts;

  // ──────────────────────────────────────────────
  // 7. CMV (Cost of Goods Sold) — ingredients + packaging
  // ──────────────────────────────────────────────
  let cmv = 0;
  let cmvDetails: { product: string; cost: number; type: string }[] = [];
  try {
    const itemVariantIds = orders?.flatMap((o) =>
      (o.order_items || []).map((i: any) => i.variant_id).filter(Boolean)
    ) || [];
    const uniqueVariantIds = [...new Set(itemVariantIds)];

    if (uniqueVariantIds.length > 0) {
      // Ingredient costs
      const { data: recipes } = await supabase
        .from("product_recipes")
        .select("variant_id, quantity, ingredients(name, cost_per_unit)")
        .in("variant_id", uniqueVariantIds);

      const variantCost: Record<string, number> = {};
      recipes?.forEach((r) => {
        variantCost[r.variant_id] = (variantCost[r.variant_id] || 0) + (r.quantity || 0) * Number((r.ingredients as any)?.cost_per_unit || 0);
      });

      // Packaging costs
      const { data: pkgRecipes } = await supabase
        .from("product_packaging")
        .select("variant_id, quantity, packaging(name, cost_per_unit)")
        .in("variant_id", uniqueVariantIds);

      const variantPkgCost: Record<string, number> = {};
      pkgRecipes?.forEach((r) => {
        variantPkgCost[r.variant_id] = (variantPkgCost[r.variant_id] || 0) + (r.quantity || 0) * Number((r.packaging as any)?.cost_per_unit || 0);
      });

      // Calculate CMV from order items
      orders?.forEach((o) => {
        (o.order_items || []).forEach((item: any) => {
          const ingCost = variantCost[item.variant_id] || 0;
          const pkgCost = variantPkgCost[item.variant_id] || 0;
          const totalItemCost = (ingCost + pkgCost) * (item.quantity || 1);
          cmv += totalItemCost;
          cmvDetails.push({
            product: item.products?.name || "N/A",
            cost: totalItemCost,
            type: ingCost > 0 && pkgCost > 0 ? "ingredientes+packaging" : ingCost > 0 ? "ingredientes" : "packaging",
          });
        });
      });
    }
  } catch (e) {
    console.error("CMV error:", e);
  }

  // ──────────────────────────────────────────────
  // 8. P&L SUMMARY
  // ──────────────────────────────────────────────
  const netRevenue = grossRevenue - discountTotal;
  const grossProfit = netRevenue - cmv;
  const netProfit = grossProfit - totalExpenses;
  const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
  const netMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

  const netProfitReal = netProfit;
  const netMarginReal = netRevenue > 0 ? (netProfitReal / netRevenue) * 100 : 0;

  const deliveryCostPct = grossRevenue > 0 ? (deliveryCosts / grossRevenue) * 100 : 0;

  // ──────────────────────────────────────────────
  // 9. CASHFLOW
  // ──────────────────────────────────────────────
  const cashOut = totalExpenses;
  const currentCash = cashIn - cashOut;
  const projected7d = avgDailySales * 7;

  // ──────────────────────────────────────────────
  // 10. ALERTS (intelligent)
  // ──────────────────────────────────────────────
  const alerts: string[] = [];

  if (deliveryCostPct > 18) {
    alerts.push(`🔴 Delivery cost exceeded 18% of sales (${deliveryCostPct.toFixed(1)}%)`);
  }
  if (netMarginReal < 10 && netMarginReal >= 0) {
    alerts.push(`🟡 Profit margin below 10% (${netMarginReal.toFixed(1)}%)`);
  } else if (netMarginReal < 0) {
    alerts.push(`🔴 Negative profit margin (${netMarginReal.toFixed(1)}%) — urgent review needed`);
  }
  if (prevRevenue > 0) {
    const vsPrevDay = ((grossRevenue - prevRevenue) / prevRevenue) * 100;
    if (vsPrevDay < -15) {
      alerts.push(`🔴 Sales dropped ${Math.abs(vsPrevDay).toFixed(0)}% vs yesterday`);
    } else if (vsPrevDay > 30) {
      alerts.push(`🟢 Sales surged ${vsPrevDay.toFixed(0)}% vs yesterday`);
    }
  }
  if (lastWeekSales > 0) {
    const vsLastWeek = ((grossRevenue - lastWeekSales) / lastWeekSales) * 100;
    if (vsLastWeek < -20) {
      alerts.push(`🔴 Sales dropped ${Math.abs(vsLastWeek).toFixed(0)}% vs same day last week`);
    } else if (vsLastWeek > 40) {
      alerts.push(`🟢 Sales surged ${vsLastWeek.toFixed(0)}% vs same day last week`);
    }
  }
  if (totalOrders > 0 && avgTicket < 5000) {
    alerts.push(`🟡 Low average ticket ($${Math.round(avgTicket).toLocaleString("es-AR")}) — consider upselling`);
  }
  if (cmv > 0 && grossRevenue > 0) {
    const cmvPct = (cmv / grossRevenue) * 100;
    if (cmvPct > 45) {
      alerts.push(`🔴 CMV is ${cmvPct.toFixed(1)}% of revenue — food cost too high (target < 35%)`);
    } else if (cmvPct > 35) {
      alerts.push(`🟡 CMV is ${cmvPct.toFixed(1)}% of revenue — above target (target < 35%)`);
    }
  }
  if (deliveryOrders > 0 && totalOrders > 0) {
    const deliveryPct = (deliveryOrders / totalOrders) * 100;
    if (deliveryPct > 80) {
      alerts.push(`🟡 ${deliveryPct.toFixed(0)}% of orders are delivery — high dependency on delivery platforms`);
    }
  }
  if (totalOrders === 0) {
    alerts.push(`⚠️ No orders registered for this date`);
  }

  // ──────────────────────────────────────────────
  // BUILD REPORT
  // ──────────────────────────────────────────────
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

    finanzas: {
      cmv_total: Math.round(cmv),
      delivery_costs: Math.round(deliveryCosts),
      marketing_costs: Math.round(marketingCosts),
      salary_costs: Math.round(salaryCosts),
      fixed_costs: Math.round(fixedCosts),
      other_costs: Math.round(otherCosts),
      net_profit_real: Math.round(netProfitReal),
      net_margin_real: Math.round(netMarginReal * 100) / 100,
    },

    cashflow: {
      cash_in: Math.round(cashIn),
      cash_out: Math.round(cashOut),
      current_cash: Math.round(currentCash),
      projected_7d: Math.round(projected7d),
      avg_daily_sales: Math.round(avgDailySales),
    },

    comparativas: {
      vs_ayer: {
        ventas: Math.round(grossRevenue - prevRevenue),
        ventas_pct: prevRevenue > 0 ? Math.round(((grossRevenue - prevRevenue) / prevRevenue) * 100) : 0,
      },
      vs_misma_semana: {
        ventas_pct: lastWeekSales > 0 ? Math.round(((grossRevenue - lastWeekSales) / lastWeekSales) * 100) : 0,
      },
    },

    alerts,

    cmv_detalle: cmvDetails.slice(0, 50).map((d) => ({
      producto: d.product,
      costo: Math.round(d.cost),
      tipo: d.type,
    })),
  };

  return NextResponse.json(report);
}
