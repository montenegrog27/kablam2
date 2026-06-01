"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function CumpleMordiscoEntry({ branchSlug }: { branchSlug: string }) {
  const [open, setOpen] = useState(false);
  const storageKey = `cumple_mordisco_popup_${branchSlug}`;

  useEffect(() => {
    if (sessionStorage.getItem(storageKey)) return;
    const timer = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  const close = () => {
    sessionStorage.setItem(storageKey, "closed");
    setOpen(false);
  };

  return (
    <>
      <div className="sticky top-[57px] z-40 border-b border-[#d7b56d]/25 bg-[#100d0a] px-3 py-2 shadow-lg">
        <Link
          href={`/${branchSlug}/cumple-mordisco`}
          className="mx-auto flex max-w-4xl items-center justify-center rounded-full border border-[#d7b56d]/35 bg-[#d7b56d] px-4 py-2.5 text-center text-sm font-black uppercase tracking-[0.12em] text-black"
        >
          Vení a nuestro 1er cumple!
        </Link>
      </div>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 px-5 backdrop-blur-sm">
          <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/15 bg-[#0d0b09] p-5 text-white shadow-2xl">
            <button
              onClick={close}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/70"
              aria-label="Cerrar"
            >
              X
            </button>
            <div
              className="mb-5 h-44 rounded-[22px] bg-cover bg-center"
              style={{
                backgroundImage:
                  "linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.65)), url('https://res.cloudinary.com/dsbrnqc5z/image/upload/v1780278318/WhatsApp_Image_2026-05-31_at_22.44.47_jxwoxl.jpg')",
              }}
            />
            <h2 className="mt-3 text-3xl font-black leading-tight">Vení a nuestro 1er cumple!</h2>
            <p className="mt-3 text-sm leading-6 text-white/65">
              Una noche especial para quienes hicieron posible este primer año. Ingresa tu número y descubrí tu beneficio.
            </p>
            <div className="mt-5 grid gap-2">
              <Link
                href={`/${branchSlug}/cumple-mordisco`}
                onClick={close}
                className="rounded-full bg-white px-5 py-3 text-center text-sm font-black text-black"
              >
                Saber más
              </Link>
              <button onClick={close} className="rounded-full border border-white/15 px-5 py-3 text-sm font-bold text-white/70">
                Ahora no
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
