"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { CartItem, Branding } from "@/types/menu";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import UpsellSuggestions from "./UpsellSuggestions";
import {
  User,
  Phone,
  MapPin,
  Tag,
  CreditCard,
  ArrowLeft,
  ShoppingCart,
  Truck,
  Package,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

type Props = {
  cart: CartItem[];
  orderMode: "delivery" | "takeaway";
  branchSlug: string;
  onBack: () => void;
  onAddToCart: (item: CartItem) => void;
  onUpdateCart: (cart: CartItem[]) => void;
  branding?: Branding;
};

type PaymentMethod = {
  id: string;
  name: string;
  requires_reference: boolean;
};

type Coupon = {
  id: string;
  code: string;
  requires_phone?: boolean;
  discount_type?: string;
  discount_value?: number;
  has_expiration?: boolean;
  expires_at?: string;
  usage_type?: string;
  usage_limit?: number;
  allowed_phone?: string;
  is_active?: boolean;
};

export default function CheckoutForm({
  cart,
  orderMode,
  branchSlug,
  onBack,
  onAddToCart,
  onUpdateCart, // eslint-disable-next-line @typescript-eslint/no-unused-vars
  branding,
}: Props) {
  const [customer, setCustomer] = useState({
    name: "",
    phone: "",
    address: "",
  });

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [discount, setDiscount] = useState(0);
  const [couponError, setCouponError] = useState("");

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<string>("");
  const [paymentReference, setPaymentReference] = useState("");

  const [loading, setLoading] = useState(false);

  const fontFamily =
    branding?.font_family || branding?.font_primary || "inherit";

  const loadPaymentMethods = useCallback(async () => {
    console.log(
      "CHECKOUT: loading payment methods for branchSlug:",
      branchSlug,
    );

    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("id")
      .eq("slug", branchSlug)
      .single();

    console.log("CHECKOUT: branch result:", { branch, branchError });

    if (!branch) {
      console.log("CHECKOUT: branch not found");
      return;
    }

    // Traer métodos específicos de la branch O métodos del tenant (branch_id = null)
    const { data: methods, error: methodsError } = await supabase
      .from("payment_methods")
      .select("id, name, requires_reference")
      .eq("is_active", true)
      .or(`branch_id.eq.${branch.id},branch_id.is.null`)
      .order("name");

    console.log("CHECKOUT: payment methods result:", { methods, methodsError });

    if (methods && methods.length > 0) {
      setPaymentMethods(methods);
      setSelectedPaymentMethod(methods[0].id);
    }
  }, [branchSlug]);

  useEffect(() => {
    console.log("CHECKOUT: loadPaymentMethods called, branchSlug:", branchSlug);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPaymentMethods();
  }, [branchSlug, loadPaymentMethods]);

  /* =========================
     CALCULOS
  ========================= */

  const subtotal = useMemo(
    () => cart.reduce((acc, p) => acc + p.price * p.quantity, 0),
    [cart],
  );

  const shipping = orderMode === "delivery" ? 500 : 0;

  const total = Math.max(subtotal + shipping - discount, 0);

  /* =========================
     VALIDACIONES
   ========================= */

  const selectedMethod = paymentMethods.find(
    (pm) => pm.id === selectedPaymentMethod,
  );

  const isValid = () => {
    if (!customer.name || !customer.phone) return false;
    if (orderMode === "delivery" && !customer.address) return false;
    if (!selectedPaymentMethod) return false;
    if (selectedMethod?.requires_reference && !paymentReference.trim())
      return false;
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
    console.log("CART:", cart);
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
        items: cart.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
        })),
        total,
        couponCode: appliedCoupon?.code || null,
        paymentMethodId: selectedPaymentMethod,
        paymentReference: selectedMethod?.requires_reference
          ? paymentReference
          : null,
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
    <div className="max-w-6xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors text-sm"
          style={{ fontFamily }}
        >
          <ArrowLeft size={16} />
          Cambiar tipo de pedido
        </button>
        <div className="h-4 w-px bg-gray-300"></div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <ShoppingCart size={16} />
          <span style={{ fontFamily }}>
            {cart.length} producto{cart.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Columna izquierda - Información del cliente y pago */}
        <div className="md:col-span-2 space-y-6">
          {/* Sección de información del cliente */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2
              className="font-semibold text-gray-900 text-lg mb-4 flex items-center gap-2"
              style={{ fontFamily }}
            >
              <User size={18} />
              Información del cliente
            </h2>
            <div className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium text-gray-700 mb-1"
                  style={{ fontFamily }}
                >
                  Nombre completo
                </label>
                <div className="relative">
                  <User
                    size={16}
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  />
                  <input
                    placeholder="Ingresá tu nombre"
                    value={customer.name}
                    onChange={(e) =>
                      setCustomer({ ...customer, name: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                  />
                </div>
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-gray-700 mb-1"
                  style={{ fontFamily }}
                >
                  Teléfono
                </label>
                <div className="relative">
                  <Phone
                    size={16}
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  />
                  <input
                    placeholder="11 1234 5678"
                    value={customer.phone}
                    onChange={(e) =>
                      setCustomer({
                        ...customer,
                        phone: e.target.value.replace(/\D/g, ""),
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                  />
                </div>
              </div>

              {orderMode === "delivery" && (
                <div>
                  <label
                    className="block text-sm font-medium text-gray-700 mb-1"
                    style={{ fontFamily }}
                  >
                    Dirección de entrega
                  </label>
                  <div className="relative">
                    <MapPin
                      size={16}
                      className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    />
                    <input
                      placeholder="Calle, número, piso, departamento"
                      value={customer.address}
                      onChange={(e) =>
                        setCustomer({ ...customer, address: e.target.value })
                      }
                      className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                    />
                  </div>
                </div>
              )}

              {orderMode === "takeaway" && (
                <div className="flex items-center gap-2 text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
                  <Package size={16} />
                  <span>Retirarás tu pedido en el local</span>
                </div>
              )}
            </div>
          </div>

          {/* Sección de cupón */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2
              className="font-semibold text-gray-900 text-lg mb-4 flex items-center gap-2"
              style={{ fontFamily }}
            >
              <Tag size={18} />
              Cupón de descuento
            </h2>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Tag
                    size={16}
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  />
                  <input
                    placeholder="Ingresá código de cupón"
                    value={couponCode}
                    onChange={(e) =>
                      setCouponCode(e.target.value.toUpperCase())
                    }
                    className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                  />
                </div>
                <button
                  onClick={applyCoupon}
                  className="bg-gray-900 hover:bg-black text-white font-medium px-5 py-3 rounded-lg transition-colors text-sm whitespace-nowrap"
                  style={{ fontFamily }}
                >
                  Aplicar
                </button>
              </div>

              {/* Mensajes de cupón */}
              {couponError && (
                <div className="flex items-center gap-2 text-sm bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  <AlertCircle size={16} />
                  <span style={{ fontFamily }}>{couponError}</span>
                </div>
              )}

              {appliedCoupon && (
                <div className="flex items-center gap-2 text-sm bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
                  <CheckCircle size={16} />
                  <span style={{ fontFamily }}>
                    Cupón <strong>{appliedCoupon.code}</strong> aplicado
                    correctamente
                  </span>
                </div>
              )}

              {couponRequiresPhone && !customer.phone && (
                <div className="flex items-center gap-2 text-sm bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-lg">
                  <AlertCircle size={16} />
                  <span style={{ fontFamily }}>
                    Este cupón requiere ingresar un teléfono válido
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Sección de método de pago */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2
              className="font-semibold text-gray-900 text-lg mb-4 flex items-center gap-2"
              style={{ fontFamily }}
            >
              <CreditCard size={18} />
              Método de pago
            </h2>
            <div className="space-y-4">
              <div>
                <label
                  className="block text-sm font-medium text-gray-700 mb-2"
                  style={{ fontFamily }}
                >
                  Seleccioná cómo vas a pagar
                </label>
                <select
                  value={selectedPaymentMethod}
                  onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition appearance-none bg-white"
                >
                  <option value="">Elegí una opción...</option>
                  {paymentMethods.map((pm) => (
                    <option key={pm.id} value={pm.id}>
                      {pm.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedMethod?.requires_reference && (
                <div>
                  <label
                    className="block text-sm font-medium text-gray-700 mb-1"
                    style={{ fontFamily }}
                  >
                    Referencia / comprobante
                  </label>
                  <input
                    type="text"
                    placeholder="Número de operación o comprobante"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Ingresá el número de operación que te dio la plataforma de
                    pago
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Columna derecha - Resumen y sugerencias */}
        <div className="md:col-span-1 space-y-6">
          {/* Resumen del pedido */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2
              className="font-semibold text-gray-900 text-lg mb-4"
              style={{ fontFamily }}
            >
              Resumen del pedido
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600" style={{ fontFamily }}>
                  Subtotal
                </span>
                <span className="font-medium">${subtotal}</span>
              </div>

              {orderMode === "delivery" && (
                <div className="flex justify-between text-sm">
                  <span
                    className="text-gray-600 flex items-center gap-1"
                    style={{ fontFamily }}
                  >
                    <Truck size={14} />
                    Envío
                  </span>
                  <span className="font-medium">${shipping}</span>
                </div>
              )}

              {discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600" style={{ fontFamily }}>
                    Descuento
                  </span>
                  <span className="font-medium text-green-600">
                    - ${discount}
                  </span>
                </div>
              )}

              <div className="border-t border-gray-200 pt-3 mt-3">
                <div className="flex justify-between">
                  <span
                    className="font-semibold text-gray-900"
                    style={{ fontFamily }}
                  >
                    Total
                  </span>
                  <span className="font-bold text-lg text-gray-900">
                    ${total}
                  </span>
                </div>
                <p
                  className="text-xs text-gray-500 mt-2"
                  style={{ fontFamily }}
                >
                  {orderMode === "delivery"
                    ? "Incluye envío a domicilio"
                    : "Retiro en el local"}
                </p>
              </div>
            </div>
          </div>

          {/* Sugerencias */}
          <UpsellSuggestions
            branchSlug={branchSlug}
            cartItems={cart}
            onAddSuggestion={onAddToCart}
            onUpdateCart={onUpdateCart}
            branding={branding}
          />

          {/* Botón de confirmar */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 p-5 -mx-5 -mb-5 rounded-b-xl">
            <button
              onClick={handleSubmit}
              disabled={!isValid() || loading || isPhoneMissingForCoupon}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ fontFamily }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Procesando pedido...
                </>
              ) : (
                <>
                  <CheckCircle size={18} />
                  Confirmar pedido
                </>
              )}
            </button>
            <p
              className="text-xs text-gray-500 mt-3 text-center"
              style={{ fontFamily }}
            >
              Al confirmar, aceptás nuestros términos y condiciones
            </p>

            {/* Validación de datos */}
            {!isValid() && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-700" style={{ fontFamily }}>
                  Completá todos los datos requeridos para confirmar el pedido
                </p>
                <ul
                  className="text-xs text-yellow-600 mt-1 list-disc list-inside"
                  style={{ fontFamily }}
                >
                  {!customer.name && <li>Nombre completo</li>}
                  {!customer.phone && <li>Teléfono</li>}
                  {orderMode === "delivery" && !customer.address && (
                    <li>Dirección de entrega</li>
                  )}
                  {!selectedPaymentMethod && <li>Método de pago</li>}
                  {selectedMethod?.requires_reference &&
                    !paymentReference.trim() && <li>Referencia de pago</li>}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
