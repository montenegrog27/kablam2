"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Paperclip, Send, Image, FileText, Camera, MapPin, User, X } from "lucide-react";

export default function OrderChat({ order, session, onClose }: any) {
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [showUploadMenu, setShowUploadMenu] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // -----------------------------
  // INIT CONVERSATION
  // -----------------------------

  useEffect(() => {
    if (!messages.length) return;

    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!order) return;
    initConversation();
  }, [order]);

  const initConversation = async () => {
    if (!order.customer_phone) {
      console.log("No customer phone available");
      return;
    }

    // 1️⃣ buscar o crear customer
    let { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("tenant_id", order.tenant_id)
      .eq("phone", order.customer_phone)
      .maybeSingle();

    if (!customer) {
      const { data } = await supabase
        .from("customers")
        .insert({
          tenant_id: order.tenant_id,
          branch_id: order.branch_id,
          phone: order.customer_phone,
          name: order.customer_name,
        })
        .select()
        .single();

      customer = data;
    }

    if (!customer) {
      console.log("Could not find or create customer");
      return;
    }

    // 2️⃣ buscar conversación

    let { data: conv } = await supabase
      .from("conversations")
      .select("*")
      .eq("customer_id", customer.id)
      .eq("branch_id", order.branch_id)
      .maybeSingle();

    if (!conv) {
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({
          tenant_id: order.tenant_id,
          branch_id: order.branch_id,
          customer_id: customer.id,
        })
        .select()
        .single();

      conv = newConv;
    }

    if (!conv) {
      console.log("Could not find or create conversation");
      return;
    }

    setConversationId(conv.id);

    // link order
    await supabase.from("conversation_orders").upsert({
      conversation_id: conv.id,
      order_id: order.id,
    });

    loadMessages(conv.id);
  };

  // -----------------------------
  // LOAD MESSAGES
  // -----------------------------

  const loadMessages = async (convId: string) => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .limit(10);

    setMessages((data || []).reverse());

    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  // -----------------------------
  // REALTIME
  // -----------------------------

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`chat-${conversationId}`)

      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMessage = payload.new;

          setMessages((prev: any) => {
            const exists = prev.find((m: any) => m.id === newMessage.id);
            if (exists) return prev;
            return [...prev, newMessage];
          });
        },
      )

      .on("broadcast", { event: "new_message" }, (payload) => {
        const newMessage = payload.payload;

        setMessages((prev: any) => {
          const exists = prev.find((m: any) => m.id === newMessage.id);
          if (exists) return prev;
          return [...prev, newMessage];
        });
      })

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // -----------------------------
  // SEND TEXT
  // -----------------------------

  const sendMessage = async () => {
    if (!text.trim()) return;
    if (!conversationId) return;

    const tempMessage = {
      id: crypto.randomUUID(),
      message: text,
      media_type: "text",
      sender_type: "cashier",
      created_at: new Date().toISOString(),
    };

    // ⚡ mostrar instantáneamente
    setMessages((prev) => [...prev, tempMessage]);

    const messageText = text;
    setText("");

    const res = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversationId,
        text: messageText,
      }),
    });

    const data = await res.json();

    if (data.error) {
      console.error(data.error);
    }
  };

  // -----------------------------
  // FILE UPLOAD
  // -----------------------------

  const uploadFile = async (file: File) => {
    if (!conversationId) return;
    setShowUploadMenu(false);

    const fileType = file.type.split("/")[0];
    const mediaType = fileType === "video" ? "video" : fileType === "audio" ? "audio" : file.type === "image/webp" ? "sticker" : file.type.startsWith("image") ? "image" : "document";

    const path = `${order.tenant_id}/${conversationId}/${Date.now()}-${file.name}`;
    const buckets = ["chat-media", "whatsapp-media", "media", "images", "files", "uploads"];
    let publicUrl: string | null = null;

    for (const bucket of buckets) {
      const { error } = await supabase.storage.from(bucket).upload(path, file);
      if (!error) {
        publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data?.publicUrl || null;
        break;
      }
    }

    await supabase.from("messages").insert({
      tenant_id: order.tenant_id,
      branch_id: order.branch_id,
      conversation_id: conversationId,
      sender_type: "cashier",
      sender_id: session.opened_by,
      media_type: mediaType,
      media_url: publicUrl,
      message: null,
    });
  };

  // -----------------------------
  // SCREENSHOT PASTE
  // -----------------------------

  const handlePaste = async (e: any) => {
    const items = e.clipboardData.items;

    for (let item of items) {
      if (item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();

        if (file) {
          await uploadFile(file);
        }
      }
    }
  };

  // -----------------------------
  // RENDER
  // -----------------------------

  return (
    <div
      onPaste={handlePaste}
      className="w-[520px] h-full flex flex-col bg-white border-l border-gray-200"
    >
      {/* HEADER */}

      <div className="px-6 py-5 border-b border-gray-200 flex justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            Chat pedido #{order?.id?.slice(0, 4)}
          </h2>

          <p className="text-xs text-gray-500">{order.customer_name}</p>
        </div>

        <button onClick={onClose} className="text-red-500 text-sm">
          Cerrar
        </button>
      </div>

      {/* MESSAGES */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ backgroundColor: "#e5ddd5", backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5 L35 15 L30 25 L25 15 Z' fill='%23ffffff' opacity='0.4'/%3E%3C/svg%3E\")" }}>
        {messages.map((msg) => {
          const isMe = msg.sender_type === "cashier";
          const t = msg.media_type || "text";

          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm ${isMe ? "bg-[#dcf8c6] rounded-br-sm" : "bg-white rounded-bl-sm"}`}
                style={t === "sticker" ? { background: "transparent", boxShadow: "none", padding: 0 } : {}}
              >
                {t === "sticker" && (msg.media_url ? <img src={msg.media_url} alt="" className="max-w-[200px] max-h-[200px]" /> : <span className="text-4xl">🏷️</span>)}
                {t.startsWith("image") && (msg.media_url ? <img src={msg.media_url} alt="" className="rounded-lg max-w-full max-h-64 object-cover cursor-pointer" onClick={() => setLightbox(msg.media_url)} /> : <span className="text-gray-500 text-sm">📷 Imagen</span>)}
                {t.startsWith("video") && (msg.media_url ? <video controls className="rounded-lg max-w-full max-h-64" src={msg.media_url} /> : <span className="text-gray-500 text-sm">🎥 Video</span>)}
                {t.startsWith("audio") && (msg.media_url ? <audio controls className="max-w-[220px] h-10" src={msg.media_url} /> : <span className="text-gray-500 text-sm">🎤 Audio</span>)}
                {t === "document" && (msg.media_url ? <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline"><FileText size={18} /><span>Documento</span></a> : <span className="text-gray-500 text-sm">📄 Documento</span>)}
                {t === "location" && <a href={msg.message?.match(/https?:\/\/[^\s]+/)?.[0] || "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline"><MapPin size={18} />Ver ubicación</a>}
                {t === "contacts" && <div className="flex items-center gap-2 text-blue-600"><User size={18} /><span>{msg.message?.replace(/👤 /, "").split("\n")[0]}</span></div>}
                {t === "text" && msg.message && <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>}
                <div className={`flex justify-end mt-0.5 ${t === "sticker" ? "hidden" : ""}`}>
                  <span className="text-[10px] text-gray-500">{new Date(msg.created_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* INPUT */}
      <div className="p-3 bg-white border-t flex items-center gap-2">
        <div className="relative">
          <button onClick={() => setShowUploadMenu(!showUploadMenu)} className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center">
            <Paperclip size={20} className="text-gray-600" />
          </button>
          {showUploadMenu && (
            <div className="absolute bottom-12 left-0 bg-white rounded-xl shadow-xl border p-2 space-y-1 min-w-[160px] z-10">
              <button onClick={() => { fileInputRef.current!.accept = "image/*"; fileInputRef.current!.click(); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-sm">
                <Image size={18} /> Imagen
              </button>
              <button onClick={() => { fileInputRef.current!.accept = "image/*,video/*"; fileInputRef.current!.click(); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-sm">
                <Camera size={18} /> Cámara/Galería
              </button>
              <button onClick={() => { fileInputRef.current!.accept = "*/*"; fileInputRef.current!.click(); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-sm">
                <FileText size={18} /> Documento
              </button>
            </div>
          )}
        </div>

        <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} />

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Escribir mensaje..."
          className="flex-1 border-0 bg-gray-100 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500"
        />

        <button onClick={sendMessage} disabled={!text.trim()} className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition flex-shrink-0">
          <Send size={18} />
        </button>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center cursor-pointer" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain p-4" />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30"><X size={24} className="text-white" /></button>
        </div>
      )}
    </div>
  );
}
