"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";

export default function BranchesPage() {
  const [branches, setBranches] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!userRecord) return;

    setTenantId(userRecord.tenant_id);

    const { data } = await supabase
      .from("branches")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id);

    setBranches(data || []);
  };

  const updateBranch = async (id: string, field: string, value: any) => {
    await supabase
      .from("branches")
      .update({ [field]: value })
      .eq("id", id);

    loadBranches();
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">
        Sucursales
      </h1>

      {branches.map((branch) => (
        <div
          key={branch.id}
          className="bg-white p-6 rounded-lg shadow space-y-4"
        >
          <div>
            <label className="text-sm font-medium">
              Nombre
            </label>
            <input
              value={branch.name || ""}
              onChange={(e) =>
                updateBranch(branch.id, "name", e.target.value)
              }
              className="w-full border p-2 rounded"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">
                Latitud
              </label>
              <input
                type="number"
                value={branch.lat || ""}
                onChange={(e) =>
                  updateBranch(
                    branch.id,
                    "lat",
                    Number(e.target.value)
                  )
                }
                className="w-full border p-2 rounded"
              />
            </div>

            <div>
              <label className="text-sm font-medium">
                Longitud
              </label>
              <input
                type="number"
                value={branch.lng || ""}
                onChange={(e) =>
                  updateBranch(
                    branch.id,
                    "lng",
                    Number(e.target.value)
                  )
                }
                className="w-full border p-2 rounded"
              />
            </div>
          </div>

          <div className="text-xs text-gray-500">
            📍 Usá Google Maps → click derecho → "¿Qué hay aquí?" →
            copiá lat y lng
          </div>
        </div>
      ))}
    </div>
  );
}