"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

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
  carry_over: number | null;
  difference_reason?: string | null;
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
          .limit(20),
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
            <h3 className="font-semibold">Ultimos cierres</h3>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {closures.length === 0 ? (
                  <tr>
                    <td className="px-5 py-5 text-gray-400" colSpan={6}>
                      Todavia no hay cierres registrados.
                    </td>
                  </tr>
                ) : (
                  closures.map((closure) => (
                    <tr key={closure.id}>
                      <td className="px-5 py-4 text-gray-300">
                        {new Date(closure.closed_at).toLocaleString("es-AR")}
                      </td>
                      <td className="px-5 py-4">
                        ${formatCurrency(Number(closure.total_revenue))}
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
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
