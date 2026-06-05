"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Plus, Trash2, Pencil, X } from "lucide-react";

export default function PackagingPage() {
  const [items, setItems] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [consumptionType, setConsumptionType] = useState("PER_PRODUCT");
  const [ruleType, setRuleType] = useState("PER_BURGER_COUNT");
  const [unitsPerPackage, setUnitsPerPackage] = useState("2");

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: r } = await supabase.from("users").select("tenant_id").eq("id", u.user.id).single();
    if (!r) return;
    setTenantId(r.tenant_id);
    const { data } = await supabase.from("packaging").select("*").eq("tenant_id", r.tenant_id).order("name");
    setItems(data || []);
  };

  const resetForm = () => {
    setName("");
    setCost("");
    setConsumptionType("PER_PRODUCT");
    setRuleType("PER_BURGER_COUNT");
    setUnitsPerPackage("2");
    setEditing(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!tenantId || !name) return;
    setError("");
    const payload = {
      tenant_id: tenantId,
      name,
      cost_per_unit: Number(cost) || 0,
      consumption_type: consumptionType,
      rule: consumptionType === "CUSTOM_RULE"
        ? { type: ruleType, unitsPerPackage: Math.max(1, Number(unitsPerPackage || 1)), rounding: "ceil" }
        : null,
    };
    const { error: saveError } = editing
      ? await supabase.from("packaging").update(payload).eq("id", editing.id)
      : await supabase.from("packaging").insert(payload);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    resetForm(); load();
  };

  const quickUpdateConsumption = async (item: any, value: string) => {
    setError("");
    const payload = {
      consumption_type: value,
      rule: value === "CUSTOM_RULE"
        ? { type: "PER_BURGER_COUNT", unitsPerPackage: Number(item.rule?.unitsPerPackage || 2), rounding: "ceil" }
        : null,
    };
    const { error: updateError } = await supabase.from("packaging").update(payload).eq("id", item.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    load();
  };

  const startBagTemplate = () => {
    resetForm();
    setName("Bolsa Delivery");
    setCost("550");
    setConsumptionType("CUSTOM_RULE");
    setRuleType("PER_BURGER_COUNT");
    setUnitsPerPackage("2");
    setShowForm(true);
  };

  const handleDelete = async (id: string) => { if (!confirm("¿Eliminar?")) return; await supabase.from("packaging").delete().eq("id", id); load(); };
  const startEdit = (item: any) => {
    setEditing(item);
    setName(item.name);
    setCost(String(item.cost_per_unit || ""));
    setConsumptionType(item.consumption_type || "PER_PRODUCT");
    setRuleType(item.rule?.type || "PER_BURGER_COUNT");
    setUnitsPerPackage(String(item.rule?.unitsPerPackage || 2));
    setShowForm(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Packaging</h1>
          <p className="mt-1 text-sm text-gray-500">Configura si cada item se consume por receta, por pedido o con regla custom.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={startBagTemplate} className="flex items-center gap-2 px-4 py-2 bg-emerald-900/40 text-emerald-200 rounded-lg hover:bg-emerald-900/60 text-sm font-medium transition border border-emerald-800">
            <Plus size={16} /> Bolsa Delivery
          </button>
          <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black text-sm font-medium transition border border-gray-700">
            <Plus size={16} /> Nuevo packaging
          </button>
        </div>
      </div>
      {error && (
        <div className="mb-4 rounded-lg border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error.includes("consumption_type") || error.includes("rule")
            ? "Faltan columnas en Supabase. Ejecuta add_financial_settings.sql y refresca esta pagina."
            : error}
        </div>
      )}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6 space-y-4">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-gray-100">{editing ? "Editar" : "Nuevo"} packaging</h3>
            <button type="button" onClick={resetForm} className="p-1 rounded-lg hover:bg-gray-800"><X size={18} /></button></div>
          <div className="grid grid-cols-2 gap-4">
            <input className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Nombre *" value={name} onChange={(e) => setName(e.target.value)} required />
            <input type="number" step="0.01" className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Costo por unidad" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-400">Consumo</span>
              <select className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100" value={consumptionType} onChange={(e) => setConsumptionType(e.target.value)}>
                <option value="PER_PRODUCT">Por producto/receta</option>
                <option value="PER_ORDER">Por pedido</option>
                <option value="CUSTOM_RULE">Regla custom</option>
              </select>
            </label>
            {consumptionType === "CUSTOM_RULE" && (
              <>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-400">Regla</span>
                  <select className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100" value={ruleType} onChange={(e) => setRuleType(e.target.value)}>
                    <option value="PER_BURGER_COUNT">Por cantidad de hamburguesas</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-gray-400">Unidades por paquete</span>
                  <input type="number" min="1" className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100" value={unitsPerPackage} onChange={(e) => setUnitsPerPackage(e.target.value)} />
                </label>
              </>
            )}
          </div>
          <button className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-black border border-gray-700">{editing ? "Guardar" : "Crear"}</button>
        </form>
      )}
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">Sin packaging registrado</div>
        ) : items.map((item) => (
          <div key={item.id} className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-gray-800"><span className="text-sm">📦</span></div>
              <div>
                <p className="font-medium text-gray-100">{item.name}</p>
                <p className="text-xs text-gray-500">
                  ${Number(item.cost_per_unit || 0).toLocaleString("es-AR")} c/u · {formatConsumption(item)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={item.consumption_type || "PER_PRODUCT"}
                onChange={(e) => quickUpdateConsumption(item, e.target.value)}
                className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-gray-100"
              >
                <option value="PER_PRODUCT">Por receta</option>
                <option value="PER_ORDER">Por pedido</option>
                <option value="CUSTOM_RULE">Regla custom</option>
              </select>
              <button onClick={() => startEdit(item)} className="p-1.5 rounded hover:bg-gray-800 text-gray-400"><Pencil size={14} /></button>
              <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded hover:bg-red-900/30 text-red-400"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatConsumption(item: any) {
  if (item.consumption_type === "PER_ORDER") return "por pedido";
  if (item.consumption_type === "CUSTOM_RULE" && item.rule?.type === "PER_BURGER_COUNT") {
    return `1 cada ${item.rule.unitsPerPackage || 1} hamburguesas`;
  }
  return "por producto/receta";
}
