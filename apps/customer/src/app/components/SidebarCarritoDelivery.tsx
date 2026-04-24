"use client";

import { Dispatch, SetStateAction } from "react";
import type { CartItem, Branding } from "@/types/menu";
/* ========= TIPOS ========= */

type Props = {
  abierto: boolean;
  onClose: () => void;
  carrito: CartItem[];
  setCarrito: Dispatch<SetStateAction<CartItem[]>>;
  branchSlug: string; // 👈 NUEVO
  branding?: Branding;
};

/* ========= COMPONENTE ========= */

export default function SidebarCarritoDelivery({
  abierto,
  onClose,
  carrito,
  setCarrito,
  branchSlug, // 👈 AQUI
  branding,
}: Props) {
  if (!abierto) return null;

  const handleCheckout = () => {
    if (carrito.length === 0) return;

    // Guardar todas las propiedades necesarias para el checkout y upsell
    const cleanCart = carrito.map((item) => ({
      uid: item.uid,
      variantId: item.variantId,
      productId: item.productId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      variant: item.variant,
      extras: item.extras || [],
      allowHalf: item.allowHalf,
      halves: item.halves,
      removedIngredients: item.removedIngredients || [],
      categories: item.categories || [], // CRÍTICO para sistema de upsell
    }));

    console.log(
      "SidebarCarrito: Saving cart to sessionStorage with categories:",
      cleanCart.map((item) => ({
        name: item.name,
        categories: item.categories,
      })),
    );

    sessionStorage.setItem(`cart_${branchSlug}`, JSON.stringify(cleanCart));
    window.location.href = `/${branchSlug}/checkout`;
  };

  const total = carrito.reduce((acc, p) => acc + p.price * p.quantity, 0);

  const eliminarItem = (uid: string) => {
    setCarrito((prev) => prev.filter((p) => p.uid !== uid));
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />

      <div
        className="w-96 bg-white p-4 flex flex-col"
        style={{
          fontFamily:
            branding?.font_family || branding?.font_primary || "CustomFont",
        }}
      >
        <h2 className="text-xl font-bold mb-4">Tu pedido</h2>

        <div className="flex-1 space-y-3 overflow-y-auto">
          {carrito.map((item) => (
            <div key={item.uid} className="border rounded-lg p-3">
              <p className="font-semibold">{item.name}</p>

              <p className="text-sm text-gray-500">
                ${item.price} x {item.quantity}
              </p>

              <button
                className="text-red-500 text-sm"
                onClick={() => eliminarItem(item.uid)}
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>

        <div className="border-t pt-3">
          <div className="flex justify-between font-bold mb-3">
            <span>Total</span>
            <span>${total}</span>
          </div>

          <button
            onClick={handleCheckout}
            className="w-full bg-black text-white py-3 rounded-lg"
          >
            Finalizar pedido
          </button>
        </div>
      </div>
    </div>
  );
}
