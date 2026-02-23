"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";

export default function OrderSidePanel({
  selectedOrder,
  session,
  reloadOrders,
  setSelectedOrder
}: any) {
  const [mode, setMode] = useState("builder");

  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  const [cart, setCart] = useState<any[]>([]);
  const [note, setNote] = useState("");

  const [orderType, setOrderType] = useState("takeaway");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [manualDiscount, setManualDiscount] = useState("");
  const [coupon, setCoupon] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);

  useEffect(() => {
    loadProducts();
    loadCategories();
    loadPaymentMethods();

    if (selectedOrder) {
      loadOrderForEdit();
    } else {
      resetForm();
    }
  }, [selectedOrder]);

  const resetForm = () => {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setAddress("");
    setOrderType("takeaway");
    setMode("builder");
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
          note: item.note,
        })),
      );
    }

    setCustomerName(selectedOrder.customer_name || "");
    setCustomerPhone(selectedOrder.customer_phone || "");
    setOrderType(selectedOrder.type || "takeaway");
  };

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
      .eq("is_active", true);

    setPaymentMethods(data || []);
  };

  const addToCart = (variant: any) => {
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
    const updated = [...cart];
    updated.splice(index, 1);
    setCart(updated);
  };

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

  const handleConfirmOrder = async () => {
    const subtotal = calculateSubtotal();
    const discount = calculateDiscount();
    const total = calculateTotal();

    let orderId = selectedOrder?.id;

    // Crear nueva orden
    if (!orderId) {
      const { data, error } = await supabase
        .from("orders")
        .insert({
          tenant_id: session.tenant_id,
          branch_id: session.branch_id,
          cash_session_id: session.id,
          cash_register_id: session.cash_register_id, // 🔥 AGREGAR ESTO
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

      if (error) {
        console.error("ERROR CREANDO ORDEN:", error);
        alert(error.message);
        return;
      }

      if (!data) {
        alert("No se pudo crear la orden");
        return;
      }
      console.log("RESULT:", { data, error });
      orderId = data.id;
    } else {
      // Editar orden existente
      await supabase
        .from("orders")
        .update({
          type: orderType,
          customer_name: customerName,
          customer_phone: customerPhone,
          address: orderType === "delivery" ? address : null,
          subtotal,
          discount,
          total,
        })
        .eq("id", orderId);

      await supabase.from("order_items").delete().eq("order_id", orderId);
    }

    // Insertar items
    const itemsToInsert = cart.map((item) => ({
      order_id: orderId,
      product_id: item.variant.product_id,
      variant_id: item.variant.id,
      quantity: item.quantity,
      unit_price: item.variant.price,
      total: item.variant.price * item.quantity,
      note: item.note || null,
    }));

    if (itemsToInsert.length) {
      const { error } = await supabase
        .from("order_items")
        .insert(itemsToInsert);

      if (error) {
        console.error("ERROR INSERTANDO ITEMS:", error);
        alert(error.message);
      }
    }
    await reloadOrders();
    setSelectedOrder(null);
    setMode("builder");
  };

  if (mode === "builder") {
    return (
      <div className="w-1/4 bg-gray-900 p-4 flex flex-col overflow-auto">
        {/* Tipo Orden */}
        <select
          value={orderType}
          onChange={(e) => setOrderType(e.target.value)}
          className="mb-3 p-2 bg-gray-800"
        >
          <option value="delivery">Delivery</option>
          <option value="takeaway">Takeaway</option>
          <option value="pedidosya">PedidosYa</option>
        </select>

        {/* Categorías */}
        <div className="flex gap-2 overflow-x-auto mb-3">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setSelectedCategory(cat.id);
                setSelectedProduct(null);
              }}
              className="px-2 py-1 bg-gray-700 text-xs rounded"
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Productos */}
        {selectedCategory && (
          <div className="mb-3">
            {products
              .filter((p) => p.category_id === selectedCategory)
              .map((product) => (
                <button
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  className="block w-full text-left p-2 bg-gray-800 mb-1 text-xs rounded"
                >
                  {product.name}
                </button>
              ))}
          </div>
        )}

        {/* Variantes */}
        {selectedProduct && (
          <div className="mb-3">
            {selectedProduct.product_variants.map((variant: any) => (
              <div key={variant.id} className="mb-2">
                <button
                  onClick={() => addToCart(variant)}
                  className="w-full bg-white text-black text-xs p-1 rounded"
                >
                  {variant.name} - ${variant.price}
                </button>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Nota"
                  className="w-full text-xs mt-1 p-1 bg-gray-800"
                />
              </div>
            ))}
          </div>
        )}

        {/* Carrito */}
        <div className="mt-3 border-t pt-3 text-xs">
          {cart.map((item, i) => (
            <div key={i} className="flex justify-between mb-1">
              <span>{item.variant.name}</span>
              <span>${item.variant.price}</span>
              <button onClick={() => removeFromCart(i)}>✕</button>
            </div>
          ))}
        </div>

        <button
          onClick={() => setMode("checkout")}
          className="mt-4 bg-green-600 text-white p-2 rounded"
        >
          Continuar
        </button>
      </div>
    );
  }

  return (
    <div className="w-1/4 bg-gray-900 p-4 flex flex-col">
      <h3 className="font-bold mb-3">Checkout</h3>

      <input
        placeholder="Nombre"
        value={customerName}
        onChange={(e) => setCustomerName(e.target.value)}
        className="mb-2 p-2 bg-gray-800"
      />

      {orderType !== "pedidosya" && (
        <input
          placeholder="Teléfono"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          className="mb-2 p-2 bg-gray-800"
        />
      )}

      {orderType === "delivery" && (
        <input
          placeholder="Dirección"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="mb-2 p-2 bg-gray-800"
        />
      )}

      <select
        value={paymentMethod}
        onChange={(e) => setPaymentMethod(e.target.value)}
        className="mb-2 p-2 bg-gray-800"
      >
        <option value="">Forma de pago</option>
        {paymentMethods.map((pm) => (
          <option key={pm.id} value={pm.id}>
            {pm.name}
          </option>
        ))}
      </select>

      <input
        placeholder="Descuento manual (ej: 10% o 500)"
        value={manualDiscount}
        onChange={(e) => setManualDiscount(e.target.value)}
        className="mb-2 p-2 bg-gray-800"
      />

      <div className="text-sm mb-3">
        Subtotal: ${calculateSubtotal()}
        <br />
        Descuento: ${calculateDiscount()}
        <br />
        Total: ${calculateTotal()}
      </div>

      <button
        onClick={handleConfirmOrder}
        className="bg-green-600 p-2 rounded text-white"
      >
        Crear Orden
      </button>

      <button
        onClick={() => setMode("builder")}
        className="mt-2 text-xs underline"
      >
        Volver
      </button>
    </div>
  );
}
