"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@kablam/supabase";
import { validateCoupon } from "@/lib/validateCoupon";
import { calculateShippingCost } from "@/lib/calculateShippingCost";
import { calculateDistanceKm } from "@/lib/calculateDelivery";

type PaymentLine = {
  payment_method_id: string;
  amount: string;
  reference: string;
};

type PaymentMethod = {
  id: string;
  name: string;
  requires_reference: boolean;
};

export default function OrderSidePanel({
  selectedOrder,
  session,
  reloadOrders,
  setSelectedOrder,
}: any) {
  const [step, setStep] = useState<"build" | "checkout">("build");
  const [mode, setMode] = useState<"builder" | "view" | "edit">("builder");
  const [shippingCost, setShippingCost] = useState(0);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [autoShippingEnabled, setAutoShippingEnabled] = useState(true);
  const [cart, setCart] = useState<any[]>([]);
  const [orderType, setOrderType] = useState("takeaway");
  const [customerLat, setCustomerLat] = useState<number | null>(null);
  const [customerLng, setCustomerLng] = useState<number | null>(null);

  const [branchLat, setBranchLat] = useState<number | null>(null);
  const [branchLng, setBranchLng] = useState<number | null>(null);
  const [couponError, setCouponError] = useState("");
  const [deliverySettings, setDeliverySettings] = useState<any>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [manualDiscount, setManualDiscount] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  // 🔹 PAGOS
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [payments, setPayments] = useState<PaymentLine[]>([
    { payment_method_id: "", amount: "", reference: "" },
  ]);

  const isView = mode === "view";
  const isEdit = mode === "edit";
  const isBuilder = mode === "builder";

  // ================= EFFECT =================
  useEffect(() => {
    if (!session) return;

    loadBranch();
    loadDeliverySettings();
  }, [session]);

  const loadBranch = async () => {
    const { data } = await supabase
      .from("branches")
      .select("lat, lng")
      .eq("id", session.branch_id)
      .single();

    if (data) {
      setBranchLat(Number(data.lat));
      setBranchLng(Number(data.lng));
    }
  };

  const loadDeliverySettings = async () => {
    const { data, error } = await supabase
      .from("delivery_settings")
      .select("*")
      .eq("tenant_id", session.tenant_id)
      .eq("branch_id", session.branch_id);

    console.log("DELIVERY RAW DATA:", data);
    console.log("DELIVERY ERROR:", error);

    if (data && data.length > 0) {
      setDeliverySettings(data[0]);
    }
  };

  const addressRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      if (window.google && addressRef.current) {
        const corrientesBounds = new window.google.maps.LatLngBounds(
          { lat: -27.55, lng: -58.92 }, // SW
          { lat: -27.35, lng: -58.7 }, // NE
        );

        const autocomplete = new window.google.maps.places.Autocomplete(
          addressRef.current,
          {
            componentRestrictions: { country: "ar" },
            bounds: corrientesBounds,
            strictBounds: true,
            fields: ["formatted_address", "geometry"],
            types: ["address"],
          },
        );

        // 🔹 IMPORTANTE: capturar dirección seleccionada
        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();

          if (!place.geometry) return;

          const location = place.geometry.location;

          setAddress(place.formatted_address || "");
          setCustomerLat(location.lat());
          setCustomerLng(location.lng());
        });

        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!autoShippingEnabled) return;
    if (orderType !== "delivery") return;
    if (customerLat === null || customerLng === null) return;
    if (branchLat === null || branchLng === null) return;
    if (!deliverySettings) return;

    const distance = calculateDistanceKm(
      branchLat,
      branchLng,
      customerLat,
      customerLng,
    );

    console.log("DISTANCE:", distance);

    const cost = calculateShippingCost({
      distanceKm: distance,
      settings: deliverySettings,
    });

    console.log("SHIPPING COST:", cost);

    if (cost === null) {
      alert("Fuera de zona de entrega");
      setShippingCost(0);
      return;
    }

    setShippingCost(cost);
  }, [
    orderType,
    customerLat,
    customerLng,
    branchLat,
    branchLng,
    deliverySettings,
    autoShippingEnabled,
  ]);
  useEffect(() => {
    loadProducts();
    loadCategories();
    loadPaymentMethods();

    if (!selectedOrder) {
      resetForm();
      return;
    }

    loadOrderForEdit();
    setMode(selectedOrder.mode || "view");
    setStep("build");
  }, [selectedOrder]);

  const resetForm = () => {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setAddress("");
    setManualDiscount("");
    setOrderType("takeaway");
    setPayments([{ payment_method_id: "", amount: "", reference: "" }]);
    setMode("builder");
    setStep("build");
  };

  const calculateShipping = () => {
    if (orderType !== "delivery") return 0;
    return shippingCost;
  };
  // ================= LOAD =================

  const loadProducts = async () => {
    const { data } = await supabase
      .from("products")
      .select("*, product_variants(*)");
    setProducts(data || []);
  };

  const loadCategories = async () => {
    const { data } = await supabase
      .from("categories")
      .select("*")
      .order("position");
    setCategories(data || []);
  };

  const loadPaymentMethods = async () => {
    const { data } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("is_active", true)
      .order("name");

    setPaymentMethods(data || []);
  };

  const loadOrderForEdit = async () => {
    const { data: items } = await supabase
      .from("order_items")
      .select("*, product_variants(*)")
      .eq("order_id", selectedOrder.id);

    if (items) {
      setCart(
        items.map((item: any) => ({
          variant: item.product_variants,
          quantity: item.quantity,
          note: item.note || "",
        })),
      );
    }

    setCustomerName(selectedOrder.customer_name || "");
    setCustomerPhone(selectedOrder.customer_phone || "");
    setOrderType(selectedOrder.type || "takeaway");
    setAddress(selectedOrder.address || "");
    setManualDiscount(selectedOrder.discount?.toString() || "");

    // cargar pagos si es edición
    const { data: orderPayments } = await supabase
      .from("order_payments")
      .select("*")
      .eq("order_id", selectedOrder.id);

    if (orderPayments?.length) {
      setPayments(
        orderPayments.map((p: any) => ({
          payment_method_id: p.payment_method_id,
          amount: p.amount.toString(),
          reference: p.reference || "",
        })),
      );
    }
  };

  // ================= CART =================

  const addToCart = (variant: any) => {
    if (isView) return;
    setCart([...cart, { variant, quantity: 1, note: "" }]);
  };

  const updateNote = (index: number, value: string) => {
    const updated = [...cart];
    updated[index].note = value;
    setCart(updated);
  };

  const removeFromCart = (index: number) => {
    if (isView) return;
    const updated = [...cart];
    updated.splice(index, 1);
    setCart(updated);
  };

  // ================= CALCULOS =================

  const calculateSubtotal = () =>
    cart.reduce((acc, item) => acc + item.variant.price * item.quantity, 0);

  const calculateDiscount = () => {
    if (!manualDiscount) return 0;
    if (manualDiscount.includes("%")) {
      const percent = Number(manualDiscount.replace("%", ""));
      return (calculateSubtotal() * percent) / 100;
    }
    return Number(manualDiscount);
  };

  const calculateTotal = () =>
    calculateSubtotal() -
    calculateDiscount() -
    couponDiscount +
    calculateShipping();
  // ================= PAGOS =================

  const updatePayment = (
    index: number,
    field: keyof PaymentLine,
    value: string,
  ) => {
    const updated = payments.map((p, i) =>
      i === index ? { ...p, [field]: value } : p,
    );

    const total = calculateTotal();

    if (updated.length > 1) {
      const lastIndex = updated.length - 1;

      // Sumar todos menos el último
      const sumExceptLast = updated
        .slice(0, lastIndex)
        .reduce((acc, p) => acc + Number(p.amount || 0), 0);

      const remaining = total - sumExceptLast;

      updated[lastIndex].amount = remaining > 0 ? remaining.toString() : "0";
    }

    setPayments(updated);
  };

  const addPaymentLine = () => {
    const total = calculateTotal();

    const sumCurrent = payments.reduce(
      (acc, p) => acc + Number(p.amount || 0),
      0,
    );

    const remaining = total - sumCurrent;

    if (remaining <= 0) return;

    setPayments([
      ...payments,
      {
        payment_method_id: "",
        amount: remaining.toString(),
        reference: "",
      },
    ]);
  };

  const couponRequiresPhone = appliedCoupon?.requires_phone === true;

  const isPhoneMissingForCoupon = couponRequiresPhone && !customerPhone?.trim();

  const isPhoneRequiredForDelivery =
    orderType === "delivery" && !customerPhone?.trim();

  const isCheckoutBlocked =
    cart.length === 0 || isPhoneMissingForCoupon || isPhoneRequiredForDelivery;

  const removePaymentLine = (index: number) => {
    setPayments(payments.filter((_, i) => i !== index));
  };
  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponDiscount(0);
  };

  const handleValidateCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError("Ingresá un código");
      return;
    }

    const result = await validateCoupon({
      code: couponCode,
      tenantId: session.tenant_id,
      phone: customerPhone,
      orderTotal: calculateSubtotal() - calculateDiscount(),
      shippingCost: calculateShipping(),
      hasDailyDiscount: false,
    });

    if (!result.valid) {
      setCouponError("Cupón inválido");
      return;
    }

    setCouponError("");
    setAppliedCoupon(result.coupon);
    setCouponDiscount(result.discountAmount || 0);
    setCouponCode("");
  };
  // ================= SAVE =================
  const handleSave = async () => {

  const subtotal = calculateSubtotal();
  const discount = calculateDiscount();
  const total = calculateTotal();

  const isSplitPayment = payments.length > 1;

  if (!payments[0].payment_method_id) {
    alert("Seleccioná un método de pago");
    return;
  }

  let totalPayments;

  if (!isSplitPayment) {
    totalPayments = total;
  } else {
    totalPayments = payments.reduce(
      (acc, p) => acc + Number(p.amount || 0),
      0,
    );

    if (totalPayments !== total) {
      alert("Los pagos no coinciden con el total");
      return;
    }
  }

  let orderId = selectedOrder?.id;

  const finalShipping =
    appliedCoupon?.discount_type === "free_shipping"
      ? 0
      : calculateShipping();

  const phone = customerPhone.replace(/\D/g, "");

  // ===============================
  // CUSTOMER
  // ===============================

  let { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("tenant_id", session.tenant_id)
    .eq("phone", phone)
    .maybeSingle();

  if (!customer) {

    const { data } = await supabase
      .from("customers")
      .insert({
        tenant_id: session.tenant_id,
        branch_id: session.branch_id,
        name: customerName,
        phone: phone
      })
      .select()
      .single();

    customer = data;

  }

  if (!customer) {
    console.error("Customer creation failed");
    return;
  }

  // ===============================
  // CUSTOMER TYPE
  // ===============================

  const { count } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("customer_id", customer.id)

  const customerType = count === 0 ? "new" : "returning"


  // ===============================
  // CREATE ORDER
  // ===============================

  if (isBuilder) {

    const { data, error } = await supabase
      .from("orders")
      .insert({
        tenant_id: session.tenant_id,
        branch_id: session.branch_id,
        cash_session_id: session.id,
        cash_register_id: session.cash_register_id,
        created_by: session.opened_by,

        customer_id: customer.id,

        status: "unconfirmed",
        type: orderType,

        customer_name: customerName,
        customer_phone: phone,
        address: orderType === "delivery" ? address : null,

        subtotal,
        discount,
        total,
        paid_amount: 0,
        is_paid: false,

        shipping_cost: finalShipping,
        original_shipping_cost: calculateShipping(),

      })
      .select()
      .single();

    if (error || !data) {
      console.error("Error creando orden:", error);
      return;
    }

    orderId = data.id;

  }

  if (!orderId) {
    console.error("orderId undefined");
    return;
  }

  // ===============================
  // INSERT ITEMS
  // ===============================

  const itemsToInsert = cart.map((item) => ({
    order_id: orderId,
    product_id: item.variant.product_id,
    variant_id: item.variant.id,
    quantity: item.quantity,
    unit_price: item.variant.price,
    total: item.variant.price * item.quantity,
    note: item.note || "",
  }));

  if (itemsToInsert.length) {
    await supabase.from("order_items").insert(itemsToInsert);
  }

  // ===============================
  // INSERT PAYMENTS
  // ===============================

  let paymentInsert;

  if (!isSplitPayment) {

    paymentInsert = await supabase.from("order_payments").insert({
      order_id: orderId,
      payment_method_id: payments[0].payment_method_id,
      amount: total,
      reference: payments[0].reference || null,
    });

  } else {

    paymentInsert = await supabase.from("order_payments").insert(
      payments.map((p) => ({
        order_id: orderId,
        payment_method_id: p.payment_method_id,
        amount: Number(p.amount),
        reference: p.reference || null,
      })),
    );

  }

  if (paymentInsert.error) {
    console.error("ERROR INSERTANDO PAYMENT:", paymentInsert.error);
    alert("Error insertando pago.");
    return;
  }

  // ===============================
  // CUPONES
  // ===============================

  if (appliedCoupon) {

    await supabase.from("coupon_uses").insert({
      coupon_id: appliedCoupon.id,
      order_id: orderId,
      customer_phone: customerPhone || null,
    });

    await supabase
      .from("coupons")
      .update({
        total_uses: appliedCoupon.total_uses + 1,
      })
      .eq("id", appliedCoupon.id);

  }

  await reloadOrders();

  // ===============================
  // ANALYTICS CALCULATIONS
  // ===============================

  const productCounts: any = {}
  const categoryCounts: any = {}

  cart.forEach((item) => {

    const productId = item.variant.product_id
    const categoryId = item.variant.category_id

    if (!productCounts[productId]) productCounts[productId] = 0
    if (!categoryCounts[categoryId]) categoryCounts[categoryId] = 0

    productCounts[productId] += item.quantity
    categoryCounts[categoryId] += item.quantity

  })

  const mainProductId = Object.keys(productCounts).sort(
    (a,b) => productCounts[b] - productCounts[a]
  )[0]

  const mainCategoryId = Object.keys(categoryCounts).sort(
    (a,b) => categoryCounts[b] - categoryCounts[a]
  )[0]

  const itemsCount = cart.length

  const productsCount = cart.reduce(
    (acc, item) => acc + item.quantity,
    0
  )

  const hasUpsell = cart.length > 1

  // ===============================
  // ORDER ANALYTICS
  // ===============================

  await supabase.from("order_analytics").insert({

    tenant_id: session.tenant_id,
    branch_id: session.branch_id,
    order_id: orderId,

    subtotal,
    discount,
    shipping: finalShipping,
    total,

    customer_id: customer.id,
    customer_type: customerType,

    sales_channel: "cashier",

    order_type: orderType,

    promo_source: appliedCoupon ? "coupon" : null,
    coupon_id: appliedCoupon?.id ?? null,

    items_count: itemsCount,
    products_count: productsCount,
    has_upsell: hasUpsell,

    main_product_id: mainProductId,
    main_category_id: mainCategoryId,

    lat: customerLat,
    lng: customerLng

  })

  // ===============================
  // CONVERSATION
  // ===============================

  let { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (!conversation) {

    const { data } = await supabase
      .from("conversations")
      .insert({
        tenant_id: session.tenant_id,
        branch_id: session.branch_id,
        customer_id: customer.id
      })
      .select()
      .single();

    conversation = data;

  }

  // ===============================
  // ORDER TEXT
  // ===============================

  const orderText = cart
    .map((item) =>
      `${item.quantity}x ${item.variant.name} $${item.variant.price * item.quantity}`
    )
    .join(" • ");

  // ===============================
  // SEND WHATSAPP
  // ===============================

  const res = await fetch("/api/whatsapp/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      conversationId: conversation.id,
      orderId: orderId,
      type: "template",
      templateName: "confirmacion_pedido_detallado",
      params: [
        customerName,
        orderText,
        total.toString()
      ]
    })
  });

  const data: any = await res.json();

  if (data?.messageId) {

    await supabase
      .from("orders")
      .update({
        whatsapp_message_id: data.messageId
      })
      .eq("id", orderId);

  }

  setSelectedOrder(null);
  resetForm();

};
  // ================= UI =================
  // (TU UI ORIGINAL + bloque de pagos agregado en checkout)
// ================= UI =================


const totalPayments = payments.reduce(
  (acc, p) => acc + Number(p.amount || 0),
  0
);

  return (
    <div className="w-[520px] h-full flex flex-col bg-white border-l border-gray-200">
      {/* HEADER */}
      <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {step === "build" && "Construir pedido"}
            {step === "checkout" && "Confirmar pedido"}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {cart.length} productos agregados
          </p>
        </div>

        {step === "checkout" && (
          <button
            onClick={() => setStep("build")}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            ← Volver
          </button>
        )}
      </div>

      {/* BODY */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {step === "build" && (
          <>
            {/* Tipo orden */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              {["delivery", "takeaway", "pedidosya"].map((type) => (
                <button
                  key={type}
                  onClick={() => setOrderType(type)}
                  className={`flex-1 py-2 text-sm rounded-md ${
                    orderType === type
                      ? "bg-white shadow text-gray-900"
                      : "text-gray-500"
                  }`}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Categorías */}
            <div className="flex gap-2 overflow-x-auto">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-3 py-1 text-xs rounded-full border ${
                  !selectedCategory
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-600 border-gray-300"
                }`}
              >
                Todas
              </button>

              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1 text-xs rounded-full border ${
                    selectedCategory === cat.id
                      ? "bg-gray-900 text-white"
                      : "bg-white text-gray-600 border-gray-300"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Productos */}
            <div className="divide-y divide-gray-200">
              {products
                .filter(
                  (p) =>
                    !selectedCategory || p.category_id === selectedCategory,
                )
                .flatMap((product) =>
                  product.product_variants.map((variant: any) => (
                    <div
                      key={variant.id}
                      className="py-3 flex justify-between items-center"
                    >
                      <button
                        onClick={() => addToCart(variant)}
                        className="text-left text-sm text-gray-800 hover:text-black"
                      >
                        {product.name} · {variant.name}
                      </button>

                      <span className="text-sm font-medium text-gray-700">
                        ${variant.price}
                      </span>
                    </div>
                  )),
                )}
            </div>
          </>
        )}

        {step === "checkout" && (
          <>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nombre del cliente"
              className="w-full border border-gray-300 p-3 rounded-lg text-sm"
            />

            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Teléfono"
              className="w-full border border-gray-300 p-3 rounded-lg text-sm"
            />

            {orderType === "delivery" && (
              <input
                ref={addressRef}
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setCustomerLat(null);
                  setCustomerLng(null);
                }}
                placeholder="Dirección"
                className="w-full border border-gray-300 p-3 rounded-lg text-sm"
              />
            )}

            {orderType === "delivery" && autoShippingEnabled && (
              <div className="text-xs text-gray-500">
                Envío calculado automáticamente según distancia
              </div>
            )}
            {orderType === "delivery" && (
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setAutoShippingEnabled(true)}
                  className={`flex-1 py-2 text-xs rounded-md ${
                    autoShippingEnabled
                      ? "bg-white shadow text-gray-900"
                      : "text-gray-500"
                  }`}
                >
                  Automático
                </button>

                <button
                  type="button"
                  onClick={() => setAutoShippingEnabled(false)}
                  className={`flex-1 py-2 text-xs rounded-md ${
                    !autoShippingEnabled
                      ? "bg-white shadow text-gray-900"
                      : "text-gray-500"
                  }`}
                >
                  Manual
                </button>
              </div>
            )}
            {orderType === "delivery" && !autoShippingEnabled && (
              <input
                type="number"
                value={shippingCost}
                onChange={(e) => setShippingCost(Number(e.target.value))}
                placeholder="Costo de envío"
                className="w-full border border-gray-300 p-3 rounded-lg text-sm"
              />
            )}

            <input
              value={manualDiscount}
              onChange={(e) => setManualDiscount(e.target.value)}
              placeholder="Descuento (10% o 500)"
              className="w-full border border-gray-300 p-3 rounded-lg text-sm"
            />
            <div className="space-y-3">
              {!appliedCoupon && (
                <div className="flex gap-2">
                  <input
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    placeholder="Código de cupón"
                    className="flex-1 border border-gray-300 p-3 rounded-lg text-sm"
                  />

                  <button
                    type="button"
                    onClick={handleValidateCoupon}
                    className="px-4 bg-gray-900 text-white rounded-lg text-sm"
                  >
                    Aplicar
                  </button>
                </div>
              )}

              {appliedCoupon && (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 px-4 py-3 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-green-600 text-white px-2 py-1 rounded-full">
                      CUPÓN
                    </span>

                    <div>
                      <div className="text-sm font-medium text-green-800">
                        {appliedCoupon.code}
                      </div>
                      <div className="text-xs text-green-700">
                        -${couponDiscount}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={removeCoupon}
                    className="text-xs text-red-500 hover:text-red-600"
                  >
                    Quitar
                  </button>
                </div>
              )}
            </div>

            {couponError && (
              <div className="text-xs bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-md">
                {couponError}
              </div>
            )}
            {appliedCoupon?.requires_phone && (
              <div className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-md">
                Hola {appliedCoupon.name}, tu cupón es válido 🎉
              </div>
            )}
            {couponRequiresPhone && !customerPhone && (
              <div className="text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 px-3 py-2 rounded-md">
                Este cupón requiere ingresar un teléfono
              </div>
            )}
            <div className="border-t pt-4 space-y-4">
              <h3 className="font-semibold text-gray-800">Método de pago</h3>

              {payments.map((payment, index) => {
                const selectedMethod = paymentMethods.find(
                  (pm) => pm.id === payment.payment_method_id,
                );

                const isSplitPayment = payments.length > 1;

                return (
                  <div
                    key={index}
                    className="space-y-2 border border-gray-200 p-3 rounded-lg bg-gray-50"
                  >
                    <div className="flex gap-2 items-center">
                      <select
                        value={payment.payment_method_id}
                        onChange={(e) =>
                          updatePayment(
                            index,
                            "payment_method_id",
                            e.target.value,
                          )
                        }
                        className="flex-1 border p-2 rounded text-sm"
                      >
                        <option value="">Seleccionar método</option>
                        {paymentMethods.map((pm) => (
                          <option key={pm.id} value={pm.id}>
                            {pm.name}
                          </option>
                        ))}
                      </select>

                      {isSplitPayment && (
                        <input
                          type="number"
                          value={payment.amount}
                          onChange={(e) =>
                            updatePayment(index, "amount", e.target.value)
                          }
                          className="w-28 border p-2 rounded text-sm"
                          placeholder="Monto"
                        />
                      )}

                      {payments.length > 1 && (
                        <button
                          onClick={() => removePaymentLine(index)}
                          className="text-red-500 text-sm"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {selectedMethod?.requires_reference && (
                      <input
                        placeholder="Referencia / comprobante"
                        value={payment.reference}
                        onChange={(e) =>
                          updatePayment(index, "reference", e.target.value)
                        }
                        className="w-full border p-2 rounded text-sm"
                      />
                    )}
                  </div>
                );
              })}

              {payments.length === 1 && (
                <button
                  type="button"
                  onClick={addPaymentLine}
                  className="text-sm text-blue-600 font-medium hover:underline"
                >
                  + Dividir pago
                </button>
              )}

              {payments.length > 1 && (
                <div className="text-sm space-y-1 pt-2 border-t">
                  <div className="flex justify-between">
                    <span>Total orden:</span>
                    <span>${calculateTotal()}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Total pagos:</span>
                    <span>${totalPayments}</span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* RESUMEN INFERIOR */}
      <div className="border-t border-gray-200 p-6 bg-gray-50 space-y-4">
        <div className="max-h-[150px] overflow-y-auto space-y-2">
          {cart.map((item, i) => (
            <div key={i} className="space-y-1">
              <div className="flex justify-between text-sm text-gray-800">
                <span>
                  {item.variant.name} x{item.quantity}
                </span>
                <button
                  onClick={() => removeFromCart(i)}
                  className="text-xs text-red-500"
                >
                  ✕
                </button>
              </div>

              <input
                value={item.note ?? ""}
                onChange={(e) => updateNote(i, e.target.value)}
                placeholder="Nota para este producto"
                className="w-full border border-gray-300 px-2 py-1 rounded text-xs"
              />
            </div>
          ))}
        </div>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span>${calculateSubtotal()}</span>
          </div>
          {orderType === "delivery" && (
            <div className="flex justify-between text-gray-600">
              <span>Envío</span>
              <span>${calculateShipping().toLocaleString("es-AR")}</span>
            </div>
          )}
          <div className="flex justify-between text-gray-600">
            <span>Descuento</span>
            <span>${calculateDiscount()}</span>
          </div>

          {couponDiscount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Cupón</span>
              <span>- ${couponDiscount}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-semibold text-gray-900">
            <span>Total</span>
            <span>${calculateTotal()}</span>
          </div>
        </div>

        {step === "build" && (
          <button
            disabled={cart.length === 0}
            onClick={() => setStep("checkout")}
            className="w-full bg-gray-900 text-white py-3 rounded-lg disabled:opacity-40"
          >
            Continuar
          </button>
        )}

        {step === "checkout" && (
          <button
            onClick={handleSave}
            disabled={isCheckoutBlocked}
            className={`w-full py-3 rounded-lg transition ${
              isCheckoutBlocked
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            Confirmar Pedido
          </button>
        )}
        {isPhoneMissingForCoupon && (
          <div className="text-xs text-red-500 text-center">
            Este cupón requiere un número de teléfono válido
          </div>
        )}
      </div>
    </div>
  );
}
