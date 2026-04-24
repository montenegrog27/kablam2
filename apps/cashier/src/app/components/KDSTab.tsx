"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Clock, Check } from "lucide-react";
import { useCurrentBranch } from "../(cashier)/context/BranchContext";

export default function KDSTab() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const { branchId } = useCurrentBranch();

  const loadOrders = async () => {
    if (!branchId) return;

    const { data } = await supabase
      .from("orders")
      .select("*, order_items(*, products(*))")
      .eq("branch_id", branchId)
      .in("status", ["confirmed", "preparing"])
      .order("created_at", { ascending: true });

    setOrders(data || []);
  };

  useEffect(() => {
    if (!branchId) return;
    loadOrders();

    const channel = supabase.channel(`kds-realtime-${branchId}`);
    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "orders",
          filter: `branch_id=eq.${branchId}`,
        },
        () => loadOrders(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `branch_id=eq.${branchId}`,
        },
        () => loadOrders(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [branchId]);

  const markAsReady = async (order: any) => {
    setLoading(true);
    await supabase
      .from("orders")
      .update({ status: "ready" })
      .eq("id", order.id);

    if (order.type === "takeaway") {
      const { data: conversation } = await supabase
        .from("conversations")
        .select("*")
        .eq("customer_id", order.customer_id)
        .single();

      if (conversation) {
        const message = `¡Hola ${order.customer_name}! Tu pedido está listo para retirar. 🎉`;
        await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversation.id,
            orderId: order.id,
            type: "text",
            text: message,
          }),
        });
      }
    }

    setLoading(false);
    loadOrders();
  };

  const getElapsedTime = (createdAt: string) => {
    const diff = Date.now() - new Date(createdAt).getTime();
    const minutes = Math.floor(diff / 60000);
    return minutes;
  };

  const getTimeColor = (minutes: number) => {
    if (minutes < 10) return "text-green-600";
    if (minutes < 20) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-900 p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {orders.map((order) => {
          const minutes = getElapsedTime(order.created_at);
          const timeColor = getTimeColor(minutes);

          return (
            <div
              key={order.id}
              className="bg-gray-800 rounded-xl p-4 space-y-3"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-lg text-white">
                    #{order.id.slice(-6).toUpperCase()}
                  </p>
                  <p className="text-sm text-gray-400">{order.customer_name}</p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      order.type === "takeaway"
                        ? "bg-blue-600 text-white"
                        : "bg-green-600 text-white"
                    }`}
                  >
                    {order.type === "takeaway" ? "Retiro" : "Delivery"}
                  </span>
                </div>
                <div className={`flex items-center gap-1 ${timeColor}`}>
                  <Clock size={16} />
                  <span className="font-bold">{minutes}m</span>
                </div>
              </div>

              <div className="border-t border-gray-700 pt-3 space-y-2">
                {order.order_items?.map((item: any) => (
                  <div key={item.id} className="text-sm text-gray-300">
                    <span className="font-semibold text-white">
                      {item.quantity}x
                    </span>{" "}
                    {item.products?.name}
                    {item.note && (
                      <p className="text-yellow-400 text-xs ml-4">
                        Nota: {item.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={() => markAsReady(order)}
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition"
              >
                <Check size={18} />
                Marcar Listo
              </button>
            </div>
          );
        })}
      </div>

      {orders.length === 0 && (
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500 text-lg">No hay pedidos en preparación</p>
        </div>
      )}
    </div>
  );
}
