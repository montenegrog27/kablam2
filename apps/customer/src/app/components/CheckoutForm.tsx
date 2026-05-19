"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import type { CartItem, Branding } from "@/types/menu";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import UpsellSuggestions from "./UpsellSuggestions";
import { Map as MapIcon, Navigation } from "lucide-react";
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
  Plus,
  Minus,
  Trash2,
  X,
} from "lucide-react";

function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateShippingCost(distanceKm: number, settings: any) {
  if (!settings?.enabled) return 0;
  if (settings.max_distance_km && distanceKm > settings.max_distance_km) return null;
  if (settings.free_shipping_radius && distanceKm <= settings.free_shipping_radius) return 0;
  return Math.ceil(((settings.base_delivery_cost || 0) + distanceKm * (settings.price_per_km || 0)) / 100) * 100;
}

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

  const [customerLat, setCustomerLat] = useState<number | null>(null);
  const [customerLng, setCustomerLng] = useState<number | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [showMapModal, setShowMapModal] = useState(false);
  const [mapLat, setMapLat] = useState<number | null>(null);
  const [mapLng, setMapLng] = useState<number | null>(null);
  const [branchLat, setBranchLat] = useState<number | null>(null);
  const [branchLng, setBranchLng] = useState<number | null>(null);
  const [deliverySettings, setDeliverySettings] = useState<any>(null);
  const [shippingCost, setShippingCost] = useState(0);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<any>(null);

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
    loadPaymentMethods();
    loadDeliveryData();
  }, [branchSlug, loadPaymentMethods]);

  const loadDeliveryData = async () => {
    const { data: branch } = await supabase.from("branches").select("id, lat, lng").eq("slug", branchSlug).single();
    if (!branch) return;
    setBranchLat(branch.lat ? Number(branch.lat) : null);
    setBranchLng(branch.lng ? Number(branch.lng) : null);

    const { data: settings } = await supabase.from("delivery_settings").select("*").eq("branch_id", branch.id).maybeSingle();
    if (settings) setDeliverySettings(settings);

    // Cargar direcciones guardadas
    try {
      const res = await fetch("/api/account/addresses");
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          setSavedAddresses(data);
          // Auto-seleccionar dirección predeterminada
          const def = data.find((a: any) => a.is_default) || data[0];
          setSelectedAddressId(def.id);
          setCustomer((c) => ({ ...c, address: def.address }));
          if (def.latitude && def.longitude) {
            setCustomerLat(Number(def.latitude));
            setCustomerLng(Number(def.longitude));
          }
        }
      }
    } catch {}
  };

  // Calcular costo de envío cuando cambia la ubicación
  useEffect(() => {
    if (orderMode !== "delivery" || !customerLat || !customerLng || !branchLat || !branchLng || !deliverySettings) {
      setShippingCost(0);
      return;
    }
    const distance = calculateDistanceKm(branchLat, branchLng, customerLat, customerLng);
    const cost = calculateShippingCost(distance, deliverySettings);
    setShippingCost(cost ?? 0);
  }, [customerLat, customerLng, branchLat, branchLng, deliverySettings, orderMode]);

  // Google Maps Autocomplete
  useEffect(() => {
    if (orderMode !== "delivery" || !addressInputRef.current || !(window as any).google) return;
    const input = addressInputRef.current;
    const corrientesBounds = new (window as any).google.maps.LatLngBounds(
      new (window as any).google.maps.LatLng(-27.55, -58.88),
      new (window as any).google.maps.LatLng(-27.42, -58.75),
    );
    const autocomplete = new (window as any).google.maps.places.Autocomplete(input, {
      componentRestrictions: { country: "ar" },
      bounds: corrientesBounds,
      strictBounds: true,
    });
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (place.geometry) {
        setCustomer((prev) => ({ ...prev, address: place.formatted_address || input.value }));
        setCustomerLat(place.geometry.location.lat());
        setCustomerLng(place.geometry.location.lng());
        setSelectedAddressId("__autocomplete__");
      }
    });
  }, [orderMode]);

  // Inicializar mapa en el modal
  useEffect(() => {
    if (!showMapModal || !mapRef.current || !(window as any).google) return;
    const google = (window as any).google;
    const center = mapLat && mapLng ? { lat: mapLat, lng: mapLng } : branchLat && branchLng
      ? { lat: branchLat, lng: branchLng }
      : { lat: -27.45, lng: -58.98 };

    const map = new google.maps.Map(mapRef.current, {
      center,
      zoom: 14,
      mapTypeId: "roadmap",
    });

    let marker: any = null;

    if (mapLat && mapLng) {
      marker = new google.maps.Marker({ position: { lat: mapLat, lng: mapLng }, map, draggable: true });
      marker.addListener("dragend", () => {
        setMapLat(marker.getPosition().lat());
        setMapLng(marker.getPosition().lng());
      });
    }

    map.addListener("click", (e: any) => {
      const pos = e.latLng;
      if (marker) marker.setMap(null);
      marker = new google.maps.Marker({ position: pos, map, draggable: true });
      marker.addListener("dragend", () => {
        setMapLat(marker.getPosition().lat());
        setMapLng(marker.getPosition().lng());
      });
      setMapLat(pos.lat());
      setMapLng(pos.lng());
    });

    return () => { if (marker) marker.setMap(null); };
  }, [showMapModal]);

  /* =========================
     CALCULOS
  ========================= */

  const subtotal = useMemo(
    () => cart.reduce((acc, p) => acc + p.price * p.quantity, 0),
    [cart],
  );

  const shipping = orderMode === "delivery" ? shippingCost : 0;

  const total = Math.max(subtotal + shipping - discount, 0);

  const selectedMethod = paymentMethods.find(
    (pm) => pm.id === selectedPaymentMethod,
  );

  const isValid = () => {
    if (!customer.name || !customer.phone) return false;
    if (orderMode === "delivery" && !customer.address) return false;
    if (orderMode === "delivery" && !customerLat && !mapLat && !customer.address) return false;
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
        shippingCost,
        customerLat,
        customerLng,
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
    <div className="w-full max-w-full space-y-6 pb-8 overflow-x-hidden [&_input]:!text-[16px] [&_select]:!text-[16px] [&_textarea]:!text-[16px]">
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
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-900"
                  />
                  <input
                    placeholder="Ingresá tu nombre"
                    value={customer.name}
                    onChange={(e) =>
                      setCustomer((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className="w-full border text-gray-900 border-gray-300 rounded-lg pl-10 pr-4 py-3 text-base md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
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
                    placeholder="379412345678"
                    value={customer.phone}
                    onChange={(e) =>
                      setCustomer((prev) => ({
                        ...prev,
                        phone: e.target.value.replace(/\D/g, ""),
                      }))
                    }
                    className="w-full border text-gray-900 border-gray-300 rounded-lg pl-10 pr-4 py-3 text-base md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                  />
                </div>
              </div>

              {orderMode === "delivery" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" style={{ fontFamily }}>Dirección de entrega</label>
                  <div className="space-y-2">
                    <div className="relative">
                      <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        ref={addressInputRef}
                        placeholder="Calle, número, ciudad..."
                        value={customer.address}
                        onChange={(e) => { setCustomer((prev) => ({ ...prev, address: e.target.value })); setSelectedAddressId(""); }}
                        className="w-full border text-gray-900 border-gray-300 rounded-lg pl-10 pr-4 py-3 text-base md:text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => { setShowMapModal(true); if (branchLat && branchLng) { setMapLat(branchLat); setMapLng(branchLng); } }}
                      className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      <MapIcon size={16} /> Indicar en el mapa
                    </button>

                    {customerLat && customerLng && shippingCost > 0 && (
                      <div className="text-sm text-gray-600 flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg">
                        <Truck size={14} /> Envío: ${shippingCost.toLocaleString("es-AR")}
                      </div>
                    )}
                    {customerLat && customerLng && shippingCost === 0 && deliverySettings?.free_shipping_radius && (
                      <div className="text-sm text-green-600 flex items-center gap-2 bg-green-50 px-3 py-2 rounded-lg">
                        <Truck size={14} /> Envío gratis
                      </div>
                    )}
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
                    className="w-full border text-gray-900 border-gray-300 rounded-lg pl-10 pr-4 py-3 text-base md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
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
                  className="w-full border text-gray-900 border-gray-300 rounded-lg px-4 py-3 text-base md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition appearance-none bg-white"
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
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base md:text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
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

            {/* Lista de items del carrito con controles */}
            <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
              {cart.map((item) => (
                <div
                  key={item.uid}
                  className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-500">${item.price} c/u</p>
                  </div>
                  <div className="flex items-center gap-1 bg-white border rounded-md">
                    <button
                      onClick={() => {
                        if (item.quantity > 1) {
                          onUpdateCart(
                            cart.map((c) =>
                              c.uid === item.uid
                                ? { ...c, quantity: c.quantity - 1 }
                                : c,
                            ),
                          );
                        } else {
                          onUpdateCart(cart.filter((c) => c.uid !== item.uid));
                        }
                      }}
                      className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-red-600 transition-colors rounded-l-md hover:bg-red-50"
                    >
                      {item.quantity > 1 ? (
                        <Minus size={12} />
                      ) : (
                        <Trash2 size={12} />
                      )}
                    </button>
                    <span className="text-sm font-semibold min-w-[24px] text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() =>
                        onUpdateCart(
                          cart.map((c) =>
                            c.uid === item.uid
                              ? { ...c, quantity: c.quantity + 1 }
                              : c,
                          ),
                        )
                      }
                      className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-green-600 transition-colors rounded-r-md hover:bg-green-50"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 min-w-[60px] text-right">
                    ${item.price * item.quantity}
                  </span>
                </div>
              ))}
              {cart.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">
                  No hay productos en tu pedido
                </p>
              )}
            </div>

            <div className="space-y-3 border-t border-gray-200 pt-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600" style={{ fontFamily }}>
                  Subtotal
                </span>
                <span className="font-medium text-gray-600">${subtotal}</span>
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
                  <span className="font-medium text-gray-600">${shipping}</span>
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


            {/* Validación de datos */}
            {!isValid() && (
              <div className="mt-4 p-3 bg-yellow-90 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-700" style={{ fontFamily }}>
                  Completá todos los datos requeridos para confirmar el pedido
                </p>
                <ul
                  className="text-xs text-yellow-900 mt-1 list-disc list-inside"
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

      {/* Modal Mapa */}
      {showMapModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-900">Seleccionar punto de entrega</h3>
              <button onClick={() => setShowMapModal(false)} className="p-1 rounded-full hover:bg-gray-100"><X size={20} /></button>
            </div>
            <div className="p-4">
              <div ref={mapRef} className="w-full h-[400px] rounded-xl border bg-gray-100 flex items-center justify-center">
                {!(window as any).google ? (
                  <p className="text-gray-400 text-sm">Cargando mapa...</p>
                ) : (
                  <p className="text-gray-400 text-sm">Hacé clic en el mapa para marcar tu ubicación</p>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2 text-center">Hacé clic en cualquier parte del mapa para marcar el punto de entrega</p>
            </div>
            <div className="px-4 pb-4 flex gap-2">
              <button onClick={() => setShowMapModal(false)} className="flex-1 py-2.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button
                onClick={() => {
                  if (mapLat && mapLng) {
                    setCustomerLat(mapLat);
                    setCustomerLng(mapLng);
                    setCustomer((c) => ({ ...c, address: `📍 ${mapLat.toFixed(6)}, ${mapLng.toFixed(6)}` }));
                    setShowMapModal(false);
                  }
                }}
                disabled={!mapLat || !mapLng}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >Confirmar ubicación</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
