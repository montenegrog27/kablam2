"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { CalendarDays, Clock3, Pencil, RefreshCw, UserPlus, Users, X } from "lucide-react";

type Employee = {
  id?: string;
  tenant_id?: string;
  branch_id?: string | null;
  name: string;
  email?: string | null;
  access_code: string;
  salary: number;
  salary_frequency: string;
  role_id?: string | null;
  role: string;
  is_active?: boolean;
  roles?: { id: string; name: string } | null;
};

type Attendance = {
  id: string;
  employee_id: string;
  branch_id?: string | null;
  clock_in_at: string;
  clock_out_at?: string | null;
  employees?: Employee | null;
};

const inputClass = "w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-emerald-500";
const frequencies = ["HOURLY", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"];
const HOURS_BY_PERIOD: Record<string, number> = {
  HOURLY: 1,
  DAILY: 8,
  WEEKLY: 48,
  BIWEEKLY: 96,
  MONTHLY: 208,
};

function money(value: number) {
  return `$${Math.round(value || 0).toLocaleString("es-AR")}`;
}

function weekStart(date = new Date()) {
  const current = new Date(date);
  const day = current.getDay() || 7;
  current.setDate(current.getDate() - day + 1);
  current.setHours(0, 0, 0, 0);
  return current;
}

function hoursBetween(start: string, end?: string | null) {
  const endTime = end ? new Date(end).getTime() : Date.now();
  return Math.max(0, (endTime - new Date(start).getTime()) / 3600000);
}

function roundHalfHour(hours: number) {
  return Math.round(hours * 2) / 2;
}

function hourlyRate(employee: Employee) {
  const divisor = HOURS_BY_PERIOD[employee.salary_frequency] || HOURS_BY_PERIOD.MONTHLY;
  return Number(employee.salary || 0) / divisor;
}

function paymentFor(employee: Employee, roundedHours: number) {
  return hourlyRate(employee) * roundedHours;
}

function dayKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function roleName(employee: Employee) {
  return employee.roles?.name || employee.role || "Sin rol";
}

export default function EmployeesPage() {
  const [tenantId, setTenantId] = useState("");
  const [branches, setBranches] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [tab, setTab] = useState<"employees" | "attendance">("employees");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    access_code: "",
    salary: "",
    salary_frequency: "MONTHLY",
    role_id: "",
    branch_id: "",
  });

  useEffect(() => { load(); }, []);

  const attendanceByEmployee = useMemo(() => {
    const map = new Map<string, { employee: Employee; rows: Attendance[]; rawHours: number }>();

    attendances.forEach((row) => {
      const employee = row.employees || employees.find((item) => item.id === row.employee_id);
      if (!employee?.id) return;
      const current = map.get(employee.id) || { employee, rows: [], rawHours: 0 };
      current.rows.push(row);
      current.rawHours += hoursBetween(row.clock_in_at, row.clock_out_at);
      map.set(employee.id, current);
    });

    return Array.from(map.values()).map((item) => {
      const daysMap = new Map<string, { date: string; rawHours: number; rows: Attendance[] }>();
      item.rows.forEach((row) => {
        const key = dayKey(row.clock_in_at);
        const current = daysMap.get(key) || { date: key, rawHours: 0, rows: [] };
        current.rows.push(row);
        current.rawHours += hoursBetween(row.clock_in_at, row.clock_out_at);
        daysMap.set(key, current);
      });

      const days = Array.from(daysMap.values())
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((day) => {
          const roundedHours = roundHalfHour(day.rawHours);
          return {
            ...day,
            roundedHours,
            pay: paymentFor(item.employee, roundedHours),
          };
        });
      const roundedHours = days.reduce((sum, day) => sum + day.roundedHours, 0);

      return {
        ...item,
        days,
        roundedHours,
        pay: paymentFor(item.employee, roundedHours),
      };
    }).sort((a, b) => b.roundedHours - a.roundedHours);
  }, [attendances, employees]);

  const maxWeeklyHours = Math.max(1, ...attendanceByEmployee.map((item) => item.roundedHours));
  const totalPayroll = attendanceByEmployee.reduce((sum, item) => sum + item.pay, 0);

  const load = async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data: user } = await supabase.from("users").select("tenant_id").eq("id", auth.user.id).single();
    if (!user?.tenant_id) return;
    setTenantId(user.tenant_id);

    const start = weekStart();
    const [{ data: branchRows }, { data: roleRows }, { data: employeeRows }, { data: attendanceRows }] = await Promise.all([
      supabase.from("branches").select("id, name").eq("tenant_id", user.tenant_id).order("name"),
      supabase.from("roles").select("id, name").eq("tenant_id", user.tenant_id).eq("is_active", true).order("name"),
      supabase.from("employees").select("*, roles(id, name)").eq("tenant_id", user.tenant_id).order("name"),
      supabase
        .from("employee_attendances")
        .select("*, employees(*, roles(id, name))")
        .eq("tenant_id", user.tenant_id)
        .gte("clock_in_at", start.toISOString())
        .order("clock_in_at", { ascending: false }),
    ]);

    setBranches(branchRows || []);
    setRoles(roleRows || []);
    setEmployees(employeeRows || []);
    setAttendances((attendanceRows || []) as Attendance[]);
    setForm((current) => ({
      ...current,
      branch_id: current.branch_id || branchRows?.[0]?.id || "",
      role_id: current.role_id || roleRows?.[0]?.id || "",
    }));
    setLoading(false);
  };

  const update = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetForm = () => {
    setEditingEmployeeId(null);
    setForm({
      name: "",
      email: "",
      access_code: "",
      salary: "",
      salary_frequency: "MONTHLY",
      role_id: roles[0]?.id || "",
      branch_id: branches[0]?.id || "",
    });
  };

  const editEmployee = (employee: Employee) => {
    if (!employee.id) return;
    setEditingEmployeeId(employee.id);
    setMessage("");
    setTab("employees");
    setForm({
      name: employee.name || "",
      email: employee.email || "",
      access_code: employee.access_code || "",
      salary: employee.salary ? String(employee.salary) : "",
      salary_frequency: employee.salary_frequency || "MONTHLY",
      role_id: employee.role_id || "",
      branch_id: employee.branch_id || "",
    });
  };

  const saveEmployee = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenantId || !form.name.trim() || !form.access_code.trim()) {
      setMessage("Nombre y codigo de acceso son obligatorios.");
      return;
    }

    setSaving(true);
    setMessage("");
    const selectedRole = roles.find((role) => role.id === form.role_id);
    const payload = {
      tenant_id: tenantId,
      branch_id: form.branch_id || null,
      name: form.name.trim(),
      email: form.email.trim() || null,
      access_code: form.access_code.trim(),
      salary: Number(form.salary || 0),
      salary_frequency: form.salary_frequency,
      role_id: form.role_id || null,
      role: selectedRole?.name || "employee",
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { error } = editingEmployeeId
      ? await supabase.from("employees").update(payload).eq("id", editingEmployeeId).eq("tenant_id", tenantId)
      : await supabase.from("employees").upsert(payload, { onConflict: "tenant_id,access_code" });
    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    resetForm();
    setMessage(editingEmployeeId ? "Empleado actualizado." : "Empleado guardado.");
    await load();
  };

  const toggleEmployee = async (employee: Employee) => {
    if (!employee.id) return;
    await supabase.from("employees").update({ is_active: employee.is_active === false }).eq("id", employee.id);
    await load();
  };

  if (loading) return <div className="text-sm text-gray-500">Cargando empleados...</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-100">Empleados</h1>
          <p className="mt-1 text-sm text-gray-500">Alta de personal, codigos de acceso y asistencias semanales.</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm font-bold text-gray-200">
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>

      {message && <div className="rounded-xl border border-emerald-900 bg-emerald-950/30 p-3 text-sm text-emerald-200">{message}</div>}

      <div className="inline-flex rounded-xl border border-gray-800 bg-gray-900 p-1">
        <button onClick={() => setTab("employees")} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === "employees" ? "bg-emerald-500 text-gray-950" : "text-gray-400"}`}>
          Empleados
        </button>
        <button onClick={() => setTab("attendance")} className={`rounded-lg px-4 py-2 text-sm font-bold ${tab === "attendance" ? "bg-emerald-500 text-gray-950" : "text-gray-400"}`}>
          Asistencias semanales
        </button>
      </div>

      {tab === "employees" && (
        <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <div className="mb-4 flex items-center gap-2">
              <UserPlus size={18} className="text-gray-400" />
              <h2 className="font-black text-gray-100">{editingEmployeeId ? "Editar empleado" : "Nuevo empleado"}</h2>
            </div>
            <form onSubmit={saveEmployee} className="space-y-3">
              <input className={inputClass} value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Nombre" />
              <input className={inputClass} type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="Email" />
              <input className={inputClass} value={form.access_code} onChange={(e) => update("access_code", e.target.value)} placeholder="Codigo de acceso" />
              <div className="grid grid-cols-2 gap-3">
                <input className={inputClass} type="number" value={form.salary} onChange={(e) => update("salary", e.target.value)} placeholder="Sueldo" />
                <select className={inputClass} value={form.salary_frequency} onChange={(e) => update("salary_frequency", e.target.value)}>
                  {frequencies.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select className={inputClass} value={form.role_id} onChange={(e) => update("role_id", e.target.value)}>
                  <option value="">Sin rol</option>
                  {roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <select className={inputClass} value={form.branch_id} onChange={(e) => update("branch_id", e.target.value)}>
                  <option value="">Todas</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </div>
              <button disabled={saving} className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-gray-950 disabled:opacity-50">
                {saving ? "Guardando..." : editingEmployeeId ? "Guardar cambios" : "Guardar empleado"}
              </button>
              {editingEmployeeId && (
                <button type="button" onClick={resetForm} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-700 px-4 py-2.5 text-sm font-bold text-gray-300 hover:bg-gray-800">
                  <X size={16} />
                  Cancelar edicion
                </button>
              )}
            </form>
          </section>

          <section className="rounded-2xl border border-gray-800 bg-gray-900">
            <div className="flex items-center gap-2 border-b border-gray-800 p-4">
              <Users size={18} className="text-gray-400" />
              <h2 className="font-black text-gray-100">{employees.length} empleados</h2>
            </div>
            <div className="divide-y divide-gray-800">
              {employees.map((employee) => (
                <div key={employee.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <p className="font-bold text-gray-100">{employee.name}</p>
                    <p className="mt-1 text-xs text-gray-500">{employee.email || "Sin email"} · {roleName(employee)} · codigo {employee.access_code}</p>
                    <p className="mt-1 text-xs text-gray-400">{money(Number(employee.salary || 0))} · {employee.salary_frequency} · {money(hourlyRate(employee))}/h estimado</p>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <button onClick={() => editEmployee(employee)} className="inline-flex items-center gap-2 rounded-xl border border-gray-700 px-3 py-2 text-xs font-bold text-gray-300 hover:bg-gray-800">
                      <Pencil size={14} />
                      Editar
                    </button>
                    <button onClick={() => toggleEmployee(employee)} className={`rounded-xl border px-3 py-2 text-xs font-bold ${employee.is_active === false ? "border-gray-700 text-gray-400" : "border-emerald-700 text-emerald-300"}`}>
                      {employee.is_active === false ? "Inactivo" : "Activo"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === "attendance" && (
        <section className="rounded-2xl border border-gray-800 bg-gray-900">
          <div className="flex flex-col gap-3 border-b border-gray-800 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays size={18} className="text-gray-400" />
              <div>
                <h2 className="font-black text-gray-100">Semana actual</h2>
                <p className="text-xs text-gray-500">Horas redondeadas cada media hora. Total estimado: {money(totalPayroll)}</p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-gray-800">
            {attendanceByEmployee.length === 0 && <div className="p-6 text-sm text-gray-500">Sin asistencias esta semana.</div>}
            {attendanceByEmployee.map(({ employee, rows, rawHours, roundedHours, pay, days }) => (
              <div key={employee.id} className="p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-bold text-gray-100">{employee.name}</p>
                    <p className="text-xs text-gray-500">{roleName(employee)} · {rows.length} turnos · tarifa estimada {money(hourlyRate(employee))}/h</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black tabular-nums text-emerald-200">{roundedHours.toFixed(1)} h</p>
                    <p className="text-sm font-bold text-gray-100">{money(pay)}</p>
                    <p className="text-[11px] text-gray-500">real {rawHours.toFixed(2)} h</p>
                  </div>
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-950">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, (roundedHours / maxWeeklyHours) * 100)}%` }} />
                </div>

                <div className="mt-4 grid gap-2">
                  {days.map((day) => (
                    <div key={day.date} className="rounded-xl border border-gray-800 bg-gray-950 p-3">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <p className="font-bold text-gray-200">{new Date(`${day.date}T12:00:00-03:00`).toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "2-digit" })}</p>
                        <p className="font-black text-emerald-200">{day.roundedHours.toFixed(1)} h · {money(day.pay)}</p>
                      </div>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        {day.rows.map((row) => (
                          <div key={row.id} className="rounded-lg bg-gray-900 px-3 py-2 text-xs text-gray-400">
                            <Clock3 size={14} className="mr-1 inline text-gray-500" />
                            {new Date(row.clock_in_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                            {" -> "}
                            {row.clock_out_at ? new Date(row.clock_out_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "abierto"}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
