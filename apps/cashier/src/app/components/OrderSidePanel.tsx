"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { validateCoupon } from "@/lib/validateCoupon";
import { calculateShippingCost } from "@/lib/calculateShippingCost";
import { calculateDistanceKm } from "@/lib/calculateDelivery";
import { logAppError } from "@/lib/logAppError";
import { useCurrentBranch } from "../(cashier)/context/BranchContext";
import { Minus, Plus, Search, X } from "lucide-react";

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

const DEBUG_LOGS = process.env.NEXT_PUBLIC_DEBUG_LOGS === "true";
const debugLog = (...args: unknown[]) => {
  if (DEBUG_LOGS) console.log(...args);
};

export default function OrderSidePanel({
  selectedOrder,
  session,
  reloadOrders,
  setSelectedOrder,
}: any) {
  const { branchId, tenantId, userRecord } = useCurrentBranch();

  const [step, setStep] = useState<"build" | "checkout">("build");
  const [mode, setMode] = useState<"builder" | "view" | "edit">("builder");
  const [shippingCost, setShippingCost] = useState(0);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [selectedParentCategory, setSelectedParentCategory] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
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
  const noCashSession = !session?.id;
  const canEditClosedCashOrder =
    userRecord && ["owner", "admin"].includes(userRecord.role);
  const selectedOrderBelongsToOpenSession =
    !selectedOrder?.cash_session_id || selectedOrder.cash_session_id === session?.id;
  const canEditSelectedOrder =
    !selectedOrder || selectedOrderBelongsToOpenSession || canEditClosedCashOrder;

  // Categorías padre (raíz) y subcategorías según selección
  const rootCategories = categories.filter((c: any) => !c.parent_id);
  const subCategories = categories.filter(
    (c: any) => c.parent_id === selectedParentCategory,
  );

  // ================= EFFECT =================
  useEffect(() => {
    if (!branchId) return;

    loadBranch();
    loadDeliverySettings();
  }, [branchId, tenantId]);

  const loadBranch = async () => {
    const { data } = await supabase
      .from("branches")
      .select("lat, lng")
      .eq("id", branchId)
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
      .eq("tenant_id", tenantId)
      .eq("branch_id", branchId);

    debugLog("DELIVERY RAW DATA:", data);
    debugLog("DELIVERY ERROR:", error);

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

    debugLog("DISTANCE:", distance);

    const cost = calculateShippingCost({
      distanceKm: distance,
      settings: deliverySettings,
    });

    debugLog("SHIPPING COST:", cost);

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
    setStep("checkout");
  }, [selectedOrder, branchId, tenantId]);

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
    setSelectedCategory(null);
    setSelectedParentCategory(null);
  };

  const calculateShipping = () => {
    if (orderType !== "delivery") return 0;
    return shippingCost;
  };
  // ================= LOAD =================

  const loadProducts = async () => {
    if (!branchId || !tenantId) return;
    const [{ data: prods }, { data: combos }] = await Promise.all([
      supabase.from("products").select("*, product_variants(*)").eq("branch_id", branchId),
      supabase.from("combos").select("*, categories(name)").eq("tenant_id", tenantId).eq("is_active", true),
    ]);
    // Convert combos to product-like objects with a generated variant
    const comboProducts = (combos || []).map((combo: any) => ({
      id: combo.id,
      name: combo.name,
      description: combo.description,
      category_id: combo.category_id,
      categories: combo.categories ? [{ id: combo.category_id, name: combo.categories?.name }] : [],
      is_combo: true,
      product_variants: [{ id: combo.id + "-variant", name: "Combo", price: combo.price, is_default: true }],
    }));
    setProducts([...(prods || []), ...comboProducts]);
  };

  const loadCategories = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("categories")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("position");
    setCategories(data || []);
  };

  const loadPaymentMethods = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("payment_methods")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name");

    setPaymentMethods(data || []);
  };

  const loadOrderForEdit = async () => {
    const { data: items } = await supabase
      .from("order_items")
      .select("*, products(*), product_variants(*), combos(*)")
      .eq("order_id", selectedOrder.id);

    if (items) {
      setCart(
        items.map((item: any) => {
          const isCombo = item.item_type === "combo" || Boolean(item.combo_id);
          const isPromotion = item.item_type === "promotion";
          const base = isCombo ? item.combos : item.products;
          const promotionName = (item.extras || []).find(
            (extra: any) => extra?.type === "promotion",
          )?.name;
          return {
            variant: {
              ...base,
              id: item.combo_id || item.product_id || base?.id,
              name: isPromotion
                ? promotionName || "Promo"
                : base?.name || (isCombo ? "Combo" : "Producto"),
              product_id: item.product_id,
              combo_id: item.combo_id,
              variant_id: item.variant_id,
              is_combo: isCombo,
              item_type: item.item_type,
              price:
                item.unit_price ??
                item.product_variants?.price ??
                base?.price ??
                0,
            },
            quantity: item.quantity,
            note: item.note || "",
          };
        }),
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
    const defaultVariant =
      variant.product_variants?.find((v: any) => v.is_default) ||
      variant.product_variants?.[0];
    const productId = variant.product_id || variant.id;
    const variantId = variant.variant_id || defaultVariant?.id || null;
    const price = Number(variant.price ?? defaultVariant?.price ?? 0);

    setCart((current) => {
      const existingIndex = current.findIndex(
        (item) =>
          (item.variant.variant_id || null) === variantId &&
          (item.variant.product_id || item.variant.id) === productId &&
          !item.note,
      );

      if (existingIndex >= 0) {
        return current.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: Number(item.quantity || 0) + 1 }
            : item,
        );
      }

      return [
        ...current,
        {
          variant: {
            ...variant,
            product_id: productId,
            variant_id: variantId,
            price,
          },
          quantity: 1,
          note: "",
        },
      ];
    });
  };

  const addFirstSearchResult = () => {
    const [firstResult] = searchResults;
    if (!firstResult) return;
    addToCart(firstResult);
    setProductSearch("");
  };

  const changeCartQuantity = (index: number, delta: number) => {
    if (isView) return;
    setCart((current) =>
      current.flatMap((item, itemIndex) => {
        if (itemIndex !== index) return [item];
        const nextQuantity = Number(item.quantity || 0) + delta;
        return nextQuantity > 0 ? [{ ...item, quantity: nextQuantity }] : [];
      }),
    );
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
    noCashSession || cart.length === 0 || isPhoneMissingForCoupon || isPhoneRequiredForDelivery;

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
      tenantId: tenantId,
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
    if (noCashSession) {
      alert("Modo owner: para confirmar o editar pedidos tenes que abrir una caja.");
      return;
    }

    if (isEdit && !canEditSelectedOrder) {
      alert("No se puede editar un pedido de una caja cerrada.");
      return;
    }

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

    const phone = customerPhone
      .replace(/\D/g, "")
      .replace(/^549/, "")
      .replace(/^54/, "")
      .replace(/^9(\d{10})$/, "$1");

    // ===============================
    // CUSTOMER
    // ===============================

    let { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("phone", phone)
      .maybeSingle();

    if (!customer) {
      const { data } = await supabase
        .from("customers")
        .insert({
          tenant_id: tenantId,
          name: customerName,
          phone: phone,
          address: orderType === "delivery" ? address : null,
        })
        .select()
        .single();

      customer = data;
    } else {
      // Actualizar nombre/dirección si cambió
      const updates: any = {};
      if (customerName && customerName !== customer.name) updates.name = customerName;
      if (address && address !== customer.address) updates.address = address;
      if (Object.keys(updates).length > 0) {
        await supabase.from("customers").update(updates).eq("id", customer.id);
      }
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
      .eq("customer_id", customer.id);

    const customerType = count === 0 ? "new" : "returning";

    // ===============================
    // CREATE ORDER
    // ===============================

    if (isBuilder) {
      const { data, error } = await supabase
        .from("orders")
        .insert({
          tenant_id: tenantId,
          branch_id: branchId,
          cash_session_id: session.id,
          cash_register_id: session.cash_register_id,
          created_by: session.opened_by,

          customer_id: customer.id,

          status: "confirmed",
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
    // DELETE EXISTING ITEMS & PAYMENTS (si es edición)
    // ===============================

    if (selectedOrder) {
      await supabase.from("order_items").delete().eq("order_id", orderId);
      await supabase.from("order_payments").delete().eq("order_id", orderId);
    }

    // ===============================
    // INSERT ITEMS
    // ===============================

    const itemsToInsert = cart.map((item) => {
      const isCombo = item.variant.is_combo === true;
      const itemId = item.variant.product_id || item.variant.id;

      return {
        order_id: orderId,
        item_type: isCombo ? "combo" : "product",
        product_id: isCombo ? null : itemId,
        combo_id: isCombo ? itemId : null,
        variant_id: isCombo ? null : item.variant.variant_id || null,
        quantity: item.quantity,
        unit_price: item.variant.price,
        total: item.variant.price * item.quantity,
        note: item.note || "",
      };
    });

    if (itemsToInsert.length) {
      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(itemsToInsert);

      if (itemsError) {
        console.error("ERROR INSERTANDO ITEMS:", itemsError);
        await logAppError("cashier", "Error insertando productos", {
          tenantId,
          branchId,
          code: itemsError.code,
          context: { orderId, phase: "order_items_insert" },
        });
        if (isBuilder) {
          await supabase.from("orders").delete().eq("id", orderId);
        }
        alert("Error insertando productos.");
        return;
      }
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
      await logAppError("cashier", "Error insertando pago", {
        tenantId,
        branchId,
        code: paymentInsert.error.code,
        context: { orderId, phase: "order_payments_insert" },
      });
      if (isBuilder) {
        await supabase.from("order_items").delete().eq("order_id", orderId);
        await supabase.from("orders").delete().eq("id", orderId);
      }
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

    const productCounts: any = {};
    const categoryCounts: any = {};

    cart.forEach((item) => {
      const productId = item.variant.product_id || item.variant.id;
      const categoryId = item.variant.category_id;

      if (!productCounts[productId]) productCounts[productId] = 0;
      if (!categoryCounts[categoryId]) categoryCounts[categoryId] = 0;

      productCounts[productId] += item.quantity;
      categoryCounts[categoryId] += item.quantity;
    });

    const mainProductId = Object.keys(productCounts).sort(
      (a, b) => productCounts[b] - productCounts[a],
    )[0];

    const mainCategoryId = Object.keys(categoryCounts).sort(
      (a, b) => categoryCounts[b] - categoryCounts[a],
    )[0];

    const itemsCount = cart.length;

    const productsCount = cart.reduce((acc, item) => acc + item.quantity, 0);

    const hasUpsell = cart.length > 1;

    // ===============================
    // ORDER ANALYTICS
    // ===============================

    await supabase.from("order_analytics").insert({
      tenant_id: tenantId,
      branch_id: branchId,
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
      lng: customerLng,
    });

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
          tenant_id: tenantId,
          branch_id: branchId,
          customer_id: customer.id,
        })
        .select()
        .single();

      conversation = data;
    }

    // ===============================
    // SEND WHATSAPP
    // ===============================

    const res = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversationId: conversation.id,
        orderId: orderId,
        type: "template",
        templateName:
          orderType === "delivery"
            ? "startOrderManualDelivery"
            : "startOrderManualTakeaway",
      }),
    });

    await res.json();
    setSelectedOrder(null);
    resetForm();
  };
  // ================= UI =================
  // (TU UI ORIGINAL + bloque de pagos agregado en checkout)
  // ================= UI =================

  const totalPayments = payments.reduce(
    (acc, p) => acc + Number(p.amount || 0),
    0,
  );
  const normalizedSearch = productSearch.trim().toLowerCase();
  const searchResults = products
    .filter((product) => {
      if (!normalizedSearch) return true;
      const category = categories.find((cat: any) => cat.id === product.category_id);
      return [product.name, product.description, category?.name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    })
    .sort((a, b) => {
      if (!normalizedSearch) return a.name?.localeCompare(b.name);
      const aStarts = a.name?.toLowerCase().startsWith(normalizedSearch) ? 0 : 1;
      const bStarts = b.name?.toLowerCase().startsWith(normalizedSearch) ? 0 : 1;
      return aStarts - bStarts || a.name?.localeCompare(b.name);
    })
    .slice(0, normalizedSearch ? 12 : 8);

  return (
    <div className="w-[520px] h-full flex flex-col bg-white border-l border-gray-200">
      {/* HEADER */}
      <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {step === "build" && (selectedOrder ? "Editar pedido" : "Construir pedido")}
            {step === "checkout" && (selectedOrder ? "Guardar cambios" : "Confirmar pedido")}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {cart.length} productos agregados
          </p>
        </div>

        {step === "checkout" && (
          <div className="flex gap-2">
            {isEdit && selectedOrder && (
              <button
                onClick={() => setMode("view")}
                className="text-sm text-gray-500 hover:text-gray-700 font-medium"
              >
                Cancelar edición
              </button>
            )}
            <button
              onClick={() => {
                if (isEdit) setMode("view");
                setStep("build");
              }}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              ← Volver
            </button>
          </div>
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

            {/* CATEGORÍAS / PRODUCTOS */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Buscar producto
                </label>
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm focus-within:border-gray-900">
                  <Search size={18} className="text-gray-400" />
                  <input
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addFirstSearchResult();
                      }
                    }}
                    autoFocus
                    placeholder="Nombre del producto..."
                    className="min-w-0 flex-1 border-0 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
                  />
                  {productSearch && (
                    <button
                      type="button"
                      onClick={() => setProductSearch("")}
                      className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Enter agrega el primer resultado. Click agrega directo.
                </p>
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                {searchResults.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">
                    No encontramos productos con esa busqueda
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {searchResults.map((product) => {
                      const defaultVariant =
                        product.product_variants?.find((variant: any) => variant.is_default) ||
                        product.product_variants?.[0];
                      const price = Number(product.price ?? defaultVariant?.price ?? 0);
                      const category = categories.find((cat: any) => cat.id === product.category_id);

                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => {
                            addToCart(product);
                            setProductSearch("");
                          }}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-gray-50"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">
                              {product.name}
                            </p>
                            {category?.name && (
                              <p className="truncate text-xs text-gray-400">{category.name}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-gray-900">
                              ${price.toLocaleString("es-AR")}
                            </span>
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 text-white">
                              <Plus size={14} />
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="hidden">
            {!selectedParentCategory && !selectedCategory ? (
              /* ★ MODO INICIAL: Cards de categorías PADRE */
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-3">
                  Categorías
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setSelectedCategory("all")}
                    className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-gray-200 hover:border-gray-900 hover:bg-gray-50 transition-all duration-200 bg-white"
                  >
                    <span className="text-3xl">🍽️</span>
                    <span className="text-sm font-medium text-gray-700">
                      Todos los productos
                    </span>
                  </button>
                  {rootCategories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => {
  setSelectedParentCategory(cat.id);
  setSelectedCategory("all");
}}
                      className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-gray-200 hover:border-gray-900 hover:bg-gray-50 transition-all duration-200 bg-white"
                    >
                      <span className="text-3xl">{cat.icon || "📂"}</span>
                      <span className="text-sm font-medium text-gray-700 text-center">
                        {cat.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* ★ MODO PRODUCTOS: Tabs de subcategorías + lista */
              <div>
                {/* Tabs de subcategorías */}
                <div className="flex gap-1 overflow-x-auto pb-3 -mx-6 px-6 sticky top-0 bg-white z-10 border-b border-gray-100">
                  <button
                    onClick={() => {
                      setSelectedCategory(null);
                      setSelectedParentCategory(null);
                    }}
                    className="flex-shrink-0 px-2 py-2 text-xs text-gray-500 hover:text-gray-900"
                  >
                    ← Volver
                  </button>
                  <button
                    onClick={() => setSelectedCategory("all")}
                    className={`flex-shrink-0 px-4 py-2 text-xs rounded-full font-medium ${
                      selectedCategory === "all"
                        ? "bg-gray-900 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    Todas
                  </button>
                  {(selectedCategory === "all" || !selectedParentCategory
                    ? categories
                    : subCategories
                  ).map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`flex-shrink-0 px-4 py-2 text-xs rounded-full font-medium ${
                        selectedCategory === cat.id
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                {/* Lista de productos */}
                <div className="divide-y divide-gray-100 mt-3">
                  {products
                    .filter((p) => {
                      if (selectedCategory === "all") return true;
                      return p.category_id === selectedCategory;
                    })
                    .sort((a, b) => a.name?.localeCompare(b.name))
                    .map((product) => (
                      <button
                        key={product.id}
                        onClick={() => addToCart(product)}
                        className="w-full py-3 flex justify-between items-center hover:bg-gray-50 px-2 rounded-lg transition-colors"
                      >
                        <span className="text-sm font-medium text-gray-800 text-left">
                          {product.name}
                        </span>
                        <span className="text-sm font-semibold text-gray-700 flex-shrink-0 ml-3">
                          ${product.price}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            )}
            </div>
          </>
        )}

        {step === "checkout" && (
          <>
            {isView && (
              /* ★ VISTA: Resumen del pedido */
              <div className="space-y-5">
                {/* Número de pedido y estado */}
                {selectedOrder && (
                  <div className="flex items-center justify-between bg-gradient-to-r from-gray-50 to-white rounded-lg p-4 border">
                    <div>
                      <span className="text-xs text-gray-500">Pedido</span>
                      <p className="text-lg font-bold text-gray-900">#{selectedOrder.id.slice(0, 8)}</p>
                    </div>
                    <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 font-medium">
                      {selectedOrder.status}
                    </span>
                  </div>
                )}

                {/* Items del pedido */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                    <span className="w-1 h-4 rounded-full bg-gray-900" />
                    Productos
                  </h3>
                  <div className="divide-y divide-gray-100 border rounded-xl overflow-hidden bg-white">
                    {cart.map((item, i) => (
                      <div key={i} className="flex justify-between items-center px-4 py-3 text-sm hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-gray-100 text-xs flex items-center justify-center font-medium text-gray-600">
                            {item.quantity}
                          </span>
                          <span className="text-gray-800 font-medium">{item.variant.name}</span>
                        </div>
                        <span className="font-semibold text-gray-900">
                          ${(item.variant.price * item.quantity).toLocaleString("es-AR")}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center px-4 py-3 bg-gray-50 text-sm font-bold">
                      <span>Subtotal</span>
                      <span>${calculateTotal().toLocaleString("es-AR")}</span>
                    </div>
                  </div>
                </div>

                {/* Info del cliente */}
                <div className="bg-white border rounded-xl overflow-hidden">
                  <h3 className="text-sm font-semibold text-gray-800 px-4 pt-4 pb-2 flex items-center gap-2">
                    <span className="w-1 h-4 rounded-full bg-gray-900" />
                    Cliente
                  </h3>
                  <div className="px-4 pb-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Nombre</span>
                      <span className="font-medium text-gray-900">{customerName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Teléfono</span>
                      <span className="font-medium text-gray-900">{customerPhone}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Tipo</span>
                      <span className={`font-medium capitalize ${orderType === "delivery" ? "text-blue-600" : "text-gray-900"}`}>
                        {orderType === "delivery" ? "🚗 Delivery" : "🏪 Takeaway"}
                      </span>
                    </div>
                    {orderType === "delivery" && address && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Dirección</span>
                        <span className="font-medium text-gray-900 text-right max-w-[60%] truncate">{address}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Método de pago */}
                <div className="bg-white border rounded-xl overflow-hidden">
                  <h3 className="text-sm font-semibold text-gray-800 px-4 pt-4 pb-2 flex items-center gap-2">
                    <span className="w-1 h-4 rounded-full bg-gray-900" />
                    Pago
                  </h3>
                  <div className="px-4 pb-4 space-y-2 text-sm">
                    {payments.map((p, i) => {
                      const method = paymentMethods.find(pm => pm.id === p.payment_method_id);
                      return (
                        <div key={i} className="flex justify-between">
                          <span className="text-gray-500">{method?.name || "Sin método"}</span>
                          <span className="font-medium text-gray-900">${Number(p.amount || calculateTotal()).toLocaleString("es-AR")}</span>
                        </div>
                      );
                    })}
                    {manualDiscount && (
                      <div className="flex justify-between text-red-600">
                        <span>Descuento</span>
                        <span>-{manualDiscount}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-base pt-2 border-t border-gray-200">
                      <span>Total</span>
                      <span>${calculateTotal().toLocaleString("es-AR")}</span>
                    </div>
                  </div>
                </div>

                {/* Botón Editar */}
                {canEditSelectedOrder ? (
                  <button
                    onClick={() => setMode("edit")}
                    className="w-full py-3 rounded-lg bg-gray-900 text-white hover:bg-black transition font-medium"
                  >
                    Editar pedido
                  </button>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    Pedido bloqueado: pertenece a una caja cerrada.
                  </div>
                )}
              </div>
            )}

            {!isView && (
              <>
              <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nombre del cliente"
              readOnly={!!selectedOrder}
              className={`w-full border p-3 rounded-lg text-sm ${selectedOrder ? "bg-gray-100 text-gray-500 cursor-not-allowed" : "border-gray-300"}`}
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
          </>
        )}
      </div>

      {/* RESUMEN INFERIOR */}
      <div className="border-t border-gray-200 p-6 bg-gray-50 space-y-4">
        <div className="max-h-[220px] overflow-y-auto space-y-2">
          {cart.length === 0 && (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-400">
              Buscá productos y agregalos con Enter
            </div>
          )}

          {cart.map((item, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {item.variant.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    ${Number(item.variant.price || 0).toLocaleString("es-AR")} c/u
                  </p>
                </div>

                <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => changeCartQuantity(i, -1)}
                    className="flex h-8 w-8 items-center justify-center text-gray-600 hover:text-gray-900"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-8 text-center text-sm font-bold tabular-nums text-gray-900">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => changeCartQuantity(i, 1)}
                    className="flex h-8 w-8 items-center justify-center text-gray-600 hover:text-gray-900"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <div className="w-20 text-right text-sm font-bold text-gray-900">
                  ${(Number(item.variant.price || 0) * item.quantity).toLocaleString("es-AR")}
                </div>

                <button
                  type="button"
                  onClick={() => removeFromCart(i)}
                  className="rounded-full p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                >
                  <X size={15} />
                </button>
              </div>

              <input
                value={item.note ?? ""}
                onChange={(e) => updateNote(i, e.target.value)}
                placeholder="Nota para este producto"
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-gray-900"
              />
            </div>
          ))}
        </div>

        <div className="hidden">
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

        {step === "checkout" && !isView && (
          <button
            onClick={handleSave}
            disabled={isCheckoutBlocked}
            className={`w-full py-3 rounded-lg transition ${
              isCheckoutBlocked
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {selectedOrder ? "Guardar Cambios" : "Confirmar Pedido"}
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
