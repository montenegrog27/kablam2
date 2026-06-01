"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

type Benefit = {
  key: string;
  label: string;
  badge: string;
  discount: number;
  price: number;
  description: string;
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
  message: string;
};

type Invitation = {
  invitation_code: string;
  customer_name: string;
  dni: string;
  whatsapp: string;
  benefit_tier: string;
  price: number;
};

const currency = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

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
    const finder =
      (row < 3 && col < 3) ||
      (row < 3 && col > 7) ||
      (row > 7 && col < 3);
    return finder || ((value + row * 3 + col * 5 + index) % 4 !== 0);
  });
}

export default function CumpleMordiscoClient({ branchSlug }: { branchSlug: string }) {
  const inviteRef = useRef<HTMLDivElement | null>(null);
  const [name, setName] = useState("");
  const [dni, setDni] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState("");

  const isFounder = verification?.benefit.key === "founder";
  const qr = useMemo(() => qrCells(invitation?.invitation_code || "MORDISCO"), [invitation]);

  const verify = async () => {
    setLoading(true);
    setError("");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos verificar tus beneficios");
    } finally {
      setLoading(false);
    }
  };

  const purchase = async () => {
    if (!verification) return;
    if (!name || !dni || !phone) {
      setError("Completá nombre, DNI y WhatsApp para generar la invitación.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/cumple-mordisco", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "purchase",
          branchSlug,
          name,
          dni,
          phone,
          benefitKey: verification.benefit.key,
          price: verification.benefit.price,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "No pudimos generar la invitación");
      setInvitation(data.invitation);
      setTimeout(() => inviteRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos generar la invitación");
    } finally {
      setLoading(false);
    }
  };

  const downloadInvitation = () => {
    window.print();
  };

  const shareBenefit = async () => {
    const text = invitation
      ? `Tengo mi invitación ${invitation.invitation_code} para el Primer Aniversario Mordisco.`
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
              Conseguir invitación
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
                Nuestro primer año.
              </p>
              <p className="mt-6 max-w-xl text-base leading-7 text-white/68">
                Una noche especial. Hamburguesas edición limitada. Invitados especiales.
                Y el comienzo de una nueva etapa para Mordisco.
              </p>
              <a
                href="#beneficios"
                className="mt-8 inline-flex rounded-full bg-white px-6 py-3 text-sm font-bold text-black transition hover:scale-[1.02]"
              >
                Conseguir invitación
              </a>
            </div>

            <div className="rounded-[28px] border border-white/16 bg-black/36 p-5 shadow-2xl backdrop-blur-xl">
              <div className="rounded-[22px] border border-white/10 bg-white/[0.07] p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-white/50">Acceso privado</p>
                <p className="mt-4 text-3xl font-black">No es una entrada. Es tu lugar en la historia.</p>
                <div className="mt-8 grid grid-cols-3 gap-2 text-center">
                  {["Edición limitada", "Sorteos", "Comunidad"].map((item) => (
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
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#d7b56d]">Verificación</p>
          <h2 className="mt-4 text-4xl font-black tracking-tight">Tu acceso para el Primer Aniversario</h2>
          <p className="mt-5 text-white/62">
            ¿Ya sos cliente? Los clientes de Mordisco tienen beneficios especiales.
            Ingresá tu WhatsApp y verificaremos automáticamente si formás parte de la comunidad.
          </p>
        </div>

        <div className="rounded-[28px] border border-white/12 bg-white/[0.06] p-5 shadow-2xl backdrop-blur-xl">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-white/55">Nombre completo</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-2xl border border-white/12 bg-black/35 px-4 py-3 outline-none" />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-white/55">DNI</span>
              <input value={dni} onChange={(e) => setDni(e.target.value.replace(/\D/g, ""))} className="w-full rounded-2xl border border-white/12 bg-black/35 px-4 py-3 outline-none" />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold text-white/55">Número de WhatsApp</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} className="w-full rounded-2xl border border-white/12 bg-black/35 px-4 py-3 outline-none" />
            </label>
          </div>

          {error && <p className="mt-4 rounded-2xl bg-red-500/15 px-4 py-3 text-sm text-red-200">{error}</p>}

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
                </div>
                <div className="rounded-full bg-white px-3 py-1 text-xs font-black text-black">
                  {verification.benefit.discount > 0 ? `-${verification.benefit.discount}%` : "General"}
                </div>
              </div>

              <p className="mt-5 text-xl font-semibold leading-relaxed text-white/90">{verification.message}</p>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <Metric label="Pedidos" value={verification.customer.orderCount.toString()} />
                <Metric label="Gasto total" value={currency.format(verification.customer.totalSpent)} />
                <Metric label="Cliente desde" value={formatDate(verification.customer.firstOrderAt)} />
                <Metric label="Sucursal" value={verification.customer.favoriteBranch?.name || "Mordisco"} />
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <p className="text-sm font-semibold text-white/55">Incluye</p>
                <ul className="mt-3 space-y-2 text-sm text-white/75">
                  <li>Ingreso al evento</li>
                  <li>Sorteos toda la noche</li>
                  <li>Hamburguesas edición limitada</li>
                </ul>
                <div className="mt-5 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-white/45">Precio</p>
                    <p className="text-3xl font-black">{currency.format(verification.benefit.price)}</p>
                  </div>
                  <button onClick={purchase} disabled={loading} className="rounded-full bg-white px-5 py-3 text-sm font-black text-black">
                    Comprar invitación
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
            <p className="text-center text-sm font-semibold uppercase tracking-[0.24em] text-[#d7b56d]">Invitación emitida</p>
            <h2 className="mt-4 text-center text-4xl font-black">Nos vemos en el aniversario.</h2>
            <p className="mx-auto mt-4 max-w-md text-center text-white/62">
              Y gracias por formar parte de este primer año.
            </p>

            <div className="mt-8 rounded-[24px] bg-white p-5 text-black">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-black/45">Cumple Mordisco</p>
                  <p className="mt-2 text-2xl font-black">{invitation.customer_name}</p>
                  <p className="text-sm text-black/55">DNI {invitation.dni} · WhatsApp {invitation.whatsapp}</p>
                  <p className="mt-4 text-sm font-bold">Invitación #{invitation.invitation_code}</p>
                </div>
                <div className="grid h-28 w-28 grid-cols-11 gap-[2px] rounded-xl bg-white p-2 shadow-inner">
                  {qr.map((filled, index) => (
                    <span key={index} className={filled ? "rounded-[1px] bg-black" : "rounded-[1px] bg-white"} />
                  ))}
                </div>
              </div>
              <div className="mt-5 rounded-2xl bg-black px-4 py-3 text-white">
                <p className="text-xs text-white/55">Acceso</p>
                <p className="text-lg font-black">{currency.format(invitation.price)} · {invitation.benefit_tier}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <button onClick={downloadInvitation} className="rounded-full bg-white px-4 py-3 text-sm font-black text-black">Descargar invitación</button>
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
