"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Clock3, LogIn, LogOut, Store, Utensils } from "lucide-react";

type Branch = {
  id: string;
  tenant_id: string;
  name: string;
};

function formatTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function StaffPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [message, setMessage] = useState("");

  const selectedBranch = useMemo(
    () => result?.branch || branches.find((branch) => branch.id === branchId),
    [branches, branchId, result?.branch],
  );

  const submit = async (action: "status" | "clock_in" | "clock_out") => {
    if (!email.trim() || !code.trim()) {
      setMessage("Ingresa tu email y tu clave de acceso.");
      return;
    }

    setSaving(true);
    setMessage("");

    const response = await fetch("/api/staff-attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        email,
        code,
        branchId: branchId || undefined,
      }),
    });
    const data = await response.json();
    setSaving(false);

    if (!response.ok) {
      setResult(null);
      setMessage(
        data.error === "invalid_credentials"
          ? "Email o clave invalidos, o empleado inactivo."
          : data.error === "multiple_employee_matches"
            ? "Encontramos mas de un empleado con esos datos. Avisa a administracion para revisar el email."
            : data.error || "No se pudo registrar.",
      );
      return;
    }

    if (data.status === "branch_required") {
      setResult(data);
      setBranches(data.branches || []);
      setBranchId(data.branches?.[0]?.id || "");
      setMessage(data.message || "Elegi tu sucursal para continuar.");
      return;
    }

    setBranches([]);
    setBranchId("");
    setResult(data);
    setMessage(
      data.message ||
        (action === "clock_in"
          ? "Ingreso registrado."
          : action === "clock_out"
            ? "Egreso registrado."
            : "Empleado validado."),
    );
  };

  const employee = result?.employee;
  const openAttendance = result?.openAttendance;
  const closedAttendance = result?.closedAttendance;
  const lastAttendance = openAttendance || closedAttendance;
  const employeeRole = String(employee?.roles?.name || employee?.role || "").toLowerCase();
  const isWaiter = employeeRole === "mozo";

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-gray-100">
      <div className="mx-auto max-w-md space-y-4">
        <section className="rounded-3xl border border-gray-800 bg-gray-900 p-5 shadow-2xl">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-300">
              <Clock3 size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black">Ingreso de empleados</h1>
              <p className="text-sm text-gray-500">Marca entrada o salida con tu email y clave.</p>
            </div>
          </div>

          <div className="space-y-3">
            {branches.length > 1 && (
              <label className="block text-xs font-black uppercase tracking-wide text-gray-500">
                Sucursal
                <select
                  className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-3 text-sm text-gray-100 outline-none focus:border-emerald-500"
                  value={branchId}
                  onChange={(event) => setBranchId(event.target.value)}
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block text-xs font-black uppercase tracking-wide text-gray-500">
              Email
              <input
                className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-4 text-sm font-bold text-gray-100 outline-none focus:border-emerald-500"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoCapitalize="none"
                autoComplete="email"
                inputMode="email"
                placeholder="empleado@negocio.com"
              />
            </label>

            <label className="block text-xs font-black uppercase tracking-wide text-gray-500">
              Clave de acceso
              <input
                className="mt-1 w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-4 text-center text-2xl font-black tracking-widest text-gray-100 outline-none focus:border-emerald-500"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                autoComplete="current-password"
                placeholder="...."
              />
            </label>

            <button
              onClick={() => submit("status")}
              disabled={saving}
              className="w-full rounded-xl border border-gray-700 px-4 py-3 text-sm font-black text-gray-200 disabled:opacity-50"
            >
              Ver mi estado
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => submit("clock_in")}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-4 text-sm font-black text-gray-950 disabled:opacity-50"
              >
                <LogIn size={17} />
                Ingreso
              </button>
              <button
                onClick={() => submit("clock_out")}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 py-4 text-sm font-black text-white disabled:opacity-50"
              >
                <LogOut size={17} />
                Egreso
              </button>
            </div>
          </div>
        </section>

        {message && (
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 text-sm text-gray-300">
            {message}
          </div>
        )}

        {employee && (
          <section className="rounded-3xl border border-gray-800 bg-gray-900 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-black">{employee.name}</p>
                <p className="text-sm text-gray-500">
                  {employee.roles?.name || employee.role} - {selectedBranch?.name || "Sucursal pendiente"}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-black ${
                  openAttendance ? "bg-emerald-500/10 text-emerald-300" : "bg-gray-800 text-gray-400"
                }`}
              >
                {openAttendance ? "En turno" : "Sin turno"}
              </span>
            </div>

            {lastAttendance && (
              <div className="mt-4 grid gap-2 rounded-2xl bg-gray-950 p-3 text-sm text-gray-400">
                <p>
                  Entrada:{" "}
                  <span className="font-bold text-gray-100">{formatTime(lastAttendance.clock_in_at)}</span>
                </p>
                {lastAttendance.clock_out_at && (
                  <p>
                    Salida:{" "}
                    <span className="font-bold text-gray-100">{formatTime(lastAttendance.clock_out_at)}</span>
                  </p>
                )}
              </div>
            )}

            {isWaiter ? (
              <div className="mt-4 rounded-2xl border border-emerald-900/60 bg-emerald-950/20 p-4">
                <div className="mb-3 flex items-center gap-2 text-emerald-200">
                  <Utensils size={17} />
                  <p className="font-black">Rol mozo habilitado</p>
                </div>
                <p className="mb-3 text-sm text-gray-400">
                  Para operar mesas, entra al cashier con el usuario de la sucursal. Este fichaje ya queda registrado.
                </p>
                <Link
                  href="/"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-gray-950"
                >
                  <Store size={16} />
                  Ir al cashier
                </Link>
              </div>
            ) : (
              <p className="mt-4 rounded-2xl bg-gray-950 p-4 text-sm text-gray-400">
                Gracias. Tu asistencia quedo disponible para administracion.
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
