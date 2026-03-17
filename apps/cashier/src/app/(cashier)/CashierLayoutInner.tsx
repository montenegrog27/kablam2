"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";
import OpenCash from "../components/OpenCash";
import SelectCashRegister from "../components/SelectCashRegister";
import { useRouter } from "next/navigation";
import { useCashSession } from "./context/CashSessionContext";

export default function CashierLayoutInner({ children }: any) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const { cashSession, setCashSession } = useCashSession();

  const [userRecord, setUserRecord] = useState<any>(null);
  const [selectedRegister, setSelectedRegister] = useState<any>(null);
  const [registerOccupiedBy, setRegisterOccupiedBy] = useState<any>(null);

  useEffect(() => {
    init();
  }, []);
  useEffect(() => {
    if (!userRecord) return;

    recoverOpenSession();
  }, [userRecord]);

  const recoverOpenSession = async () => {
    const { data } = await supabase
      .from("cash_sessions")
      .select(
        `
      *,
      cash_registers (*)
    `,
      )
      .eq("opened_by", userRecord.id)
      .eq("status", "open")
      .maybeSingle();

    if (data) {
      setCashSession(data);
      setSelectedRegister(data.cash_registers);
    }
  };
  const init = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();

      setUserRecord(userData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const checkIfRegisterIsOpen = async (register: any, currentUser: any) => {
    const { data } = await supabase
      .from("cash_sessions")
      .select(`*, users(full_name)`)
      .eq("cash_register_id", register.id)
      .eq("status", "open")
      .maybeSingle();

    if (data) {
      if (data.opened_by === currentUser.id) {
        setCashSession(data);
        return;
      }

      setRegisterOccupiedBy(data.users?.full_name || "otro cajero");
    } else {
      setSelectedRegister(register);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-black text-white">
        Cargando...
      </div>
    );
  }

  // 🔐 Si ya tiene sesión abierta
  if (cashSession) {
    return <div className="h-screen">{children}</div>;
  }

  // 🟥 Caja ocupada
  if (registerOccupiedBy) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-950">
        <div className="bg-gray-900 p-8 rounded-xl border border-gray-800 text-center space-y-4">
          <h2 className="text-xl font-bold text-white">Caja ocupada</h2>
          <p className="text-gray-400">
            Esta caja está abierta por {registerOccupiedBy}
          </p>
          <button
            onClick={() => setRegisterOccupiedBy(null)}
            className="bg-gray-700 px-4 py-2 rounded text-white"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  // 🟡 Elegir caja
  if (!selectedRegister) {
    return (
      <SelectCashRegister
        userRecord={userRecord}
        onSelected={(register: any) =>
          checkIfRegisterIsOpen(register, userRecord)
        }
      />
    );
  }

  // 🟢 Mostrar apertura
  return (
    <OpenCash
      userRecord={userRecord}
      selectedRegister={selectedRegister}
      onOpened={(session: any) => {
        setCashSession(session);
      }}
    />
  );
}
