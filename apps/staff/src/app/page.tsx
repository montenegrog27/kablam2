"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clock3,
  FileText,
  LogIn,
  LogOut,
  Minus,
  Plus,
  RefreshCcw,
  Search,
  Store,
  Utensils,
  X,
} from "lucide-react";
import { canManageTables, isAdminRole } from "@/lib/staffData";
import PwaRegister from "./components/PwaRegister";

type Branch = { id: string; name: string; tenant_id: string };
type StaffSession = {
  employeeId: string;
  tenantId: string;
  branchId: string;
  branchName: string;
  name: string;
  email: string;
  role: string;
};
type Table = {
  id: string;
  number: number;
  capacity: number;
  shape: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  rotation: number;
};
type CartItem = {
  product_id: string;
  variant_id: string;
  name: string;
  price: number;
  qty: number;
  confirmed?: boolean;
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

function money(value: number) {
  return `$${Math.round(value || 0).toLocaleString("es-AR")}`;
}

function AttendanceGate({
  session,
  closedAttendance,
  message,
  onClockIn,
  onLogout,
}: {
  session: StaffSession;
  closedAttendance: any;
  message: string;
  onClockIn: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <section className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-2xl sm:p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-300">Inicio de turno</p>
            <h1 className="mt-1 truncate text-2xl font-black">{session.name}</h1>
            <p className="truncate text-sm text-slate-500">
              {session.role} - {session.branchName}
            </p>
          </div>
          <button onClick={onLogout} className="rounded-xl border border-slate-800 px-3 py-2 text-xs font-black text-slate-300">
            Salir
          </button>
        </div>

        {closedAttendance && (
          <div className="mb-4 rounded-2xl bg-slate-950 p-4 text-sm text-slate-400">
            <p className="font-black text-slate-200">Ultimo turno</p>
            <p className="mt-2">
              Ingreso: <span className="font-bold text-slate-100">{formatTime(closedAttendance.clock_in_at)}</span>
            </p>
            <p>
              Egreso: <span className="font-bold text-slate-100">{formatTime(closedAttendance.clock_out_at)}</span>
            </p>
          </div>
        )}

        {message && <p className="mb-4 rounded-xl bg-slate-950 p-3 text-sm text-slate-300">{message}</p>}

        <button
          onClick={onClockIn}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-5 text-base font-black text-slate-950"
        >
          <LogIn size={20} />
          Ingresar a mi turno
        </button>
      </section>
    </div>
  );
}

function StaffSidebar({
  session,
  openAttendance,
  message,
  onClockOut,
  onLogout,
}: {
  session: StaffSession;
  openAttendance: any | null;
  message: string;
  onClockOut: () => void;
  onLogout: () => void;
}) {
  const admin = isAdminRole(session.role);

  return (
    <aside className="border-b border-slate-800 bg-slate-950/95 p-3 backdrop-blur lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r lg:p-4">
      <div className="flex items-center justify-between gap-3 lg:block">
        <div className="min-w-0">
          <p className="truncate text-sm font-black">{session.name}</p>
          <p className="truncate text-xs text-slate-500">
            {session.role} - {session.branchName}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black lg:mt-4 lg:inline-block ${admin ? "bg-sky-500/10 text-sky-300" : "bg-emerald-500/10 text-emerald-300"}`}>
          {admin ? "ADMIN" : "En turno"}
        </span>
      </div>

      {admin ? (
        <div className="mt-3 rounded-2xl border border-sky-500/20 bg-sky-500/10 p-3 text-sm text-sky-100 lg:mt-5">
          <p className="text-xs font-black uppercase tracking-wide text-sky-300">Admin</p>
          <p className="mt-1 text-sky-100">Acceso sin ingreso ni egreso.</p>
        </div>
      ) : (
        <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-400 lg:mt-5">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Ingreso</p>
          <p className="mt-1 font-bold text-slate-100">{formatTime(openAttendance?.clock_in_at)}</p>
        </div>
      )}

      {message && <p className="mt-3 rounded-xl bg-slate-900 p-3 text-sm text-slate-300">{message}</p>}

      <nav className={`mt-3 grid gap-2 lg:mt-5 lg:grid-cols-1 ${admin ? "grid-cols-1" : "grid-cols-2"}`}>
        {!admin && (
          <button
            onClick={onClockOut}
            className="flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-3 text-sm font-black text-rose-200 lg:justify-start"
          >
            <LogOut size={17} />
            Egreso
          </button>
        )}
        <button
          onClick={onLogout}
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 px-3 py-3 text-sm font-black text-slate-300 lg:justify-start"
        >
          <X size={17} />
          Salir
        </button>
      </nav>
    </aside>
  );
}

export default function StaffApp() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<StaffSession | null>(null);
  const [openAttendance, setOpenAttendance] = useState<any>(null);
  const [closedAttendance, setClosedAttendance] = useState<any>(null);
  const [message, setMessage] = useState("");
  const adminSession = isAdminRole(session?.role);

  useEffect(() => {
    loadSession();
  }, []);

  const loadSession = async () => {
    setBooting(true);
    const response = await fetch("/api/auth");
    if (response.ok) {
      const data = await response.json();
      setSession(data.session);
      setOpenAttendance(data.openAttendance);
      setClosedAttendance(data.latestAttendance?.clock_out_at ? data.latestAttendance : null);
    }
    setBooting(false);
  };

  const logout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    setSession(null);
    setOpenAttendance(null);
    setClosedAttendance(null);
  };

  const clock = async (action: "clock_in" | "clock_out") => {
    setMessage("");
    const response = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "No se pudo registrar.");
      return;
    }
    setOpenAttendance(data.openAttendance || null);
    setClosedAttendance(data.closedAttendance || null);
    setMessage(data.message || (action === "clock_in" ? "Ingreso registrado." : "Egreso registrado."));
  };

  if (booting) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-slate-950 text-slate-400">
        Cargando staff...
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100">
      <PwaRegister />
      {!session ? (
        <LoginPanel onLogin={(data) => {
          setSession(data.session);
          setOpenAttendance(data.openAttendance);
          setClosedAttendance(data.latestAttendance?.clock_out_at ? data.latestAttendance : null);
        }} />
      ) : (
        <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col">
          {!openAttendance && !adminSession ? (
            <AttendanceGate
              session={session}
              closedAttendance={closedAttendance}
              message={message}
              onClockIn={() => clock("clock_in")}
              onLogout={logout}
            />
          ) : (
            <div className="grid min-h-dvh lg:grid-cols-[260px_1fr]">
              <StaffSidebar
                session={session}
                openAttendance={openAttendance}
                message={message}
                onClockOut={() => clock("clock_out")}
                onLogout={logout}
              />

              <section className="min-w-0 p-3 sm:p-4">
                {canManageTables(session.role) ? (
                  <WaiterTables />
                ) : (
                  <div className="rounded-3xl border border-slate-800 bg-slate-900 p-5">
                    <div className="mb-3 flex items-center gap-2 text-emerald-300">
                      <Check size={18} />
                      <p className="font-black">Asistencia lista</p>
                    </div>
                    <p className="text-sm text-slate-400">
                      Gracias. Tu rol no tiene mesas asignadas, asi que no hay mas acciones para hacer desde esta app.
                    </p>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function LoginPanel({ onLogin }: { onLogin: (data: any) => void }) {
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setUsername(localStorage.getItem("kablam_staff_username") || "");
    setCode(localStorage.getItem("kablam_staff_access_code") || "");
    setBranchId(localStorage.getItem("kablam_staff_branch_id") || "");
  }, []);

  const buildEmail = () => {
    const value = username.trim().toLowerCase();
    return value.includes("@") ? value : `${value}@gmail.com`;
  };

  const submit = async () => {
    if (!username.trim() || !code.trim()) {
      setError("Ingresa usuario y clave.");
      return;
    }

    const email = buildEmail();
    setSaving(true);
    setError("");
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, branchId: branchId || undefined }),
    });
    const data = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(data.error === "invalid_credentials" ? "Usuario o clave invalidos." : data.error || "No se pudo ingresar.");
      return;
    }

    if (data.status === "branch_required") {
      setBranches(data.branches || []);
      setBranchId(data.branches?.[0]?.id || "");
      setError(data.message || "Elegi una sucursal.");
      return;
    }

    localStorage.setItem("kablam_staff_username", username.trim().toLowerCase());
    localStorage.setItem("kablam_staff_access_code", code);
    if (branchId) localStorage.setItem("kablam_staff_branch_id", branchId);
    onLogin(data);
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <section className="w-full max-w-md rounded-[2rem] border border-slate-800 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-300">
            <Clock3 size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black">Kablam Staff</h1>
            <p className="text-sm text-slate-500">Fichaje y mesas para empleados</p>
          </div>
        </div>

        <div className="space-y-3">
          {branches.length > 1 && (
            <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
              Sucursal
              <select
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-100 outline-none focus:border-emerald-500"
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
            Usuario
            <div className="mt-1 flex overflow-hidden rounded-xl border border-slate-700 bg-slate-950 focus-within:border-emerald-500">
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                className="min-w-0 flex-1 bg-transparent px-3 py-4 text-sm font-bold text-slate-100 outline-none"
                placeholder="usuario"
              />
              {!username.includes("@") && (
                <span className="flex items-center border-l border-slate-800 px-3 text-sm font-bold text-slate-500">
                  @gmail.com
                </span>
              )}
            </div>
          </label>

          <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
            Clave de acceso
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-4 text-center text-2xl font-black tracking-widest text-slate-100 outline-none focus:border-emerald-500"
              placeholder="...."
            />
          </label>

          {error && <p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">{error}</p>}

          <button
            onClick={submit}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-4 text-sm font-black text-slate-950 disabled:opacity-50"
          >
            <LogIn size={18} />
            Ingresar
          </button>
        </div>
      </section>
    </div>
  );
}

function WaiterTables() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tables, setTables] = useState<Table[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [floorObjects, setFloorObjects] = useState<any[]>([]);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [customerCount, setCustomerCount] = useState(1);
  const [confirmedItems, setConfirmedItems] = useState<CartItem[]>([]);
  const [pendingCart, setPendingCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadTables();
  }, []);

  const loadTables = async () => {
    setLoading(true);
    const response = await fetch("/api/tables");
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.error || "No se pudieron cargar las mesas.");
      return;
    }
    setTables(data.tables || []);
    setSessions(data.sessions || []);
    setProducts(data.products || []);
    setFloorObjects(data.floorObjects || []);
  };

  const getSession = (tableId: string) => sessions.find((session) => session.table_id === tableId);
  const getStatus = (tableId: string) => getSession(tableId)?.status || "free";

  const openTable = async (table: Table) => {
    setSelectedTable(table);
    setPendingCart([]);
    setConfirmedItems([]);
    setCustomerCount(1);

    const response = await fetch(`/api/tables?tableId=${table.id}`);
    const data = await response.json();
    if (!response.ok) return;

    if (data.tableSession?.customer_count) setCustomerCount(data.tableSession.customer_count);
    setConfirmedItems(
      (data.items || []).map((item: any) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        name: item.products?.name || "Producto",
        price: Number(item.unit_price || 0),
        qty: Number(item.quantity || 1),
        confirmed: true,
      })),
    );
  };

  const tableSession = selectedTable ? getSession(selectedTable.id) : null;
  const status = selectedTable ? getStatus(selectedTable.id) : "free";
  const allItems = [...confirmedItems, ...pendingCart];
  const subtotal = allItems.reduce((sum, item) => sum + item.price * item.qty, 0);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products
      .filter((product) => !term || product.name?.toLowerCase().includes(term))
      .filter((product) => {
        const variant = product.product_variants?.find((item: any) => item.is_default) || product.product_variants?.[0];
        return Boolean(variant);
      })
      .slice(0, 40);
  }, [products, search]);

  const runAction = async (action: string, payload: Record<string, unknown> = {}) => {
    if (!selectedTable) return null;
    setSaving(true);
    setError("");
    const response = await fetch("/api/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, tableId: selectedTable.id, ...payload }),
    });
    const text = await response.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text || "Respuesta invalida del servidor." };
    }
    setSaving(false);
    if (!response.ok) {
      setError(data.details || data.error || "No se pudo completar la accion.");
      return null;
    }
    await loadTables();
    return data;
  };

  const startSession = async () => {
    const data = await runAction("start_session", { customerCount });
    if (data?.tableSession) setSessions((prev) => [...prev.filter((item) => item.id !== data.tableSession.id), data.tableSession]);
  };

  const addToPending = (product: any) => {
    const variant = product.product_variants?.find((item: any) => item.is_default) || product.product_variants?.[0];
    if (!variant) return;
    const item = {
      product_id: variant.product_id || product.id,
      variant_id: variant.id,
      name: product.name,
      price: Number(variant.price || product.price || 0),
      qty: 1,
    };

    setPendingCart((prev) => {
      const existing = prev.find((cartItem) => cartItem.variant_id === item.variant_id);
      if (existing) {
        return prev.map((cartItem) =>
          cartItem.variant_id === item.variant_id ? { ...cartItem, qty: cartItem.qty + 1 } : cartItem,
        );
      }
      return [...prev, item];
    });
  };

  const updatePendingQty = (variantId: string, delta: number) => {
    setPendingCart((prev) =>
      prev
        .map((item) => (item.variant_id === variantId ? { ...item, qty: Math.max(0, item.qty + delta) } : item))
        .filter((item) => item.qty > 0),
    );
  };

  const acceptItems = async () => {
    const data = await runAction("accept_items", { items: pendingCart });
    if (!data) return;
    setConfirmedItems((prev) => [...prev, ...pendingCart.map((item) => ({ ...item, confirmed: true }))]);
    setPendingCart([]);
  };

  const sendToKds = async () => {
    if (!selectedTable) return;
    const data = await runAction("send_order", { items: pendingCart });
    if (!data) return;
    await openTable(selectedTable);
    setError("Comanda enviada. La mesa sigue abierta para seguir cargando productos.");
  };

  const reopenTable = async () => {
    await runAction("reopen_table");
  };

  const closeTable = async () => {
    const data = await runAction("close_table");
    if (!data) return;
    await loadTables();
    if (selectedTable) await openTable(selectedTable);
    setError("Ticket de venta enviado. La mesa quedo en cobrando para que caja la cierre.");
  };

  const statusClasses: Record<string, string> = {
    free: "border-slate-700 bg-slate-800",
    open: "border-rose-500 bg-rose-500/15",
    paying: "border-sky-500 bg-sky-500/15",
  };
  const openCount = sessions.filter((item) => item.status === "open").length;
  const payingCount = sessions.filter((item) => item.status === "paying").length;
  const occupiedTotal = sessions.reduce((sum, item) => sum + Number(item.total || 0), 0);

  return (
    <section className="min-h-[70vh] overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
      {!selectedTable ? (
        <>
          <div className="flex flex-col gap-3 border-b border-slate-800 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Utensils size={18} className="text-emerald-300" />
              <div>
                <p className="font-black">Salon</p>
                <p className="text-xs text-slate-500">
                  {openCount} abiertas / {payingCount} cuentas / {money(occupiedTotal)} en salon
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusLegend color="bg-slate-700" label="Libre" />
              <StatusLegend color="bg-rose-500" label="Abierta" />
              <StatusLegend color="bg-sky-500" label="Cuenta" />
              <button onClick={loadTables} className="rounded-xl border border-slate-700 p-2 text-slate-300">
                <RefreshCcw size={16} />
              </button>
            </div>
          </div>

          {error && <p className="m-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}

          {loading ? (
            <div className="p-6 text-sm text-slate-500">Cargando mesas...</div>
          ) : (
            <div className="relative min-h-[70vh] overflow-auto p-4">
              <div className="relative min-h-[640px] min-w-[720px]">
                {floorObjects.map((obj) => (
                  <div
                    key={obj.id}
                    className="absolute flex items-center justify-center rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-300"
                    style={{
                      left: Number(obj.pos_x),
                      top: Number(obj.pos_y),
                      width: Number(obj.width),
                      height: Number(obj.height),
                      transform: `rotate(${Number(obj.rotation || 0)}deg)`,
                      background: obj.type === "counter" ? "#92400e" : obj.type === "wall" ? "#475569" : "#334155",
                      borderRadius: obj.type === "column" ? 999 : 10,
                    }}
                  >
                    {obj.label || (obj.type === "counter" ? "Barra" : "")}
                  </div>
                ))}

                {tables.map((table) => {
                  const tableStatus = getStatus(table.id);
                  const session = getSession(table.id);
                  return (
                    <button
                      key={table.id}
                      onClick={() => openTable(table)}
                      className={`absolute flex flex-col items-center justify-center border-2 shadow-lg transition ${table.shape === "round" ? "rounded-full" : "rounded-2xl"} ${statusClasses[tableStatus]}`}
                      style={{
                        left: Number(table.pos_x),
                        top: Number(table.pos_y),
                        width: Number(table.width),
                        height: Number(table.height),
                        transform: `rotate(${Number(table.rotation || 0)}deg)`,
                      }}
                    >
                      <span className="text-lg font-black text-white">{table.number}</span>
                      <span className="text-[10px] font-bold text-slate-400">
                        {tableStatus === "free" ? `${table.capacity} pers` : tableStatus === "paying" ? "Cuenta" : money(Number(session?.total || 0))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex min-h-[70vh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <button onClick={() => setSelectedTable(null)} className="flex items-center gap-2 rounded-xl border border-slate-800 px-3 py-2 text-sm font-black text-slate-300">
              <ArrowLeft size={17} />
              Mesas
            </button>
            <div className="min-w-0 text-right">
              <p className="truncate text-lg font-black">Mesa {selectedTable.number}</p>
              <p className="text-xs text-slate-500">
                {status === "free" ? "Libre" : status === "paying" ? "Cuenta cerrada" : "Abierta"} - {money(subtotal)}
              </p>
            </div>
          </div>

          {error && <p className="m-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}

          {status === "free" ? (
            <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center space-y-5 p-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">Comensales</p>
                <div className="flex items-center justify-center gap-4">
                  <button onClick={() => setCustomerCount(Math.max(1, customerCount - 1))} className="rounded-xl bg-slate-900 p-4">
                    <Minus size={18} />
                  </button>
                  <span className="w-14 text-center text-4xl font-black">{customerCount}</span>
                  <button onClick={() => setCustomerCount(Math.min(20, customerCount + 1))} className="rounded-xl bg-slate-900 p-4">
                    <Plus size={18} />
                  </button>
                </div>
              </div>
              <button
                onClick={startSession}
                disabled={saving}
                className="w-full rounded-2xl bg-emerald-500 px-4 py-5 text-base font-black text-slate-950 disabled:opacity-50"
              >
                Abrir mesa
              </button>
            </div>
          ) : (
            <div className="grid flex-1 gap-0 lg:grid-cols-[1fr_420px]">
              <div className="min-w-0 border-b border-slate-800 lg:border-b-0 lg:border-r">
                {status === "open" && (
                  <div className="border-b border-slate-800 p-3">
                    <div className="relative">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        className="w-full rounded-xl border border-slate-800 bg-slate-950 py-3 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"
                        placeholder="Buscar producto..."
                      />
                    </div>
                  </div>
                )}

                {status === "open" ? (
                  <div className="grid max-h-[54vh] grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 xl:grid-cols-4">
                    {filteredProducts.map((product) => {
                      const variant = product.product_variants?.find((item: any) => item.is_default) || product.product_variants?.[0];
                      return (
                        <button
                          key={product.id}
                          onClick={() => addToPending(product)}
                          className="min-h-24 rounded-xl border border-slate-800 bg-slate-950 p-3 text-left text-sm transition hover:border-emerald-500/70"
                        >
                          <p className="line-clamp-2 font-bold">{product.name}</p>
                          <p className="mt-2 text-xs text-slate-500">{money(Number(variant?.price || product.price || 0))}</p>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 text-sm text-slate-500">
                    Cuenta cerrada. Podes reabrir la mesa si el cliente pide algo mas, o cobrar para liberar la mesa.
                  </div>
                )}
              </div>

              <aside className="flex min-h-[420px] flex-col bg-slate-950">
                <div className="border-b border-slate-800 p-4">
                  <p className="text-sm font-black uppercase tracking-wide text-slate-500">Pedido</p>
                  <p className="mt-1 text-3xl font-black text-emerald-300">{money(subtotal)}</p>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto p-4">
                  {!allItems.length && (
                    <div className="flex h-full flex-col items-center justify-center text-center text-sm text-slate-500">
                      <Store className="mb-3 text-slate-700" size={32} />
                      Todavia no hay productos.
                    </div>
                  )}
                  {confirmedItems.map((item, index) => (
                    <div key={`c-${item.variant_id}-${index}`} className="flex items-center gap-2 rounded-xl bg-slate-900 p-3 text-sm">
                      <Check size={14} className="text-emerald-400" />
                      <span className="min-w-0 flex-1 truncate text-slate-300">{item.name}</span>
                      <span className="text-slate-500">{item.qty}x</span>
                      <span className="w-20 text-right text-slate-400">{money(item.price * item.qty)}</span>
                    </div>
                  ))}
                  {pendingCart.map((item) => (
                    <div key={item.variant_id} className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                      <span className="min-w-0 flex-1 truncate text-slate-100">{item.name}</span>
                      <button onClick={() => updatePendingQty(item.variant_id, -1)} className="rounded-lg bg-slate-950 p-2">
                        <Minus size={12} />
                      </button>
                      <span className="w-5 text-center font-black">{item.qty}</span>
                      <button onClick={() => updatePendingQty(item.variant_id, 1)} className="rounded-lg bg-slate-950 p-2">
                        <Plus size={12} />
                      </button>
                      <span className="w-20 text-right text-slate-300">{money(item.price * item.qty)}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 border-t border-slate-800 p-4">
                  <div className="flex justify-between text-sm font-black">
                    <span>Total</span>
                    <span>{money(subtotal)}</span>
                  </div>

                  {status === "open" && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={acceptItems}
                        disabled={!pendingCart.length || saving}
                        className="rounded-xl bg-emerald-600 px-3 py-4 text-sm font-black disabled:opacity-40"
                      >
                        Aceptar
                      </button>
                      <button
                        onClick={sendToKds}
                        disabled={(!pendingCart.length && !confirmedItems.length) || saving}
                        className="rounded-xl bg-sky-600 px-3 py-4 text-sm font-black disabled:opacity-40"
                      >
                        Comandar
                      </button>
                    </div>
                  )}

                  {status === "open" && confirmedItems.length > 0 && pendingCart.length === 0 && (
                    <button
                      onClick={closeTable}
                      disabled={saving}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-4 text-sm font-black text-slate-950 disabled:opacity-40"
                    >
                      <FileText size={16} />
                      Imprimir ticket y enviar a caja
                    </button>
                  )}

                  {status === "paying" && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-100">
                        Mesa en cobrando. Caja debe cargar el metodo de pago y cerrar la mesa.
                      </div>
                      <button onClick={reopenTable} className="flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-3 py-4 text-sm font-black">
                        <ArrowLeft size={15} />
                        Reabrir
                      </button>
                    </div>
                  )}
                </div>
              </aside>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function StatusLegend({ color, label }: { color: string; label: string }) {
  return (
    <span className="hidden items-center gap-1.5 rounded-full border border-slate-800 px-2 py-1 text-[10px] font-black uppercase text-slate-500 sm:flex">
      <i className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
