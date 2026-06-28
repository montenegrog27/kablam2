"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Plus, RefreshCw } from "lucide-react";

type Branch = {
  id: string;
  name: string;
};

type CashRegister = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  name: string;
  is_active: boolean;
};

type UserRow = {
  id: string;
  name?: string | null;
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
  branch_id?: string | null;
  cash_register_id?: string | null;
};

function userLabel(user: UserRow) {
  return user.full_name || user.name || user.email || "Usuario sin nombre";
}

export default function CashRegistersPage() {
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const branchMap = useMemo(
    () => Object.fromEntries(branches.map((branch) => [branch.id, branch.name])),
    [branches],
  );

  const visibleRegisters = useMemo(() => {
    if (!selectedBranchId) return registers;
    return registers.filter((register) => register.branch_id === selectedBranchId);
  }, [registers, selectedBranchId]);

  const loadData = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id, branch_id")
      .eq("id", user.id)
      .single();

    if (!userRecord?.tenant_id) {
      setLoading(false);
      return;
    }

    setTenantId(userRecord.tenant_id);
    setCurrentBranchId(userRecord.branch_id || null);

    const [{ data: branchRows }, { data: registerRows }, { data: userRows }] = await Promise.all([
      supabase.from("branches").select("id, name").eq("tenant_id", userRecord.tenant_id).order("name"),
      supabase.from("cash_registers").select("*").eq("tenant_id", userRecord.tenant_id).order("name"),
      supabase
        .from("users")
        .select("id, name, full_name, email, role, branch_id, cash_register_id")
        .eq("tenant_id", userRecord.tenant_id)
        .order("full_name", { ascending: true }),
    ]);

    setBranches((branchRows || []) as Branch[]);
    setRegisters((registerRows || []) as CashRegister[]);
    setUsers((userRows || []) as UserRow[]);
    setSelectedBranchId((current) => current || userRecord.branch_id || branchRows?.[0]?.id || "");
    setLoading(false);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenantId || !selectedBranchId || !name.trim()) return;
    setSaving(true);

    const { error } = await supabase.from("cash_registers").insert({
      tenant_id: tenantId,
      branch_id: selectedBranchId,
      name: name.trim(),
      is_active: true,
    });

    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }

    setName("");
    loadData();
  };

  const assignUser = async (userId: string, register: CashRegister) => {
    const currentUserId = users.find((user) => user.cash_register_id === register.id)?.id;
    if (!userId && !currentUserId) return;

    if (currentUserId && currentUserId !== userId) {
      const { error } = await supabase
        .from("users")
        .update({ cash_register_id: null })
        .eq("id", currentUserId);

      if (error) {
        alert(error.message);
        return;
      }
    }

    if (!userId) {
      loadData();
      return;
    }

    const { error } = await supabase
      .from("users")
      .update({ cash_register_id: register.id, branch_id: register.branch_id })
      .eq("id", userId);

    if (error) {
      alert(error.message);
      return;
    }

    loadData();
  };

  const toggleActive = async (register: CashRegister) => {
    const { error } = await supabase
      .from("cash_registers")
      .update({ is_active: !register.is_active })
      .eq("id", register.id);

    if (error) {
      alert(error.message);
      return;
    }

    loadData();
  };

  if (loading) return <div className="text-sm text-gray-400">Cargando cajas...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Cajas</h1>
          <p className="mt-1 text-sm text-gray-400">
            Crea cajas por sucursal y asigna el usuario que va a operar el cashier.
          </p>
        </div>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-700 px-3 py-2 text-sm font-bold text-gray-200 hover:bg-gray-900"
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>

      <form onSubmit={handleCreate} className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Sucursal</label>
            <select
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-gray-100 outline-none"
              value={selectedBranchId}
              onChange={(event) => setSelectedBranchId(event.target.value)}
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Nombre de caja</label>
            <input
              className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-gray-100 outline-none placeholder:text-gray-600"
              placeholder="Caja mostrador, Caja barra..."
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <button
            disabled={saving || !selectedBranchId || !name.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-gray-950 disabled:opacity-50 md:self-end"
          >
            <Plus size={16} />
            Crear caja
          </button>
        </div>
        {currentBranchId && currentBranchId !== selectedBranchId && (
          <p className="mt-3 text-xs text-amber-300">
            Estas viendo otra sucursal. Para operar desde cashier, el usuario debe quedar asignado a la sucursal de la caja.
          </p>
        )}
      </form>

      {visibleRegisters.length === 0 ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8 text-center text-sm text-gray-400">
          No hay cajas creadas para esta sucursal.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visibleRegisters.map((register) => {
            const assignedUser = users.find((user) => user.cash_register_id === register.id);
            return (
              <div key={register.id} className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-gray-100">{register.name}</h2>
                    <p className="mt-1 text-xs text-gray-500">
                      {register.branch_id ? branchMap[register.branch_id] || "Sucursal" : "Sin sucursal"}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleActive(register)}
                    className={`rounded-full px-3 py-1 text-xs font-black ${
                      register.is_active
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-red-500/15 text-red-300"
                    }`}
                  >
                    {register.is_active ? "Activa" : "Inactiva"}
                  </button>
                </div>

                <label className="mb-1.5 block text-xs font-bold uppercase text-gray-500">Usuario asignado</label>
                <select
                  className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-gray-100 outline-none"
                  value={assignedUser?.id || ""}
                  onChange={(event) => assignUser(event.target.value, register)}
                >
                  <option value="">Sin asignar</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {userLabel(user)}{user.email ? ` - ${user.email}` : ""}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-gray-500">
                  Al asignar, el usuario queda asociado a esta caja y a su sucursal.
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
