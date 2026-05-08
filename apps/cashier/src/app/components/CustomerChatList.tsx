"use client";

import { useEffect, useState, useRef } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  MessageSquare, Send, X, Paperclip, Image, Video, Music,
  FileText, MapPin, Phone, User, ChevronLeft, Check, CheckCheck, Camera, Mic, Square,
} from "lucide-react";

type Conversation = {
  id: string;
  customer_id: string;
  last_message_at: string | null;
  last_message?: string;
  last_media_type?: string;
  unread_count: number;
  customers: { id: string; name: string; phone: string };
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

type Props = {
  branchId: string;
  tenantId?: string;
  onClose: () => void;
  onUnreadChange: (count: number) => void;
};

function getMediaIcon(t?: string) {
  if (!t) return null;
  if (t.startsWith("image")) return <Image size={20} />;
  if (t.startsWith("video")) return <Video size={20} />;
  if (t.startsWith("audio")) return <Music size={20} />;
  if (t === "document") return <FileText size={20} />;
  if (t === "location") return <MapPin size={20} />;
  return <FileText size={20} />;
}

function getMediaLabel(t?: string) {
  if (!t) return "Archivo";
  if (t.startsWith("image")) return "🖼 Foto";
  if (t.startsWith("video")) return "🎥 Video";
  if (t.startsWith("audio")) return "🎤 Audio";
  if (t === "document") return "📄 Documento";
  if (t === "sticker") return "🏷 Sticker";
  if (t === "location") return "📍 Ubicación";
  if (t === "contacts") return "👤 Contacto";
  return "📎 Archivo";
}

export default function CustomerChatList({ branchId, tenantId, onClose, onUnreadChange }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);
  const [shouldScroll, setShouldScroll] = useState(true);
  const messagesRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTypeRef = useRef<string>("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cachedConvs = useRef<Conversation[] | null>(null);
  const cachedMsgs = useRef<Map<string, Message[]>>(new Map());
  const msgPageRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!branchId) return;
    if (cachedConvs.current) { setConversations(cachedConvs.current); setLoading(false); }
    else loadConversations();
    loadUnreadCounts();
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;
    const channel = supabase.channel(`branch-messages-${branchId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `branch_id=eq.${branchId}` },
        (payload) => {
          const msg = payload.new as Message & { conversation_id: string };
          if (activeConv && msg.conversation_id === activeConv.id) {
            setMessages((prev) => { const e = prev.find((m) => m.id === msg.id); return e ? prev : [...prev, msg]; });
          } else {
            setUnreadMap((p) => ({ ...p, [msg.conversation_id]: (p[msg.conversation_id] || 0) + 1 }));
            setConversations((prev) => prev.map((c) => c.id === msg.conversation_id
              ? { ...c, last_message: msg.message || getMediaLabel(msg.media_type), last_message_at: msg.created_at } : c)
              .sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()));
          }
        }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [branchId, activeConv]);

  useEffect(() => {
    if (activeConv) {
      if (cachedMsgs.current.has(activeConv.id)) setMessages(cachedMsgs.current.get(activeConv.id)!);
      else loadMessages(activeConv.id);
      markAsRead(activeConv.id);
    }
  }, [activeConv]);

  useEffect(() => { if (shouldScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, shouldScroll]);
  useEffect(() => {
    const total = Object.entries(unreadMap).reduce((a, [id, c]) => id === activeConv?.id ? a : a + c, 0);
    onUnreadChange(total);
  }, [unreadMap, activeConv]);

  const loadConversations = async () => {
    const { data, error } = await supabase.from("conversations").select("id, customer_id, last_message_at").eq("branch_id", branchId).order("last_message_at", { ascending: false, nullsFirst: true });
    if (error || !data) { console.error("Error loading conversations:", error); setLoading(false); return; }
    const ids = [...new Set(data.map((c: any) => c.customer_id))];
    const { data: customers } = await supabase.from("customers").select("id, name, phone").in("id", ids);
    const map: Record<string, any> = {}; (customers || []).forEach((c: any) => map[c.id] = c);
    const withLastMsg = await Promise.all(data.map(async (conv: any) => {
      const { data: m } = await supabase.from("messages").select("message, media_type").eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(1).single();
      return { ...conv, customers: map[conv.customer_id] || { id: conv.customer_id, name: "Cliente", phone: "" }, last_message: m?.message || getMediaLabel(m?.media_type) || "Sin mensajes", last_media_type: m?.media_type };
    }));
    cachedConvs.current = withLastMsg as Conversation[];
    setConversations(withLastMsg as Conversation[]);
    setLoading(false);
  };

  const loadUnreadCounts = async () => {
    const { data } = await supabase.from("messages").select("conversation_id").eq("branch_id", branchId).eq("sender_type", "customer");
    const counts: Record<string, number> = {};
    data?.forEach((m: any) => { if (m.conversation_id) counts[m.conversation_id] = (counts[m.conversation_id] || 0) + 1; });
    setUnreadMap(counts);
  };

  const loadMessages = async (convId: string, page = 0) => {
    const size = 6;
    const { data, error } = await supabase.from("messages").select("*").eq("conversation_id", convId).order("created_at", { ascending: false }).range(page * size, page * size + size - 1);
    if (error) return;
    const msgs = (data || []).reverse();
    if (page === 0) { setMessages(msgs); setAllLoaded(msgs.length < size); }
    else { setMessages((p) => [...msgs, ...p]); if (msgs.length < size) setAllLoaded(true); }
    msgPageRef.current.set(convId, page);
  };

  const loadMore = async () => {
    if (!activeConv || loadingMore || allLoaded) return;
    setLoadingMore(true);
    setShouldScroll(false);
    const prevHeight = messagesRef.current?.scrollHeight || 0;
    await loadMessages(activeConv.id, (msgPageRef.current.get(activeConv.id) || 0) + 1);
    // Restaurar posición después de agregar mensajes arriba
    requestAnimationFrame(() => {
      if (messagesRef.current) {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight - prevHeight;
      }
      setShouldScroll(true);
      setLoadingMore(false);
    });
  };

  const markAsRead = (convId: string) => setUnreadMap((p) => ({ ...p, [convId]: 0 }));

  const uploadFile = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const path = `chat/${branchId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const buckets = ["whatsapp-media", "media", "images", "files", "uploads"];
    for (const bucket of buckets) {
      const { error } = await supabase.storage.from(bucket).upload(path, file);
      if (!error) return supabase.storage.from(bucket).getPublicUrl(path).data?.publicUrl || null;
    }
    return null;
  };

  const sendMessage = async () => {
    if (!text.trim() || !activeConv) return;
    const tmp = { id: crypto.randomUUID(), sender_type: "cashier" as const, message: text, media_type: "text", created_at: new Date().toISOString() };
    setMessages((p) => [...p, tmp as any]); setText("");
    try {
      const { data: num } = await supabase.from("whatsapp_numbers").select("phone_number_id, access_token").eq("branch_id", branchId).single();
      if (num) {
        const res = await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: activeConv.id, type: "text", text }) });
        const d = await res.json();
        if (d?.messageId) setMessages((p) => p.map((m) => m.id === tmp.id ? { ...m, status: "sent" } : m));
      }
    } catch (e) { console.error(e); }
  };

  const sendMedia = async (file: File) => {
    if (!activeConv) return; setShowUploadMenu(false);
    const t = file.type.split("/")[0];
    const type = t === "video" ? "video" : t === "audio" ? "audio" : file.type === "image/webp" ? "sticker" : "image";
    const tmp = { id: crypto.randomUUID(), sender_type: "cashier" as const, message: null, media_type: type, media_url: URL.createObjectURL(file), created_at: new Date().toISOString() };
    setMessages((p) => [...p, tmp as any]);
    const url = await uploadFile(file);
    if (url) {
      try {
        const { data: num } = await supabase.from("whatsapp_numbers").select("phone_number_id, access_token").eq("branch_id", branchId).single();
        if (num) await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: activeConv.id, type: "text", text: `📎 ${url}` }) });
      } catch (e) { console.error(e); }
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder; audioChunksRef.current = []; setRecording(true); setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        clearInterval(recordingTimerRef.current!); stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        sendMedia(new File([blob], `audio-${Date.now()}.webm`, { type: "audio/webm" }));
        setRecording(false); setRecordingTime(0);
      };
      recorder.start();
    } catch (err) { console.error(err); setRecording(false); }
  };
  const stopRecording = () => { if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop(); };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) sendMedia(f); e.target.value = ""; };
  const triggerUpload = (t: string) => {
    uploadTypeRef.current = t;
    if (t === "camera") { fileInputRef.current!.accept = "image/*"; fileInputRef.current!.capture = "environment" as any; }
    else if (t === "gallery") { fileInputRef.current!.accept = "image/*,video/*"; fileInputRef.current!.removeAttribute("capture"); }
    else { fileInputRef.current!.accept = "*/*"; fileInputRef.current!.removeAttribute("capture"); }
    fileInputRef.current!.click();
  };

  const fmtTime = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) === new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })
      ? date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
      : date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  const renderMedia = (msg: Message) => {
    const t = msg.media_type || "";
    if (t === "sticker") return msg.media_url ? <img src={msg.media_url} alt="" className="max-w-[200px] max-h-[200px]" /> : <span className="text-4xl">🏷️</span>;
    if (t.startsWith("image")) return msg.media_url ? <img src={msg.media_url} alt="" className="rounded-lg max-w-full max-h-64 object-cover cursor-pointer" onClick={() => setLightbox(msg.media_url ?? null)} /> : <span className="text-gray-500 text-sm">📷 Imagen</span>;
    if (t.startsWith("video")) return msg.media_url ? <video controls className="rounded-lg max-w-full max-h-64" src={msg.media_url} /> : <span className="text-gray-500 text-sm">🎥 Video</span>;
    if (t.startsWith("audio")) return msg.media_url ? <audio controls className="max-w-[220px] h-10" src={msg.media_url} /> : <span className="text-gray-500 text-sm">🎤 Mensaje de voz</span>;
    if (t === "location") return <a href={msg.message || "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline"><MapPin size={18} />Ver ubicación</a>;
    if (t === "contacts") return <div className="flex items-center gap-2 text-blue-600"><User size={18} /><span>{msg.message?.replace(/👤 /, "").split("\n")[0]}</span></div>;
    if (t === "document") return msg.media_url ? <a href={msg.media_url} download className="flex items-center gap-2 text-blue-600 hover:underline"><FileText size={18} /><span className="truncate max-w-[200px]">📄 Documento</span></a> : <span className="text-gray-500 text-sm">📄 Documento</span>;
    return null;
  };

  if (loading) return <div className="h-full flex items-center justify-center bg-gray-50"><div className="text-gray-400 animate-pulse">Cargando...</div></div>;

  return (
    <div className="h-full flex bg-white">
      <div className={`${activeConv ? "hidden lg:flex" : "flex"} w-full lg:w-80 xl:w-96 flex-col border-r bg-white flex-shrink-0`}>
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">WhatsApp</h2>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="px-3 py-2"><input placeholder="Buscar chat..." className="w-full bg-gray-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500" /></div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm"><MessageSquare size={36} className="mx-auto mb-2 opacity-50" /><p>No hay conversaciones</p></div>
          ) : conversations.map((conv) => (
            <button key={conv.id} onClick={() => setActiveConv(conv)} className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition border-b border-gray-50 ${activeConv?.id === conv.id ? "bg-green-50" : ""}`}>
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center"><span className="text-gray-500 font-medium text-sm">{conv.customers.name?.[0]?.toUpperCase() || "?"}</span></div>
                {unreadMap[conv.id] > 0 && <div className="absolute -top-0.5 -right-0.5 bg-green-500 text-white text-[11px] w-5 h-5 rounded-full flex items-center justify-center font-medium">{unreadMap[conv.id]}</div>}
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="flex justify-between items-start">
                  <span className="font-medium text-sm truncate">{conv.customers.name || conv.customers.phone}</span>
                  <span className="text-[11px] text-gray-400 ml-2">{conv.last_message_at ? fmtTime(conv.last_message_at) : ""}</span>
                </div>
                <p className="text-xs text-gray-500 truncate">{conv.last_media_type && conv.last_media_type !== "text" ? getMediaLabel(conv.last_media_type) : conv.last_message || "Sin mensajes"}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {activeConv ? (
        <div className="flex-1 flex flex-col bg-gray-100 min-w-0">
          <div className="px-4 py-3 bg-white border-b flex items-center gap-3">
            <button onClick={() => setActiveConv(null)} className="lg:hidden p-1 rounded-lg hover:bg-gray-100"><ChevronLeft size={20} /></button>
            <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center"><span className="text-gray-600 font-medium text-sm">{activeConv.customers.name?.[0]?.toUpperCase() || "?"}</span></div>
            <div className="flex-1 min-w-0"><p className="font-medium text-sm truncate">{activeConv.customers.name || "Sin nombre"}</p><p className="text-[11px] text-gray-500">{activeConv.customers.phone}</p></div>
            <a href={`tel:${activeConv.customers.phone}`} className="p-2 rounded-full hover:bg-gray-100"><Phone size={18} className="text-gray-600" /></a>
          </div>

          <div ref={messagesRef} className="flex-1 overflow-y-auto p-3 md:p-4 space-y-1" style={{ backgroundColor: "#e5ddd5", backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5 L35 15 L30 25 L25 15 Z' fill='%23ffffff' opacity='0.4'/%3E%3C/svg%3E\")" }}>
            {!allLoaded && messages.length >= 6 && ( <div className="flex justify-center py-2"><button onClick={loadMore} disabled={loadingMore} className="text-xs text-blue-600 hover:underline disabled:text-gray-400">{loadingMore ? "Cargando..." : "Cargar mensajes anteriores"}</button></div> )}
            {allLoaded && messages.length > 0 && <div className="flex justify-center py-2"><span className="text-[10px] text-gray-400">Inicio de la conversación</span></div>}
            {messages.length === 0 ? (
              <div className="flex justify-center py-8"><span className="text-sm text-gray-400">No hay mensajes. Enviá un mensaje para comenzar.</span></div>
            ) : messages.map((msg, idx) => {
              const isMe = msg.sender_type === "cashier";
              const showDate = idx === 0 || new Date(msg.created_at).toDateString() !== new Date(messages[idx - 1]?.created_at).toDateString();
              return (<div key={msg.id}>
                {showDate && <div className="flex justify-center my-2"><span className="text-[11px] bg-white/80 px-3 py-1 rounded-full text-gray-500 shadow-sm">{new Date(msg.created_at).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}</span></div>}
                <div className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] md:max-w-[70%] rounded-lg px-3 py-2 shadow-sm ${isMe ? "bg-[#dcf8c6] rounded-br-sm" : "bg-white rounded-bl-sm"}`} style={msg.media_type === "sticker" ? { background: "transparent", boxShadow: "none", padding: 0 } : {}}>
                    {renderMedia(msg)}
                    {msg.message && msg.media_type !== "location" && msg.media_type !== "contacts" && <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>}
                    <div className={`flex justify-end items-center gap-1 mt-0.5 ${msg.media_type === "sticker" ? "hidden" : ""}`}>
                      <span className="text-[10px] text-gray-500">{fmtTime(msg.created_at)}</span>
                      {isMe && (msg.status === "sent" ? <Check size={14} className="text-gray-400" /> : msg.status === "delivered" || msg.status === "read" ? <CheckCheck size={14} className="text-blue-500" /> : <Check size={14} className="text-gray-300" />)}
                    </div>
                  </div>
                </div>
              </div>);
            })}
            {messages.length > 0 && !allLoaded && <button onClick={loadMore} className="w-full text-xs text-blue-600 hover:underline py-2">Cargar más</button>}
            <div ref={bottomRef} />
          </div>

          <div className="px-3 py-2 bg-white border-t flex items-center gap-2">
            <div className="relative">
              <button onClick={() => setShowUploadMenu(!showUploadMenu)} className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center"><Paperclip size={20} className="text-gray-600" /></button>
              {showUploadMenu && (
                <div className="absolute bottom-12 left-0 bg-white rounded-xl shadow-xl border p-2 space-y-1 min-w-[160px] z-10">
                  <button onClick={() => triggerUpload("camera")} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-sm"><Camera size={18} />Cámara</button>
                  <button onClick={() => triggerUpload("gallery")} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-sm"><Image size={18} />Galería</button>
                  <button onClick={() => triggerUpload("file")} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-sm"><FileText size={18} />Documento</button>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
            <input type="text" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Escribe un mensaje..." className="flex-1 border-0 bg-gray-100 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-500" />
            {text.trim() ? (
              <button onClick={sendMessage} className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center hover:bg-green-600 transition flex-shrink-0"><Send size={18} /></button>
            ) : recording ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-500 font-medium">{Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, "0")}</span>
                <button onClick={stopRecording} className="w-10 h-10 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 animate-pulse flex-shrink-0"><Square size={16} /></button>
              </div>
            ) : (
              <button onClick={startRecording} className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition flex-shrink-0"><Mic size={18} /></button>
            )}
          </div>
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 flex-col items-center justify-center bg-gray-100">
          <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center mb-4"><MessageSquare size={36} className="text-gray-400" /></div>
          <p className="text-gray-500 font-medium">Seleccioná un chat</p>
          <p className="text-gray-400 text-sm mt-1">para ver las conversaciones</p>
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center cursor-pointer" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain p-4" />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30"><X size={24} className="text-white" /></button>
        </div>
      )}
    </div>
  );
}