"use client";

import CheckoutForm from "@/app/components/CheckoutForm";
import OrderModeSelector from "@/app/components/OrderModeSelector";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function CheckoutPage() {
  const params = useParams();

  const branchSlug = params.branchSlug as string; // 👈 FIX

  const [cart, setCart] = useState<any[]>([]);
  const [orderMode, setOrderMode] = useState<"delivery" | "takeaway" | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("cart");
    if (stored) setCart(JSON.parse(stored));
  }, []);

  return (
    <div className="max-w-2xl mx-auto p-6">
      {!orderMode ? (
        <OrderModeSelector onSelect={setOrderMode} />
      ) : (
        <CheckoutForm
          cart={cart}
          orderMode={orderMode}
          branchSlug={branchSlug}
        />
      )}
    </div>
  );
}