"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

type CustomerPopup = {
  id: string;
  name: string;
  description?: string | null;
  image_url: string;
  link_url?: string | null;
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
        if (!nextPopup?.id || !nextPopup.image_url || cancelled) return;

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

  const image = (
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
  );

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

        {popup.link_url ? (
          <a href={popup.link_url} onClick={close} className="block" aria-label={popup.name}>
            {image}
          </a>
        ) : (
          image
        )}
      </div>
    </div>
  );
}
