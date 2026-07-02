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

    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    const { data: ordersData } = await supabase
      .from("orders")
      .select("*, order_payments(amount, payment_methods(name))")
      .eq("branch_id", branchId)
      .gte("created_at", since)
      .neq("type", "dine-in")
      .not("status", "in", "(delivered,cancelled)")
      .order("created_at", { ascending: false });

    const { data: conversationsData } = await supabase
      .from("conversations")
      .select("id, customer_id");

    const orders = ordersData ?? [];
    const conversations = conversationsData ?? [];
    const customerIds = [...new Set(orders.map((order: any) => order.customer_id).filter(Boolean))];
    const { data: customersData } = customerIds.length
      ? await supabase
          .from("customers")
          .select("id, cashier_tag")
          .in("id", customerIds)
      : { data: [] };
    const customerTagMap: Record<string, string> = {};
    (customersData || []).forEach((customer: any) => {
      customerTagMap[customer.id] = customer.cashier_tag || "";
    });

    const conversationMap: Record<string, string> = {};

    conversations.forEach((c: any) => {
      if (c.customer_id) {
        conversationMap[c.customer_id] = c.id;
      }
    });

    const ordersWithConversation = orders.map((o: any) => ({
      ...o,
      customer_tag: o.customer_id ? customerTagMap[o.customer_id] || "" : "",
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
      (payload) => {
        const msg = payload.new;
        loadOrders();

        if (
          msg?.branch_id === branchId &&
          msg?.sender_type === "rider" &&
          !showRiderChat
        ) {
          setRiderUnread((prev) => prev + 1);
        }
      },
    );

    channel.subscribe((status) => {
      console.log("📡 Realtime channel status:", status);
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [branchId, showRiderChat]);

  return (
    <div className="flex h-full overflow-hidden relative">
      {/* BOARD */}
      <div className="flex-1 overflow-y-auto">
        <OrdersBoard
          orders={orders}
          activeConversationId={
            panelMode === "chat" ? selectedOrder?.conversation_id : null
          }
          selectedOrderId={selectedOrder?.id}
          userRecord={userRecord}
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
          onUnreadChange={(count: number) => {
            if (!showRiderChat) setRiderUnread(count);
          }}
        />
      )}

      {/* FLOATING RIDER BUTTON */}
      <button
        onClick={() => {
          const willOpen = !showRiderChat;
          setShowRiderChat(willOpen);
          if (willOpen) setRiderUnread(0);
        }}
        className={`
          absolute bottom-6 right-6
          w-14 h-14 rounded-full
          bg-blue-600 text-white
          shadow-lg hover:bg-blue-700
          transition-all z-50
          flex items-center justify-center
          ${showRiderChat ? "bg-gray-700" : ""}
          ${riderUnread > 0 && !showRiderChat ? "animate-pulse ring-4 ring-blue-300 ring-offset-2" : ""}
        `}
      >
        <Bike size={24} />
        {riderUnread > 0 && !showRiderChat && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
            {riderUnread > 9 ? "9+" : riderUnread}
          </span>
        )}
      </button>
    </div>
  );
}
