"use client";

import { supabase } from "@kablam/supabase";
import OrderCard from "./OrderCard";
import { useState, useEffect } from "react";

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

export default function OrdersBoard({
  orders,
  onSelect,
  onMessages,
  reloadOrders,
}: any) {
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState<any>({});

  useEffect(() => {
    const channel = supabase
      .channel("messages-board")

      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const msg = payload.new;
    console.log("NEW MESSAGE REALTIME:", payload);
          // solo mensajes del cliente
          if (msg.sender_type !== "customer") return;

          setUnread((prev: any) => ({
            ...prev,
            [msg.conversation_id]: (prev[msg.conversation_id] || 0) + 1,
          }));
        },
      )

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
          console.log("ORDER UPDATED REALTIME:", payload);

          reloadOrders();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
  const getOrdersByStatus = (status: string) =>
    orders.filter((o: any) => o.status === status);

  const getNextStatus = (current: string) => {
    if (current === "sent") return "delivered";

    const index = STATUSES.indexOf(current);
    return STATUSES[index + 1] || current;
  };
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
  const handleNextStatus = async (order: any) => {
    if (loading) return;
    setLoading(true);

    const nextStatus = getNextStatus(order.status);

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

    await supabase
      .from("orders")
      .update({ status: nextStatus })
      .eq("id", order.id);

    setLoading(false);
    reloadOrders();
  };

  return (
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
                list.map((order: any, index: number) => (
                  <div
                    key={order.id}
                    className={`
                      ${index !== list.length - 1 ? "border-b border-gray-100" : ""}
                    `}
                  >
                    <OrderCard
                      order={order}
                      unread={unread[order.conversation_id] || 0}
                      onSelect={onSelect}
                      onNextStatus={() => handleNextStatus(order)}
                      onMarkAsPaid={handleMarkAsPaid}
                      onMessages={() => {
                        // limpiar contador de mensajes
                        setUnread((prev: any) => ({
                          ...prev,
                          [order.conversation_id]: 0,
                        }));

                        onMessages(order);
                      }}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
