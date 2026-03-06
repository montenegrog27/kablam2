"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@kablam/supabase";

export default function OrderChat({
  order,
  session,
  onClose,
}: any) {

  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // -----------------------------
  // INIT CONVERSATION
  // -----------------------------

  useEffect(() => {
    if (!order) return;
    initConversation();
  }, [order]);

  const initConversation = async () => {

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
      name: order.customer_name
    })
    .select()
    .single();

  customer = data;

}

    // 2️⃣ buscar conversación

    let { data: conv } = await supabase
      .from("conversations")
      .select("*")
      .eq("customer_id", customer.id)
      .single();

    if (!conv) {

      const { data: newConv } = await supabase
        .from("conversations")
        .insert({
          tenant_id: order.tenant_id,
          customer_id: customer.id,
        })
        .select()
        .single();

      conv = newConv;
    }

    setConversationId(conv.id);

    // link order

    await supabase
      .from("conversation_orders")
      .upsert({
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

          setMessages((prev) => [...prev, payload.new]);

          setTimeout(() => {
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }, 100);

        }
      )
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

    await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        conversationId,
        text
      })
    });

    setText("");
  };

  // -----------------------------
  // FILE UPLOAD
  // -----------------------------

  const uploadFile = async (file: File) => {

    if (!conversationId) return;

    const path =
      `${order.tenant_id}/${conversationId}/${Date.now()}-${file.name}`;

    await supabase.storage
      .from("chat-media")
      .upload(path, file);

    const { data: publicUrl } = supabase.storage
      .from("chat-media")
      .getPublicUrl(path);

    let type = "document";

    if (file.type.startsWith("image")) {
      type = "image";
    }

    await supabase
      .from("messages")
      .insert({
        tenant_id: order.tenant_id,
        branch_id: order.branch_id,
        conversation_id: conversationId,
        sender_type: "cashier",
        sender_id: session.opened_by,
        media_type: type,
        media_url: publicUrl.publicUrl,
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
            Chat pedido #{order?.id?.slice(0,4)}
          </h2>

          <p className="text-xs text-gray-500">
            {order.customer_name}
          </p>
        </div>

        <button
          onClick={onClose}
          className="text-red-500 text-sm"
        >
          Cerrar
        </button>

      </div>

      {/* MESSAGES */}

      <div className="flex-1 overflow-y-auto p-6 space-y-4">

        {messages.map((msg) => {

          const isMe = msg.sender_type === "cashier";

          return (

            <div
              key={msg.id}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >

              <div
                className={`max-w-[70%] rounded-lg p-3 text-sm ${
                  isMe
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100"
                }`}
              >

                {msg.media_type === "text" && msg.message}

                {msg.media_type === "image" && (
                  <img
                    src={msg.media_url}
                    className="rounded-lg max-w-[200px]"
                  />
                )}

                {msg.media_type === "document" && (
                  <a
                    href={msg.media_url}
                    target="_blank"
                    className="underline"
                  >
                    Descargar archivo
                  </a>
                )}

              </div>

            </div>

          );

        })}

        <div ref={bottomRef} />

      </div>

      {/* INPUT */}

      <div className="p-4 border-t flex gap-2">

        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 bg-gray-200 rounded"
        >
          📎
        </button>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {

            const file = e.target.files?.[0];

            if (file) {
              uploadFile(file);
            }

          }}
        />

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendMessage();
          }}
          placeholder="Escribir mensaje..."
          className="flex-1 border rounded px-3 py-2"
        />

        <button
          onClick={sendMessage}
          className="bg-black text-white px-4 rounded"
        >
          Enviar
        </button>

      </div>

    </div>

  );
}