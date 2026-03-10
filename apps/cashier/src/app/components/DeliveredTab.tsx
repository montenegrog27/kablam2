  "use client";

  import { useEffect, useState } from "react";
  import { supabase } from "@kablam/supabase";
  import OrdersBoardDelivered from "./OrdersBoardDelivered";
  import OrderSidePanel from "./OrderSidePanel";

  export default function DeliveredTab({ session }: any) {
    const [orders, setOrders] = useState<any[]>([]);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);

    useEffect(() => {
      loadOrders();

      const channel = supabase
        .channel("orders-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders" },
          () => loadOrders(),
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }, []);
const loadOrders = async () => {

  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, customer_id");

  const ordersList = orders ?? [];
  const conversationsList = conversations ?? [];

  const conversationMap = Object.fromEntries(
    conversationsList.map((c:any) => [c.customer_id, c.id])
  );

  const ordersWithConversation = ordersList.map((o:any) => ({
    ...o,
    conversation_id: conversationMap[o.customer_id] || null
  }));

  setOrders(ordersWithConversation);
};

  return (
    <div className="flex h-full overflow-hidden">
      {/* BOARD — ÚNICO QUE SCROLLEA */}
      <div className="flex-1 overflow-y-auto">
        <OrdersBoardDelivered
          orders={orders}
          onSelect={setSelectedOrder}
          reloadOrders={loadOrders}
        />
      </div>

      {/* PANEL — SIN SCROLL GLOBAL */}
      <OrderSidePanel
        selectedOrder={selectedOrder}
        setSelectedOrder={setSelectedOrder}
        session={session}
        reloadOrders={loadOrders}
      />
    </div>
  );
  }
