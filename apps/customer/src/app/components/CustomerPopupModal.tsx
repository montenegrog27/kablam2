"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

type CustomerPopup = {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  link_url?: string | null;
  show_promotions?: boolean | null;
  promotions?: Array<{
    id: string;
    name: string;
    description?: string | null;
    badge?: string | null;
    image_url?: string | null;
    end_date?: string | null;
  }>;
};

export default function CustomerPopupModal({ branchSlug }: { branchSlug: string }) {
  const [popup, setPopup] = useState<CustomerPopup | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/popups?branchSlug=${encodeURIComponent(branchSlug)}`)
      .then((response) => response.json())
      .then((data) => {
        const nextPopup = data?.popup as CustomerPopup | null;
        if (!nextPopup?.id || cancelled) return;
        if (!nextPopup.show_promotions && !nextPopup.image_url) return;
        if (nextPopup.show_promotions && !nextPopup.promotions?.length) return;

        const storageKey = `customer_popup_seen_${branchSlug}_${nextPopup.id}`;
        if (sessionStorage.getItem(storageKey) === "true") return;

        setPopup(nextPopup);
        setOpen(true);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [branchSlug]);

  if (!popup || !open) return null;

  const close = () => {
    sessionStorage.setItem(`customer_popup_seen_${branchSlug}_${popup.id}`, "true");
    setOpen(false);
  };

  const image = popup.image_url ? (
    <div className="relative h-[min(78vh,720px)] w-full rounded-2xl">
      <Image
        src={popup.image_url}
        alt={popup.name}
        fill
        sizes="(max-width: 768px) 92vw, 520px"
        className="object-contain"
        draggable={false}
        loading="lazy"
      />
    </div>
  ) : null;

  const promotionContent = popup.show_promotions ? (
    <div className="rounded-[28px] bg-neutral-950 p-4 text-white shadow-2xl">
      <div className="mb-4 pr-12">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-red-300">Promociones</p>
        <h2 className="mt-2 text-2xl font-black leading-tight">{popup.name}</h2>
        {popup.description && <p className="mt-1 text-sm text-white/65">{popup.description}</p>}
      </div>

      <div className="grid gap-3">
        {(popup.promotions || []).map((promotion) => (
          <a
            key={promotion.id}
            href={popup.link_url || "#"}
            onClick={close}
            className="group overflow-hidden rounded-2xl border border-white/10 bg-white text-left text-neutral-950 shadow-xl"
            aria-label={promotion.name}
          >
            {promotion.image_url && (
              <div className="relative h-40 w-full bg-neutral-100">
                <Image
                  src={promotion.image_url}
                  alt={promotion.name}
                  fill
                  sizes="(max-width: 768px) 92vw, 520px"
                  className="object-cover transition duration-300 group-hover:scale-[1.02]"
                />
              </div>
            )}
            <div className="p-4">
              {promotion.badge && (
                <span className="rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-white">
                  {promotion.badge}
                </span>
              )}
              <h3 className="mt-2 text-xl font-black leading-tight">{promotion.name}</h3>
              {promotion.description && <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{promotion.description}</p>}
              {promotion.end_date && (
                <p className="mt-3 text-xs font-bold uppercase tracking-wide text-red-600">
                  Disponible hasta {formatDate(promotion.end_date)}
                </p>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/78 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-[min(92vw,520px)] overflow-hidden rounded-[28px] ">
        <button
          type="button"
          onClick={close}
          className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-black"
          aria-label="Cerrar popup"
        >
          <X size={20} />
        </button>

        {promotionContent || (popup.link_url && image ? (
          <a href={popup.link_url} onClick={close} className="block" aria-label={popup.name}>
            {image}
          </a>
        ) : (
          image
        ))}
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
  });
}
