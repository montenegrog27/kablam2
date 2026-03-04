"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR").format(value || 0);
}

export default function CloseCash({ session, onClosed }: any) {
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<any>(null);
  const [countedCash, setCountedCash] = useState("");
  const [carryOver, setCarryOver] = useState("");
  const [bills, setBills] = useState({
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

    let paymentSummary: Record<string, number> = {};
    let expectedCash = Number(session.opening_amount);
    let totalRevenue = 0;
    const orderIds = new Set<string>();

    paymentsData?.forEach((p: any) => {
      const method = p.payment_methods.name;
      const amount = Number(p.amount);

      if (!paymentSummary[method]) paymentSummary[method] = 0;
      paymentSummary[method] += amount;

      totalRevenue += amount;
      orderIds.add(p.orders.id);

      if (p.payment_methods.affects_cash) {
        expectedCash += amount;
      }
    });

    // ================= PRODUCTOS =================
    const { data: itemsData } = await supabase
      .from("order_items")
      .select(
        `
      quantity,
      total,
      product_variants (
        name,
        cost,
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

    itemsData?.forEach((item: any) => {
      const productName = item.product_variants.products.name;
      const variantName = item.product_variants.name;
      const qty = Number(item.quantity);
      const cost = Number(item.product_variants.cost || 0);

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

    const totalOrders = orderIds.size;
    const ticketAverage = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    setSummary({
      payments: paymentSummary,
      expectedCash,
      totalRevenue,
      totalOrders,
      ticketAverage,
      totalUnits,
      totalCost,
      profit: totalRevenue - totalCost,
      products: productSummary,
    });

    setLoading(false);
  };

  const handleClose = async () => {
    if (!countedCash) return;

    setClosing(true);

    try {
      // 🔎 1. Validar que siga abierta
      const { data: freshSession } = await supabase
        .from("cash_sessions")
        .select(
          `
  *,
  users ( full_name )
`,
        )
        .eq("id", session.id)
        .single();

      if (!freshSession || freshSession.status !== "open") {
        alert("Esta sesión ya fue cerrada.");
        return;
      }

      const difference = Number(countedCash) - summary.expectedCash;

      // 🧾 2. Crear snapshot INMUTABLE
      const snapshotData = {
        tenant_id: session.tenant_id,
        branch_id: session.branch_id,
        cash_register_id: session.cash_register_id,
        cash_session_id: session.id,

        opened_by: session.opened_by,
        closed_by: session.opened_by,

        opened_at: session.opened_at,
        closed_at: new Date(),
carry_over: Number(carryOver),
bills_detail: bills,
        opening_amount: session.opening_amount,
        closing_amount: Number(countedCash),
        expected_cash: summary.expectedCash,
        difference: difference,

        total_revenue: summary.totalRevenue,
        total_orders: summary.totalOrders ?? 0,
        total_units: summary.totalUnits ?? 0,
        total_cost: summary.totalCost ?? 0,
        profit: summary.profit ?? 0,

        payments: summary.payments ?? {},
        products: summary.products ?? {},
      };

      const { error: snapshotError } = await supabase
        .from("cash_closures")
        .insert(snapshotData);

      if (snapshotError) {
        console.error("ERROR GUARDANDO SNAPSHOT:", snapshotError);
        alert("No se pudo guardar el cierre. La caja sigue abierta.");
        return;
      }

      // 🔒 3. Cerrar sesión SOLO si snapshot fue exitoso
      const { error: closeError } = await supabase
        .from("cash_sessions")
        .update({
          status: "closed",
          closed_at: new Date(),
          closed_by: session.opened_by,
          closing_amount: Number(countedCash),
          difference: difference,
        })
        .eq("id", session.id);

      if (closeError) {
        console.error("ERROR CERRANDO SESIÓN:", closeError);
        alert("Error cerrando sesión. Revisar base.");
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

  if (loading) return <div className="p-8 text-white">Calculando...</div>;
  if (error) return <div className="p-8 text-red-400">{error}</div>;

  const difference =
    countedCash !== "" ? Number(countedCash) - summary.expectedCash : 0;

  return (
    <div className="p-8 bg-gray-950 text-white space-y-8 min-h-screen">
      <h2 className="text-2xl font-bold">Cierre de Caja</h2>
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

        {Object.entries(summary.payments).map(([name, amount]: any) => (
          <div key={name} className="flex justify-between">
            <span>{name}</span>
            <span>${formatCurrency(amount)}</span>
          </div>
        ))}

        <div className="border-t border-gray-700 pt-2 flex justify-between font-bold text-lg">
          <span>Efectivo esperado</span>
          <span>${formatCurrency(summary.expectedCash)}</span>
        </div>
        <div className="bg-gray-900 p-6 rounded-lg space-y-4">
          <h3 className="font-bold">Contador de billetes</h3>

          {Object.keys(bills).map((value) => (
            <div key={value} className="flex justify-between items-center">
              <span>${value}</span>

              <input
                type="number"
                value={bills[value]}
                onChange={(e) =>
                  setBills({
                    ...bills,
                    [value]: Number(e.target.value),
                  })
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
