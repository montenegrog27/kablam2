"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";

export default function BranchesPage() {
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    async function loadBranches() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) return;

      const { data: userRecord } = await supabase
        .from("users")
        .select("tenant_id")
        .eq("id", user.id)
        .single();

      if (!userRecord) return;

      const { data } = await supabase
        .from("branches")
        .select("*")
        .eq("tenant_id", userRecord.tenant_id);

      setBranches(data || []);
    }

    loadBranches();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">
        Sucursales
      </h1>

      <ul className="space-y-2">
        {branches.map((branch) => (
          <li
            key={branch.id}
            className="bg-white p-4 rounded shadow"
          >
            {branch.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
