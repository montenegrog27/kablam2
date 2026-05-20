"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Plus, Pencil, Trash2, X, Check, Award, ShoppingBag } from "lucide-react";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export default function LoyaltyRulesPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<"points" | "product_accumulation">("product_accumulation");
  const [pointsPerAmount, setPointsPerAmount] = useState("1000");
  const [productId, setProductId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [requiredQty, setRequiredQty] = useState("5");
  const [rewardProductId, setRewardProductId] = useState("");
  const [rewardType, setRewardType] = useState("free_product");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;
    const { data: userRecord } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
    if (!userRecord) return;
    setTenantId(userRecord.tenant_id);

    const { data: rulesData } = await supabase.from("loyalty_rules").select("*").eq("tenant_id", userRecord.tenant_id).order("created_at", { ascending: false });
    setRules(rulesData || []);

    const { data: prods } = await supabase.from("products").select("id, name").eq("tenant_id", userRecord.tenant_id).order("name");
    setProducts(prods || []);

    const { data: cats } = await supabase.from("categories").select("id, name").eq("tenant_id", userRecord.tenant_id).order("name");
    setCategories(cats || []);
  };

  const resetForm = () => {
    setName(""); setType("product_accumulation"); setPointsPerAmount("1000");
    setProductId(""); setCategoryId(""); setRequiredQty("5");
    setRewardProductId(""); setRewardType("free_product"); setIsActive(true);
    setEditing(null); setShowForm(false);
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!tenantId || !name) return;
    const payload: any = { tenant_id: tenantId, name, type, is_active: isActive };
    if (type === "points") payload.points_per_amount = Number(pointsPerAmount);
    else {
      payload.product_id = productId || null;
      payload.category_id = categoryId || null;
      payload.required_quantity = Number(requiredQty);
      payload.reward_type = rewardType;
      if (rewardType === "free_product") payload.reward_product_id = rewardProductId || null;
      else payload.reward_value = Number(rewardValue);
    }
    if (editing) await supabase.from("loyalty_rules").update(payload).eq("id", editing.id);
    else await supabase.from("loyalty_rules").insert(payload);
    resetForm(); loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta regla?")) return;
    await supabase.from("loyalty_rules").delete().eq("id", id);
    loadData();
  };

  const handleToggle = async (rule: any) => {
    await supabase.from("loyalty_rules").update({ is_active: !rule.is_active }).eq("id", rule.id);
    loadData();
  };

  const [rewardValue, setRewardValue] = useState("");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Fidelización</h1>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black text-sm font-medium transition">
          <Plus size={16} /> Nueva regla
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-100">{editing ? "Editar regla" : "Nueva regla de fidelización"}</h3>
            <button type="button" onClick={resetForm} className="p-1 rounded-lg hover:bg-gray-800"><X size={18} /></button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nombre</label>
              <input className="border border-gray-600 rounded-lg px-3 py-2 w-full text-sm" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ej: Hamburguesas dobles" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Tipo</label>
              <select className="border border-gray-600 rounded-lg px-3 py-2 w-full text-sm" value={type} onChange={(e) => setType(e.target.value as any)}>
                <option value="product_accumulation">Acumulación de productos</option>
                <option value="points">Puntos por gasto</option>
              </select>
            </div>
          </div>

          {type === "points" ? (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Cada $X = 1 punto</label>
              <input type="number" className="border border-gray-600 rounded-lg px-3 py-2 text-sm w-48" value={pointsPerAmount} onChange={(e) => setPointsPerAmount(e.target.value)} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Producto (opcional)</label>
                  <select className="border border-gray-600 rounded-lg px-3 py-2 w-full text-sm" value={productId} onChange={(e) => setProductId(e.target.value)}>
                    <option value="">Cualquier producto</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Categoría (opcional)</label>
                  <select className="border border-gray-600 rounded-lg px-3 py-2 w-full text-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <option value="">Cualquier categoría</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Cantidad requerida</label>
                  <input type="number" className="border border-gray-600 rounded-lg px-3 py-2 text-sm w-32" value={requiredQty} onChange={(e) => setRequiredQty(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Tipo de recompensa</label>
                  <select className="border border-gray-600 rounded-lg px-3 py-2 w-full text-sm" value={rewardType} onChange={(e) => setRewardType(e.target.value)}>
                    <option value="free_product">Producto gratis</option>
                    <option value="discount_percent">% descuento</option>
                    <option value="discount_amount">$ descuento</option>
                  </select>
                </div>
              </div>
              {rewardType === "free_product" ? (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Producto de regalo</label>
                  <select className="border border-gray-600 rounded-lg px-3 py-2 text-sm" value={rewardProductId} onChange={(e) => setRewardProductId(e.target.value)} required>
                    <option value="">Seleccionar...</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    {rewardType === "discount_percent" ? "Porcentaje de descuento" : "Monto de descuento ($)"}
                  </label>
                  <input type="number" className="border border-gray-600 rounded-lg px-3 py-2 text-sm w-48" value={rewardValue} onChange={(e) => setRewardValue(e.target.value)} />
                </div>
              )}
            </>
          )}

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
              Activa
            </label>
          </div>

          <button className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-black">
            {editing ? "Guardar cambios" : "Crear regla"}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {rules.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-gray-900 rounded-xl border border-gray-700">
            <Award size={40} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No hay reglas de fidelización</p>
          </div>
        ) : rules.map((rule) => (
          <div key={rule.id} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                  {rule.type === "points" ? <Award size={18} className="text-orange-600" /> : <ShoppingBag size={18} className="text-orange-600" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-100">{rule.name}</span>
                    {!rule.is_active && <span className="text-[10px] bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Inactiva</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {rule.type === "points"
                      ? `Cada $${rule.points_per_amount} = 1 punto`
                      : `${rule.required_quantity}x compras → ${rule.reward_type === "free_product" ? "Producto gratis" : rule.reward_type === "discount_percent" ? rule.reward_value + "% OFF" : "$" + rule.reward_value + " OFF"}`
                    }
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => handleToggle(rule)} className={`p-1.5 rounded-lg transition ${rule.is_active ? "text-green-500 hover:bg-green-50" : "text-gray-300 hover:bg-gray-800"}`}>
                  <Check size={16} />
                </button>
                <button onClick={() => { setEditing(rule); setName(rule.name); setType(rule.type); setPointsPerAmount(String(rule.points_per_amount || 1000)); setProductId(rule.product_id || ""); setCategoryId(rule.category_id || ""); setRequiredQty(String(rule.required_quantity || 5)); setRewardProductId(rule.reward_product_id || ""); setRewardType(rule.reward_type || "free_product"); setIsActive(rule.is_active); setShowForm(true); }} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-600">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(rule.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
