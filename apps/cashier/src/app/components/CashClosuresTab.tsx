"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { ChevronDown, ChevronUp } from "lucide-react";

type CashMovement = {
  id: string;
  type: "in" | "out";
  amount: number;
  reason: string | null;
  created_at: string;
  users?: { full_name?: string | null } | null;
};

type CashClosure = {
  id: string;
  opened_at: string;
  closed_at: string;
  opening_amount: number;
  closing_amount: number;
  expected_cash: number;
  difference: number;
  total_revenue: number;
  total_orders: number;
  total_units?: number;
  total_cost?: number;
  profit?: number;
  carry_over: number | null;
  difference_reason?: string | null;
  payments?: Record<string, number>;
  products?: Record<string, { total?: number; variants?: Record<string, number> }>;
  cash_movements?: {
    in?: number;
    out?: number;
    net?: number;
    items?: Array<{ type?: "in" | "out"; amount?: number; reason?: string | null; created_at?: string }>;
  };
  bills_detail?: Record<string, number>;
};

type CashSession = {
  id: string;
  tenant_id: string;
  branch_id: string;
  cash_register_id: string;
  opened_by: string;
  opened_at: string;
  opening_amount: number;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR").format(value || 0);
}

function movementLabel(type: CashMovement["type"]) {
  return type === "in" ? "Ingreso" : "Retiro";
}

export default function CashClosuresTab({
  session,
  onCloseCash,
}: {
  session: CashSession;
  onCloseCash: () => void;
}) {
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [closures, setClosures] = useState<CashClosure[]>([]);
  const [type, setType] = useState<CashMovement["type"]>("out");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expandedClosureId, setExpandedClosureId] = useState<string | null>(null);

  const totals = useMemo(() => {
    return movements.reduce(
      (acc, movement) => {
        const value = Number(movement.amount || 0);
        if (movement.type === "in") acc.in += value;
        if (movement.type === "out") acc.out += value;
        return acc;
      },
      { in: 0, out: 0 },
    );
  }, [movements]);

  const movementNet = totals.in - totals.out;

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);
      setError("");

      const [movementsResult, closuresResult] = await Promise.all([
        supabase
          .from("cash_movements")
          .select("*, users(full_name)")
          .eq("cash_session_id", session.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("cash_closures")
          .select("*")
          .eq("cash_register_id", session.cash_register_id)
          .order("closed_at", { ascending: false })
          .limit(100),
      ]);

      if (!active) return;

      if (movementsResult.error) {
        setError(
          "No pude cargar movimientos. Ejecuta el SQL de caja antes de usar esta vista.",
        );
        setMovements([]);
      } else {
        setMovements((movementsResult.data as CashMovement[]) || []);
      }

      if (!closuresResult.error) {
        setClosures((closuresResult.data as CashClosure[]) || []);
      }

      setLoading(false);
    };

    if (session?.id) void Promise.resolve().then(loadData);

    return () => {
      active = false;
    };
  }, [session?.id, session.cash_register_id]);

  const reloadMovements = async () => {
    const { data } = await supabase
      .from("cash_movements")
      .select("*, users(full_name)")
      .eq("cash_session_id", session.id)
      .order("created_at", { ascending: false });

    setMovements((data as CashMovement[]) || []);
  };

  const handleAddMovement = async () => {
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Ingresa un monto valido.");
      return;
    }

    if (!reason.trim()) {
      setError("Agrega un motivo para auditar el movimiento.");
      return;
    }

    setSaving(true);
    setError("");

    const { error: insertError } = await supabase.from("cash_movements").insert({
      tenant_id: session.tenant_id,
      branch_id: session.branch_id,
      cash_register_id: session.cash_register_id,
      cash_session_id: session.id,
      type,
      amount: parsedAmount,
      reason: reason.trim(),
      created_by: session.opened_by,
    });

    if (insertError) {
      setError("No se pudo guardar el movimiento.");
      setSaving(false);
      return;
    }

    setAmount("");
    setReason("");
    setType("out");
    setSaving(false);
    reloadMovements();
  };

  if (loading) {
    return (
      <div className="h-full bg-gray-950 p-6 text-sm text-gray-300">
        Cargando arqueos...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-950 p-6 text-white">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Arqueos</h2>
            <p className="text-sm text-gray-400">
              Caja abierta desde{" "}
              {new Date(session.opened_at).toLocaleString("es-AR")}
            </p>
          </div>
          <button
            onClick={onCloseCash}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
          >
            Hacer cierre
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Apertura
            </p>
            <p className="mt-2 text-xl font-bold">
              ${formatCurrency(Number(session.opening_amount))}
            </p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Ingresos manuales
            </p>
            <p className="mt-2 text-xl font-bold text-green-300">
              ${formatCurrency(totals.in)}
            </p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Retiros manuales
            </p>
            <p className="mt-2 text-xl font-bold text-red-300">
              ${formatCurrency(totals.out)}
            </p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Neto movimientos
            </p>
            <p
              className={`mt-2 text-xl font-bold ${
                movementNet >= 0 ? "text-green-300" : "text-red-300"
              }`}
            >
              ${formatCurrency(movementNet)}
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <section className="rounded-lg border border-gray-800 bg-gray-900 p-5">
            <h3 className="font-semibold">Nuevo movimiento</h3>
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-gray-800 p-1">
              {(["out", "in"] as CashMovement["type"][]).map((option) => (
                <button
                  key={option}
                  onClick={() => setType(option)}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                    type === option
                      ? "bg-white text-gray-950"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {movementLabel(option)}
                </button>
              ))}
            </div>
            <label className="mt-4 block text-sm text-gray-400">Monto</label>
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-white"
            />
            <label className="mt-4 block text-sm text-gray-400">Motivo</label>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border border-gray-700 bg-gray-800 p-3 text-white"
              placeholder="Ej: retiro para cambio, gasto menor, ingreso extra"
            />
            <button
              onClick={handleAddMovement}
              disabled={saving}
              className="mt-4 w-full rounded-lg bg-emerald-600 p-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:bg-gray-700"
            >
              {saving ? "Guardando..." : "Guardar movimiento"}
            </button>
          </section>

          <section className="rounded-lg border border-gray-800 bg-gray-900">
            <div className="border-b border-gray-800 p-5">
              <h3 className="font-semibold">Movimientos de esta caja</h3>
            </div>
            <div className="divide-y divide-gray-800">
              {movements.length === 0 ? (
                <div className="p-5 text-sm text-gray-400">
                  Todavia no hay movimientos manuales.
                </div>
              ) : (
                movements.map((movement) => (
                  <div
                    key={movement.id}
                    className="grid gap-3 p-5 sm:grid-cols-[120px_1fr_140px]"
                  >
                    <div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          movement.type === "in"
                            ? "bg-green-500/15 text-green-300"
                            : "bg-red-500/15 text-red-300"
                        }`}
                      >
                        {movementLabel(movement.type)}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        {movement.reason || "Sin motivo"}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {new Date(movement.created_at).toLocaleString("es-AR")}
                      </p>
                    </div>
                    <p className="text-right font-bold">
                      ${formatCurrency(Number(movement.amount))}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <section className="rounded-lg border border-gray-800 bg-gray-900">
          <div className="border-b border-gray-800 p-5">
            <h3 className="font-semibold">Arqueos de caja</h3>
            <p className="mt-1 text-xs text-gray-500">
              Misma informacion de admin: venta, esperado, contado, diferencia y snapshot del cierre.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3">Fecha</th>
                  <th className="px-5 py-3">Ventas</th>
                  <th className="px-5 py-3">Esperado</th>
                  <th className="px-5 py-3">Contado</th>
                  <th className="px-5 py-3">Diferencia</th>
                  <th className="px-5 py-3">Motivo</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {closures.length === 0 ? (
                  <tr>
                    <td className="px-5 py-5 text-gray-400" colSpan={7}>
                      Todavia no hay cierres registrados.
                    </td>
                  </tr>
                ) : (
                  closures.map((closure) => {
                    const expanded = expandedClosureId === closure.id;
                    return (
                      <>
                        <tr key={closure.id}>
                          <td className="px-5 py-4 text-gray-300">
                            {new Date(closure.closed_at).toLocaleString("es-AR")}
                          </td>
                          <td className="px-5 py-4">
                            ${formatCurrency(Number(closure.total_revenue))}
                            <p className="mt-1 text-xs text-gray-500">{closure.total_orders || 0} ordenes</p>
                          </td>
                          <td className="px-5 py-4">
                            ${formatCurrency(Number(closure.expected_cash))}
                          </td>
                          <td className="px-5 py-4">
                            ${formatCurrency(Number(closure.closing_amount))}
                          </td>
                          <td
                            className={`px-5 py-4 font-semibold ${
                              Number(closure.difference) === 0
                                ? "text-green-300"
                                : "text-red-300"
                            }`}
                          >
                            ${formatCurrency(Number(closure.difference))}
                          </td>
                          <td className="max-w-[220px] px-5 py-4 text-gray-400">
                            {closure.difference_reason || "-"}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button
                              onClick={() => setExpandedClosureId(expanded ? null : closure.id)}
                              className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
                            >
                              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr key={`${closure.id}-detail`}>
                            <td colSpan={7} className="bg-gray-950/60 px-5 py-5">
                              <ClosureDetail closure={closure} />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function ClosureDetail({ closure }: { closure: CashClosure }) {
  const payments = Object.entries(closure.payments || {});
  const products = Object.entries(closure.products || {});
  const bills = Object.entries(closure.bills_detail || {})
    .filter(([, qty]) => Number(qty) > 0)
    .sort(([a], [b]) => Number(b) - Number(a));
  const movements = closure.cash_movements?.items || [];

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h4 className="mb-3 text-sm font-semibold text-gray-100">Resumen</h4>
        <div className="space-y-2 text-sm">
          <DetailRow label="Apertura" value={`$${formatCurrency(Number(closure.opening_amount))}`} />
          <DetailRow label="Carry over" value={`$${formatCurrency(Number(closure.carry_over || 0))}`} />
          <DetailRow label="Unidades" value={String(closure.total_units || 0)} />
          <DetailRow label="Costo" value={`$${formatCurrency(Number(closure.total_cost || 0))}`} />
          <DetailRow label="Ganancia bruta" value={`$${formatCurrency(Number(closure.profit || 0))}`} />
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h4 className="mb-3 text-sm font-semibold text-gray-100">Pagos</h4>
        <div className="space-y-2 text-sm">
          {payments.length === 0 ? <p className="text-gray-500">Sin detalle.</p> : payments.map(([name, amount]) => (
            <DetailRow key={name} label={name} value={`$${formatCurrency(Number(amount))}`} />
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h4 className="mb-3 text-sm font-semibold text-gray-100">Movimientos</h4>
        <div className="space-y-2 text-sm">
          <DetailRow label="Ingresos" value={`$${formatCurrency(Number(closure.cash_movements?.in || 0))}`} />
          <DetailRow label="Retiros" value={`$${formatCurrency(Number(closure.cash_movements?.out || 0))}`} />
          <DetailRow label="Neto" value={`$${formatCurrency(Number(closure.cash_movements?.net || 0))}`} />
          {movements.slice(0, 4).map((movement, index) => (
            <p key={index} className="border-t border-gray-800 pt-2 text-xs text-gray-400">
              {movement.type === "in" ? "Ingreso" : "Retiro"} - {movement.reason || "Sin motivo"} - ${formatCurrency(Number(movement.amount || 0))}
            </p>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h4 className="mb-3 text-sm font-semibold text-gray-100">Billetes</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {bills.length === 0 ? <p className="col-span-2 text-gray-500">Sin conteo.</p> : bills.map(([value, quantity]) => (
            <div key={value} className="flex justify-between rounded bg-gray-950 px-2 py-1">
              <span>${Number(value).toLocaleString("es-AR")}</span>
              <span className="text-gray-400">x{quantity}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 lg:col-span-4">
        <h4 className="mb-3 text-sm font-semibold text-gray-100">Productos vendidos</h4>
        {products.length === 0 ? <p className="text-sm text-gray-500">Sin snapshot.</p> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {products.slice(0, 12).map(([name, product]) => (
              <div key={name} className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                <div className="flex justify-between gap-3">
                  <p className="font-medium text-gray-100">{name}</p>
                  <span className="text-sm text-gray-400">{product.total || 0}</span>
                </div>
                {Object.entries(product.variants || {}).slice(0, 4).map(([variant, qty]) => (
                  <div key={variant} className="mt-1 flex justify-between text-xs text-gray-500">
                    <span>{variant}</span>
                    <span>{qty}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-100">{value}</span>
    </div>
  );
}
