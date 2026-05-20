"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Plus, Trash2, Pencil, X, Search } from "lucide-react";

export default function SuppliersPage() {
  const [items, setItems] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [cuit, setCuit] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: r } = await supabase.from("users").select("tenant_id").eq("id", u.user.id).single();
    if (!r) return;
    setTenantId(r.tenant_id);
    const { data } = await supabase.from("suppliers").select("*").eq("tenant_id", r.tenant_id).order("name");
    setItems(data || []);
  };

  const resetForm = () => { setName(""); setContact(""); setPhone(""); setEmail(""); setAddress(""); setCuit(""); setNotes(""); setEditing(null); setShowForm(false); };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!tenantId || !name) return;
    const payload = { tenant_id: tenantId, name, contact_name: contact, phone, email, address, cuit, notes };
    if (editing) { await supabase.from("suppliers").update(payload).eq("id", editing.id); }
    else { await supabase.from("suppliers").insert(payload); }
    resetForm(); load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar proveedor?")) return;
    await supabase.from("suppliers").delete().eq("id", id);
    load();
  };

  const startEdit = (item: any) => {
    setEditing(item); setName(item.name); setContact(item.contact_name || ""); setPhone(item.phone || "");
    setEmail(item.email || ""); setAddress(item.address || ""); setCuit(item.cuit || ""); setNotes(item.notes || "");
    setShowForm(true);
  };

  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Proveedores</h1>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black text-sm font-medium transition border border-gray-700">
          <Plus size={16} /> Nuevo proveedor
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6 space-y-4">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-gray-100">{editing ? "Editar" : "Nuevo"} proveedor</h3>
            <button type="button" onClick={resetForm} className="p-1 rounded-lg hover:bg-gray-800"><X size={18} /></button></div>
          <div className="grid grid-cols-2 gap-4">
            <input className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Nombre *" value={name} onChange={(e) => setName(e.target.value)} required />
            <input className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Contacto" value={contact} onChange={(e) => setContact(e.target.value)} />
            <input className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Dirección" value={address} onChange={(e) => setAddress(e.target.value)} />
            <input className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="CUIT" value={cuit} onChange={(e) => setCuit(e.target.value)} />
          </div>
          <textarea className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500 w-full" placeholder="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          <button className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-black border border-gray-700">{editing ? "Guardar" : "Crear"}</button>
        </form>
      )}

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input className="w-full border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm bg-gray-900 text-gray-100 placeholder-gray-500" placeholder="Buscar proveedor..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">No hay proveedores</div>
        ) : filtered.map((item) => (
          <div key={item.id} className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-100">{item.name}</p>
              <p className="text-xs text-gray-400">{item.contact_name ? `${item.contact_name} · ` : ""}{item.phone || ""}{item.cuit ? ` · CUIT: ${item.cuit}` : ""}</p>
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
