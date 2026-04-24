"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Bike, X, Send, Paperclip } from "lucide-react";

type Rider = {
  id: string;
  name: string;
  phone: string;
};

type RiderChatProps = {
  branchId: string;
  tenantId: string;
  onClose: () => void;
  onRiderSelect: (riderId: string, riderName: string) => void;
  selectedRiderId: string | null;
  onUnreadChange: (count: number) => void;
};

export default function RiderChat({
  branchId,
  tenantId,
  onClose,
  onRiderSelect,
  selectedRiderId,
  onUnreadChange,
}: RiderChatProps) {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [activeChat, setActiveChat] = useState<{
    riderId: string;
    riderName: string;
  } | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [unread, setUnread] = useState<Record<string, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadRiders();
    loadUnreadCounts();
  }, [branchId]);

  useEffect(() => {
    if (activeChat) {
      onRiderSelect(activeChat.riderId, activeChat.riderName);
      loadMessages(activeChat.riderId);
      markAsRead(activeChat.riderId);
    }
  }, [activeChat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const total = Object.values(unread).reduce((a, b) => a + b, 0);
    onUnreadChange(total);
  }, [unread]);

  const loadRiders = async () => {
    const { data } = await supabase
      .from("riders")
      .select("id, name, phone")
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .order("name");

    setRiders(data || []);
  };

  const loadUnreadCounts = async () => {
    const { data } = await supabase
      .from("messages")
      .select("conversation_id, sender_type")
      .eq("branch_id", branchId)
      .eq("sender_type", "rider");

    const counts: Record<string, number> = {};
    data?.forEach((m) => {
      if (m.conversation_id) {
        counts[m.conversation_id] = (counts[m.conversation_id] || 0) + 1;
      }
    });

    // Mapear por rider_id
    const riderCounts: Record<string, number> = {};
    const { data: convs } = await supabase
      .from("rider_conversations")
      .select("id, rider_id")
      .eq("branch_id", branchId);

    convs?.forEach((c) => {
      riderCounts[c.rider_id] = counts[c.id] || 0;
    });

    setUnread(riderCounts);
  };

  useEffect(() => {
    if (!branchId) return;

    const channel = supabase
      .channel(`rider-messages-${branchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `sender_type=eq.rider`,
        },
        (payload) => {
          const msg = payload.new;
          console.log("📱 Rider message received:", msg);

          // Si el mensaje es para el rider activo, agregarlo al chat
          if (activeChat && msg.rider_id === activeChat.riderId) {
            setMessages((prev) => {
              const exists = prev.find((m) => m.id === msg.id);
              if (exists) return prev;
              return [...prev, msg];
            });
          } else {
            // Incrementar unread
            setUnread((prev) => ({
              ...prev,
              [msg.rider_id || ""]: (prev[msg.rider_id || ""] || 0) + 1,
            }));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [branchId, activeChat]);

  const getOrCreateConversation = async (riderId: string) => {
    const { data: existing } = await supabase
      .from("rider_conversations")
      .select("*")
      .eq("branch_id", branchId)
      .eq("rider_id", riderId)
      .single();

    if (existing) return existing;

    const { data: newConv } = await supabase
      .from("rider_conversations")
      .insert({
        tenant_id: tenantId,
        branch_id: branchId,
        rider_id: riderId,
      })
      .select()
      .single();

    return newConv;
  };

  const loadMessages = async (riderId: string) => {
    const conv = await getOrCreateConversation(riderId);
    if (!conv) return;

    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true })
      .limit(50);

    setMessages(data || []);
  };

  const markAsRead = async (riderId: string) => {
    setUnread((prev) => ({ ...prev, [riderId]: 0 }));
  };

  const sendMessage = async () => {
    if (!text.trim() || !activeChat) return;

    const conv = await getOrCreateConversation(activeChat.riderId);
    if (!conv) return;

    const tempMsg = {
      id: crypto.randomUUID(),
      message: text,
      sender_type: "cashier",
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMsg]);
    setText("");

    // Enviar por WhatsApp al rider
    const rider = riders.find((r) => r.id === activeChat.riderId);
    if (rider) {
      await fetch("/api/whatsapp/send-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: rider.phone,
          message: text,
        }),
      });
    }

    // Guardar mensaje
    await supabase.from("messages").insert({
      tenant_id: tenantId,
      branch_id: branchId,
      conversation_id: conv.id,
      sender_type: "cashier",
      rider_id: activeChat.riderId,
      message: text,
      media_type: "text",
    });

    // Actualizar last_message_at
    await supabase
      .from("rider_conversations")
      .update({ last_message_at: new Date() })
      .eq("id", conv.id);
  };

  const handleSelectRider = (rider: Rider) => {
    setActiveChat({ riderId: rider.id, riderName: rider.name });
  };

  return (
    <div className="w-[320px] h-full flex flex-col bg-white border-l border-gray-200">
      {/* HEADER */}
      <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Bike size={18} className="text-gray-600" />
          <h2 className="font-semibold text-sm">Repartidores</h2>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
      </div>

      {/* RIDER LIST */}
      <div className="flex-1 overflow-y-auto">
        {riders.map((rider) => (
          <button
            key={rider.id}
            onClick={() => handleSelectRider(rider)}
            className={`w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 border-b border-gray-100 ${
              activeChat?.riderId === rider.id ? "bg-blue-50" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium">
                  {rider.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="text-left">
                <div className="font-medium text-sm">{rider.name}</div>
                <div className="text-xs text-gray-500">{rider.phone}</div>
              </div>
            </div>

            {(unread[rider.id] || 0) > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                {unread[rider.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ACTIVE CHAT */}
      {activeChat && (
        <div className="h-[300px] flex flex-col border-t border-gray-200">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
            <span className="text-sm font-medium">{activeChat.riderName}</span>
            <button
              onClick={() => setActiveChat(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          </div>

          {/* MESSAGES */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender_type === "cashier" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-2 text-xs ${
                    msg.sender_type === "cashier"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100"
                  }`}
                >
                  {msg.message}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* INPUT */}
          <div className="p-2 border-t border-gray-200 flex gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded"
            >
              <Paperclip size={16} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={() => {}}
            />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Escribir..."
              className="flex-1 border rounded px-2 py-1 text-sm"
            />
            <button
              onClick={sendMessage}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
