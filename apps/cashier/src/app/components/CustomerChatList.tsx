"use client";

import { useEffect, useState, useRef } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  MessageSquare, Send, X, Paperclip, Image, Video, Music,
  FileText, MapPin, Phone, User, ChevronLeft, Check, CheckCheck, Camera, Mic, Square,
} from "lucide-react";
import {
  getWhatsAppMessagePreview,
  getWhatsAppNotificationPermission,
  getWhatsAppReadMap,
  markWhatsAppConversationRead,
  notifyIncomingWhatsApp,
  requestWhatsAppNotificationPermission,
} from "@/lib/whatsappNotifications";

type Conversation = {
  id: string;
  customer_id: string;
  last_message_at: string | null;
  last_message?: string;
  last_media_type?: string;
  unread_count: number;
  customers: { id: string; name: string; phone: string; address?: string; tags?: string[] };
};

type Message = {
  id: string;
  sender_type: "customer" | "cashier";
  message?: string;
  media_type?: string;
  media_url?: string;
  created_at: string;
  status?: string;
  error?: string;
  retry?: () => void;
};

type QuickReply = {
  id: string;
  short_name: string;
  message: string;
  icon?: string | null;
};

type Props = {
  branchId: string;
  tenantId?: string;
  onClose: () => void;
  onUnreadChange: (count: number) => void;
};

const CONVERSATIONS_PAGE_SIZE = 25;

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
  const [searchTerm, setSearchTerm] = useState("");
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [notificationPermission, setNotificationPermission] = useState<string>("default");
  const [loading, setLoading] = useState(true);
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false);
  const [allConversationsLoaded, setAllConversationsLoaded] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);
  const [shouldScroll, setShouldScroll] = useState(true);
  const [filter, setFilter] = useState<"all" | "without_orders" | "delivered">("all");
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [customerIdsWithoutOrders, setCustomerIdsWithoutOrders] = useState<Set<string>>(new Set());
  const [customerIdsDelivered, setCustomerIdsDelivered] = useState<Set<string>>(new Set());
  const [showCustomerInfo, setShowCustomerInfo] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
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
  const convPageRef = useRef(0);
  const conversationsRef = useRef<Conversation[]>([]);
  const activeConvRef = useRef<Conversation | null>(null);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    activeConvRef.current = activeConv;
  }, [activeConv]);

  useEffect(() => {
    if (!branchId) return;
    convPageRef.current = 0;
    setAllConversationsLoaded(false);
    if (cachedConvs.current) {
      setConversations(cachedConvs.current);
      setLoading(false);
    }
    loadConversations(0);
    loadUnreadCounts();
    loadOrdersFilter();
    loadQuickReplies();
    setNotificationPermission(getWhatsAppNotificationPermission());
  }, [branchId, tenantId]);

  useEffect(() => {
    if (!branchId) return;
    const channel = supabase.channel(`branch-messages-${branchId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `branch_id=eq.${branchId}` },
        (payload) => {
          const msg = payload.new as Message & { conversation_id: string };
          const isIncomingCustomerMessage = msg.sender_type === "customer";
          const currentActiveConv = activeConvRef.current;
          if (currentActiveConv && msg.conversation_id === currentActiveConv.id) {
            setMessages((prev) => { const e = prev.find((m) => m.id === msg.id); return e ? prev : [...prev, msg]; });
          } else if (isIncomingCustomerMessage) {
            setUnreadMap((p) => ({ ...p, [msg.conversation_id]: (p[msg.conversation_id] || 0) + 1 }));
            notifyNewMessage(msg);
          }
          // Siempre mover la conversación al tope (como WhatsApp)
          void upsertConversationFromMessage(msg);
        })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversations", filter: `branch_id=eq.${branchId}` },
        (payload) => {
          void upsertConversationFromConversation(payload.new as { id: string; customer_id?: string; last_message_at?: string | null });
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations", filter: `branch_id=eq.${branchId}` },
        (payload) => {
          void upsertConversationFromConversation(payload.new as { id: string; customer_id?: string; last_message_at?: string | null });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [branchId]);

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

  const loadConversations = async (page = 0) => {
    const from = page * CONVERSATIONS_PAGE_SIZE;
    const to = from + CONVERSATIONS_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("conversations")
      .select("id, customer_id, last_message_at")
      .eq("branch_id", branchId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .range(from, to);

    if (error || !data) { console.error("Error loading conversations:", error); setLoading(false); return; }

    const ids = [...new Set(data.map((c: any) => c.customer_id).filter(Boolean))];
    const { data: customers } = ids.length
      ? await supabase.from("customers").select("id, name, phone").in("id", ids)
      : { data: [] };
    const map: Record<string, any> = {}; (customers || []).forEach((c: any) => map[c.id] = c);
    const withLastMsg = await Promise.all(data.map(async (conv: any) => {
      const { data: m } = await supabase.from("messages").select("message, media_type").eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(1).single();
      return { ...conv, customers: map[conv.customer_id] || { id: conv.customer_id, name: "Cliente", phone: "" }, last_message: m?.message || getMediaLabel(m?.media_type) || "Sin mensajes", last_media_type: m?.media_type };
    }));
    setAllConversationsLoaded(data.length < CONVERSATIONS_PAGE_SIZE);
    convPageRef.current = page;
    setConversations((prev) => {
      const merged = page === 0
        ? withLastMsg as Conversation[]
        : sortConversations([
            ...prev,
            ...(withLastMsg as Conversation[]).filter((conv) => !prev.some((current) => current.id === conv.id)),
          ]);
      cachedConvs.current = merged;
      return merged;
    });
    setLoading(false);
  };

  const loadMoreConversations = async () => {
    if (loadingMoreConversations || allConversationsLoaded) return;
    setLoadingMoreConversations(true);
    await loadConversations(convPageRef.current + 1);
    setLoadingMoreConversations(false);
  };

  const hydrateConversation = async (convId: string): Promise<Conversation | null> => {
    const { data: conv, error } = await supabase
      .from("conversations")
      .select("id, customer_id, last_message_at")
      .eq("id", convId)
      .maybeSingle();

    if (error || !conv) {
      console.error("Error loading incoming conversation:", error);
      return null;
    }

    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, phone, address, tags")
      .eq("id", conv.customer_id)
      .maybeSingle();

    const { data: lastMessage } = await supabase
      .from("messages")
      .select("message, media_type, created_at")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      ...conv,
      customers: customer || { id: conv.customer_id, name: "Cliente", phone: "" },
      last_message: lastMessage?.message || getMediaLabel(lastMessage?.media_type) || "Sin mensajes",
      last_media_type: lastMessage?.media_type,
      last_message_at: conv.last_message_at || lastMessage?.created_at || null,
      unread_count: 0,
    } as Conversation;
  };

  const sortConversations = (items: Conversation[]) =>
    [...items].sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime());

  const upsertConversationFromMessage = async (msg: Message & { conversation_id: string }) => {
    const lastMessage = msg.message || getMediaLabel(msg.media_type);

    if (conversationsRef.current.some((c) => c.id === msg.conversation_id)) {
      setConversations((prev) => {
        const next = sortConversations(prev.map((c) =>
          c.id === msg.conversation_id
            ? {
                ...c,
                last_message: lastMessage,
                last_media_type: msg.media_type,
                last_message_at: msg.created_at,
              }
            : c,
        ));
        cachedConvs.current = next;
        return next;
      });
      return;
    }

    const hydrated = await hydrateConversation(msg.conversation_id);
    if (!hydrated) return;

    setConversations((prev) => {
      if (prev.some((c) => c.id === msg.conversation_id)) return prev;
      const next = sortConversations([
        {
          ...hydrated,
          last_message: lastMessage,
          last_media_type: msg.media_type,
          last_message_at: msg.created_at,
        },
        ...prev,
      ]);
      cachedConvs.current = next;
      return next;
    });
  };

  const upsertConversationFromConversation = async (convRow: { id: string; customer_id?: string; last_message_at?: string | null }) => {
    const hydrated = await hydrateConversation(convRow.id);
    if (!hydrated) return;

    const incoming = {
      ...hydrated,
      last_message_at: convRow.last_message_at || hydrated.last_message_at,
    };

    setConversations((prev) => {
      const exists = prev.some((c) => c.id === incoming.id);
      const next = sortConversations(exists
        ? prev.map((c) => c.id === incoming.id ? { ...c, ...incoming } : c)
        : [incoming, ...prev]);
      cachedConvs.current = next;
      return next;
    });
  };

  const loadUnreadCounts = async () => {
    // Obtener marcas de leído de localStorage
    const readMap = getWhatsAppReadMap();

    const { data } = await supabase.from("messages").select("conversation_id, created_at").eq("branch_id", branchId).eq("sender_type", "customer");
    const counts: Record<string, number> = {};
    data?.forEach((m: any) => {
      if (m.conversation_id) {
        const lastRead = readMap[m.conversation_id];
        if (!lastRead || new Date(m.created_at).getTime() > lastRead) {
          counts[m.conversation_id] = (counts[m.conversation_id] || 0) + 1;
        }
      }
    });
    setUnreadMap(counts);
  };

  const loadOrdersFilter = async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: orders } = await supabase
      .from("orders")
      .select("customer_id, status")
      .eq("branch_id", branchId)
      .gte("created_at", since);

    const activeStatuses = ["unconfirmed", "confirmed", "preparing", "ready", "sent"];
    const deliveredStatuses = ["delivered"];

    const activeIds = new Set<string>();
    const deliveredIds = new Set<string>();

    orders?.forEach((o: any) => {
      if (activeStatuses.includes(o.status)) activeIds.add(o.customer_id);
      if (deliveredStatuses.includes(o.status)) deliveredIds.add(o.customer_id);
    });

    setCustomerIdsWithoutOrders(activeIds);
    setCustomerIdsDelivered(deliveredIds);
  };

  const loadQuickReplies = async () => {
    if (!branchId || !tenantId) return;
    const { data, error } = await supabase
      .from("whatsapp_quick_replies")
      .select("id, short_name, message, icon")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .or(`branch_id.eq.${branchId},branch_id.is.null`)
      .order("position", { ascending: true })
      .order("short_name", { ascending: true });

    if (error) {
      console.warn("Could not load WhatsApp quick replies", error.message);
      setQuickReplies([]);
      return;
    }

    setQuickReplies(data || []);
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

  const markAsRead = (convId: string) => {
    setUnreadMap((p) => ({ ...p, [convId]: 0 }));
    markWhatsAppConversationRead(convId);
  };

  const requestNotifications = async () => {
    const permission = await requestWhatsAppNotificationPermission();
    setNotificationPermission(permission);
  };

  const notifyNewMessage = (msg: Message & { conversation_id: string }) => {
    const conv = conversationsRef.current.find((c) => c.id === msg.conversation_id);
    const title = conv?.customers.name || conv?.customers.phone || "Cliente";
    notifyIncomingWhatsApp({
      messageId: msg.id,
      conversationId: msg.conversation_id,
      title: `WhatsApp - ${title}`,
      body: getWhatsAppMessagePreview(msg.media_type, msg.message),
      tagPrefix: "customer-whatsapp",
    });
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const path = `chat/${branchId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const buckets = ["whatsapp-media", "media", "images", "files", "uploads"];
    for (const bucket of buckets) {
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: "31536000",
      });
      if (!error) return supabase.storage.from(bucket).getPublicUrl(path).data?.publicUrl || null;
    }
    return null;
  };

  const sendTextMessage = async (messageText: string) => {
    if (!messageText.trim() || !activeConv) return;
    const outgoingText = messageText.trim();
    const tmp = { id: crypto.randomUUID(), sender_type: "cashier" as const, message: outgoingText, media_type: "text", created_at: new Date().toISOString(), status: "pending" };
    setMessages((p) => [...p, tmp as any]); setText("");
    try {
      const res = await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: activeConv.id, type: "text", text: outgoingText }) });
      const d = await res.json();
      if (!res.ok || d?.error) throw new Error(d?.error || "No se pudo enviar");
      if (d?.message) {
        setMessages((p) => [...p.filter((m) => m.id !== tmp.id && m.id !== d.message.id), d.message]);
      } else {
        setMessages((p) => p.map((m) => m.id === tmp.id ? { ...m, status: "sent" } : m));
      }
    } catch (e) {
      console.error(e);
      setMessages((p) => p.map((m) => m.id === tmp.id ? { ...m, status: "error", error: "No se pudo enviar", retry: () => { setText(outgoingText); } } : m));
    }
  };

  const sendMessage = async () => {
    await sendTextMessage(text);
  };

  const sendQuickReply = async (reply: QuickReply) => {
    await sendTextMessage(reply.message);
  };

  const sendMedia = async (file: File) => {
    if (!activeConv) return; setShowUploadMenu(false);
    const t = file.type.split("/")[0];
    const type = t === "video" ? "video" : t === "audio" ? "audio" : file.type === "image/webp" ? "sticker" : t === "image" ? "image" : "document";
    const tmp = { id: crypto.randomUUID(), sender_type: "cashier" as const, message: null, media_type: type, media_url: URL.createObjectURL(file), created_at: new Date().toISOString(), status: "pending" };
    setMessages((p) => [...p, tmp as any]);
    const url = await uploadFile(file);
    if (!url) {
      setMessages((p) => p.map((m) => m.id === tmp.id ? { ...m, status: "error", error: "No se pudo subir el archivo", retry: () => sendMedia(file) } : m));
      return;
    }

    if (url) {
      try {
        const { data: num } = await supabase.from("whatsapp_numbers").select("phone_number_id, access_token").eq("branch_id", branchId).single();
        if (num) await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: activeConv.id, type: "text", text: `📎 ${url}` }) });
      } catch (e) { console.error(e); }
    }
  };

  const sendMediaPro = async (file: File) => {
    if (!activeConv) return;
    setShowUploadMenu(false);

    const family = file.type.split("/")[0];
    const type = family === "video" ? "video" : family === "audio" ? "audio" : file.type === "image/webp" ? "sticker" : family === "image" ? "image" : "document";
    const tmp = {
      id: crypto.randomUUID(),
      sender_type: "cashier" as const,
      message: type === "document" ? file.name : null,
      media_type: type,
      media_url: URL.createObjectURL(file),
      created_at: new Date().toISOString(),
      status: "pending",
    };

    setMessages((p) => [...p, tmp as any]);

    const publicUrl = await uploadFile(file);
    if (!publicUrl) {
      setMessages((p) => p.map((m) => m.id === tmp.id ? { ...m, status: "error", error: "No se pudo subir el archivo", retry: () => sendMediaPro(file) } : m));
      return;
    }

    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConv.id,
          type,
          mediaUrl: publicUrl,
          fileName: file.name,
          caption: type === "document" ? file.name : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || data?.error) throw new Error(data?.error || "No se pudo enviar");

      if (data?.message) {
        setMessages((p) => [...p.filter((m) => m.id !== tmp.id && m.id !== data.message.id), data.message]);
      } else {
        setMessages((p) => p.map((m) => m.id === tmp.id ? { ...m, status: "sent", media_url: publicUrl } : m));
      }
    } catch (error) {
      console.error(error);
      setMessages((p) => p.map((m) => m.id === tmp.id ? { ...m, status: "error", error: "No se pudo enviar", retry: () => sendMediaPro(file) } : m));
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
        sendMediaPro(new File([blob], `audio-${Date.now()}.webm`, { type: "audio/webm" }));
        setRecording(false); setRecordingTime(0);
      };
      recorder.start();
    } catch (err) { console.error(err); setRecording(false); }
  };
  const stopRecording = () => { if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop(); };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) sendMediaPro(f); e.target.value = ""; };
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
    if (t === "location") {
      const url = msg.message?.match(/https?:\/\/[^\s]+/)?.[0] || "#";
      return <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-600 hover:underline"><MapPin size={18} />Ver ubicación</a>;
    }
    if (t === "contacts") return <div className="flex items-center gap-2 text-blue-600"><User size={18} /><span>{msg.message?.replace(/👤 /, "").split("\n")[0]}</span></div>;
    if (t === "document") return msg.media_url ? <a href={msg.media_url} download className="flex items-center gap-2 text-blue-600 hover:underline"><FileText size={18} /><span className="truncate max-w-[200px]">📄 Documento</span></a> : <span className="text-gray-500 text-sm">📄 Documento</span>;
    return null;
  };

  if (loading) return <div className="h-full flex items-center justify-center bg-gray-50"><div className="text-gray-400 animate-pulse">Cargando...</div></div>;

  const filteredConversations = conversations.filter((conv) => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch = !q || [
      conv.customers.name,
      conv.customers.phone,
      conv.last_message,
      ...(conv.customers.tags || []),
    ].some((value) => value?.toLowerCase().includes(q));

    if (!matchesSearch) return false;
    if (filter === "all") return true;
    if (filter === "without_orders") return !customerIdsWithoutOrders.has(conv.customer_id);
    if (filter === "delivered") return customerIdsDelivered.has(conv.customer_id);
    return true;
  });

  return (
    <div className="h-full flex bg-white">
      <div className={`${activeConv ? "hidden lg:flex" : "flex"} w-full lg:w-80 xl:w-96 flex-col border-r bg-white flex-shrink-0`}>
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">WhatsApp</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={requestNotifications}
              className={`px-2 py-1 rounded-full text-[11px] font-medium ${
                notificationPermission === "granted"
                  ? "bg-green-100 text-green-700"
                  : notificationPermission === "denied"
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
              title="Activar notificaciones del navegador"
            >
              {notificationPermission === "granted"
                ? "Alertas on"
                : notificationPermission === "denied"
                  ? "Bloqueadas"
                  : notificationPermission === "unsupported"
                    ? "No soportado"
                    : "Activar alertas"}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100"><X size={18} /></button>
          </div>
        </div>
        <div className="px-3 py-2 space-y-2">
          <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar chat..." className="w-full bg-gray-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500" />
          <div className="flex gap-2 text-xs">
            <button onClick={() => setFilter("all")} className={`px-3 py-1.5 rounded-full font-medium transition ${filter === "all" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Todos</button>
            <button onClick={() => setFilter("without_orders")} className={`px-3 py-1.5 rounded-full font-medium transition ${filter === "without_orders" ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Sin pedidos</button>
            <button onClick={() => setFilter("delivered")} className={`px-3 py-1.5 rounded-full font-medium transition ${filter === "delivered" ? "bg-green-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Entregados</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm"><MessageSquare size={36} className="mx-auto mb-2 opacity-50" /><p>{filter === "all" ? "No hay conversaciones" : filter === "without_orders" ? "Todos los números tienen pedidos activos" : "No hay entregas recientes"}</p></div>
          ) : filteredConversations.map((conv) => (
            <div key={conv.id} className="group relative">
              <button onClick={() => setActiveConv(conv)} className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition border-b border-gray-50 ${activeConv?.id === conv.id ? "bg-green-50" : ""}`}>
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center"><span className="text-gray-500 font-medium text-sm">{conv.customers.name?.[0]?.toUpperCase() || "?"}</span></div>
                  {unreadMap[conv.id] > 0 && <div className="absolute -top-0.5 -right-0.5 bg-green-500 text-white text-[11px] w-5 h-5 rounded-full flex items-center justify-center font-medium">{unreadMap[conv.id]}</div>}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="font-medium text-sm truncate">{conv.customers.name || conv.customers.phone}</span>
                      {(conv.customers.tags || []).slice(0, 2).map((tag) => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full whitespace-nowrap">{tag}</span>
                      ))}
                    </div>
                    <span className="text-[11px] text-gray-400 ml-2">{conv.last_message_at ? fmtTime(conv.last_message_at) : ""}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{conv.last_media_type && conv.last_media_type !== "text" ? getMediaLabel(conv.last_media_type) : conv.last_message || "Sin mensajes"}</p>
                </div>
              </button>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!confirm(`¿Eliminar chat con ${conv.customers.name || conv.customers.phone}?`)) return;
                  await supabase.from("conversations").delete().eq("id", conv.id);
                  setConversations((prev) => prev.filter((c) => c.id !== conv.id));
                  if (activeConv?.id === conv.id) setActiveConv(null);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-red-500 text-white items-center justify-center hover:bg-red-600 transition opacity-0 group-hover:opacity-100 hidden sm:flex"
                title="Eliminar chat"
              ><X size={14} /></button>
            </div>
          ))}
          {!allConversationsLoaded && (
            <div className="p-3">
              <button
                onClick={loadMoreConversations}
                disabled={loadingMoreConversations}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingMoreConversations ? "Cargando chats..." : "Cargar mas chats"}
              </button>
            </div>
          )}
        </div>
      </div>

      {activeConv ? (
        <div className="flex-1 flex flex-col bg-gray-100 min-w-0">
          {/* Chat Header - click to see customer info */}
          <div className="px-4 py-3 bg-white border-b flex items-center gap-3">
            <button onClick={() => setActiveConv(null)} className="lg:hidden p-1 rounded-lg hover:bg-gray-100"><ChevronLeft size={20} /></button>
            <button onClick={async () => {
              const { data: fullCustomer } = await supabase.from("customers").select("*").eq("id", activeConv.customers.id).single();
              if (fullCustomer) {
                setEditName(fullCustomer.name || "");
                setEditAddress(fullCustomer.address || "");
                setEditTags(fullCustomer.tags || []);
                if (!fullCustomer.address) {
                  const { data: lastOrder } = await supabase.from("orders").select("address").eq("customer_id", activeConv.customers.id).eq("type", "delivery").not("address", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
                  if (lastOrder?.address) setEditAddress(lastOrder.address);
                }
              } else {
                setEditName(activeConv.customers.name || "");
                setEditAddress("");
                setEditTags([]);
              }
              setShowCustomerInfo(true);
            }} className="flex items-center gap-3 flex-1 min-w-0 text-left">
              <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0"><span className="text-gray-600 font-medium text-sm">{activeConv.customers.name?.[0]?.toUpperCase() || "?"}</span></div>
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{activeConv.customers.name || "Sin nombre"}</p>
                <p className="text-[11px] text-gray-500">{activeConv.customers.phone}</p>
              </div>
            </button>
            <a href={`tel:${activeConv.customers.phone}`} className="p-2 rounded-full hover:bg-gray-100"><Phone size={18} className="text-gray-600" /></a>
          </div>

          {/* Customer Info Panel */}
          {showCustomerInfo && (
            <div className="border-b bg-white px-4 py-4 space-y-3 animate-in slide-in-from-top">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-gray-900">Datos del cliente</h3>
                <button onClick={() => setShowCustomerInfo(false)} className="text-xs text-gray-500 hover:text-gray-700">Cerrar</button>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-500">Nombre</label>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Teléfono</label>
                  <p className="text-sm text-gray-800 px-3 py-2">{activeConv.customers.phone}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Dirección</label>
                  <input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Sin dirección" className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Etiquetas</label>
                  <div className="flex flex-wrap gap-1 mb-1">
                    {editTags.map((tag, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                        {tag}
                        <button onClick={() => setEditTags((prev) => prev.filter((_, j) => j !== i))} className="hover:text-blue-900">&times;</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && tagInput.trim()) { setEditTags((prev) => [...prev, tagInput.trim()]); setTagInput(""); } }} placeholder="Agregar etiqueta..." className="flex-1 border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-green-500" />
                    <button onClick={() => { if (tagInput.trim()) { setEditTags((prev) => [...prev, tagInput.trim()]); setTagInput(""); } }} className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">+</button>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    await supabase.from("customers").update({ name: editName, address: editAddress || null, tags: editTags }).eq("id", activeConv.customers.id);
                    setShowCustomerInfo(false);
                    setConversations((prev) => prev.map((c) => c.id === activeConv.id ? { ...c, customers: { ...c.customers, name: editName, tags: editTags } } : c));
                    setActiveConv((prev) => prev ? { ...prev, customers: { ...prev.customers, name: editName, tags: editTags } } : null);
                  }}
                  className="w-full py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition"
                >Guardar</button>
              </div>
            </div>
          )}

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
                      {isMe && (msg.status === "error" ? <button onClick={msg.retry} className="text-[10px] font-medium text-red-600 hover:underline">Reintentar</button> : msg.status === "pending" ? <span className="text-[10px] text-gray-400">Enviando...</span> : msg.status === "sent" ? <Check size={14} className="text-gray-400" /> : msg.status === "delivered" || msg.status === "read" ? <CheckCheck size={14} className="text-blue-500" /> : <Check size={14} className="text-gray-300" />)}
                    </div>
                  </div>
                </div>
              </div>);
            })}
          </div>

          <div className="border-t bg-white">
            {quickReplies.length > 0 && (
              <div className="flex gap-2 overflow-x-auto border-b border-gray-100 px-3 py-2">
                {quickReplies.map((reply) => (
                  <button
                    key={reply.id}
                    onClick={() => sendQuickReply(reply)}
                    className="shrink-0 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-800 transition hover:border-green-400 hover:bg-green-100"
                    title={reply.message}
                  >
                    {reply.icon ? `${reply.icon} ` : ""}{reply.short_name}
                  </button>
                ))}
              </div>
            )}
          <div className="px-3 py-2 flex items-center gap-2">
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
