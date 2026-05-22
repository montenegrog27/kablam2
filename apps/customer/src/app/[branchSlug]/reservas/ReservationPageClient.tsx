"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Clock, Loader2, Mail, MapPin, Minus, Phone, Plus, Users } from "lucide-react";
import FontLoader from "@/app/components/FontLoader";
import type { Branding } from "@/types/menu";
import { getBrandFontFamily } from "@/lib/fonts";

type Settings = {
  title?: string | null;
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
  const reservationDate = settings.event_date || "";
  const maxPartySize = Number(settings.max_party_size || 20);
  const minPartySize = Number(settings.min_party_size || 1);
  const capacityPerSlot = Number(settings.capacity_per_slot || 0);

  const slots = useMemo(() => {
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
  }, [capacityPerSlot, reservationDate, reservations, settings.end_time, settings.slot_interval_minutes, settings.start_time]);

  const selectedSlot = slots.find((slot) => slot.time === selectedTime);
  const canSubmit =
    customerName.trim() &&
    customerPhone.replace(/\D/g, "").length >= 10 &&
    selectedTime &&
    (!selectedSlot?.remaining || selectedSlot.remaining >= partySize);

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
        reservationTime: selectedTime,
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
            <p className="mt-1 opacity-70">{selectedTime} · {partySize} personas</p>
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
                <Summary icon={Clock} text={selectedTime} color={primaryColor} />
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
