"use client";

import { useEffect, useState } from "react";
import CheckoutForm from "@/app/components/CheckoutForm";
import OrderModeSelector from "@/app/components/OrderModeSelector";
import FontLoader from "@/app/components/FontLoader";
import type { CartItem, Branding } from "@/types/menu";

type Props = {
  branchSlug: string;
  branding?: Branding;
  availability?: {
    isOpen: boolean;
    message: string;
    reason: "manual" | "temporary" | "hours" | null;
  };
};

export default function CheckoutPageClient({ branchSlug, branding, availability }: Props) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderMode, setOrderMode] = useState<"delivery" | "takeaway" | null>(
    null,
  );

  useEffect(() => {
    const stored = sessionStorage.getItem(`cart_${branchSlug}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      console.log("Checkout: Cart loaded from sessionStorage:", parsed);
      setCart(parsed);
    }
  }, [branchSlug]);

  const addToCart = (item: CartItem) => {
    if (availability?.isOpen === false) return;
    const updatedCart = [...cart];
    updatedCart.push(item);
    setCart(updatedCart);
    sessionStorage.setItem(`cart_${branchSlug}`, JSON.stringify(updatedCart));
  };

  const updateCart = (newCart: CartItem[]) => {
    setCart(newCart);
    sessionStorage.setItem(`cart_${branchSlug}`, JSON.stringify(newCart));
  };

  const primaryColor =
    branding?.primary_color || branding?.brand_color || "#000000";

  return (
    <>
      <FontLoader branding={branding} />
      <style>{`.pac-container { z-index: 9999 !important; } body { overflow-x: hidden; }`}</style>
      <div className="min-h-screen bg-gray-100 overflow-x-hidden">
        <div className="w-full max-w-6xl mx-auto overflow-x-hidden px-3 sm:px-4 md:px-6">
          {availability?.isOpen === false && (
            <div className="pt-4">
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 shadow-sm">
                {availability.message}
              </div>
            </div>
          )}
          {!orderMode ? (
            <OrderModeSelector
              onSelect={setOrderMode}
              branding={branding}
              branchSlug={branchSlug}
            />
          ) : (
            <CheckoutForm
              cart={cart}
              orderMode={orderMode}
              branchSlug={branchSlug}
              onBack={() => setOrderMode(null)}
              onAddToCart={addToCart}
              onUpdateCart={updateCart}
              branding={branding}
              availability={availability}
            />
          )}
        </div>
      </div>
    </>
  );
}
