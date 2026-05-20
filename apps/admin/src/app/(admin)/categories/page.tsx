"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, X } from "lucide-react";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | "">("");
  const [position, setPosition] = useState(0);
  const [active, setActive] = useState(true);
  const [availableIn, setAvailableIn] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const dayPartLabels: Record<string, string> = { breakfast: "Desayuno", lunch: "Almuerzo", snack: "Merienda", dinner: "Cena" };

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;
    const { data: userRecord } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
    if (!userRecord) return;
    setTenantId(userRecord.tenant_id);
    const { data } = await supabase.from("categories").select("*").eq("tenant_id", userRecord.tenant_id).order("position");
    setCategories(data || []);
  };

  const resetForm = () => { setName(""); setParentId(""); setPosition(0); setActive(true); setAvailableIn([]); setEditing(null); setShowForm(false); };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!tenantId || !name) return;
    const payload = { tenant_id: tenantId, name, parent_id: parentId || null, position, active, available_in: availableIn };
    if (editing) { await supabase.from("categories").update(payload).eq("id", editing.id); }
    else { await supabase.from("categories").insert(payload); }
    resetForm(); loadData();
  };

  const handleEdit = (cat: any) => { setEditing(cat); setName(cat.name); setParentId(cat.parent_id || ""); setPosition(cat.position); setActive(cat.active); setAvailableIn(cat.available_in || []); setShowForm(true); };
  const handleDelete = async (id: string) => { if (!confirm("¿Eliminar?")) return; await supabase.from("categories").delete().eq("id", id); if (editing?.id === id) resetForm(); loadData(); };
  const toggleSlot = (s: string) => setAvailableIn((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  const toggleExpand = (id: string) => setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const rootCats = categories.filter((c: any) => !c.parent_id);
  const subCats = (pid: string) => categories.filter((c: any) => c.parent_id === pid);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Categorías</h1>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black text-sm font-medium transition">
          <Plus size={16} /> Nueva categoría
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-100">{editing ? "Editar categoría" : "Nueva categoría"}</h3>
            <button type="button" onClick={resetForm} className="p-1 rounded-lg hover:bg-gray-800"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <input className="border border-gray-600 rounded-lg px-3 py-2 text-sm" placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
              <select className="border border-gray-600 rounded-lg px-3 py-2 text-sm" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">Categoría raíz</option>
                {(editing ? categories.filter((c: any) => c.id !== editing.id) : categories).filter((c: any) => !c.parent_id).map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <input type="number" className="border border-gray-600 rounded-lg px-3 py-2 text-sm" placeholder="Posición" value={position} onChange={(e) => setPosition(Number(e.target.value))} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" /> Activa</label>
          </div>
          <div>
            <p className="text-sm text-gray-400 mb-2">Disponible en:</p>
            <div className="flex gap-4">{Object.entries(dayPartLabels).map(([k, v]) => (<label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={availableIn.includes(k)} onChange={() => toggleSlot(k)} className="h-4 w-4" />{v}</label>))}</div>
          </div>
          <button className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-black">{editing ? "Guardar cambios" : "Crear categoría"}</button>
        </form>
      )}

      {/* Tree */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        {rootCats.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No hay categorías. Creá una nueva.</div>
        ) : rootCats.map((cat: any) => {
          const subs = subCats(cat.id);
          const isEditing = editing?.id === cat.id;
          return (
            <div key={cat.id} className={`border-b border-gray-800 last:border-0 ${isEditing ? "bg-blue-50" : "hover:bg-gray-800"}`}>
              <div className="flex items-center gap-2 px-4 py-3">
                {subs.length > 0 && (
                  <button onClick={() => toggleExpand(cat.id)} className="text-gray-400 hover:text-gray-600">
                    {expanded.has(cat.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                )}
                {subs.length === 0 && <div className="w-4" />}
                <span className="flex-1 text-sm font-medium text-gray-100">{cat.name}</span>
                {!cat.active && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Inactiva</span>}
                <span className="text-[11px] text-gray-400">pos {cat.position}</span>
                <button onClick={() => handleEdit(cat)} className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"><Pencil size={14} /></button>
                <button onClick={() => handleDelete(cat.id)} className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </div>
              {expanded.has(cat.id) && subs.length > 0 && (
                <div className="ml-6 border-l-2 border-gray-800">
                  {subs.map((sub: any) => (
                    <div key={sub.id} className={`flex items-center gap-2 px-4 py-2.5 border-b border-gray-50 last:border-0 ${editing?.id === sub.id ? "bg-blue-50" : "hover:bg-gray-800"}`}>
                      <div className="w-4" />
                      <span className="flex-1 text-sm text-gray-800">{sub.name}</span>
                      {!sub.active && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Inactiva</span>}
                      <button onClick={() => handleEdit(sub)} className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(sub.id)} className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
