"use client";

import { useState } from "react";
import { supabase } from "@kablam/supabase";

export default function OpenCash({
  userRecord,
  selectedRegister,
  onOpened,
}: any) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

const handleOpen = async () => {
  if (!amount || loading) return;
      if (!amount || Number(amount) < 0) {
      setError("Ingresá un monto válido");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 🔎 Verificar sesión abierta REAL en DB
      const { data: existingSession, error: fetchError } = await supabase
        .from("cash_sessions")
        .select("*")
        .eq("cash_register_id", selectedRegister.id)
        .eq("status", "open")
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existingSession) {
        if (existingSession.opened_by === userRecord.id) {
          onOpened(existingSession);
          return;
        }

        setError("Esta caja ya está abierta por otro cajero.");
        return;
      }

      // 🆕 Crear nueva sesión
const { data: newSession, error } = await supabase
  .from("cash_sessions")
  .insert({
    tenant_id: userRecord.tenant_id,
    branch_id: userRecord.branch_id,
    cash_register_id: selectedRegister.id,
    opened_by: userRecord.id,
    opening_amount: Number(amount),
    status: "open",
  })
  .select()
  .single();

if (error) {
  if (error.code === "23505") {
    alert("Ya existe una sesión abierta para esta caja.");
    return;
  }

  throw error;
}
      onOpened(newSession);

    } catch (err: any) {
      console.error("ERROR ABRIENDO CAJA:", err);
      setError(err.message || "Error abriendo caja");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-950">
      <div className="bg-gray-900 p-8 rounded-xl space-y-4 w-[350px] border border-gray-800">

        <h2 className="text-xl font-bold text-white">
          Abrir Caja
        </h2>

        <div className="space-y-1">
          <label className="text-xs text-gray-400">
            Monto inicial en efectivo
          </label>

          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="bg-gray-800 border border-gray-700 p-2 w-full rounded text-white"
          />
        </div>

        {error && (
          <div className="text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleOpen}
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-white px-4 py-2 rounded transition"
        >
          {loading ? "Abriendo..." : "Abrir Caja"}
        </button>

      </div>
    </div>
  );
}