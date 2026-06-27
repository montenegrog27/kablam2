"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { validateCoupon } from "@/lib/validateCoupon";
import { calculateShippingCost } from "@/lib/calculateShippingCost";
import { calculateDistanceKm } from "@/lib/calculateDelivery";
import { logAppError } from "@/lib/logAppError";
import { useCurrentBranch } from "../(cashier)/context/BranchContext";
import {
  ArrowLeft,
  Bike,
  Check,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Store,
  X,
} from "lucide-react";

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
const PROMOTIONS_CATEGORY_ID = "__promotions__";

const ORDER_TYPES = [
  { id: "delivery", label: "Delivery", description: "Con direccion y envio", icon: Bike },
  { id: "takeaway", label: "Takeaway", description: "Retira por el local", icon: Store },
  { id: "pedidosya", label: "PedidosYa", description: "Canal externo", icon: ShoppingBag },
];

function getProductPrice(product: any) {
  const defaultVariant =
    product.product_variants?.find((variant: any) => variant.is_default) ||
    product.product_variants?.[0];
  return Number(product.price ?? defaultVariant?.price ?? 0);
}

function normalizePromotionQuantity(value: unknown) {
  const parsed = Math.floor(Number(value || 1));
  return Math.min(99, Math.max(1, Number.isFinite(parsed) ? parsed : 1));
}

function getPromotionPricing(promotion: any, items: any[]) {
  const baseTotal = items.reduce((sum: number, item: any) => sum + getProductPrice(item), 0);
  const rule = promotion.promotion_rules?.[0];
  const discountType = rule?.discount_type || rule?.type || promotion.additional_product_config?.discountType;
  const discountValue = Number(rule?.discount_value || promotion.additional_product_config?.discountValue || 0);
  const percentFromBadge = Number(String(promotion.badge || "").match(/(\d+(?:[.,]\d+)?)\s*%/)?.[1]?.replace(",", ".") || 0);
  let discountAmount = 0;
  let discountLabel = promotion.badge || "PROMO";

  if (discountType === "percentage" && discountValue > 0) {
    discountAmount = baseTotal * (discountValue / 100);
    discountLabel = `${discountValue}% OFF`;
  } else if (discountType === "fixed" && discountValue > 0) {
    discountAmount = discountValue;
    discountLabel = `$${discountValue.toLocaleString("es-AR")} OFF`;
  } else if (percentFromBadge > 0) {
    discountAmount = baseTotal * (percentFromBadge / 100);
    discountLabel = `${percentFromBadge}% OFF`;
  }

  discountAmount = Math.min(baseTotal, Math.max(0, Math.round(discountAmount)));
  return {
    baseTotal,
    discountAmount,
    discountLabel,
    finalTotal: Math.max(0, baseTotal - discountAmount),
  };
}

function buildPromotionProducts(promotions: any[], products: any[]) {
  return promotions.flatMap((promotion) => {
    const quantities = promotion.additional_product_config?.productQuantities || {};
    const promoItems = (promotion.promotion_targets || [])
      .filter((target: any) => target.target_type === "combo" || target.target_type === "product")
      .flatMap((target: any) => {
        const item = products.find((product) =>
          target.target_type === "combo"
            ? product.is_combo && product.id === target.target_id
            : !product.is_combo && product.id === target.target_id,
        );
        if (!item) return [];
        const quantity = target.target_type === "product"
          ? normalizePromotionQuantity(quantities[target.target_id] || target.quantity)
          : 1;
        return Array.from({ length: quantity }, () => item);
      });

    if (!promoItems.length) return [];
    const pricing = getPromotionPricing(promotion, promoItems);
    const image =
      promotion.image_type === "custom" && promotion.image_url
        ? promotion.image_url
        : promoItems[0]?.product_variants?.[0]?.image_url;

    return [{
      id: `promotion-${promotion.id}`,
      product_id: null,
      category_id: PROMOTIONS_CATEGORY_ID,
      name: promotion.name,
      description: promotion.description || promoItems.map((item: any) => item.name).join(" + "),
      is_active: true,
      show_in_menu: true,
      item_type: "promotion",
      is_promotion: true,
      product_variants: [{
        id: `promotion-${promotion.id}-variant`,
        name: "Promo",
        price: pricing.finalTotal,
        image_url: image,
        is_default: true,
      }],
      promotion: {
        id: promotion.id,
        name: promotion.name,
        badge: pricing.discountLabel,
        originalPrice: pricing.baseTotal,
        discountAmount: pricing.discountAmount,
        finalPrice: pricing.finalTotal,
        items: promoItems.map((item: any, index: number) => ({
          id: `${item.id}-${index}`,
          name: item.name,
          itemType: item.is_combo ? "combo" : "product",
          price: getProductPrice(item),
        })),
      },
    }];
  });
}

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
    if (!tenantId) {
      setDeliverySettings(null);
      return;
    }

    const { data, error } = await supabase
      .from("delivery_settings")
      .select("*")
      .eq("tenant_id", tenantId)
      .or(branchId ? `branch_id.eq.${branchId},branch_id.is.null` : "branch_id.is.null");

    debugLog("DELIVERY RAW DATA:", data);
    debugLog("DELIVERY ERROR:", error);

    const selectedSettings =
      data?.find((item) => item.branch_id === branchId) ||
      data?.find((item) => !item.branch_id) ||
      data?.[0];

    setDeliverySettings(selectedSettings || null);
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
    const now = new Date().toISOString();
    const [{ data: prods }, { data: combos }, { data: promotions }] = await Promise.all([
      supabase.from("products").select("*, categories(*), product_variants(*)").eq("branch_id", branchId).eq("is_active", true),
      supabase.from("combos").select("*, categories(*)").eq("branch_id", branchId).eq("is_active", true),
      supabase
        .from("promotions")
        .select("*, promotion_targets(target_type, target_id), promotion_rules(*)")
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .eq("show_in_home", true)
        .or(`start_date.is.null,start_date.lte.${now}`)
        .or(`end_date.is.null,end_date.gte.${now}`),
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
    const baseProducts = [...(prods || []), ...comboProducts];
    const promotionProducts = buildPromotionProducts(promotions || [], baseProducts);
    setProducts([...baseProducts, ...promotionProducts]);
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
    setCustomerLat(selectedOrder.customer_lat ? Number(selectedOrder.customer_lat) : null);
    setCustomerLng(selectedOrder.customer_lng ? Number(selectedOrder.customer_lng) : null);
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

  const rebalanceSplitPayments = (lines: PaymentLine[]) => {
    if (lines.length <= 1) return lines;
    const total = calculateTotal();
    const lastIndex = lines.length - 1;
    const sumExceptLast = lines
      .slice(0, lastIndex)
      .reduce((acc, p) => acc + Number(p.amount || 0), 0);
    const remaining = total - sumExceptLast;

    return lines.map((line, index) =>
      index === lastIndex
        ? { ...line, amount: remaining > 0 ? remaining.toString() : "0" }
        : line,
    );
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

  const isCheckoutBlocked =
    noCashSession || cart.length === 0 || isPhoneMissingForCoupon;

  const removePaymentLine = (index: number) => {
    const next = payments.filter((_, i) => i !== index);
    setPayments(next.length <= 1 ? next.map((line) => ({ ...line, amount: "" })) : rebalanceSplitPayments(next));
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
    const selectedPayments = isSplitPayment
      ? payments
      : [{ ...payments[0], amount: total.toString() }];

    for (const [index, payment] of selectedPayments.entries()) {
      const method = paymentMethods.find((pm) => pm.id === payment.payment_method_id);
      if (!payment.payment_method_id || !method) {
        alert(`Selecciona un metodo de pago${isSplitPayment ? ` en la linea ${index + 1}` : ""}`);
        return;
      }

      if (isSplitPayment && Number(payment.amount || 0) <= 0) {
        alert(`Ingresa un monto valido en la linea ${index + 1}`);
        return;
      }

      if (method.requires_reference && !payment.reference.trim()) {
        alert(`Ingresa la referencia de ${method.name}`);
        return;
      }
    }

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

      if (Math.round(totalPayments) !== Math.round(total)) {
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
    const hasCustomerPhone = phone.length > 0;

    // ===============================
    // CUSTOMER
    // ===============================

    let customer: any = null;

    if (hasCustomerPhone) {
      const { data: existingCustomer } = await supabase
      .from("customers")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("phone", phone)
      .maybeSingle();

      customer = existingCustomer;

    if (!customer) {
      const { data, error } = await supabase
        .from("customers")
        .insert({
          tenant_id: tenantId,
          name: customerName || "Cliente",
          phone,
          address: orderType === "delivery" ? address : null,
        })
        .select()
        .single();

      if (error) {
        console.error("Customer creation failed:", error);
        alert("No se pudo guardar el cliente. El pedido no fue creado.");
        return;
      }

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
    }

    // ===============================
    // CUSTOMER TYPE
    // ===============================

    const { count } = customer
      ? await supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("customer_id", customer.id)
      : { count: 0 };

    const customerType = customer ? (count === 0 ? "new" : "returning") : "anonymous";

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

          customer_id: customer?.id ?? null,

          status: "confirmed",
          type: orderType,

          customer_name: customerName || null,
          customer_phone: hasCustomerPhone ? phone : null,
          address: orderType === "delivery" ? address : null,

          subtotal,
          discount,
          total,
          coupon_id: appliedCoupon?.id ?? null,
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
    } else {
      await supabase
        .from("orders")
        .update({
          type: orderType,
          customer_name: customerName || null,
          customer_phone: hasCustomerPhone ? phone : null,
          address: orderType === "delivery" ? address : null,
          subtotal,
          discount,
          total,
          coupon_id: appliedCoupon?.id ?? null,
          shipping_cost: finalShipping,
          original_shipping_cost: calculateShipping(),
        })
        .eq("id", orderId);
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
      const isPromotion = item.variant.item_type === "promotion" || item.variant.is_promotion === true;
      const itemId = item.variant.product_id || item.variant.id;
      const promotion = item.variant.promotion;

      return {
        order_id: orderId,
        item_type: isPromotion ? "promotion" : isCombo ? "combo" : "product",
        product_id: isCombo || isPromotion ? null : itemId,
        combo_id: isCombo ? itemId : null,
        variant_id: isCombo || isPromotion ? null : item.variant.variant_id || null,
        quantity: item.quantity,
        unit_price: item.variant.price,
        total: item.variant.price * item.quantity,
        note: item.note || "",
        extras: isPromotion && promotion
          ? [
              { type: "promotion", id: promotion.id, name: promotion.name, price: promotion.finalPrice },
              ...((promotion.items || []).map((promoItem: any) => ({
                type: "incluye",
                id: promoItem.id,
                itemType: promoItem.itemType,
                name: promoItem.name,
                price: promoItem.price,
              }))),
            ]
          : [],
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

    if (isBuilder && customer?.id) {
      const { error: loyaltyError } = await supabase.rpc("process_loyalty_for_order", {
        p_order_id: orderId,
      });
      if (loyaltyError && loyaltyError.code !== "42883") {
        console.error("Loyalty processing error:", loyaltyError);
      }
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

      customer_id: customer?.id ?? null,
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

    if (customer?.id) {
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
    }

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
  const categoryById = new Map(categories.map((category: any) => [category.id, category]));
  const isDeliveryOrder = orderType === "delivery";
  const filteredProducts = products
    .filter((product) => {
      if (product.is_active === false) return false;
      const category = categoryById.get(product.category_id) as any;
      if (isDeliveryOrder && product.item_type !== "promotion") {
        if (product.show_in_menu === false) return false;
        if (category?.delivery_visible === false) return false;
      }
      if (selectedCategory && selectedCategory !== "all") {
        return product.category_id === selectedCategory;
      }
      return true;
    });
  const visibleCategories = categories
    .filter((category: any) => {
      if (category.active === false) return false;
      if (isDeliveryOrder && category.delivery_visible === false) return false;
      return filteredProducts.some((product) => product.category_id === category.id);
    })
    .sort((a: any, b: any) => {
      const aOrder = isDeliveryOrder ? a.delivery_position ?? a.position ?? 9999 : a.position ?? 9999;
      const bOrder = isDeliveryOrder ? b.delivery_position ?? b.position ?? 9999 : b.position ?? 9999;
      return aOrder - bOrder || a.name?.localeCompare(b.name);
    });
  const hasPromotions = products.some((product) => product.item_type === "promotion");
  const menuCategories = hasPromotions
    ? [{ id: PROMOTIONS_CATEGORY_ID, name: "Promos", icon: "PROMO" }, ...visibleCategories]
    : visibleCategories;
  const searchResults = filteredProducts
    .filter((product) => {
      if (!normalizedSearch) return true;
      const category = categoryById.get(product.category_id) as any;
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
    .slice(0, normalizedSearch ? 16 : 30);

  const orderTypeMeta =
    ORDER_TYPES.find((type) => type.id === orderType) || ORDER_TYPES[1];
  const OrderTypeIcon = orderTypeMeta.icon;
  const totalItems = cart.reduce((acc, item) => acc + Number(item.quantity || 0), 0);

  return (
    <div className="h-full w-[min(600px,100vw)] flex flex-col border-l border-slate-200 bg-[#F6F7F9] text-slate-950">
      {/* HEADER */}
      <div className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
            <OrderTypeIcon size={13} />
            {orderTypeMeta.label}
          </div>
          <h2 className="mt-1.5 text-xl font-black tracking-[-0.04em] text-slate-950">
            {step === "build" && (selectedOrder ? "Editar pedido" : "Construir pedido")}
            {step === "checkout" && (selectedOrder ? "Guardar cambios" : "Confirmar pedido")}
          </h2>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            {totalItems} unidades / {cart.length} lineas / Total ${calculateTotal().toLocaleString("es-AR")}
          </p>
        </div>

        {step === "checkout" && (
          <div className="flex shrink-0 items-center gap-2">
            {isEdit && selectedOrder && (
              <button
                onClick={() => setMode("view")}
                className="rounded-full border border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
              >
                Cancelar edición
              </button>
            )}
            <button
              onClick={() => {
                if (isEdit) setMode("view");
                setStep("build");
              }}
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-2 text-xs font-black uppercase text-white transition hover:bg-black"
            >
              ← Volver
            </button>
          </div>
        )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
          <div className={`rounded-lg px-3 py-1.5 text-center text-[11px] font-black uppercase transition ${step === "build" ? "bg-white text-slate-950 shadow-sm" : "text-slate-400"}`}>
            1. Productos
          </div>
          <div className={`rounded-lg px-3 py-1.5 text-center text-[11px] font-black uppercase transition ${step === "checkout" ? "bg-white text-slate-950 shadow-sm" : "text-slate-400"}`}>
            2. Cobro
          </div>
        </div>
      </div>

      {/* BODY */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {step === "build" && (
          <>
            {/* Tipo orden */}
            <div className="grid grid-cols-3 gap-2">
              {ORDER_TYPES.map((type) => {
                const Icon = type.icon;
                const active = orderType === type.id;
                return (
                <button
                  key={type.id}
                  onClick={() => {
                    setOrderType(type.id);
                    setSelectedCategory(null);
                  }}
                  className={`rounded-xl border px-3 py-2 text-left transition ${
                    active
                      ? "border-slate-950 bg-white shadow-sm"
                      : "border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white"
                  }`}
                >
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-500"}`}>
                    <Icon size={15} />
                  </div>
                  <p className="mt-2 text-[11px] font-black uppercase text-slate-950">{type.label}</p>
                  <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500">{type.description}</p>
                </button>
                );
              })}
            </div>

            {/* CATEGORÍAS / PRODUCTOS */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  Buscar producto
                </label>
                <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition focus-within:border-slate-950 focus-within:bg-white">
                  <Search size={17} className="text-slate-400" />
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
                    placeholder="Buscar por nombre, categoria o descripcion..."
                    className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400"
                  />
                  {productSearch && (
                    <button
                      type="button"
                      onClick={() => setProductSearch("")}
                      className="rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] font-medium text-slate-400">
                  Enter agrega el primer resultado. Click agrega directo.
                </p>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black uppercase transition ${
                      !selectedCategory || selectedCategory === "all"
                        ? "bg-slate-950 text-white"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    Todas
                  </button>
                  {menuCategories.map((category: any) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setSelectedCategory(category.id)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black uppercase transition ${
                        selectedCategory === category.id
                          ? "bg-slate-950 text-white"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 max-h-[46vh] overflow-y-auto rounded-xl border border-slate-200 bg-white">
                {searchResults.length === 0 ? (
                  <div className="px-4 py-7 text-center text-sm font-semibold text-slate-400">
                    No encontramos productos con esa busqueda
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {searchResults.map((product) => {
                      const defaultVariant =
                        product.product_variants?.find((variant: any) => variant.is_default) ||
                        product.product_variants?.[0];
                      const price = Number(product.price ?? defaultVariant?.price ?? 0);
                      const category = categoryById.get(product.category_id) as any;
                      const isPromotion = product.item_type === "promotion";

                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => {
                            addToCart(product);
                            setProductSearch("");
                          }}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-950">
                              {product.name}
                            </p>
                            {(category?.name || isPromotion) && (
                              <p className="truncate text-[11px] font-medium text-slate-400">{isPromotion ? product.promotion?.badge || "Promo" : category.name}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-black text-slate-950">
                              ${price.toLocaleString("es-AR")}
                            </span>
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-white">
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
              className={`w-full rounded-xl border px-3 py-2.5 text-sm font-semibold outline-none transition focus:border-slate-950 ${selectedOrder ? "bg-slate-100 text-slate-500 cursor-not-allowed" : "border-slate-200 bg-white text-slate-950"}`}
            />

            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Teléfono"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-950"
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
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-950"
              />
            )}

            {orderType === "delivery" && autoShippingEnabled && (
              <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-500">
                Envío calculado automáticamente según distancia
              </div>
            )}
            {orderType === "delivery" && (
              <div className="flex rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setAutoShippingEnabled(true)}
                  className={`flex-1 rounded-lg py-1.5 text-[11px] font-black uppercase ${
                    autoShippingEnabled
                      ? "bg-white shadow-sm text-slate-950"
                      : "text-slate-500"
                  }`}
                >
                  Automático
                </button>

                <button
                  type="button"
                  onClick={() => setAutoShippingEnabled(false)}
                  className={`flex-1 rounded-lg py-1.5 text-[11px] font-black uppercase ${
                    !autoShippingEnabled
                      ? "bg-white shadow-sm text-slate-950"
                      : "text-slate-500"
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
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-950"
              />
            )}

            <input
              value={manualDiscount}
              onChange={(e) => setManualDiscount(e.target.value)}
              placeholder="Descuento (10% o 500)"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-950"
            />
            <div className="space-y-3">
              {!appliedCoupon && (
                <div className="flex gap-2">
                  <input
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    placeholder="Código de cupón"
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-950"
                  />

                  <button
                    type="button"
                    onClick={handleValidateCoupon}
                    className="rounded-xl bg-slate-950 px-4 text-xs font-black uppercase text-white transition hover:bg-black"
                  >
                    Aplicar
                  </button>
                </div>
              )}

              {appliedCoupon && (
                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
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
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm space-y-3">
              <h3 className="font-semibold text-gray-800">Método de pago</h3>

              {payments.map((payment, index) => {
                const selectedMethod = paymentMethods.find(
                  (pm) => pm.id === payment.payment_method_id,
                );

                const isSplitPayment = payments.length > 1;

                return (
                  <div
                    key={index}
                    className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5"
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
                        className="flex-1 rounded-lg border border-slate-200 bg-white p-2.5 text-sm font-semibold text-slate-950 outline-none focus:border-slate-950"
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
                          className="w-24 rounded-lg border border-slate-200 bg-white p-2.5 text-sm font-semibold text-slate-950 outline-none focus:border-slate-950"
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
                        className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm font-semibold text-slate-950 outline-none focus:border-slate-950"
                      />
                    )}
                  </div>
                );
              })}

              {payments.length === 1 && (
                <button
                  type="button"
                  onClick={addPaymentLine}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-black uppercase text-slate-600 transition hover:border-slate-950 hover:text-slate-950"
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
      <div className="border-t border-slate-200 bg-white p-4 shadow-[0_-18px_45px_rgba(15,23,42,0.08)] space-y-3">
        <div className="max-h-[150px] overflow-y-auto space-y-2">
          {cart.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center text-xs font-semibold text-slate-400">
              Buscá productos y agregalos con Enter
            </div>
          )}

          {cart.map((item, i) => (
            <div key={i} className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-950">
                    {item.variant.name}
                  </p>
                  <p className="text-[11px] font-medium text-slate-500">
                    ${Number(item.variant.price || 0).toLocaleString("es-AR")} c/u
                  </p>
                </div>

                <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => changeCartQuantity(i, -1)}
                    className="flex h-7 w-7 items-center justify-center text-slate-600 hover:text-slate-950"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-7 text-center text-xs font-black tabular-nums text-slate-950">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => changeCartQuantity(i, 1)}
                    className="flex h-7 w-7 items-center justify-center text-slate-600 hover:text-slate-950"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <div className="w-20 text-right text-xs font-black text-slate-950">
                  ${(Number(item.variant.price || 0) * item.quantity).toLocaleString("es-AR")}
                </div>

                <button
                  type="button"
                  onClick={() => removeFromCart(i)}
                  className="rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                >
                  <X size={15} />
                </button>
              </div>

              <input
                value={item.note ?? ""}
                onChange={(e) => updateNote(i, e.target.value)}
                placeholder="Nota para este producto"
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 outline-none focus:border-slate-950"
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

        <div className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-xs">
          <div className="flex justify-between font-medium text-slate-500">
            <span>Subtotal</span>
            <span>${calculateSubtotal()}</span>
          </div>
          {orderType === "delivery" && (
            <div className="flex justify-between font-medium text-slate-500">
              <span>Envío</span>
              <span>${calculateShipping().toLocaleString("es-AR")}</span>
            </div>
          )}
          <div className="flex justify-between font-medium text-slate-500">
            <span>Descuento</span>
            <span>${calculateDiscount()}</span>
          </div>

          {couponDiscount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Cupón</span>
              <span>- ${couponDiscount}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-xl font-black tracking-[-0.04em] text-slate-950">
            <span>Total</span>
            <span>${calculateTotal()}</span>
          </div>
        </div>

        {step === "build" && (
          <button
            disabled={cart.length === 0}
            onClick={() => setStep("checkout")}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 py-3 text-sm font-black uppercase text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continuar <ArrowLeft size={16} className="rotate-180" />
          </button>
        )}

        {step === "checkout" && !isView && (
          <button
            onClick={handleSave}
            disabled={isCheckoutBlocked}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-black uppercase transition ${
              isCheckoutBlocked
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-slate-950 text-white hover:bg-black"
            }`}
          >
            <Check size={17} /> {selectedOrder ? "Guardar Cambios" : "Confirmar Pedido"}
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
