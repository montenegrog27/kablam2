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
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium"
          style={{ fontFamily }}
        >
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
            <ArrowLeft size={15} />
          </div>
          Volver
        </button>
        <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full">
          <ShoppingCart size={14} />
          <span style={{ fontFamily }} className="font-medium">
            {cart.length} {cart.length === 1 ? "item" : "items"}
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:gap-8 lg:grid-cols-3">
        {/* Columna izquierda - Información del cliente y pago */}
        <div className="lg:col-span-2 space-y-5">
          {/* Sección de información del cliente */}
          <div className="bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200 p-5 md:p-6">
            <h2
              className="font-semibold text-gray-900 text-lg mb-5 flex items-center gap-2.5"
              style={{ fontFamily }}
            >
              <div className="w-8 h-8 rounded-xl bg-gray-900 text-white flex items-center justify-center">
                <User size={16} />
              </div>
              Tus datos
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" style={{ fontFamily }}>
                  Nombre completo
                </label>
                <div className="relative group">
                  <input
                    placeholder="Ej: Juan Pérez"
                    value={customer.name}
                    onChange={(e) => setCustomer((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-white border border-gray-200 rounded-xl pl-4 pr-4 py-3.5 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900/20 focus:border-gray-400 transition-all text-base hover:border-gray-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" style={{ fontFamily }}>
                  Teléfono
                </label>
                <div className="relative group">
                  <input
                    placeholder="379412345678"
                    value={customer.phone}
                    onChange={(e) => setCustomer((prev) => ({ ...prev, phone: e.target.value.replace(/\D/g, "") }))}
                    className="w-full bg-white border border-gray-200 rounded-xl pl-4 pr-4 py-3.5 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900/20 focus:border-gray-400 transition-all text-base hover:border-gray-300"
                  />
                </div>
              </div>

              {orderMode === "delivery" && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" style={{ fontFamily }}>Dirección de entrega</label>
                  <div className="space-y-2.5">
                    <div className="relative group">
                      <input
                        ref={addressInputRef}
                        placeholder="Calle, número, ciudad..."
                        value={customer.address}
                        onChange={(e) => { setCustomer((prev) => ({ ...prev, address: e.target.value })); setSelectedAddressId(""); }}
                        className="w-full bg-white border border-gray-200 rounded-xl pl-4 pr-4 py-3.5 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900/20 focus:border-gray-400 transition-all text-base hover:border-gray-300"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => { setShowMapModal(true); if (branchLat && branchLng) { setMapLat(branchLat); setMapLng(branchLng); } }}
                      className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
                    >
                      <MapIcon size={15} /> Indicar en el mapa
                    </button>

                    {customerLat && customerLng && shippingCost > 0 && (
                      <div className="text-sm text-gray-600 flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 rounded-xl">
                        <Truck size={15} className="text-emerald-600" />
                        <span className="font-medium text-emerald-700">Envío: ${shippingCost.toLocaleString("es-AR")}</span>
                      </div>
                    )}
                    {customerLat && customerLng && shippingCost === 0 && deliverySettings?.free_shipping_radius && (
                      <div className="text-sm flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 rounded-xl">
                        <Truck size={15} className="text-emerald-600" />
                        <span className="font-medium text-emerald-700">Envío gratis</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {orderMode === "takeaway" && (
                <div className="flex items-center gap-3 text-sm text-gray-700 bg-amber-50 border border-amber-200 p-3.5 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Package size={15} className="text-amber-600" />
                  </div>
                  <span className="font-medium" style={{ fontFamily }}>Retirás tu pedido en el local</span>
                </div>
              )}
            </div>
          </div>

          {/* Sección de cupón */}
          <div className="bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200 p-5 md:p-6">
            <h2 className="font-semibold text-gray-900 text-lg mb-5 flex items-center gap-2.5" style={{ fontFamily }}>
              <div className="w-8 h-8 rounded-xl bg-gray-900 text-white flex items-center justify-center">
                <Tag size={16} />
              </div>
              Cupón de descuento
            </h2>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    placeholder="Código de cupón"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    className="w-full bg-white border border-gray-200 rounded-xl pl-4 pr-4 py-3.5 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900/20 focus:border-gray-400 transition-all text-base hover:border-gray-300"
                  />
                </div>
                <button
                  onClick={applyCoupon}
                  className="bg-gray-900 hover:bg-black text-white font-semibold px-6 py-3.5 rounded-xl transition-all text-sm whitespace-nowrap active:scale-[0.97]"
                  style={{ fontFamily }}
                >
                  Aplicar
                </button>
              </div>

              {couponError && (
                <div className="flex items-center gap-2.5 text-sm bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  <span style={{ fontFamily }}>{couponError}</span>
                </div>
              )}

              {appliedCoupon && (
                <div className="flex items-center gap-2.5 text-sm bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl">
                  <CheckCircle size={16} className="flex-shrink-0" />
                  <span style={{ fontFamily }}>
                    Cupón <strong>{appliedCoupon.code}</strong> aplicado
                  </span>
                </div>
              )}

              {couponRequiresPhone && !customer.phone && (
                <div className="flex items-center gap-2.5 text-sm bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-xl">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  <span style={{ fontFamily }}>Este cupón requiere ingresar un teléfono</span>
                </div>
              )}

              {appliedCoupon && (
                <div className="flex items-center gap-2.5 text-sm bg-emerald-50 border border-emerald-100 text-emerald-700 px-4 py-3 rounded-xl">
                  <CheckCircle size={16} className="flex-shrink-0" />
                  <span style={{ fontFamily }}>
                    Cupón <strong>{appliedCoupon.code}</strong> aplicado
                  </span>
                </div>
              )}

              {couponRequiresPhone && !customer.phone && (
                <div className="flex items-center gap-2.5 text-sm bg-amber-50 border border-amber-100 text-amber-700 px-4 py-3 rounded-xl">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  <span style={{ fontFamily }}>Este cupón requiere ingresar un teléfono</span>
                </div>
              )}
            </div>
          </div>

          {/* Sección de método de pago */}
          <div className="bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200 p-5 md:p-6">
            <h2 className="font-semibold text-gray-900 text-lg mb-5 flex items-center gap-2.5" style={{ fontFamily }}>
              <div className="w-8 h-8 rounded-xl bg-gray-900 text-white flex items-center justify-center">
                <CreditCard size={16} />
              </div>
              Método de pago
            </h2>
            <div className="space-y-3">
              {paymentMethods.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-3">Cargando métodos de pago...</div>
              ) : (
                <div className="grid gap-2.5">
                  {paymentMethods.map((pm) => {
                    const selected = selectedPaymentMethod === pm.id;
                    return (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setSelectedPaymentMethod(pm.id)}
                        className={`w-full text-left px-4 py-3.5 rounded-xl border-2 transition-all flex items-center gap-3 ${
                          selected
                            ? "border-gray-900 bg-gray-50"
                            : "border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50"
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          selected ? "border-gray-900" : "border-gray-300"
                        }`}>
                          {selected && <div className="w-2.5 h-2.5 rounded-full bg-gray-900" />}
                        </div>
                        <span className={`font-medium text-sm ${selected ? "text-gray-900" : "text-gray-600"}`} style={{ fontFamily }}>
                          {pm.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedMethod?.requires_reference && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" style={{ fontFamily }}>
                    Referencia / comprobante
                  </label>
                  <input
                    type="text"
                    placeholder="Número de operación"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    className="w-full bg-gray-50 border-0 rounded-xl px-4 py-3.5 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900/20 focus:bg-white transition-all text-base"
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    Ingresá el número de operación que te dio la plataforma de pago
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Columna derecha - Resumen y CTA */}
        <div className="lg:col-span-1 space-y-5">
          {/* Resumen del pedido */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6 sticky top-4">
            <h2 className="font-semibold text-gray-900 text-lg mb-5 flex items-center gap-2.5" style={{ fontFamily }}>
              <div className="w-8 h-8 rounded-xl bg-gray-900 text-white flex items-center justify-center">
                <ShoppingCart size={16} />
              </div>
              Tu pedido
            </h2>

            {/* Lista de items */}
            <div className="space-y-2 mb-5 max-h-72 overflow-y-auto -mx-1 px-1">
              {cart.map((item) => (
                <div
                  key={item.uid}
                  className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl group hover:bg-gray-100 transition-colors border border-gray-100"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      ${item.price.toLocaleString("es-AR")} c/u
                    </p>
                    {item.extras && item.extras.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.extras.map((ex: any, ei: number) => (
                          <span key={ei} className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
                            + {ex.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {item.removedIngredients && item.removedIngredients.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.removedIngredients.map((ri: any, rii: number) => (
                          <span key={rii} className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full">
                            ✕ {ri.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                    <button
                      onClick={() => {
                        if (item.quantity > 1) {
                          onUpdateCart(cart.map((c) => c.uid === item.uid ? { ...c, quantity: c.quantity - 1 } : c));
                        } else {
                          onUpdateCart(cart.filter((c) => c.uid !== item.uid));
                        }
                      }}
                      className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      {item.quantity > 1 ? <Minus size={11} /> : <Trash2 size={11} />}
                    </button>
                    <span className="text-sm font-semibold min-w-[22px] text-center text-gray-900">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => onUpdateCart(cart.map((c) => c.uid === item.uid ? { ...c, quantity: c.quantity + 1 } : c))}
                      className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 min-w-[60px] text-right tabular-nums">
                    ${(item.price * item.quantity).toLocaleString("es-AR")}
                  </span>
                </div>
              ))}
              {cart.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No hay productos en tu pedido</p>
              )}
            </div>

            {/* Totales */}
            <div className="space-y-2.5 border-t-2 border-gray-100 pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500" style={{ fontFamily }}>Subtotal</span>
                <span className="font-medium text-gray-900 tabular-nums">${subtotal.toLocaleString("es-AR")}</span>
              </div>

              {orderMode === "delivery" && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-1.5" style={{ fontFamily }}>
                    <Truck size={14} className="text-gray-400" />
                    Envío
                  </span>
                  <span className="font-medium text-gray-900 tabular-nums">
                    {shipping === 0 && deliverySettings?.free_shipping_radius
                      ? <span className="text-emerald-600">Gratis</span>
                      : `$${shipping.toLocaleString("es-AR")}`}
                  </span>
                </div>
              )}

              {discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500" style={{ fontFamily }}>Descuento</span>
                  <span className="font-medium text-emerald-600 tabular-nums">- ${discount.toLocaleString("es-AR")}</span>
                </div>
              )}

              <div className="border-t border-gray-100 pt-3 mt-3">
                <div className="flex justify-between items-baseline">
                  <span className="font-semibold text-gray-900" style={{ fontFamily }}>Total</span>
                  <span className="font-bold text-xl text-gray-900 tabular-nums">${total.toLocaleString("es-AR")}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1.5" style={{ fontFamily }}>
                  {orderMode === "delivery" ? "Incluye envío a domicilio" : "Retiro en el local"}
                </p>
              </div>
            </div>

            {/* Botón de confirmar */}
            <div className="mt-6">
              <button
                onClick={handleSubmit}
                disabled={!isValid() || loading || isPhoneMissingForCoupon}
                className="w-full bg-gray-900 hover:bg-black text-white font-semibold py-4 rounded-xl transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2.5 text-base shadow-sm hover:shadow-md"
                style={{ fontFamily }}
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Procesando...
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} />
                    Confirmar pedido
                  </>
                )}
              </button>

              {/* Validation hints */}
              {!isValid() && (
                <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs font-semibold text-amber-800 mb-2" style={{ fontFamily }}>Completá los datos faltantes:</p>
                  <ul className="text-xs text-amber-700 space-y-1" style={{ fontFamily }}>
                    {!customer.name && <li className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-amber-400" /> Nombre</li>}
                    {!customer.phone && <li className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-amber-400" /> Teléfono</li>}
                    {orderMode === "delivery" && !customer.address && <li className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-amber-400" /> Dirección</li>}
                    {!selectedPaymentMethod && <li className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-amber-400" /> Método de pago</li>}
                    {selectedMethod?.requires_reference && !paymentReference.trim() && <li className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-amber-400" /> Referencia de pago</li>}
                  </ul>
                </div>
              )}
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
        </div>
      </div>

      {/* Modal Mapa */}
      {showMapModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Seleccionar ubicación</h3>
              <button onClick={() => setShowMapModal(false)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"><X size={18} /></button>
            </div>
            <div className="p-4">
              <div ref={mapRef} className="w-full h-[320px] rounded-xl border bg-gray-50 flex items-center justify-center">
                {!(window as any).google ? (
                  <p className="text-gray-400 text-sm">Cargando mapa...</p>
                ) : (
                  <p className="text-gray-400 text-sm">Hacé clic en el mapa para marcar</p>
                )}
              </div>
            </div>
            <div className="px-4 pb-4 flex gap-3">
              <button onClick={() => setShowMapModal(false)} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
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
                className="flex-1 py-3 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-black disabled:opacity-40 transition-colors"
              >Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
