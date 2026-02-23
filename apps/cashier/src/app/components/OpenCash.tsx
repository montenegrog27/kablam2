"use client";

import { useState } from "react";
import { supabase } from "@kablam/supabase";

export default function OpenCash({ userRecord, onOpened }: any) {
  const [amount, setAmount] = useState("");

  const handleOpen = async () => {
    if (!amount) return;

    await supabase.from("cash_sessions").insert({
      tenant_id: userRecord.tenant_id,
      branch_id: userRecord.branch_id,
      cash_register_id: userRecord.cash_register_id,
      opened_by: userRecord.id,
      opening_amount: Number(amount),
    });

    onOpened();
  };

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="bg-black p-8 rounded space-y-4">
        <h2 className="text-xl font-bold">
          Abrir Caja
        </h2>

        <input
          type="number"
          placeholder="Monto inicial en efectivo"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="border p-2 w-full"
        />

        <button
          onClick={handleOpen}
          className="bg-white text-black px-4 py-2 rounded"
        >
          Abrir Caja
        </button>
      </div>
    </div>
  );
}