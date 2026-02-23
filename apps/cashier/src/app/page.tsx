"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";
import OpenCash from "./components/OpenCash";
import CashierTabs from "./components/Tabs";

export default function CashierPage() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userRecord, setUserRecord] = useState<any>(null);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data: userRec } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single();

    setUserRecord(userRec);

    if (!userRec?.cash_register_id) {
      alert("No tienes caja asignada");
      return;
    }

    const { data: openSession } = await supabase
      .from("cash_sessions")
      .select("*")
      .eq("cash_register_id", userRec.cash_register_id)
      .eq("status", "open")
      .maybeSingle();

    setSession(openSession);
    setLoading(false);
  };

  if (loading) return <div>Cargando...</div>;

  if (!session) {
    return (
      <OpenCash
        userRecord={userRecord}
        onOpened={() => checkSession()}
      />
    );
  }

  return (
    <CashierTabs
      session={session}
      userRecord={userRecord}
      onRefresh={() => checkSession()}
    />
  );
}