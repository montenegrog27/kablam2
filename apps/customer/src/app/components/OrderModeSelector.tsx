"use client";

import { Package, Truck, ArrowLeft } from "lucide-react";
import type { Branding } from "@/types/menu";
import Link from "next/link";

type Props = {
  onSelect: (mode: "delivery" | "takeaway") => void;
  branding?: Branding;
  branchSlug?: string;
};

export default function OrderModeSelector({
  onSelect,
  branding,
  branchSlug,
}: Props) {
  const primaryColor =
    branding?.primary_color || branding?.brand_color || "#000000";
  const fontFamily =
    branding?.font_family || branding?.font_primary || "CustomFont";

  return (
    <div className="mt-20 text-center" style={{ fontFamily }}>
      <h2
        className="text-2xl md:text-3xl font-bold mb-8"
        style={{ color: primaryColor }}
      >
        ¿Cómo querés recibir tu pedido?
      </h2>

      <div className="flex flex-row gap-4 justify-center max-w-lg mx-auto">
        <button
          onClick={() => onSelect("takeaway")}
          className="flex-1 flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-gray-200 hover:border-gray-300 transition-all duration-200 hover:shadow-lg"
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ backgroundColor: primaryColor + "20" }}
          >
            <Package size={28} style={{ color: primaryColor }} />
          </div>
          <div className="text-center">
            <span
              className="text-lg font-bold block"
              style={{ color: primaryColor }}
            >
              Retirar
            </span>
            <span className="text-sm text-gray-500">
              Pasás a buscar tu pedido
            </span>
          </div>
        </button>

        <button
          onClick={() => onSelect("delivery")}
          className="flex-1 flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-gray-200 hover:border-gray-300 transition-all duration-200 hover:shadow-lg"
        >
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ backgroundColor: primaryColor + "20" }}
          >
            <Truck size={28} style={{ color: primaryColor }} />
          </div>
          <div className="text-center">
            <span
              className="text-lg font-bold block"
              style={{ color: primaryColor }}
            >
              Delivery
            </span>
            <span className="text-sm text-gray-500">
              Te lo llevamos a tu casa
            </span>
          </div>
        </button>
      </div>

      {branchSlug && (
        <div className="mt-8">
          <Link
            href={`/${branchSlug}/order`}
            className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={18} />
            <span>Volver al menú</span>
          </Link>
        </div>
      )}
    </div>
  );
}
