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

    // 🔎 Verificamos que el usuario sea cashier
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("role")
      .eq("id", (await supabase.auth.getUser()).data.user?.id)
      .single();

    if (userError || !userData) {
      alert("No se encontró el usuario.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

 if (!["cashier", "owner", "admin"].includes(userData.role)) {
  alert("No tenés permisos para acceder al cashier.");
  await supabase.auth.signOut();
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
        <h1 className="text-2xl font-bold text-center">
          Cashier Login
        </h1>

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