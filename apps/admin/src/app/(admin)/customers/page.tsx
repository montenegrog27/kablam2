"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { MessageSquare, Package, Search, X } from "lucide-react";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [tab, setTab] = useState<"orders" | "messages">("orders");
  const [orders, setOrders] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!userRecord) return;
    setTenantId(userRecord.tenant_id);

    const { data } = await supabase
      .from("customers")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id)
      .order("created_at", { ascending: false });

    setCustomers(data || []);
    setLoading(false);
  };

  const selectCustomer = async (customer: any) => {
    setSelected(customer);
    setTab("orders");
    setOrders([]);
    setMessages([]);

    // Cargar pedidos
    const { data: orderData } = await supabase
      .from("orders")
      .select("*")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(20);

    setOrders(orderData || []);

    // Cargar conversación + mensajes
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("customer_id", customer.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (conv) {
      const { data: msgData } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(50);

      setMessages(msgData || []);
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      unconfirmed: "bg-gray-100 text-gray-600",
      confirmed: "bg-amber-100 text-amber-700",
      preparing: "bg-blue-100 text-blue-700",
      ready: "bg-emerald-100 text-emerald-700",
      sent: "bg-purple-100 text-purple-700",
      delivered: "bg-green-100 text-green-700",
      cancelled: "bg-red-100 text-red-600",
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full ${colors[status] || "bg-gray-100"}`}>
        {status}
      </span>
    );
  };

  const filtered = customers.filter(
    (c) =>
      !search ||
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search),
  );

  if (loading) {
    return <div className="p-6 text-gray-500">Cargando...</div>;
  }

  return (
    <div className="flex h-screen">
      {/* Lista de clientes */}
      <div className="w-96 border-r overflow-y-auto flex-shrink-0">
        <div className="p-4 border-b sticky top-0 bg-white z-10">
          <h1 className="text-xl font-bold mb-3">Clientes</h1>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o teléfono..."
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            {search ? "Sin resultados" : "No hay clientes"}
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => selectCustomer(c)}
                className={`w-full text-left p-4 hover:bg-gray-50 transition ${
                  selected?.id === c.id ? "bg-blue-50" : ""
                }`}
              >
                <div className="font-medium text-sm truncate">
                  {c.name || "Sin nombre"}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{c.phone}</div>
                {c.address && (
                  <div className="text-xs text-gray-400 truncate mt-0.5">
                    {c.address}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detalle */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Package size={40} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">Seleccioná un cliente</p>
            </div>
          </div>
        ) : (
          <div>
            {/* Header */}
            <div className="p-6 border-b bg-white">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-xl font-bold">{selected.name || "Sin nombre"}</h2>
                  <p className="text-sm text-gray-500 mt-1">{selected.phone}</p>
                  {selected.address && (
                    <p className="text-sm text-gray-500">{selected.address}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Cliente desde {new Date(selected.created_at).toLocaleDateString("es-AR")}
                  </p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="p-2 rounded-full hover:bg-gray-100"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-4 mt-4 border-b">
                <button
                  onClick={() => setTab("orders")}
                  className={`pb-2 text-sm font-medium border-b-2 transition ${
                    tab === "orders"
                      ? "border-black text-black"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Pedidos ({orders.length})
                </button>
                <button
                  onClick={() => setTab("messages")}
                  className={`pb-2 text-sm font-medium border-b-2 transition ${
                    tab === "messages"
                      ? "border-black text-black"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Conversación ({messages.length})
                </button>
              </div>
            </div>

            {/* Pedidos */}
            {tab === "orders" && (
              <div className="p-6 space-y-3">
                {orders.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">
                    Sin pedidos
                  </p>
                ) : (
                  orders.map((order) => (
                    <div
                      key={order.id}
                      className="border rounded-lg p-4 space-y-2"
                    >
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">
                          #{order.id.slice(0, 8)}
                        </span>
                        {statusBadge(order.status)}
                      </div>
                      <div className="text-sm text-gray-600">
                        {order.type === "delivery" ? "Delivery" : "Takeaway"} • $
                        {order.total?.toLocaleString("es-AR")}
                      </div>
                      {order.address && (
                        <div className="text-xs text-gray-500">
                          {order.address}
                        </div>
                      )}
                      <div className="text-xs text-gray-400">
                        {new Date(order.created_at).toLocaleString("es-AR")}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Mensajes */}
            {tab === "messages" && (
              <div className="p-6 space-y-3">
                {messages.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">
                    Sin mensajes
                  </p>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender_type === "cashier" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-xl px-4 py-2 text-sm ${
                          msg.sender_type === "cashier"
                            ? "bg-green-500 text-white"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {msg.media_url && (
                          <div className="mb-1">
                            {msg.media_type?.startsWith("image") ? (
                              <img
                                src={msg.media_url}
                                alt=""
                                className="rounded max-w-full max-h-32 object-cover"
                              />
                            ) : (
                              <a
                                href={msg.media_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline text-blue-500"
                              >
                                {msg.media_type}
                              </a>
                            )}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap">{msg.message}</p>
                        <p
                          className={`text-[10px] mt-1 ${
                            msg.sender_type === "cashier"
                              ? "text-green-100"
                              : "text-gray-400"
                          }`}
                        >
                          {new Date(msg.created_at).toLocaleString("es-AR")}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}