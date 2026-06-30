"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  Calendar,
  Check,
  Clock,
  Edit3,
  Filter,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";

type Branch = { id: string; name: string; slug: string };

type ReservationEvent = {
  id?: string;
  tenant_id?: string;
  branch_id?: string;
  slug?: string;
  reservation_type?: "standard" | "event";
  enabled: boolean;
  no_time: boolean;
  time_mode: "interval" | "single" | "none";
  title: string;
  description: string;
  hero_image_url: string;
  location_name: string;
  location_address: string;
  event_date: string;
  start_time: string;
  end_time: string;
  slot_interval_minutes: number | string;
  min_party_size: number | string;
  max_party_size: number | string;
  capacity_per_slot: number | string;
  deposit_amount: number | string;
  deposit_alias: string;
  event_badge: string;
  event_subtitle: string;
  event_includes: string[] | string;
  event_theme_color: string;
  hero_layout: "center_bottom" | "center_card" | "left_panel" | "top_logo_bottom_cta" | "poster_clean";
  hero_show_logo: boolean;
  hero_show_title: boolean;
  hero_show_description: boolean;
  hero_show_cta: boolean;
  require_customer_name: boolean;
  show_customer_phone: boolean;
  require_customer_phone: boolean;
  show_customer_email: boolean;
  require_customer_email: boolean;
  show_customer_notes: boolean;
  require_customer_notes: boolean;
  confirmation_title: string;
  confirmation_message: string;
  whatsapp_message_template: string;
  sort_order: number;
  _draft?: boolean;
};

type Reservation = {
  id: string;
  reservation_event_id?: string | null;
  branch_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  party_size: number;
  reservation_date: string;
  reservation_time: string;
  notes?: string | null;
  status: string;
  created_at: string;
};

const DEFAULT_EVENT: ReservationEvent = {
  enabled: true,
  reservation_type: "standard",
  no_time: false,
  time_mode: "interval",
  slug: "",
  title: "Nuevo evento",
  description: "Elegí tu horario y guardá tu lugar.",
  hero_image_url: "",
  location_name: "",
  location_address: "",
  event_date: new Date().toISOString().split("T")[0],
  start_time: "12:00",
  end_time: "15:00",
  slot_interval_minutes: 30,
  min_party_size: 1,
  max_party_size: 20,
  capacity_per_slot: "",
  deposit_amount: "",
  deposit_alias: "",
  event_badge: "",
  event_subtitle: "",
  event_includes: [],
  event_theme_color: "#75aadb",
  hero_layout: "center_bottom",
  hero_show_logo: true,
  hero_show_title: true,
  hero_show_description: true,
  hero_show_cta: true,
  require_customer_name: true,
  show_customer_phone: true,
  require_customer_phone: true,
  show_customer_email: true,
  require_customer_email: false,
  show_customer_notes: true,
  require_customer_notes: false,
  confirmation_title: "Reserva recibida",
  confirmation_message: "Te vamos a contactar por WhatsApp con los detalles.",
  whatsapp_message_template:
    "Hola {nombre}! Gracias por reservar para {titulo}. Fecha: {fecha} {hora}. Personas: {personas}.",
  sort_order: 0,
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  completed: "Completada",
  no_show: "No asistio",
};

function today() {
  return new Date().toISOString().split("T")[0];
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(value?: string) {
  return value?.slice(0, 5) || "-";
}

function formatReservationTime(value?: string, noTime?: boolean) {
  if (noTime || value === "00:00:00" || value === "00:00") return "Sin hora";
  return formatTime(value);
}

function resolveTimeMode(event?: Partial<ReservationEvent> | null): "interval" | "single" | "none" {
  if (!event) return "interval";
  if (event.time_mode === "interval" || event.time_mode === "single" || event.time_mode === "none") {
    return event.time_mode;
  }
  return event.no_time ? "none" : "interval";
}

function timeModeLabel(event?: Partial<ReservationEvent> | null) {
  const mode = resolveTimeMode(event);
  if (mode === "none") return "Sin horario";
  if (mode === "single") return `Entrada ${formatTime(event?.start_time)}`;
  return `${formatTime(event?.start_time)} a ${formatTime(event?.end_time)}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function customerOrigin() {
  if (typeof window === "undefined") return "";
  const configured = process.env.NEXT_PUBLIC_CUSTOMER_URL;
  if (configured) return configured.replace(/\/$/, "");

  const origin = window.location.origin;
  if (origin.includes("localhost:3000")) return origin.replace(":3000", ":3002");
  if (origin.includes("-admin.")) return origin.replace("-admin.", "-customer.");
  if (origin.includes("-admin-")) return origin.replace("-admin-", "-customer-");
  if (origin.includes("admin.")) return origin.replace("admin.", "customer.");
  return origin;
}

function cleanEvent(row: any): ReservationEvent {
  return {
    ...DEFAULT_EVENT,
    ...row,
    slug: row.slug || slugify(row.title || ""),
    time_mode: row.time_mode || (row.no_time ? "none" : "interval"),
    no_time: Boolean(row.no_time || row.time_mode === "none"),
    start_time: formatTime(row.start_time || DEFAULT_EVENT.start_time),
    end_time: formatTime(row.end_time || DEFAULT_EVENT.end_time),
    capacity_per_slot: row.capacity_per_slot ?? "",
    deposit_amount: row.deposit_amount ?? "",
    event_includes: Array.isArray(row.event_includes) ? row.event_includes : [],
    event_theme_color: row.event_theme_color || DEFAULT_EVENT.event_theme_color,
    hero_layout: row.hero_layout || DEFAULT_EVENT.hero_layout,
    hero_show_logo: row.hero_show_logo ?? DEFAULT_EVENT.hero_show_logo,
    hero_show_title: row.hero_show_title ?? DEFAULT_EVENT.hero_show_title,
    hero_show_description: row.hero_show_description ?? DEFAULT_EVENT.hero_show_description,
    hero_show_cta: row.hero_show_cta ?? DEFAULT_EVENT.hero_show_cta,
    require_customer_name: row.require_customer_name ?? DEFAULT_EVENT.require_customer_name,
    show_customer_phone: row.show_customer_phone ?? DEFAULT_EVENT.show_customer_phone,
    require_customer_phone: row.require_customer_phone ?? DEFAULT_EVENT.require_customer_phone,
    show_customer_email: row.show_customer_email ?? DEFAULT_EVENT.show_customer_email,
    require_customer_email: row.require_customer_email ?? DEFAULT_EVENT.require_customer_email,
    show_customer_notes: row.show_customer_notes ?? DEFAULT_EVENT.show_customer_notes,
    require_customer_notes: row.require_customer_notes ?? DEFAULT_EVENT.require_customer_notes,
  };
}

function eventIncludesText(value: string[] | string | undefined) {
  return Array.isArray(value) ? value.join("\n") : String(value || "");
}

function cleanEventIncludes(value: string[] | string | undefined) {
  return eventIncludesText(value)
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function ReservationsPage() {
  const [tenantId, setTenantId] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [events, setEvents] = useState<ReservationEvent[]>([]);
  const [eventId, setEventId] = useState("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const selectedBranch = branches.find((branch) => branch.id === branchId);
  const selectedEvent = events.find((event) => event.id === eventId) || events[0];
  const hubUrl = selectedBranch
    ? `${customerOrigin()}/${selectedBranch.slug}/reservas`
    : "";
  const eventUrl = selectedBranch && selectedEvent?.id && !selectedEvent._draft
    ? `${hubUrl}/${selectedEvent.slug || selectedEvent.id}`
    : "";

  const loadInitial = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id, branch_id")
      .eq("id", user.id)
      .single();

    if (!userRecord?.tenant_id) {
      setLoading(false);
      return;
    }

    setTenantId(userRecord.tenant_id);
    const { data: branchRows } = await supabase
      .from("branches")
      .select("id,name,slug")
      .eq("tenant_id", userRecord.tenant_id)
      .or("active.is.null,active.eq.true")
      .order("name");

    const loadedBranches = (branchRows || []) as Branch[];
    setBranches(loadedBranches);
    setBranchId(userRecord.branch_id || loadedBranches[0]?.id || "");
    setLoading(false);
  }, []);

  const loadBranchData = useCallback(async () => {
    if (!tenantId || !branchId) return;

    const [{ data: eventRows }, { data: reservationRows }] = await Promise.all([
      supabase
        .from("reservation_events")
        .select("*")
        .eq("branch_id", branchId)
        .order("event_date", { ascending: true })
        .order("start_time", { ascending: true }),
      supabase
        .from("reservations")
        .select("*")
        .eq("branch_id", branchId)
        .order("reservation_date", { ascending: false })
        .order("reservation_time", { ascending: false })
        .limit(500),
    ]);

    const loadedEvents = (eventRows || []).map(cleanEvent);
    setEvents(loadedEvents);
    setEventId((current) => {
      if (current && loadedEvents.some((event) => event.id === current)) return current;
      return loadedEvents[0]?.id || "";
    });
    setReservations((reservationRows || []) as Reservation[]);
  }, [branchId, tenantId]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    loadBranchData();
  }, [loadBranchData]);

  const filteredReservations = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return reservations.filter((reservation) => {
      if (eventId && reservation.reservation_event_id !== eventId) return false;
      if (dateFilter && reservation.reservation_date !== dateFilter) return false;
      if (statusFilter && reservation.status !== statusFilter) return false;
      if (!normalizedSearch) return true;
      return [
        reservation.customer_name,
        reservation.customer_phone,
        reservation.customer_email || "",
        reservation.notes || "",
      ].join(" ").toLowerCase().includes(normalizedSearch);
    });
  }, [dateFilter, eventId, reservations, search, statusFilter]);

  const totals = useMemo(() => filteredReservations.reduce(
    (acc, reservation) => {
      acc.people += Number(reservation.party_size || 0);
      acc.count += 1;
      if (reservation.status === "confirmed") acc.confirmed += 1;
      if (reservation.status === "pending") acc.pending += 1;
      return acc;
    },
    { count: 0, people: 0, confirmed: 0, pending: 0 },
  ), [filteredReservations]);

  const createEvent = () => {
    const draft: ReservationEvent = {
      ...DEFAULT_EVENT,
      id: `draft-${crypto.randomUUID()}`,
      title: `Evento ${events.length + 1}`,
      slug: `evento-${events.length + 1}`,
      location_name: selectedBranch?.name || "",
      _draft: true,
      sort_order: events.length,
    };
    setEvents((current) => [...current, draft]);
    setEventId(draft.id || "");
    setDateFilter("");
  };

  const updateEvent = (key: keyof ReservationEvent, value: any) => {
    setEvents((current) =>
      current.map((event) => event.id === selectedEvent?.id ? { ...event, [key]: value } : event),
    );
  };

  const updateTimeMode = (value: ReservationEvent["time_mode"]) => {
    setEvents((current) =>
      current.map((event) =>
        event.id === selectedEvent?.id
          ? {
              ...event,
              time_mode: value,
              no_time: value === "none",
              end_time: value === "single" ? event.start_time || "12:00" : event.end_time,
            }
          : event,
      ),
    );
  };

  const saveEvent = async () => {
    if (!tenantId || !branchId || !selectedEvent) return;
    setSaving(true);
    setMessage("");
    const timeMode = resolveTimeMode(selectedEvent);
    const startTime = timeMode === "none" ? "00:00" : selectedEvent.start_time || "12:00";
    const endTime = timeMode === "interval" ? selectedEvent.end_time || "15:00" : startTime;

    const payload: any = {
      tenant_id: tenantId,
      branch_id: branchId,
      slug: selectedEvent.slug || slugify(selectedEvent.title || "reservas"),
      reservation_type: selectedEvent.reservation_type || "standard",
      enabled: Boolean(selectedEvent.enabled),
      no_time: timeMode === "none",
      time_mode: timeMode,
      title: selectedEvent.title || "Reservas",
      description: selectedEvent.description || null,
      hero_image_url: selectedEvent.hero_image_url || null,
      location_name: selectedEvent.location_name || selectedBranch?.name || null,
      location_address: selectedEvent.location_address || null,
      event_date: selectedEvent.event_date || today(),
      start_time: startTime,
      end_time: endTime,
      slot_interval_minutes: Number(selectedEvent.slot_interval_minutes || 30),
      min_party_size: Number(selectedEvent.min_party_size || 1),
      max_party_size: Number(selectedEvent.max_party_size || 20),
      capacity_per_slot: selectedEvent.capacity_per_slot ? Number(selectedEvent.capacity_per_slot) : null,
      deposit_amount: selectedEvent.deposit_amount ? Number(selectedEvent.deposit_amount) : null,
      deposit_alias: selectedEvent.deposit_alias || null,
      event_badge: selectedEvent.event_badge || null,
      event_subtitle: selectedEvent.event_subtitle || null,
      event_includes: cleanEventIncludes(selectedEvent.event_includes),
      event_theme_color: selectedEvent.event_theme_color || null,
      hero_layout: selectedEvent.hero_layout || "center_bottom",
      hero_show_logo: selectedEvent.hero_show_logo ?? true,
      hero_show_title: selectedEvent.hero_show_title ?? true,
      hero_show_description: selectedEvent.hero_show_description ?? true,
      hero_show_cta: selectedEvent.hero_show_cta ?? true,
      require_customer_name: selectedEvent.require_customer_name ?? true,
      show_customer_phone: selectedEvent.show_customer_phone ?? true,
      require_customer_phone: selectedEvent.require_customer_phone ?? true,
      show_customer_email: selectedEvent.show_customer_email ?? true,
      require_customer_email: selectedEvent.require_customer_email ?? false,
      show_customer_notes: selectedEvent.show_customer_notes ?? true,
      require_customer_notes: selectedEvent.require_customer_notes ?? false,
      confirmation_title: selectedEvent.confirmation_title || null,
      confirmation_message: selectedEvent.confirmation_message || null,
      whatsapp_message_template: selectedEvent.whatsapp_message_template || null,
      sort_order: Number(selectedEvent.sort_order || 0),
      updated_at: new Date().toISOString(),
    };

    if (!selectedEvent._draft) payload.id = selectedEvent.id;

    const { data, error } = await supabase
      .from("reservation_events")
      .upsert(payload)
      .select("*")
      .single();

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Evento guardado");
    await loadBranchData();
    if (data?.id) setEventId(data.id);
  };

  const deleteEvent = async () => {
    if (!selectedEvent?.id) return;
    if (selectedEvent._draft) {
      setEvents((current) => current.filter((event) => event.id !== selectedEvent.id));
      setEventId(events.find((event) => event.id !== selectedEvent.id)?.id || "");
      return;
    }

    const confirmed = window.confirm(`Eliminar el evento "${selectedEvent.title}"? Las reservas existentes quedaran historicas sin evento activo.`);
    if (!confirmed) return;

    const { error } = await supabase.from("reservation_events").delete().eq("id", selectedEvent.id);
    if (error) {
      alert(error.message);
      return;
    }
    await loadBranchData();
  };

  const updateReservationStatus = async (reservationId: string, status: string) => {
    const { error } = await supabase
      .from("reservations")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", reservationId);
    if (error) {
      alert(error.message);
      return;
    }
    setReservations((current) =>
      current.map((reservation) => reservation.id === reservationId ? { ...reservation, status } : reservation),
    );
  };

  if (loading) return <div className="p-6 text-gray-400">Cargando reservas...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Reservas</h1>
          <p className="mt-1 text-sm text-gray-500">Crea varios eventos por sucursal y gestiona las reservas recibidas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="input">
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          {hubUrl && <a href={hubUrl} target="_blank" rel="noreferrer" className="button-secondary">Ver hub</a>}
          {eventUrl && <a href={eventUrl} target="_blank" rel="noreferrer" className="button-secondary">Ver evento</a>}
        </div>
      </div>

      {message && <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-200">{message}</div>}

      <section className="grid gap-6 xl:grid-cols-[320px_1fr_340px]">
        <aside className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-gray-100">Eventos</h2>
            <button onClick={createEvent} className="rounded-lg bg-white p-2 text-gray-950"><Plus size={16} /></button>
          </div>
          <div className="mt-4 space-y-2">
            {events.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-700 px-4 py-8 text-center text-sm text-gray-500">
                Todavia no hay eventos.
              </div>
            )}
            {events.map((event) => (
              <div
                key={event.id}
                className={`overflow-hidden rounded-lg border transition ${
                  event.id === selectedEvent?.id ? "border-white bg-white/10" : "border-gray-800 bg-gray-950 hover:bg-gray-800"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setEventId(event.id || "");
                    setDateFilter(event.event_date || "");
                  }}
                  className="w-full px-3 py-3 text-left"
                >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-gray-100">{event.title}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${event.enabled ? "bg-emerald-500/10 text-emerald-300" : "bg-gray-700 text-gray-400"}`}>
                    {event.enabled ? "Activo" : "Oculto"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{formatDate(event.event_date)} · {timeModeLabel(event)}</p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEventId(event.id || "");
                    setDateFilter(event.event_date || "");
                  }}
                  className="flex w-full items-center justify-center gap-2 border-t border-gray-800 px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-white hover:text-gray-950"
                >
                  <Edit3 size={13} />
                  Editar evento
                </button>
              </div>
            ))}
          </div>
        </aside>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          {!selectedEvent ? (
            <div className="flex h-full min-h-96 items-center justify-center text-center text-gray-500">Creá un evento para empezar.</div>
          ) : (
            <>
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-gray-100">{selectedEvent._draft ? "Crear evento" : "Editar evento"}</h2>
                  <p className="text-xs text-gray-500">
                    {selectedEvent._draft ? "Configura la reserva antes de publicarla." : "Actualiza fecha, horarios, cupos, contenido y mensajes."}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input type="checkbox" checked={Boolean(selectedEvent.enabled)} onChange={(e) => updateEvent("enabled", e.target.checked)} className="h-4 w-4 accent-white" />
                  Visible
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Tipo"><select className="input" value={selectedEvent.reservation_type || "standard"} onChange={(e) => updateEvent("reservation_type", e.target.value)}>
                  <option value="standard">Reserva normal</option>
                  <option value="event">Evento / inscripcion</option>
                </select></Field>
                <Field label="Titulo"><input className="input" value={selectedEvent.title || ""} onChange={(e) => updateEvent("title", e.target.value)} /></Field>
                <Field label="URL del evento"><input className="input" value={selectedEvent.slug || ""} onChange={(e) => updateEvent("slug", slugify(e.target.value))} placeholder="sobremesa-del-mediodia" /></Field>
                <Field label="Imagen hero"><input className="input" value={selectedEvent.hero_image_url || ""} onChange={(e) => updateEvent("hero_image_url", e.target.value)} placeholder="https://..." /></Field>
                <Field label="Formato del hero">
                  <select className="input" value={selectedEvent.hero_layout || "center_bottom"} onChange={(e) => updateEvent("hero_layout", e.target.value)}>
                    <option value="center_bottom">Centro abajo sobre imagen</option>
                    <option value="center_card">Caja oscura centrada</option>
                    <option value="left_panel">Panel negro lateral</option>
                    <option value="top_logo_bottom_cta">Logo arriba, boton abajo</option>
                    <option value="poster_clean">Solo imagen / poster limpio</option>
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-2 md:col-span-2">
                  <ToggleField label="Mostrar logo" checked={selectedEvent.hero_show_logo ?? true} onChange={(value) => updateEvent("hero_show_logo", value)} />
                  <ToggleField label="Mostrar titulo" checked={selectedEvent.hero_show_title ?? true} onChange={(value) => updateEvent("hero_show_title", value)} />
                  <ToggleField label="Mostrar descripcion" checked={selectedEvent.hero_show_description ?? true} onChange={(value) => updateEvent("hero_show_description", value)} />
                  <ToggleField label="Mostrar boton" checked={selectedEvent.hero_show_cta ?? true} onChange={(value) => updateEvent("hero_show_cta", value)} />
                </div>
                {selectedEvent.reservation_type === "event" && (
                  <>
                    <Field label="Badge"><input className="input" value={selectedEvent.event_badge || ""} onChange={(e) => updateEvent("event_badge", e.target.value)} placeholder="5K participativo" /></Field>
                    <Field label="Subtitulo destacado"><input className="input" value={selectedEvent.event_subtitle || ""} onChange={(e) => updateEvent("event_subtitle", e.target.value)} placeholder="Veni con outfit de Argentina" /></Field>
                    <Field label="Color del evento"><input type="color" className="input h-11 p-1" value={selectedEvent.event_theme_color || "#75aadb"} onChange={(e) => updateEvent("event_theme_color", e.target.value)} /></Field>
                  </>
                )}
                <Field label="Lugar"><input className="input" value={selectedEvent.location_name || ""} onChange={(e) => updateEvent("location_name", e.target.value)} /></Field>
                <Field label="Direccion"><input className="input" value={selectedEvent.location_address || ""} onChange={(e) => updateEvent("location_address", e.target.value)} /></Field>
                <Field label="Fecha"><input type="date" className="input" value={selectedEvent.event_date || ""} onChange={(e) => updateEvent("event_date", e.target.value)} /></Field>
                <Field label="Modo de horario">
                  <select className="input" value={resolveTimeMode(selectedEvent)} onChange={(e) => updateTimeMode(e.target.value as ReservationEvent["time_mode"])}>
                    <option value="interval">Horarios con intervalos</option>
                    <option value="single">Un solo horario de entrada</option>
                    <option value="none">Sin horario</option>
                  </select>
                </Field>
                {resolveTimeMode(selectedEvent) === "interval" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Desde"><input type="time" className="input" value={selectedEvent.start_time || ""} onChange={(e) => updateEvent("start_time", e.target.value)} /></Field>
                    <Field label="Hasta"><input type="time" className="input" value={selectedEvent.end_time || ""} onChange={(e) => updateEvent("end_time", e.target.value)} /></Field>
                  </div>
                )}
                {resolveTimeMode(selectedEvent) === "single" && (
                  <Field label="Horario de entrada"><input type="time" className="input" value={selectedEvent.start_time || ""} onChange={(e) => updateEvent("start_time", e.target.value)} /></Field>
                )}
                <div className="grid grid-cols-3 gap-3 md:col-span-2">
                  {resolveTimeMode(selectedEvent) === "interval" && (
                    <Field label="Intervalo min"><input type="number" className="input" value={selectedEvent.slot_interval_minutes || 30} onChange={(e) => updateEvent("slot_interval_minutes", e.target.value)} /></Field>
                  )}
                  <Field label="Min personas"><input type="number" className="input" value={selectedEvent.min_party_size || 1} onChange={(e) => updateEvent("min_party_size", e.target.value)} /></Field>
                  <Field label="Max personas"><input type="number" className="input" value={selectedEvent.max_party_size || 20} onChange={(e) => updateEvent("max_party_size", e.target.value)} /></Field>
                </div>
                <Field label="Cupo por horario"><input type="number" className="input" value={selectedEvent.capacity_per_slot || ""} onChange={(e) => updateEvent("capacity_per_slot", e.target.value)} placeholder="Sin limite" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Sena"><input type="number" className="input" value={selectedEvent.deposit_amount || ""} onChange={(e) => updateEvent("deposit_amount", e.target.value)} /></Field>
                  <Field label="Alias"><input className="input" value={selectedEvent.deposit_alias || ""} onChange={(e) => updateEvent("deposit_alias", e.target.value)} /></Field>
                </div>
                <Field label="Descripcion"><textarea className="input min-h-28 resize-none" value={selectedEvent.description || ""} onChange={(e) => updateEvent("description", e.target.value)} /></Field>
                {selectedEvent.reservation_type === "event" && (
                  <Field label="Que incluye (uno por linea)"><textarea className="input min-h-28 resize-none" value={eventIncludesText(selectedEvent.event_includes)} onChange={(e) => updateEvent("event_includes", e.target.value)} placeholder={"Kit con dorsal y regalos\nCafe libre post Run\nRegalos y sorteos"} /></Field>
                )}
                <div className="md:col-span-2">
                  <div className="mb-3">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-gray-300">Campos del formulario</h3>
                    <p className="mt-1 text-xs text-gray-500">Defini que datos se muestran y cuales son obligatorios para este evento.</p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <ToggleField label="Nombre obligatorio" checked={selectedEvent.require_customer_name ?? true} onChange={(value) => updateEvent("require_customer_name", value)} />
                    <ToggleField label="Mostrar WhatsApp" checked={selectedEvent.show_customer_phone ?? true} onChange={(value) => updateEvent("show_customer_phone", value)} />
                    <ToggleField label="WhatsApp obligatorio" checked={(selectedEvent.show_customer_phone ?? true) && (selectedEvent.require_customer_phone ?? true)} onChange={(value) => updateEvent("require_customer_phone", value)} />
                    <ToggleField label="Mostrar email" checked={selectedEvent.show_customer_email ?? true} onChange={(value) => updateEvent("show_customer_email", value)} />
                    <ToggleField label="Email obligatorio" checked={(selectedEvent.show_customer_email ?? true) && (selectedEvent.require_customer_email ?? false)} onChange={(value) => updateEvent("require_customer_email", value)} />
                    <ToggleField label="Mostrar nota" checked={selectedEvent.show_customer_notes ?? true} onChange={(value) => updateEvent("show_customer_notes", value)} />
                    <ToggleField label="Nota obligatoria" checked={(selectedEvent.show_customer_notes ?? true) && (selectedEvent.require_customer_notes ?? false)} onChange={(value) => updateEvent("require_customer_notes", value)} />
                  </div>
                </div>
                <Field label="Mensaje al confirmar"><textarea className="input min-h-28 resize-none" value={selectedEvent.confirmation_message || ""} onChange={(e) => updateEvent("confirmation_message", e.target.value)} /></Field>
                <Field label="Template WhatsApp (pendiente)"><textarea className="input min-h-32 resize-none" value={selectedEvent.whatsapp_message_template || ""} onChange={(e) => updateEvent("whatsapp_message_template", e.target.value)} /></Field>
                <Field label="Titulo de exito"><input className="input" value={selectedEvent.confirmation_title || ""} onChange={(e) => updateEvent("confirmation_title", e.target.value)} /></Field>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button onClick={saveEvent} disabled={saving} className="button-primary">
                  <Save size={16} />
                  {selectedEvent._draft ? "Crear evento" : "Guardar cambios"}
                </button>
                <button onClick={deleteEvent} disabled={saving} className="button-danger"><Trash2 size={16} /> Eliminar</button>
              </div>
            </>
          )}
        </div>

        <aside className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="font-semibold text-gray-100">Preview</h2>
          <div className="mt-4 overflow-hidden rounded-2xl border border-gray-800 bg-gray-950">
            <div
              className="flex h-56 items-end bg-cover bg-center p-5"
              style={{
                backgroundImage: selectedEvent?.hero_image_url
                  ? `linear-gradient(to top, rgba(0,0,0,.7), transparent), url(${selectedEvent.hero_image_url})`
                  : "linear-gradient(135deg, #111827, #374151)",
              }}
            >
              <span className="rounded-full bg-white px-5 py-2 text-sm font-black text-gray-950">RESERVAR</span>
            </div>
            <div className="p-5">
              <h3 className="text-2xl font-black text-white">{selectedEvent?.title || "Evento"}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-400">{selectedEvent?.description}</p>
              <div className="mt-5 grid grid-cols-2 gap-2 text-sm text-gray-300">
                <div className="rounded-lg bg-white/5 p-3"><Calendar size={16} /> <span className="mt-2 block">{formatDate(selectedEvent?.event_date)}</span></div>
                <div className="rounded-lg bg-white/5 p-3"><Clock size={16} /> <span className="mt-2 block">{timeModeLabel(selectedEvent)}</span></div>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-semibold text-gray-100">Dashboard de reservas</h2>
            <p className="text-xs text-gray-500">Filtra por evento, fecha, estado o cliente.</p>
          </div>
          <button onClick={loadBranchData} className="button-secondary"><RefreshCw size={15} /> Actualizar</button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <Stat icon={Calendar} label="Reservas" value={totals.count} />
          <Stat icon={Users} label="Personas" value={totals.people} />
          <Stat icon={Check} label="Confirmadas" value={totals.confirmed} />
          <Stat icon={Clock} label="Pendientes" value={totals.pending} />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[220px_160px_180px_1fr]">
          <select className="input" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Todos los eventos</option>
            {events.filter((event) => !event._draft).map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
          </select>
          <input type="date" className="input" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input className="input pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, telefono, email o nota" />
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border border-gray-800">
          {filteredReservations.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-14 text-center text-gray-500">
              <Filter size={28} className="mb-3" /> No hay reservas para estos filtros.
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {filteredReservations.map((reservation) => {
                const event = events.find((item) => item.id === reservation.reservation_event_id);
                return (
                  <div key={reservation.id} className="grid gap-4 bg-gray-950 p-4 lg:grid-cols-[1fr_180px_160px_180px] lg:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-100">{reservation.customer_name}</p>
                        <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-gray-400">{STATUS_LABELS[reservation.status] || reservation.status}</span>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">{event?.title || "Evento eliminado"} · {reservation.customer_phone}{reservation.customer_email ? ` · ${reservation.customer_email}` : ""}</p>
                      {reservation.notes && <p className="mt-2 text-sm text-gray-400">{reservation.notes}</p>}
                    </div>
                    <div className="text-sm text-gray-300"><Calendar size={15} className="mb-1" /> {formatDate(reservation.reservation_date)}</div>
                    <div className="text-sm text-gray-300"><Clock size={15} className="mb-1" /> {formatReservationTime(reservation.reservation_time, event?.no_time)} <span className="ml-3 inline-flex items-center gap-1"><Users size={15} /> {reservation.party_size}</span></div>
                    <div className="flex gap-2">
                      <button onClick={() => updateReservationStatus(reservation.id, "confirmed")} className="rounded-lg bg-emerald-500/10 p-2 text-emerald-300 hover:bg-emerald-500/20"><Check size={16} /></button>
                      <button onClick={() => updateReservationStatus(reservation.id, "cancelled")} className="rounded-lg bg-red-500/10 p-2 text-red-300 hover:bg-red-500/20"><X size={16} /></button>
                      <select value={reservation.status} onChange={(e) => updateReservationStatus(reservation.id, e.target.value)} className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-900 px-2 py-2 text-xs text-gray-200">
                        {Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid rgb(55 65 81);
          background: rgb(3 7 18);
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(243 244 246);
          outline: none;
        }
        .input:focus { border-color: rgb(156 163 175); }
        .button-primary, .button-secondary, .button-danger {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          border-radius: 0.5rem;
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
          font-weight: 700;
        }
        .button-primary { background: white; color: rgb(3 7 18); }
        .button-secondary { border: 1px solid rgb(55 65 81); color: rgb(229 231 235); }
        .button-danger { background: rgba(239, 68, 68, .12); color: rgb(252 165 165); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-300">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-white" />
    </label>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
      <Icon size={18} className="text-gray-500" />
      <p className="mt-3 text-2xl font-bold text-gray-100">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
