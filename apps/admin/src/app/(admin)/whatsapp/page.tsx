"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  MessageCircle,
  Plus,
  Search,
  Save,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

type Branch = {
  id: string;
  name: string;
};

type QuickReply = {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  short_name: string;
  message: string;
  icon: string | null;
  position: number;
  is_active: boolean;
};

type Conversation = {
  id: string;
  customer_id: string | null;
  branch_id: string | null;
  last_message_at: string | null;
  customers?: {
    name?: string | null;
    phone?: string | null;
  } | null;
  branches?: {
    name?: string | null;
  } | null;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_type: string;
  message: string | null;
  media_type: string | null;
  media_url: string | null;
  created_at: string;
};

const DEFAULT_FORM = {
  short_name: "",
  message: "",
  icon: "",
  branch_id: "",
  position: "0",
  is_active: true,
};

function fmtDate(value?: string | null) {
  if (!value) return "Sin actividad";
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function previewMessage(message?: Message) {
  if (!message) return "Sin mensajes";
  if (message.message?.trim()) return message.message.trim();
  if (message.media_type === "image") return "Imagen";
  if (message.media_type === "audio") return "Audio";
  if (message.media_type === "video") return "Video";
  if (message.media_type === "document") return "Documento";
  return "Mensaje multimedia";
}

export default function WhatsAppAdminPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [lastMessages, setLastMessages] = useState<Record<string, Message>>({});
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [conversationMessages, setConversationMessages] = useState<Message[]>([]);
  const [conversationSearch, setConversationSearch] = useState("");
  const [tab, setTab] = useState<"conversations" | "quick">("conversations");
  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    loadQuickReplies();
    loadConversations();
  }, [tenantId, selectedBranch]);

  useEffect(() => {
    if (!selectedConversation) return;
    loadConversationMessages(selectedConversation.id);
  }, [selectedConversation]);

  const loadInitialData = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!userRecord?.tenant_id) return;

    setTenantId(userRecord.tenant_id);

    const { data: branchesData } = await supabase
      .from("branches")
      .select("id, name")
      .eq("tenant_id", userRecord.tenant_id)
      .order("name");

    setBranches(branchesData || []);
    setLoading(false);
  };

  const loadQuickReplies = async () => {
    if (!tenantId) return;
    let query = supabase
      .from("whatsapp_quick_replies")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("position", { ascending: true })
      .order("short_name", { ascending: true });

    if (selectedBranch) {
      query = query.or(`branch_id.eq.${selectedBranch},branch_id.is.null`);
    }

    const { data, error } = await query;
    if (error) {
      setNotice(`Falta aplicar add_whatsapp_quick_replies.sql: ${error.message}`);
      setQuickReplies([]);
      return;
    }
    setQuickReplies(data || []);
  };

  const loadConversations = async () => {
    if (!tenantId) return;

    let query = supabase
      .from("conversations")
      .select("id, customer_id, branch_id, last_message_at, customers(name, phone), branches(name)")
      .eq("tenant_id", tenantId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(80);

    if (selectedBranch) query = query.eq("branch_id", selectedBranch);

    const { data, error } = await query;
    if (error) {
      setNotice(error.message);
      setConversations([]);
      return;
    }

    const rows = (data || []) as Conversation[];
    setConversations(rows);

    const ids = rows.map((conversation) => conversation.id);
    if (!ids.length) {
      setLastMessages({});
      return;
    }

    const { data: messages } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_type, message, media_type, media_url, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
      .limit(200);

    const next: Record<string, Message> = {};
    (messages || []).forEach((message: Message) => {
      if (!next[message.conversation_id]) next[message.conversation_id] = message;
    });
    setLastMessages(next);
  };

  const loadConversationMessages = async (conversationId: string) => {
    const { data } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_type, message, media_type, media_url, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(40);

    setConversationMessages((data || []).reverse());
  };

  const filteredConversations = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) => {
      const lastMessage = lastMessages[conversation.id];
      return [
        conversation.customers?.name,
        conversation.customers?.phone,
        conversation.branches?.name,
        lastMessage?.message,
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [conversations, conversationSearch, lastMessages]);

  const resetForm = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
  };

  const editReply = (reply: QuickReply) => {
    setEditingId(reply.id);
    setForm({
      short_name: reply.short_name || "",
      message: reply.message || "",
      icon: reply.icon || "",
      branch_id: reply.branch_id || "",
      position: String(reply.position || 0),
      is_active: reply.is_active,
    });
    setTab("quick");
  };

  const saveReply = async () => {
    if (!tenantId || !form.short_name.trim() || !form.message.trim()) {
      setNotice("Completá nombre corto y mensaje.");
      return;
    }

    const payload = {
      tenant_id: tenantId,
      branch_id: form.branch_id || null,
      short_name: form.short_name.trim(),
      message: form.message.trim(),
      icon: form.icon.trim() || null,
      position: Number(form.position || 0),
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };

    const result = editingId
      ? await supabase.from("whatsapp_quick_replies").update(payload).eq("id", editingId)
      : await supabase.from("whatsapp_quick_replies").insert(payload);

    if (result.error) {
      setNotice(result.error.message);
      return;
    }

    setNotice(editingId ? "Mensaje actualizado." : "Mensaje creado.");
    resetForm();
    loadQuickReplies();
  };

  const deleteReply = async (id: string) => {
    if (!confirm("Eliminar este mensaje predeterminado?")) return;
    const { error } = await supabase.from("whatsapp_quick_replies").delete().eq("id", id);
    if (error) {
      setNotice(error.message);
      return;
    }
    if (editingId === id) resetForm();
    loadQuickReplies();
  };

  const toggleReply = async (reply: QuickReply) => {
    const { error } = await supabase
      .from("whatsapp_quick_replies")
      .update({ is_active: !reply.is_active, updated_at: new Date().toISOString() })
      .eq("id", reply.id);
    if (error) setNotice(error.message);
    loadQuickReplies();
  };

  if (loading) {
    return <div className="text-sm text-gray-400">Cargando WhatsApp...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-800 bg-gray-900/70 p-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-green-400">
            <MessageCircle size={18} />
            WhatsApp Center
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">
            Conversaciones y respuestas rápidas
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-400">
            Mirá los chats de clientes, buscá por número y configurá los botones cortos que van a aparecer en el WhatsApp del cashier.
          </p>
        </div>

        <div className="min-w-[220px]">
          <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Sucursal</label>
          <select
            value={selectedBranch}
            onChange={(event) => setSelectedBranch(event.target.value)}
            className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-green-400"
          >
            <option value="">Todas las sucursales</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </div>
      </div>

      {notice && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-300">
          {notice}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setTab("conversations")}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition ${tab === "conversations" ? "bg-white text-gray-950" : "bg-gray-900 text-gray-400 hover:text-white"}`}
        >
          Conversaciones
        </button>
        <button
          onClick={() => setTab("quick")}
          className={`rounded-xl px-4 py-2 text-sm font-bold transition ${tab === "quick" ? "bg-white text-gray-950" : "bg-gray-900 text-gray-400 hover:text-white"}`}
        >
          Mensajes predeterminados
        </button>
      </div>

      {tab === "conversations" ? (
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <div className="rounded-2xl border border-gray-800 bg-gray-900">
            <div className="border-b border-gray-800 p-3">
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={conversationSearch}
                  onChange={(event) => setConversationSearch(event.target.value)}
                  placeholder="Buscar por nombre, número o mensaje..."
                  className="w-full rounded-xl border border-gray-800 bg-gray-950 py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-green-500"
                />
              </div>
            </div>
            <div className="max-h-[640px] overflow-y-auto">
              {filteredConversations.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">Sin conversaciones para mostrar.</div>
              ) : filteredConversations.map((conversation) => {
                const lastMessage = lastMessages[conversation.id];
                const active = selectedConversation?.id === conversation.id;
                return (
                  <button
                    key={conversation.id}
                    onClick={() => setSelectedConversation(conversation)}
                    className={`w-full border-b border-gray-800 px-4 py-3 text-left transition ${active ? "bg-green-500/10" : "hover:bg-gray-800/70"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">
                          {conversation.customers?.name || conversation.customers?.phone || "Cliente"}
                        </p>
                        <p className="text-xs text-gray-500">{conversation.customers?.phone || "Sin teléfono"}</p>
                      </div>
                      <span className="shrink-0 text-[11px] text-gray-500">{fmtDate(conversation.last_message_at)}</span>
                    </div>
                    <p className="mt-2 line-clamp-1 text-xs text-gray-400">{previewMessage(lastMessage)}</p>
                    <p className="mt-1 text-[11px] text-gray-600">{conversation.branches?.name || "Sin sucursal"}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-900">
            {!selectedConversation ? (
              <div className="flex min-h-[520px] flex-col items-center justify-center p-8 text-center text-gray-500">
                <MessageCircle size={42} className="mb-3 opacity-60" />
                <p className="text-sm">Seleccioná una conversación para ver el detalle.</p>
              </div>
            ) : (
              <div className="flex min-h-[520px] flex-col">
                <div className="border-b border-gray-800 p-4">
                  <h2 className="text-lg font-black text-white">
                    {selectedConversation.customers?.name || "Cliente"}
                  </h2>
                  <p className="text-sm text-gray-500">{selectedConversation.customers?.phone}</p>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {conversationMessages.map((message) => {
                    const isCashier = message.sender_type === "cashier";
                    return (
                      <div key={message.id} className={`flex ${isCashier ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[78%] rounded-2xl px-4 py-3 ${isCashier ? "bg-green-500 text-black" : "bg-gray-800 text-gray-100"}`}>
                          <p className="whitespace-pre-wrap break-words text-sm">
                            {message.message || previewMessage(message)}
                          </p>
                          <p className={`mt-1 text-[10px] ${isCashier ? "text-black/60" : "text-gray-500"}`}>
                            {message.sender_type} · {fmtDate(message.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <h2 className="mb-4 text-lg font-black text-white">
              {editingId ? "Editar mensaje" : "Nuevo mensaje"}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Nombre corto</label>
                <input
                  value={form.short_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, short_name: event.target.value }))}
                  placeholder="Ej: En camino"
                  className="w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-green-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Icono</label>
                <input
                  value={form.icon}
                  onChange={(event) => setForm((prev) => ({ ...prev, icon: event.target.value.slice(0, 4) }))}
                  placeholder="Ej: ✅"
                  className="w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-green-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Sucursal</label>
                <select
                  value={form.branch_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, branch_id: event.target.value }))}
                  className="w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-green-500"
                >
                  <option value="">Todas las sucursales</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Orden</label>
                <input
                  type="number"
                  value={form.position}
                  onChange={(event) => setForm((prev) => ({ ...prev, position: event.target.value }))}
                  className="w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-green-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase text-gray-500">Mensaje</label>
                <textarea
                  value={form.message}
                  onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
                  rows={5}
                  placeholder="Hola! Tu pedido ya está listo para retirar."
                  className="w-full resize-none rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-green-500"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                />
                Activo
              </label>
              <div className="flex gap-2">
                <button onClick={saveReply} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-500 px-4 py-3 text-sm font-black text-black transition hover:bg-green-400">
                  <Save size={17} />
                  Guardar
                </button>
                {editingId && (
                  <button onClick={resetForm} className="rounded-xl border border-gray-700 px-4 py-3 text-sm font-bold text-gray-300 transition hover:bg-gray-800">
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-800 p-4">
              <div>
                <h2 className="text-lg font-black text-white">Botones del cashier</h2>
                <p className="text-sm text-gray-500">Nombre corto + icono visible como botón rápido.</p>
              </div>
              <button onClick={resetForm} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-gray-950">
                <Plus size={16} />
                Nuevo
              </button>
            </div>
            <div className="divide-y divide-gray-800">
              {quickReplies.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">Todavía no hay mensajes configurados.</div>
              ) : quickReplies.map((reply) => (
                <div key={reply.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between">
                  <button onClick={() => editReply(reply)} className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-gray-800 px-3 py-1 text-sm font-black text-white">
                        {reply.icon ? `${reply.icon} ` : ""}{reply.short_name}
                      </span>
                      {!reply.is_active && <span className="rounded-full bg-red-500/15 px-2 py-1 text-[11px] font-bold text-red-300">Inactivo</span>}
                      <span className="text-xs text-gray-600">
                        {reply.branch_id ? branches.find((branch) => branch.id === reply.branch_id)?.name || "Sucursal" : "Todas"}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-gray-400">{reply.message}</p>
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => toggleReply(reply)} className="rounded-lg border border-gray-700 p-2 text-gray-300 hover:bg-gray-800" title={reply.is_active ? "Desactivar" : "Activar"}>
                      {reply.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    </button>
                    <button onClick={() => deleteReply(reply.id)} className="rounded-lg border border-red-500/30 p-2 text-red-300 hover:bg-red-500/10" title="Eliminar">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
