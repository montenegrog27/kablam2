"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { X, Plus, Trash2, Receipt } from "lucide-react";

type Props = {
  session: any;
  onClose: () => void;
  onExpenseAdded?: () => void;
  canDelete?: boolean;
};

export default function CashierExpenses({ session, onClose, onExpenseAdded, canDelete = false }: Props) {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, []);

  const getToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
  };

  const load = async () => {
    const token = await getToken();
    if (!token) return;

    const response = await fetch(`/api/cashier-expenses?cashSessionId=${encodeURIComponent(session.id)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error || "No se pudieron cargar los gastos.");
      return;
    }

    setExpenses(data.expenses || []);
    setCategories(data.categories || []);
  };

  const addExpense = async () => {
    if (!description.trim() || !amount) return;
    setLoading(true);
    setError("");

    const token = await getToken();
    const response = await fetch("/api/cashier-expenses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        cashSessionId: session.id,
        categoryId: categoryId || null,
        description,
        amount: Number(amount),
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error || "No se pudo registrar el gasto.");
      setLoading(false);
      return;
    }

    setDescription("");
    setAmount("");
    setCategoryId("");
    setLoading(false);
    await load();
    onExpenseAdded?.();
  };

  const deleteExpense = async (id: string) => {
    if (!canDelete) return;
    if (!confirm("Eliminar este gasto?")) return;

    const token = await getToken();
    const response = await fetch(`/api/cashier-expenses?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error || "No se pudo eliminar el gasto.");
      return;
    }

    await load();
    onExpenseAdded?.();
  };

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.total), 0);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-gray-700">
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2"><Receipt size={18} /> Gastos de Caja</h3>
            <p className="text-xs text-gray-500 mt-0.5">Total: ${totalExpenses.toLocaleString("es-AR")}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-800 flex items-center justify-center transition-colors"><X size={18} /></button>
        </div>

        <div className="p-4 border-b border-gray-700 space-y-3">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex-1 border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500"
              placeholder="Descripcion del gasto *"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-32 border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500"
              placeholder="Monto *"
            />
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="flex-1 border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100"
            >
              <option value="">Sin categoria</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button
              onClick={addExpense}
              disabled={!description.trim() || !amount || loading}
              className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-40 flex items-center gap-1"
            >
              <Plus size={14} /> Agregar
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Este gasto descuenta efectivo esperado en el arqueo de la caja actual.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {expenses.length === 0 ? (
            <div className="text-center py-8 text-gray-600 text-sm">Sin gastos registrados en esta caja</div>
          ) : expenses.map((exp) => (
            <div key={exp.id} className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3 border border-gray-700">
              <div>
                <p className="text-sm font-medium text-gray-100">{exp.description}</p>
                <p className="text-xs text-gray-500">
                  {exp.expense_categories?.name && `${exp.expense_categories.name} · `}
                  {new Date(exp.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-red-400 tabular-nums">-${Number(exp.total).toLocaleString("es-AR")}</span>
                {canDelete && (
                  <button onClick={() => deleteExpense(exp.id)} className="p-1 rounded hover:bg-red-900/30 text-red-400"><Trash2 size={13} /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
