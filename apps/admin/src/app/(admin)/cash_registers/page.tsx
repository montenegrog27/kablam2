"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Check, Pencil, Plus, RefreshCw, X } from "lucide-react";

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
  email?: string | null;
  role?: string | null;
  branch_id?: string | null;
  cash_register_id?: string | null;
};

type RegisterAssignment = {
  user_id: string;
  cash_register_id: string;
};

function userLabel(user: UserRow) {
  return user.name || user.email || "Usuario sin nombre";
}

export default function CashRegistersPage() {
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [name, setName] = useState("");
  const [assignments, setAssignments] = useState<RegisterAssignment[]>([]);
  const [assignmentTableReady, setAssignmentTableReady] = useState(true);
  const [editingRegisterId, setEditingRegisterId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBranchId, setEditBranchId] = useState("");
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

    const [{ data: branchRows }, { data: registerRows }, { data: userRows, error: usersError }, { data: assignmentRows, error: assignmentsError }] = await Promise.all([
      supabase.from("branches").select("id, name").eq("tenant_id", userRecord.tenant_id).order("name"),
      supabase.from("cash_registers").select("*").eq("tenant_id", userRecord.tenant_id).order("name"),
      supabase
        .from("users")
        .select("id, name, email, role, branch_id, cash_register_id")
        .eq("tenant_id", userRecord.tenant_id)
        .order("name", { ascending: true }),
      supabase
        .from("user_cash_registers")
        .select("user_id, cash_register_id")
        .eq("tenant_id", userRecord.tenant_id),
    ]);

    if (usersError) alert(`No se pudieron cargar usuarios: ${usersError.message}`);

    setBranches((branchRows || []) as Branch[]);
    setRegisters((registerRows || []) as CashRegister[]);
    setUsers((userRows || []) as UserRow[]);
    setAssignments((assignmentRows || []) as RegisterAssignment[]);
    setAssignmentTableReady(!assignmentsError);
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

  const assignedUserIds = (registerId: string) => {
    const fromRelations = assignments
      .filter((assignment) => assignment.cash_register_id === registerId)
      .map((assignment) => assignment.user_id);
    const fromLegacy = users
      .filter((user) => user.cash_register_id === registerId)
      .map((user) => user.id);

    return Array.from(new Set([...fromRelations, ...fromLegacy]));
  };

  const toggleUserAssignment = async (user: UserRow, register: CashRegister) => {
    const isAssigned = assignedUserIds(register.id).includes(user.id);

    if (!assignmentTableReady) {
      const { error } = await supabase
        .from("users")
        .update({
          cash_register_id: isAssigned ? null : register.id,
          branch_id: isAssigned ? user.branch_id : register.branch_id,
        })
        .eq("id", user.id);

      if (error) {
        alert(error.message);
        return;
      }
      loadData();
      return;
    }

    if (isAssigned) {
      const { error: relationError } = await supabase
        .from("user_cash_registers")
        .delete()
        .eq("user_id", user.id)
        .eq("cash_register_id", register.id);

      if (relationError) {
        alert(relationError.message);
        return;
      }

      if (user.cash_register_id === register.id) {
        await supabase.from("users").update({ cash_register_id: null }).eq("id", user.id);
      }
      loadData();
      return;
    }

    const { error: relationError } = await supabase.from("user_cash_registers").insert({
      tenant_id: register.tenant_id,
      branch_id: register.branch_id,
      user_id: user.id,
      cash_register_id: register.id,
    });

    if (relationError) {
      alert(relationError.message);
      return;
    }

    if (!user.cash_register_id) {
      await supabase
        .from("users")
        .update({ cash_register_id: register.id, branch_id: register.branch_id })
        .eq("id", user.id);
    }

    loadData();
  };

  const startEdit = (register: CashRegister) => {
    setEditingRegisterId(register.id);
    setEditName(register.name);
    setEditBranchId(register.branch_id || "");
  };

  const cancelEdit = () => {
    setEditingRegisterId(null);
    setEditName("");
    setEditBranchId("");
  };

  const saveEdit = async (register: CashRegister) => {
    if (!editName.trim() || !editBranchId) return;

    const { error } = await supabase
      .from("cash_registers")
      .update({ name: editName.trim(), branch_id: editBranchId })
      .eq("id", register.id);

    if (error) {
      alert(error.message);
      return;
    }

    if (assignmentTableReady && register.branch_id !== editBranchId) {
      await supabase
        .from("user_cash_registers")
        .update({ branch_id: editBranchId })
        .eq("cash_register_id", register.id);
    }

    await supabase
      .from("users")
      .update({ branch_id: editBranchId })
      .eq("cash_register_id", register.id);

    cancelEdit();
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
            const selectedUserIds = assignedUserIds(register.id);
            const isEditing = editingRegisterId === register.id;
            return (
              <div key={register.id} className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  {isEditing ? (
                    <div className="grid flex-1 gap-3 md:grid-cols-2">
                      <input
                        className="rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none"
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                      />
                      <select
                        className="rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none"
                        value={editBranchId}
                        onChange={(event) => setEditBranchId(event.target.value)}
                      >
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>{branch.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <h2 className="font-bold text-gray-100">{register.name}</h2>
                      <p className="mt-1 text-xs text-gray-500">
                        {register.branch_id ? branchMap[register.branch_id] || "Sucursal" : "Sin sucursal"}
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <button onClick={() => saveEdit(register)} className="rounded-lg bg-emerald-500/15 p-2 text-emerald-300 hover:bg-emerald-500/25">
                          <Check size={16} />
                        </button>
                        <button onClick={cancelEdit} className="rounded-lg bg-gray-800 p-2 text-gray-300 hover:bg-gray-700">
                          <X size={16} />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => startEdit(register)} className="rounded-lg bg-gray-800 p-2 text-gray-300 hover:bg-gray-700">
                        <Pencil size={16} />
                      </button>
                    )}
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
                </div>

                <label className="mb-2 block text-xs font-bold uppercase text-gray-500">Usuarios asignados</label>
                {users.length === 0 ? (
                  <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-3 text-sm text-amber-200">
                    No pude cargar usuarios de este tenant. Revisá que existan usuarios en Admin / Usuarios y que las policies permitan leerlos.
                  </div>
                ) : (
                  <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-gray-800 bg-gray-950 p-2">
                    {users.map((user) => {
                      const checked = selectedUserIds.includes(user.id);
                      return (
                        <label key={user.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-900">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleUserAssignment(user, register)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-gray-200">{userLabel(user)}</span>
                            <span className="block truncate text-xs text-gray-500">{user.email || user.role || "Sin email"}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <p className="mt-2 text-xs text-gray-500">
                  {assignmentTableReady
                    ? `${selectedUserIds.length} usuario(s) pueden abrir esta caja.`
                    : "Modo compatibilidad: falta crear user_cash_registers, entonces solo se guarda la asignacion directa del usuario."}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
