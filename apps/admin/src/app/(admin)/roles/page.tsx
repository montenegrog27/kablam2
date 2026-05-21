"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Plus, Trash2, Pencil, X, Shield, Search } from "lucide-react";

const MODULES = ["admin", "cashier", "customer"];

export default function RolesPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [moduleFilter, setModuleFilter] = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: r } = await supabase.from("users").select("tenant_id").eq("id", u.user.id).single();
    if (!r) return;
    setTenantId(r.tenant_id);

    const [{ data: rolesData }, { data: permsData }] = await Promise.all([
      supabase.from("roles").select("*, role_permissions!left(permission_id)").eq("tenant_id", r.tenant_id).order("name"),
      supabase.from("permissions").select("*").order("module").order("name"),
    ]);
    setRoles(rolesData || []);
    setPermissions(permsData || []);
  };

  const resetForm = () => { setName(""); setDescription(""); setSelectedPerms([]); setEditing(null); setShowForm(false); };

  const startEdit = (role: any) => {
    setEditing(role);
    setName(role.name);
    setDescription(role.description || "");
    setSelectedPerms((role.role_permissions || []).map((rp: any) => rp.permission_id));
    setShowForm(true);
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!tenantId || !name) return;

    if (editing) {
      await supabase.from("roles").update({ name, description }).eq("id", editing.id);
      await supabase.from("role_permissions").delete().eq("role_id", editing.id);
    } else {
      const { data: newRole } = await supabase.from("roles").insert({ tenant_id: tenantId, name, description }).select().single();
      if (!newRole) return;
      if (selectedPerms.length > 0) {
        await supabase.from("role_permissions").insert(selectedPerms.map((pid) => ({ role_id: newRole.id, permission_id: pid })));
      }
      resetForm(); load();
      return;
    }

    if (selectedPerms.length > 0) {
      await supabase.from("role_permissions").insert(selectedPerms.map((pid) => ({ role_id: editing.id, permission_id: pid })));
    }
    resetForm(); load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar rol?")) return;
    // Check if any user has this role
    const { data: usersWithRole } = await supabase.from("users").select("id").eq("role_id", id).limit(1);
    if (usersWithRole && usersWithRole.length > 0) {
      alert("No se puede eliminar un rol asignado a usuarios. Reasigná los usuarios primero.");
      return;
    }
    await supabase.from("roles").delete().eq("id", id);
    load();
  };

  const togglePerm = (pid: string) => {
    setSelectedPerms((prev) => prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid]);
  };

  const filteredPerms = moduleFilter ? permissions.filter((p) => p.module === moduleFilter) : permissions;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Roles y Permisos</h1>
          <p className="text-sm text-gray-500 mt-0.5">{roles.length} roles · {permissions.length} permisos</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black text-sm font-medium transition border border-gray-700">
          <Plus size={16} /> Nuevo rol
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-100"><Shield size={16} className="inline mr-1" /> {editing ? "Editar" : "Nuevo"} rol</h3>
            <button onClick={resetForm} className="p-1 rounded-lg hover:bg-gray-800"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <input className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Nombre del rol *" value={name} onChange={(e) => setName(e.target.value)} required />
            <input className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Permisos</span>
              <div className="flex gap-1">
                {MODULES.map((m) => (
                  <button key={m} onClick={() => setModuleFilter(moduleFilter === m ? "" : m)}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition ${
                      moduleFilter === m ? "bg-blue-600/30 text-blue-300" : "bg-gray-800 text-gray-500 hover:text-gray-300"
                    }`}>{m}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-64 overflow-y-auto bg-gray-800 rounded-xl p-3">
              {filteredPerms.map((perm) => (
                <label key={perm.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-700 cursor-pointer transition">
                  <input type="checkbox" checked={selectedPerms.includes(perm.id)} onChange={() => togglePerm(perm.id)}
                    className="rounded border-gray-600 text-gray-900 focus:ring-gray-500 h-3.5 w-3.5" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-200 truncate">{perm.name}</p>
                    <p className="text-[10px] text-gray-500">{perm.key}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <button type="submit" className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-black border border-gray-700">
            {editing ? "Guardar cambios" : "Crear rol"}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {roles.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">Sin roles creados</div>
        ) : roles.map((role) => (
          <div key={role.id} className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield size={18} className="text-gray-400" />
                <div>
                  <p className="font-medium text-gray-100">{role.name}</p>
                  {role.description && <p className="text-xs text-gray-500">{role.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{(role.role_permissions || []).length} permisos</span>
                <button onClick={() => startEdit(role)} className="p-1.5 rounded hover:bg-gray-800 text-gray-400"><Pencil size={14} /></button>
                <button onClick={() => handleDelete(role.id)} className="p-1.5 rounded hover:bg-red-900/30 text-red-400"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
