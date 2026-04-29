"use client";

import { useEffect, useState, useRef } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { MessageSquare, Image, Paperclip, Mic, Send, X } from "lucide-react";

type Conversation = {
  id: string;
  customer_id: string;
  last_message_at: string;
  last_message?: string;
  unread_count: number;
  customers: {
    id: string;
    name: string;
    phone: string;
    photo_url?: string;
  };
};

type Message = {
  id: string;
  sender_type: "customer" | "cashier";
  message?: string;
  media_type?: string;
  media_url?: string;
  created_at: string;
  status?: string;
};

type CustomerChatListProps = {
  branchId: string;
  tenantId?: string;
  onClose: () => void;
  onUnreadChange: (count: number) => void;
};

export default function CustomerChatList({
  branchId,
  tenantId,
  onClose,
  onUnreadChange,
}: CustomerChatListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversations();
    loadUnreadCounts();
  }, [branchId]);

  useEffect(() => {
    if (activeConv) {
      loadMessages(activeConv.id);
      markAsRead(activeConv.id);
    }
  }, [activeConv]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const total = Object.values(unreadMap).reduce((a, b) => a + b, 0);
    onUnreadChange(total);
  }, [unreadMap]);

  useEffect(() => {
    if (!branchId) return;

    const channel = supabase
      .channel(`branch-messages-${branchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `branch_id=eq.${branchId}`,
        },
        (payload) => {
          const msg = payload.new as Message & { conversation_id: string };
          console.log("📱 New message:", msg);

          if (activeConv && msg.conversation_id === activeConv.id) {
            setMessages((prev) => {
              const exists = prev.find((m) => m.id === msg.id);
              if (exists) return prev;
              return [...prev, msg];
            });
          } else {
            setUnreadMap((prev) => ({
              ...prev,
              [msg.conversation_id]: (prev[msg.conversation_id] || 0) + 1,
            }));

            // Actualizar last_message y last_message_at
            setConversations((prev) =>
              prev
                .map((c) => {
                  if (c.id === msg.conversation_id) {
                    return {
                      ...c,
                      last_message:
                        msg.message || getMediaLabel(msg.media_type),
                      last_message_at: msg.created_at,
                    };
                  }
                  return c;
                })
                .sort(
                  (a, b) =>
                    new Date(b.last_message_at).getTime() -
                    new Date(a.last_message_at).getTime(),
                ),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [branchId, activeConv]);

const loadConversations = async () => {
    if (!branchId) return;

    const { data, error } = await supabase
      .from("conversations")
      .select(`
        id,
        customer_id,
        last_message_at,
        customers!inner(id, name, phone)
      `)
      .eq("branch_id", branchId)
      .order("last_message_at", { ascending: false, nullsFirst: true });

    if (error || !data) {
      console.error("Error loading conversations:", error);
      return;
    }

    // Obtener last_message de cada conversación
    const withLastMsg = await Promise.all(
      data.map(async (conv: any) => {
        const { data: msgData } = await supabase
          .from("messages")
          .select("message, media_type")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        return {
          ...conv,
          customers: Array.isArray(conv.customers)
            ? conv.customers[0]
            : conv.customers,
          last_message: msgData?.message || getMediaLabel(msgData?.media_type) || "Sin mensajes",
        };
      }),
    );

    setConversations(withLastMsg as Conversation[]);
  };

  const loadUnreadCounts = async () => {
    const { data } = await supabase
      .from("messages")
      .select("conversation_id")
      .eq("branch_id", branchId)
      .eq("sender_type", "customer");

    const counts: Record<string, number> = {};
    data?.forEach((m: any) => {
      if (m.conversation_id) {
        counts[m.conversation_id] = (counts[m.conversation_id] || 0) + 1;
      }
    });

    setUnreadMap(counts);
  };

  const loadMessages = async (conversationId: string) => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(100);

    setMessages(data || []);
  };

  const markAsRead = async (conversationId: string) => {
    setUnreadMap((prev) => ({ ...prev, [conversationId]: 0 }));
  };

  const sendMessage = async () => {
    if (!text.trim() || !activeConv) return;

    const tempMsg = {
      id: crypto.randomUUID(),
      sender_type: "cashier" as const,
      message: text,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMsg as any]);
    setText("");

    // Enviar por WhatsApp
    try {
      const { data: whatsappData } = await supabase
        .from("whatsapp_numbers")
        .select("phone_number_id, access_token")
        .eq("branch_id", branchId)
        .single();

      if (whatsappData) {
        await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phoneNumberId: whatsappData.phone_number_id,
            accessToken: whatsappData.access_token,
            to: activeConv.customers.phone,
            message: text,
          }),
        });
      }
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const getMediaLabel = (mediaType?: string) => {
    if (!mediaType) return "";
    if (mediaType.startsWith("image")) return "📷 Imagen";
    if (mediaType.startsWith("video")) return "🎥 Video";
    if (mediaType.startsWith("audio")) return "🎤 Audio";
    if (mediaType === "sticker") return "🏷 Sticker";
    if (mediaType === "document") return "📄 Documento";
    return "📎 Archivo";
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    return date.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-black/40">
      <div className="flex-1" onClick={onClose} />

      <div className="w-full sm:w-[800px] h-full bg-white flex">
        {/* Lista de conversaciones */}
        <div
          className={`w-full sm:w-80 border-r flex flex-col ${activeConv ? "hidden sm:flex" : "flex"}`}
        >
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-bold text-lg">WhatsApp</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <MessageSquare size={40} className="mx-auto mb-2 opacity-50" />
                <p>No hay conversaciones</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setActiveConv(conv)}
                  className={`w-full p-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                    activeConv?.id === conv.id ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    {conv.customers.photo_url ? (
                      <img
                        src={conv.customers.photo_url}
                        alt={conv.customers.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                        <span className="text-gray-500 font-medium">
                          {conv.customers.name?.[0] || "?"}
                        </span>
                      </div>
                    )}
                    {unreadMap[conv.id] > 0 && (
                      <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                        {unreadMap[conv.id]}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 text-left min-w-0">
                    <div className="flex justify-between items-start">
                      <span className="font-medium text-sm truncate">
                        {conv.customers.name || conv.customers.phone}
                      </span>
                      <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                        {formatTime(conv.last_message_at)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      {conv.last_message || "Sin mensajes"}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat window */}
        {activeConv ? (
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="p-3 border-b flex items-center gap-3">
              <button
                onClick={() => setActiveConv(null)}
                className="sm:hidden p-1 rounded-lg hover:bg-gray-100"
              >
                ←
              </button>
              {activeConv.customers.photo_url ? (
                <img
                  src={activeConv.customers.photo_url}
                  alt={activeConv.customers.name}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                  <span className="text-gray-500 font-medium">
                    {activeConv.customers.name?.[0] || "?"}
                  </span>
                </div>
              )}
              <div className="flex-1">
                <p className="font-medium text-sm">
                  {activeConv.customers.name || "Sin nombre"}
                </p>
                <p className="text-xs text-gray-500">
                  {activeConv.customers.phone}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender_type === "cashier" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                      msg.sender_type === "cashier"
                        ? "bg-green-500 text-white"
                        : "bg-white border border-gray-200"
                    }`}
                  >
                    {msg.media_url && (
                      <div className="mb-2">
                        {msg.media_type?.startsWith("image") ? (
                          <img
                            src={msg.media_url}
                            alt="Imagen"
                            className="rounded-lg max-w-full max-h-48 object-cover"
                          />
                        ) : msg.media_type?.startsWith("audio") ? (
                          <audio
                            controls
                            src={msg.media_url}
                            className="max-w-full"
                          />
                        ) : (
                          <a
                            href={msg.media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 underline flex items-center gap-1"
                          >
                            <Paperclip size={14} />
                            {getMediaLabel(msg.media_type)}
                          </a>
                        )}
                      </div>
                    )}
                    {msg.message && (
                      <p className="text-sm whitespace-pre-wrap">
                        {msg.message}
                      </p>
                    )}
                    <p
                      className={`text-[10px] mt-1 ${
                        msg.sender_type === "cashier"
                          ? "text-green-100"
                          : "text-gray-400"
                      }`}
                    >
                      {formatTime(msg.created_at)}
                      {msg.status && msg.sender_type === "cashier" && (
                        <span className="ml-1">
                          {msg.status === "sent" ? "✓" : "✓✓"}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t flex items-center gap-2">
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Escribe un mensaje..."
                className="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={sendMessage}
                disabled={!text.trim()}
                className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        ) : (
          <div className="hidden sm:flex flex-1 items-center justify-center bg-gray-50">
            <div className="text-center text-gray-400">
              <MessageSquare size={48} className="mx-auto mb-2 opacity-50" />
              <p>Selecciona un chat para ver los mensajes</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getMediaLabel(mediaType?: string): string {
  if (!mediaType) return "";
  if (mediaType.startsWith("image")) return "📷 Imagen";
  if (mediaType.startsWith("video")) return "🎥 Video";
  if (mediaType.startsWith("audio")) return "🎤 Audio";
  if (mediaType === "sticker") return "🏷 Sticker";
  if (mediaType === "document") return "📄 Documento";
  return "📎 Archivo";
}
