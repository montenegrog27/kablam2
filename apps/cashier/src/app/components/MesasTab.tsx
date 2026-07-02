"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { useCurrentBranch } from "../(cashier)/context/BranchContext";
import { X, Plus, Minus, Check, Search, DollarSign, Printer, ArrowLeft, ChefHat, BellRing } from "lucide-react";

export default function MesasTab() {
  const { branchId, tenantId } = useCurrentBranch();
  const [tables, setTables] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [floorObjects, setFloorObjects] = useState<any[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [pendingCart, setPendingCart] = useState<any[]>([]);
  const [confirmedItems, setConfirmedItems] = useState<any[]>([]);
  const [customerCount, setCustomerCount] = useState(1);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [selPayment, setSelPayment] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [localOrderId, setLocalOrderId] = useState<string | null>(null);

  useEffect(() => { if (branchId) load(); }, [branchId]);

  useEffect(() => {
    if (!branchId || !tenantId) return;
    const interval = window.setInterval(() => {
      void load();
    }, 8000);
    return () => window.clearInterval(interval);
  }, [branchId, tenantId]);

  useEffect(() => {
    if (!branchId) return;
    const channel = supabase
      .channel(`cashier-tables-${branchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        if ((payload.new as any)?.branch_id === branchId || (payload.old as any)?.branch_id === branchId) void load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "table_sessions" }, () => {
        void load();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [branchId]);

  const load = async () => {
    if (!branchId || !tenantId) return;
    const [{ data: t }, { data: pm }, { data: fo }] = await Promise.all([
      supabase.from("tables").select("*").eq("branch_id", branchId).eq("is_active", true).order("number"),
      supabase.from("payment_methods").select("*").eq("is_active", true).or(`tenant_id.eq.${tenantId},tenant_id.is.null`),
      supabase.from("floor_objects").select("*").eq("branch_id", branchId),
    ]);
    const tableRows = t || [];
    const tableIds = tableRows.map((table: any) => table.id);
    const { data: sessionRows } = tableIds.length
      ? await supabase.from("table_sessions").select("*").in("table_id", tableIds).in("status", ["open", "paying"])
      : { data: [] };
    const orderIds = [...new Set((sessionRows || []).map((session: any) => session.order_id).filter(Boolean))];
    const { data: orderRows } = orderIds.length
      ? await supabase.from("orders").select("id, status, type, total, subtotal, customer_name, created_at").in("id", orderIds)
      : { data: [] };
    const orderById = new Map((orderRows || []).map((order: any) => [order.id, order]));
    setTables(tableRows);
    setSessions((sessionRows || []).map((session: any) => ({ ...session, order: orderById.get(session.order_id) || null })));
    setPaymentMethods(pm || []);
    setFloorObjects(fo || []);
    const { data: prods } = await supabase.from("products").select("*, product_variants(*)").eq("branch_id", branchId);
    setProducts(prods || []);
  };

  const refreshSession = useCallback(async (sessionId: string) => {
    const { data: session } = await supabase.from("table_sessions").select("*").eq("id", sessionId).single();
    if (session) setSessions((prev) => prev.map((s) => s.id === session.id ? session : s));
    return session;
  }, []);

  const getSession = (tableId: string) => sessions.find((s) => s.table_id === tableId);
  const getStatus = (tableId: string) => { const s = getSession(tableId); if (!s) return "free"; return s.status; };
  const getKitchenStatus = (tableId: string) => getSession(tableId)?.order?.status || null;
  const getVisualStatus = (tableId: string) => {
    const session = getSession(tableId);
    if (!session) return "free";
    if (session.status === "paying") return "paying";
    if (session.order?.status === "ready") return "ready";
    return "open";
  };

  const openTable = async (table: any) => {
    const session = getSession(table.id);
    setSelectedTable(table.id);
    setPendingCart([]);
    setConfirmedItems([]);
    setLocalOrderId(null);
    if (session) {
      setCustomerCount(session.customer_count || 1);
      // Load existing order items if order exists
      if (session.order_id) {
        setLocalOrderId(session.order_id);
        const { data: items } = await supabase
          .from("order_items")
          .select("*, products(name)")
          .eq("order_id", session.order_id);
        setConfirmedItems(items?.map((i: any) => ({
          variant_id: i.variant_id, product_id: i.product_id,
          name: i.products?.name || "", price: i.unit_price, qty: i.quantity, confirmed: true,
        })) || []);
      }
    }
  };

  const startSession = async () => {
    if (!selectedTable || !branchId) return;
    setLoading(true);
    const { data: session } = await supabase.from("table_sessions").insert({
      table_id: selectedTable, status: "open", customer_count: customerCount,
    }).select().single();
    if (session) setSessions([...sessions, session]);
    setLoading(false);
  };

  const addToPending = (product: any) => {
    const variant = product.product_variants?.find((v: any) => v.is_default) || product.product_variants?.[0];
    if (!variant) return;
    setPendingCart((prev) => {
      const existing = prev.find((item) => item.variant_id === variant.id);
      if (existing) return prev.map((item) => item.variant_id === variant.id ? { ...item, qty: item.qty + 1 } : item);
      return [...prev, { variant_id: variant.id, product_id: variant.product_id || product.id, name: product.name, price: variant.price, qty: 1 }];
    });
  };

  const updatePendingQty = (variantId: string, delta: number) => {
    setPendingCart((prev) => prev.map((item) => item.variant_id === variantId ? { ...item, qty: Math.max(0, item.qty + delta) } : item).filter((item) => item.qty > 0));
  };

  const acceptItems = async () => {
    if (pendingCart.length === 0 || !selectedTable) return;
    const session = getSession(selectedTable);
    if (!session) return;
    setLoading(true);

    // Create or reuse order
    let orderId = localOrderId;
    if (!orderId) {
      // Find any open cash session for this branch, or create one automatically for table service
      let { data: cashSessions } = await supabase
        .from("cash_sessions")
        .select("id")
        .eq("branch_id", branchId)
        .eq("status", "open")
        .limit(1);

      let cashSessionId = cashSessions?.[0]?.id || null;

      if (!cashSessionId) {
        // Auto-create a cash session for table service
        const { data: newSession } = await supabase
          .from("cash_sessions")
          .insert({ branch_id: branchId, tenant_id: tenantId, status: "open", opened_at: new Date().toISOString() })
          .select("id")
          .single();
        cashSessionId = newSession?.id || null;
      }

      const { data: order } = await supabase.from("orders").insert({
        tenant_id: tenantId, branch_id: branchId, status: "unconfirmed",
        type: "dine-in", sales_channel: "cashier",
        customer_name: `Mesa ${tables.find((t) => t.id === selectedTable)?.number}`,
        subtotal: 0, total: 0, paid_amount: 0, is_paid: false,
        cash_session_id: cashSessionId,
      }).select().single();
      if (order) {
        orderId = order.id;
        setLocalOrderId(orderId);
        await supabase.from("table_sessions").update({ order_id: orderId }).eq("id", session.id);
      }
    }

    if (orderId) {
      const itemsToInsert = pendingCart.map((item) => ({
        order_id: orderId, product_id: item.product_id, variant_id: item.variant_id,
        quantity: item.qty, unit_price: item.price, total: item.price * item.qty,
      }));
      await supabase.from("order_items").insert(itemsToInsert);
    }

    setConfirmedItems((prev) => [...prev, ...pendingCart.map((p) => ({ ...p, confirmed: true }))]);
    setPendingCart([]);
    setLoading(false);
  };

  const sendToKDS = async () => {
    if (!localOrderId || !selectedTable) return;
    const session = getSession(selectedTable);
    if (!session) return;
    setLoading(true);

    const allItems = [...confirmedItems, ...pendingCart];
    const subtotal = allItems.reduce((s, i) => s + i.price * i.qty, 0);

    // Update order: status confirmed (appears on KDS), recalculate total
    await supabase.from("orders").update({
      status: "confirmed", subtotal, total: subtotal, confirmed_at: new Date().toISOString(),
    }).eq("id", localOrderId);

    // Insert remaining pending items
    if (pendingCart.length > 0) {
      const itemsToInsert = pendingCart.map((item) => ({
        order_id: localOrderId, product_id: item.product_id, variant_id: item.variant_id,
        quantity: item.qty, unit_price: item.price, total: item.price * item.qty,
      }));
      await supabase.from("order_items").insert(itemsToInsert);
    }

    // Move session to paying
    await supabase.from("table_sessions").update({ status: "paying", total: subtotal }).eq("id", session.id);
    setSessions((prev) => prev.map((s) => s.id === session.id ? { ...s, status: "paying", total: subtotal } : s));
    setPendingCart([]);
    setLoading(false);
    setShowPayment(true);
  };

  const reopenTable = async () => {
    if (!selectedTable) return;
    const session = getSession(selectedTable);
    if (!session) return;
    await supabase.from("table_sessions").update({ status: "open" }).eq("id", session.id);
    setSessions((prev) => prev.map((s) => s.id === session.id ? { ...s, status: "open" } : s));
    setShowPayment(false);
  };

  const payTable = async () => {
    if (!selPayment || !selectedTable || !localOrderId) return;
    setLoading(true);
    const subtotal = [...confirmedItems, ...pendingCart].reduce((s, i) => s + i.price * i.qty, 0);
    const session = getSession(selectedTable);

    if (pendingCart.length > 0) {
      await supabase.from("order_items").insert(pendingCart.map((item) => ({
        order_id: localOrderId, product_id: item.product_id, variant_id: item.variant_id,
        quantity: item.qty, unit_price: item.price, total: item.price * item.qty,
      })));
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      alert("No hay sesion activa.");
      setLoading(false);
      return;
    }

    const statusResponse = await fetch(`/api/orders/${localOrderId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        status: "delivered",
        updates: { subtotal, total: subtotal, paid_amount: subtotal, is_paid: true },
      }),
    });
    if (!statusResponse.ok) {
      const result = await statusResponse.json();
      alert(result.details || result.error || "No se pudo cerrar la mesa.");
      setLoading(false);
      return;
    }

    await supabase.from("order_payments").insert({
      order_id: localOrderId, payment_method_id: selPayment, amount: subtotal, reference: paymentRef || null,
    });

    if (session) {
      await supabase.from("table_sessions").update({
        status: "closed", closed_at: new Date().toISOString(),
      }).eq("id", session.id);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
    }

    setSelectedTable(null); setPendingCart([]); setConfirmedItems([]);
    setShowPayment(false); setSelPayment(""); setPaymentRef(""); setLocalOrderId(null);
    setLoading(false);
  };

  const allCartItems = [...confirmedItems, ...pendingCart];
  const subtotal = allCartItems.reduce((s, i) => s + i.price * i.qty, 0);

  const statusColors: Record<string, string> = {
    free: "bg-gray-700 border-gray-600 hover:border-gray-500",
    open: "bg-red-600/20 border-red-500 hover:border-red-400",
    ready: "bg-emerald-600/25 border-emerald-400 hover:border-emerald-300",
    paying: "bg-blue-600/20 border-blue-500",
  };

  const kitchenTableSessions = useMemo(
    () => sessions.filter((session) => ["preparing", "ready"].includes(session.order?.status)),
    [sessions],
  );

  const filteredProducts = products.filter((p) =>
    !searchTerm || p.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full flex bg-gray-950">
      <aside className="hidden w-80 shrink-0 border-r border-gray-800 bg-gray-950 xl:flex xl:flex-col">
        <div className="border-b border-gray-800 p-4">
          <div className="flex items-center gap-2 text-white">
            <ChefHat size={18} className="text-emerald-300" />
            <h3 className="font-black">Pedidos de mesas</h3>
          </div>
          <p className="mt-1 text-xs text-gray-500">En preparacion y listos para llevar a mesa.</p>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {kitchenTableSessions.length === 0 && (
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 text-sm text-gray-500">
              No hay pedidos de mesa en cocina.
            </div>
          )}
          {kitchenTableSessions.map((session) => {
            const table = tables.find((item) => item.id === session.table_id);
            const ready = session.order?.status === "ready";
            return (
              <button
                key={session.id}
                onClick={() => table && openTable(table)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  ready
                    ? "border-emerald-500/50 bg-emerald-500/10"
                    : "border-red-500/40 bg-red-500/10"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-lg font-black text-white">Mesa {table?.number || "-"}</p>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${ready ? "bg-emerald-400 text-gray-950" : "bg-red-500 text-white"}`}>
                    {ready ? "Listo" : "Preparando"}
                  </span>
                </div>
                <p className="mt-2 text-sm font-bold text-gray-300">
                  ${Math.round(Number(session.total || session.order?.total || 0)).toLocaleString("es-AR")}
                </p>
                {ready && (
                  <p className="mt-2 flex items-center gap-1 text-xs font-bold text-emerald-300">
                    <BellRing size={13} />
                    Avisar y llevar a mesa
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Floor plan */}
      <div className="flex-1 relative overflow-auto p-6">
        <div className="relative w-full" style={{ minHeight: "70vh" }}>
          {floorObjects.map((obj) => (
            <div key={obj.id} className={`absolute pointer-events-none flex items-center justify-center ${obj.type === "wall" ? "rounded-sm" : obj.type === "column" ? "rounded-full" : "rounded-lg"}`}
              style={{
                left: Number(obj.pos_x), top: Number(obj.pos_y),
                width: Number(obj.width), height: Number(obj.height),
                background: obj.type === "wall" || obj.type === "counter" || obj.type === "column" ? (
                  obj.type === "counter" ? "#92400E" : obj.type === "wall" ? "#4B5563" : "#6B7280"
                ) : "transparent",
                transform: `rotate(${Number(obj.rotation)}deg)`,
              }}>
              {obj.type === "tree" && <span className="text-2xl">ðŸŒ´</span>}
              {obj.type === "decoration" && <span className="text-xl">ðŸŽ</span>}
              {obj.type === "counter" && <span className="text-amber-600 text-xs font-bold uppercase tracking-widest">BARRA</span>}
            </div>
          ))}
          {tables.map((table) => {
            const status = getVisualStatus(table.id);
            const session = getSession(table.id);
            const kitchenStatus = getKitchenStatus(table.id);
            return (
              <button key={table.id} onClick={() => openTable(table)}
                className={`absolute flex flex-col items-center justify-center border-2 transition-all cursor-pointer ${
                  table.shape === "round" ? "rounded-full" : "rounded-xl"
                } ${statusColors[status]} ${selectedTable === table.id ? "ring-2 ring-white" : ""}`}
                style={{ left: table.pos_x, top: table.pos_y, width: table.width, height: table.height, transform: `rotate(${table.rotation}deg)` }}>
                <span className="text-lg font-bold text-white">{table.number}</span>
                <span className="text-[10px] text-gray-400">
                  {status === "free" ? `${table.capacity} pers` :
                   status === "paying" ? "Cobrando" :
                   status === "ready" ? "Listo" :
                   `$${Math.round(session?.total || 0).toLocaleString("es-AR")}`}
                </span>
                {kitchenStatus === "preparing" && <span className="mt-0.5 text-[9px] font-black uppercase text-red-200">Cocina</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Side panel */}
      {selectedTable && (
        <div className="w-96 bg-gray-900 border-l border-gray-700 flex flex-col">
          <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Mesa {tables.find((t) => t.id === selectedTable)?.number}</h3>
              <p className="text-xs text-gray-500">{getStatus(selectedTable) === "free" ? "Libre" : getStatus(selectedTable) === "paying" ? "Cobrando" : "Ocupada"} · ${subtotal.toLocaleString("es-AR")}</p>
            </div>
            <button onClick={() => { setSelectedTable(null); setShowPayment(false); }} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400"><X size={18} /></button>
          </div>

          {/* Free: open session */}
          {getStatus(selectedTable) === "free" && (
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Comensales</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setCustomerCount(Math.max(1, customerCount - 1))} className="w-8 h-8 rounded-lg bg-gray-800 text-gray-300 flex items-center justify-center hover:bg-gray-700"><Minus size={14} /></button>
                  <span className="text-lg font-bold text-white w-8 text-center">{customerCount}</span>
                  <button onClick={() => setCustomerCount(Math.min(20, customerCount + 1))} className="w-8 h-8 rounded-lg bg-gray-800 text-gray-300 flex items-center justify-center hover:bg-gray-700"><Plus size={14} /></button>
                </div>
              </div>
              <button onClick={startSession} disabled={loading} className="w-full py-3 bg-emerald-700 text-white rounded-xl font-bold hover:bg-emerald-600 transition disabled:opacity-40">Abrir mesa</button>
            </div>
          )}

          {/* Open / Paying: product search + cart */}
          {(getStatus(selectedTable) === "open" || getStatus(selectedTable) === "paying") && (
            <>
              <div className="p-3 border-b border-gray-700">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-100 placeholder-gray-500" placeholder="Buscar producto..." />
                </div>
              </div>

              {/* Confirmed items summary */}
              {confirmedItems.length > 0 && (
                <div className="px-3 pt-3 pb-1 border-b border-gray-800">
                  <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">En mesa ({confirmedItems.reduce((s, i) => s + i.qty, 0)} items)</p>
                </div>
              )}

              {/* Product grid */}
              {getStatus(selectedTable) === "open" && (
                <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2 content-start">
                  {filteredProducts.slice(0, 20).map((p) => {
                    const variant = p.product_variants?.find((v: any) => v.is_default) || p.product_variants?.[0];
                    return (
                      <button key={p.id} onClick={() => addToPending(p)}
                        className="bg-gray-800 rounded-xl p-3 text-left hover:bg-gray-750 transition border border-gray-700 text-sm">
                        <p className="font-semibold text-gray-100 truncate">{p.name}</p>
                        {variant && <p className="text-xs text-gray-400 mt-1">${Number(variant.price).toLocaleString("es-AR")}</p>}
                      </button>
                    );
                  })}
                </div>
              )}
              {getStatus(selectedTable) === "paying" && (
                <div className="flex-1 flex items-center justify-center text-gray-600 text-sm px-6 text-center">
                  Mesa en estado cobrando. Podes volver a abrirla para agregar mas productos o cerrarla con metodo de pago.
                </div>
              )}

              {/* Cart + actions */}
              <div className="border-t border-gray-700 p-4 space-y-3">
                {/* Confirmed items */}
                {confirmedItems.map((item, i) => (
                  <div key={`c-${item.variant_id}-${i}`} className="flex items-center justify-between text-sm">
                    <span className="text-gray-400 truncate flex-1"><Check size={12} className="text-emerald-500 inline mr-1" />{item.name}</span>
                    <span className="text-gray-500 tabular-nums ml-2">{item.qty}x</span>
                    <span className="text-gray-500 tabular-nums ml-2 w-16 text-right">${(item.price * item.qty).toLocaleString("es-AR")}</span>
                  </div>
                ))}
                {/* Pending items */}
                {pendingCart.map((item) => (
                  <div key={item.variant_id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300 truncate flex-1">{item.name}</span>
                    <div className="flex items-center gap-2 ml-2">
                      <button onClick={() => updatePendingQty(item.variant_id, -1)} className="w-6 h-6 rounded bg-gray-800 text-gray-400 flex items-center justify-center hover:bg-gray-700"><Minus size={10} /></button>
                      <span className="text-white font-bold w-5 text-center">{item.qty}</span>
                      <button onClick={() => updatePendingQty(item.variant_id, 1)} className="w-6 h-6 rounded bg-gray-800 text-gray-400 flex items-center justify-center hover:bg-gray-700"><Plus size={10} /></button>
                    </div>
                    <span className="text-gray-400 tabular-nums ml-2 w-16 text-right">${(item.price * item.qty).toLocaleString("es-AR")}</span>
                  </div>
                ))}

                <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-gray-700">
                  <span>Total</span>
                  <span>${subtotal.toLocaleString("es-AR")}</span>
                </div>

                {getStatus(selectedTable) === "open" && (
                  <div className="flex gap-2">
                    <button onClick={acceptItems} disabled={pendingCart.length === 0 || loading}
                      className="flex-1 py-3 bg-emerald-700 text-white rounded-xl font-bold hover:bg-emerald-600 transition disabled:opacity-40 flex items-center justify-center gap-2">
                      <Check size={16} /> Aceptar
                    </button>
                    <button onClick={sendToKDS} disabled={confirmedItems.length === 0 || loading}
                      className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition disabled:opacity-40 flex items-center justify-center gap-2">
                      <Printer size={16} /> Imprimir
                    </button>
                  </div>
                )}

                {getStatus(selectedTable) === "paying" && (
                  <div className="flex gap-2">
                    <button onClick={reopenTable} className="flex-1 py-3 bg-amber-700 text-white rounded-xl font-bold hover:bg-amber-600 transition flex items-center justify-center gap-2">
                      <ArrowLeft size={16} /> Volver a abrir
                    </button>
                    <button onClick={() => setShowPayment(true)} disabled={loading}
                      className="flex-1 py-3 bg-emerald-700 text-white rounded-xl font-bold hover:bg-emerald-600 transition disabled:opacity-40 flex items-center justify-center gap-2"><DollarSign size={16} /> Cerrar mesa</button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Payment modal */}
          {showPayment && (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
              <div className="bg-gray-900 rounded-2xl max-w-md w-full p-6 space-y-4">
                <h3 className="text-lg font-bold text-white">Cerrar mesa {tables.find((t) => t.id === selectedTable)?.number}</h3>
                <p className="text-3xl font-black text-emerald-400 text-center">${subtotal.toLocaleString("es-AR")}</p>
                <div className="space-y-2">
                  {paymentMethods.map((pm) => (
                    <button key={pm.id} onClick={() => setSelPayment(pm.id)}
                      className={`w-full text-left px-4 py-3 rounded-xl border-2 transition flex items-center gap-3 ${
                        selPayment === pm.id ? "border-emerald-500 bg-emerald-900/20" : "border-gray-700 hover:border-gray-600"
                      }`}>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selPayment === pm.id ? "border-emerald-500" : "border-gray-500"}`}>
                        {selPayment === pm.id && <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />}
                      </div>
                      <span className="text-sm font-medium text-gray-100">{pm.name}</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setShowPayment(false); }} className="flex-1 py-3 border border-gray-700 rounded-xl text-sm text-gray-400 hover:bg-gray-800">Cancelar</button>
                  <button onClick={payTable} disabled={!selPayment || loading}
                    className="flex-1 py-3 bg-emerald-700 text-white rounded-xl font-bold hover:bg-emerald-600 disabled:opacity-40 flex items-center justify-center gap-2">
                    <DollarSign size={16} /> Cerrar mesa ${subtotal.toLocaleString("es-AR")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}




