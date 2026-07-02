"use client";

import { type ComponentType, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BellRing,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  LogIn,
  LogOut,
  Menu,
  Minus,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Table2,
  Utensils,
  X,
} from "lucide-react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
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
  open,
  onClose,
  onClockOut,
  onLogout,
}: {
  session: StaffSession;
  openAttendance: any | null;
  message: string;
  open: boolean;
  onClose: () => void;
  onClockOut: () => void;
  onLogout: () => void;
}) {
  const admin = isAdminRole(session.role);

  return (
    <>
      {open && <button aria-label="Cerrar menu" onClick={onClose} className="fixed inset-0 z-40 bg-black/70 lg:hidden" />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-sm flex-col border-r border-slate-800 bg-[#070b12] p-4 shadow-2xl transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-auto lg:max-w-none lg:translate-x-0 lg:shadow-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">Kablam Staff</p>
            <p className="mt-2 truncate text-xl font-black leading-tight">{session.name}</p>
            <p className="mt-1 truncate text-sm text-slate-500">
              {session.role} - {session.branchName}
            </p>
          </div>
          <button onClick={onClose} className="rounded-2xl border border-slate-800 p-2 text-slate-400 lg:hidden">
            <X size={18} />
          </button>
        </div>

        <div className={`mt-5 rounded-[1.25rem] border p-4 ${admin ? "border-sky-500/25 bg-sky-500/10" : "border-emerald-500/20 bg-emerald-500/10"}`}>
          <div className="flex items-center gap-3">
            <span className={`rounded-2xl p-2 ${admin ? "bg-sky-500/15 text-sky-300" : "bg-emerald-500/15 text-emerald-300"}`}>
              {admin ? <ShieldCheck size={18} /> : <Clock3 size={18} />}
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">{admin ? "Modo admin" : "Turno activo"}</p>
              <p className="text-sm font-black text-slate-100">{admin ? "Sin fichaje requerido" : formatTime(openAttendance?.clock_in_at)}</p>
            </div>
          </div>
        </div>

        {message && <p className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">{message}</p>}

        <nav className="mt-5 space-y-2">
          <MenuAction icon={Table2} label="Mesas" hint="Salon y pedidos" onClick={onClose} />
          {!admin && (
            <MenuAction
              icon={LogOut}
              label="Registrar egreso"
              hint="Finalizar turno"
              danger
              onClick={() => {
                onClose();
                onClockOut();
              }}
            />
          )}
          <MenuAction
            icon={X}
            label="Cerrar sesion"
            hint="Salir de esta cuenta"
            onClick={() => {
              onClose();
              onLogout();
            }}
          />
        </nav>

        <div className="mt-auto rounded-2xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">
          App optimizada para telefono y tablet. Las acciones sensibles quedan en este menu.
        </div>
      </aside>
    </>
  );
}

function MenuAction({
  icon: Icon,
  label,
  hint,
  danger,
  onClick,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  hint: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition active:scale-[0.99] ${
        danger
          ? "border-rose-500/25 bg-rose-500/10 text-rose-100"
          : "border-slate-800 bg-slate-950 text-slate-100 hover:border-emerald-500/40"
      }`}
    >
      <span className={`rounded-xl p-2 ${danger ? "bg-rose-500/10 text-rose-300" : "bg-slate-900 text-emerald-300"}`}>
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black">{label}</span>
        <span className="block truncate text-xs text-slate-500">{hint}</span>
      </span>
      <ChevronRight size={16} className="text-slate-600" />
    </button>
  );
}

export default function StaffApp() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<StaffSession | null>(null);
  const [openAttendance, setOpenAttendance] = useState<any>(null);
  const [closedAttendance, setClosedAttendance] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
                open={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
                onClockOut={() => clock("clock_out")}
                onLogout={logout}
              />

              <section className="min-w-0">
                <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-800 bg-slate-950/95 px-3 py-3 backdrop-blur lg:hidden">
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="rounded-2xl border border-slate-800 bg-slate-900 p-3 text-slate-100"
                    aria-label="Abrir menu"
                  >
                    <Menu size={20} />
                  </button>
                  <div className="min-w-0 px-3 text-center">
                    <p className="truncate text-sm font-black">{session.branchName}</p>
                    <p className="truncate text-xs text-slate-500">{session.name} - {session.role}</p>
                  </div>
                  <span className="rounded-2xl bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-300">
                    Staff
                  </span>
                </div>
                <div className="p-2 sm:p-4">
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
                </div>
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
  const [activeCategory, setActiveCategory] = useState("all");
  const [error, setError] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const knownReadyOrdersRef = useRef<Set<string>>(new Set());
  const firstReadyCheckRef = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const notificationsEnabledRef = useRef(false);

  useEffect(() => {
    loadTables();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const enabled = "Notification" in window && Notification.permission === "granted";
    notificationsEnabledRef.current = enabled;
    setNotificationsEnabled(enabled);
  }, []);

  useEffect(() => {
    notificationsEnabledRef.current = notificationsEnabled;
  }, [notificationsEnabled]);

  useEffect(() => {
    const channel = supabase
      .channel("staff-tables-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        void loadTables({ silent: true });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "table_sessions" }, () => {
        void loadTables({ silent: true });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadTables({ silent: true });
    }, 10000);
    return () => window.clearInterval(interval);
  }, []);

  const loadTables = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    const response = await fetch("/api/tables");
    const data = await response.json();
    if (!silent) setLoading(false);
    if (!response.ok) {
      setError(data.error || "No se pudieron cargar las mesas.");
      return;
    }
    notifyReadyTableOrders(data.sessions || [], data.tables || []);
    setTables(data.tables || []);
    setSessions(data.sessions || []);
    setProducts(data.products || []);
    setFloorObjects(data.floorObjects || []);
  };

  const getAudioContext = () => {
    if (typeof window === "undefined") return null;
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!audioContextRef.current) audioContextRef.current = new AudioContextCtor();
    return audioContextRef.current;
  };

  const playReadySound = async () => {
    const context = getAudioContext();
    if (!context) return;
    try {
      if (context.state === "suspended") await context.resume();
      const now = context.currentTime;
      [0, 0.2, 0.42].forEach((offset, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = index === 1 ? 980 : 740;
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.15);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + 0.17);
      });
    } catch {}
  };

  const triggerReadyFeedback = () => {
    void playReadySound();
    try {
      navigator.vibrate?.([260, 120, 260, 120, 420]);
    } catch {}
  };

  const enableReadyAlerts = async () => {
    await playReadySound();
    try {
      navigator.vibrate?.(120);
    } catch {}

    if (!("Notification" in window)) {
      setError("Avisos con sonido activados. Este navegador no soporta notificaciones del sistema.");
      return;
    }

    if (Notification.permission === "granted") {
      notificationsEnabledRef.current = true;
      setNotificationsEnabled(true);
      setError("Avisos de mesas listos activados.");
      return;
    }

    const permission = await Notification.requestPermission();
    const enabled = permission === "granted";
    notificationsEnabledRef.current = enabled;
    setNotificationsEnabled(enabled);
    setError(enabled ? "Avisos de mesas listos activados." : "Permiso de notificaciones denegado. Queda activo el aviso en pantalla.");
  };

  const notifyReadyTableOrders = (nextSessions: any[], nextTables: Table[]) => {
    const readySessions = nextSessions.filter((session) => session.order?.status === "ready" && session.order_id);
    const currentReadyIds = new Set(readySessions.map((session) => String(session.order_id)));

    if (firstReadyCheckRef.current) {
      knownReadyOrdersRef.current = currentReadyIds;
      firstReadyCheckRef.current = false;
      return;
    }

    const newReadySessions = readySessions.filter((session) => !knownReadyOrdersRef.current.has(String(session.order_id)));
    knownReadyOrdersRef.current = currentReadyIds;
    if (newReadySessions.length === 0) return;

    const tableById = new Map(nextTables.map((table) => [table.id, table]));
    const firstReady = newReadySessions[0];
    const table = tableById.get(firstReady.table_id);
    const title = `Mesa ${table?.number || ""} lista`.trim();
    const body = newReadySessions.length > 1
      ? `${newReadySessions.length} pedidos de mesa estan listos.`
      : "El pedido esta listo para llevar a la mesa.";

    triggerReadyFeedback();
    try {
      if (notificationsEnabledRef.current && "Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body, tag: `table-ready-${firstReady.order_id}` });
      }
    } catch {}

    setError(`${title}: ${body}`);
  };

  const getSession = (tableId: string) => sessions.find((session) => session.table_id === tableId);
  const getStatus = (tableId: string) => getSession(tableId)?.status || "free";
  const getVisualStatus = (tableId: string) => {
    const session = getSession(tableId);
    if (!session) return "free";
    if (session.status === "paying") return "paying";
    if (session.order?.status === "ready") return "ready";
    return "open";
  };

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
      .filter((product) => activeCategory === "all" || product.categories?.id === activeCategory)
      .filter((product) => {
        const variant = product.product_variants?.find((item: any) => item.is_default) || product.product_variants?.[0];
        return Boolean(variant);
      })
      .slice(0, 60);
  }, [activeCategory, products, search]);

  const productCategories = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((product) => {
      if (product.categories?.id && product.categories?.name) {
        map.set(product.categories.id, product.categories.name);
      }
    });
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [products]);

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
    ready: "border-emerald-400 bg-emerald-500/20",
    paying: "border-sky-500 bg-sky-500/15",
  };
  const openCount = sessions.filter((item) => item.status === "open").length;
  const payingCount = sessions.filter((item) => item.status === "paying").length;
  const occupiedTotal = sessions.reduce((sum, item) => sum + Number(item.total || 0), 0);

  return (
    <section className="min-h-[calc(100dvh-72px)] overflow-hidden rounded-[1.5rem] border border-slate-800 bg-slate-900/80 lg:min-h-[calc(100dvh-32px)]">
      {!selectedTable ? (
        <>
          <div className="flex flex-col gap-3 border-b border-slate-800 bg-slate-950/50 px-4 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <span className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-300">
                <Utensils size={20} />
              </span>
              <div>
                <p className="text-xl font-black">Salon</p>
                <p className="text-xs text-slate-500">
                  {openCount} abiertas / {payingCount} cuentas / {money(occupiedTotal)} en salon
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusLegend color="bg-slate-700" label="Libre" />
              <StatusLegend color="bg-rose-500" label="Abierta" />
              <StatusLegend color="bg-sky-500" label="Cuenta" />
              <button
                onClick={enableReadyAlerts}
                className={`flex items-center gap-2 rounded-2xl border px-3 py-3 text-xs font-black uppercase active:scale-95 ${
                  notificationsEnabled
                    ? "border-emerald-500 bg-emerald-500 text-slate-950"
                    : "border-amber-400/60 bg-amber-400/10 text-amber-200"
                }`}
              >
                <BellRing size={16} />
                {notificationsEnabled ? "Avisos activos" : "Activar avisos"}
              </button>
              <button onClick={() => loadTables()} className="rounded-2xl border border-slate-700 bg-slate-900 p-3 text-slate-300 active:scale-95">
                <RefreshCcw size={16} />
              </button>
            </div>
          </div>

          {error && <p className="m-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}

          {loading ? (
            <div className="p-6 text-sm text-slate-500">Cargando mesas...</div>
          ) : (
            <div className="relative min-h-[70vh] overflow-auto p-3 sm:p-4">
              <div className="relative min-h-[640px] min-w-[720px] rounded-[1.5rem] border border-slate-800 bg-slate-950/55">
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
                  const tableStatus = getVisualStatus(table.id);
                  const session = getSession(table.id);
                  return (
                    <button
                      key={table.id}
                      onClick={() => openTable(table)}
                      className={`absolute flex flex-col items-center justify-center border-2 shadow-lg transition active:scale-95 ${table.shape === "round" ? "rounded-full" : "rounded-2xl"} ${statusClasses[tableStatus]}`}
                      style={{
                        left: Number(table.pos_x),
                        top: Number(table.pos_y),
                        width: Number(table.width),
                        height: Number(table.height),
                        transform: `rotate(${Number(table.rotation || 0)}deg)`,
                      }}
                    >
                      <span className="text-xl font-black text-white">{table.number}</span>
                      <span className="text-[10px] font-bold text-slate-400">
                        {tableStatus === "free" ? `${table.capacity} pers` : tableStatus === "paying" ? "Cuenta" : tableStatus === "ready" ? "Listo" : money(Number(session?.total || 0))}
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
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/60 px-3 py-3 sm:px-4">
            <button onClick={() => setSelectedTable(null)} className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 px-3 py-3 text-sm font-black text-slate-300 active:scale-95">
              <ArrowLeft size={17} />
              Mesas
            </button>
            <div className="min-w-0 text-right">
              <p className="truncate text-xl font-black">Mesa {selectedTable.number}</p>
              <p className="text-xs text-slate-500">
                {status === "free" ? "Libre" : status === "paying" ? "Cuenta cerrada" : "Abierta"} - {money(subtotal)}
              </p>
            </div>
          </div>

          {error && <p className="m-4 rounded-xl bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}

          {status === "free" ? (
            <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center space-y-5 p-4">
              <div className="rounded-[1.5rem] border border-slate-800 bg-slate-950 p-5">
                <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">Comensales</p>
                <div className="flex items-center justify-center gap-4">
                  <button onClick={() => setCustomerCount(Math.max(1, customerCount - 1))} className="rounded-2xl bg-slate-900 p-5 active:scale-95">
                    <Minus size={18} />
                  </button>
                  <span className="w-16 text-center text-5xl font-black">{customerCount}</span>
                  <button onClick={() => setCustomerCount(Math.min(20, customerCount + 1))} className="rounded-2xl bg-slate-900 p-5 active:scale-95">
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
                  <div className="sticky top-0 z-20 space-y-3 border-b border-slate-800 bg-slate-900/95 p-3 backdrop-blur">
                    <div className="relative">
                      <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        className="w-full rounded-2xl border border-slate-800 bg-slate-950 py-4 pl-11 pr-3 text-base font-bold outline-none placeholder:text-slate-600 focus:border-emerald-500"
                        placeholder="Buscar producto para agregar"
                      />
                    </div>
                    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                      <button
                        onClick={() => setActiveCategory("all")}
                        className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black uppercase ${
                          activeCategory === "all"
                            ? "border-emerald-400 bg-emerald-400 text-slate-950"
                            : "border-slate-800 bg-slate-950 text-slate-400"
                        }`}
                      >
                        Todos
                      </button>
                      {productCategories.map((category) => (
                        <button
                          key={category.id}
                          onClick={() => setActiveCategory(category.id)}
                          className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black uppercase ${
                            activeCategory === category.id
                              ? "border-emerald-400 bg-emerald-400 text-slate-950"
                              : "border-slate-800 bg-slate-950 text-slate-400"
                          }`}
                        >
                          {category.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {status === "open" ? (
                  <div className="grid max-h-[58dvh] grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 lg:max-h-[calc(100dvh-190px)] xl:grid-cols-4">
                    {filteredProducts.map((product) => {
                      const variant = product.product_variants?.find((item: any) => item.is_default) || product.product_variants?.[0];
                      return (
                        <button
                          key={product.id}
                          onClick={() => addToPending(product)}
                          className="group flex min-h-32 flex-col justify-between rounded-[1.25rem] border border-slate-800 bg-slate-950 p-3 text-left transition active:scale-[0.98] hover:border-emerald-500/70"
                        >
                          <div>
                            <p className="line-clamp-3 text-sm font-black leading-tight text-slate-100">{product.name}</p>
                            {product.categories?.name && (
                              <p className="mt-2 line-clamp-1 text-[10px] font-black uppercase tracking-wide text-slate-600">
                                {product.categories.name}
                              </p>
                            )}
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <p className="text-base font-black text-emerald-300">{money(Number(variant?.price || product.price || 0))}</p>
                            <span className="rounded-full bg-emerald-400 p-2 text-slate-950">
                              <Plus size={15} />
                            </span>
                          </div>
                        </button>
                      );
                    })}
                    {filteredProducts.length === 0 && (
                      <div className="col-span-full rounded-2xl border border-slate-800 bg-slate-950 p-6 text-center text-sm text-slate-500">
                        No encontre productos con esa busqueda.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 text-sm text-slate-500">
                    Cuenta cerrada. Podes reabrir la mesa si el cliente pide algo mas, o cobrar para liberar la mesa.
                  </div>
                )}
              </div>

              <aside className="flex min-h-[420px] flex-col bg-slate-950">
                <div className="border-b border-slate-800 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black uppercase tracking-wide text-slate-500">Pedido</p>
                      <p className="mt-1 text-3xl font-black text-emerald-300">{money(subtotal)}</p>
                    </div>
                    <span className="rounded-2xl border border-slate-800 bg-slate-900 p-3 text-slate-400">
                      <ShoppingBag size={20} />
                    </span>
                  </div>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto p-4">
                  {!allItems.length && (
                    <div className="flex h-full flex-col items-center justify-center text-center text-sm text-slate-500">
                      <Store className="mb-3 text-slate-700" size={32} />
                      Todavia no hay productos.
                    </div>
                  )}
                  {confirmedItems.map((item, index) => (
                    <div key={`c-${item.variant_id}-${index}`} className="flex items-center gap-2 rounded-2xl bg-slate-900 p-3 text-sm">
                      <Check size={14} className="text-emerald-400" />
                      <span className="min-w-0 flex-1 truncate text-slate-300">{item.name}</span>
                      <span className="text-slate-500">{item.qty}x</span>
                      <span className="w-20 text-right text-slate-400">{money(item.price * item.qty)}</span>
                    </div>
                  ))}
                  {pendingCart.map((item) => (
                    <div key={item.variant_id} className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 flex-1 font-bold text-slate-100">{item.name}</span>
                        <span className="text-right font-black text-slate-200">{money(item.price * item.qty)}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-black uppercase text-emerald-300">Nuevo</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => updatePendingQty(item.variant_id, -1)} className="rounded-xl bg-slate-950 p-3 active:scale-95">
                            <Minus size={13} />
                          </button>
                          <span className="w-8 text-center text-lg font-black">{item.qty}</span>
                          <button onClick={() => updatePendingQty(item.variant_id, 1)} className="rounded-xl bg-slate-950 p-3 active:scale-95">
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="sticky bottom-0 space-y-3 border-t border-slate-800 bg-slate-950 p-4">
                  <div className="flex justify-between text-sm font-black">
                    <span>Total</span>
                    <span>{money(subtotal)}</span>
                  </div>

                  {status === "open" && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={acceptItems}
                        disabled={!pendingCart.length || saving}
                        className="rounded-2xl bg-emerald-500 px-3 py-4 text-sm font-black text-slate-950 disabled:opacity-40"
                      >
                        Aceptar
                      </button>
                      <button
                        onClick={sendToKds}
                        disabled={(!pendingCart.length && !confirmedItems.length) || saving}
                        className="rounded-2xl bg-sky-500 px-3 py-4 text-sm font-black text-slate-950 disabled:opacity-40"
                      >
                        Comandar
                      </button>
                    </div>
                  )}

                  {status === "open" && confirmedItems.length > 0 && pendingCart.length === 0 && (
                    <button
                      onClick={closeTable}
                      disabled={saving}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-3 py-4 text-sm font-black text-slate-950 disabled:opacity-40"
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
