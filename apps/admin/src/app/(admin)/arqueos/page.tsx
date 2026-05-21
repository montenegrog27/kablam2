"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Download,
  Filter,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

type Branch = {
  id: string;
  name: string;
};

type CashRegister = {
  id: string;
  name: string;
  branch_id: string;
};

type UserRecord = {
  id: string;
  name?: string | null;
  full_name?: string | null;
};

type CashMovementSnapshot = {
  in?: number;
  out?: number;
  net?: number;
  items?: Array<{
    type?: "in" | "out";
    amount?: number;
    reason?: string | null;
    created_at?: string;
  }>;
};

type CashClosure = {
  id: string;
  tenant_id: string;
  branch_id: string;
  cash_register_id: string;
  cash_session_id: string;
  opened_by: string | null;
  closed_by: string | null;
  opened_at: string;
  closed_at: string;
  opening_amount: number;
  closing_amount: number;
  expected_cash: number;
  difference: number;
  carry_over: number | null;
  difference_reason?: string | null;
  total_revenue: number;
  total_orders: number;
  total_units: number;
  total_cost: number;
  profit: number;
  payments?: Record<string, number>;
  products?: Record<string, { total?: number; variants?: Record<string, number> }>;
  cash_movements?: CashMovementSnapshot;
  bills_detail?: Record<string, number>;
};

const PAGE_SIZE = 20;

function formatCurrency(value: number) {
  return `$${new Intl.NumberFormat("es-AR").format(Math.round(value || 0))}`;
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-AR");
}

function userName(user?: UserRecord) {
  return user?.full_name || user?.name || "Sin usuario";
}

function toCSVValue(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export default function ArqueosPage() {
  const [tenantId, setTenantId] = useState("");
  const [closures, setClosures] = useState<CashClosure[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(true);

  const [dateFrom, setDateFrom] = useState(() => {
    const now = new Date();
    now.setDate(1);
    return now.toISOString().split("T")[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [branchFilter, setBranchFilter] = useState("");
  const [registerFilter, setRegisterFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [differenceFilter, setDifferenceFilter] = useState("");
  const [search, setSearch] = useState("");

  const branchMap = useMemo(
    () => Object.fromEntries(branches.map((branch) => [branch.id, branch.name])),
    [branches],
  );
  const registerMap = useMemo(
    () => Object.fromEntries(registers.map((register) => [register.id, register.name])),
    [registers],
  );
  const userMap = useMemo(
    () => Object.fromEntries(users.map((user) => [user.id, user])),
    [users],
  );

  const visibleRegisters = useMemo(() => {
    if (!branchFilter) return registers;
    return registers.filter((register) => register.branch_id === branchFilter);
  }, [branchFilter, registers]);

  const filteredClosures = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return closures.filter((closure) => {
      if (differenceFilter === "ok" && Number(closure.difference) !== 0) return false;
      if (differenceFilter === "short" && Number(closure.difference) >= 0) return false;
      if (differenceFilter === "over" && Number(closure.difference) <= 0) return false;
      if (differenceFilter === "with_difference" && Number(closure.difference) === 0) return false;
      if (!normalizedSearch) return true;

      const haystack = [
        closure.id,
        closure.cash_session_id,
        branchMap[closure.branch_id],
        registerMap[closure.cash_register_id],
        userName(userMap[closure.opened_by || ""]),
        userName(userMap[closure.closed_by || ""]),
        closure.difference_reason || "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [branchMap, closures, differenceFilter, registerMap, search, userMap]);

  const pageCount = Math.max(1, Math.ceil(filteredClosures.length / PAGE_SIZE));
  const paginatedClosures = filteredClosures.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE,
  );

  const totals = useMemo(() => {
    return filteredClosures.reduce(
      (acc, closure) => {
        const difference = Number(closure.difference || 0);
        acc.revenue += Number(closure.total_revenue || 0);
        acc.expected += Number(closure.expected_cash || 0);
        acc.counted += Number(closure.closing_amount || 0);
        acc.difference += difference;
        acc.orders += Number(closure.total_orders || 0);
        if (difference !== 0) acc.withDifference += 1;
        if (difference < 0) acc.short += Math.abs(difference);
        if (difference > 0) acc.over += difference;
        return acc;
      },
      {
        revenue: 0,
        expected: 0,
        counted: 0,
        difference: 0,
        orders: 0,
        withDifference: 0,
        short: 0,
        over: 0,
      },
    );
  }, [filteredClosures]);

  const loadMeta = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return;

    const { data: currentUser } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", authData.user.id)
      .single();

    if (!currentUser?.tenant_id) return;

    setTenantId(currentUser.tenant_id);

    const [{ data: branchData }, { data: registerData }, { data: userData }] =
      await Promise.all([
        supabase
          .from("branches")
          .select("id, name")
          .eq("tenant_id", currentUser.tenant_id)
          .order("name"),
        supabase
          .from("cash_registers")
          .select("id, name, branch_id")
          .eq("tenant_id", currentUser.tenant_id)
          .order("name"),
        supabase
          .from("users")
          .select("id, name, full_name")
          .eq("tenant_id", currentUser.tenant_id)
          .order("full_name"),
      ]);

    setBranches((branchData as Branch[]) || []);
    setRegisters((registerData as CashRegister[]) || []);
    setUsers((userData as UserRecord[]) || []);
  }, []);

  const loadClosures = useCallback(async () => {
    if (!tenantId) return;

    setLoading(true);

    let query = supabase
      .from("cash_closures")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("closed_at", { ascending: false })
      .limit(1000);

    if (dateFrom) query = query.gte("closed_at", `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lte("closed_at", `${dateTo}T23:59:59`);
    if (branchFilter) query = query.eq("branch_id", branchFilter);
    if (registerFilter) query = query.eq("cash_register_id", registerFilter);
    if (userFilter) query = query.or(`opened_by.eq.${userFilter},closed_by.eq.${userFilter}`);

    const { data } = await query;
    setClosures((data as CashClosure[]) || []);
    setLoading(false);
  }, [branchFilter, dateFrom, dateTo, registerFilter, tenantId, userFilter]);

  useEffect(() => {
    void Promise.resolve().then(loadMeta);
  }, [loadMeta]);

  useEffect(() => {
    void Promise.resolve().then(loadClosures);
  }, [loadClosures]);

  const resetFilters = () => {
    const now = new Date();
    const firstDay = new Date(now);
    firstDay.setDate(1);
    setDateFrom(firstDay.toISOString().split("T")[0]);
    setDateTo(now.toISOString().split("T")[0]);
    setBranchFilter("");
    setRegisterFilter("");
    setUserFilter("");
    setDifferenceFilter("");
    setSearch("");
    setPage(0);
  };

  const setPreset = (preset: "today" | "week" | "month") => {
    const now = new Date();
    if (preset === "today") {
      const today = now.toISOString().split("T")[0];
      setDateFrom(today);
      setDateTo(today);
      setPage(0);
      return;
    }

    if (preset === "week") {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      setDateFrom(start.toISOString().split("T")[0]);
      setDateTo(now.toISOString().split("T")[0]);
      setPage(0);
      return;
    }

    const firstDay = new Date(now);
    firstDay.setDate(1);
    setDateFrom(firstDay.toISOString().split("T")[0]);
    setDateTo(now.toISOString().split("T")[0]);
    setPage(0);
  };

  const exportCSV = () => {
    const headers = [
      "Fecha cierre",
      "Sucursal",
      "Caja",
      "Abierta por",
      "Cerrada por",
      "Ventas",
      "Ordenes",
      "Apertura",
      "Esperado",
      "Contado",
      "Diferencia",
      "Motivo diferencia",
    ];

    const rows = filteredClosures.map((closure) => [
      formatDate(closure.closed_at),
      branchMap[closure.branch_id] || "",
      registerMap[closure.cash_register_id] || "",
      userName(userMap[closure.opened_by || ""]),
      userName(userMap[closure.closed_by || ""]),
      Number(closure.total_revenue || 0),
      Number(closure.total_orders || 0),
      Number(closure.opening_amount || 0),
      Number(closure.expected_cash || 0),
      Number(closure.closing_amount || 0),
      Number(closure.difference || 0),
      closure.difference_reason || "",
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(toCSVValue).join(","))
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `arqueos_${dateFrom}_${dateTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const hasActiveFilters =
    branchFilter || registerFilter || userFilter || differenceFilter || search;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Arqueos de caja</h1>
          <p className="mt-1 text-sm text-gray-500">
            Control de cierres, diferencias, cajas, cajeros y snapshots de venta.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters((value) => !value)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              showFilters || hasActiveFilters
                ? "border-blue-500/30 bg-blue-600/20 text-blue-300"
                : "border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800"
            }`}
          >
            <Filter size={14} />
            Filtros
            {hasActiveFilters && <span className="h-2 w-2 rounded-full bg-blue-400" />}
          </button>
          <button
            onClick={loadClosures}
            className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800"
          >
            <RefreshCw size={14} />
            Actualizar
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800"
          >
            <Download size={14} />
            Exportar
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        {[
          { label: "Cierres", value: filteredClosures.length.toString(), color: "text-blue-400" },
          { label: "Ventas", value: formatCurrency(totals.revenue), color: "text-emerald-400" },
          { label: "Ordenes", value: totals.orders.toString(), color: "text-purple-400" },
          { label: "Esperado", value: formatCurrency(totals.expected), color: "text-gray-100" },
          { label: "Contado", value: formatCurrency(totals.counted), color: "text-gray-100" },
          {
            label: "Diferencia neta",
            value: formatCurrency(totals.difference),
            color: totals.difference === 0 ? "text-emerald-400" : "text-red-400",
          },
          {
            label: "Con diferencia",
            value: totals.withDifference.toString(),
            color: totals.withDifference === 0 ? "text-emerald-400" : "text-amber-400",
          },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-700 bg-gray-900 p-4">
            <p className="mb-1 text-xs text-gray-500">{stat.label}</p>
            <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {(showFilters || hasActiveFilters) && (
        <div className="mb-6 rounded-xl border border-gray-700 bg-gray-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-100">Filtros avanzados</h3>
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200"
            >
              <X size={12} />
              Limpiar
            </button>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Calendar size={14} className="text-gray-500" />
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setPage(0);
              }}
              className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
            />
            <span className="text-gray-500">a</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value);
                setPage(0);
              }}
              className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
            />
            <button onClick={() => setPreset("today")} className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-400 hover:text-gray-200">
              Hoy
            </button>
            <button onClick={() => setPreset("week")} className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-400 hover:text-gray-200">
              Semana
            </button>
            <button onClick={() => setPreset("month")} className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-400 hover:text-gray-200">
              Mes
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <label className="mb-1.5 block text-xs text-gray-500">Sucursal</label>
              <select
                value={branchFilter}
                onChange={(event) => {
                  setBranchFilter(event.target.value);
                  setRegisterFilter("");
                  setPage(0);
                }}
                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
              >
                <option value="">Todas</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-gray-500">Caja</label>
              <select
                value={registerFilter}
                onChange={(event) => {
                  setRegisterFilter(event.target.value);
                  setPage(0);
                }}
                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
              >
                <option value="">Todas</option>
                {visibleRegisters.map((register) => (
                  <option key={register.id} value={register.id}>
                    {register.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-gray-500">Cajero</label>
              <select
                value={userFilter}
                onChange={(event) => {
                  setUserFilter(event.target.value);
                  setPage(0);
                }}
                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
              >
                <option value="">Todos</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {userName(user)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-gray-500">Diferencia</label>
              <select
                value={differenceFilter}
                onChange={(event) => {
                  setDifferenceFilter(event.target.value);
                  setPage(0);
                }}
                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
              >
                <option value="">Todas</option>
                <option value="ok">Sin diferencia</option>
                <option value="with_difference">Con diferencia</option>
                <option value="short">Faltante</option>
                <option value="over">Sobrante</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-gray-500">Buscar</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-gray-500" />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(0);
                  }}
                  placeholder="Caja, cajero, motivo..."
                  className="w-full rounded-lg border border-gray-600 bg-gray-800 py-2 pl-9 pr-3 text-sm text-gray-100 placeholder-gray-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-100">Cierres registrados</h3>
          <p className="text-xs text-gray-500">
            Mostrando {paginatedClosures.length} de {filteredClosures.length}
          </p>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-500">Cargando arqueos...</div>
        ) : filteredClosures.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500">
            No hay arqueos para los filtros seleccionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="bg-gray-950/60 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Cierre</th>
                  <th className="px-4 py-3">Sucursal / caja</th>
                  <th className="px-4 py-3">Cajero</th>
                  <th className="px-4 py-3 text-right">Ventas</th>
                  <th className="px-4 py-3 text-right">Esperado</th>
                  <th className="px-4 py-3 text-right">Contado</th>
                  <th className="px-4 py-3 text-right">Diferencia</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {paginatedClosures.map((closure) => {
                  const expanded = expandedId === closure.id;
                  const difference = Number(closure.difference || 0);

                  return (
                    <Fragment key={closure.id}>
                      <tr className="hover:bg-gray-800/50">
                        <td className="px-4 py-4">
                          <p className="font-medium text-gray-100">{formatDate(closure.closed_at)}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            Abierta {formatDate(closure.opened_at)}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-medium text-gray-100">
                            {branchMap[closure.branch_id] || "Sucursal"}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {registerMap[closure.cash_register_id] || "Caja"}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-gray-100">
                            {userName(userMap[closure.opened_by || ""])}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Cierra {userName(userMap[closure.closed_by || ""])}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <p className="font-semibold text-emerald-400">
                            {formatCurrency(Number(closure.total_revenue))}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {closure.total_orders || 0} ordenes
                          </p>
                        </td>
                        <td className="px-4 py-4 text-right">
                          {formatCurrency(Number(closure.expected_cash))}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {formatCurrency(Number(closure.closing_amount))}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                              difference === 0
                                ? "bg-emerald-500/15 text-emerald-300"
                                : difference < 0
                                  ? "bg-red-500/15 text-red-300"
                                  : "bg-amber-500/15 text-amber-300"
                            }`}
                          >
                            {difference !== 0 && <AlertTriangle size={12} />}
                            {formatCurrency(difference)}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button
                            onClick={() => setExpandedId(expanded ? null : closure.id)}
                            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-800 hover:text-gray-100"
                          >
                            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={`${closure.id}-detail`}>
                          <td colSpan={8} className="bg-gray-950/50 px-4 py-5">
                            <ClosureDetail closure={closure} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-gray-700 px-4 py-3">
          <p className="text-xs text-gray-500">
            Pagina {page + 1} de {pageCount}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              disabled={page === 0}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
              disabled={page >= pageCount - 1}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClosureDetail({ closure }: { closure: CashClosure }) {
  const payments = Object.entries(closure.payments || {});
  const products = Object.entries(closure.products || {});
  const bills = Object.entries(closure.bills_detail || {})
    .filter(([, quantity]) => Number(quantity) > 0)
    .sort(([a], [b]) => Number(b) - Number(a));
  const movements = closure.cash_movements?.items || [];

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h4 className="mb-3 text-sm font-semibold text-gray-100">Resumen</h4>
        <div className="space-y-2 text-sm">
          <DetailRow label="Apertura" value={formatCurrency(Number(closure.opening_amount))} />
          <DetailRow label="Carry over" value={formatCurrency(Number(closure.carry_over || 0))} />
          <DetailRow label="Unidades" value={String(closure.total_units || 0)} />
          <DetailRow label="Costo" value={formatCurrency(Number(closure.total_cost || 0))} />
          <DetailRow label="Ganancia bruta" value={formatCurrency(Number(closure.profit || 0))} />
        </div>
        {closure.difference_reason && (
          <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
            <p className="text-xs font-semibold text-amber-300">Motivo diferencia</p>
            <p className="mt-1 text-sm text-amber-100">{closure.difference_reason}</p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h4 className="mb-3 text-sm font-semibold text-gray-100">Pagos</h4>
        <div className="space-y-2 text-sm">
          {payments.length === 0 ? (
            <p className="text-gray-500">Sin detalle de pagos.</p>
          ) : (
            payments.map(([name, amount]) => (
              <DetailRow key={name} label={name} value={formatCurrency(Number(amount))} />
            ))
          )}
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h4 className="mb-3 text-sm font-semibold text-gray-100">Movimientos</h4>
        <div className="space-y-2 text-sm">
          <DetailRow label="Ingresos" value={formatCurrency(Number(closure.cash_movements?.in || 0))} />
          <DetailRow label="Retiros" value={formatCurrency(Number(closure.cash_movements?.out || 0))} />
          <DetailRow label="Neto" value={formatCurrency(Number(closure.cash_movements?.net || 0))} />
          {movements.slice(0, 4).map((movement, index) => (
            <p key={index} className="border-t border-gray-800 pt-2 text-xs text-gray-400">
              {movement.type === "in" ? "Ingreso" : "Retiro"} - {movement.reason || "Sin motivo"} -{" "}
              {formatCurrency(Number(movement.amount || 0))}
            </p>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h4 className="mb-3 text-sm font-semibold text-gray-100">Billetes</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {bills.length === 0 ? (
            <p className="col-span-2 text-gray-500">Sin conteo detallado.</p>
          ) : (
            bills.map(([value, quantity]) => (
              <div key={value} className="flex justify-between rounded bg-gray-950 px-2 py-1">
                <span>${Number(value).toLocaleString("es-AR")}</span>
                <span className="text-gray-400">x{quantity}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 lg:col-span-4">
        <h4 className="mb-3 text-sm font-semibold text-gray-100">Productos vendidos</h4>
        {products.length === 0 ? (
          <p className="text-sm text-gray-500">Sin snapshot de productos.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {products.slice(0, 12).map(([name, product]) => (
              <div key={name} className="rounded-lg border border-gray-800 bg-gray-950 p-3">
                <div className="flex justify-between gap-3">
                  <p className="font-medium text-gray-100">{name}</p>
                  <span className="text-sm text-gray-400">{product.total || 0}</span>
                </div>
                {Object.entries(product.variants || {}).slice(0, 4).map(([variant, qty]) => (
                  <div key={variant} className="mt-1 flex justify-between text-xs text-gray-500">
                    <span>{variant}</span>
                    <span>{qty}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-100">{value}</span>
    </div>
  );
}
