"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Plus, Trash2, DollarSign } from "lucide-react";

export default function ExpensesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("0");
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: r } = await supabase.from("users").select("tenant_id, branch_id").eq("id", u.user.id).single();
    if (!r) return;
    setTenantId(r.tenant_id);
    const [{ data: e }, { data: c }, { data: s }] = await Promise.all([
      supabase.from("expenses").select("*, expense_categories(name), suppliers(name)").eq("tenant_id", r.tenant_id).order("expense_date", { ascending: false }),
      supabase.from("expense_categories").select("*").eq("tenant_id", r.tenant_id).eq("is_active", true).order("name"),
      supabase.from("suppliers").select("*").eq("tenant_id", r.tenant_id).eq("is_active", true).order("name"),
    ]);
    setItems(e || []); setCats(c || []); setSuppliers(s || []);
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!tenantId || !description || !amount || !expenseDate) return;
    const amt = Number(amount);
    const tax = Number(taxAmount) || 0;
    await supabase.from("expenses").insert({
      tenant_id: tenantId, description, amount: amt, tax_amount: tax, total: amt + tax,
      category_id: categoryId || null, supplier_id: supplierId || null,
      expense_date: expenseDate, reference: reference || null, notes: notes || null,
    });
    setDescription(""); setAmount(""); setTaxAmount("0"); setCategoryId(""); setSupplierId("");
    setReference(""); setNotes(""); setShowForm(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar gasto?")) return;
    await supabase.from("expenses").delete().eq("id", id);
    load();
  };

  const totalGastos = items.reduce((sum, i) => sum + Number(i.total), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Gastos</h1>
          <p className="text-sm text-gray-400 mt-1">Total: <span className="font-semibold text-gray-100">${totalGastos.toLocaleString("es-AR")}</span></p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black text-sm font-medium transition border border-gray-700">
          <Plus size={16} /> Nuevo gasto
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <input className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Descripción *" value={description} onChange={(e) => setDescription(e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Monto *</label>
              <input type="number" step="0.01" className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">IVA</label>
              <input type="number" step="0.01" className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="0.00" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Categoría</label>
              <select className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Sin categoría</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Proveedor</label>
              <select className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Sin proveedor</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Fecha</label>
              <input type="date" className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Referencia</label>
              <input className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Factura N°" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="col-span-2">
              <textarea className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Notas" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <button className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-black border border-gray-700">Guardar gasto</button>
        </form>
      )}

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">No hay gastos registrados</div>
        ) : items.map((item) => (
          <div key={item.id} className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DollarSign size={18} className="text-red-400" />
              <div>
                <p className="font-medium text-gray-100">{item.description}</p>
                <p className="text-xs text-gray-400">{item.expense_categories?.name && `${item.expense_categories.name} · `}{item.suppliers?.name && `${item.suppliers.name} · `}{new Date(item.expense_date).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-red-400">-${Number(item.total).toLocaleString("es-AR")}</span>
              <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded hover:bg-red-900/30 text-red-400"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
