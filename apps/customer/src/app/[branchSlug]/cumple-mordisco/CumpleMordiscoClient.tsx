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
  lots: Lot[];
  message: string;
};

type Invitation = {
  invitation_code: string;
  customer_name: string;
  whatsapp: string;
  benefit_tier: string;
  lot_name?: string;
  price: number;
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
  const [selectedLotKey, setSelectedLotKey] = useState("lote_1");
  const [loading, setLoading] = useState(false);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [eventInfo, setEventInfo] = useState<EventInfo>(defaultEventInfo);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedLot = verification?.lots.find((lot) => lot.key === selectedLotKey) || verification?.lots[0];
  const isFounder = verification?.benefit.key === "founder";
  const qr = useMemo(() => qrCells(invitation?.invitation_code || "MORDISCO"), [invitation]);
  const hasDiscount = Number(verification?.benefit.discount || 0) > 0;
  const savings = selectedLot ? Math.max(selectedLot.basePrice - selectedLot.finalPrice, 0) : 0;

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
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [branchSlug]);

  const verify = async () => {
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
      setSelectedLotKey(data.lots?.find((lot: Lot) => lot.available !== 0)?.key || data.lots?.[0]?.key || "lote_1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos verificar tus beneficios");
    } finally {
      setLoading(false);
    }
  };

  const purchase = async () => {
    if (!verification || !selectedLot) return;
    if (!name || !phone) {
      setError("Completa nombre y WhatsApp para generar la invitacion.");
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
          benefitKey: verification.benefit.key,
          lotKey: selectedLot.key,
          lotName: selectedLot.name,
          basePrice: selectedLot.basePrice,
          discount: selectedLot.discount,
          price: selectedLot.finalPrice,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "No pudimos generar la invitacion");
      setInvitation(data.invitation);
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

      <section id="beneficios" className="mx-auto grid max-w-6xl gap-8 px-5 py-16 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#d7b56d]">Verificacion</p>
          <h2 className="mt-4 text-4xl font-black tracking-tight">Qué tan Mordiscolover sos? Descubrilo!</h2>
          <p className="mt-5 text-white/62">
            Ingresa tu WhatsApp y verificaremos automaticamente si formas parte de la comunidad Mordisco.
            Despues elegís podes adquirir tu entrada con tu descuento aplicado.
          </p>
        </div>

        <div className="rounded-[28px] border border-white/12 bg-white/[0.06] p-5 shadow-2xl backdrop-blur-xl">
          <div className="grid gap-3">
            <label>
              <span className="mb-1 block text-xs font-semibold text-white/55">Nombre completo</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-2xl border border-white/12 bg-black/35 px-4 py-3 outline-none" />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-white/55">Numero de WhatsApp</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} className="w-full rounded-2xl border border-white/12 bg-black/35 px-4 py-3 outline-none" />
            </label>
          </div>

          {error && <p className="mt-4 rounded-2xl bg-red-500/15 px-4 py-3 text-sm text-red-200">{error}</p>}
          {notice && <p className="mt-4 rounded-2xl bg-amber-500/15 px-4 py-3 text-sm text-amber-100">{notice}</p>}

          <button
            onClick={verify}
            disabled={loading || !phone}
            className="mt-5 w-full rounded-2xl bg-[#d7b56d] px-5 py-4 text-sm font-black text-black transition hover:bg-[#f0cf88] disabled:opacity-50"
          >
            {loading ? "Verificando..." : "Ver mis beneficios"}
          </button>

          {verification && (
            <div className={`mt-6 overflow-hidden rounded-[24px] border p-5 ${isFounder ? "border-[#d7b56d]/70 bg-[#d7b56d]/12" : "border-white/12 bg-black/25"}`}>
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
                            {lot.available === null ? "Cupo limitado" : lot.available > 0 ? `${lot.available} lugares disponibles` : "Lote agotado"}
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
          )}
        </div>
      </section>

      {invitation && (
        <section ref={inviteRef} className="mx-auto max-w-3xl px-5 pb-20">
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
