"use client";

import { ShoppingCart } from "lucide-react";
import type { Branding } from "@/types/menu";

type Props = {
  onCartClick: () => void;
  totalItems: number;
  branding?: Branding;
};

export default function NavbarDelivery({
  onCartClick,
  totalItems,
  branding,
}: Props) {
    console.log("🔥 BRANDING:", branding)
    
  return (
    <nav
      className="w-full flex items-center justify-between px-4 py-3 border-b sticky top-0 z-50"
      style={{
        background: branding?.background_color || "#fff",
      }}
    >
      {/* Logo / nombre */}
      <div className="flex items-center gap-3">
        {branding?.logo_url ? (
          <img
            src={branding.logo_url}
            className="h-8 w-auto object-contain"
            alt="logo"
          />
        ) : (
          <h1 className="text-xl font-bold tracking-tight">Kablam</h1>
        )}
      </div>

      {/* Carrito */}
      <button
        onClick={onCartClick}
        className="relative flex items-center gap-2 px-4 py-2 rounded-full"
        style={{
          background: branding?.primary_color || "#000",
          color: "#fff",
        }}
      >
        <ShoppingCart size={18} />

        <span className="text-sm font-semibold">Carrito</span>

        {totalItems > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-xs text-white w-5 h-5 flex items-center justify-center rounded-full">
            {totalItems}
          </span>
        )}
      </button>
    </nav>
  );
}