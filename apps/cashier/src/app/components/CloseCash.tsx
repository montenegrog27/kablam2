"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { getVariantCostMap } from "@kablam/supabase/costs";

type BillDenomination =
  | 10
  | 20
  | 50
  | 100
  | 200
  | 500
  | 1000
  | 2000
  | 10000
  | 20000;

type BillsState = Record<BillDenomination, number>;

const BILL_DENOMINATIONS: BillDenomination[] = [
  20000, 10000, 2000, 1000, 500, 200, 100, 50, 20, 10,
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR").format(value || 0);
}

function formatDuration(from: string) {
  const start = new Date(from).getTime();
  const diff = Math.max(0, Date.now() - start);
  const hours = Math.floor(diff / 1000 / 60 / 60);
  const minutes = Math.floor(diff / 1000 / 60) % 60;
  return `${hours}h ${minutes}m`;
}

export default function CloseCash({ session, onClosed, onCancel }: any) {
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<any>(null);
  const [countedCash, setCountedCash] = useState("");
  const [carryOver, setCarryOver] = useState("");
  const [differenceReason, setDifferenceReason] = useState("");
  const [paymentChecks, setPaymentChecks] = useState<Record<string, string>>({});

  const [bills, setBills] = useState<BillsState>({
    10: 0,
    20: 0,
    50: 0,
    100: 0,
    200: 0,
    500: 0,
    1000: 0,
    2000: 0,
    10000: 0,
    20000: 0,
  });

  const calculateBillsTotal = () => {
    return Object.entries(bills).reduce(
      (acc, [value, qty]) => acc + Number(value) * Number(qty),
      0,
    );
  };
  useEffect(() => {
    const total = calculateBillsTotal();
    setCountedCash(total.toString());
  }, [bills]);
  useEffect(() => {
    if (session?.id) calculateSummary();
  }, [session]);

  const verifyOpenOrders = async () => {
    const { data } = await supabase
      .from("orders")
      .select("id")
      .eq("cash_session_id", session.id)
      .not("status", "in", "(delivered,cancelled)");

    return (data?.length ?? 0) > 0;
  };

  const calculateSummary = async () => {
    setLoading(true);
    setError("");

    const hasOpenOrders = await verifyOpenOrders();
    if (hasOpenOrders) {
      setError("Hay órdenes abiertas. No se puede cerrar caja.");
      setLoading(false);
      return;
    }

    const { data: ordersData } = await supabase
      .from("orders")
      .select("id,total,subtotal,shipping_cost,type")
      .eq("cash_session_id", session.id)
      .eq("status", "delivered");

    const deliveredOrders = ordersData || [];
    const totalRevenue = deliveredOrders.reduce(
      (sum: number, order: any) => sum + Number(order.total || 0),
      0,
    );
    const totalShipping = deliveredOrders.reduce(
      (sum: number, order: any) => sum + Number(order.shipping_cost || 0),
      0,
    );
    const totalWithoutShipping = deliveredOrders.reduce((sum: number, order: any) => {
      const subtotal =
        order.subtotal !== null && order.subtotal !== undefined
          ? Number(order.subtotal)
          : Number(order.total || 0) - Number(order.shipping_cost || 0);
      return sum + subtotal;
    }, 0);

    // ================= PAGOS =================
    const { data: paymentsData } = await supabase
      .from("order_payments")
      .select(
        `
      amount,
      orders!inner(id,status,cash_session_id,total),
      payment_methods!inner(name,affects_cash)
    `,
      )
      .eq("orders.cash_session_id", session.id)
      .eq("orders.status", "delivered");

    const paymentSummary: Record<string, number> = {};
    const paymentDetails: Record<string, { amount: number; affectsCash: boolean }> = {};
    let expectedCash = Number(session.opening_amount);

    paymentsData?.forEach((p: any) => {
      const method = p.payment_methods.name;
      const amount = Number(p.amount);
      const affectsCash = Boolean(p.payment_methods.affects_cash);

      if (!paymentSummary[method]) paymentSummary[method] = 0;
      paymentSummary[method] += amount;

      if (!paymentDetails[method]) {
        paymentDetails[method] = { amount: 0, affectsCash };
      }
      paymentDetails[method].amount += amount;

      if (affectsCash) {
        expectedCash += amount;
      }
    });

    const { data: movementsData, error: movementsError } = await supabase
      .from("cash_movements")
      .select("type, amount, reason, created_at")
      .eq("cash_session_id", session.id);

    if (movementsError) {
      setError(
        "No se pudieron cargar los movimientos de caja. Ejecuta el SQL de caja antes de cerrar.",
      );
      setLoading(false);
      return;
    }

    const movementsSummary = {
      in: 0,
      out: 0,
      net: 0,
      items: movementsData || [],
    };

    movementsData?.forEach((movement: any) => {
      const amount = Number(movement.amount || 0);
      if (movement.type === "in") {
        movementsSummary.in += amount;
        expectedCash += amount;
      }
      if (movement.type === "out") {
        movementsSummary.out += amount;
        expectedCash -= amount;
      }
    });

    movementsSummary.net = movementsSummary.in - movementsSummary.out;

    // ================= GASTOS =================
    const { data: expensesData } = await supabase
      .from("expenses")
      .select("description, total, expense_categories(name)")
      .eq("cash_session_id", session.id)
      .order("created_at", { ascending: false });
    const totalExpenses = (expensesData || []).reduce((s: number, e: any) => s + Number(e.total), 0);
    expectedCash -= totalExpenses;

    // ================= PRODUCTOS =================
    const { data: itemsData } = await supabase
      .from("order_items")
      .select(
        `
      variant_id,
      quantity,
      total,
      product_variants (
        name,
        products (
          name
        )
      ),
      orders!inner(status,cash_session_id)
    `,
      )
      .eq("orders.cash_session_id", session.id)
      .eq("orders.status", "delivered");

    const productSummary: Record<string, any> = {};
    let totalUnits = 0;
    let totalCost = 0;
    const variantCosts = await getVariantCostMap(
      supabase,
      (itemsData || []).map((item: any) => item.variant_id),
    );

    itemsData?.forEach((item: any) => {
      const productName = item.product_variants?.products?.name || "Producto";
      const variantName = item.product_variants?.name || "Variante";
      const qty = Number(item.quantity);
      const cost = Number(variantCosts[item.variant_id] || 0);

      totalUnits += qty;
      totalCost += cost * qty;

      if (!productSummary[productName]) {
        productSummary[productName] = {
          total: 0,
          variants: {},
        };
      }

      productSummary[productName].total += qty;

      if (!productSummary[productName].variants[variantName]) {
        productSummary[productName].variants[variantName] = 0;
      }

      productSummary[productName].variants[variantName] += qty;
    });

    const totalOrders = deliveredOrders.length;
    const ticketAverage = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const nonCashChecks = Object.fromEntries(
      Object.entries(paymentDetails)
        .filter(([, detail]) => !detail.affectsCash)
        .map(([name, detail]) => [name, String(detail.amount)]),
    );

    setPaymentChecks(nonCashChecks);

    setSummary({
      payments: paymentSummary,
      paymentDetails,
      expectedCash,
      totalRevenue,
      totalWithoutShipping,
      totalShipping,
      totalOrders,
      ticketAverage,
      totalUnits,
      totalCost,
      profit: totalRevenue - totalCost,
      products: productSummary,
      movements: movementsSummary,
      expenses: expensesData || [],
      totalExpenses,
    });

    setLoading(false);
  };

  const handleClose = async () => {
    if (!countedCash) return;

    setClosing(true);

    try {
      // 🔎 1. Validar que siga abierta
const { data: freshSession, error } = await supabase
  .from("cash_sessions")
  .select("*")
  .eq("id", session.id)
  .single();

if (error) {
  console.error("Error cargando sesión:", error);
  alert("No se pudo verificar la sesión.");
  return;
}

if (!freshSession) {
  alert("Sesión no encontrada.");
  return;
}

if (freshSession.status !== "open") {
  alert("Esta sesión ya fue cerrada.");
  return;
}

      if (!freshSession || freshSession.status !== "open") {
        alert("Esta sesión ya fue cerrada.");
        return;
      }

      const difference = Number(countedCash) - summary.expectedCash;
      const paymentVerification = Object.fromEntries(
        Object.entries(summary.paymentDetails)
          .filter(([, detail]: any) => !detail.affectsCash)
          .map(([name, detail]: any) => {
            const expected = Number(detail.amount || 0);
            const counted = Number(paymentChecks[name] || 0);
            return [
              name,
              {
                expected,
                counted,
                difference: counted - expected,
              },
            ];
          }),
      );
      const paymentDifference = Object.values(paymentVerification).reduce(
        (sum: number, verification: any) =>
          sum + Math.abs(Number(verification.difference || 0)),
        0,
      );

      if ((difference !== 0 || paymentDifference !== 0) && !differenceReason.trim()) {
        alert("Ingresa un motivo para la diferencia de caja.");
        return;
      }

      const { data: authData } = await supabase.auth.getSession();
      const closedBy = authData.session?.user?.id || session.opened_by;

      // 🧾 2. Crear snapshot INMUTABLE
      const snapshotData = {
        tenant_id: session.tenant_id,
        branch_id: session.branch_id,
        cash_register_id: session.cash_register_id,
        cash_session_id: session.id,

        opened_by: session.opened_by,
        closed_by: closedBy,

        opened_at: session.opened_at,
        closed_at: new Date().toISOString(),
        carry_over: Number(carryOver),
        bills_detail: bills,
        opening_amount: session.opening_amount,
        closing_amount: Number(countedCash),
        expected_cash: summary.expectedCash,
        difference: difference,
        difference_reason: differenceReason.trim() || null,

        total_revenue: summary.totalRevenue,
        total_without_shipping: summary.totalWithoutShipping,
        total_shipping: summary.totalShipping,
        total_orders: summary.totalOrders ?? 0,
        total_units: summary.totalUnits ?? 0,
        total_cost: summary.totalCost ?? 0,
        profit: summary.profit ?? 0,

        payments: summary.payments ?? {},
        payment_verification: paymentVerification,
        products: summary.products ?? {},
        cash_movements: summary.movements ?? {},
      };

      const { error: closeError } = await supabase.rpc(
        "close_cash_session_atomic",
        {
          p_cash_session_id: session.id,
          p_closed_by: closedBy,
          p_snapshot: snapshotData,
        },
      );

      if (closeError) {
        console.error("ERROR CERRANDO CAJA:", closeError);
        alert("No se pudo cerrar la caja. Revisar base.");
        return;
      }

      onClosed();
    } catch (err: any) {
      console.error("ERROR GENERAL:", err);
      alert("No se pudo cerrar la caja");
    } finally {
      setClosing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-white">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">Cierre de Caja</h2>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
            >
              Salir
            </button>
          )}
        </div>
        Calculando...
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-8 text-white">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold">Cierre de Caja</h2>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
            >
              Salir
            </button>
          )}
        </div>
        <div className="rounded-lg border border-red-900/40 bg-red-950/30 p-4 text-red-300">
          {error}
        </div>
      </div>
    );
  }

  const difference =
    countedCash !== "" ? Number(countedCash) - summary.expectedCash : 0;
  const paymentVerificationPreview = Object.entries(summary.paymentDetails || {})
    .filter(([, detail]: any) => !detail.affectsCash)
    .map(([name, detail]: any) => {
      const expected = Number(detail.amount || 0);
      const counted = Number(paymentChecks[name] || 0);
      return { name, expected, counted, difference: counted - expected };
    });
  const paymentDifference = paymentVerificationPreview.reduce(
    (sum, payment) => sum + Math.abs(payment.difference),
    0,
  );
  const hasAnyDifference = difference !== 0 || paymentDifference !== 0;

  return (
    <div className="p-8 bg-gray-950 text-white space-y-8 min-h-screen">
      <div className="sticky top-0 z-20 -mx-8 -mt-8 flex items-center justify-between gap-4 border-b border-gray-800 bg-gray-950/95 px-8 py-5 backdrop-blur">
        <div>
          <h2 className="text-2xl font-bold">Cierre de Caja</h2>
          <p className="text-sm text-gray-500">
            Revisá ventas, pagos y efectivo antes de confirmar.
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={closing}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:bg-gray-800 disabled:opacity-50"
          >
            Salir
          </button>
        )}
      </div>
      <div className="bg-gray-900 p-6 rounded-lg space-y-2">
        <div className="flex justify-between">
          <span>Cajero</span>
          <span>{session.users?.full_name}</span>
        </div>

        <div className="flex justify-between">
          <span>Apertura</span>
          <span>{new Date(session.opened_at).toLocaleString("es-AR")}</span>
        </div>

        <div className="flex justify-between">
          <span>Duracion de jornada</span>
          <span>{formatDuration(session.opened_at)}</span>
        </div>

        <div className="flex justify-between">
          <span>Monto inicial</span>
          <span>${formatCurrency(session.opening_amount)}</span>
        </div>
      </div>
      <div className="bg-gray-900 p-6 rounded-lg space-y-3">
        <div className="flex justify-between">
          <span>Total órdenes</span>
          <span>{summary.totalOrders}</span>
        </div>

        <div className="flex justify-between">
          <span>Ticket promedio</span>
          <span>${formatCurrency(summary.ticketAverage)}</span>
        </div>

        <div className="flex justify-between">
          <span>Total sin envio</span>
          <span>${formatCurrency(summary.totalWithoutShipping)}</span>
        </div>

        <div className="flex justify-between">
          <span>Total envio</span>
          <span>${formatCurrency(summary.totalShipping)}</span>
        </div>

        <div className="flex justify-between font-bold text-green-300">
          <span>Total total</span>
          <span>${formatCurrency(summary.totalRevenue)}</span>
        </div>

        <div className="flex justify-between">
          <span>Total unidades</span>
          <span>{summary.totalUnits}</span>
        </div>

        <div className="flex justify-between">
          <span>Costo total</span>
          <span>${formatCurrency(summary.totalCost)}</span>
        </div>

        <div className="flex justify-between text-green-400 font-bold">
          <span>Ganancia bruta</span>
          <span>${formatCurrency(summary.profit)}</span>
        </div>
      </div>

      <div className="bg-gray-900 p-6 rounded-lg space-y-4">
        <h3 className="font-bold text-lg border-b border-gray-700 pb-2">
          Productos Vendidos
        </h3>

        {Object.entries(summary.products).map(([name, data]: any) => (
          <div key={name} className="space-y-1 border-t border-gray-800 pt-3">
            <div className="flex justify-between font-semibold">
              <span>{name}</span>
              <span>{data.total}</span>
            </div>

            {Object.entries(data.variants).map(([variant, qty]: any) => (
              <div
                key={variant}
                className="flex justify-between text-sm text-gray-400 pl-4"
              >
                <span>{variant}</span>
                <span>{qty}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        <span>Apertura</span>
        <span>${formatCurrency(session.opening_amount)}</span>
      </div>

      <div className="bg-gray-900 p-6 rounded-lg space-y-4">
        <h3 className="font-bold">Medios de pago</h3>
        {Object.entries(summary.paymentDetails).map(([name, detail]: any) => {
          const isCash = detail.affectsCash;
          const counted = Number(paymentChecks[name] || 0);
          const paymentDiff = counted - Number(detail.amount || 0);

          return (
            <div
              key={name}
              className="rounded-lg border border-gray-800 bg-gray-950 p-3 space-y-2"
            >
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-semibold">{name}</p>
                  <p className="text-xs text-gray-500">
                    {isCash
                      ? "Se controla con contador de billetes"
                      : "Verificar contra comprobantes o cuenta bancaria"}
                  </p>
                </div>
                <span className="font-bold">${formatCurrency(detail.amount)}</span>
              </div>

              {!isCash && (
                <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                  <input
                    type="number"
                    value={paymentChecks[name] || ""}
                    onChange={(e) =>
                      setPaymentChecks((prev) => ({
                        ...prev,
                        [name]: e.target.value,
                      }))
                    }
                    className="bg-gray-800 border border-gray-700 p-2 rounded text-white"
                    placeholder="Monto verificado"
                  />
                  <span
                    className={`text-sm font-semibold ${
                      paymentDiff === 0 ? "text-green-300" : "text-red-300"
                    }`}
                  >
                    Dif. ${formatCurrency(paymentDiff)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-gray-900 p-6 rounded-lg space-y-3">
        <h3 className="font-bold">Movimientos de caja</h3>
        <div className="flex justify-between text-green-300">
          <span>Ingresos manuales</span>
          <span>${formatCurrency(summary.movements.in)}</span>
        </div>
        <div className="flex justify-between text-red-300">
          <span>Retiros manuales</span>
          <span>${formatCurrency(summary.movements.out)}</span>
        </div>
        <div className="border-t border-gray-700 pt-2 flex justify-between font-semibold">
          <span>Neto movimientos</span>
          <span>${formatCurrency(summary.movements.net)}</span>
        </div>
        {summary.movements.items.length > 0 && (
          <div className="space-y-2 pt-2">
            {summary.movements.items.map((movement: any, index: number) => (
              <div
                key={`${movement.created_at}-${index}`}
                className="flex justify-between text-sm text-gray-400"
              >
                <span>
                  {movement.type === "in" ? "Ingreso" : "Retiro"} -{" "}
                  {movement.reason || "Sin motivo"}
                </span>
                <span>${formatCurrency(Number(movement.amount))}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gastos de caja */}
      {summary.expenses?.length > 0 && (
        <div className="bg-gray-900 p-6 rounded-lg space-y-3">
          <h3 className="font-bold text-red-400">Gastos de caja</h3>
          <div className="flex justify-between text-red-300">
            <span>Total gastos</span>
            <span>-${formatCurrency(summary.totalExpenses)}</span>
          </div>
          <div className="space-y-2 pt-2">
            {summary.expenses.map((exp: any, index: number) => (
              <div key={index} className="flex justify-between text-sm text-gray-400">
                <span>{exp.description}{exp.expense_categories?.name ? ` (${exp.expense_categories.name})` : ""}</span>
                <span>-${formatCurrency(Number(exp.total))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-gray-700 pt-2 flex justify-between font-bold text-lg">
        <span>Efectivo esperado</span>
        <span>${formatCurrency(summary.expectedCash)}</span>
      </div>
      <div className="bg-gray-900 p-6 rounded-lg space-y-4">
        <h3 className="font-bold">Contador de billetes</h3>
        {BILL_DENOMINATIONS.map((value) => (
          <div key={value} className="flex justify-between items-center">
            <span>${value}</span>

            <input
              type="number"
              value={bills[value]}
              onChange={(e) =>
                setBills((prev) => ({
                  ...prev,
                  [value]: Number(e.target.value),
                }))
              }
              className="w-20 bg-gray-800 border border-gray-700 rounded p-2 text-center"
            />
          </div>
        ))}

        <div className="flex justify-between font-bold text-lg border-t border-gray-700 pt-3">
          <span>Total contado</span>
          <span>${formatCurrency(calculateBillsTotal())}</span>
        </div>
      </div>

      <div className="bg-gray-900 p-6 rounded-lg space-y-3">
        <div
          className={`text-lg font-semibold ${
            difference === 0 ? "text-green-400" : "text-red-400"
          }`}
        >
          Diferencia: ${formatCurrency(difference)}
        </div>
        <input
          type="number"
          placeholder="Efectivo que queda en caja"
          value={carryOver}
          onChange={(e) => setCarryOver(e.target.value)}
          className="w-full bg-gray-800 p-3 rounded border border-gray-700"
        />
        {hasAnyDifference && (
          <textarea
            placeholder="Motivo de la diferencia de caja o pagos"
            value={differenceReason}
            onChange={(e) => setDifferenceReason(e.target.value)}
            rows={3}
            className="w-full resize-none bg-gray-800 p-3 rounded border border-gray-700"
          />
        )}
      </div>

      <button
        onClick={handleClose}
        disabled={closing || countedCash === ""}
        className="w-full bg-red-600 hover:bg-red-500 p-4 rounded-lg font-bold transition"
      >
        {closing ? "Cerrando..." : "Confirmar Cierre"}
      </button>
    </div>
  );
}
