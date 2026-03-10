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

  const { data: ordersData } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: conversationsData } = await supabase
    .from("conversations")
    .select("id, customer_id");

  const orders = ordersData ?? [];
  const conversations = conversationsData ?? [];

  // mapa customer_id -> conversation_id
  const conversationMap = Object.fromEntries(
    conversations.map((c:any) => [String(c.customer_id), c.id])
  );
  console.log("CONVERSATION MAP", conversationMap);

  const ordersWithConversation = orders.map((o:any) => {

    const convId = conversationMap[String(o.customer_id)] || null;
console.log("ORDER ->", o.customer_id, convId);
    return {
      ...o,
      conversation_id: convId
    };

  });

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
