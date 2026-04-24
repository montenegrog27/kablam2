"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import OrdersBoardDelivered from "./OrdersBoardDelivered";
import OrderSidePanel from "./OrderSidePanel";

export default function DeliveredTab({ session }: any) {
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

 useEffect(() => {
  loadOrders();

  const channel = supabase.channel("orders-realtime-delivered");

  channel.on(
    "postgres_changes",
    { event: "UPDATE", schema: "public", table: "orders" },
    () => loadOrders()
  );

  channel.subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);

  const loadOrders = async () => {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    setOrders(data || []);
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
