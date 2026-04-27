"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Dispatch, SetStateAction } from "react";
import type { CartItem, Branding } from "@/types/menu";

type Props = {
  abierto: boolean;
  onClose: () => void;
  carrito: CartItem[];
  setCarrito: Dispatch<SetStateAction<CartItem[]>>;
  branchSlug: string;
  branding?: Branding;
};

export default function SidebarCarritoDelivery({
  abierto,
  onClose,
  carrito,
  setCarrito,
  branchSlug,
  branding,
}: Props) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (abierto) {
      setIsVisible(true);
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [abierto]);

  if (!isVisible) return null;

  const handleCheckout = () => {
    if (carrito.length === 0) return;

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
      categories: item.categories || [],
    }));

    sessionStorage.setItem(`cart_${branchSlug}`, JSON.stringify(cleanCart));
    window.location.href = `/${branchSlug}/checkout`;
  };

  const total = carrito.reduce((acc, p) => acc + p.price * p.quantity, 0);

  const eliminarItem = (uid: string) => {
    setCarrito((prev) => prev.filter((p) => p.uid !== uid));
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className={`flex-1 bg-black transition-opacity duration-300 ${
          isAnimating ? "bg-black/40" : "bg-black/0"
        }`}
        onClick={onClose}
        style={{ backdropFilter: "blur(2px)" }}
      />

      <div
        className={`absolute right-0 top-0 bottom-0 w-full sm:w-96 bg-white flex flex-col shadow-2xl transition-transform duration-300 ease-out ${
          isAnimating ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div
          className="flex items-center justify-between p-4 border-b border-gray-100"
          style={{
            fontFamily:
              branding?.font_family || branding?.font_primary || "CustomFont",
          }}
        >
          <h2 className="text-xl font-bold text-gray-900">Tu pedido</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors duration-200"
          >
            <X size={20} className="text-gray-600" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {carrito.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-5xl mb-3">🛒</div>
              <p>Tu carrito está vacío</p>
              <p className="text-sm mt-1">Agregá productos del menú</p>
            </div>
          ) : (
            carrito.map((item) => (
              <div
                key={item.uid}
                className="border border-gray-200 rounded-xl p-4 bg-gray-50 hover:bg-white transition-colors duration-200"
              >
                <div className="flex justify-between items-start">
                  <p className="font-semibold text-gray-900">{item.name}</p>
                  <span className="text-sm font-medium text-gray-600">
                    ${item.price * item.quantity}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1 mt-1">
                  {item.extras?.map(
                    (extra, idx) =>
                      extra.name && (
                        <span
                          key={`${item.uid}-extra-${extra.id || idx}`}
                          className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full"
                        >
                          + {extra.name}
                        </span>
                      ),
                  )}
                  {item.removedIngredients?.map(
                    (ing, idx) =>
                      ing.name && (
                        <span
                          key={`${item.uid}-removed-${ing.id || idx}`}
                          className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full"
                        >
                          sin {ing.name}
                        </span>
                      ),
                  )}
                </div>

                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs text-gray-500">
                    ${item.price} x {item.quantity}
                  </span>
                  <button
                    className="text-red-500 text-xs hover:text-red-700 transition-colors"
                    onClick={() => eliminarItem(item.uid)}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-gray-200 p-4 bg-white">
          <div className="flex justify-between text-gray-900 font-bold text-2xl mb-4">
            <span>Total</span>
            <span>${total}</span>
          </div>

          <button
            onClick={handleCheckout}
            disabled={carrito.length === 0}
            className="w-full py-4 rounded-xl text-white font-bold text-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98]"
            style={{
              backgroundColor:
                branding?.primary_color || branding?.brand_color || "#000000",
            }}
          >
            Finalizar pedido
          </button>
        </div>
      </div>
    </div>
  );
}
