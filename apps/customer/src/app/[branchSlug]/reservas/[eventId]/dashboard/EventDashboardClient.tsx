"use client";

import { useMemo, useState } from "react";

type EventInfo = {
  title: string;
  eventDate?: string | null;
  depositAmount?: number | string | null;
  depositAlias?: string | null;
};

type Reservation = {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  party_size: number;
  reservation_date: string;
  reservation_time: string;
  notes?: string | null;
  status: string;
  metadata?: Record<string, any> | null;
  created_at: string;
};

type Props = {
  branchSlug: string;
  eventId: string;
  event: EventInfo;
};

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCreatedAt(value: string) {
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isPaid(reservation: Reservation) {
  return Boolean(reservation.metadata?.event_dashboard_paid);
}

export default function EventDashboardClient({ branchSlug, eventId, event }: Props) {
  const [accessPassword, setAccessPassword] = useState("");
  const [paidPassword, setPaidPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const summary = useMemo(() => {
    return reservations.reduce(
      (acc, reservation) => {
        acc.total += 1;
        acc.people += Number(reservation.party_size || 0);
        if (isPaid(reservation)) acc.paid += 1;
        else acc.pending += 1;
        return acc;
      },
      { total: 0, people: 0, paid: 0, pending: 0 },
    );
  }, [reservations]);

  const requestDashboard = async (action: string, body: Record<string, any> = {}) => {
    const response = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        branchSlug,
        eventId,
        action,
        password: accessPassword,
        ...body,
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || "No se pudo completar la accion");
    }
    return payload;
  };

  const loadReservations = async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await requestDashboard("list");
      setReservations(payload.reservations || []);
      setAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clave invalida");
    } finally {
      setLoading(false);
    }
  };

  const togglePaid = async (reservation: Reservation) => {
    if (!paidPassword.trim()) {
      setError("Ingresa la clave para modificar pagos.");
      return;
    }

    setBusyId(reservation.id);
    setError("");
    try {
      const payload = await requestDashboard("toggle_paid", {
        reservationId: reservation.id,
        actionPassword: paidPassword,
        paid: !isPaid(reservation),
      });
      setReservations((current) =>
        current.map((item) => (item.id === reservation.id ? payload.reservation : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo modificar el pago");
    } finally {
      setBusyId(null);
    }
  };

  const deleteReservation = async (reservation: Reservation) => {
    if (!deletePassword.trim()) {
      setError("Ingresa la clave para eliminar inscriptos.");
      return;
    }
    const confirmed = window.confirm(`Eliminar la inscripcion de ${reservation.customer_name}?`);
    if (!confirmed) return;

    setBusyId(reservation.id);
    setError("");
    try {
      await requestDashboard("delete", {
        reservationId: reservation.id,
        actionPassword: deletePassword,
      });
      setReservations((current) => current.filter((item) => item.id !== reservation.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setBusyId(null);
    }
  };

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-neutral-950 px-5 py-10 text-white">
        <section className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">Dashboard privado</p>
          <h1 className="mt-4 text-4xl font-black">{event.title}</h1>
          <p className="mt-3 text-sm text-neutral-400">{formatDate(event.eventDate)}</p>

          <form
            className="mt-8 space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            onSubmit={(submitEvent) => {
              submitEvent.preventDefault();
              loadReservations();
            }}
          >
            <label className="block text-sm font-semibold text-neutral-300">Clave de acceso</label>
            <input
              type="password"
              value={accessPassword}
              onChange={(inputEvent) => setAccessPassword(inputEvent.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-emerald-400"
              placeholder="Ingresar clave"
            />
            {error && <p className="text-sm text-red-300">{error}</p>}
            <button
              disabled={loading}
              className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-black text-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Ingresando..." : "Ingresar"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-6 text-white sm:px-6 lg:px-8">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-300">Inscriptos</p>
            <h1 className="mt-3 text-3xl font-black md:text-5xl">{event.title}</h1>
            <p className="mt-2 text-sm text-neutral-400">
              {formatDate(event.eventDate)}
              {event.depositAmount ? ` · ${money.format(Number(event.depositAmount))}` : ""}
              {event.depositAlias ? ` · Alias ${event.depositAlias}` : ""}
            </p>
          </div>
          <button
            onClick={loadReservations}
            disabled={loading}
            className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-neutral-200 hover:bg-white/10 disabled:opacity-60"
          >
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Inscriptos" value={summary.total} />
          <Stat label="Personas" value={summary.people} />
          <Stat label="Pagados" value={summary.paid} tone="emerald" />
          <Stat label="Pendientes" value={summary.pending} tone="amber" />
        </div>

        <div className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:grid-cols-2">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">Clave pago</span>
            <input
              type="password"
              value={paidPassword}
              onChange={(inputEvent) => setPaidPassword(inputEvent.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-emerald-400"
              placeholder="Clave para marcar pagado"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">Clave eliminar</span>
            <input
              type="password"
              value={deletePassword}
              onChange={(inputEvent) => setDeletePassword(inputEvent.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white outline-none focus:border-red-400"
              placeholder="Clave para eliminar"
            />
          </label>
        </div>

        {error && <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>}

        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
          {reservations.length === 0 ? (
            <div className="p-10 text-center text-neutral-400">Todavia no hay inscriptos.</div>
          ) : (
            <div className="divide-y divide-white/10">
              {reservations.map((reservation) => {
                const paid = isPaid(reservation);
                return (
                  <article key={reservation.id} className="grid gap-4 bg-neutral-900/70 p-4 lg:grid-cols-[1.4fr_1fr_180px_160px] lg:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-black">{reservation.customer_name}</h2>
                        <span className={`rounded-full px-2 py-1 text-xs font-black ${paid ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>
                          {paid ? "Pagado" : "Pendiente"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-neutral-400">
                        {reservation.customer_phone}
                        {reservation.customer_email ? ` · ${reservation.customer_email}` : ""}
                      </p>
                      {reservation.notes && <p className="mt-2 text-sm text-neutral-300">{reservation.notes}</p>}
                    </div>

                    <div className="text-sm text-neutral-300">
                      <p>Provincia: {reservation.metadata?.province || "-"}</p>
                      <p>Personas: {reservation.party_size}</p>
                      <p>Alta: {formatCreatedAt(reservation.created_at)}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => togglePaid(reservation)}
                      disabled={busyId === reservation.id}
                      className={`rounded-xl px-4 py-3 text-sm font-black transition disabled:opacity-60 ${
                        paid
                          ? "bg-amber-400/10 text-amber-200 hover:bg-amber-400/20"
                          : "bg-emerald-400 text-black hover:bg-emerald-300"
                      }`}
                    >
                      {paid ? "Marcar pendiente" : "Marcar pagado"}
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteReservation(reservation)}
                      disabled={busyId === reservation.id}
                      className="rounded-xl border border-red-500/30 px-4 py-3 text-sm font-black text-red-200 hover:bg-red-500/10 disabled:opacity-60"
                    >
                      Eliminar
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "emerald" | "amber" }) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "amber"
        ? "text-amber-300"
        : "text-white";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">{label}</p>
      <p className={`mt-2 text-3xl font-black ${toneClass}`}>{value}</p>
    </div>
  );
}
