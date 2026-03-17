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
  const [orderMode, setOrderMode] = useState<
    "delivery" | "takeaway" | null
  >(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(`cart_${branchSlug}`);
    if (stored) setCart(JSON.parse(stored));
  }, [branchSlug]);

  return (
    <div className="max-w-2xl mx-auto p-6">
      {!orderMode ? (
        <OrderModeSelector onSelect={setOrderMode} />
      ) : (
        <CheckoutForm
          cart={cart}
          orderMode={orderMode}
          branchSlug={branchSlug}
          onBack={() => setOrderMode(null)}
        />
      )}
    </div>
  );
}