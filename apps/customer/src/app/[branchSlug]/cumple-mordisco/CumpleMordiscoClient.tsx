"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Benefit = {
  key: string;
  label: string;
  badge: string;
  discount: number;
  description: string;
};

type Lot = {
  key: string;
  name: string;
  basePrice: number;
  capacity: number;
  sold: number;
  available: number | null;
  discount: number;
  finalPrice: number;
  progress?: number;
  isOpen?: boolean;
  isLocked?: boolean;
  isSoldOut?: boolean;
};

type Verification = {
  customer: {
    exists: boolean;
    name: string;
    phone: string;
    orderCount: number;
    firstOrderAt: string | null;
    lastOrderAt: string | null;
    totalSpent: number;
    favoriteBranch?: { name: string; orders: number };
    approximateDistanceKm: number | null;
    frequency: number;
    topPercentile: number;
  };
  benefit: Benefit;
  perks: string[];
  lots: Lot[];
  message: string;
};

type Invitation = {
  invitation_code: string;
  customer_name: string;
  dni?: string | null;
  birthdate?: string | null;
  email?: string | null;
  whatsapp: string;
  benefit_tier: string;
  lot_name?: string;
  price: number;
  entry_numbers?: number[] | null;
  companion_name?: string | null;
  companion_dni?: string | null;
};

type EventInfo = {
  eventDate: string;
  eventTime: string;
  eventLocation: string;
};

const currency = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const defaultEventInfo = {
  eventDate: "6 de junio",
  eventTime: "20hs",
  eventLocation: "Terraza Vera - San Juan 635",
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

function qrCells(seed: string) {
  const chars = seed.split("").map((char) => char.charCodeAt(0));
  return Array.from({ length: 121 }, (_, index) => {
    const value = chars[index % chars.length] || 7;
    const row = Math.floor(index / 11);
    const col = index % 11;
    const finder = (row < 3 && col < 3) || (row < 3 && col > 7) || (row > 7 && col < 3);
    return finder || (value + row * 3 + col * 5 + index) % 4 !== 0;
  });
}

export default function CumpleMordiscoClient({ branchSlug }: { branchSlug: string }) {
  const inviteRef = useRef<HTMLDivElement | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [customerDni, setCustomerDni] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [email, setEmail] = useState("");
  const [companionEnabled, setCompanionEnabled] = useState(false);
  const [companionName, setCompanionName] = useState("");
  const [companionDni, setCompanionDni] = useState("");
  const [showReservationModal, setShowReservationModal] = useState(false);
  const [selectedLotKey, setSelectedLotKey] = useState("lote_1");
  const [loading, setLoading] = useState(false);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [eventInfo, setEventInfo] = useState<EventInfo>(defaultEventInfo);
  const [publicLots, setPublicLots] = useState<Lot[]>([]);
  const [accessMode, setAccessMode] = useState<"ticket" | "free" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const availableLots = verification?.lots.length ? verification.lots : publicLots;
  const selectedLot = accessMode === "ticket"
    ? availableLots.find((lot) => lot.key === selectedLotKey) || availableLots[0]
    : undefined;
  const isFounder = verification?.benefit.key === "founder";
  const qr = useMemo(() => qrCells(invitation?.invitation_code || "MORDISCO"), [invitation]);
  const hasDiscount = Number(verification?.benefit.discount || 0) > 0;
  const savings = selectedLot ? Math.max(selectedLot.basePrice - selectedLot.finalPrice, 0) : 0;
  const attendeeCount = 1 + (companionEnabled ? 1 : 0);
  const reservationTotal = accessMode === "ticket" && selectedLot ? selectedLot.finalPrice * attendeeCount : 0;
  const levelName = verification ? levelDisplayName(verification.benefit.key, verification.benefit.label) : "";
  const impressiveBadge = verification ? getImpressiveBadge(verification) : null;
  const story = verification ? verification.message || buildEmotionalStory(verification) : "";
  const historyStats = verification ? buildHistoryStats(verification) : [];
  const hasFullName = name.trim().split(/\s+/).length >= 2;
  const hasDni = customerDni.replace(/\D/g, "").length >= 7;
  const hasWhatsapp = phone.replace(/\D/g, "").length >= 8;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cumple-mordisco", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "config", branchSlug }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled && data.settings) setEventInfo(data.settings);
        if (!cancelled && Array.isArray(data.lots)) {
          setPublicLots(data.lots);
          setSelectedLotKey(data.lots?.find((lot: Lot) => lot.isOpen)?.key || data.lots?.[0]?.key || "lote_1");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [branchSlug]);

  const verify = async () => {
    if (!hasFullName) {
      setError("Ingresá nombre y apellido para personalizar tu beneficio.");
      return;
    }
    if (!hasWhatsapp) {
      setError("Ingresa un WhatsApp valido para verificar tu categoria.");
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    setInvitation(null);
    try {
      const response = await fetch("/api/cumple-mordisco", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", branchSlug, name, phone }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "No pudimos verificar tus beneficios");
      setVerification(data);
      if (data.settings) setEventInfo(data.settings);
      setSelectedLotKey(data.lots?.find((lot: Lot) => lot.isOpen)?.key || data.lots?.find((lot: Lot) => lot.available !== 0)?.key || data.lots?.[0]?.key || "lote_1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos verificar tus beneficios");
    } finally {
      setLoading(false);
    }
  };

  const purchase = async () => {
    if (!accessMode) {
      setError("Elegi si queres comprar entrada o solo reservar tu lugar.");
      return;
    }
    if (accessMode === "ticket" && !selectedLot) return;
    if (!hasFullName || !hasDni || !hasWhatsapp) {
      setError("Completa nombre, apellido, DNI y WhatsApp para reservar.");
      return;
    }
    if (accessMode === "ticket" && !verification) {
      setError("Verifica tu WhatsApp para ver tu categoria y beneficio antes de reservar.");
      return;
    }
    if (companionEnabled && !companionName.trim()) {
      setError("Completa el nombre del acompañante.");
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/cumple-mordisco", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "purchase",
          branchSlug,
          name,
          phone,
          dni: customerDni,
          birthdate,
          email,
          companionName: companionEnabled ? companionName : "",
          companionDni: companionEnabled ? companionDni : "",
          attendeeCount,
          benefitKey: accessMode === "ticket" ? verification?.benefit.key : "general",
          lotKey: accessMode === "free" ? "sin_entrada" : selectedLot?.key,
          lotName: accessMode === "free" ? "Reserva sin entrada" : selectedLot?.name,
          basePrice: selectedLot?.basePrice || 0,
          discount: 0,
          price: reservationTotal,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "No pudimos generar la invitacion");
      if (accessMode === "ticket") {
        setVerification({
          customer: data.customer,
          benefit: data.benefit,
          perks: data.perks || [],
          lots: data.lots || publicLots,
          message: data.message || "",
        });
      }
      setInvitation(data.invitation);
      setShowReservationModal(false);
      if (data.whatsapp?.skipped) {
        setNotice("La invitacion se genero, pero no se envio WhatsApp porque falta configurar WHATSAPP_TOKEN.");
      } else if (data.whatsapp && data.whatsapp.ok === false) {
        setNotice(`La invitacion se genero, pero WhatsApp no se pudo enviar: ${data.whatsapp.reason || data.whatsapp.status || "error desconocido"}.`);
      }
      setTimeout(() => inviteRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos generar la invitacion");
    } finally {
      setLoading(false);
    }
  };

  const downloadInvitation = () => {
    if (!invitation) return;

    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 760;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, 1200, 760);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(1, "#f2ead9");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1200, 760);

    ctx.fillStyle = "#0a0806";
    ctx.fillRect(42, 42, 1116, 676);
    ctx.fillStyle = "#d7b56d";
    ctx.fillRect(42, 42, 1116, 10);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 28px Arial";
    ctx.fillText("CUMPLE MORDISCO", 92, 118);
    ctx.font = "900 58px Arial";
    ctx.fillText(invitation.customer_name || "Invitado Mordisco", 92, 205);
    ctx.font = "400 30px Arial";
    ctx.fillStyle = "#cfc7ba";
    ctx.fillText(`WhatsApp ${invitation.whatsapp}`, 92, 255);
    ctx.fillText(`Invitacion ${invitation.invitation_code}`, 92, 305);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 40px Arial";
    ctx.fillText("Primer Aniversario Mordisco", 92, 405);
    ctx.font = "700 30px Arial";
    ctx.fillStyle = "#d7b56d";
    ctx.fillText(`Fecha: ${eventInfo.eventDate}`, 92, 465);
    ctx.fillText(`Hora: ${eventInfo.eventTime}`, 92, 515);
    ctx.fillText(`Ubicacion: ${eventInfo.eventLocation}`, 92, 565);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 34px Arial";
    ctx.fillText(`${invitation.lot_name || "Acceso"} · ${currency.format(invitation.price)}`, 92, 645);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(878, 170, 220, 220);
    ctx.fillStyle = "#111111";
    qr.forEach((filled, index) => {
      if (!filled) return;
      const row = Math.floor(index / 11);
      const col = index % 11;
      ctx.fillRect(896 + col * 17, 188 + row * 17, 13, 13);
    });
    ctx.fillStyle = "#d7b56d";
    ctx.font = "700 24px Arial";
    ctx.fillText("Nos vemos en el aniversario.", 820, 455);

    const link = document.createElement("a");
    link.download = `cumple-mordisco-${invitation.invitation_code}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const shareBenefit = async () => {
    const text = invitation
      ? `Tengo mi invitacion ${invitation.invitation_code} para el Primer Aniversario Mordisco.`
      : "Voy al Primer Aniversario Mordisco.";
    if (navigator.share) {
      await navigator.share({ title: "Cumple Mordisco", text, url: window.location.href });
      return;
    }
    await navigator.clipboard.writeText(`${text} ${window.location.href}`);
  };

  return (
    <main className="min-h-screen bg-[#080706] text-white">
      <section
        className="relative min-h-[92vh] overflow-hidden px-5 pb-14 pt-8"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(8,7,6,0.35), rgba(8,7,6,0.92)), url('https://res.cloudinary.com/dsbrnqc5z/image/upload/v1780278318/WhatsApp_Image_2026-05-31_at_22.44.47_jxwoxl.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="relative mx-auto flex max-w-6xl flex-col gap-10">
          <nav className="flex items-center justify-between">
            <Link href={`/${branchSlug}/order`} className="text-sm font-semibold text-white/75">
              Mordisco
            </Link>
            <a href="#beneficios" className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-semibold backdrop-blur">
              Conseguir invitacion
            </a>
          </nav>

          <div className="grid gap-10 pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="max-w-3xl">
              <p className="mb-5 inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/80 backdrop-blur">
                Cumple Mordisco
              </p>
              <h1 className="text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
                Primer Aniversario Mordisco
              </h1>
              <p className="mt-6 max-w-2xl text-xl font-medium leading-relaxed text-white/82 md:text-2xl">
                Veni a festejar nuestro primer año con nosotros.
              </p>
              <p className="mt-6 max-w-xl text-base leading-7 text-white/68">
                Una noche especial. Hamburguesas edicion limitada, sorteos, juegos y Dj en vivo.
                Y el comienzo de una nueva etapa para Mordisco.
              </p>
              <div className="mt-6 grid max-w-2xl gap-2 sm:grid-cols-3">
                <EventPill label="Fecha" value={eventInfo.eventDate} />
                <EventPill label="Hora" value={eventInfo.eventTime} />
                <EventPill label="Ubicacion" value={eventInfo.eventLocation} />
              </div>
              <a href="#beneficios" className="mt-8 inline-flex rounded-full bg-white px-6 py-3 text-sm font-bold text-black transition hover:scale-[1.02]">
                Conseguir invitación
              </a>
            </div>

            <div className="rounded-[28px] border border-white/16 bg-black/36 p-5 shadow-2xl backdrop-blur-xl">
              <div className="rounded-[22px] border border-white/10 bg-white/[0.07] p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-white/50">Acceso privado</p>
                <p className="mt-4 text-3xl font-black">No es una entrada. Es tu lugar en nuestra historia.</p>
                <div className="mt-8 grid grid-cols-3 gap-2 text-center">
                  {["Edicion limitada", "Sorteos", "Comunidad"].map((item) => (
                    <div key={item} className="rounded-2xl bg-white/10 p-3 text-xs font-semibold text-white/75">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="beneficios" className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-5 sm:py-16 lg:grid-cols-[0.58fr_1.42fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#d7b56d]">Reservas</p>
          <h2 className="mt-4 text-4xl font-black tracking-tight">Reserva tu lugar para el cumple</h2>
          <p className="mt-5 text-white/62">
            Dejanos tu nombre, DNI y WhatsApp. Podes comprar entrada para participar de sorteos y beneficios, o solo reservar tu lugar sin beneficios.
          </p>
        </div>

        <div className="rounded-[28px] border border-white/12 bg-white/[0.06] p-4 shadow-2xl backdrop-blur-xl sm:p-5">
          <div className="grid gap-3">
            <label>
              <span className="mb-1 block text-xs font-semibold text-white/55">Nombre y apellido</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-2xl border border-white/12 bg-black/35 px-4 py-3 text-[16px] outline-none" />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-white/55">DNI</span>
              <input value={customerDni} onChange={(e) => setCustomerDni(e.target.value.replace(/\D/g, ""))} className="w-full rounded-2xl border border-white/12 bg-black/35 px-4 py-3 text-[16px] outline-none" />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-white/55">WhatsApp</span>
              <input
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, ""));
                  setVerification(null);
                }}
                placeholder="3794123456"
                className="w-full rounded-2xl border border-white/12 bg-black/35 px-4 py-3 text-[16px] outline-none"
              />
            </label>
          </div>

          <div className="mt-5 rounded-[24px] border border-white/10 bg-black/25 p-4">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/45">Tipo de reserva</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAccessMode("ticket");
                  setVerification(null);
                }}
                className={`rounded-2xl px-4 py-3 text-sm font-black transition ${accessMode === "ticket" ? "bg-[#d7b56d] text-black" : "bg-white/10 text-white"}`}
              >
                Comprar entrada
                <span className="mt-1 block text-[11px] font-semibold normal-case text-gray-900">Sorteos y beneficios</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAccessMode("free");
                  setVerification(null);
                }}
                className={`rounded-2xl px-4 py-3 text-sm font-black transition ${accessMode === "free" ? "bg-[#d7b56d] text-black" : "bg-white/10 text-white"}`}
              >
                Solo reservar
                <span className="mt-1 block text-[11px] font-semibold normal-case opacity-70">Sin beneficios</span>
              </button>
            </div>

            {accessMode === "ticket" ? (
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  onClick={verify}
                  disabled={loading || !hasFullName || !hasDni || !hasWhatsapp}
                  className="rounded-2xl border border-[#d7b56d]/45 bg-[#d7b56d]/10 px-4 py-3 text-sm font-black text-[#f3d994] disabled:opacity-45"
                >
                  {verification ? `Beneficio: ${verification.benefit.label}` : "Ver mi categoria y beneficios"}
                </button>
              </div>
            ) : (
              <p className="mt-4 rounded-2xl bg-white/[0.06] px-4 py-3 text-sm font-semibold leading-6 text-white/65">
                Reservas tu asistencia sin compra de entrada. No se muestran categoria ni beneficios.
              </p>
            )}

            <label className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-white/[0.06] px-4 py-3">
              <span>
                <span className="block text-sm font-black text-white">Agregar acompañante</span>
                <span className="mt-1 block text-xs font-semibold text-white/42">Opcional.</span>
              </span>
              <input
                type="checkbox"
                checked={companionEnabled}
                onChange={(event) => setCompanionEnabled(event.target.checked)}
                className="h-5 w-5 accent-[#d7b56d]"
              />
            </label>

            {companionEnabled && (
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-semibold text-white/55">Nombre del acompañante</span>
                <input value={companionName} onChange={(e) => setCompanionName(e.target.value)} className="w-full rounded-2xl border border-white/12 bg-black/35 px-4 py-3 text-[16px] outline-none" />
              </label>
            )}
          </div>

          {error && <p className="mt-4 rounded-2xl bg-red-500/15 px-4 py-3 text-sm text-red-200">{error}</p>}
          {notice && <p className="mt-4 rounded-2xl bg-amber-500/15 px-4 py-3 text-sm text-amber-100">{notice}</p>}

          <button
            onClick={purchase}
            disabled={loading || !accessMode || (accessMode === "ticket" && (!verification || !selectedLot))}
            className="mt-5 w-full rounded-2xl bg-[#d7b56d] px-5 py-4 text-sm font-black text-black transition hover:bg-[#f0cf88] disabled:opacity-50"
          >
            {loading ? "Reservando..." : "Reservar mi lugar"}
          </button>

          {verification && !invitation && (
            <>
              <BenefitExperience
                verification={verification}
                selectedLot={selectedLot}
                selectedLotKey={selectedLotKey}
                setSelectedLotKey={setSelectedLotKey}
                loading={loading}
                levelName={levelName}
                impressiveBadge={impressiveBadge}
                story={story}
                historyStats={historyStats}
                perks={verification.perks || []}
                hasDiscount={hasDiscount}
                savings={savings}
                attendeeCount={attendeeCount}
                reservationTotal={reservationTotal}
                companionEnabled={companionEnabled}
                setCompanionEnabled={setCompanionEnabled}
                companionName={companionName}
                setCompanionName={setCompanionName}
                companionDni={companionDni}
                setCompanionDni={setCompanionDni}
                openReservationModal={() => {
                  setError("");
                  setShowReservationModal(true);
                }}
              />
            <div className={`hidden mt-6 overflow-hidden rounded-[24px] border p-5 ${isFounder ? "border-[#d7b56d]/70 bg-[#d7b56d]/12" : "border-white/12 bg-black/25"}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/50">{verification.benefit.badge}</p>
                  <h3 className="mt-3 text-2xl font-black">{verification.benefit.label}</h3>
                  <p className="mt-2 text-sm text-white/55">{verification.benefit.description}</p>
                </div>
                <div className="rounded-full bg-white px-3 py-1 text-xs font-black text-black">
                  {verification.benefit.discount > 0 ? `-${verification.benefit.discount}%` : "General"}
                </div>
              </div>

              <p className="mt-5 text-xl font-semibold leading-relaxed text-white/90">{verification.message}</p>

              <div className="mt-5 overflow-hidden rounded-[22px] border border-[#d7b56d]/35 bg-gradient-to-br from-[#d7b56d]/20 via-white/[0.07] to-black/20">
                <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-[#d7b56d]">Beneficio desbloqueado</p>
                    <p className="mt-2 text-2xl font-black leading-tight">
                      {hasDiscount
                        ? `Por ser ${verification.benefit.label}, tenés ${verification.benefit.discount}% OFF en tu invitación.`
                        : "Tenés acceso al Primer Aniversario Mordisco."}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/62">
                      {hasDiscount
                        ? "Este precio especial se aplica automáticamente en todos los lotes disponibles para tu categoría."
                        : "Elegí el lote disponible que prefieras y reservá tu lugar para el evento."}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 text-black shadow-xl sm:min-w-40">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-black/45">Tu descuento</p>
                    <p className="mt-1 text-3xl font-black">{hasDiscount ? `${verification.benefit.discount}%` : "Acceso"}</p>
                    {selectedLot && (
                      <p className="mt-2 text-xs font-semibold text-black/55">
                        {hasDiscount ? `Ahorrás ${currency.format(savings)}` : `Desde ${currency.format(selectedLot.finalPrice)}`}
                      </p>
                    )}
                  </div>
                </div>
                {selectedLot && (
                  <div className="grid grid-cols-3 border-t border-white/10 bg-black/20 text-center">
                    <PriceStep label="Precio lote" value={currency.format(selectedLot.basePrice)} />
                    <PriceStep label="Beneficio" value={hasDiscount ? `-${verification.benefit.discount}%` : "General"} />
                    <PriceStep label="Pagás" value={currency.format(selectedLot.finalPrice)} strong />
                  </div>
                )}
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <Metric label="Pedidos" value={verification.customer.orderCount.toString()} />
                <Metric label="Gasto total" value={currency.format(verification.customer.totalSpent)} />
                <Metric label="Cliente desde" value={formatDate(verification.customer.firstOrderAt)} />
                <Metric label="Sucursal" value={verification.customer.favoriteBranch?.name || "Mordisco"} />
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <p className="text-sm font-semibold text-white/55">Elegí tu lote</p>
                <div className="mt-4 grid gap-3">
                  {verification.lots.map((lot) => (
                    <button
                      key={lot.key}
                      onClick={() => setSelectedLotKey(lot.key)}
                      disabled={lot.available === 0}
                      className={`rounded-2xl border p-4 text-left transition ${
                        selectedLotKey === lot.key ? "border-[#d7b56d] bg-[#d7b56d]/15" : "border-white/10 bg-black/25"
                      } disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-black">{lot.name}</p>
                          <p className="mt-1 text-xs text-white/50">Precio base {currency.format(lot.basePrice)}</p>
                          <p className="mt-1 text-xs text-white/45">
                            {lot.available === null ? "Cupo limitado" : lot.available > 0 ? `` : "Lote agotado"}
                          </p>
                        </div>
                        <div className="text-right">
                          {lot.discount > 0 && <p className="text-xs font-black text-[#d7b56d]">-{lot.discount}%</p>}
                          <p className="text-xl font-black">{currency.format(lot.finalPrice)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-5 flex items-end justify-between gap-4">
                  <div>
                    {/* <p className="text-xs uppercase tracking-[0.2em] text-white/45">Incluye ingreso y sorteos</p> */}
                    <p className="text-2xl font-black">{selectedLot ? currency.format(selectedLot.finalPrice) : "-"}</p>
                  </div>
                  <button onClick={purchase} disabled={loading || !selectedLot} className="rounded-full bg-white px-5 py-3 text-sm font-black text-black">
                    Adquirir invitación
                  </button>
                </div>
              </div>
            </div>
            </>
          )}
        </div>
      </section>

      {showReservationModal && verification && selectedLot && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 py-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-lg overflow-hidden rounded-[30px] bg-[#0d0a08] text-white shadow-2xl">
            <div className="border-b border-white/10 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-[#d7b56d]">Confirmar reserva</p>
                  <h3 className="mt-2 text-2xl font-black">Resumen de tu invitación</h3>
                </div>
                <button onClick={() => setShowReservationModal(false)} className="rounded-full bg-white/10 px-3 py-2 text-sm font-black text-white">
                  X
                </button>
              </div>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-[22px] bg-white/[0.07] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-black">{name}</p>
                    <p className="mt-1 text-xs font-semibold text-white/45">{verification.benefit.label} · {selectedLot.name}</p>
                    {companionEnabled && (
                      <p className="mt-2 text-xs font-semibold text-[#d7b56d]">Acompañante: {companionName || "Sin completar"}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-[#d7b56d]">{currency.format(reservationTotal)}</p>
                    <p className="mt-1 text-[11px] font-semibold text-white/42">
                      {attendeeCount} {attendeeCount === 1 ? "entrada" : "entradas"} x {currency.format(selectedLot.finalPrice)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-xs font-semibold text-white/50">DNI</span>
                  <input
                    value={customerDni}
                    onChange={(event) => setCustomerDni(event.target.value.replace(/\D/g, ""))}
                    className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-[16px] outline-none"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-semibold text-white/50">Fecha de cumpleaños</span>
                  <input
                    type="date"
                    value={birthdate}
                    onChange={(event) => setBirthdate(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-[16px] outline-none"
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="mb-1 block text-xs font-semibold text-white/50">Correo electrónico</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-[16px] outline-none"
                  />
                </label>
              </div>

              <p className="rounded-2xl bg-[#d7b56d]/12 px-4 py-3 text-xs font-semibold leading-5 text-[#f8ddb0]">
                Al confirmar, te enviamos por WhatsApp las instrucciones para transferir y reservar tu lugar.
              </p>

              <button onClick={purchase} disabled={loading} className="w-full rounded-full bg-white px-5 py-4 text-sm font-black text-black transition hover:bg-[#f6ead2] disabled:opacity-50">
                {loading ? "Generando invitación..." : "Confirmar y recibir WhatsApp"}
              </button>
            </div>
          </div>
        </div>
      )}

      {invitation && (
        <section ref={inviteRef} className="mx-auto max-w-3xl px-5 pb-20">
          {verification && (
            <div className="mb-6 overflow-hidden rounded-[32px] border border-[#d7b56d]/35 bg-white text-black shadow-2xl">
              <div className="bg-[linear-gradient(180deg,#ffffff,#f4eee4)] p-6 text-center">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-black/45">Tu categoria Mordisco</p>
                <h2 className="mt-3 text-5xl font-black uppercase leading-none tracking-normal">{levelName}</h2>
                <p className="mx-auto mt-4 max-w-md text-sm font-bold leading-6 text-black/58">
                  {story}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-px bg-black/10 text-center sm:grid-cols-4">
                <ResultMetric label="Pedidos" value={verification.customer.orderCount.toString()} />
                <ResultMetric label="Gastado" value={currency.format(verification.customer.totalSpent)} />
                <ResultMetric label="Desde" value={formatDate(verification.customer.firstOrderAt)} />
                <ResultMetric label="Sucursal" value={verification.customer.favoriteBranch?.name || "Mordisco"} />
              </div>
              {verification.perks.length > 0 && (
                <div className="bg-black p-5 text-white">
                  <p className="text-center text-xs font-black uppercase tracking-[0.22em] text-[#d7b56d]">Tu beneficio por esta categoria</p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {verification.perks.map((perk) => (
                      <div key={perk} className="rounded-2xl bg-white/[0.08] px-4 py-3 text-sm font-bold text-white/92">
                        {perk}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="rounded-[32px] border border-[#d7b56d]/35 bg-[#120f0b] p-6 shadow-2xl">
            <p className="text-center text-sm font-semibold uppercase tracking-[0.24em] text-[#d7b56d]">Invitacion emitida</p>
            <h2 className="mt-4 text-center text-4xl font-black">Nos vemos en el aniversario.</h2>
            <p className="mx-auto mt-4 max-w-md text-center text-white/62">
              Y gracias por formar parte de este primer año.
            </p>

            <div className="mt-8 rounded-[24px] bg-white p-5 text-black">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-black/45">Cumple Mordisco</p>
                  <p className="mt-2 text-2xl font-black">{invitation.customer_name}</p>
                  <p className="text-sm text-black/55">WhatsApp {invitation.whatsapp}</p>
                  <p className="mt-4 text-sm font-bold">Invitacion #{invitation.invitation_code}</p>
                  {invitation.entry_numbers && invitation.entry_numbers.length > 0 && (
                    <div className="mt-4 rounded-2xl bg-[#d7b56d] px-4 py-3 text-black">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-black/55">Numeros para sorteo</p>
                      <p className="mt-1 text-3xl font-black">{invitation.entry_numbers.join(" · ")}</p>
                    </div>
                  )}
                  <div className="mt-5 space-y-1 text-sm font-semibold text-black/70">
                    <p>Fecha: {eventInfo.eventDate}</p>
                    <p>Hora: {eventInfo.eventTime}</p>
                    <p>Ubicacion: {eventInfo.eventLocation}</p>
                  </div>
                </div>
                <div className="grid h-28 w-28 grid-cols-11 gap-[2px] rounded-xl bg-white p-2 shadow-inner">
                  {qr.map((filled, index) => (
                    <span key={index} className={filled ? "rounded-[1px] bg-black" : "rounded-[1px] bg-white"} />
                  ))}
                </div>
              </div>
              <div className="mt-5 rounded-2xl bg-black px-4 py-3 text-white">
                <p className="text-xs text-white/55">Acceso</p>
                <p className="text-lg font-black">{currency.format(invitation.price)} · {invitation.lot_name || invitation.benefit_tier}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <button onClick={downloadInvitation} className="rounded-full bg-white px-4 py-3 text-sm font-black text-black">Descargar invitacion</button>
              <button onClick={shareBenefit} className="rounded-full border border-white/20 px-4 py-3 text-sm font-black">Compartir beneficio</button>
              <Link href={`/${branchSlug}/order`} className="rounded-full border border-white/20 px-4 py-3 text-center text-sm font-black">Volver al inicio</Link>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
      <p className="text-xs text-white/45">{label}</p>
      <p className="mt-1 text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-3 py-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-black/38">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-black">{value}</p>
    </div>
  );
}

function BenefitExperience({
  verification,
  selectedLot,
  selectedLotKey,
  setSelectedLotKey,
  loading,
  levelName,
  impressiveBadge,
  story,
  historyStats,
  perks,
  hasDiscount,
  savings,
  attendeeCount,
  reservationTotal,
  companionEnabled,
  setCompanionEnabled,
  companionName,
  setCompanionName,
  companionDni,
  setCompanionDni,
  openReservationModal,
}: {
  verification: Verification;
  selectedLot?: Lot;
  selectedLotKey: string;
  setSelectedLotKey: (key: string) => void;
  loading: boolean;
  levelName: string;
  impressiveBadge: { icon: string; label: string } | null;
  story: string;
  historyStats: Array<{ icon: string; value: string; numeric?: number; suffix?: string; label: string }>;
  perks: string[];
  hasDiscount: boolean;
  savings: number;
  attendeeCount: number;
  reservationTotal: number;
  companionEnabled: boolean;
  setCompanionEnabled: (value: boolean) => void;
  companionName: string;
  setCompanionName: (value: string) => void;
  companionDni: string;
  setCompanionDni: (value: string) => void;
  openReservationModal: () => void;
}) {
  return (
    <div className="anniversary-reveal mt-6 overflow-hidden rounded-[32px] bg-[#070504] text-white shadow-[0_28px_90px_rgba(0,0,0,0.45)] sm:rounded-[36px]">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,59,48,0.26),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.045),transparent_30%)]" />
        <div className="pointer-events-none absolute left-1/2 top-10 h-48 w-48 -translate-x-1/2 rounded-full border border-white/10" />

        <section className="relative px-4 pb-8 pt-8 text-center sm:px-8 sm:pb-12 sm:pt-12">
          <p className="fade-up text-[10px] font-black uppercase tracking-[0.34em] text-white/38">Primer Aniversario Mordisco</p>
          <h3 className="fade-up level-glow mx-auto mt-3 max-w-[12ch] break-words text-[3.25rem] font-black uppercase leading-[0.8] tracking-normal text-white sm:text-[5.7rem]">
            {levelName}
          </h3>
          {impressiveBadge && (
            <div className="fade-up mx-auto mt-6 inline-flex max-w-full items-center gap-3 rounded-full bg-white px-4 py-3 text-black shadow-[0_22px_70px_rgba(255,255,255,0.16)] transition duration-300 hover:scale-[1.02] sm:mt-8 sm:px-5">
              <span className="text-xl">{impressiveBadge.icon}</span>
              <span className="text-xs font-black uppercase tracking-[0.12em]">{impressiveBadge.label}</span>
            </div>
          )}
          <div className="fade-up mx-auto mt-5 max-w-sm overflow-hidden rounded-[28px] bg-white text-black shadow-[0_24px_80px_rgba(255,255,255,0.18)] sm:mt-7">
            <div className="bg-[radial-gradient(circle_at_top_left,rgba(255,59,48,0.22),transparent_42%),linear-gradient(180deg,#ffffff,#f5efe5)] px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-black/42">Beneficio desbloqueado</p>
              <div className="mt-2 flex items-end justify-center gap-3">
                <p className="text-[3.1rem] font-black leading-none tracking-normal text-black">
                  {hasDiscount ? `${verification.benefit.discount}%` : "VIP"}
                </p>
                <p className="pb-1 text-2xl font-black leading-none text-[#ff3b30]">{hasDiscount ? "OFF" : "ACCESS"}</p>
              </div>
              <p className="mt-3 text-xs font-black uppercase tracking-[0.12em] text-black/46">
                {hasDiscount ? `Por ser ${levelName}` : "Invitación habilitada"}
              </p>
            </div>
            {selectedLot && (
              <div className="grid grid-cols-2 bg-black text-white">
                <div className="border-r border-white/10 px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/36">Lote</p>
                  <p className="mt-1 text-sm font-black">{currency.format(selectedLot.basePrice)}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#d7b56d]">Tu precio</p>
                  <p className="mt-1 text-sm font-black">{currency.format(selectedLot.finalPrice)}</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="relative space-y-4 px-3 pb-4 sm:space-y-5 sm:px-6 sm:pb-6">
          <section className="fade-up rounded-[26px] bg-white/[0.07] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl sm:rounded-[30px] sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#d7b56d]">Tu historia</p>
            <p className="mt-4 whitespace-pre-line text-base font-semibold leading-7 text-white/90 sm:text-xl sm:leading-9">{story}</p>
          </section>

          <section className="fade-up rounded-[26px] bg-[#11100e] p-4 sm:rounded-[30px] sm:p-5">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-white/36">Comunidad</p>
                <h4 className="mt-2 text-xl font-black text-white sm:text-2xl">Tus señales Mordisco</h4>
              </div>
              <p className="hidden max-w-36 text-right text-xs font-semibold leading-5 text-white/40 sm:block">
                Datos que explican tu lugar en este aniversario.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {historyStats.map((stat) => (
                <StoryStat key={stat.label} {...stat} />
              ))}
            </div>
          </section>

          <section className="fade-up overflow-hidden rounded-[34px] bg-white text-black shadow-[0_28px_80px_rgba(255,255,255,0.13)]">
            <div className="bg-[radial-gradient(circle_at_top_left,rgba(255,59,48,0.18),transparent_36%),linear-gradient(180deg,#ffffff,#f4eee4)] p-6 text-center sm:p-8">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-black/42">Beneficio desbloqueado</p>
              <p className="mt-4 text-[4.8rem] font-black leading-none tracking-normal text-black sm:text-[6.2rem]">
                {hasDiscount ? `${verification.benefit.discount}%` : "VIP"}
              </p>
              <p className="text-3xl font-black leading-none text-[#ff3b30]">{hasDiscount ? "OFF" : "ACCESS"}</p>
              <p className="mx-auto mt-5 max-w-sm text-sm font-bold leading-6 text-black/58">
                {hasDiscount
                  ? `Precio privado por pertenecer a ${verification.benefit.label}. Tu historia con Mordisco ya tiene beneficio aplicado.`
                  : "Acceso reservado para vivir el primer aniversario desde adentro."}
              </p>
              {perks.length > 0 && (
                <div className="mx-auto mt-6 max-w-md rounded-[26px] bg-black px-4 py-4 text-left text-white shadow-[0_20px_55px_rgba(0,0,0,0.18)]">
                  <p className="text-center text-[10px] font-black uppercase tracking-[0.24em] text-[#d7b56d]">Tu acceso incluye</p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {perks.map((perk) => (
                      <div key={perk} className="rounded-2xl bg-white/[0.08] px-3 py-3 text-sm font-bold leading-5 text-white/92">
                        {perk}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {selectedLot && (
              <div className="grid gap-4 border-t border-black/8 bg-black px-5 py-5 text-center text-white sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
                <PriceMoment label="Precio lote" value={currency.format(selectedLot.basePrice)} muted strike={hasDiscount} />
                <span className="hidden text-2xl font-black text-white/24 sm:block">→</span>
                <PriceMoment label="Tu precio" value={currency.format(selectedLot.finalPrice)} highlight />
                <span className="hidden text-2xl font-black text-white/24 sm:block">→</span>
                <PriceMoment label={hasDiscount ? `Por ser ${levelName}` : "Entrada"} value={hasDiscount ? `Ahorrás ${currency.format(savings)}` : "Lugar reservado"} />
              </div>
            )}
          </section>

          <section className="fade-up rounded-[30px] bg-white/[0.065] p-5 backdrop-blur-xl sm:p-6">
            <div className="mb-5">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-white/36">Reservá tu lugar</p>
              <div className="mt-2 flex items-end justify-between gap-4">
                <h4 className="text-2xl font-black text-white">Elegí el lote activo</h4>
                {selectedLot && (
                  <div className="text-right">
                    <p className="text-2xl font-black text-[#d7b56d]">{currency.format(reservationTotal)}</p>
                    <p className="mt-1 text-[11px] font-semibold text-white/42">
                      {attendeeCount} {attendeeCount === 1 ? "entrada" : "entradas"}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-3">
              {verification.lots.map((lot, index) => (
                <LotStepCard
                  key={lot.key}
                  lot={lot}
                  index={index}
                  selected={selectedLotKey === lot.key}
                  onSelect={() => setSelectedLotKey(lot.key)}
                />
              ))}
            </div>

            <div className="mt-4 rounded-[24px] bg-black/28 p-4">
              <label className="flex items-center justify-between gap-4">
                <span>
                  <span className="block text-sm font-black text-white">Agregar acompañante</span>
                  <span className="mt-1 block text-xs font-semibold text-white/42">Sumá un invitado a tu reserva.</span>
                </span>
                <input
                  type="checkbox"
                  checked={companionEnabled}
                  onChange={(event) => setCompanionEnabled(event.target.checked)}
                  className="h-5 w-5 accent-[#ff3b30]"
                />
              </label>

              {companionEnabled && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className="mb-1 block text-xs font-semibold text-white/45">Nombre del acompañante</span>
                    <input
                      value={companionName}
                      onChange={(event) => setCompanionName(event.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-[16px] text-white outline-none"
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-semibold text-white/45">DNI del acompañante</span>
                    <input
                      value={companionDni}
                      onChange={(event) => setCompanionDni(event.target.value.replace(/\D/g, ""))}
                      className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-[16px] text-white outline-none"
                    />
                  </label>
                </div>
              )}
              {selectedLot && (
                <div className="mt-4 rounded-2xl bg-white/[0.06] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-white/45">Total a transferir</span>
                    <span className="text-lg font-black text-[#d7b56d]">{currency.format(reservationTotal)}</span>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold text-white/38">
                    {attendeeCount} {attendeeCount === 1 ? "entrada" : "entradas"} x {currency.format(selectedLot.finalPrice)}
                  </p>
                </div>
              )}
            </div>

            <button onClick={openReservationModal} disabled={loading || !selectedLot || !selectedLot.isOpen} className="mt-5 w-full rounded-full bg-white px-5 py-4 text-sm font-black text-black shadow-[0_18px_50px_rgba(255,255,255,0.14)] transition duration-300 hover:scale-[1.01] hover:bg-[#f6ead2] disabled:opacity-50">
              Reservar mi lugar
            </button>
          </section>
        </div>
      </div>
      <style>{`
        .anniversary-reveal {
          animation: reveal-card 620ms cubic-bezier(.2,.8,.2,1) both;
        }
        .fade-up {
          animation: fade-up 720ms cubic-bezier(.2,.8,.2,1) both;
        }
        .level-glow {
          text-shadow: 0 0 34px rgba(255, 59, 48, 0.42), 0 10px 55px rgba(215, 181, 109, 0.2);
        }
        @keyframes reveal-card {
          from { opacity: 0; transform: translateY(22px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function BenefitExperienceLegacy({
  verification,
  selectedLot,
  selectedLotKey,
  setSelectedLotKey,
  purchase,
  loading,
  levelName,
  impressiveBadge,
  story,
  historyStats,
  hasDiscount,
  savings,
}: {
  verification: Verification;
  selectedLot?: Lot;
  selectedLotKey: string;
  setSelectedLotKey: (key: string) => void;
  purchase: () => void;
  loading: boolean;
  levelName: string;
  impressiveBadge: { icon: string; label: string } | null;
  story: string;
  historyStats: Array<{ icon: string; value: string; numeric?: number; suffix?: string; label: string }>;
  hasDiscount: boolean;
  savings: number;
}) {
  return (
    <div className="anniversary-reveal mt-6 overflow-hidden rounded-[34px] border border-[#ff3b30]/35 bg-[#0c0807] shadow-2xl">
      <div className="relative overflow-hidden p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[#ff3b30]/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-[#d7b56d]/20 blur-3xl" />

        <div className="relative">
          <p className="fade-up text-[11px] font-black uppercase tracking-[0.28em] text-white/45">Primer Aniversario Mordisco</p>
          <p className="fade-up mt-5 text-sm font-semibold text-white/58">Tu nivel de Mordiscolover es:</p>
          <h3 className="fade-up level-glow mt-1 break-words text-[3.3rem] font-black uppercase leading-[0.82] tracking-normal text-white sm:text-[5rem]">
            {levelName}
          </h3>

          {impressiveBadge && (
            <div className="fade-up mt-6 inline-flex max-w-full items-center gap-3 rounded-full border border-white/14 bg-white px-4 py-3 text-black shadow-[0_18px_60px_rgba(255,255,255,0.18)] transition hover:scale-[1.02]">
              <span className="text-2xl">{impressiveBadge.icon}</span>
              <span className="text-sm font-black uppercase tracking-normal">{impressiveBadge.label}</span>
            </div>
          )}

          <div className="fade-up mt-6 rounded-[26px] border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
            <p className="whitespace-pre-line text-lg font-semibold leading-8 text-white/88">{story}</p>
          </div>

          <div className="fade-up mt-5 overflow-hidden rounded-[28px] border border-[#ff3b30]/35 bg-gradient-to-br from-[#ff3b30]/26 via-[#d7b56d]/12 to-white/[0.04]">
            <div className="p-5 text-center">
              <p className="text-xs font-black uppercase tracking-[0.26em] text-[#ffb5ae]">Tu beneficio</p>
              <p className="mt-2 text-[4.2rem] font-black leading-none text-white drop-shadow-[0_0_26px_rgba(255,59,48,0.45)] sm:text-[5rem]">
                {hasDiscount ? `${verification.benefit.discount}% OFF` : "ACCESO"}
              </p>
              <p className="mt-2 text-sm font-semibold text-white/70">
                {hasDiscount ? `Precio exclusivo para ${verification.benefit.label}.` : "Acceso especial al aniversario."}
              </p>
            </div>

            {selectedLot && (
              <div className="grid items-center gap-2 border-t border-white/10 bg-black/24 p-5 text-center sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
                <PriceMoment label="Precio lote" value={currency.format(selectedLot.basePrice)} muted strike={hasDiscount} />
                <span className="hidden text-2xl font-black text-white/30 sm:block">→</span>
                <PriceMoment label="Tu precio" value={currency.format(selectedLot.finalPrice)} highlight />
                <span className="hidden text-2xl font-black text-white/30 sm:block">→</span>
                <PriceMoment label={hasDiscount ? `Por ser ${levelName}` : "Entrada"} value={hasDiscount ? `Ahorrás ${currency.format(savings)}` : "Disponible"} />
              </div>
            )}
          </div>

          <div className="fade-up mt-6">
            <p className="mb-3 text-xs font-black uppercase tracking-[0.22em] text-white/42">Tu historia con Mordisco</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {historyStats.map((stat) => (
                <StoryStat key={stat.label} {...stat} />
              ))}
            </div>
          </div>



          <div className="fade-up mt-6 rounded-[26px] border border-white/10 bg-white/[0.06] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-white/42">Proximo paso</p>
                <p className="mt-1 text-lg font-black text-white">Elegí tu lote</p>
              </div>
              {selectedLot && <p className="text-right text-2xl font-black text-[#d7b56d]">{currency.format(selectedLot.finalPrice)}</p>}
            </div>
            <div className="mt-4 grid gap-3">
              {verification.lots.map((lot, index) => (
                <LotStepCard
                  key={lot.key}
                  lot={lot}
                  index={index}
                  selected={selectedLotKey === lot.key}
                  onSelect={() => setSelectedLotKey(lot.key)}
                />
              ))}
            </div>
            <button onClick={purchase} disabled={loading || !selectedLot || !selectedLot.isOpen} className="mt-5 w-full rounded-full bg-white px-5 py-4 text-sm font-black text-black transition hover:scale-[1.01] disabled:opacity-50">
              {loading ? "Generando invitación..." : "Comprar invitación"}
            </button>
          </div>
        </div>
      </div>
      <style>{`
        .anniversary-reveal {
          animation: reveal-card 520ms ease-out both;
        }
        .fade-up {
          animation: fade-up 620ms ease-out both;
        }
        .fade-up:nth-child(2) { animation-delay: 80ms; }
        .fade-up:nth-child(3) { animation-delay: 140ms; }
        .level-glow {
          text-shadow: 0 0 34px rgba(255, 59, 48, 0.42), 0 10px 55px rgba(215, 181, 109, 0.2);
        }
        @keyframes reveal-card {
          from { opacity: 0; transform: translateY(22px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

void BenefitExperienceLegacy;

function PriceMoment({ label, value, highlight = false, muted = false, strike = false }: { label: string; value: string; highlight?: boolean; muted?: boolean; strike?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/42">{label}</p>
      <p className={`${highlight ? "text-3xl text-[#d7b56d]" : "text-lg text-white"} mt-1 font-black ${muted ? "text-white/45" : ""} ${strike ? "line-through decoration-[#ff3b30] decoration-2" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function LotStepCard({ lot, index, selected, onSelect }: { lot: Lot; index: number; selected: boolean; onSelect: () => void }) {
  const soldOut = Boolean(lot.isSoldOut || lot.available === 0);
  const locked = Boolean(lot.isLocked);
  const open = Boolean(lot.isOpen);
  const disabled = soldOut || locked;
  const progress = lot.capacity > 0 ? Math.min(100, Math.max(0, lot.progress ?? Math.round((lot.sold / lot.capacity) * 100))) : 0;
  const status = soldOut
    ? "Agotado"
    : locked
      ? "Se habilita al agotar el lote anterior"
      : open
        ? "Lote habilitado ahora"
        : "Disponible";

  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`group relative overflow-hidden rounded-[24px] p-4 text-left transition duration-300 active:scale-[0.99] ${
        selected && open
          ? "bg-white text-black shadow-[0_18px_50px_rgba(255,255,255,0.14)]"
          : "bg-black/30 text-white hover:bg-white/[0.08]"
      } ${disabled ? "cursor-not-allowed opacity-58" : "hover:-translate-y-0.5"}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${selected && open ? "bg-black/8 text-black/55" : "bg-white/10 text-white/55"}`}>
              Lote {index + 1}
            </span>
            {soldOut && <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase text-black">🔒 Agotado</span>}
            {locked && <span className="rounded-full border border-white/12 bg-white/8 px-2 py-1 text-[10px] font-black uppercase text-white/50">🔒 Próximo</span>}
            {open && !soldOut && <span className="rounded-full bg-[#ff3b30] px-2 py-1 text-[10px] font-black uppercase text-white">Abierto</span>}
          </div>
          <p className={`mt-3 text-base font-black ${selected && open ? "text-black" : "text-white"}`}>{lot.name}</p>
          <p className={`mt-1 text-xs font-semibold ${selected && open ? "text-black/48" : "text-white/45"}`}>{status}</p>
        </div>
        <div className="text-right">
          {lot.discount > 0 && <p className="text-xs font-black text-[#ff8b80]">-{lot.discount}%</p>}
          <p className={`text-xl font-black ${selected && open ? "text-black" : "text-white"}`}>{currency.format(lot.finalPrice)}</p>
          <p className={`text-[11px] font-semibold ${selected && open ? "text-black/42" : "text-white/42"}`}>Base {currency.format(lot.basePrice)}</p>
        </div>
      </div>

      <div className="mt-4">
        <div className={`h-2 overflow-hidden rounded-full ${selected && open ? "bg-black/10" : "bg-white/10"}`}>
          <div
            className={`h-full rounded-full transition-all duration-700 ${soldOut ? "bg-white/40" : "bg-gradient-to-r from-[#ff3b30] to-[#d7b56d]"}`}
            style={{ width: lot.capacity > 0 ? `${progress}%` : open ? "100%" : "0%" }}
          />
        </div>
        <p className={`mt-2 text-[11px] font-semibold ${selected && open ? "text-black/45" : "text-white/42"}`}>
          {lot.available === null ? "Cupo ilimitado" : soldOut ? "Este lote ya se completo" : ``}
        </p>
      </div>
    </button>
  );
}

function StoryStat({ icon, value, numeric, suffix = "", label }: { icon: string; value: string; numeric?: number; suffix?: string; label: string }) {
  return (
    <div className="rounded-[18px] bg-white/[0.055] p-3 text-center backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:bg-white/[0.09] sm:rounded-[24px] sm:p-4">
      <p className="text-xl sm:text-2xl">{icon}</p>
      <p className="mt-1 text-lg font-black text-white sm:mt-2 sm:text-2xl">
        {typeof numeric === "number" ? <CountUp value={numeric} suffix={suffix} /> : value}
      </p>
      <p className="mt-1 text-[10px] font-semibold leading-3 text-white/48 sm:text-xs sm:leading-normal">{label}</p>
    </div>
  );
}

function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    let frame = 0;
    const totalFrames = 34;
    const timer = window.setInterval(() => {
      frame += 1;
      const progress = 1 - Math.pow(1 - frame / totalFrames, 3);
      setCurrent(value * progress);
      if (frame >= totalFrames) {
        setCurrent(value);
        window.clearInterval(timer);
      }
    }, 18);
    return () => window.clearInterval(timer);
  }, [value]);

  const formatted = Number.isInteger(value) ? Math.round(current).toString() : current.toFixed(1);
  return <>{formatted}{suffix}</>;
}

function levelDisplayName(key: string, label: string) {
  if (key === "founder") return "Fundador";
  if (key === "community") return "Comunidad Mordisco";
  return label === "Invitado General" ? "Invitado Especial" : label;
}

function monthsWithMordisco(firstOrderAt: string | null) {
  if (!firstOrderAt) return 0;
  const start = new Date(firstOrderAt);
  const now = new Date();
  return Math.max(1, (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth());
}

function getImpressiveBadge(verification: Verification) {
  const months = monthsWithMordisco(verification.customer.firstOrderAt);
  if (verification.benefit.key === "founder" && verification.customer.topPercentile <= 10) return { icon: "🔥", label: `Top ${verification.customer.topPercentile}% de clientes` };
  if (verification.customer.orderCount >= 3) return { icon: "🍔", label: `${verification.customer.orderCount} pedidos realizados` };
  if (months >= 1) return { icon: "🏆", label: `${months} meses mordiendo` };
  const year = verification.customer.firstOrderAt ? new Date(verification.customer.firstOrderAt).getFullYear() : new Date().getFullYear();
  return { icon: "❤️", label: `Cliente desde ${year}` };
}

function buildEmotionalStory(verification: Verification) {
  const name = verification.customer.name || "Mordedor";
  const months = monthsWithMordisco(verification.customer.firstOrderAt);
  const firstLine = months > 0
    ? `Hace ${months} meses hiciste tu primer pedido.`
    : "Hoy abriste tu lugar en esta historia.";
  const orderLine = verification.customer.orderCount > 0
    ? `Desde entonces realizaste ${verification.customer.orderCount} pedidos.`
    : "Esta puede ser tu primera noche siendo parte de Mordisco.";
  const topLine = verification.benefit.key === "founder" && verification.customer.topPercentile <= 25
    ? `Eso te pone dentro del Top ${verification.customer.topPercentile}% de clientes de Mordisco.`
    : `Eso te convierte en parte de nuestra comunidad.`;

  return `Hola ${name}.\n\n${firstLine}\n${orderLine}\n${topLine}\n\nGracias por ayudarnos a llegar a nuestro primer aniversario.`;
}

function buildHistoryStats(verification: Verification) {
  const months = monthsWithMordisco(verification.customer.firstOrderAt);
  return [
    { icon: "🍔", value: String(verification.customer.orderCount), numeric: verification.customer.orderCount, label: "Pedidos" },
    { icon: "❤️", value: String(months), numeric: months, label: "Meses con nosotros" },
    { icon: "💰", value: currency.format(verification.customer.totalSpent), label: "Gastados" },
    { icon: "🏆", value: `Top ${verification.customer.topPercentile}%`, label: "Clientes" },
    { icon: "⚡", value: verification.customer.frequency.toFixed(1), numeric: verification.customer.frequency, label: "Pedidos por mes" },
  ];
}

function PriceStep({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/42">{label}</p>
      <p className={`mt-1 text-sm ${strong ? "font-black text-[#d7b56d]" : "font-bold text-white"}`}>{value}</p>
    </div>
  );
}

function EventPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/14 bg-black/28 p-4 backdrop-blur">
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}
