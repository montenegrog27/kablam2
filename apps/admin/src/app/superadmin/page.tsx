"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import Link from "next/link";

export default function SuperAdminOverview() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    tenants: 0,
    branches: 0,
    users: 0,
    customers: 0,
  });

  useEffect(() => {
    async function loadStats() {
      // Fetch counts from Supabase
      const { count: tenantsCount } = await supabase
        .from("tenants")
        .select("*", { count: "exact", head: true });

      const { count: branchesCount } = await supabase
        .from("branches")
        .select("*", { count: "exact", head: true });

      const { count: usersCount } = await supabase
        .from("users")
        .select("*", { count: "exact", head: true });

      const { count: customersCount } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true });

      setStats({
        tenants: tenantsCount || 0,
        branches: branchesCount || 0,
        users: usersCount || 0,
        customers: customersCount || 0,
      });
      setLoading(false);
    }

    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-6">SuperAdmin Dashboard</h1>
        <div className="text-lg">Cargando estadísticas...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">SuperAdmin Dashboard</h1>
      <p className="text-gray-600 mb-10">
        Panel de administración global del sistema Kablam. Aquí puedes gestionar
        tenants, branches, usuarios y clientes.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <div className="text-2xl font-bold">{stats.tenants}</div>
          <div className="text-gray-500">Tenants</div>
          <Link
            href="/superadmin/tenants"
            className="inline-block mt-4 text-blue-600 hover:underline"
          >
            Gestionar →
          </Link>
        </div>

        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <div className="text-2xl font-bold">{stats.branches}</div>
          <div className="text-gray-500">Branches</div>
          <Link
            href="/superadmin/branches"
            className="inline-block mt-4 text-blue-600 hover:underline"
          >
            Gestionar →
          </Link>
        </div>

        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <div className="text-2xl font-bold">{stats.users}</div>
          <div className="text-gray-500">Usuarios</div>
          <Link
            href="/superadmin/users"
            className="inline-block mt-4 text-blue-600 hover:underline"
          >
            Gestionar →
          </Link>
        </div>

        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <div className="text-2xl font-bold">{stats.customers}</div>
          <div className="text-gray-500">Clientes</div>
          <Link
            href="/superadmin/customers"
            className="inline-block mt-4 text-blue-600 hover:underline"
          >
            Ver →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-4">Acciones rápidas</h2>
          <ul className="space-y-3">
            <li>
              <Link
                href="/superadmin/tenants/new"
                className="text-blue-600 hover:underline"
              >
                Crear nuevo tenant
              </Link>
            </li>
            <li>
              <Link
                href="/superadmin/branches/new"
                className="text-blue-600 hover:underline"
              >
                Crear nueva branch
              </Link>
            </li>
            <li>
              <Link
                href="/superadmin/users/new"
                className="text-blue-600 hover:underline"
              >
                Crear usuario administrador
              </Link>
            </li>
            <li>
              <Link
                href="/superadmin/settings"
                className="text-blue-600 hover:underline"
              >
                Configuración del sistema
              </Link>
            </li>
          </ul>
        </div>

        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-4">Sistema</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Versión Kablam</span>
              <span className="font-medium">v0.75</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">SuperAdmin Email</span>
              <span className="font-medium">
                {process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL || "admin@kablam.com"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Entorno</span>
              <span className="font-medium">{process.env.NODE_ENV}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
