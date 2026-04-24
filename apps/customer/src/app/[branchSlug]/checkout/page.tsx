"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import CheckoutForm from "@/app/components/CheckoutForm";
import OrderModeSelector from "@/app/components/OrderModeSelector";
import type { CartItem } from "@/types/menu";

export default function CheckoutPage() {
  const params = useParams();
  const branchSlug = params.branchSlug as string;

  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderMode, setOrderMode] = useState<"delivery" | "takeaway" | null>(
    null,
  );

  useEffect(() => {
    const stored = sessionStorage.getItem(`cart_${branchSlug}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      console.log("Checkout: Cart loaded from sessionStorage:", parsed);
      console.log("Checkout: First item categories:", parsed[0]?.categories);
      setCart(parsed); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [branchSlug]);

  const addToCart = (item: CartItem) => {
    console.log("Checkout: Adding item to cart:", item);
    console.log("Checkout: Item categories:", item.categories);

    const updatedCart = [...cart];

    // Verificar si ya existe el mismo item (misma variante, mismos extras, mismos ingredientes removidos)
    // Por simplicidad, agregamos como nuevo item
    updatedCart.push(item);

    setCart(updatedCart);
    sessionStorage.setItem(`cart_${branchSlug}`, JSON.stringify(updatedCart));
  };

  const updateCart = (newCart: CartItem[]) => {
    setCart(newCart);
    sessionStorage.setItem(`cart_${branchSlug}`, JSON.stringify(newCart));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        {!orderMode ? (
          <OrderModeSelector onSelect={setOrderMode} />
        ) : (
          <CheckoutForm
            cart={cart}
            orderMode={orderMode}
            branchSlug={branchSlug}
            onBack={() => setOrderMode(null)}
            onAddToCart={addToCart}
            onUpdateCart={updateCart}
          />
        )}
      </div>
    </div>
  );
}
