"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";

export default function OrderSidePanel({
  selectedOrder,
  session,
  reloadOrders,
  setSelectedOrder,
}: any) {

  const [mode, setMode] = useState<"builder" | "view" | "edit">("builder");

  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);

  const [cart, setCart] = useState<any[]>([]);
  const [orderType, setOrderType] = useState("takeaway");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
const [note, setNote] = useState("");
  const [manualDiscount, setManualDiscount] = useState("");
const [showCancelModal, setShowCancelModal] = useState(false);
const [cancelReason, setCancelReason] = useState("");
const [cancelNote, setCancelNote] = useState("");

  const isView = mode === "view";
  const isEdit = mode === "edit";
  const isBuilder = mode === "builder";
const CANCEL_REASONS = [
  "Falta de stock",
  "Local cerrado",
  "Error en el pedido",
  "Cliente no responde",
  "Otro",
];
  // ================= EFFECT =================

  useEffect(() => {
    loadProducts();
    loadCategories();

    if (!selectedOrder) {
      resetForm();
      return;
    }

    loadOrderForEdit();
    setMode(selectedOrder.mode || "view");

  }, [selectedOrder]);

  // ================= RESET =================

  const resetForm = () => {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setAddress("");
    setOrderType("takeaway");
    setManualDiscount("");
    setMode("builder");
  };

  // ================= LOAD ORDER =================

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
    note: item.note,   // 👈 IMPORTANTE
  }))
);
    }

    setCustomerName(selectedOrder.customer_name || "");
    setCustomerPhone(selectedOrder.customer_phone || "");
    setOrderType(selectedOrder.type || "takeaway");
    setAddress(selectedOrder.address || "");
  };

  // ================= LOAD DATA =================

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

  // ================= CART =================

const addToCart = (variant: any) => {
  if (isView) return;

  setCart([
    ...cart,
    {
      variant,
      quantity: 1,
      note,
    },
  ]);

  setNote("");
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

  // ================= GUARDAR =================

  const handleSave = async () => {

    const subtotal = calculateSubtotal();
    const discount = calculateDiscount();
    const total = calculateTotal();

    let orderId = selectedOrder?.id;

    // CREAR
    if (isBuilder) {
      const { data } = await supabase
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
        })
        .select()
        .single();

      orderId = data.id;
    }

    // EDITAR
    if (isEdit) {
      await supabase
        .from("orders")
        .update({
          type: orderType,
          customer_phone: customerPhone,
          address: orderType === "delivery" ? address : null,
          subtotal,
          discount,
          total,
        })
        .eq("id", orderId);

      await supabase
        .from("order_items")
        .delete()
        .eq("order_id", orderId);
    }

    // INSERTAR ITEMS
const itemsToInsert = cart.map((item) => ({
  order_id: orderId,
  product_id: item.variant.product_id,
  variant_id: item.variant.id,
  quantity: item.quantity,
  unit_price: item.variant.price,
  total: item.variant.price * item.quantity,
  note: item.note || null,   // 👈 ESTA ES LA CLAVE
}));

    if (itemsToInsert.length) {
      await supabase.from("order_items").insert(itemsToInsert);
    }

    await reloadOrders();
    setSelectedOrder(null);
    resetForm();
  };
const handleCancelOrder = async () => {
  if (!cancelReason) {
    alert("Seleccioná un motivo");
    return;
  }

  await supabase
    .from("orders")
    .update({
      status: "cancelled",
      cancel_reason: cancelReason,
      cancel_note: cancelReason === "Otro" ? cancelNote : null,
      cancelled_by: session.opened_by,
      cancelled_at: new Date(),
    })
    .eq("id", selectedOrder.id);

  setShowCancelModal(false);
  setSelectedOrder(null);
  await reloadOrders();
};
  // ================= RENDER =================

return (
  <div className="w-1/4 h-full flex flex-col border-l border-gray-800 bg-gray-950">

    {/* HEADER */}
<div className="p-4 border-b border-gray-800 flex justify-between items-start">

  <div>
    <h3 className="text-lg font-semibold text-white">
      {isBuilder && "Nueva Orden"}
      {isView && "Detalle de Pedido"}
      {isEdit && "Editar Pedido"}
    </h3>

    {/* BOTÓN EDITAR */}
    {isView && selectedOrder?.status !== "cancelled" && (
      <button
        onClick={() => setMode("edit")}
        className="mt-2 text-sm text-yellow-400 hover:text-yellow-300"
      >
        Editar pedido
      </button>
    )}
  </div>


  {/* BOTÓN CERRAR */}
  {!isBuilder && (
    <button
      onClick={() => {
        setSelectedOrder(null);
        resetForm();
      }}
      className="text-gray-400 hover:text-white text-lg"
    >
      ✕
    </button>
  )}
</div>
{isView && selectedOrder?.status !== "cancelled" && (
  <button
    onClick={() => setShowCancelModal(true)}
    className="mt-2 w-full bg-red-600 hover:bg-red-500 text-white p-2 rounded"
  >
    Cancelar Pedido
  </button>
)}
    {/* BODY */}
 <div className="flex-1 overflow-y-auto p-4 space-y-6">

  {/* ================= TIPO DE ORDEN ================= */}
  <div className="space-y-2">
    <label className="text-xs text-gray-400 uppercase tracking-wide">
      Tipo de orden
    </label>

    <div className="flex bg-gray-800 rounded-lg p-1">
      {["delivery", "takeaway", "pedidosya"].map((type) => (
        <button
          key={type}
          disabled={isView}
          onClick={() => setOrderType(type)}
          className={`flex-1 text-xs py-2 rounded-md transition ${
            orderType === type
              ? "bg-blue-600 text-white"
              : "text-gray-400 hover:text-white"
          }`}
        >
          {type.toUpperCase()}
        </button>
      ))}
    </div>
  </div>

  {/* ================= DATOS DEL CLIENTE ================= */}
  <div className="space-y-4">

    <div className="space-y-1">
      <label className="text-xs text-gray-400">Nombre del cliente</label>
      <input
        value={customerName}
        disabled={!isBuilder}
        onChange={(e) => setCustomerName(e.target.value)}
        className="w-full bg-gray-800 p-2 rounded border border-gray-700 text-gray-200"
      />
    </div>

    <div className="space-y-1">
      <label className="text-xs text-gray-400">Teléfono</label>
      <input
        value={customerPhone}
        disabled={isView}
        onChange={(e) => setCustomerPhone(e.target.value)}
        className="w-full bg-gray-800 p-2 rounded border border-gray-700 text-gray-200"
      />
    </div>

    {orderType === "delivery" && (
      <div className="space-y-1">
        <label className="text-xs text-gray-400">Dirección</label>
        <input
          value={address}
          disabled={isView}
          onChange={(e) => setAddress(e.target.value)}
          className="w-full bg-gray-800 p-2 rounded border border-gray-700 text-gray-200"
        />
      </div>
    )}
  </div>

  {/* ================= CATEGORÍAS ================= */}
{!isView && (
  <div className="space-y-2">
    <label className="text-xs text-gray-400 uppercase tracking-wide">
      Categorías
    </label>

    <div className="flex gap-2 overflow-x-auto pb-1">
      <button
        onClick={() => setSelectedCategory(null)}
        className={`px-3 py-1 text-xs rounded-full border whitespace-nowrap ${
          !selectedCategory
            ? "bg-blue-600 border-blue-500 text-white"
            : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
        }`}
      >
        Todas
      </button>

      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => setSelectedCategory(cat.id)}
          className={`px-3 py-1 text-xs rounded-full border whitespace-nowrap ${
            selectedCategory === cat.id
              ? "bg-blue-600 border-blue-500 text-white"
              : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
          }`}
        >
          {cat.name}
        </button>
      ))}
    </div>
  </div>
)}

  {/* ================= PRODUCTOS ================= */}
  {!isView && (
    <div className="space-y-3">
      <label className="text-xs text-gray-400 uppercase tracking-wide">
        Agregar productos
      </label>
{products
  .filter(
    (p) => !selectedCategory || p.category_id === selectedCategory
  )
  .map((product) =>
    product.product_variants.map((variant: any) => (
      <button
        key={variant.id}
        onClick={() => addToCart(variant)}
        className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-700 p-3 rounded-lg text-sm text-left transition"
      >
        <div className="flex justify-between">
          <span className="text-gray-200">
            {product.name} - {variant.name}
          </span>
          <span className="text-blue-400">
            ${variant.price}
          </span>
        </div>
      </button>
    ))
  )}

      <div className="space-y-1">
        <label className="text-xs text-gray-400">
          Nota para el próximo producto
        </label>
        <input
          value={note}
          disabled={isView}
          onChange={(e) => setNote(e.target.value)}
          className="w-full bg-gray-800 p-2 rounded border border-gray-700 text-gray-200 text-sm"
        />
      </div>
    </div>
  )}

  {/* ================= CARRITO ================= */}
  {cart.length > 0 && (
    <div className="space-y-2">
      <label className="text-xs text-gray-400 uppercase tracking-wide">
        Productos agregados
      </label>

      {cart.map((item, i) => (
        <div
          key={i}
          className="bg-gray-800 border border-gray-700 p-3 rounded-lg space-y-1"
        >
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-200">
              {item.variant.name} x{item.quantity}
            </span>

            {!isView && (
              <button
                onClick={() => removeFromCart(i)}
                className="text-red-400 hover:text-red-300 text-xs"
              >
                Eliminar
              </button>
            )}
          </div>

          {item.note && (
            <div className="text-xs text-gray-400 italic">
              Nota: {item.note}
            </div>
          )}
        </div>
      ))}
    </div>
  )}

  {/* ================= DESCUENTO ================= */}
  <div className="space-y-1">
    <label className="text-xs text-gray-400">
      Descuento manual
    </label>
    <input
      value={manualDiscount}
      disabled={isView}
      onChange={(e) => setManualDiscount(e.target.value)}
      className="w-full bg-gray-800 p-2 rounded border border-gray-700 text-gray-200"
    />
  </div>

</div>

    {/* FOOTER */}
{(isBuilder || isEdit) && (
  <div className="p-4 border-t border-gray-800 space-y-4 bg-black">

    <div className="bg-gray-900 p-4 rounded-lg space-y-1 text-sm">
      <div className="flex justify-between text-gray-400">
        <span>Subtotal</span>
        <span>${calculateSubtotal()}</span>
      </div>

      <div className="flex justify-between text-gray-400">
        <span>Descuento</span>
        <span>${calculateDiscount()}</span>
      </div>

      <div className="flex justify-between text-white font-bold text-lg pt-2 border-t border-gray-700">
        <span>Total</span>
        <span>${calculateTotal()}</span>
      </div>
    </div>

    <button
      onClick={handleSave}
      className="w-full bg-green-600 hover:bg-green-500 text-white p-3 rounded-lg font-semibold transition"
    >
      {isBuilder ? "Crear Orden" : "Guardar Cambios"}
    </button>

  </div>
)}
{showCancelModal && (
  <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">

    <div className="bg-gray-900 w-[400px] p-6 rounded-xl space-y-4 border border-gray-700">

      <h3 className="text-lg font-semibold text-white">
        Cancelar Pedido
      </h3>

      {/* Motivo */}
      <div className="space-y-1">
        <label className="text-xs text-gray-400">Motivo</label>
        <select
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          className="w-full bg-gray-800 p-2 rounded border border-gray-700 text-gray-200"
        >
          <option value="">Seleccionar motivo</option>
          {CANCEL_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      {/* Nota adicional si es Otro */}
      {cancelReason === "Otro" && (
        <div className="space-y-1">
          <label className="text-xs text-gray-400">
            Detalle del motivo
          </label>
          <textarea
            value={cancelNote}
            onChange={(e) => setCancelNote(e.target.value)}
            className="w-full bg-gray-800 p-2 rounded border border-gray-700 text-gray-200"
          />
        </div>
      )}

      {/* Botones */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={() => setShowCancelModal(false)}
          className="flex-1 bg-gray-700 text-white p-2 rounded"
        >
          Volver
        </button>

        <button
          onClick={handleCancelOrder}
          className="flex-1 bg-red-600 hover:bg-red-500 text-white p-2 rounded"
        >
          Confirmar Cancelación
        </button>
      </div>

    </div>
  </div>
)}
  </div>
  
);
}