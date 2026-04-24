"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState<any>(null);
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    async function loadTenant() {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) return;

      const { data: userRecord } = await supabase
        .from("users")
        .select("*, tenants(*)")
        .eq("id", user.id)
        .single();

      if (userRecord) {
        setTenant(userRecord.tenants);
        setUserRole(userRecord.role);
      }

      setLoading(false);
    }

    loadTenant();
  }, []);

  if (loading) return <div className="p-10">Cargando...</div>;

  if (!tenant) {
    return <div className="p-10">No tienes restaurante</div>;
  }

  return (
    <div className="p-10">
      <h1 className="text-2xl font-bold">
        Bienvenido a {tenant?.name}
      </h1>

      <p>Rol: {userRole}</p>

      <p>Plan: {tenant?.plan}</p>

      <p>Trial termina: {tenant.trial_ends_at}</p>
    </div>
  );
}
