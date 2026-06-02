"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Bike, X, Send, Paperclip, Reply, FileText } from "lucide-react";

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
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const readStorageKey = `rider_chat_read_${branchId}`;

  const getReadMap = () => {
    try {
      return JSON.parse(localStorage.getItem(readStorageKey) || "{}");
    } catch {
      return {};
    }
  };

  const saveReadMap = (readMap: Record<string, number>) => {
    try {
      localStorage.setItem(readStorageKey, JSON.stringify(readMap));
    } catch {}
  };

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
    const { data: convs } = await supabase
      .from("rider_conversations")
      .select("id, rider_id")
      .eq("branch_id", branchId);

    const conversationToRider: Record<string, string> = {};
    convs?.forEach((c) => {
      conversationToRider[c.id] = c.rider_id;
    });

    const { data } = await supabase
      .from("messages")
      .select("conversation_id, sender_type, created_at")
      .eq("branch_id", branchId)
      .eq("sender_type", "rider");

    const readMap = getReadMap();
    const riderCounts: Record<string, number> = {};

    data?.forEach((m) => {
      if (!m.conversation_id) return;

      const riderId = conversationToRider[m.conversation_id];
      if (!riderId) return;

      const lastRead = readMap[riderId] || 0;
      const createdAt = new Date(m.created_at).getTime();
      if (createdAt > lastRead) {
        riderCounts[riderId] = (riderCounts[riderId] || 0) + 1;
      }
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
            markAsRead(activeChat.riderId);
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
    setReplyTo(null);
  };

  const markAsRead = async (riderId: string) => {
    setUnread((prev) => ({ ...prev, [riderId]: 0 }));
    const readMap = getReadMap();
    readMap[riderId] = Date.now();
    saveReadMap(readMap);
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
      reply_to_message_id: replyTo?.id || null,
      reply_to_whatsapp_message_id: replyTo?.whatsapp_message_id || null,
    };

    setMessages((prev) => [...prev, tempMsg]);
    const outgoingText = text;
    const outgoingReply = replyTo;
    setText("");
    setReplyTo(null);

    // Enviar por WhatsApp al rider
    const rider = riders.find((r) => r.id === activeChat.riderId);
    if (rider) {
      const res = await fetch("/api/whatsapp/send-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          tenantId,
          riderId: activeChat.riderId,
          conversationId: conv.id,
          phone: rider.phone,
          message: outgoingText,
          contextMessageId: outgoingReply?.whatsapp_message_id || undefined,
        }),
      });
      const data = await res.json();
      if (data?.message) {
        setMessages((prev) => prev.map((m) => m.id === tempMsg.id ? data.message : m));
      }
    }

    // Actualizar last_message_at
    await supabase
      .from("rider_conversations")
      .update({ last_message_at: new Date() })
      .eq("id", conv.id);
  };

  const getMediaType = (file: File) => {
    const family = file.type.split("/")[0];
    if (file.type === "image/webp") return "sticker";
    if (family === "image") return "image";
    if (family === "video") return "video";
    if (family === "audio") return "audio";
    return "document";
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop() || "bin";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `riders/${tenantId}/${branchId}/${Date.now()}-${crypto.randomUUID()}-${safeName || `archivo.${ext}`}`;
    const buckets = ["whatsapp-media", "media", "uploads"];

    for (const bucket of buckets) {
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (!error) {
        return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl || null;
      }
    }

    return null;
  };

  const sendMedia = async (file: File) => {
    if (!activeChat) return;

    const conv = await getOrCreateConversation(activeChat.riderId);
    if (!conv) return;

    const rider = riders.find((r) => r.id === activeChat.riderId);
    if (!rider) return;

    const type = getMediaType(file);
    const previewUrl = URL.createObjectURL(file);
    const tempMsg = {
      id: crypto.randomUUID(),
      message: type === "document" ? file.name : null,
      media_type: type,
      media_url: previewUrl,
      sender_type: "cashier",
      created_at: new Date().toISOString(),
      status: "pending",
      reply_to_message_id: replyTo?.id || null,
      reply_to_whatsapp_message_id: replyTo?.whatsapp_message_id || null,
    };

    const outgoingReply = replyTo;
    setMessages((prev) => [...prev, tempMsg]);
    setReplyTo(null);

    const publicUrl = await uploadFile(file);
    if (!publicUrl) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempMsg.id
            ? { ...msg, status: "error", error: "No se pudo subir el archivo" }
            : msg,
        ),
      );
      return;
    }

    try {
      const res = await fetch("/api/whatsapp/send-direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          tenantId,
          riderId: activeChat.riderId,
          conversationId: conv.id,
          phone: rider.phone,
          type,
          mediaUrl: publicUrl,
          fileName: file.name,
          caption: type === "document" ? file.name : undefined,
          contextMessageId: outgoingReply?.whatsapp_message_id || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error || "No se pudo enviar");

      if (data?.message) {
        setMessages((prev) => [
          ...prev.filter((msg) => msg.id !== tempMsg.id && msg.id !== data.message.id),
          data.message,
        ]);
      } else {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempMsg.id
              ? { ...msg, status: "sent", media_url: publicUrl }
              : msg,
          ),
        );
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempMsg.id
            ? { ...msg, status: "error", error: "No se pudo enviar" }
            : msg,
        ),
      );
    }

    await supabase
      .from("rider_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conv.id);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void sendMedia(file);
    event.target.value = "";
  };

  const renderMedia = (msg: any) => {
    const type = msg.media_type || "text";

    if (type === "text" || !msg.media_url) return null;

    if (type === "image" || type === "sticker" || type.startsWith("image")) {
      return (
        <img
          src={msg.media_url}
          alt=""
          className="max-h-72 max-w-full cursor-pointer rounded-lg object-cover"
          onClick={() => setLightbox(msg.media_url)}
        />
      );
    }

    if (type === "video" || type.startsWith("video")) {
      return <video controls className="max-h-72 max-w-full rounded-lg" src={msg.media_url} />;
    }

    if (type === "audio" || type.startsWith("audio")) {
      return <audio controls className="h-10 max-w-full" src={msg.media_url} />;
    }

    return (
      <a
        href={msg.media_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex max-w-full items-center gap-2 rounded-lg bg-white/60 px-3 py-2 text-blue-700 hover:underline"
      >
        <FileText size={16} />
        <span className="truncate">{msg.message || "Documento"}</span>
      </a>
    );
  };

  const getReplyPreview = (msg: any) => {
    const target = messages.find((message) =>
      message.id === msg.reply_to_message_id ||
      (msg.reply_to_whatsapp_message_id && message.whatsapp_message_id === msg.reply_to_whatsapp_message_id),
    );

    if (!target) return null;

    return {
      author: target.sender_type === "cashier" ? "Vos" : activeChat?.riderName || "Rider",
      text: target.message || (target.media_type && target.media_type !== "text" ? "Archivo" : "Mensaje"),
    };
  };

  const handleSelectRider = (rider: Rider) => {
    setActiveChat({ riderId: rider.id, riderName: rider.name });
  };

  return (
    <div className="w-[420px] max-w-[42vw] h-full flex flex-col bg-white border-l border-gray-200">
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
      <div className={`${activeChat ? "max-h-56" : "flex-1"} overflow-y-auto`}>
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
        <div className="flex-1 min-h-0 flex flex-col border-t border-gray-200">
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
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
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
                  {getReplyPreview(msg) && (
                    <div
                      className={`mb-1 rounded border-l-2 px-2 py-1 text-[10px] ${
                        msg.sender_type === "cashier"
                          ? "border-white/60 bg-white/15 text-white/80"
                          : "border-blue-400 bg-white text-gray-500"
                      }`}
                    >
                      <div className="font-semibold">{getReplyPreview(msg)?.author}</div>
                      <div className="truncate">{getReplyPreview(msg)?.text}</div>
                    </div>
                  )}
                  {renderMedia(msg)}
                  {msg.message && <p className={msg.media_url ? "mt-1 break-words" : "break-words"}>{msg.message}</p>}
                  {msg.status === "pending" && (
                    <p className={`mt-1 text-[10px] ${msg.sender_type === "cashier" ? "text-white/70" : "text-gray-400"}`}>
                      Enviando...
                    </p>
                  )}
                  {msg.status === "error" && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-1 text-[10px] font-semibold text-red-500 hover:underline"
                    >
                      {msg.error || "No se pudo enviar"}
                    </button>
                  )}
                  {msg.whatsapp_message_id && (
                    <button
                      onClick={() => setReplyTo(msg)}
                      className={`mt-1 flex items-center gap-1 text-[10px] ${
                        msg.sender_type === "cashier" ? "text-white/70 hover:text-white" : "text-blue-600 hover:text-blue-700"
                      }`}
                    >
                      <Reply size={11} /> Responder
                    </button>
                  )}
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
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              onChange={handleFileSelect}
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
          {replyTo && (
            <div className="px-3 py-2 border-t bg-blue-50 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-blue-700">
                  Respondiendo a {replyTo.sender_type === "cashier" ? "vos" : activeChat.riderName}
                </p>
                <p className="text-xs text-blue-900 truncate">{replyTo.message || "Mensaje"}</p>
              </div>
              <button onClick={() => setReplyTo(null)} className="text-blue-700 hover:text-blue-900">
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      )}
      {lightbox && (
        <div
          className="fixed inset-0 z-[80] flex cursor-pointer items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="" className="max-h-full max-w-full object-contain" />
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/30"
          >
            <X size={24} />
          </button>
        </div>
      )}
    </div>
  );
}
