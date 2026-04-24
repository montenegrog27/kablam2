"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import OrdersBoard from "./OrdersBoard";
import OrderSidePanel from "./OrderSidePanel";
import OrderChat from "./OrderChat";
import RiderChat from "./RiderChat";
import { useCurrentBranch } from "../(cashier)/context/BranchContext";
import { Bike } from "lucide-react";

export default function SalesTab({ session }: any) {
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [panelMode, setPanelMode] = useState<"order" | "chat">("order");
  const [showRiderChat, setShowRiderChat] = useState(false);
  const [riderUnread, setRiderUnread] = useState(0);
  const { branchId, userRecord, tenantId } = useCurrentBranch();

  const loadOrders = async () => {
    if (!branchId) return;

    const { data: ordersData } = await supabase
      .from("orders")
      .select("*")
      .eq("branch_id", branchId)
      .not("status", "in", "(delivered,cancelled)")
      .order("created_at", { ascending: false });

    const { data: conversationsData } = await supabase
      .from("conversations")
      .select("id, customer_id");

    const orders = ordersData ?? [];
    const conversations = conversationsData ?? [];

    const conversationMap: Record<string, string> = {};

    conversations.forEach((c: any) => {
      if (c.customer_id) {
        conversationMap[c.customer_id] = c.id;
      }
    });

    const ordersWithConversation = orders.map((o: any) => ({
      ...o,
      conversation_id: o.customer_id
        ? conversationMap[o.customer_id] || null
        : null,
    }));

    console.log("ORDERS WITH CONVERSATION:", ordersWithConversation);

    setOrders(ordersWithConversation);
  };

  useEffect(() => {
    if (!branchId) return;
    loadOrders();

    const channel = supabase.channel(`orders-realtime-${branchId}`);

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "orders",
      },
      (payload) => {
        console.log("📦 NEW ORDER DETECTED:", payload.new);
        console.log(
          "📦 Order branch_id:",
          payload.new?.branch_id,
          "Current branchId:",
          branchId,
        );
        // Solo reload si es de la branch actual
        if (payload.new?.branch_id === branchId) {
          loadOrders();
        }
      },
    );

    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "orders",
      },
      (payload) => {
        console.log("📦 ORDER UPDATED:", payload.new);
        if (payload.new?.branch_id === branchId) {
          loadOrders();
        }
      },
    );

    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      () => loadOrders(),
    );

    channel.subscribe((status) => {
      console.log("📡 Realtime channel status:", status);
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [branchId]);

  return (
    <div className="flex h-full overflow-hidden relative">
      {/* BOARD */}
      <div className="flex-1 overflow-y-auto">
        <OrdersBoard
          orders={orders}
          activeConversationId={
            panelMode === "chat" ? selectedOrder?.conversation_id : null
          }
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

      {/* RIDER CHAT PANEL */}
      {showRiderChat && (
        <RiderChat
          branchId={branchId}
          tenantId={tenantId}
          onClose={() => setShowRiderChat(false)}
          onRiderSelect={() => {}}
          selectedRiderId={null}
          onUnreadChange={setRiderUnread}
        />
      )}

      {/* FLOATING RIDER BUTTON */}
      <button
        onClick={() => setShowRiderChat(!showRiderChat)}
        className={`
          absolute bottom-6 right-6
          w-14 h-14 rounded-full
          bg-blue-600 text-white
          shadow-lg hover:bg-blue-700
          transition-all z-50
          flex items-center justify-center
          ${showRiderChat ? "bg-gray-700" : ""}
        `}
      >
        <Bike size={24} />
        {riderUnread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
            {riderUnread > 9 ? "9+" : riderUnread}
          </span>
        )}
      </button>
    </div>
  );
}
