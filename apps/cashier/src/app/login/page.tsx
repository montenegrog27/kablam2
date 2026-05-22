"use client";

import { useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { useRouter } from "next/navigation";

export default function CashierLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    const authUser = (await supabase.auth.getUser()).data.user;
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("role, role_id")
      .eq("id", authUser?.id)
      .single();

    if (userError || !userData) {
      alert("No se encontro el usuario.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    const hasLegacyAccess = ["cashier", "owner", "admin"].includes(userData.role);
    let hasRoleAccess = false;

    if (!hasLegacyAccess && userData.role_id) {
      const { data: rolePerms } = await supabase
        .from("role_permissions")
        .select("permissions!left(key)")
        .eq("role_id", userData.role_id);

      hasRoleAccess = (rolePerms || []).some((rp: any) =>
        rp.permissions?.key?.startsWith("cashier."),
      );
    }

    if (!hasLegacyAccess && !hasRoleAccess) {
      alert("No tenes permisos para acceder al cashier.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    router.push("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <form
        onSubmit={handleLogin}
        className="flex flex-col gap-4 w-80 bg-gray-900 p-6 rounded-xl border border-gray-800"
      >
        <h1 className="text-2xl font-bold text-center">Cashier Login</h1>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="p-2 rounded bg-gray-800 border border-gray-700"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="p-2 rounded bg-gray-800 border border-gray-700"
        />

        <button
          disabled={loading}
          className="bg-white text-black p-2 rounded font-semibold"
        >
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
