"use client";

import { useMemo, useState } from "react";
import type { CartItem } from "@/types/menu";

type Props = {
  cart: CartItem[];
  orderMode: "delivery" | "takeaway";
  branchSlug: string;
  onBack: () => void;
};

export default function CheckoutForm({
  cart,
  orderMode,
  branchSlug,
  onBack,
}: Props) {
  const [customer, setCustomer] = useState({
    name: "",
    phone: "",
    address: "",
  });

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [discount, setDiscount] = useState(0);
  const [couponError, setCouponError] = useState("");

  const [loading, setLoading] = useState(false);

  /* =========================
     CALCULOS
  ========================= */

  const subtotal = useMemo(
    () => cart.reduce((acc, p) => acc + p.price * p.quantity, 0),
    [cart]
  );

  const shipping = orderMode === "delivery" ? 500 : 0;

  const total = Math.max(subtotal + shipping - discount, 0);

  /* =========================
     VALIDACIONES
  ========================= */

  const isValid = () => {
    if (!customer.name || !customer.phone) return false;
    if (orderMode === "delivery" && !customer.address) return false;
    return true;
  };

  const couponRequiresPhone = appliedCoupon?.requires_phone === true;

  const isPhoneMissingForCoupon =
    couponRequiresPhone && !customer.phone?.trim();

  /* =========================
     COUPON
  ========================= */

  const applyCoupon = async () => {
    if (!couponCode) return;

    setCouponError("");

    const phoneNormalized = customer.phone.replace(/\D/g, "");

    const res = await fetch("/api/coupons/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: couponCode,
        branchSlug,
        subtotal,
        phone: phoneNormalized,
      }),
    });

    const data = await res.json();

    if (!data.valid) {
      setAppliedCoupon(null);
      setDiscount(0);
      setCouponError(data.message || "Cupón inválido");
      return;
    }

    setAppliedCoupon(data.coupon);
    setDiscount(data.discountAmount || 0);
  };

  /* =========================
     SUBMIT
  ========================= */

  const handleSubmit = async () => {
    if (!isValid() || isPhoneMissingForCoupon) return;

    setLoading(true);

    const phoneNormalized = customer.phone.replace(/\D/g, "");

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        branchSlug,
        orderMode,
        customer: {
          ...customer,
          phone: phoneNormalized,
        },
        items: cart,
        total,
        couponCode: appliedCoupon?.code || null,
      }),
    });

    const data = await res.json();

    if (data.success) {
      sessionStorage.removeItem(`cart_${branchSlug}`);
      window.location.href = `/${branchSlug}/success`;
    }

    setLoading(false);
  };

  /* =========================
     UI
  ========================= */

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-sm text-blue-500">
        ← Cambiar tipo
      </button>

      {/* CUSTOMER */}
      <div className="space-y-3">
        <input
          placeholder="Nombre"
          value={customer.name}
          onChange={(e) =>
            setCustomer({ ...customer, name: e.target.value })
          }
          className="border p-3 w-full rounded"
        />

        <input
          placeholder="Teléfono"
          value={customer.phone}
          onChange={(e) =>
            setCustomer({
              ...customer,
              phone: e.target.value.replace(/\D/g, ""),
            })
          }
          className="border p-3 w-full rounded"
        />

        {orderMode === "delivery" && (
          <input
            placeholder="Dirección"
            value={customer.address}
            onChange={(e) =>
              setCustomer({ ...customer, address: e.target.value })
            }
            className="border p-3 w-full rounded"
          />
        )}
      </div>

      {/* COUPON */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            placeholder="Cupón"
            value={couponCode}
            onChange={(e) =>
              setCouponCode(e.target.value.toUpperCase())
            }
            className="border p-3 flex-1 rounded"
          />

          <button
            onClick={applyCoupon}
            className="bg-gray-900 text-white px-4 rounded"
          >
            Aplicar
          </button>
        </div>

        {/* ERROR */}
        {couponError && (
          <div className="text-sm bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded">
            {couponError}
          </div>
        )}

        {/* SUCCESS */}
        {appliedCoupon && (
          <div className="text-sm bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded">
            Cupón <strong>{appliedCoupon.code}</strong> aplicado 🎉
          </div>
        )}

        {/* REQUIERE TELÉFONO */}
        {couponRequiresPhone && !customer.phone && (
          <div className="text-sm bg-yellow-50 border border-yellow-200 text-yellow-700 px-3 py-2 rounded">
            Este cupón requiere ingresar un teléfono válido
          </div>
        )}
      </div>

      {/* SUMMARY */}
      <div className="border-t pt-4 space-y-2">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>${subtotal}</span>
        </div>

        {orderMode === "delivery" && (
          <div className="flex justify-between">
            <span>Envío</span>
            <span>${shipping}</span>
          </div>
        )}

        {discount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Descuento</span>
            <span>- ${discount}</span>
          </div>
        )}

        <div className="flex justify-between font-bold text-lg">
          <span>Total</span>
          <span>${total}</span>
        </div>
      </div>

      {/* SUBMIT */}
      <button
        onClick={handleSubmit}
        disabled={!isValid() || loading || isPhoneMissingForCoupon}
        className="w-full bg-green-600 text-white py-3 rounded disabled:opacity-50"
      >
        {loading ? "Enviando..." : "Confirmar pedido"}
      </button>
    </div>
  );
}