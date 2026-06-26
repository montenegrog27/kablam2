"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import type { CartItem, Branding } from "@/types/menu";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import UpsellSuggestions from "./UpsellSuggestions";
import { getBrandFontFamily } from "@/lib/fonts";
import { getCartLoyaltyEstimate, type LoyaltyProgram } from "@/lib/loyalty";
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
  Home,
  Building2,
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
  availability?: {
    isOpen: boolean;
    message: string;
    reason: "manual" | "temporary" | "hours" | null;
  };
};

type PaymentMethod = {
  id: string;
  name: string;
  type?: string | null;
  requires_reference: boolean;
};

type Coupon = {
  id: string;
  code: string;
  name?: string;
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

type SavedAddress = {
  id: string;
  alias: string;
  address: string;
  apartment?: string | null;
  floor?: string | null;
  notes?: string | null;
  is_default: boolean;
  latitude?: number | null;
  longitude?: number | null;
};

function normalizePaymentText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isCustomerAllowedPaymentMethod(method: PaymentMethod) {
  const type = normalizePaymentText(method.type);
  const name = normalizePaymentText(method.name);
  return type === "cash" || type === "transfer" || name.includes("efectivo") || name.includes("transferencia");
}

export default function CheckoutForm({
  cart,
  orderMode,
  branchSlug,
  onBack,
  onAddToCart,
  onUpdateCart, // eslint-disable-next-line @typescript-eslint/no-unused-vars
  branding,
  availability,
}: Props) {
  const [customer, setCustomer] = useState({
    name: "",
    phone: "",
    address: "",
    floor: "",
    apartment: "",
  });
  const [addressKind, setAddressKind] = useState<"house" | "apartment">("house");

  const [customerLat, setCustomerLat] = useState<number | null>(null);
  const [customerLng, setCustomerLng] = useState<number | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [showMapModal, setShowMapModal] = useState(false);
  const [mapLat, setMapLat] = useState<number | null>(null);
  const [mapLng, setMapLng] = useState<number | null>(null);
  const [branchLat, setBranchLat] = useState<number | null>(null);
  const [branchLng, setBranchLng] = useState<number | null>(null);
  const [deliverySettings, setDeliverySettings] = useState<any>(null);
  const [shippingCost, setShippingCost] = useState(0);
  const [deliveryOutOfZone, setDeliveryOutOfZone] = useState(false);
  const [shippingPending, setShippingPending] = useState(false);
  const [shippingUnavailable, setShippingUnavailable] = useState(false);
  const [branchLocationMissing, setBranchLocationMissing] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<any>(null);

  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [discount, setDiscount] = useState(0);
  const [couponError, setCouponError] = useState("");
  const [loyalty, setLoyalty] = useState<LoyaltyProgram>({ authenticated: false, rules: [], levels: [] });

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<string>("");
  const [paymentReference, setPaymentReference] = useState("");

  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const fontFamily = getBrandFontFamily(branding);
  const branchIsOpen = availability?.isOpen !== false;
  const closedMessage =
    availability?.message || branding?.web_closed_message || "Estamos cerrados por el momento. Volve a intentar mas tarde.";

  const loadPaymentMethods = useCallback(async () => {
    console.log(
      "CHECKOUT: loading payment methods for branchSlug:",
      branchSlug,
    );

    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("id, tenant_id")
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
      .select("id, name, type, requires_reference")
      .eq("is_active", true)
      .eq("tenant_id", branch.tenant_id)
      .or(`branch_id.eq.${branch.id},branch_id.is.null`)
      .order("name");

    console.log("CHECKOUT: payment methods result:", { methods, methodsError });

    const customerMethods = (methods || []).filter(isCustomerAllowedPaymentMethod);

    if (customerMethods.length > 0) {
      setPaymentMethods(customerMethods);
      setSelectedPaymentMethod(customerMethods[0].id);
    } else {
      setPaymentMethods([]);
      setSelectedPaymentMethod("");
    }
  }, [branchSlug]);

  useEffect(() => {
    fetch(`/api/loyalty?branchSlug=${encodeURIComponent(branchSlug)}`)
      .then((response) => response.json())
      .then((data) => setLoyalty({
        authenticated: Boolean(data.authenticated),
        rules: Array.isArray(data.rules) ? data.rules : [],
        levels: Array.isArray(data.levels) ? data.levels : [],
      }))
      .catch(() => setLoyalty({ authenticated: false, rules: [], levels: [] }));
  }, [branchSlug]);

  async function loadCustomerProfile() {
    try {
      const response = await fetch("/api/account/profile", { cache: "no-store" });
      if (!response.ok) return;

      const data = await response.json();
      const profile = data.customer;

      setCustomer((current) => ({
        ...current,
        name: profile?.name || current.name,
        phone: profile?.phone || current.phone,
      }));
    } catch {
      // Anonymous checkout still works.
    }
  }

  function formatSavedAddress(address: SavedAddress) {
    return [
      address.address,
      address.floor ? `Piso ${address.floor}` : "",
      address.apartment ? `Depto ${address.apartment}` : "",
    ]
      .filter(Boolean)
      .join(", ");
  }

  function buildDeliveryAddress() {
    if (orderMode !== "delivery") return customer.address;

    return [
      customer.address.trim(),
      addressKind === "apartment" && customer.floor.trim()
        ? `Piso ${customer.floor.trim()}`
        : "",
      addressKind === "apartment" && customer.apartment.trim()
        ? `Depto ${customer.apartment.trim()}`
        : "",
    ]
      .filter(Boolean)
      .join(", ");
  }

  function geocodeSavedAddress(address: SavedAddress, retries = 8) {
    if (orderMode !== "delivery") return;

    if (!(window as any).google?.maps?.Geocoder) {
      if (retries > 0) {
        setShippingPending(true);
        window.setTimeout(() => geocodeSavedAddress(address, retries - 1), 400);
        return;
      }
      setShippingPending(false);
      setShippingUnavailable(true);
      return;
    }

    setShippingPending(true);
    setShippingUnavailable(false);
    const geocoder = new (window as any).google.maps.Geocoder();
    geocoder.geocode(
      {
        address: address.address,
        componentRestrictions: { country: "AR" },
      },
      (results: any[], status: string) => {
        setShippingPending(false);
        const location = results?.[0]?.geometry?.location;
        if (status === "OK" && location) {
          setCustomerLat(location.lat());
          setCustomerLng(location.lng());
          setShippingUnavailable(false);
          return;
        }
        setShippingUnavailable(true);
      },
    );
  }

  function selectSavedAddress(address: SavedAddress) {
    setSelectedAddressId(address.id);
    setAddressKind(address.floor || address.apartment ? "apartment" : "house");
    setCustomer((current) => ({
      ...current,
      address: address.address,
      floor: address.floor || "",
      apartment: address.apartment || "",
    }));

    if (address.latitude && address.longitude) {
      setCustomerLat(Number(address.latitude));
      setCustomerLng(Number(address.longitude));
      setShippingUnavailable(false);
    } else {
      setCustomerLat(null);
      setCustomerLng(null);
      geocodeSavedAddress(address);
    }
  }

  async function loadDeliveryData() {
    const { data: branch } = await supabase.from("branches").select("id, tenant_id, lat, lng").eq("slug", branchSlug).single();
    if (!branch) return;
    const nextBranchLat = branch.lat ? Number(branch.lat) : null;
    const nextBranchLng = branch.lng ? Number(branch.lng) : null;
    setBranchLat(nextBranchLat);
    setBranchLng(nextBranchLng);
    setBranchLocationMissing(!nextBranchLat || !nextBranchLng);

    const { data: settings } = await supabase
      .from("delivery_settings")
      .select("*")
      .eq("tenant_id", branch.tenant_id)
      .or(`branch_id.eq.${branch.id},branch_id.is.null`);

    const selectedSettings =
      settings?.find((item) => item.branch_id === branch.id) ||
      settings?.find((item) => !item.branch_id) ||
      settings?.[0];

    setDeliverySettings(selectedSettings || null);

    // Cargar direcciones guardadas
    try {
      const res = await fetch("/api/account/addresses");
      if (res.ok) {
        const data = await res.json();
        const addresses = (data.addresses || []) as SavedAddress[];
        if (addresses.length > 0) {
          setSavedAddresses(addresses);
          // Auto-seleccionar dirección predeterminada
          const def =
            addresses.find((address) => address.is_default) || addresses[0];
          selectSavedAddress(def);
        }
      }
    } catch {}
  }

  // Calcular costo de envío cuando cambia la ubicación
  useEffect(() => {
    void Promise.resolve().then(() => {
      loadPaymentMethods();
      loadCustomerProfile();
      loadDeliveryData();

      const storedAddress = sessionStorage.getItem(
        `checkout_address_${branchSlug}`,
      );
      if (storedAddress) {
        try {
          const address = JSON.parse(storedAddress) as SavedAddress;
          selectSavedAddress(address);
        } catch {
          sessionStorage.removeItem(`checkout_address_${branchSlug}`);
        }
      }
    });
  }, [branchSlug, loadPaymentMethods]);

  useEffect(() => {
    if (orderMode !== "delivery") {
      setShippingCost(0);
      setDeliveryOutOfZone(false);
      setShippingUnavailable(false);
      setBranchLocationMissing(false);
      return;
    }

    if (!customerLat || !customerLng || !branchLat || !branchLng || !deliverySettings) {
      setShippingCost(0);
      setDeliveryOutOfZone(false);
      setBranchLocationMissing(Boolean(deliverySettings?.enabled && (!branchLat || !branchLng)));
      setShippingUnavailable(Boolean(customer.address && !shippingPending && branchLat && branchLng));
      return;
    }

    const distance = calculateDistanceKm(branchLat, branchLng, customerLat, customerLng);
    const cost = calculateShippingCost(distance, deliverySettings);
    setDeliveryOutOfZone(cost === null);
    setShippingCost(cost ?? 0);
    setShippingUnavailable(false);
    setBranchLocationMissing(false);
  }, [customerLat, customerLng, branchLat, branchLng, deliverySettings, orderMode, customer.address, shippingPending]);

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
        setCustomer((prev) => ({
          ...prev,
          address: place.formatted_address || input.value,
          floor: "",
          apartment: "",
        }));
        setCustomerLat(place.geometry.location.lat());
        setCustomerLng(place.geometry.location.lng());
        setSelectedAddressId("__autocomplete__");
        setAddressKind("house");
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
  const loyaltyEstimate = useMemo(
    () => getCartLoyaltyEstimate(cart, loyalty.rules),
    [cart, loyalty.rules],
  );

  const selectedMethod = paymentMethods.find(
    (pm) => pm.id === selectedPaymentMethod,
  );

  const isValid = () => {
    if (!customer.name || !customer.phone) return false;
    if (orderMode === "delivery" && !customer.address) return false;
    if (orderMode === "delivery" && !customerLat && !mapLat && !customer.address) return false;
    if (orderMode === "delivery" && deliverySettings?.enabled && branchLocationMissing) return false;
    if (orderMode === "delivery" && deliverySettings?.enabled && (shippingPending || shippingUnavailable || !customerLat || !customerLng)) return false;
    if (orderMode === "delivery" && deliveryOutOfZone) return false;
    if (!selectedPaymentMethod) return false;
    if (selectedMethod?.requires_reference && !paymentReference.trim())
      return false;
    return true;
  };

  const couponRequiresPhone = appliedCoupon?.requires_phone === true;
  const couponDisplayName = appliedCoupon?.name || appliedCoupon?.code || "tu cupon";
  const customerDisplayName = customer.name.trim() || "crack";

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
    if (!branchIsOpen) {
      setSubmitError(closedMessage);
      return;
    }

    if (orderMode === "delivery" && deliveryOutOfZone) {
      setSubmitError("La direccion esta fuera de la zona de entrega.");
      return;
    }

    if (!isValid() || isPhoneMissingForCoupon) return;

    setLoading(true);
    setSubmitError("");

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
          address: buildDeliveryAddress(),
        },
        items: cart.map((item) => ({
          itemType: item.itemType || "product",
          productId: item.productId,
          comboId: item.comboId,
          variantId: item.variantId,
          quantity: item.quantity,
          extras: item.extras,
          removedIngredients: item.removedIngredients,
          promotion: item.promotion,
          price: item.price,
          name: item.name,
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
    } else {
      setSubmitError(data.error || "No pudimos confirmar el pedido.");
    }

    setLoading(false);
  };

  /* =========================
     UI
  ========================= */

  return (
    <div className="w-full min-w-0 max-w-full space-y-5 pb-8 overflow-x-hidden [&_input]:max-w-full [&_input]:!text-[16px] [&_select]:max-w-full [&_select]:!text-[16px] [&_textarea]:max-w-full [&_textarea]:!text-[16px]">
      {/* Header */}
      {!branchIsOpen && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {closedMessage}
        </div>
      )}

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

      <div className="grid min-w-0 gap-4 sm:gap-6 lg:gap-8 lg:grid-cols-3">
        {/* Columna izquierda - Información del cliente y pago */}
        <div className="min-w-0 lg:col-span-2 space-y-4 sm:space-y-5">
          {/* Sección de información del cliente */}
          <div className="min-w-0 bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200 p-4 sm:p-5 md:p-6">
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
                    {savedAddresses.length > 0 && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {savedAddresses.map((address) => (
                          <button
                            key={address.id}
                            type="button"
                            onClick={() => selectSavedAddress(address)}
                            className={`min-w-0 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                              selectedAddressId === address.id
                                ? "border-gray-900 bg-gray-900 text-white"
                                : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-400"
                            }`}
                          >
                            <span className="block truncate font-bold">
                              {address.alias}
                              {address.is_default ? " · Favorita" : ""}
                            </span>
                            <span className="mt-1 block line-clamp-1 text-xs opacity-80">
                              {formatSavedAddress(address)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="relative group">
                      <input
                        ref={addressInputRef}
                        placeholder="Calle, número, ciudad..."
                        value={customer.address}
                        onChange={(e) => {
                          setCustomer((prev) => ({ ...prev, address: e.target.value }));
                          setSelectedAddressId("");
                          setCustomerLat(null);
                          setCustomerLng(null);
                          setShippingUnavailable(Boolean(e.target.value.trim()));
                        }}
                        className="w-full bg-white border border-gray-200 rounded-xl pl-4 pr-4 py-3.5 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900/20 focus:border-gray-400 transition-all text-base hover:border-gray-300"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAddressKind("house");
                          setCustomer((prev) => ({ ...prev, floor: "", apartment: "" }));
                        }}
                        className={`flex min-w-0 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                          addressKind === "house"
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-400"
                        }`}
                        style={{ fontFamily }}
                      >
                        <Home size={16} />
                        Casa
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddressKind("apartment")}
                        className={`flex min-w-0 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                          addressKind === "apartment"
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-400"
                        }`}
                        style={{ fontFamily }}
                      >
                        <Building2 size={16} />
                        Departamento
                      </button>
                    </div>

                    {addressKind === "apartment" && (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          placeholder="Piso (opcional)"
                          value={customer.floor}
                          onChange={(e) => {
                            setCustomer((prev) => ({ ...prev, floor: e.target.value }));
                            setSelectedAddressId("");
                          }}
                          className="min-w-0 w-full bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900/20 focus:border-gray-400 transition-all text-base hover:border-gray-300"
                        />
                        <input
                          placeholder="Depto (opcional)"
                          value={customer.apartment}
                          onChange={(e) => {
                            setCustomer((prev) => ({ ...prev, apartment: e.target.value }));
                            setSelectedAddressId("");
                          }}
                          className="min-w-0 w-full bg-white border border-gray-200 rounded-xl px-4 py-3.5 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900/20 focus:border-gray-400 transition-all text-base hover:border-gray-300"
                        />
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setShowMapModal(true);
                        setMapLat(customerLat);
                        setMapLng(customerLng);
                      }}
                      className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 font-medium transition-colors"
                    >
                      <MapIcon size={15} /> Indicar en el mapa
                    </button>

                    {shippingPending && (
                      <div className="text-sm text-gray-600 flex items-center gap-2 bg-gray-50 border border-gray-200 px-3.5 py-2.5 rounded-xl">
                        <Truck size={15} className="text-gray-500" />
                        <span className="font-medium text-gray-600">Calculando envio...</span>
                      </div>
                    )}
                    {!shippingPending && branchLocationMissing && (
                      <div className="text-sm flex items-center gap-2 bg-red-50 border border-red-200 px-3.5 py-2.5 rounded-xl">
                        <AlertCircle size={15} className="text-red-600" />
                        <span className="font-medium text-red-700">Esta sucursal todavia no tiene ubicacion configurada para calcular el envio.</span>
                      </div>
                    )}
                    {!shippingPending && !branchLocationMissing && shippingUnavailable && customer.address && (
                      <div className="text-sm flex items-center gap-2 bg-amber-50 border border-amber-200 px-3.5 py-2.5 rounded-xl">
                        <AlertCircle size={15} className="text-amber-600" />
                        <span className="font-medium text-amber-700">Selecciona la direccion del autocompletado o marcala en el mapa para calcular el envio.</span>
                      </div>
                    )}
                    {!shippingPending && customerLat && customerLng && shippingCost > 0 && (
                      <div className="text-sm text-gray-600 flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 rounded-xl">
                        <Truck size={15} className="text-emerald-600" />
                        <span className="font-medium text-emerald-700">Envío: ${shippingCost.toLocaleString("es-AR")}</span>
                      </div>
                    )}
                    {!shippingPending && customerLat && customerLng && deliveryOutOfZone && (
                      <div className="text-sm flex items-center gap-2 bg-red-50 border border-red-200 px-3.5 py-2.5 rounded-xl">
                        <AlertCircle size={15} className="text-red-600" />
                        <span className="font-medium text-red-700">Direccion fuera de zona de entrega</span>
                      </div>
                    )}
                    {!shippingPending && customerLat && customerLng && shippingCost === 0 && deliverySettings?.free_shipping_radius && (
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
          <div className="min-w-0 bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200 p-4 sm:p-5 md:p-6">
            <h2 className="font-semibold text-gray-900 text-lg mb-5 flex items-center gap-2.5" style={{ fontFamily }}>
              <div className="w-8 h-8 rounded-xl bg-gray-900 text-white flex items-center justify-center">
                <Tag size={16} />
              </div>
              Cupón de descuento
            </h2>
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <input
                    placeholder="Código de cupón"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    className="w-full bg-white border border-gray-200 rounded-xl pl-4 pr-4 py-3.5 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-900/20 focus:border-gray-400 transition-all text-base hover:border-gray-300"
                  />
                </div>
                <button
                  onClick={applyCoupon}
                  className="w-full bg-gray-900 hover:bg-black text-white font-semibold px-4 py-3.5 rounded-xl transition-all text-sm whitespace-nowrap active:scale-[0.97] sm:w-auto sm:px-6"
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

              {appliedCoupon && couponRequiresPhone && (
                <div className="flex items-center gap-2.5 text-sm bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl">
                  <CheckCircle size={16} className="flex-shrink-0" />
                  <span style={{ fontFamily }}>
                    Hola <strong>{couponDisplayName}</strong> tu cupón es válido, que lo disfrutes!
                  </span>
                </div>
              )}

              {appliedCoupon && !couponRequiresPhone && (
                <div className="flex items-center gap-2.5 text-sm bg-emerald-50 border border-emerald-100 text-emerald-700 px-4 py-3 rounded-xl">
                  <CheckCircle size={16} className="flex-shrink-0" />
                  <span style={{ fontFamily }}>
                    Cupón <strong>{couponDisplayName}</strong> aplicado
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
          <div className="min-w-0 bg-white rounded-2xl shadow-[0_1px_3px_0_rgba(0,0,0,0.06)] border border-gray-200 p-4 sm:p-5 md:p-6">
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
                        className={`w-full min-w-0 text-left px-4 py-3.5 rounded-xl border-2 transition-all flex items-center gap-3 ${
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
                        <span className={`min-w-0 truncate font-medium text-sm ${selected ? "text-gray-900" : "text-gray-600"}`} style={{ fontFamily }}>
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
        <div className="min-w-0 lg:col-span-1 space-y-5">
          {/* Resumen del pedido */}
          <div className="min-w-0 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 md:p-6 sticky top-4">
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
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 p-2.5 bg-gray-50 rounded-xl group hover:bg-gray-100 transition-colors border border-gray-100 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {item.name}
                    </p>
                    {item.itemType === "promotion" && item.promotion && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white">
                          {item.promotion.badge || "PROMO"}
                        </span>
                        <span className="text-[11px] font-semibold text-gray-400 line-through">
                          ${item.promotion.originalPrice.toLocaleString("es-AR")}
                        </span>
                        <span className="text-[11px] font-bold text-emerald-600">
                          Ahorras ${item.promotion.discountAmount.toLocaleString("es-AR")}
                        </span>
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      ${item.price.toLocaleString("es-AR")} c/u
                    </p>
                    {item.itemType === "promotion" && (item.promotion?.items?.length || 0) > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(item.promotion?.items || []).map((promoItem) => (
                          <span key={`${item.uid}-${promoItem.id}`} className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded-full">
                            {promoItem.name}
                          </span>
                        ))}
                      </div>
                    )}
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
                  <div className="flex items-center gap-1.5 justify-self-end bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
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
                  <span className="col-span-2 justify-self-end text-sm font-semibold text-gray-900 tabular-nums sm:col-span-1 sm:min-w-[60px] sm:text-right">
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
                    {shippingPending
                      ? <span className="text-gray-500">Calculando...</span>
                      : branchLocationMissing
                      ? <span className="text-red-600">Sucursal sin ubicacion</span>
                      : shippingUnavailable || (deliverySettings?.enabled && customer.address && (!customerLat || !customerLng))
                      ? <span className="text-amber-600">Elegí ubicación</span>
                      : deliveryOutOfZone
                      ? <span className="text-red-600">Fuera de zona</span>
                      : shipping === 0 && deliverySettings?.free_shipping_radius
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

              {loyalty.authenticated && loyaltyEstimate.points > 0 && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-bold text-red-700" style={{ fontFamily }}>Puntos Mordisco</span>
                    <span className="font-black text-red-700 tabular-nums">+{loyaltyEstimate.points} pts</span>
                  </div>
                  <p className="mt-1 text-xs text-red-500" style={{ fontFamily }}>
                    Se acreditan cuando el pedido queda confirmado.
                    {loyaltyEstimate.extrasPoints > 0 ? ` Extras: +${loyaltyEstimate.extrasPoints} pts.` : ""}
                  </p>
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
                disabled={!branchIsOpen || !isValid() || loading || isPhoneMissingForCoupon}
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

              {submitError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {submitError}
                </div>
              )}

              {/* Validation hints */}
              {!isValid() && (
                <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs font-semibold text-amber-800 mb-2" style={{ fontFamily }}>Completá los datos faltantes:</p>
                  <ul className="text-xs text-amber-700 space-y-1" style={{ fontFamily }}>
                    {!customer.name && <li className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-amber-400" /> Nombre</li>}
                    {!customer.phone && <li className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-amber-400" /> Teléfono</li>}
                    {orderMode === "delivery" && !customer.address && <li className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-amber-400" /> Dirección</li>}
                    {orderMode === "delivery" && branchLocationMissing && <li className="flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-amber-400" /> La sucursal no tiene ubicacion para delivery</li>}
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
                    setShippingUnavailable(false);
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
