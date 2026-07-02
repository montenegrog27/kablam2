"use client";

import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import OrderCard from "./OrderCard";
import { useState, useEffect } from "react";
import { publishOrderRealtimeEvent } from "../../lib/publishOrderRealtimeEvent";
import {
  getWhatsAppMessagePreview,
  getWhatsAppReadMap,
  markWhatsAppConversationRead,
  notifyIncomingWhatsApp,
} from "@/lib/whatsappNotifications";

const STATUSES = ["unconfirmed", "confirmed", "preparing", "ready", "sent"];
const STATUS_META: any = {
  unconfirmed: {
    label: "No confirmados",
    accent: "bg-gray-100 text-gray-700",
  },
  confirmed: {
    label: "Confirmados",
    accent: "bg-amber-100 text-amber-700",
  },
  preparing: {
    label: "En preparación",
    accent: "bg-blue-100 text-blue-700",
  },
  ready: {
    label: "Listos",
    accent: "bg-emerald-100 text-emerald-700",
  },
  sent: {
    label: "Enviados",
    accent: "bg-purple-100 text-purple-700",
  },
};

function statusToRealtimeEvent(status: string) {
  if (status === "confirmed") return "orders.confirmed";
  if (status === "preparing") return "orders.preparing";
  if (status === "ready") return "orders.ready";
  if (status === "sent") return "orders.sent";
  if (status === "delivered") return "orders.delivered";
  return "orders.accepted";
}

async function updateOrderStatusViaApi(orderId: string, status: string, updates: Record<string, any>) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("No hay sesion activa.");

  const response = await fetch(`/api/orders/${orderId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status, updates }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.details || result.error || "No se pudo actualizar el pedido.");
  }
  return result;
}

export default function OrdersBoard({
  orders,
  activeConversationId,
  selectedOrderId,
  userRecord,
  onSelect,
  onMessages,
  reloadOrders,
}: any) {
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState<any>({});
  const [boardOrders, setBoardOrders] = useState<any[]>(orders);
  const [pendingAlert, setPendingAlert] = useState<any>(null);
  useEffect(() => {
    setBoardOrders(orders);
  }, [orders]);

  useEffect(() => {
    const conversationIds = orders.map((order: any) => order.conversation_id).filter(Boolean);
    if (!conversationIds.length) {
      setUnread({});
      return;
    }

    const loadInitialUnread = async () => {
      const readMap = getWhatsAppReadMap();
      const { data } = await supabase
        .from("messages")
        .select("conversation_id, created_at")
        .in("conversation_id", conversationIds)
        .eq("sender_type", "customer");

      const counts: Record<string, number> = {};
      data?.forEach((message: any) => {
        const lastRead = readMap[message.conversation_id];
        if (!lastRead || new Date(message.created_at).getTime() > lastRead) {
          counts[message.conversation_id] = (counts[message.conversation_id] || 0) + 1;
        }
      });

      setUnread(counts);
    };

    loadInitialUnread();
  }, [orders]);

  useEffect(() => {
    const branchId = boardOrders.find((order: any) => order.branch_id)?.branch_id;
    const orderByConversation = new Map(
      boardOrders
        .filter((order: any) => order.conversation_id)
        .map((order: any) => [order.conversation_id, order]),
    );

    const channel = supabase
      .channel(`messages-board-${branchId || "all"}-${activeConversationId || "none"}`)

      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const msg = payload.new;
          if (branchId && msg.branch_id !== branchId) return;
          if (msg.sender_type !== "customer") return;


          // si el chat ya está abierto no mostramos badge
          if (msg.conversation_id === activeConversationId) {
            markWhatsAppConversationRead(msg.conversation_id);
            return;
          }

          setUnread((prev: any) => ({
            ...prev,
            [msg.conversation_id]: (prev[msg.conversation_id] || 0) + 1,
          }));

          const order = orderByConversation.get(msg.conversation_id);
          notifyIncomingWhatsApp({
            messageId: msg.id,
            conversationId: msg.conversation_id,
            title: order
              ? `Pedido #${order.id.slice(-6).toUpperCase()} - ${order.customer_name || "Cliente"}`
              : "Mensaje de cliente",
            body: getWhatsAppMessagePreview(msg.media_type, msg.message),
            tagPrefix: "order-chat",
          });
        },
      )

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversationId, boardOrders]);

  useEffect(() => {
    const channel = supabase
      .channel("orders-realtime")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
        },
        (payload) => {
          const updated = payload.new;

          console.log("ORDER UPDATED REALTIME:", updated);

          setBoardOrders((prev: any) =>
            prev.map((o: any) =>
              o.id === updated.id ? { ...o, ...updated } : o,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ===============================
  // NOTIFY RIDER
  // ===============================

  const handleNotifyRider = async (order: any, rider: any) => {
    const mapUrl = order.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`
      : "";

    const message = `📦 Pedido #${order.id.slice(0, 4)}

👤 Cliente: ${order.customer_name || "Cliente"} (${order.customer_phone || "Sin teléfono"})
📍 Dirección: ${order.address || "No especificada"}
🗺️ Mapa: ${mapUrl}
📲 Mensaje al cliente: https://wa.me/${order.customer_phone?.replace(/\D/g, "")}?text=Hola!%20soy%20el%20repartidor%20y%20estoy%20afuera%20de%20tu%20domicilio%20con%20tu%20pedido

💰 Total a cobrar: $${order.total?.toLocaleString("es-AR") || 0}

🚚 ¡A entregarlo!`;

    try {
      const { data: existingConversation } = await supabase
        .from("rider_conversations")
        .select("*")
        .eq("branch_id", order.branch_id)
        .eq("rider_id", rider.id)
        .maybeSingle();

      const conversation = existingConversation || (await supabase
        .from("rider_conversations")
        .insert({
          tenant_id: order.tenant_id,
          branch_id: order.branch_id,
          rider_id: rider.id,
        })
        .select()
        .single()).data;

      const { data: payments } = await supabase
        .from("order_payments")
        .select("payment_methods(name)")
        .eq("order_id", order.id);

      const paymentMethod =
        payments?.map((payment: any) => payment.payment_methods?.name).filter(Boolean).join(", ") ||
        order.payment_method ||
        "No especificado";
      const phoneDigits = order.customer_phone?.replace(/\D/g, "") || "";
      const phoneForWa = phoneDigits.startsWith("54") ? phoneDigits : `549${phoneDigits}`;
      const customerLink = phoneDigits
        ? `https://wa.me/${phoneForWa}?text=${encodeURIComponent(`Hola, soy tu repartidor del pedido #${order.id.slice(-6).toUpperCase()}. Estoy en camino.`)}`
        : "Sin telefono";

      const res = await fetch("/api/whatsapp/send-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId: order.branch_id,
          tenantId: order.tenant_id,
          riderId: rider.id,
          conversationId: conversation?.id,
          phone: rider.phone,
          type: "template",
          templateName: "rider_nuevo_pedido",
          params: [
            order.id.slice(-6).toUpperCase(),
            order.address || "No especificada",
            order.notes || order.note || "Sin indicaciones",
            `$${Number(order.total || 0).toLocaleString("es-AR")}`,
            paymentMethod,
            customerLink,
          ],
        }),
      });

      const data = await res.json();

      if (data.success) {
        alert(`✅ Mensaje enviado a ${rider.name}`);
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (err) {
      console.error("Error sending to rider:", err);
      alert("Error al enviar mensaje");
    }
  };

  const handleAssignRider = (orderId: string, rider: any) => {
    console.log("Rider asignado:", orderId, rider);
    reloadOrders();
  };
  const getOrdersByStatus = (status: string) =>
    boardOrders.filter((o: any) => o.status === status);

  const getNextStatus = (current: string, orderType?: string) => {
    // Takeaway: ready → delivered (saltea "sent")
    if (current === "ready" && orderType === "takeaway") return "delivered";
    // Delivery: sent → delivered
    if (current === "sent") return "delivered";

    const index = STATUSES.indexOf(current);
    return STATUSES[index + 1] || current;
  };

  const findDeliveryAlertsForOrder = async (order: any) => {
    if (!order?.tenant_id) return [];
    const { data: alertRows, error: alertError } = await supabase
      .from("cashier_delivery_alerts")
      .select("*")
      .eq("tenant_id", order.tenant_id)
      .eq("is_active", true)
      .or(`branch_id.eq.${order.branch_id},branch_id.is.null`);

    if (alertError) {
      if (!alertError.message.includes("does not exist") && !alertError.message.includes("schema cache")) {
        console.error("Error loading cashier delivery alerts:", alertError);
      }
      return [];
    }

    if (!alertRows?.length) return [];

    const { data: items } = await supabase
      .from("order_items")
      .select("product_id, combo_id, products(id, name, category_id), combos(id, name)")
      .eq("order_id", order.id);

    const productIds = new Set<string>();
    const categoryIds = new Set<string>();
    const matchedNamesByProduct = new Map<string, string>();
    const matchedNamesByCategory = new Map<string, string>();
    const comboIds = (items || []).map((item: any) => item.combo_id).filter(Boolean);

    (items || []).forEach((item: any) => {
      if (item.product_id) {
        productIds.add(item.product_id);
        if (item.products?.name) matchedNamesByProduct.set(item.product_id, item.products.name);
      }
      if (item.products?.category_id) {
        categoryIds.add(item.products.category_id);
        if (item.products?.name) matchedNamesByCategory.set(item.products.category_id, item.products.name);
      }
    });

    if (comboIds.length) {
      const { data: comboProducts } = await supabase
        .from("combo_products")
        .select("combo_id, product_id, products(id, name, category_id)")
        .in("combo_id", comboIds);

      (comboProducts || []).forEach((item: any) => {
        if (item.product_id) {
          productIds.add(item.product_id);
          if (item.products?.name) matchedNamesByProduct.set(item.product_id, item.products.name);
        }
        if (item.products?.category_id) {
          categoryIds.add(item.products.category_id);
          if (item.products?.name) matchedNamesByCategory.set(item.products.category_id, item.products.name);
        }
      });
    }

    const directCategoryIds = [...categoryIds];
    if (directCategoryIds.length > 0) {
      const { data: allCategories } = await supabase
        .from("categories")
        .select("id, name, parent_id")
        .eq("tenant_id", order.tenant_id);

      const categoryById = new Map((allCategories || []).map((category: any) => [category.id, category]));

      directCategoryIds.forEach((categoryId) => {
        let current = categoryById.get(categoryId);
        const visited = new Set<string>();

        while (current?.parent_id && !visited.has(current.parent_id)) {
          visited.add(current.parent_id);
          categoryIds.add(current.parent_id);
          if (!matchedNamesByCategory.has(current.parent_id) && current.name) {
            matchedNamesByCategory.set(current.parent_id, current.name);
          }
          current = categoryById.get(current.parent_id);
        }
      });
    }

    const categoryAlertIds = alertRows
      .filter((alert: any) => alert.target_type === "category" && categoryIds.has(alert.target_id))
      .map((alert: any) => alert.target_id);

    const { data: categoryRows } = categoryAlertIds.length
      ? await supabase.from("categories").select("id, name").in("id", categoryAlertIds)
      : { data: [] };
    const categoryNameById = new Map((categoryRows || []).map((category: any) => [category.id, category.name]));

    return alertRows
      .filter((alert: any) =>
        alert.target_type === "product"
          ? productIds.has(alert.target_id)
          : categoryIds.has(alert.target_id),
      )
      .map((alert: any) => {
        const targetName =
          alert.target_type === "product"
            ? matchedNamesByProduct.get(alert.target_id)
            : categoryNameById.get(alert.target_id) || matchedNamesByCategory.get(alert.target_id);

        return {
          ...alert,
          targetName: targetName || (alert.target_type === "product" ? "producto configurado" : "categoria configurada"),
        };
      });
  };

  const shouldWarnOnStatusChange = (current: string, next: string) =>
    (current === "ready" && (next === "sent" || next === "delivered")) ||
    (current === "sent" && next === "delivered");
  const handleMarkAsPaid = async (order: any) => {
    console.log("Order ID:", order.id);

    if (loading) return;
    setLoading(true);

    // 1️⃣ Traer pagos de la orden
    const { data: payments, error } = await supabase
      .from("order_payments")
      .select("amount")
      .eq("order_id", order.id);

    if (error) {
      alert("Error verificando pagos");
      setLoading(false);
      return;
    }
    console.log("ORDER:", order);
    if (!payments || payments.length === 0) {
      alert("Esta orden no tiene métodos de pago definidos");
      setLoading(false);
      return;
    }

    // 2️⃣ Calcular total pagado
    const totalPaid = payments.reduce(
      (acc: number, p: any) => acc + Number(p.amount),
      0,
    );

    // 3️⃣ Validar que coincida con total
    if (totalPaid !== Number(order.total)) {
      alert("Los pagos no coinciden con el total de la orden");
      setLoading(false);
      return;
    }

    // 4️⃣ Marcar como pagado
    await supabase
      .from("orders")
      .update({
        paid_amount: totalPaid,
        is_paid: true,
      })
      .eq("id", order.id);

    setLoading(false);
    reloadOrders();
  };
  const handleNextStatus = async (order: any, options?: { skipDeliveryAlert?: boolean }) => {
    if (loading) return;
    setLoading(true);

    const nextStatus = getNextStatus(order.status, order.type);

    if (!options?.skipDeliveryAlert && shouldWarnOnStatusChange(order.status, nextStatus)) {
      const matches = await findDeliveryAlertsForOrder(order);
      if (matches.length > 0) {
        setPendingAlert({ order, nextStatus, matches });
        setLoading(false);
        return;
      }
    }

    // Validación: Delivery ready → sent requiere rider asignado
    if (order.status === "ready" && nextStatus === "sent" && order.type === "delivery") {
      if (!order.rider_id) {
        alert("Asigná un rider antes de enviar el pedido.");
        setLoading(false);
        return;
      }
    }

    // Validación: Delivery sent → delivered requiere pago completo si es efectivo
    if (order.status === "sent" && nextStatus === "delivered") {
      const { data: freshOrder } = await supabase
        .from("orders")
        .select("is_paid")
        .eq("id", order.id)
        .single();

      // Buscar si hay un pago en efectivo
      const { data: payments } = await supabase
        .from("order_payments")
        .select("payment_method_id")
        .eq("order_id", order.id);

      let isCash = false;
      if (payments?.length) {
        const { data: methods } = await supabase
          .from("payment_methods")
          .select("name")
          .in("id", payments.map((p: any) => p.payment_method_id));
        isCash = methods?.some((m: any) =>
          m.name?.toLowerCase().includes("efectivo") || m.name?.toLowerCase() === "cash"
        ) ?? false;
      }

      if (isCash && !freshOrder?.is_paid) {
        alert("El pedido tiene pago en efectivo y no está marcado como pagado.");
        setLoading(false);
        return;
      }
    }

    if (nextStatus === "delivered") {
      const { data: freshOrder } = await supabase
        .from("orders")
        .select("is_paid")
        .eq("id", order.id)
        .single();

      if (!freshOrder?.is_paid) {
        alert("No se puede entregar: pago incompleto");
        setLoading(false);
        return;
      }
    }

    const updates: Record<string, any> = { status: nextStatus };
    if (nextStatus === "confirmed") updates.confirmed_at = new Date().toISOString();
    if (nextStatus === "preparing") updates.preparing_at = new Date().toISOString();

    try {
      await updateOrderStatusViaApi(order.id, nextStatus, updates);
    } catch (error: any) {
      alert(error.message || "No se pudo actualizar el pedido.");
      setLoading(false);
      return;
    }

    if (nextStatus === "confirmed") {
      const { error: loyaltyError } = await supabase.rpc("process_loyalty_for_order", {
        p_order_id: order.id,
      });
      if (loyaltyError && loyaltyError.code !== "42883") {
        console.error("Loyalty processing error:", loyaltyError);
      }
    }

    await publishOrderRealtimeEvent({
      tenantId: order.tenant_id,
      branchId: order.branch_id,
      eventType: statusToRealtimeEvent(nextStatus),
      payload: {
        orderId: order.id,
        status: nextStatus,
        previousStatus: order.status,
        order: {
          id: order.id,
          status: nextStatus,
          type: order.type,
          customerName: order.customer_name,
          createdAt: order.created_at,
        },
      },
    });

    // Takeaway: preparing → ready → enviar aviso_ready_takeaway
    if (nextStatus === "ready" && order.type === "takeaway") {
      const { data: conversation } = await supabase
        .from("conversations")
        .select("*")
        .eq("customer_id", order.customer_id)
        .single();

      if (conversation) {
        await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversation.id,
            orderId: order.id,
            type: "template",
            templateName: "aviso_ready_takeaway",
          }),
        });
      }
    }

    // Delivery: ready → sent → enviar aviso_ready_delivery
    if (nextStatus === "sent" && order.type === "delivery") {
      const { data: conversation } = await supabase
        .from("conversations")
        .select("*")
        .eq("customer_id", order.customer_id)
        .single();

      if (conversation) {
        await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversation.id,
            orderId: order.id,
            type: "template",
            templateName: "aviso_ready_delivery",
          }),
        });
      }

      // Rider notification is handled manually through WhatsApp Web from the order card.
      if (false && order.rider_id) {
        const { data: rider } = await supabase
          .from("riders")
          .select("*")
          .eq("id", order.rider_id)
          .single();

        if (rider) {
          const mapUrl = order.address
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address)}`
            : "";
          const message = `📦 Pedido #${order.id.slice(0, 4)}\n\n👤 Cliente: ${order.customer_name || "Cliente"} (${order.customer_phone || "Sin teléfono"})\n📍 Dirección: ${order.address || "No especificada"}\n🗺️ Mapa: ${mapUrl}\n📲 Mensaje al cliente: https://wa.me/${order.customer_phone?.replace(/\D/g, "")}?text=Hola!%20soy%20el%20repartidor%20y%20estoy%20afuera\n💰 Total a cobrar: $${order.total?.toLocaleString("es-AR") || 0}\n\n🚚 ¡A entregarlo!`;

          await fetch("/api/whatsapp/send-direct", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              branchId: order.branch_id,
              tenantId: order.tenant_id,
              riderId: rider.id,
              phone: rider.phone,
              type: "template",
              templateName: "rider_nuevo_pedido",
              params: [
                order.id.slice(-6).toUpperCase(),
                order.address || "No especificada",
                order.notes || order.note || "Sin indicaciones",
                `$${Number(order.total || 0).toLocaleString("es-AR")}`,
                order.payment_method || "No especificado",
                order.customer_phone
                  ? `https://wa.me/${order.customer_phone.replace(/\D/g, "").startsWith("54") ? order.customer_phone.replace(/\D/g, "") : `549${order.customer_phone.replace(/\D/g, "")}`}`
                  : "Sin telefono",
              ],
            }),
          });
        }
      }
    }

    setLoading(false);
    reloadOrders();
  };

  const cashierName =
    userRecord?.full_name ||
    userRecord?.name ||
    userRecord?.email?.split("@")[0] ||
    "Equipo";

  return (
    <>
    <div className="h-full overflow-y-auto bg-gray-50 p-6 space-y-8">
      {STATUSES.map((status) => {
        const list = getOrdersByStatus(status);
        const meta = STATUS_META[status];

        return (
          <div key={status} className="space-y-4">
            {/* STATUS HEADER */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${meta.accent}`}
                >
                  {meta.label}
                </span>

                <span className="text-sm text-gray-500">
                  {list.length} pedidos
                </span>
              </div>

              <div className="h-px flex-1 bg-gray-200 ml-6" />
            </div>

            {/* ROW LIST */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {list.length === 0 ? (
                <div className="p-6 text-center text-md text-gray-400 italic">
                  No hay pedidos en este estado
                </div>
              ) : (
                list.map((order: any, index: number) => {
              

                  return (
                    <div
                      key={order.id}
                      className={`
                      ${index !== list.length - 1 ? "border-b border-gray-100" : ""}
                    `}
                    >
                      <OrderCard
                        order={order}
                        selected={order.id === selectedOrderId}
                        unread={unread[order.conversation_id] || 0}
                        onSelect={onSelect}
                        onNextStatus={() => handleNextStatus(order)}
                        onMarkAsPaid={handleMarkAsPaid}
                        onMessages={() => {
                          if (order.conversation_id) {
                            markWhatsAppConversationRead(order.conversation_id);
                          }
                          // limpiar contador de mensajes
                          setUnread((prev: any) => ({
                            ...prev,
                            [order.conversation_id]: 0,
                          }));

                          onMessages(order);
                        }}
                        onAssignRider={handleAssignRider}
                        canChangeRider={
                          order.status !== "sent" &&
                          order.status !== "delivered"
                        }
                        userRecord={userRecord}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
    {pendingAlert && (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-6">
        <div className="w-full max-w-4xl rounded-[2rem] border-4 border-red-500 bg-red-600 p-8 text-center text-white shadow-2xl">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-white/80">
            Atencion antes de entregar
          </p>
          <h2 className="mt-4 text-4xl font-black uppercase leading-none tracking-tight md:text-7xl">
            {cashierName}
          </h2>
          <p className="mt-5 text-2xl font-black uppercase md:text-5xl">
            RECORDA QUE EL PEDIDO TIENE
          </p>

          <div className="mt-6 space-y-3">
            {pendingAlert.matches.map((match: any) => (
              <div
                key={match.id}
                className="rounded-2xl border-2 border-white bg-black px-5 py-4 text-left"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase text-red-600">
                    {match.target_type === "product" ? "Producto" : "Categoria"}
                  </span>
                  <span className="text-2xl font-black uppercase md:text-4xl">
                    {match.targetName}
                  </span>
                </div>
                {match.message && (
                  <p className="mt-2 text-lg font-bold text-white/90 md:text-2xl">
                    {match.message}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              onClick={() => setPendingAlert(null)}
              className="rounded-2xl border-2 border-white px-8 py-4 text-lg font-black uppercase text-white hover:bg-white/10"
            >
              Revisar pedido
            </button>
            <button
              onClick={() => {
                const order = pendingAlert.order;
                setPendingAlert(null);
                void handleNextStatus(order, { skipDeliveryAlert: true });
              }}
              className="rounded-2xl bg-white px-8 py-4 text-lg font-black uppercase text-red-600 hover:bg-red-50"
            >
              Ya lo recorde, continuar
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
