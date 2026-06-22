"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Clock, Loader2, Mail, MapPin, Minus, Phone, Plus, Users } from "lucide-react";
import FontLoader from "@/app/components/FontLoader";
import type { Branding } from "@/types/menu";
import { getBrandFontFamily } from "@/lib/fonts";

type Settings = {
  title?: string | null;
  reservation_type?: "standard" | "event" | null;
  no_time?: boolean | null;
  description?: string | null;
  hero_image_url?: string | null;
  location_name?: string | null;
  location_address?: string | null;
  event_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  slot_interval_minutes?: number | null;
  min_party_size?: number | null;
  max_party_size?: number | null;
  capacity_per_slot?: number | null;
  deposit_amount?: number | null;
  deposit_alias?: string | null;
  event_badge?: string | null;
  event_subtitle?: string | null;
  event_includes?: string[] | null;
  event_theme_color?: string | null;
  confirmation_title?: string | null;
  confirmation_message?: string | null;
};

type ExistingReservation = {
  party_size: number;
  reservation_date: string;
  reservation_time: string;
  status: string;
};

type Props = {
  branchSlug: string;
  branchName: string;
  eventId?: string;
  settings: Settings;
  branding?: Branding;
  reservations: ExistingReservation[];
};

function normalizeTime(value?: string | null) {
  return value?.slice(0, 5) || "";
}

function formatDate(value?: string | null) {
  if (!value) return "Fecha a confirmar";
  return new Date(`${value}T12:00:00`).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatCurrency(value?: number | null) {
  if (!value) return "";
  return `$${new Intl.NumberFormat("es-AR").format(Math.round(value))}`;
}

function normalizeArgPhone(input: string) {
  let digits = String(input || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("54")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("9")) digits = digits.slice(1);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.startsWith("15")) digits = digits.slice(2);
  if (digits.length !== 10) return null;
  return `549${digits}`;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeFromMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export default function ReservationPageClient({
  branchSlug,
  branchName,
  eventId,
  settings,
  branding,
  reservations,
}: Props) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(1);
  const [partySize, setPartySize] = useState(Number(settings.min_party_size || 1));
  const [selectedTime, setSelectedTime] = useState(normalizeTime(settings.start_time));
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const primaryColor = branding?.primary_color || branding?.brand_color || "#111827";
  const accentColor = branding?.accent_color || branding?.secondary_color || "#E14B25";
  const backgroundColor = branding?.background_color || "#F5F2EB";
  const fontFamily = getBrandFontFamily(branding);
  const title = settings.title || branchName;
  const noTime = Boolean(settings.no_time);
  const reservationDate = settings.event_date || "";
  const maxPartySize = Number(settings.max_party_size || 20);
  const minPartySize = Number(settings.min_party_size || 1);
  const capacityPerSlot = Number(settings.capacity_per_slot || 0);

  const slots = useMemo(() => {
    if (noTime) return [];
    const start = normalizeTime(settings.start_time);
    const end = normalizeTime(settings.end_time);
    const interval = Number(settings.slot_interval_minutes || 30);
    if (!start || !end || interval <= 0) return [];

    const startMinutes = minutesFromTime(start);
    const endMinutes = minutesFromTime(end);
    const options = [];

    for (let minutes = startMinutes; minutes <= endMinutes; minutes += interval) {
      const time = timeFromMinutes(minutes);
      const reservedPeople = reservations
        .filter(
          (reservation) =>
            reservation.reservation_date === reservationDate &&
            normalizeTime(reservation.reservation_time) === time &&
            !["cancelled", "no_show"].includes(reservation.status),
        )
        .reduce((sum, reservation) => sum + Number(reservation.party_size || 0), 0);

      options.push({
        time,
        remaining: capacityPerSlot ? Math.max(0, capacityPerSlot - reservedPeople) : null,
      });
    }

    return options;
  }, [capacityPerSlot, noTime, reservationDate, reservations, settings.end_time, settings.slot_interval_minutes, settings.start_time]);

  const selectedSlot = slots.find((slot) => slot.time === selectedTime);
  const canSubmit =
    customerName.trim() &&
    customerPhone.replace(/\D/g, "").length >= 10 &&
    (noTime || selectedTime) &&
    (noTime || !selectedSlot?.remaining || selectedSlot.remaining >= partySize);

  if (settings.reservation_type === "event") {
    return (
      <EventRegistrationView
        branchSlug={branchSlug}
        branchName={branchName}
        eventId={eventId}
        settings={settings}
        branding={branding}
        reservations={reservations}
      />
    );
  }

  const submit = async () => {
    setError("");
    setSending(true);

    const response = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        branchSlug,
        eventId,
        customerName,
        customerPhone,
        customerEmail,
        partySize,
        reservationDate,
        reservationTime: noTime ? "00:00" : selectedTime,
        notes,
      }),
    });
    const result = await response.json().catch(() => null);
    setSending(false);

    if (!response.ok || !result?.success) {
      setError(result?.error || "No pudimos crear la reserva.");
      return;
    }

    setSuccess(true);
  };

  const scrollToForm = () => contentRef.current?.scrollIntoView({ behavior: "smooth" });

  if (success) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6" style={{ background: backgroundColor, color: primaryColor, fontFamily }}>
        <FontLoader branding={branding} />
        <div className="w-full max-w-md text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full text-white" style={{ background: primaryColor }}>
            <Check size={46} />
          </div>
          <h1 className="mt-7 text-4xl font-bold">{settings.confirmation_title || "Reserva recibida"}</h1>
          <p className="mt-4 text-lg opacity-70">{settings.confirmation_message || "Te vamos a contactar por WhatsApp con los detalles."}</p>
          <div className="mt-8 rounded-2xl p-5 text-left" style={{ background: `${primaryColor}10` }}>
            <p className="font-bold capitalize">{formatDate(reservationDate)}</p>
            <p className="mt-1 opacity-70">{noTime ? "Sin hora" : selectedTime} · {partySize} personas</p>
          </div>
          <button
            onClick={() => {
              setSuccess(false);
              setStep(1);
              setCustomerName("");
              setCustomerPhone("");
              setNotes("");
            }}
            className="mt-8 text-sm font-semibold underline opacity-60 hover:opacity-100"
          >
            Hacer otra reserva
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen" style={{ background: backgroundColor, color: primaryColor, fontFamily }}>
      <FontLoader branding={branding} />

      <section className="relative flex h-dvh min-h-[620px] flex-col overflow-hidden">
        <div className="absolute inset-0">
          {settings.hero_image_url ? (
            <img src={settings.hero_image_url} alt={title} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full" style={{ background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})` }} />
          )}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/10" />
        <div className="relative z-10 mt-auto px-6 pb-10 text-center text-white">
          {branding?.logo_url && <img src={branding.logo_url} alt={branchName} className="mx-auto mb-5 h-20 w-auto object-contain" />}
          <h1 className="text-5xl font-bold leading-none md:text-7xl">{title}</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-7 text-white/80">{settings.description}</p>
          <button
            onClick={scrollToForm}
            className="mt-8 rounded-full px-12 py-4 text-lg font-black tracking-wide shadow-2xl transition hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: primaryColor, color: backgroundColor }}
          >
            RESERVAR
          </button>
        </div>
      </section>

      <section ref={contentRef} className="px-5 py-10">
        <div className="mx-auto max-w-lg">
          <div className="mb-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-widest opacity-50">{settings.location_name || branchName}</p>
            <h2 className="mt-3 text-4xl font-bold capitalize">{formatDate(reservationDate)}</h2>
            {settings.location_address && (
              <p className="mt-3 inline-flex items-center gap-2 text-sm opacity-60">
                <MapPin size={16} /> {settings.location_address}
              </p>
            )}
          </div>

          {step === 1 && (
            <div className="space-y-8">
              <div className="rounded-3xl p-6" style={{ background: `${primaryColor}0D` }}>
                <h3 className="text-2xl font-bold">¿Cuántas personas?</h3>
                <div className="mt-6 flex items-center gap-5">
                  <button
                    onClick={() => setPartySize(Math.max(minPartySize, partySize - 1))}
                    className="flex h-16 w-16 items-center justify-center rounded-full border-2"
                    style={{ borderColor: `${primaryColor}40` }}
                  >
                    <Minus />
                  </button>
                  <div className="flex-1 text-center">
                    <p className="text-7xl font-bold">{partySize}</p>
                    <p className="text-2xl opacity-50">personas</p>
                  </div>
                  <button
                    onClick={() => setPartySize(Math.min(maxPartySize, partySize + 1))}
                    className="flex h-16 w-16 items-center justify-center rounded-full border-2"
                    style={{ borderColor: `${primaryColor}40` }}
                  >
                    <Plus />
                  </button>
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-2xl font-bold">Horario</h3>
                {noTime ? (
                  <div className="rounded-2xl border px-4 py-5 text-center font-bold" style={{ borderColor: `${primaryColor}25`, background: `${primaryColor}0D` }}>
                    Este evento no requiere elegir horario
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map((slot) => {
                      const disabled = slot.remaining !== null && slot.remaining < partySize;
                      return (
                        <button
                          key={slot.time}
                          disabled={disabled}
                          onClick={() => setSelectedTime(slot.time)}
                          className="rounded-2xl border px-3 py-4 text-center font-bold transition disabled:opacity-30"
                          style={{
                            borderColor: selectedTime === slot.time ? primaryColor : `${primaryColor}25`,
                            background: selectedTime === slot.time ? primaryColor : "transparent",
                            color: selectedTime === slot.time ? backgroundColor : primaryColor,
                          }}
                        >
                          {slot.time}
                          {slot.remaining !== null && <span className="mt-1 block text-[10px] opacity-60">{slot.remaining} libres</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {settings.deposit_amount ? (
                <div className="rounded-2xl p-4 text-sm leading-6" style={{ background: `${accentColor}14`, color: primaryColor }}>
                  Seña sugerida: <strong>{formatCurrency(settings.deposit_amount)}</strong>
                  {settings.deposit_alias ? <> · Alias: <strong>{settings.deposit_alias}</strong></> : null}
                </div>
              ) : null}

              <button
                onClick={() => setStep(2)}
                disabled={!selectedTime}
                className="w-full rounded-2xl py-5 text-2xl font-black disabled:opacity-30"
                style={{ background: primaryColor, color: backgroundColor }}
              >
                Continuar
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <Summary icon={Users} text={`${partySize} personas`} color={primaryColor} />
                <Summary icon={Clock} text={noTime ? "Sin hora" : selectedTime} color={primaryColor} />
              </div>

              <Input label="Tu nombre" icon={Users}>
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="field" placeholder="¿Cómo te llamás?" />
              </Input>
              <Input label="WhatsApp" icon={Phone}>
                <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 14))} className="field" placeholder="3794 123456" inputMode="tel" />
              </Input>
              <Input label="Email opcional" icon={Mail}>
                <input value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="field" placeholder="tu@email.com" type="email" />
              </Input>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-widest opacity-50">Nota opcional</span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="field mt-2 min-h-24 resize-none" placeholder="Aclaraciones para la reserva" />
              </label>

              {error && <p className="rounded-xl bg-red-500/10 p-3 text-center text-sm text-red-600">{error}</p>}

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="rounded-2xl border-2 py-5 text-xl font-black"
                  style={{ borderColor: `${primaryColor}30`, color: primaryColor }}
                >
                  Atras
                </button>
                <button
                  onClick={submit}
                  disabled={!canSubmit || sending}
                  className="rounded-2xl py-5 text-xl font-black disabled:opacity-30"
                  style={{ background: primaryColor, color: backgroundColor }}
                >
                  {sending ? <Loader2 className="mx-auto animate-spin" /> : "Confirmar"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <footer className="px-6 py-8 text-center text-xs opacity-40">Powered by Kablam</footer>

      <style jsx>{`
        .field {
          margin-top: 0.5rem;
          width: 100%;
          border-radius: 1rem;
          border: 1px solid ${primaryColor}24;
          background: ${primaryColor}10;
          padding: 1rem 1.125rem;
          color: ${primaryColor};
          font-size: 1.05rem;
          outline: none;
        }
        .field::placeholder {
          color: ${primaryColor}70;
        }
      `}</style>
    </main>
  );
}

function Summary({ icon: Icon, text, color }: { icon: any; text: string; color: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl p-4" style={{ background: `${color}0D` }}>
      <Icon size={18} />
      <span className="font-bold">{text}</span>
    </div>
  );
}

function EventRegistrationView({
  branchSlug,
  branchName,
  eventId,
  settings,
  branding,
  reservations,
}: Props) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    province: "corrientes",
    provinceOther: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const themeColor = settings.event_theme_color || branding?.brand_color || "#75aadb";
  const darkColor = branding?.primary_color || "#0038a8";
  const eventName = settings.title || branchName;
  const eventDate = formatDate(settings.event_date);
  const price = Number(settings.deposit_amount || 0);
  const capacity = Number(settings.capacity_per_slot || 0);
  const registrationCount = reservations
    .filter((reservation) => !["cancelled", "no_show"].includes(reservation.status))
    .reduce((sum, reservation) => sum + Number(reservation.party_size || 0), 0);
  const isFull = capacity > 0 && registrationCount >= capacity;
  const includes = Array.isArray(settings.event_includes)
    ? settings.event_includes
    : [];
  const province =
    form.province === "otro" ? form.provinceOther.trim() : form.province;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (isFull) {
      setError("Las inscripciones ya llegaron al cupo maximo.");
      return;
    }
    if (!form.name.trim()) {
      setError("Ingresa tu nombre completo.");
      return;
    }
    if (!normalizeArgPhone(form.phone)) {
      setError("Ingresa un WhatsApp argentino valido.");
      return;
    }
    if (!isValidEmail(form.email.trim())) {
      setError("Ingresa un email valido.");
      return;
    }
    if (form.province === "otro" && !form.provinceOther.trim()) {
      setError("Escribi tu provincia.");
      return;
    }

    setSubmitting(true);
    const response = await fetch("/api/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        branchSlug,
        eventId,
        customerName: form.name,
        customerPhone: form.phone,
        customerEmail: form.email,
        partySize: 1,
        reservationDate: settings.event_date,
        reservationTime: "00:00",
        province,
        notes: `Provincia: ${province}`,
      }),
    });
    const result = await response.json().catch(() => null);
    setSubmitting(false);

    if (!response.ok || !result?.success) {
      setError(result?.error || "No pudimos registrar la inscripcion.");
      return;
    }

    setSuccess(true);
    setForm({
      name: "",
      phone: "",
      email: "",
      province: "corrientes",
      provinceOther: "",
    });
  };

  return (
    <main className="min-h-screen bg-[#f7f7f4] text-slate-950">
      <FontLoader branding={branding} />

      <section style={{ background: themeColor }}>
        <div className="relative mx-auto aspect-[820/312] w-full max-w-6xl">
          {settings.hero_image_url ? (
            <img src={settings.hero_image_url} alt={eventName} className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-6 text-center text-5xl font-black uppercase text-white">
              {eventName}
            </div>
          )}
        </div>
      </section>

      <section className="text-white" style={{ background: themeColor }}>
        <div className="mx-auto max-w-6xl px-5 py-8 md:px-8 md:py-10">
          <div className="mb-7 flex items-center justify-between gap-4 text-sm font-semibold uppercase tracking-[0.2em]">
            <span>{settings.location_name || branchName}</span>
            <span>{eventDate}</span>
          </div>

          <div className="max-w-3xl">
            {settings.event_badge && (
              <p className="mb-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-bold" style={{ color: darkColor }}>
                {settings.event_badge}
              </p>
            )}
            <h1 className="text-5xl font-black uppercase leading-[0.95] md:text-7xl">
              {eventName}
            </h1>
            {settings.description && (
              <p className="mt-6 max-w-2xl text-xl font-medium leading-relaxed text-white/95">
                {settings.description}
              </p>
            )}
            {settings.event_subtitle && (
              <p className="mt-5 text-2xl font-black">{settings.event_subtitle}</p>
            )}
          </div>

          <div className="mt-8 grid gap-3 pb-2 text-sm font-semibold md:grid-cols-4">
            <div className="border-t border-white/50 pt-3">
              Lugar: {settings.location_name || branchName}
            </div>
            <div className="border-t border-white/50 pt-3">
              {settings.location_address || "Direccion a confirmar"}
            </div>
            <div className="border-t border-white/50 pt-3">
              Entrada: {price ? formatCurrency(price) : "A confirmar"}
            </div>
            <div className="border-t border-white/50 pt-3">
              Cupos: {capacity ? `${registrationCount}/${capacity}` : registrationCount}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-5 py-10 md:grid-cols-[1fr_420px] md:px-8">
        <div className="space-y-6">
          {includes.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="text-2xl font-black">Que incluye</h2>
              <ul className="mt-5 grid gap-3 text-base text-slate-700">
                {includes.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}

          <div className="rounded-lg border bg-white p-6" style={{ borderColor: `${themeColor}66` }}>
            <h2 className="text-2xl font-black">Pago</h2>
            <p className="mt-3 text-slate-700">
              Para confirmar tu lugar, transferi {price ? formatCurrency(price) : "el importe indicado"} y envia el comprobante por WhatsApp.
            </p>
            {settings.deposit_alias && (
              <div className="mt-5 rounded-lg bg-slate-950 px-4 py-3 font-mono text-lg font-bold text-white">
                {settings.deposit_alias}
              </div>
            )}
          </div>
        </div>

        <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60">
          <h2 className="text-2xl font-black">Inscripcion</h2>
          <p className="mt-1 text-sm text-slate-500">
            Te mandamos la info por WhatsApp para que respondas con el comprobante.
          </p>

          {isFull && (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              Las inscripciones ya llegaron al cupo maximo.
            </p>
          )}

          <div className="mt-5 space-y-4">
            <EventInput label="Nombre">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="event-field" placeholder="Nombre y apellido" />
            </EventInput>
            <EventInput label="WhatsApp">
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="event-field" placeholder="Ej: 3794123456" inputMode="tel" />
            </EventInput>
            <EventInput label="Email">
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="event-field" placeholder="tu@email.com" inputMode="email" />
            </EventInput>
            <EventInput label="Provincia">
              <select value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value, provinceOther: e.target.value === "otro" ? form.provinceOther : "" })} className="event-field bg-white">
                <option value="corrientes">Corrientes</option>
                <option value="chaco">Chaco</option>
                <option value="otro">Otro</option>
              </select>
            </EventInput>
            {form.province === "otro" && (
              <EventInput label="Escribi tu provincia">
                <input value={form.provinceOther} onChange={(e) => setForm({ ...form, provinceOther: e.target.value })} className="event-field" placeholder="Provincia" />
              </EventInput>
            )}
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting || isFull} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-4 text-lg font-black text-white disabled:opacity-60" style={{ background: darkColor }}>
            {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
            {isFull ? "Cupos completos" : submitting ? "Registrando..." : "Inscribirme"}
          </button>
        </form>
      </section>

      {success && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-5">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-2xl">
            <Check className="mx-auto h-12 w-12" style={{ color: darkColor }} />
            <h2 className="mt-4 text-2xl font-black">{settings.confirmation_title || "Inscripcion registrada"}</h2>
            <p className="mt-2 text-slate-600">
              {settings.confirmation_message || "Te vamos a contactar por WhatsApp con los detalles."}
            </p>
            <button onClick={() => setSuccess(false)} className="mt-5 rounded-lg border px-4 py-2 font-semibold">
              Cerrar
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .event-field {
          margin-top: 0.25rem;
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid rgb(226 232 240);
          padding: 0.75rem;
          outline: none;
        }
        .event-field:focus {
          border-color: ${darkColor};
        }
      `}</style>
    </main>
  );
}

function Input({ label, icon: Icon, children }: { label: string; icon: any; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-50">
        <Icon size={14} /> {label}
      </span>
      {children}
    </label>
  );
}

function EventInput({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}
