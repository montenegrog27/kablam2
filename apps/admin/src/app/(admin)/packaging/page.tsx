"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Plus, Trash2, Pencil, X } from "lucide-react";

export default function PackagingPage() {
  const [items, setItems] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");

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

  const resetForm = () => { setName(""); setCost(""); setEditing(null); setShowForm(false); };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!tenantId || !name) return;
    const payload = { tenant_id: tenantId, name, cost_per_unit: Number(cost) || 0 };
    if (editing) { await supabase.from("packaging").update(payload).eq("id", editing.id); }
    else { await supabase.from("packaging").insert(payload); }
    resetForm(); load();
  };

  const handleDelete = async (id: string) => { if (!confirm("¿Eliminar?")) return; await supabase.from("packaging").delete().eq("id", id); load(); };
  const startEdit = (item: any) => { setEditing(item); setName(item.name); setCost(String(item.cost_per_unit || "")); setShowForm(true); };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Packaging</h1>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black text-sm font-medium transition border border-gray-700">
          <Plus size={16} /> Nuevo packaging
        </button>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6 space-y-4">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-gray-100">{editing ? "Editar" : "Nuevo"} packaging</h3>
            <button type="button" onClick={resetForm} className="p-1 rounded-lg hover:bg-gray-800"><X size={18} /></button></div>
          <div className="grid grid-cols-2 gap-4">
            <input className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Nombre *" value={name} onChange={(e) => setName(e.target.value)} required />
            <input type="number" step="0.01" className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Costo por unidad" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <button className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-black border border-gray-700">{editing ? "Guardar" : "Crear"}</button>
        </form>
      )}
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">Sin packaging registrado</div>
        ) : items.map((item) => (
          <div key={item.id} className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-lg bg-gray-800"><span className="text-sm">📦</span></div>
              <div><p className="font-medium text-gray-100">{item.name}</p><p className="text-xs text-gray-500">${Number(item.cost_per_unit || 0).toLocaleString("es-AR")} c/u</p></div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => startEdit(item)} className="p-1.5 rounded hover:bg-gray-800 text-gray-400"><Pencil size={14} /></button>
              <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded hover:bg-red-900/30 text-red-400"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
