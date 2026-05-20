"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Plus, Trash2, Package, X } from "lucide-react";

export default function PurchasesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [supplierId, setSupplierId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [description, setDescription] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [purchaseItems, setPurchaseItems] = useState<Array<{ ingredient_id: string; name: string; quantity: number; unit_cost: number }>>([]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: r } = await supabase.from("users").select("tenant_id, branch_id").eq("id", u.user.id).single();
    if (!r) return;
    setTenantId(r.tenant_id); setBranchId(r.branch_id);
    const [{ data: p }, { data: s }, { data: c }, { data: i }] = await Promise.all([
      supabase.from("purchases").select("*, suppliers(name), purchase_categories(name), purchase_items(*, ingredients(name))").eq("tenant_id", r.tenant_id).order("purchase_date", { ascending: false }),
      supabase.from("suppliers").select("*").eq("tenant_id", r.tenant_id).eq("is_active", true).order("name"),
      supabase.from("purchase_categories").select("*").eq("tenant_id", r.tenant_id).eq("is_active", true).order("name"),
      supabase.from("ingredients").select("*").eq("tenant_id", r.tenant_id).order("name"),
    ]);
    setItems(p || []); setSuppliers(s || []); setCats(c || []); setIngredients(i || []);
  };

  const addItem = () => {
    setPurchaseItems([...purchaseItems, { ingredient_id: "", name: "", quantity: 1, unit_cost: 0 }]);
  };

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...purchaseItems];
    (updated[idx] as any)[field] = value;
    if (field === "ingredient_id") {
      const ing = ingredients.find((x) => x.id === value);
      updated[idx].name = ing?.name || "";
    }
    setPurchaseItems(updated);
  };

  const removeItem = (idx: number) => {
    setPurchaseItems(purchaseItems.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!tenantId || purchaseItems.length === 0) return;
    const sub = purchaseItems.reduce((sum, pi) => sum + pi.quantity * pi.unit_cost, 0);

    const { data: purchase, error } = await supabase.from("purchases").insert({
      tenant_id: tenantId, branch_id: branchId, supplier_id: supplierId || null,
      category_id: categoryId || null, invoice_number: invoiceNumber || null,
      description, subtotal: sub, total: sub, status: "completed",
      purchase_date: purchaseDate, notes: notes || null,
    }).select().single();

    if (error || !purchase) { alert(error?.message); return; }

    for (const pi of purchaseItems) {
      await supabase.from("purchase_items").insert({
        purchase_id: purchase.id, ingredient_id: pi.ingredient_id,
        quantity: pi.quantity, unit_cost: pi.unit_cost, total: pi.quantity * pi.unit_cost,
      });
      // Update ingredient stock
      const { data: ing } = await supabase.from("ingredients").select("stock").eq("id", pi.ingredient_id).single();
      if (ing) {
        await supabase.from("ingredients").update({ stock: (ing.stock || 0) + pi.quantity }).eq("id", pi.ingredient_id);
      }
    }

    setShowForm(false); setSupplierId(""); setCategoryId(""); setInvoiceNumber("");
    setDescription(""); setNotes(""); setPurchaseItems([]);
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Compras</h1>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black text-sm font-medium transition border border-gray-700">
          <Plus size={16} /> Nueva compra
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <select className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Proveedor</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Categoría</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Factura N°" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            <input type="date" className="border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            <div className="col-span-2">
              <input className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-300">Items de la compra</span>
              <button type="button" onClick={addItem} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"><Plus size={12} /> Agregar item</button>
            </div>
            <div className="space-y-2">
              {purchaseItems.map((pi, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <select className="flex-1 border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100" value={pi.ingredient_id} onChange={(e) => updateItem(idx, "ingredient_id", e.target.value)}>
                    <option value="">Seleccionar ingrediente</option>
                    {ingredients.map((ing) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
                  </select>
                  <input type="number" className="w-20 border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100" placeholder="Cant" value={pi.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} />
                  <input type="number" step="0.01" className="w-24 border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Costo u." value={pi.unit_cost} onChange={(e) => updateItem(idx, "unit_cost", Number(e.target.value))} />
                  <span className="text-sm text-gray-400 min-w-[60px] text-right">${(pi.quantity * pi.unit_cost).toLocaleString("es-AR")}</span>
                  <button type="button" onClick={() => removeItem(idx)} className="p-1 text-red-400 hover:text-red-300"><X size={16} /></button>
                </div>
              ))}
              {purchaseItems.length === 0 && <p className="text-xs text-gray-500 text-center py-2">Agregá items a la compra</p>}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-gray-700 pt-3">
            <span className="text-sm text-gray-300">Total: <strong className="text-gray-100">${purchaseItems.reduce((s, pi) => s + pi.quantity * pi.unit_cost, 0).toLocaleString("es-AR")}</strong></span>
            <button className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm hover:bg-emerald-600">Confirmar compra</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">No hay compras registradas</div>
        ) : items.map((p) => (
          <div key={p.id} className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Package size={16} className="text-emerald-400" />
                <span className="font-medium text-gray-100">{p.suppliers?.name || "Sin proveedor"}</span>
                <span className="text-xs text-gray-500">{p.invoice_number && `Fact. ${p.invoice_number}`}</span>
              </div>
              <span className="text-sm font-semibold text-gray-100">${Number(p.total).toLocaleString("es-AR")}</span>
            </div>
            {p.description && <p className="text-xs text-gray-400 mb-1">{p.description}</p>}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{new Date(p.purchase_date).toLocaleDateString()}</span>
              {p.purchase_categories?.name && <span>· {p.purchase_categories.name}</span>}
              <span className="text-gray-600">· {p.purchase_items?.length || 0} item(s)</span>
            </div>
            {p.purchase_items?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {p.purchase_items.map((pi: any) => (
                  <span key={pi.id} className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded-full">
                    {pi.ingredients?.name || "?"} x{pi.quantity}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
