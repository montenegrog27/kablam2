"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";
import { useRouter } from "next/navigation";

export default function SelectCashRegister({
  userRecord,
  onSelected,
}: any) {
const router = useRouter();

  const [registers, setRegisters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

useEffect(() => {
  if (!userRecord) return;
  loadRegisters();
}, [userRecord]);

const handleLogout = async () => {
  await supabase.auth.signOut();
  router.push("/login");
};

const loadRegisters = async () => {
  if (!userRecord) return;

  const { data, error } = await supabase
    .from("user_cash_registers")
    .select(`
      cash_registers (
        id,
        name,
        branch_id
      )
    `)
    .eq("user_id", userRecord.id);

  if (error) {
    console.error("REGISTER ERROR:", error);
    setLoading(false);
    return;
  }

  const mapped =
    data?.map((r: any) => r.cash_registers).filter(Boolean) || [];

  setRegisters(mapped);
  setLoading(false);
};
  if (loading) return <div>Cargando cajas...</div>;

  return (
    <div className="h-screen flex items-center justify-center bg-gray-950">
      <div className="bg-gray-900 p-8 rounded-xl w-[400px] space-y-6 border border-gray-800">
<p className="text-sm text-gray-400">
  Cajero: {userRecord?.full_name}
</p>

        <h2 className="text-xl font-bold text-white">
          Seleccionar Caja
        </h2>

        {registers.map((register) => (
          <button
            key={register.id}
            onClick={() => onSelected(register)}
            className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-700 p-3 rounded-lg text-white transition"
          >
            {register.name}
          </button>
        ))}
<button
  onClick={handleLogout}
  className="w-full bg-red-600 hover:bg-red-500 p-3 rounded-lg text-white transition"
>
  Cerrar sesión
</button>
      </div>
    </div>
  );
}