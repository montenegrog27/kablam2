"use client";

import { ShoppingCart, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Branding } from "@/types/menu";

type Props = {
  onCartClick: () => void;
  totalItems: number;
  branding?: Branding;
  customer?: {
    name?: string;
    phone: string;
  } | null;
  branchSlug?: string;
};

export default function NavbarDelivery({
  onCartClick,
  totalItems,
  branding,
  customer,
  branchSlug,
}: Props) {
  const pathname = usePathname();
  const isAuthPage = pathname.includes("/auth/");

  return (
    <nav
      className="w-full flex items-center justify-between px-4 py-3 border-b sticky top-0 z-50"
      style={{
        background: branding?.background_color || "#fff",
        fontFamily:
          branding?.font_family || branding?.font_primary || "CustomFont",
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

      {/* Botones derecha */}
      <div className="flex items-center gap-2">
        {/* Botón de login/perfil */}
        {/* {branchSlug && !isAuthPage && (
          <>
            {customer ? (
              <Link
                href={`/${branchSlug}/account/profile`}
                className="flex items-center gap-2 px-4 py-2 rounded-full border"
                style={{
                  borderColor: branding?.primary_color || "#000",
                  color: branding?.primary_color || "#000",
                }}
              >
                <User size={18} />
                <span className="text-sm font-semibold">
                  {customer.name || "Mi cuenta"}
                </span>
              </Link>
            ) : (
              <Link
                href={`/${branchSlug}/auth/login`}
                className="flex items-center gap-2 px-4 py-2 rounded-full border"
                style={{
                  borderColor: branding?.primary_color || "#000",
                  color: branding?.primary_color || "#000",
                }}
              >
                <User size={18} />
                <span className="text-sm font-semibold">Ingresar</span>
              </Link>
            )}
          </>
        )} */}

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
      </div>
    </nav>
  );
}
