"use client";

import { useEffect, useState } from "react";
import CheckoutForm from "@/app/components/CheckoutForm";
import OrderModeSelector from "@/app/components/OrderModeSelector";
import FontLoader from "@/app/components/FontLoader";
import type { CartItem, Branding } from "@/types/menu";

type Props = {
  branchSlug: string;
  branding?: Branding;
};

export default function CheckoutPageClient({ branchSlug, branding }: Props) {
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
      <div className="min-h-screen bg-gray-50 p-4 md:p-6">
        <div className="max-w-6xl mx-auto">
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
            />
          )}
        </div>
      </div>
    </>
  );
}
