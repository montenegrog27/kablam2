"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

import type {
  ProductModalProps,
  ProductVariant,
  Modifier,
} from "../../types/menu";

export default function ProductModal({
  open,
  product,
  onClose,
  onAddToCart,
}: ProductModalProps) {
  const [variant, setVariant] = useState<ProductVariant | null>(null);
  const [extras, setExtras] = useState<Modifier[]>([]);

  useEffect(() => {
    if (product) {
      const defaultVariant =
        product.product_variants?.find((v) => v.is_default) ||
        product.product_variants?.[0];

      setVariant(defaultVariant || null);
      setExtras([]);
    }
  }, [product]);

  if (!open || !product) return null;

  const modifiers =
    product.modifier_group_products?.flatMap((g) =>
      g.modifier_groups.flatMap((mg) => mg.modifiers)
    ) || [];

  const toggleExtra = (extra: Modifier) => {
    setExtras((prev) => {
      const exists = prev.find((e) => e.id === extra.id);

      if (exists) {
        return prev.filter((e) => e.id !== extra.id);
      }

      return [...prev, extra];
    });
  };

  const extrasTotal = extras.reduce((sum, e) => sum + e.price, 0);

  const total = (variant?.price || 0) + extrasTotal;

  const image =
    variant?.image_url ||
    product.product_variants?.[0]?.image_url ||
    null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">

      {/* MODAL */}
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col">

        {/* HEADER */}
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-bold">
            {product.name}
          </h2>

          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* SCROLL CONTENT */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* IMAGEN */}
          {image && (
            <img
              src={image}
              className="w-full h-48 object-cover rounded-xl"
            />
          )}

          {/* DESCRIPCIÓN */}
          {product.description && (
            <p className="text-sm text-gray-500">
              {product.description}
            </p>
          )}

          {/* VARIANTES */}
          {product.product_variants?.length > 1 && (
            <div className="space-y-2">
              <p className="font-semibold">
                Elegí una opción
              </p>

              {product.product_variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVariant(v)}
                  className={`w-full flex justify-between items-center border rounded-lg p-3 transition ${
                    variant?.id === v.id
                      ? "border-black bg-gray-50"
                      : "border-gray-200"
                  }`}
                >
                  <span>{v.name}</span>

                  <span className="font-medium">
                    ${v.price}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* EXTRAS */}
          {modifiers.length > 0 && (
            <div className="space-y-2">
              <p className="font-semibold">
                Extras
              </p>

              {modifiers.map((extra) => {
                const active = extras.some(
                  (e) => e.id === extra.id
                );

                return (
                  <button
                    key={extra.id}
                    onClick={() => toggleExtra(extra)}
                    className={`w-full flex justify-between items-center border rounded-lg p-3 transition ${
                      active
                        ? "border-black bg-gray-50"
                        : "border-gray-200"
                    }`}
                  >
                    <span>{extra.name}</span>

                    <span className="text-sm font-medium">
                      +${extra.price}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="border-t p-4 space-y-3">

          <div className="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span>${total}</span>
          </div>

          <button
            onClick={() => {
              if (!variant) return;

              onAddToCart({
                productId: product.id,
                name: product.name,
                variant,
                extras,
                price: total,
                quantity: 1,
              });

              onClose();
            }}
            className="w-full bg-black text-white py-3 rounded-full font-semibold"
          >
            Agregar al carrito
          </button>

        </div>

      </div>
    </div>
  );
}