"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function CheckoutPage() {
  const params = useParams();
  const branchSlug = params.branchSlug as string;

  const [cart, setCart] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponCode, setCouponCode] = useState("");
  const [discount, setDiscount] = useState(0);

  /* =========================
     LOAD CART
  ========================= */

  useEffect(() => {
    if (!branchSlug) return;

    const stored = sessionStorage.getItem(`cart_${branchSlug}`);
    if (stored) setCart(JSON.parse(stored));
  }, [branchSlug]);

  /* =========================
     CALCULOS
  ========================= */

  const subtotal = cart.reduce(
    (acc, p) => acc + p.price * p.quantity,
    0
  );

  const total = Math.max(subtotal - discount, 0);

  /* =========================
     COUPON
  ========================= */

  const applyCoupon = async () => {
    if (!couponCode || !branchSlug) return;

    const phoneNormalized = phone.replace(/\D/g, "");

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
      alert(data.message);
      return;
    }

    setDiscount(data.discountAmount || 0);
    setAppliedCoupon(data.coupon);
  };

  /* =========================
     VALIDACIONES UX
  ========================= */

  const couponRequiresPhone = appliedCoupon?.requires_phone === true;

  const isPhoneMissingForCoupon =
    couponRequiresPhone && !phone?.trim();

  /* =========================
     SUBMIT
  ========================= */

  const handleConfirm = async () => {
    if (!branchSlug) return;

    const phoneNormalized = phone.replace(/\D/g, "");

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        branchSlug,
        name,
        phone: phoneNormalized,
        address,
        items: cart,
        total,
      }),
    });

    const data = await res.json();

    if (data.success) {
      sessionStorage.removeItem(`cart_${branchSlug}`);
      window.location.href = `/${branchSlug}/success`;
    }
  };

  /* =========================
     UI
  ========================= */

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Checkout</h1>

      {/* CUSTOMER */}
      <input
        placeholder="Nombre"
        className="border p-2 w-full"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <input
        placeholder="Teléfono"
        className="border p-2 w-full"
        value={phone}
        onChange={(e) =>
          setPhone(e.target.value.replace(/\D/g, ""))
        }
      />

      <input
        placeholder="Dirección"
        className="border p-2 w-full"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />

      {/* COUPON */}
      <div className="flex gap-2">
        <input
          placeholder="Cupón"
          className="border p-2 flex-1"
          value={couponCode}
          onChange={(e) =>
            setCouponCode(e.target.value.toUpperCase())
          }
        />

        <button
          onClick={applyCoupon}
          className="bg-black text-white px-4"
        >
          Aplicar
        </button>
      </div>

      {/* MENSAJES CUPÓN */}
      {appliedCoupon && (
        <div className="bg-green-100 text-green-700 p-2 rounded">
          Cupón aplicado: {appliedCoupon.code}
        </div>
      )}

      {couponRequiresPhone && !phone && (
        <div className="text-sm text-yellow-600">
          Este cupón requiere ingresar un teléfono
        </div>
      )}

      {/* SUMMARY */}
      <div className="border-t pt-3 space-y-1">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>${subtotal}</span>
        </div>

        {discount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Descuento</span>
            <span>- ${discount}</span>
          </div>
        )}

        <div className="flex justify-between font-bold">
          <span>Total</span>
          <span>${total}</span>
        </div>
      </div>

      <button
        onClick={handleConfirm}
        disabled={isPhoneMissingForCoupon}
        className="w-full bg-black text-white py-3 disabled:opacity-50"
      >
        Confirmar pedido
      </button>
    </div>
  );
}