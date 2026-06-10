import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getComboCostMap, getProductCostMap, getVariantCostMap } from "@kablam/supabase/costs";

const ARGENTINA_OFFSET = "-03:00";
const MIN_OVERNIGHT_REPORT_END = 90; // 01:30 del dia siguiente, para jornadas que se estiran.

type BranchHour = {
  branch_id: string;
  day_of_week: number;
  open_time?: string | null;
  close_time?: string | null;
  is_closed?: boolean | null;
};

function addDays(dateStr: string, days: number) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().split("T")[0];
}

function dayOfWeek(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function timeToMinutes(value?: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function minutesToUtcIso(dateStr: string, absoluteMinutes: number) {
  const date = addDays(dateStr, Math.floor(absoluteMinutes / 1440));
  const minutes = ((absoluteMinutes % 1440) + 1440) % 1440;
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return new Date(`${date}T${hour}:${minute}:00${ARGENTINA_OFFSET}`).toISOString();
}

function buildBusinessWindow(dateStr: string, branchHours: BranchHour[]) {
  const hoursForDay = branchHours.filter((hour) => Number(hour.day_of_week) === dayOfWeek(dateStr) && !hour.is_closed);
  const ranges = hoursForDay
    .map((hour) => {
      const open = timeToMinutes(hour.open_time);
      const close = timeToMinutes(hour.close_time);
      if (open === null || close === null) return null;
      const crossesMidnight = close <= open;
      const reportClose = crossesMidnight ? Math.max(close + 1440, 1440 + MIN_OVERNIGHT_REPORT_END) : close;
      return {
        open,
        close: reportClose,
      };
    })
    .filter((range): range is { open: number; close: number } => Boolean(range));

  if (ranges.length === 0) {
    return {
      start: minutesToUtcIso(dateStr, 0),
      end: minutesToUtcIso(dateStr, 1440),
      label: "00:00 a 00:00",
      usesBusinessHours: false,
    };
  }

  const startMinutes = Math.min(...ranges.map((range) => range.open));
  const endMinutes = Math.max(...ranges.map((range) => range.close));
  const startLabel = `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`;
  const endLocalMinutes = endMinutes % 1440;
  const endLabel = `${String(Math.floor(endLocalMinutes / 60)).padStart(2, "0")}:${String(endLocalMinutes % 60).padStart(2, "0")}`;

  return {
    start: minutesToUtcIso(dateStr, startMinutes),
    end: minutesToUtcIso(dateStr, endMinutes),
    label: `${startLabel} a ${endLabel}${endMinutes >= 1440 ? " del dia siguiente" : ""}`,
    usesBusinessHours: true,
  };
}

function getArgentinaHour(value: string) {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    hour12: false,
  }).format(new Date(value));
  return Number(hour);
}

function isPromotionLikeItem(order: any, item: any) {
  return item.item_type === "promotion" || (
    !item.product_id &&
    !item.combo_id &&
    !item.variant_id &&
    Array.isArray(order.discount_breakdown) &&
    order.discount_breakdown.length > 0
  );
}

function getItemPromotion(order: any, item: any) {
  const breakdown = order.discount_breakdown || [];
  return breakdown.find((entry: any) =>
    entry?.promotionId &&
    (item.extras || []).some((extra: any) => extra?.type === "promotion" && extra?.name === entry.promotionName),
  ) || breakdown[0];
}

function getOrderItemLabel(order: any, item: any) {
  if (item.products?.name) return item.products.name;
  if (item.combos?.name) return item.combos.name;

  if (item.item_type === "promotion") {
    const promotionExtra = Array.isArray(item.extras)
      ? item.extras.find((extra: any) => extra?.type === "promotion" && extra?.name)
      : null;
    if (promotionExtra?.name) return promotionExtra.name;

    const promotion = getItemPromotion(order, item);
    if (promotion?.promotionName) return promotion.promotionName;
  }

  const namedExtra = Array.isArray(item.extras)
    ? item.extras.find((extra: any) => extra?.name && extra?.type !== "removed")
    : null;
  if (namedExtra?.name) return namedExtra.name;

  if (item.combo_id) return `Combo ${String(item.combo_id).slice(0, 8)}`;
  if (item.product_id) return `Producto ${String(item.product_id).slice(0, 8)}`;
  return "Item sin nombre";
}

function getOrderItemKey(item: any, label: string) {
  if (item.product_id) return `product:${item.product_id}`;
  if (item.combo_id) return `combo:${item.combo_id}`;
  if (item.item_type === "promotion") return `promotion:${label}`;
  return `item:${label}`;
}

function isBurgerProduct(product: any) {
  const text = `${product?.name || ""} ${product?.categories?.name || ""}`.toLowerCase();
  return /hamburg|burger|cheese|bacon|doble|triple|medallon|medall[oó]n/.test(text);
}

function getPct(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}

function roundMoney(value: number) {
  return Math.round(value);
}

function getMonthlyEquivalentFromRecurringItem(item: any) {
  const amount = Number(item?.amount || 0);
  const frequency = item?.frequency || "MONTHLY";
  if (frequency === "WEEKLY") return amount * 52 / 12;
  if (frequency === "BIWEEKLY") return amount * 26 / 12;
  if (frequency === "EVERY_X_DAYS") {
    const days = Math.max(1, Number(item?.everyDays || 1));
    return amount * 30 / days;
  }
  if (frequency === "MANUAL") return 0;
  return amount;
}

function getFrequencyDays(item: any) {
  const frequency = item?.frequency || "MONTHLY";
  if (frequency === "WEEKLY") return 7;
  if (frequency === "BIWEEKLY") return 15;
  if (frequency === "EVERY_X_DAYS") return Math.max(1, Number(item?.everyDays || 1));
  if (frequency === "MONTHLY") return 30;
  return null;
}

function addCalendarDays(dateStr: string, days: number) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().split("T")[0];
}

function getDaysBetween(startDate: string, endDate: string) {
  const startMs = new Date(`${startDate}T00:00:00Z`).getTime();
  const endMs = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.ceil((endMs - startMs) / 86400000);
}

function getRecurringItems(value: any) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      id: item?.id || "",
      name: String(item?.name || "").trim(),
      amount: Number(item?.amount || 0),
      frequency: item?.frequency || "MONTHLY",
      everyDays: Number(item?.everyDays || 0),
      lastPaidAt: item?.lastPaidAt || null,
      monthlyEquivalent: getMonthlyEquivalentFromRecurringItem(item),
      notes: String(item?.notes || "").trim(),
    }))
    .filter((item) => item.name || item.amount > 0);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const dateStr = url.searchParams.get("date") || new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const tenantId = url.searchParams.get("tenantId");
  const branchId = url.searchParams.get("branchId");

  if (!tenantId) {
    return NextResponse.json({ error: "tenantId required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let branchesQuery = supabase
    .from("branches")
    .select("id")
    .eq("tenant_id", tenantId);
  if (branchId) branchesQuery = branchesQuery.eq("id", branchId);
  const { data: branches } = await branchesQuery;
  const branchIds = (branches || []).map((branch) => branch.id);
  const { data: branchHourRows } = branchIds.length > 0
    ? await supabase
      .from("branch_hours")
      .select("branch_id, day_of_week, open_time, close_time, is_closed")
      .in("branch_id", branchIds)
    : { data: [] };
  const branchHours = (branchHourRows || []) as BranchHour[];
  const currentWindow = buildBusinessWindow(dateStr, branchHours);
  const start = currentWindow.start;
  const end = currentWindow.end;

  // Previous day & week for comparisons
  const prevDayStr = addDays(dateStr, -1);
  const weekAgoStr = addDays(dateStr, -7);
  const weekStart = buildBusinessWindow(weekAgoStr, branchHours).start;
  const prevWindow = buildBusinessWindow(prevDayStr, branchHours);

  // ──────────────────────────────────────────────
  // 1. ORDERS (current day)
  // ──────────────────────────────────────────────
  let ordersQuery = supabase
    .from("orders")
    .select("*, order_items(*, products(id, name, categories(name)), combos(name)), order_payments(*), riders(name)")
    .eq("tenant_id", tenantId)
    .gte("created_at", start)
    .lt("created_at", end);
  if (branchId) ordersQuery = ordersQuery.eq("branch_id", branchId);
  const { data: orders } = await ordersQuery.in("status", ["delivered", "sent", "ready", "confirmed", "preparing"]);

  const totalOrders = orders?.length || 0;
  const netSalesRevenue = orders?.reduce((s, o) => s + Math.max(0, Number(o.total || 0) - Number(o.shipping_cost || 0)), 0) || 0;
  const shippingRev = orders?.reduce((s, o) => s + Number(o.shipping_cost || 0), 0) || 0;
  const discountTotal = orders?.reduce((s, o) => s + Number(o.discount || 0), 0) || 0;
  const grossSalesRevenue = netSalesRevenue + discountTotal;
  const cashIn = orders?.reduce((s, o) => s + Math.max(0, Number(o.paid_amount || o.total || 0) - Number(o.shipping_cost || 0)), 0) || 0;
  const deliveryOrders = orders?.filter((o) => o.type === "delivery").length || 0;
  const takeawayOrders = orders?.filter((o) => o.type === "takeaway").length || 0;
  const avgTicket = totalOrders > 0 ? netSalesRevenue / totalOrders : 0;

  // ──────────────────────────────────────────────
  // 2. PREVIOUS DAY & WEEK (for comparisons)
  // ──────────────────────────────────────────────
  let prevOrdersQuery = supabase
    .from("orders")
    .select("total, shipping_cost, discount")
    .eq("tenant_id", tenantId)
    .gte("created_at", prevWindow.start)
    .lt("created_at", prevWindow.end);
  if (branchId) prevOrdersQuery = prevOrdersQuery.eq("branch_id", branchId);
  const { data: prevOrders } = await prevOrdersQuery.in("status", ["delivered", "sent", "ready", "confirmed", "preparing"]);

  const prevRevenue = prevOrders?.reduce((s, o) => s + Math.max(0, Number(o.total || 0) - Number(o.shipping_cost || 0)), 0) || 0;

  let weekOrdersQuery = supabase
    .from("orders")
    .select("total, shipping_cost, created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", weekStart)
    .lt("created_at", end);
  if (branchId) weekOrdersQuery = weekOrdersQuery.eq("branch_id", branchId);
  const { data: weekOrders } = await weekOrdersQuery.in("status", ["delivered", "sent", "ready", "confirmed", "preparing"]);

  // Daily averages over last 7 days
  const weekWindows = Array.from({ length: 8 }, (_, index) => {
    const day = addDays(dateStr, index - 7);
    const window = buildBusinessWindow(day, branchHours);
    return {
      day,
      start: new Date(window.start).getTime(),
      end: new Date(window.end).getTime(),
    };
  });
  const weekDays = new Map<string, number>();
  weekOrders?.forEach((o) => {
    const createdAt = new Date(o.created_at).getTime();
    const window = weekWindows.find((range) => createdAt >= range.start && createdAt < range.end);
    if (!window) return;
    weekDays.set(window.day, (weekDays.get(window.day) || 0) + Math.max(0, Number(o.total || 0) - Number(o.shipping_cost || 0)));
  });
  const avgDailySales = weekDays.size > 0 ? [...weekDays.values()].reduce((a, b) => a + b, 0) / weekDays.size : 0;

  // Previous day sales total for comparison
  const prevDaySales = weekDays.get(prevDayStr) || 0;

  // Sales 7 days ago (same weekday last week)
  const lastWeekStr = addDays(dateStr, -7);
  const lastWeekSales = weekDays.get(lastWeekStr) || 0;

  // ──────────────────────────────────────────────
  // 3. SALES BY HOUR
  // ──────────────────────────────────────────────
  const hourBuckets: Record<number, { count: number; revenue: number }> = {};
  for (let i = 0; i < 24; i++) hourBuckets[i] = { count: 0, revenue: 0 };
  orders?.forEach((o) => {
    const h = getArgentinaHour(o.created_at);
    if (!hourBuckets[h]) hourBuckets[h] = { count: 0, revenue: 0 };
    hourBuckets[h].count++;
    hourBuckets[h].revenue += Math.max(0, Number(o.total || 0) - Number(o.shipping_cost || 0));
  });

  // ──────────────────────────────────────────────
  // 4. TOP PRODUCTS
  // ──────────────────────────────────────────────
  const productSales: Record<string, { name: string; qty: number; revenue: number }> = {};
  orders?.forEach((o) => {
    (o.order_items || []).forEach((item: any) => {
      const label = getOrderItemLabel(o, item);
      const key = getOrderItemKey(item, label);
      if (!productSales[key]) productSales[key] = { name: label, qty: 0, revenue: 0 };
      productSales[key].qty += item.quantity || 1;
      productSales[key].revenue += Number(item.total) || 0;
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
    payMethods[pm].total += Math.max(0, Number(o.total || 0) - Number(o.shipping_cost || 0));
  });

  // ──────────────────────────────────────────────
  // 6. EXPENSES (current day) — separate by affects_profitability
  // ──────────────────────────────────────────────
  let expensesQuery = supabase
    .from("expenses")
    .select("*, expense_categories(name)")
    .eq("tenant_id", tenantId)
    .gte("expense_date", dateStr)
    .lte("expense_date", dateStr);
  if (branchId) expensesQuery = expensesQuery.eq("branch_id", branchId);
  const { data: expenses } = await expensesQuery;

  const totalExpenses = expenses?.reduce((s, e) => s + Number(e.total), 0) || 0;

  // Expenses that affect profitability (real COGS, direct costs)
  const profitExpenses = (expenses || []).filter((e) => e.affects_profitability !== false);
  // Cashflow-only expenses (payments for already-prorated costs like salaries, rent, etc.)
  const cashflowOnlyExpenses = (expenses || []).filter((e) => e.affects_profitability === false);
  const totalCashflowOnlyExpenses = cashflowOnlyExpenses.reduce((s, e) => s + Number(e.total), 0);
  const totalProfitExpenses = totalExpenses - totalCashflowOnlyExpenses;

  const expByCat: Record<string, number> = {};
  expenses?.forEach((e) => {
    const cat = e.expense_categories?.name || "Sin categoría";
    expByCat[cat] = (expByCat[cat] || 0) + Number(e.total);
  });

  // Cashflow-only expenses by category (for reconciliation)
  const cashflowOnlyExpByCat: Record<string, number> = {};
  cashflowOnlyExpenses.forEach((e) => {
    const cat = e.expense_categories?.name || "Sin categoría";
    cashflowOnlyExpByCat[cat] = (cashflowOnlyExpByCat[cat] || 0) + Number(e.total);
  });

  // Classify expenses into financial categories (only profit-affecting)
  const profitExpByCat: Record<string, number> = {};
  profitExpenses.forEach((e) => {
    const cat = e.expense_categories?.name || "Sin categoría";
    profitExpByCat[cat] = (profitExpByCat[cat] || 0) + Number(e.total);
  });

  const [{ data: financialSettings }, { data: orderPackagingItems }] = await Promise.all([
    supabase
      .from("financial_settings")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("packaging")
      .select("id, name, cost_per_unit, consumption_type, rule")
      .eq("tenant_id", tenantId)
      .in("consumption_type", ["PER_ORDER", "CUSTOM_RULE"]),
  ]);

  // ──────────────────────────────────────────────
  // 7. CMV (Cost of Goods Sold) — ingredients + packaging (including combos)
  // ──────────────────────────────────────────────
  let cmv = 0;
  let cmvDetails: { product: string; cost: number; type: string }[] = [];
  try {
    const productVariantIds: string[] = [];
    const comboIds: string[] = [];
    const promotionProductIds: string[] = [];
    const promotionComboIds: string[] = [];

    orders?.forEach((o) => {
      (o.order_items || []).forEach((item: any) => {
        if (isPromotionLikeItem(o, item)) {
          const promotion = getItemPromotion(o, item);

          (promotion?.items || []).forEach((promoItem: any) => {
            if (promoItem.itemType === "combo") promotionComboIds.push(promoItem.id);
            else promotionProductIds.push(promoItem.id);
          });
          return;
        }

        if (item.item_type === "combo" || item.combo_id) {
          if (item.combo_id) comboIds.push(item.combo_id);
          return;
        }

        if (item.variant_id) productVariantIds.push(item.variant_id);
      });
    });

    const [variantCosts, comboCosts, promotionProductCosts, promotionComboCosts] = await Promise.all([
      getVariantCostMap(supabase, productVariantIds),
      getComboCostMap(supabase, comboIds),
      getProductCostMap(supabase, promotionProductIds),
      getComboCostMap(supabase, promotionComboIds),
    ]);

    orders?.forEach((o) => {
      (o.order_items || []).forEach((item: any) => {
        let cost = 0;
        let detailType = "sin receta";

        if (isPromotionLikeItem(o, item)) {
          const promotion = getItemPromotion(o, item);

          const unitCost = (promotion?.items || []).reduce((sum: number, promoItem: any) => {
            if (promoItem.itemType === "combo") return sum + Number(promotionComboCosts[promoItem.id] || 0);
            return sum + Number(promotionProductCosts[promoItem.id] || 0);
          }, 0);
          cost = unitCost * Number(item.quantity || promotion?.quantity || 1);
          detailType = cost > 0 ? "promo" : "promo sin costo configurado";
        } else if (item.item_type === "combo" || item.combo_id) {
          cost = Number(comboCosts[item.combo_id] || 0) * Number(item.quantity || 1);
          detailType = cost > 0 ? "combo" : "combo sin receta";
        } else {
          cost = Number(variantCosts[item.variant_id] || 0) * Number(item.quantity || 1);
          detailType = cost > 0 ? "ingredientes+packaging" : "sin receta";
        }

        cmv += cost;
        const promotion = isPromotionLikeItem(o, item) ? getItemPromotion(o, item) : null;
        const productName =
          item.products?.name ||
          item.combos?.name ||
          promotion?.promotionName ||
          (item.extras || []).find((extra: any) => extra?.type === "promotion")?.name ||
          "N/A";
        cmvDetails.push({
          product: productName,
          cost,
          type: detailType,
        });
      });
    });
  } catch (e) {
    console.error("CMV error:", e);
  }

  // ──────────────────────────────────────────────
  // 8. P&L SUMMARY
  // ──────────────────────────────────────────────
  const comboIdsForPackaging = new Set<string>();
  const productIdsForPackaging = new Set<string>();
  orders?.forEach((o) => {
    (o.order_items || []).forEach((item: any) => {
      if (isPromotionLikeItem(o, item)) {
        const promotion = getItemPromotion(o, item);
        (promotion?.items || []).forEach((promoItem: any) => {
          if (promoItem.itemType === "combo") comboIdsForPackaging.add(promoItem.id);
          else productIdsForPackaging.add(promoItem.id);
        });
      } else if (item.combo_id) {
        comboIdsForPackaging.add(item.combo_id);
      } else if (item.product_id) {
        productIdsForPackaging.add(item.product_id);
      }
    });
  });

  const [{ data: comboComposition }, { data: standaloneProducts }] = await Promise.all([
    comboIdsForPackaging.size > 0
      ? supabase
        .from("combos")
        .select("id, combo_products!left(product_id, quantity, products(id, name, categories(name)))")
        .in("id", [...comboIdsForPackaging])
      : { data: [] },
    productIdsForPackaging.size > 0
      ? supabase
        .from("products")
        .select("id, name, categories(name)")
        .in("id", [...productIdsForPackaging])
      : { data: [] },
  ]);

  const productById: Record<string, any> = {};
  (standaloneProducts || []).forEach((product: any) => { productById[product.id] = product; });
  const comboBurgerUnits: Record<string, number> = {};
  (comboComposition || []).forEach((combo: any) => {
    comboBurgerUnits[combo.id] = (combo.combo_products || []).reduce((sum: number, item: any) => {
      if (!item.products) return sum;
      productById[item.products.id] = item.products;
      return sum + (isBurgerProduct(item.products) ? Number(item.quantity || 1) : 0);
    }, 0);
  });

  let burgerUnits = 0;
  orders?.forEach((o) => {
    (o.order_items || []).forEach((item: any) => {
      const qty = Number(item.quantity || 1);
      if (isPromotionLikeItem(o, item)) {
        const promotion = getItemPromotion(o, item);
        const promotionQty = Number(promotion?.quantity || qty || 1);
        (promotion?.items || []).forEach((promoItem: any) => {
          if (promoItem.itemType === "combo") burgerUnits += Number(comboBurgerUnits[promoItem.id] || 0) * promotionQty;
          else if (isBurgerProduct(productById[promoItem.id])) burgerUnits += promotionQty;
        });
      } else if (item.combo_id) {
        burgerUnits += Number(comboBurgerUnits[item.combo_id] || 0) * qty;
      } else if (isBurgerProduct(item.products || productById[item.product_id])) {
        burgerUnits += qty;
      }
    });
  });

  const packagingUsage: { name: string; units: number; cost: number; type: string }[] = [];
  (orderPackagingItems || []).forEach((pkg: any) => {
    const unitCost = Number(pkg.cost_per_unit || 0);
    if (pkg.consumption_type === "PER_ORDER") {
      const units = totalOrders;
      packagingUsage.push({ name: pkg.name, units, cost: units * unitCost, type: "PER_ORDER" });
      return;
    }
    if (pkg.consumption_type === "CUSTOM_RULE" && pkg.rule?.type === "PER_BURGER_COUNT") {
      const unitsPerPackage = Math.max(1, Number(pkg.rule.unitsPerPackage || 1));
      const units = Math.ceil(burgerUnits / unitsPerPackage);
      packagingUsage.push({ name: pkg.name, units, cost: units * unitCost, type: "PER_BURGER_COUNT" });
    }
  });

  const orderPackagingCost = packagingUsage.reduce((sum, item) => sum + item.cost, 0);
  const operatingDays = Math.max(1, Number(financialSettings?.operating_days_per_month || 26));
  const fixedCostItems = getRecurringItems(financialSettings?.fixed_cost_items);
  const payrollItems = getRecurringItems(financialSettings?.payroll_items);
  const baseMonthlyFixedCosts =
    Number(financialSettings?.monthly_rent || 0) +
    Number(financialSettings?.monthly_gas || 0) +
    Number(financialSettings?.monthly_electricity || 0) +
    Number(financialSettings?.monthly_internet || 0);
  const customMonthlyFixedCosts = fixedCostItems.reduce((sum, item) => sum + item.monthlyEquivalent, 0);
  const monthlyFixedCosts = baseMonthlyFixedCosts + customMonthlyFixedCosts;
  const baseMonthlyPayroll = Number(financialSettings?.monthly_payroll || 0);
  const itemizedMonthlyPayroll = payrollItems.reduce((sum, item) => sum + item.monthlyEquivalent, 0);
  const monthlyPayrollCost = baseMonthlyPayroll + itemizedMonthlyPayroll;
  const dailyFixedCosts = monthlyFixedCosts / operatingDays;
  const dailyPayrollCost = monthlyPayrollCost / operatingDays;

  const netRevenue = netSalesRevenue;
  const grossProfit = netRevenue - cmv;
  const operatingProfit = grossProfit - dailyPayrollCost - orderPackagingCost - dailyFixedCosts;
  // P&L uses ONLY prorated costs — NO manually loaded expenses
  const netProfit = operatingProfit;
  const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
  const netMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;
  const operatingMargin = getPct(operatingProfit, netRevenue);
  // Contribution Margin = sales - cmv - packaging (NO labor, NO fixed costs)
  const contributionMargin = netRevenue - cmv - orderPackagingCost;
  const contributionMarginPct = getPct(contributionMargin, netRevenue);
  const foodCostPct = getPct(cmv, netRevenue);
  const laborCostPct = getPct(dailyPayrollCost, netRevenue);
  const packagingCostPct = getPct(orderPackagingCost, netRevenue);
  const fixedCostPct = getPct(dailyFixedCosts, netRevenue);
  // Contribution per order: how much each order contributes to cover fixed structure
  const contributionPerOrder = totalOrders > 0 ? contributionMargin / totalOrders : 0;
  // Daily fixed structure = labor + fixed costs
  const dailyFixedStructure = dailyPayrollCost + dailyFixedCosts;
  // Break even orders = how many orders needed to cover daily fixed structure
  const breakEvenOrders = contributionPerOrder > 0
    ? Math.ceil(dailyFixedStructure / contributionPerOrder)
    : 0;
  // Orders needed for target profit
  const ordersNeededFor100kProfit = contributionPerOrder > 0
    ? Math.ceil((dailyFixedStructure + 100000) / contributionPerOrder)
    : 0;
  // Break even sales = break_even_orders * avg_ticket
  const breakEvenSales = breakEvenOrders * avgTicket;
  // Sales above/below break even
  const salesAboveBreakEven = netRevenue - breakEvenSales;
  // Profit per order (operating)
  const profitPerOrder = totalOrders > 0 ? operatingProfit / totalOrders : 0;

  const netProfitReal = netProfit;
  const netMarginReal = netRevenue > 0 ? (netProfitReal / netRevenue) * 100 : 0;

  // ── Cashflow-only expenses by raw category (no auto-classification) ──
  const cashflowByCategory = Object.entries(cashflowOnlyExpByCat)
    .filter(([, amt]) => amt > 0)
    .map(([cat, amt]) => ({ category: cat, amount: Math.round(amt) }));

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

  if (foodCostPct > 45) alerts.push(`Food cost above 45% (${foodCostPct.toFixed(1)}%)`);
  if (laborCostPct > 30) alerts.push(`Labor cost above 30% (${laborCostPct.toFixed(1)}%)`);
  if (packagingCostPct > 5) alerts.push(`Packaging cost above 5% (${packagingCostPct.toFixed(1)}%)`);
  if (contributionMarginPct > 25) alerts.push(`Contribution margin above 25% (${contributionMarginPct.toFixed(1)}%)`);
  else if (contributionMarginPct < 15 && netRevenue > 0) alerts.push(`Contribution margin below 15% (${contributionMarginPct.toFixed(1)}%)`);
  else if (contributionMarginPct < 20 && netRevenue > 0) alerts.push(`Contribution margin below 20% (${contributionMarginPct.toFixed(1)}%)`);
  if (operatingMargin < 10 && netRevenue > 0) alerts.push(`Operating margin below 10% (${operatingMargin.toFixed(1)}%)`);
  if (operatingMargin > 20) alerts.push(`Operating margin above 20% (${operatingMargin.toFixed(1)}%)`);

  // Alerts based on P&L (operating profit), NOT cashflow
  if (netMarginReal < 10 && netMarginReal >= 0) {
    alerts.push(`🟡 Net margin below 10% (${netMarginReal.toFixed(1)}%)`);
  } else if (netMarginReal < 0) {
    alerts.push(`🔴 Negative net margin (${netMarginReal.toFixed(1)}%) — review prorated costs`);
  }
  if (operatingMargin < 0) {
    alerts.push(`🔴 Negative operating margin (${operatingMargin.toFixed(1)}%) — operating at a loss`);
  }
  if (totalOrders < breakEvenOrders && breakEvenOrders > 0) {
    alerts.push(`🔴 Ventas por debajo del punto de equilibrio (${breakEvenOrders} pedidos necesarios, ${totalOrders} realizados)`);
  } else if (totalOrders >= breakEvenOrders && breakEvenOrders > 0) {
    alerts.push(`🟢 Ventas por encima del punto de equilibrio (+${totalOrders - breakEvenOrders} pedidos)`);
  }
  if (prevRevenue > 0) {
    const vsPrevDay = ((netSalesRevenue - prevRevenue) / prevRevenue) * 100;
    if (vsPrevDay < -15) {
      alerts.push(`🔴 Sales dropped ${Math.abs(vsPrevDay).toFixed(0)}% vs yesterday`);
    } else if (vsPrevDay > 30) {
      alerts.push(`🟢 Sales surged ${vsPrevDay.toFixed(0)}% vs yesterday`);
    }
  }
  if (lastWeekSales > 0) {
    const vsLastWeek = ((netSalesRevenue - lastWeekSales) / lastWeekSales) * 100;
    if (vsLastWeek < -20) {
      alerts.push(`🔴 Sales dropped ${Math.abs(vsLastWeek).toFixed(0)}% vs same day last week`);
    } else if (vsLastWeek > 40) {
      alerts.push(`🟢 Sales surged ${vsLastWeek.toFixed(0)}% vs same day last week`);
    }
  }
  if (totalOrders > 0 && avgTicket < 5000) {
    alerts.push(`🟡 Low average ticket ($${Math.round(avgTicket).toLocaleString("es-AR")}) — consider upselling`);
  }
  if (cmv > 0 && netSalesRevenue > 0) {
    const cmvPct = (cmv / netSalesRevenue) * 100;
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
  const bagUsage = packagingUsage.find((item) => /bolsa|bag/i.test(item.name));
  const financialInsights = [
    `CMV representa ${foodCostPct.toFixed(1)}% de las ventas`,
    `Costo laboral representa ${laborCostPct.toFixed(1)}% de las ventas`,
    customMonthlyFixedCosts > 0
      ? `Otros costos fijos prorrateados: $${roundMoney(customMonthlyFixedCosts / operatingDays).toLocaleString("es-AR")} diarios`
      : null,
    itemizedMonthlyPayroll > 0
      ? `Equipo cargado individualmente: $${roundMoney(itemizedMonthlyPayroll / operatingDays).toLocaleString("es-AR")} diarios`
      : null,
    `Margen de contribucion: ${contributionMarginPct.toFixed(1)}%`,
    contributionPerOrder > 0
      ? `Cada pedido aporta $${roundMoney(contributionPerOrder).toLocaleString("es-AR")} para cubrir estructura fija`
      : null,
    breakEvenOrders > 0
      ? `La sucursal necesita aproximadamente ${breakEvenOrders} pedidos para alcanzar el punto de equilibrio`
      : "No hay suficiente margen de contribucion para calcular punto de equilibrio",
    salesAboveBreakEven > 0
      ? `Las ventas superaron el punto de equilibrio en $${roundMoney(salesAboveBreakEven).toLocaleString("es-AR")}`
      : `Las ventas estuvieron $${roundMoney(Math.abs(salesAboveBreakEven)).toLocaleString("es-AR")} por debajo del punto de equilibrio`,
    ordersNeededFor100kProfit > 0
      ? `Se requieren ${ordersNeededFor100kProfit} pedidos para generar $100.000 de utilidad operativa`
      : "No hay ganancia operativa por pedido suficiente para proyectar $100.000",
    breakEvenOrders > 0 && totalOrders >= breakEvenOrders
      ? "La sucursal alcanzo el punto de equilibrio durante la jornada"
      : breakEvenOrders > 0
        ? `Faltaron ${Math.max(0, breakEvenOrders - totalOrders)} pedidos para alcanzar el punto de equilibrio`
        : null,
    bagUsage
      ? `Se utilizaron ${bagUsage.units} bolsas durante la jornada`
      : `Packaging por pedido calculado: $${roundMoney(orderPackagingCost).toLocaleString("es-AR")}`,
  ].filter(Boolean);

  const report = {
    date: dateStr,
    generated_at: new Date().toISOString(),
    rango_operativo: {
      etiqueta: currentWindow.label,
      inicio_utc: currentWindow.start,
      fin_utc: currentWindow.end,
      usa_horarios_sucursal: currentWindow.usesBusinessHours,
    },

    resumen_ejecutivo: {
      ingresos_brutos: Math.round(grossSalesRevenue),
      descuentos: Math.round(discountTotal),
      ingresos_netos: Math.round(netRevenue),
      envios: Math.round(shippingRev),
      cmv: Math.round(cmv),
      ganancia_bruta: Math.round(grossProfit),
      ganancia_operativa: Math.round(operatingProfit),
      margen_bruto: Math.round(grossMargin * 100) / 100,
      gastos_operativos: Math.round(totalExpenses),
      ganancia_neta: Math.round(netProfit),
      margen_neto: Math.round(netMargin * 100) / 100,
    },

    owner_profit: {
      gross_profit: roundMoney(grossProfit),
      labor_cost: roundMoney(dailyPayrollCost),
      packaging_cost: roundMoney(orderPackagingCost),
      fixed_cost_allocated: roundMoney(dailyFixedCosts),
      contribution_margin: roundMoney(contributionMargin),
      contribution_margin_pct: Math.round(contributionMarginPct * 100) / 100,
      operating_profit: roundMoney(operatingProfit),
      profit_per_order: roundMoney(profitPerOrder),
      orders_needed_for_100k_profit: ordersNeededFor100kProfit,
      orders_needed_for_break_even: breakEvenOrders,
      operating_margin: Math.round(operatingMargin * 100) / 100,
      break_even_orders: breakEvenOrders,
      monthly_fixed_costs: roundMoney(monthlyFixedCosts),
      monthly_labor_cost: roundMoney(monthlyPayrollCost),
      fixed_cost_breakdown: {
        base: {
          rent: roundMoney(Number(financialSettings?.monthly_rent || 0)),
          gas: roundMoney(Number(financialSettings?.monthly_gas || 0)),
          electricity: roundMoney(Number(financialSettings?.monthly_electricity || 0)),
          internet: roundMoney(Number(financialSettings?.monthly_internet || 0)),
          total: roundMoney(baseMonthlyFixedCosts),
        },
        custom: fixedCostItems.map((item) => ({
          name: item.name,
          amount_per_payment: roundMoney(item.amount),
          frequency: item.frequency,
          every_days: item.everyDays || null,
          last_paid_at: item.lastPaidAt,
          next_due_at: item.lastPaidAt && getFrequencyDays(item)
            ? addCalendarDays(item.lastPaidAt, getFrequencyDays(item)!)
            : null,
          days_until_due: item.lastPaidAt && getFrequencyDays(item)
            ? getDaysBetween(dateStr, addCalendarDays(item.lastPaidAt, getFrequencyDays(item)!))
            : null,
          monthly_amount: roundMoney(item.monthlyEquivalent),
          daily_amount: roundMoney(item.monthlyEquivalent / operatingDays),
          notes: item.notes,
        })),
      },
      labor_breakdown: {
        general_payroll: roundMoney(baseMonthlyPayroll),
        employees: payrollItems.map((item) => ({
          name: item.name,
          amount_per_payment: roundMoney(item.amount),
          frequency: item.frequency,
          every_days: item.everyDays || null,
          last_paid_at: item.lastPaidAt,
          next_due_at: item.lastPaidAt && getFrequencyDays(item)
            ? addCalendarDays(item.lastPaidAt, getFrequencyDays(item)!)
            : null,
          days_until_due: item.lastPaidAt && getFrequencyDays(item)
            ? getDaysBetween(dateStr, addCalendarDays(item.lastPaidAt, getFrequencyDays(item)!))
            : null,
          monthly_amount: roundMoney(item.monthlyEquivalent),
          daily_amount: roundMoney(item.monthlyEquivalent / operatingDays),
          notes: item.notes,
        })),
      },
      burger_units: Math.round(burgerUnits),
      packaging_usage: packagingUsage.map((item) => ({
        name: item.name,
        units: item.units,
        cost: roundMoney(item.cost),
        type: item.type,
      })),
    },

    financial_kpis: {
      food_cost_pct: Math.round(foodCostPct * 100) / 100,
      labor_cost_pct: Math.round(laborCostPct * 100) / 100,
      packaging_cost_pct: Math.round(packagingCostPct * 100) / 100,
      fixed_cost_pct: Math.round(fixedCostPct * 100) / 100,
      contribution_margin_pct: Math.round(contributionMarginPct * 100) / 100,
      operating_margin_pct: Math.round(operatingMargin * 100) / 100,
    },

    ventas: {
      total_pedidos: totalOrders,
      ticket_promedio: Math.round(avgTicket),
      delivery: deliveryOrders,
      takeaway: takeawayOrders,
      subtotal: Math.round(grossSalesRevenue),
      envio: Math.round(shippingRev),
      descuentos: Math.round(discountTotal),
      total: Math.round(netSalesRevenue),
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
      cashflow_only_total: Math.round(totalCashflowOnlyExpenses),
      cashflow_only_por_categoria: Object.entries(cashflowOnlyExpByCat).map(([cat, amt]) => ({
        categoria: cat,
        monto: Math.round(amt),
      })),
    },

    // ── SECCION 1: RENTABILIDAD (P&L) ──
    profit_and_loss: {
      sales: Math.round(netRevenue),
      cmv: Math.round(cmv),
      packaging: Math.round(orderPackagingCost),
      labor_allocated: Math.round(dailyPayrollCost),
      fixed_costs_allocated: Math.round(dailyFixedCosts),
      operating_profit: Math.round(operatingProfit),
      operating_margin: Math.round(operatingMargin * 100) / 100,
      net_profit: Math.round(netProfit),
      contribution_margin_pct: Math.round(contributionMarginPct * 100) / 100,
      contribution_margin: Math.round(contributionMargin),
      contribution_per_order: Math.round(contributionPerOrder),
      daily_fixed_structure: Math.round(dailyFixedStructure),
      break_even_orders: breakEvenOrders,
      break_even_sales: Math.round(breakEvenSales),
      sales_above_break_even: Math.round(salesAboveBreakEven),
      orders_needed_for_100k_profit: ordersNeededFor100kProfit,
      food_cost_pct: Math.round(foodCostPct * 100) / 100,
      labor_cost_pct: Math.round(laborCostPct * 100) / 100,
      fixed_cost_pct: Math.round(fixedCostPct * 100) / 100,
    },

    finanzas: {
      cmv_total: Math.round(cmv),
      packaging_costs: roundMoney(orderPackagingCost),
      configured_fixed_costs: roundMoney(dailyFixedCosts),
      configured_labor_costs: roundMoney(dailyPayrollCost),
      net_profit_real: Math.round(netProfitReal),
      net_margin_real: Math.round(netMarginReal * 100) / 100,
    },

    cashflow: {
      cash_in: Math.round(cashIn),
      cash_out: Math.round(cashOut),
      cashflow_only_out: Math.round(totalCashflowOnlyExpenses),
      net_cashflow: Math.round(cashIn - cashOut),
      movements: cashflowByCategory,
      current_cash: Math.round(currentCash),
      projected_7d: Math.round(projected7d),
      avg_daily_sales: Math.round(avgDailySales),
    },

    // ── CONCILIACION ──
    reconciliation: {
      operating_profit: Math.round(operatingProfit),
      cashflow_result: Math.round(cashIn - cashOut),
      difference: Math.round(operatingProfit - (cashIn - cashOut)),
      difference_explained_by: cashflowByCategory,
    },

    comparativas: {
      vs_ayer: {
        ventas: Math.round(netSalesRevenue - prevRevenue),
        ventas_pct: prevRevenue > 0 ? Math.round(((netSalesRevenue - prevRevenue) / prevRevenue) * 100) : 0,
      },
      vs_misma_semana: {
        ventas_pct: lastWeekSales > 0 ? Math.round(((netSalesRevenue - lastWeekSales) / lastWeekSales) * 100) : 0,
      },
    },

    alerts,
    financial_insights: financialInsights,

    cmv_detalle: cmvDetails.slice(0, 50).map((d) => ({
      producto: d.product,
      costo: Math.round(d.cost),
      tipo: d.type,
    })),
  };

  return NextResponse.json(report);
}
