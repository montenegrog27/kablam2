"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

export default function CashRegistersPage() {
  const [registers, setRegisters] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);

  const [name, setName] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    console.log("USER DATA:", userData);
    if (!user) return;

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id, branch_id")
      .eq("id", user.id)
      .single();

    if (!userRecord) return;

    setTenantId(userRecord.tenant_id);
    setBranchId(userRecord.branch_id);

    const { data: registersData } = await supabase
      .from("cash_registers")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id)
      .eq("branch_id", userRecord.branch_id);

    setRegisters(registersData || []);

    const { data: usersData } = await supabase
      .from("users")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id);

    setUsers(usersData || []);
  };

  const handleCreate = async (e: any) => {
    e.preventDefault();
    if (!tenantId || !branchId || !name) return;

    await supabase.from("cash_registers").insert({
      tenant_id: tenantId,
      branch_id: branchId,
      name,
    });

    setName("");
    loadData();
  };

  const assignUser = async (userId: string, registerId: string) => {
    await supabase
      .from("users")
      .update({ cash_register_id: registerId })
      .eq("id", userId);

    loadData();
  };

  const toggleActive = async (register: any) => {
    await supabase
      .from("cash_registers")
      .update({ is_active: !register.is_active })
      .eq("id", register.id);

    loadData();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Cajas</h1>

      <form
        onSubmit={handleCreate}
        className="bg-black p-6 rounded shadow mb-8 space-y-4"
      >
        <input
          className="border p-2 w-full"
          placeholder="Nombre caja"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <button className="bg-black text-white px-4 py-2 rounded">
          Crear Caja
        </button>
      </form>

      <div className="space-y-6">
        {registers.map((register) => (
          <div
            key={register.id}
            className="bg-gray-800 p-4 rounded shadow"
          >
            <div className="flex justify-between items-center mb-4">
              <div className="font-semibold text-lg">
                {register.name}
              </div>

              <button
                onClick={() => toggleActive(register)}
                className={
                  register.is_active
                    ? "text-green-500"
                    : "text-red-500"
                }
              >
                {register.is_active ? "Activa" : "Inactiva"}
              </button>
            </div>

            <div>
              <label className="text-sm text-gray-400">
                Usuario asignado:
              </label>

              <select
                className=" bg-black text-white ml-2 border p-1 text-sm"
                value={
                  users.find(
                    (u) => u.cash_register_id === register.id
                  )?.id || ""
                }
                onChange={(e) =>
                  assignUser(e.target.value, register.id)
                }
              >
                <option value="">Sin asignar</option>

                {users.map((user) => (
                  <option className="bg-black text-white" key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}