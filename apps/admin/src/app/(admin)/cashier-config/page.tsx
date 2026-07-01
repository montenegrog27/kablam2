"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";

type TargetType = "product" | "category";

export default function CashierConfigPage() {
  const [tenantId, setTenantId] = useState("");
  const [branches, setBranches] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [targetType, setTargetType] = useState<TargetType>("product");
  const [targetId, setTargetId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const targetOptions = useMemo(
    () => (targetType === "product" ? products : categories),
    [targetType, products, categories],
  );

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setError("");
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!userRecord?.tenant_id) return;
    setTenantId(userRecord.tenant_id);

    const [{ data: branchRows }, { data: productRows }, { data: categoryRows }, { data: alertRows, error: alertError }] =
      await Promise.all([
        supabase
          .from("branches")
          .select("id, name, slug")
          .eq("tenant_id", userRecord.tenant_id)
          .order("name"),
        supabase
          .from("products")
          .select("id, name, branch_id, categories(name)")
          .eq("tenant_id", userRecord.tenant_id)
          .order("name"),
        supabase
          .from("categories")
          .select("id, name, parent_id")
          .eq("tenant_id", userRecord.tenant_id)
          .order("name"),
        supabase
          .from("cashier_delivery_alerts")
          .select("*")
          .eq("tenant_id", userRecord.tenant_id)
          .order("created_at", { ascending: false }),
      ]);

    if (alertError) {
      setError(
        alertError.message.includes("schema cache") || alertError.message.includes("does not exist")
          ? "Falta ejecutar add_cashier_delivery_alerts.sql en Supabase."
          : alertError.message,
      );
    }

    setBranches(branchRows || []);
    setProducts(productRows || []);
    setCategories(categoryRows || []);
    setAlerts(alertRows || []);
  }

  async function addAlert() {
    if (!tenantId || !targetId) return;
    setSaving(true);
    setError("");

    const { error: insertError } = await supabase.from("cashier_delivery_alerts").insert({
      tenant_id: tenantId,
      branch_id: branchId || null,
      target_type: targetType,
      target_id: targetId,
      message: message.trim() || null,
      is_active: true,
    });

    setSaving(false);
    if (insertError) {
      setError(
        insertError.message.includes("schema cache") || insertError.message.includes("does not exist")
          ? "Falta ejecutar add_cashier_delivery_alerts.sql en Supabase."
          : insertError.message,
      );
      return;
    }

    setTargetId("");
    setMessage("");
    await load();
  }

  async function removeAlert(id: string) {
    if (!confirm("Eliminar esta alerta del cashier?")) return;
    await supabase.from("cashier_delivery_alerts").delete().eq("id", id);
    await load();
  }

  async function toggleAlert(alert: any) {
    await supabase
      .from("cashier_delivery_alerts")
      .update({ is_active: !alert.is_active })
      .eq("id", alert.id);
    await load();
  }

  function getTargetName(alert: any) {
    const source = alert.target_type === "product" ? products : categories;
    return source.find((item) => item.id === alert.target_id)?.name || "No encontrado";
  }

  function getBranchName(alert: any) {
    if (!alert.branch_id) return "Todas las sucursales";
    return branches.find((branch) => branch.id === alert.branch_id)?.name || "Sucursal";
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6 text-white">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-400">
            Cashier
          </p>
          <h1 className="mt-2 text-3xl font-black">Config del cashier</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-400">
            Configura alertas gigantes para recordar productos o categorias importantes antes de enviar o entregar un pedido.
          </p>
        </div>
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-100">
          <AlertTriangle size={28} />
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-lg font-bold">Nueva alerta</h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-[160px_1fr_220px_1.2fr_auto]">
          <select
            value={targetType}
            onChange={(event) => {
              setTargetType(event.target.value as TargetType);
              setTargetId("");
            }}
            className="rounded-xl border border-gray-700 bg-gray-950 px-3 py-3 text-sm text-white"
          >
            <option value="product">Producto</option>
            <option value="category">Categoria</option>
          </select>

          <select
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
            className="rounded-xl border border-gray-700 bg-gray-950 px-3 py-3 text-sm text-white"
          >
            <option value="">Seleccionar {targetType === "product" ? "producto" : "categoria"}</option>
            {targetOptions.map((item: any) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          <select
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            className="rounded-xl border border-gray-700 bg-gray-950 px-3 py-3 text-sm text-white"
          >
            <option value="">Todas las sucursales</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>

          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Mensaje opcional. Ej: poner salsa aparte"
            className="rounded-xl border border-gray-700 bg-gray-950 px-3 py-3 text-sm text-white placeholder:text-gray-500"
          />

          <button
            onClick={addAlert}
            disabled={saving || !targetId}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-black transition hover:bg-amber-400 disabled:opacity-40"
          >
            <Plus size={16} />
            Agregar
          </button>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 p-5">
          <h2 className="text-lg font-bold">Alertas configuradas</h2>
          <p className="mt-1 text-sm text-gray-400">
            Se disparan cuando el pedido pasa de listo a enviado/entregado, o de enviado a entregado.
          </p>
        </div>

        <div className="divide-y divide-gray-800">
          {alerts.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              Todavia no hay alertas configuradas.
            </div>
          )}

          {alerts.map((alert) => (
            <div key={alert.id} className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-gray-800 px-3 py-1 text-xs font-black uppercase text-gray-200">
                    {alert.target_type === "product" ? "Producto" : "Categoria"}
                  </span>
                  <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${alert.is_active ? "bg-emerald-500/15 text-emerald-300" : "bg-gray-800 text-gray-500"}`}>
                    {alert.is_active ? "Activa" : "Pausada"}
                  </span>
                  <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-200">
                    {getBranchName(alert)}
                  </span>
                </div>
                <h3 className="mt-3 text-xl font-black">{getTargetName(alert)}</h3>
                {alert.message && <p className="mt-1 text-sm text-amber-200">{alert.message}</p>}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => toggleAlert(alert)}
                  className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-bold text-gray-200 hover:bg-gray-800"
                >
                  {alert.is_active ? "Pausar" : "Activar"}
                </button>
                <button
                  onClick={() => removeAlert(alert.id)}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-500/40 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 size={15} />
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
