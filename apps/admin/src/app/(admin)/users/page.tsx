"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Search, Shield, User } from "lucide-react";

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editingRole, setEditingRole] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: r } = await supabase.from("users").select("tenant_id").eq("id", u.user.id).single();
    if (!r) return;
    setTenantId(r.tenant_id);

    const [{ data: usersData }, { data: rolesData }] = await Promise.all([
      supabase.from("users").select("*, roles(name)").eq("tenant_id", r.tenant_id).order("name"),
      supabase.from("roles").select("*").eq("tenant_id", r.tenant_id).eq("is_active", true).order("name"),
    ]);
    setUsers(usersData || []);
    setRoles(rolesData || []);
  };

  const updateRole = async (userId: string, roleId: string) => {
    await supabase.from("users").update({ role_id: roleId || null }).eq("id", userId);
    setEditingRole(null);
    load();
  };

  const filtered = users.filter((u) =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const getInitials = (name: string) => {
    return (name || "?").split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Usuarios</h1>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} usuarios registrados</p>
        </div>
      </div>

      <div className="relative mb-6">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-sm bg-gray-900 text-gray-100 placeholder-gray-500"
          placeholder="Buscar por nombre o email..." />
      </div>

      <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        <div className="hidden lg:grid grid-cols-12 gap-2 px-5 py-3 border-b border-gray-700 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
          <div className="col-span-5">Usuario</div>
          <div className="col-span-4">Email</div>
          <div className="col-span-2">Rol</div>
          <div className="col-span-1"></div>
        </div>
        <div className="divide-y divide-gray-800">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">Sin usuarios</div>
          ) : filtered.map((u) => (
            <div key={u.id} className="px-5 py-3.5 hover:bg-gray-800/30 transition">
              <div className="lg:grid grid-cols-12 gap-2 items-center">
                <div className="col-span-5 flex items-center gap-3 mb-2 lg:mb-0">
                  <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300 flex-shrink-0">
                    {getInitials(u.name)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-100">{u.name || "Sin nombre"}</p>
                    <p className="text-xs text-gray-500">{u.role || "sin rol"}</p>
                  </div>
                </div>
                <div className="col-span-4 text-sm text-gray-400 mb-2 lg:mb-0">{u.email || "—"}</div>
                <div className="col-span-2 mb-2 lg:mb-0">
                  {editingRole === u.id ? (
                    <select value={u.role_id || ""} onChange={(e) => updateRole(u.id, e.target.value)}
                      className="w-full border border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-gray-800 text-gray-100"
                      autoFocus onBlur={() => setEditingRole(null)}>
                      <option value="">Sin rol</option>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  ) : (
                    <button onClick={() => setEditingRole(u.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 transition border border-gray-700">
                      <Shield size={12} /> {u.roles?.name || "Asignar rol"}
                    </button>
                  )}
                </div>
                <div className="col-span-1 flex justify-end">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${u.is_active !== false ? "bg-emerald-900/30 text-emerald-300" : "bg-red-900/30 text-red-300"}`}>
                    {u.is_active !== false ? "Activo" : "Inactivo"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
