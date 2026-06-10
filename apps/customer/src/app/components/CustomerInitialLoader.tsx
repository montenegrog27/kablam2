"use client";

import { useEffect, useMemo, useState } from "react";
import type { Branding } from "@/types/menu";

export default function CustomerInitialLoader({
  branding,
  branchSlug,
}: {
  branding?: Branding;
  branchSlug: string;
}) {
  const [visible, setVisible] = useState(true);
  const iconUrl = useMemo(
    () => branding?.loading_icon_url || branding?.logo_url || "",
    [branding?.loading_icon_url, branding?.logo_url],
  );

  useEffect(() => {
    if (iconUrl) {
      sessionStorage.setItem(`customer_loader_icon_${branchSlug}`, iconUrl);
    }

    const timer = window.setTimeout(() => setVisible(false), 1450);
    return () => window.clearTimeout(timer);
  }, [branchSlug, iconUrl]);

  if (!visible) return null;

  const primary = branding?.primary_color || branding?.brand_color || "#111827";
  const background = branding?.background_color || "#ffffff";

  return (
    <div
      className="customer-world-cup-loader fixed inset-0 z-[120] flex items-center justify-center overflow-hidden transition-opacity"
      style={{ backgroundColor: background }}
      aria-label="Cargando"
      role="status"
    >
      <ConfettiBurst side="left" />
      <ConfettiBurst side="right" />
      <div className="flex flex-col items-center gap-4">
        <div
          className="flex h-24 w-24 items-center justify-center rounded-full "
        >
          {iconUrl ? (
            <img
              src={iconUrl}
              alt=""
              className="h-24 w-24 animate-spin object-contain"
              style={{ animationDuration: "1.15s" }}
            />
          ) : (
            <div
              className="h-14 w-14 animate-spin rounded-full border-4 border-black/10"
              style={{ borderTopColor: primary }}
            />
          )}
        </div>

      </div>
    </div>
  );
}

function ConfettiBurst({ side }: { side: "left" | "right" }) {
  const pieces = Array.from({ length: 36 }, (_, index) => {
    const isBlue = index % 3 !== 1;
    const top = 12 + ((index * 37) % 76);
    const delay = (index % 12) * 0.065;
    const distance = 34 + (index % 7) * 7;
    const drift = ((index % 7) - 3) * 16;
    const rotate = side === "left" ? 220 + index * 19 : -220 - index * 19;
    const scale = 0.74 + (index % 5) * 0.11;

    return (
      <span
        key={`${side}-${index}`}
        className="customer-world-cup-confetti"
        style={
          {
            "--confetti-top": `${top}%`,
            "--confetti-delay": `${delay}s`,
            "--confetti-x": `${side === "left" ? distance : -distance}vw`,
            "--confetti-y": `${drift}px`,
            "--confetti-rotate": `${rotate}deg`,
            "--confetti-scale": scale,
            backgroundColor: isBlue ? "#74acdf" : "#ffffff",
            left: side === "left" ? "-18px" : "auto",
            right: side === "right" ? "-18px" : "auto",
          } as React.CSSProperties
        }
      />
    );
  });

  return <div className="pointer-events-none absolute inset-0">{pieces}</div>;
}
