// "use client";

// import { useEffect, useState } from "react";
// import { supabase } from "@kablam/supabase";

// export default function OrderSidePanel({
//   selectedOrder,
//   session,
//   reloadOrders,
//   setSelectedOrder,
// }: any) {
//   const [step, setStep] = useState<"build" | "checkout">("build");
//   const [mode, setMode] = useState<"builder" | "view" | "edit">("builder");

//   const [products, setProducts] = useState<any[]>([]);
//   const [categories, setCategories] = useState<any[]>([]);
//   const [selectedCategory, setSelectedCategory] = useState<any>(null);

//   const [cart, setCart] = useState<any[]>([]);
//   const [orderType, setOrderType] = useState("takeaway");

//   const [customerName, setCustomerName] = useState("");
//   const [customerPhone, setCustomerPhone] = useState("");
//   const [address, setAddress] = useState("");
//   const [manualDiscount, setManualDiscount] = useState("");

//   const [showCancelModal, setShowCancelModal] = useState(false);
//   const [cancelReason, setCancelReason] = useState("");
//   const [cancelNote, setCancelNote] = useState("");

//   const CANCEL_REASONS = [
//     "Falta de stock",
//     "Local cerrado",
//     "Error en el pedido",
//     "Cliente no responde",
//     "Otro",
//   ];

//   const isView = mode === "view";
//   const isEdit = mode === "edit";
//   const isBuilder = mode === "builder";

//   // ================= EFFECT =================

//   useEffect(() => {
//     loadProducts();
//     loadCategories();

//     if (!selectedOrder) {
//       resetForm();
//       return;
//     }

//     loadOrderForEdit();
//     setMode(selectedOrder.mode || "view");
//     setStep("build");
//   }, [selectedOrder]);

//   const resetForm = () => {
//     setCart([]);
//     setCustomerName("");
//     setCustomerPhone("");
//     setAddress("");
//     setManualDiscount("");
//     setOrderType("takeaway");
//     setMode("builder");
//     setStep("build");
//   };

//   // ================= LOAD =================

//   const loadOrderForEdit = async () => {
//     const { data: items } = await supabase
//       .from("order_items")
//       .select("*, product_variants(*)")
//       .eq("order_id", selectedOrder.id);

//     if (items) {
//      setCart(
//   items.map((item: any) => ({
//     variant: item.product_variants,
//     quantity: item.quantity,
//     note: item.note || "",
//   })),
// );
//     }

//     setCustomerName(selectedOrder.customer_name || "");
//     setCustomerPhone(selectedOrder.customer_phone || "");
//     setOrderType(selectedOrder.type || "takeaway");
//     setAddress(selectedOrder.address || "");
//   };

//   const loadProducts = async () => {
//     const { data } = await supabase
//       .from("products")
//       .select("*, product_variants(*)");
//     setProducts(data || []);
//   };

//   const loadCategories = async () => {
//     const { data } = await supabase
//       .from("categories")
//       .select("*")
//       .order("position");
//     setCategories(data || []);
//   };

//   // ================= CART =================

//   const addToCart = (variant: any) => {
//     if (isView) return;
//     setCart([...cart, { variant, quantity: 1, note: "" }]);
//   };

//   const updateNote = (index: number, value: string) => {
//     const updated = [...cart];
//     updated[index].note = value;
//     setCart(updated);
//   };

//   const removeFromCart = (index: number) => {
//     if (isView) return;
//     const updated = [...cart];
//     updated.splice(index, 1);
//     setCart(updated);
//   };

//   // ================= CALCULOS =================

//   const calculateSubtotal = () =>
//     cart.reduce((acc, item) => acc + item.variant.price * item.quantity, 0);

//   const calculateDiscount = () => {
//     if (!manualDiscount) return 0;
//     if (manualDiscount.includes("%")) {
//       const percent = Number(manualDiscount.replace("%", ""));
//       return (calculateSubtotal() * percent) / 100;
//     }
//     return Number(manualDiscount);
//   };

//   const calculateTotal = () => calculateSubtotal() - calculateDiscount();

//   // ================= SAVE =================

//   const handleSave = async () => {
//     const subtotal = calculateSubtotal();
//     const discount = calculateDiscount();
//     const total = calculateTotal();

//     let orderId = selectedOrder?.id;

//     if (isBuilder) {
//       const { data } = await supabase
//         .from("orders")
//         .insert({
//           tenant_id: session.tenant_id,
//           branch_id: session.branch_id,
//           cash_session_id: session.id,
//           cash_register_id: session.cash_register_id,
//           created_by: session.opened_by,
//           status: "unconfirmed",
//           type: orderType,
//           customer_name: customerName,
//           customer_phone: customerPhone,
//           address: orderType === "delivery" ? address : null,
//           subtotal,
//           discount,
//           total,
//           paid_amount: 0,
//         })
//         .select()
//         .single();

//       orderId = data.id;
//     }

//     if (isEdit) {
//       await supabase
//         .from("orders")
//         .update({
//           type: orderType,
//           customer_phone: customerPhone,
//           address: orderType === "delivery" ? address : null,
//           subtotal,
//           discount,
//           total,
//         })
//         .eq("id", orderId);

//       await supabase.from("order_items").delete().eq("order_id", orderId);
//     }

//     const itemsToInsert = cart.map((item) => ({
//       order_id: orderId,
//       product_id: item.variant.product_id,
//       variant_id: item.variant.id,
//       quantity: item.quantity,
//       unit_price: item.variant.price,
//       total: item.variant.price * item.quantity,
//       note: item.note || "",
//     }));

//     if (itemsToInsert.length) {
//       await supabase.from("order_items").insert(itemsToInsert);
//     }

//     await reloadOrders();
//     setSelectedOrder(null);
//     resetForm();
//   };

//   // ================= UI =================

//   return (
//     <div className="w-[520px] h-full flex flex-col bg-white border-l border-gray-200">
//       {/* HEADER */}
//       <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center">
//         <div>
//           <h2 className="text-lg font-semibold text-gray-900">
//             {step === "build" && "Construir pedido"}
//             {step === "checkout" && "Confirmar pedido"}
//           </h2>
//           <p className="text-xs text-gray-500 mt-1">
//             {cart.length} productos agregados
//           </p>
//         </div>

//         {step === "checkout" && (
//           <button
//             onClick={() => setStep("build")}
//             className="text-sm text-blue-600 hover:text-blue-700 font-medium"
//           >
//             ← Volver
//           </button>
//         )}
//       </div>

//       {/* BODY */}
//       <div className="flex-1 overflow-y-auto p-6 space-y-6">
//         {step === "build" && (
//           <>
//             {/* Tipo orden */}
//             <div className="flex bg-gray-100 rounded-lg p-1">
//               {["delivery", "takeaway", "pedidosya"].map((type) => (
//                 <button
//                   key={type}
//                   onClick={() => setOrderType(type)}
//                   className={`flex-1 py-2 text-sm rounded-md ${
//                     orderType === type
//                       ? "bg-white shadow text-gray-900"
//                       : "text-gray-500"
//                   }`}
//                 >
//                   {type.toUpperCase()}
//                 </button>
//               ))}
//             </div>

//             {/* Categorías */}
//             <div className="flex gap-2 overflow-x-auto">
//               <button
//                 onClick={() => setSelectedCategory(null)}
//                 className={`px-3 py-1 text-xs rounded-full border ${
//                   !selectedCategory
//                     ? "bg-gray-900 text-white"
//                     : "bg-white text-gray-600 border-gray-300"
//                 }`}
//               >
//                 Todas
//               </button>

//               {categories.map((cat) => (
//                 <button
//                   key={cat.id}
//                   onClick={() => setSelectedCategory(cat.id)}
//                   className={`px-3 py-1 text-xs rounded-full border ${
//                     selectedCategory === cat.id
//                       ? "bg-gray-900 text-white"
//                       : "bg-white text-gray-600 border-gray-300"
//                   }`}
//                 >
//                   {cat.name}
//                 </button>
//               ))}
//             </div>

//             {/* Productos */}
//             <div className="divide-y divide-gray-200">
//               {products
//                 .filter(
//                   (p) =>
//                     !selectedCategory || p.category_id === selectedCategory,
//                 )
//                 .flatMap((product) =>
//                   product.product_variants.map((variant: any) => (
//                     <div
//                       key={variant.id}
//                       className="py-3 flex justify-between items-center"
//                     >
//                       <button
//                         onClick={() => addToCart(variant)}
//                         className="text-left text-sm text-gray-800 hover:text-black"
//                       >
//                         {product.name} · {variant.name}
//                       </button>

//                       <span className="text-sm font-medium text-gray-700">
//                         ${variant.price}
//                       </span>
//                     </div>
//                   )),
//                 )}
//             </div>
//           </>
//         )}

//         {step === "checkout" && (
//           <>
//             <input
//               value={customerName}
//               onChange={(e) => setCustomerName(e.target.value)}
//               placeholder="Nombre del cliente"
//               className="w-full border border-gray-300 p-3 rounded-lg text-sm"
//             />

//             <input
//               value={customerPhone}
//               onChange={(e) => setCustomerPhone(e.target.value)}
//               placeholder="Teléfono"
//               className="w-full border border-gray-300 p-3 rounded-lg text-sm"
//             />

//             {orderType === "delivery" && (
//               <input
//                 value={address}
//                 onChange={(e) => setAddress(e.target.value)}
//                 placeholder="Dirección"
//                 className="w-full border border-gray-300 p-3 rounded-lg text-sm"
//               />
//             )}

//             <input
//               value={manualDiscount}
//               onChange={(e) => setManualDiscount(e.target.value)}
//               placeholder="Descuento (10% o 500)"
//               className="w-full border border-gray-300 p-3 rounded-lg text-sm"
//             />
//           </>
//         )}
//       </div>

//       {/* RESUMEN INFERIOR */}
//       <div className="border-t border-gray-200 p-6 bg-gray-50 space-y-4">
//         <div className="max-h-[150px] overflow-y-auto space-y-2">
//           {cart.map((item, i) => (
//             <div key={i} className="space-y-1">
//               <div className="flex justify-between text-sm text-gray-800">
//                 <span>
//                   {item.variant.name} x{item.quantity}
//                 </span>
//                 <button
//                   onClick={() => removeFromCart(i)}
//                   className="text-xs text-red-500"
//                 >
//                   ✕
//                 </button>
//               </div>

//               <input
//                 value={item.note ?? ""}
//                 onChange={(e) => updateNote(i, e.target.value)}
//                 placeholder="Nota para este producto"
//                 className="w-full border border-gray-300 px-2 py-1 rounded text-xs"
//               />
//             </div>
//           ))}
//         </div>

//         <div className="space-y-1 text-sm">
//           <div className="flex justify-between text-gray-600">
//             <span>Subtotal</span>
//             <span>${calculateSubtotal()}</span>
//           </div>

//           <div className="flex justify-between text-gray-600">
//             <span>Descuento</span>
//             <span>${calculateDiscount()}</span>
//           </div>

//           <div className="flex justify-between text-lg font-semibold text-gray-900">
//             <span>Total</span>
//             <span>${calculateTotal()}</span>
//           </div>
//         </div>

//         {step === "build" && (
//           <button
//             disabled={cart.length === 0}
//             onClick={() => setStep("checkout")}
//             className="w-full bg-gray-900 text-white py-3 rounded-lg disabled:opacity-40"
//           >
//             Continuar
//           </button>
//         )}

//         {step === "checkout" && (
//           <button
//             onClick={handleSave}
//             className="w-full bg-blue-600 text-white py-3 rounded-lg"
//           >
//             Confirmar Pedido
//           </button>
//         )}
//       </div>
//     </div>
//   );
// }







"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";

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

  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);

  const [cart, setCart] = useState<any[]>([]);
  const [orderType, setOrderType] = useState("takeaway");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [manualDiscount, setManualDiscount] = useState("");

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

  const calculateTotal = () => calculateSubtotal() - calculateDiscount();

  // ================= PAGOS =================

const updatePayment = (
  index: number,
  field: keyof PaymentLine,
  value: string,
) => {
  const updated = payments.map((p, i) =>
    i === index ? { ...p, [field]: value } : p
  );

  const total = calculateTotal();

  if (updated.length > 1) {
    const lastIndex = updated.length - 1;

    // Sumar todos menos el último
    const sumExceptLast = updated
      .slice(0, lastIndex)
      .reduce((acc, p) => acc + Number(p.amount || 0), 0);

    const remaining = total - sumExceptLast;

    updated[lastIndex].amount =
      remaining > 0 ? remaining.toString() : "0";
  }

  setPayments(updated);
};

const addPaymentLine = () => {
  const total = calculateTotal();

  const sumCurrent = payments.reduce(
    (acc, p) => acc + Number(p.amount || 0),
    0
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

  const removePaymentLine = (index: number) => {
    setPayments(payments.filter((_, i) => i !== index));
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
      0
    );

    if (totalPayments !== total) {
      alert("Los pagos no coinciden con el total");
      return;
    }
  }

  let orderId = selectedOrder?.id;

  if (isBuilder) {
    const { data, error } = await supabase
      .from("orders")
      .insert({
        tenant_id: session.tenant_id,
        branch_id: session.branch_id,
        cash_session_id: session.id,
        cash_register_id: session.cash_register_id,
        created_by: session.opened_by,
        status: "unconfirmed",
        type: orderType,
        customer_name: customerName,
        customer_phone: customerPhone,
        address: orderType === "delivery" ? address : null,
        subtotal,
        discount,
        total,
        paid_amount: 0,
        is_paid: false,
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

  // Insertar items
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

// Insertar pagos
let paymentInsert;

if (!isSplitPayment) {
  console.log("ORDER ID:", orderId);
console.log("PAYMENTS:", payments);
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
  alert("Error insertando pago. Mirá la consola.");
  return;
}

  await reloadOrders();
  setSelectedOrder(null);
  resetForm();
};
  // ================= UI =================
  // (TU UI ORIGINAL + bloque de pagos agregado en checkout)
  const isSplitPayment = payments.length > 1;

const totalPayments = isSplitPayment
  ? payments.reduce((acc, p) => acc + Number(p.amount || 0), 0)
  : calculateTotal();


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
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Dirección"
                className="w-full border border-gray-300 p-3 rounded-lg text-sm"
              />
            )}

            <input
              value={manualDiscount}
              onChange={(e) => setManualDiscount(e.target.value)}
              placeholder="Descuento (10% o 500)"
              className="w-full border border-gray-300 p-3 rounded-lg text-sm"
            />
<div className="border-t pt-4 space-y-4">
  <h3 className="font-semibold text-gray-800">Método de pago</h3>

  {payments.map((payment, index) => {
    const selectedMethod = paymentMethods.find(
      (pm) => pm.id === payment.payment_method_id
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
              updatePayment(index, "payment_method_id", e.target.value)
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

          <div className="flex justify-between text-gray-600">
            <span>Descuento</span>
            <span>${calculateDiscount()}</span>
          </div>

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
            className="w-full bg-blue-600 text-white py-3 rounded-lg"
          >
            Confirmar Pedido
          </button>
        )}
      </div>
    </div>
  );
}