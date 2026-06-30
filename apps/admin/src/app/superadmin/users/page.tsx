"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import Link from "next/link";

type User = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  tenant_id: string;
  branch_id: string | null;
  tenants: {
    name: string;
  };
  branches: {
    name: string;
  } | null;
  created_at: string;
};

type MembershipSummary = {
  count: number;
  activeTenantName?: string;
};

export default function UsersPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [membershipSummary, setMembershipSummary] = useState<Record<string, MembershipSummary>>({});

  useEffect(() => {
    async function loadUsers() {
      const [{ data, error }, { data: memberships, error: membershipsError }] =
        await Promise.all([
          supabase
            .from("users")
            .select("*, tenants(name), branches(name)")
            .order("created_at", { ascending: false }),
          supabase
            .from("user_tenant_memberships")
            .select("user_id, is_active, tenants(name)"),
        ]);

      if (error) {
        console.error("Error loading users:", error);
      } else {
        setUsers(data || []);
      }

      if (!membershipsError && memberships) {
        const nextSummary: Record<string, MembershipSummary> = {};
        memberships.forEach((membership: any) => {
          const userId = membership.user_id;
          const current = nextSummary[userId] || { count: 0 };
          current.count += 1;
          if (membership.is_active) {
            current.activeTenantName = membership.tenants?.name || undefined;
          }
          nextSummary[userId] = current;
        });
        setMembershipSummary(nextSummary);
      }

      setLoading(false);
    }

    loadUsers();
  }, []);

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "¿Estás seguro de eliminar este usuario? Esta acción no se puede deshacer.",
      )
    ) {
      return;
    }

    const { error } = await supabase.from("users").delete().eq("id", id);

    if (error) {
      alert("Error al eliminar usuario: " + error.message);
    } else {
      setUsers(users.filter((u) => u.id !== id));
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-6">Usuarios</h1>
        <div className="text-lg">Cargando usuarios...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl text-black font-bold">Usuarios</h1>
        <Link
          href="/superadmin/users/new"
          className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800"
        >
          + Crear Usuario
        </Link>
      </div>

      <p className="text-gray-600 mb-6">
        Usuarios del sistema (owners, administradores, cajeros, etc.).
      </p>

      {users.length === 0 ? (
        <div className="bg-white border rounded-lg p-8 text-center">
          <p className="text-gray-500 mb-4">No hay usuarios registrados.</p>
          <Link
            href="/superadmin/users/new"
            className="inline-block bg-black text-white px-4 py-2 rounded hover:bg-gray-800"
          >
            Crear primer usuario
          </Link>
        </div>
      ) : (
        <div className="bg-gray-700 border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700 border-b">
              <tr>
                <th className="text-left p-4">Nombre</th>
                <th className="text-left p-4">Email</th>
                <th className="text-left p-4">Rol</th>
                <th className="text-left p-4">Tenant</th>
                <th className="text-left p-4">Accesos</th>
                <th className="text-left p-4">Branch</th>
                <th className="text-left p-4">Creado</th>
                <th className="text-left p-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b hover:bg-gray-50">
                  <td className="p-4 font-medium">{user.name}</td>
                  <td className="p-4">
                    {user.email || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-3 py-1 rounded-full text-sm ${
                        user.role === "owner"
                          ? "bg-purple-100 text-purple-800"
                          : user.role === "admin"
                            ? "bg-blue-100 text-blue-800"
                            : user.role === "cashier"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="p-4">
                    <Link
                      href={`/superadmin/tenants`}
                      className="text-blue-600 hover:underline"
                    >
                      {membershipSummary[user.id]?.activeTenantName || user.tenants?.name}
                    </Link>
                  </td>
                  <td className="p-4">
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
                      {membershipSummary[user.id]?.count || 1} tenant
                      {(membershipSummary[user.id]?.count || 1) === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className="p-4">
                    {user.branches?.name || (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="p-4">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <Link
                        href={`/superadmin/users/${user.id}`}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        Editar
                      </Link>
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="text-red-600 hover:underline text-sm"
                      >
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
