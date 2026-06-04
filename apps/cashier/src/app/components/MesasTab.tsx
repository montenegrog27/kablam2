"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { useCurrentBranch } from "../(cashier)/context/BranchContext";
import { X, Plus, Minus, Check, Search, Users, CreditCard, DollarSign } from "lucide-react";

type TableData = {
  id: string; number: number; capacity: number; shape: string;
  pos_x: number; pos_y: number; width: number; height: number; rotation: number;
};

type SessionData = {
  id: string; table_id: string; status: string; customer_count: number;
  total: number; opened_at: string; order_id: string | null;
};

export default function MesasTab() {
  const { branchId, tenantId } = useCurrentBranch();
  const [tables, setTables] = useState<TableData[]>([]);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [cart, setCart] = useState<any[]>([]);
  const [customerCount, setCustomerCount] = useState(1);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [selPayment, setSelPayment] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => { if (branchId) load(); }, [branchId]);

  const load = async () => {
    if (!branchId || !tenantId) return;
    const [{ data: t }, { data: s }, { data: pm }] = await Promise.all([
      supabase.from("tables").select("*").eq("branch_id", branchId).eq("is_active", true).order("number"),
      supabase.from("table_sessions").select("*").in("status", ["open", "paying"]),
      supabase.from("payment_methods").select("*").eq("is_active", true).or(`tenant_id.eq.${tenantId},tenant_id.is.null`),
    ]);
    setTables(t || []);
    setSessions(s || []);
    setPaymentMethods(pm || []);

    const { data: prods } = await supabase.from("products").select("*, product_variants(*)").eq("branch_id", branchId);
    setProducts(prods || []);
  };

  const getSession = (tableId: string) => sessions.find((s) => s.table_id === tableId);

  const getStatus = (tableId: string) => {
    const s = getSession(tableId);
    if (!s) return "free";
    return s.status === "paying" ? "paying" : "occupied";
  };

  const openTable = async (table: TableData) => {
    const existing = getSession(table.id);
    if (existing) { setSelectedTable(table.id); setCart([]); setCustomerCount(existing.customer_count || 1); return; }
    setSelectedTable(table.id); setCart([]); setCustomerCount(1);
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

  const addToCart = (product: any) => {
    const variant = product.product_variants?.find((v: any) => v.is_default) || product.product_variants?.[0];
    if (!variant) return;
    setCart((prev) => {
      const existing = prev.find((item) => item.variant_id === variant.id);
      if (existing) return prev.map((item) => item.variant_id === variant.id ? { ...item, qty: item.qty + 1 } : item);
      return [...prev, { variant_id: variant.id, product_id: variant.product_id || product.id, name: product.name, price: variant.price, qty: 1 }];
    });
  };

  const updateQty = (variantId: string, delta: number) => {
    setCart((prev) => prev.map((item) => item.variant_id === variantId ? { ...item, qty: Math.max(0, item.qty + delta) } : item).filter((item) => item.qty > 0));
  };

  const subtotal = cart.reduce((s, item) => s + item.price * item.qty, 0);

  const markPaying = async () => {
    const session = getSession(selectedTable!);
    if (!session) return;
    await supabase.from("table_sessions").update({ status: "paying", total: subtotal }).eq("id", session.id);
    setSessions(sessions.map((s) => s.id === session.id ? { ...s, status: "paying", total: subtotal } : s));
    setShowPayment(true);
  };

  const payTable = async () => {
    if (!selPayment || !selectedTable) return;
    const session = getSession(selectedTable);
    if (!session) return;
    setLoading(true);

    const { data: order } = await supabase.from("orders").insert({
      tenant_id: tenantId, branch_id: branchId, status: "delivered",
      type: "takeaway", sales_channel: "cashier",
      customer_name: `Mesa ${tables.find((t) => t.id === selectedTable)?.number}`,
      subtotal, total: subtotal, paid_amount: subtotal, is_paid: true,
      cash_session_id: null,
    }).select().single();

    if (order) {
      await supabase.from("order_items").insert(cart.map((item) => ({
        order_id: order.id, product_id: item.product_id, variant_id: item.variant_id,
        quantity: item.qty, unit_price: item.price, total: item.price * item.qty,
      })));
      await supabase.from("order_payments").insert({ order_id: order.id, payment_method_id: selPayment, amount: subtotal, reference: paymentRef || null });
      await supabase.from("table_sessions").update({ status: "closed", order_id: order.id, closed_at: new Date().toISOString() }).eq("id", session.id);
    }

    setSessions(sessions.filter((s) => s.id !== session.id));
    setSelectedTable(null); setCart([]); setShowPayment(false); setSelPayment(""); setPaymentRef("");
    setLoading(false);
  };

  const statusColors: Record<string, string> = {
    free: "bg-gray-700 border-gray-600 hover:border-gray-500",
    occupied: "bg-red-600/20 border-red-500 hover:border-red-400",
    paying: "bg-blue-600/20 border-blue-500",
  };

  const filteredProducts = products.filter((p) =>
    !searchTerm || p.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full flex bg-gray-950">
      {/* Floor plan */}
      <div className="flex-1 relative overflow-auto p-6">
        <div className="relative w-full" style={{ minHeight: "70vh" }}>
          {tables.map((table) => {
            const status = getStatus(table.id);
            const session = getSession(table.id);
            return (
              <button
                key={table.id}
                onClick={() => openTable(table)}
                className={`absolute flex flex-col items-center justify-center border-2 transition-all cursor-pointer ${
                  table.shape === "round" ? "rounded-full" : "rounded-xl"
                } ${statusColors[status]} ${selectedTable === table.id ? "ring-2 ring-white" : ""}`}
                style={{
                  left: table.pos_x, top: table.pos_y,
                  width: table.width, height: table.height,
                  transform: `rotate(${table.rotation}deg)`,
                }}
              >
                <span className="text-lg font-bold text-white">{table.number}</span>
                <span className="text-[10px] text-gray-400">
                  {status === "free" ? `${table.capacity} pers` :
                   status === "paying" ? "💰 Pagando" :
                   `🟢 $${Math.round(session?.total || 0).toLocaleString("es-AR")}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Side panel */}
      {selectedTable && (
        <div className="w-96 bg-gray-900 border-l border-gray-700 flex flex-col">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Mesa {tables.find((t) => t.id === selectedTable)?.number}</h3>
              <p className="text-xs text-gray-500">{getStatus(selectedTable) === "free" ? "Libre" : "Ocupada"}</p>
            </div>
            <button onClick={() => { setSelectedTable(null); setShowPayment(false); }} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400"><X size={18} /></button>
          </div>

          {/* Customers + Open session */}
          {getStatus(selectedTable) === "free" && (
            <div className="p-5 space-y-4 border-b border-gray-700">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Comensales</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setCustomerCount(Math.max(1, customerCount - 1))} className="w-8 h-8 rounded-lg bg-gray-800 text-gray-300 flex items-center justify-center hover:bg-gray-700"><Minus size={14} /></button>
                  <span className="text-lg font-bold text-white w-8 text-center">{customerCount}</span>
                  <button onClick={() => setCustomerCount(Math.min(20, customerCount + 1))} className="w-8 h-8 rounded-lg bg-gray-800 text-gray-300 flex items-center justify-center hover:bg-gray-700"><Plus size={14} /></button>
                </div>
              </div>
              <button onClick={startSession} disabled={loading} className="w-full py-3 bg-emerald-700 text-white rounded-xl font-bold hover:bg-emerald-600 transition disabled:opacity-40">
                Abrir mesa
              </button>
            </div>
          )}

          {/* Product search + cart */}
          {(getStatus(selectedTable) === "occupied" || getStatus(selectedTable) === "paying") && (
            <>
              <div className="p-3 border-b border-gray-700">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-100 placeholder-gray-500"
                    placeholder="Buscar producto..." />
                </div>
              </div>

              {/* Product grid */}
              <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2 content-start">
                {filteredProducts.slice(0, 20).map((p) => {
                  const variant = p.product_variants?.find((v: any) => v.is_default) || p.product_variants?.[0];
                  return (
                    <button key={p.id} onClick={() => addToCart(p)}
                      className="bg-gray-800 rounded-xl p-3 text-left hover:bg-gray-750 transition border border-gray-700 text-sm">
                      <p className="font-semibold text-gray-100 truncate">{p.name}</p>
                      {variant && <p className="text-xs text-gray-400 mt-1">${Number(variant.price).toLocaleString("es-AR")}</p>}
                    </button>
                  );
                })}
              </div>

              {/* Cart + actions */}
              <div className="border-t border-gray-700 p-4 space-y-3">
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {cart.map((item) => (
                    <div key={item.variant_id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-300 truncate flex-1">{item.name}</span>
                      <div className="flex items-center gap-2 ml-2">
                        <button onClick={() => updateQty(item.variant_id, -1)} className="w-6 h-6 rounded bg-gray-800 text-gray-400 flex items-center justify-center hover:bg-gray-700"><Minus size={10} /></button>
                        <span className="text-white font-bold w-5 text-center">{item.qty}</span>
                        <button onClick={() => updateQty(item.variant_id, 1)} className="w-6 h-6 rounded bg-gray-800 text-gray-400 flex items-center justify-center hover:bg-gray-700"><Plus size={10} /></button>
                      </div>
                      <span className="text-gray-400 tabular-nums ml-2 w-16 text-right">${(item.price * item.qty).toLocaleString("es-AR")}</span>
                    </div>
                  ))}
                </div>

                {getStatus(selectedTable) === "occupied" && (
                  <>
                    <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-gray-700">
                      <span>Total</span>
                      <span>${subtotal.toLocaleString("es-AR")}</span>
                    </div>
                    <button onClick={markPaying} disabled={cart.length === 0}
                      className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition disabled:opacity-40 flex items-center justify-center gap-2">
                      <CreditCard size={16} /> Pedir cuenta
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {/* Payment modal */}
          {showPayment && (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
              <div className="bg-gray-900 rounded-2xl max-w-md w-full p-6 space-y-4">
                <h3 className="text-lg font-bold text-white">Cobrar Mesa {tables.find((t) => t.id === selectedTable)?.number}</h3>
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
                  <button onClick={() => { setShowPayment(false); setSelPayment(""); }} className="flex-1 py-3 border border-gray-700 rounded-xl text-sm text-gray-400 hover:bg-gray-800">Cancelar</button>
                  <button onClick={payTable} disabled={!selPayment || loading}
                    className="flex-1 py-3 bg-emerald-700 text-white rounded-xl font-bold hover:bg-emerald-600 disabled:opacity-40 flex items-center justify-center gap-2">
                    <DollarSign size={16} /> Cobrar ${subtotal.toLocaleString("es-AR")}
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
