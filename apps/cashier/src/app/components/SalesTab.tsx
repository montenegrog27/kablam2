"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";
import OrdersBoard from "./OrdersBoard";
import OrderSidePanel from "./OrderSidePanel";
import OrderChat from "./OrderChat";

export default function SalesTab({ session }: any) {
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [panelMode, setPanelMode] = useState<"order" | "chat">("order");

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
    const { data } = await supabase
      .from("orders")
      .select("*")
      .not("status", "in", "(delivered,cancelled)")
      .order("created_at", { ascending: false });

    setOrders(data || []);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* BOARD */}
      <div className="flex-1 overflow-y-auto">
        <OrdersBoard
          orders={orders}
          onSelect={(order: any) => {
            setPanelMode("order");
            setSelectedOrder(order);
          }}
          onMessages={(order: any) => {
            setPanelMode("chat");
            setSelectedOrder(order);
          }}
          reloadOrders={loadOrders}
        />
      </div>

      {/* PANEL DERECHO */}

      {panelMode === "order" && (
        <OrderSidePanel
          selectedOrder={selectedOrder}
          setSelectedOrder={setSelectedOrder}
          session={session}
          reloadOrders={loadOrders}
        />
      )}

      {panelMode === "chat" && (
        <OrderChat
          order={selectedOrder}
          onClose={() => setPanelMode("order")}
        />
      )}
    </div>
  );
}
