"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Clock, Percent, Pencil, Plus, Trash2, X } from "lucide-react";

export default function FlashSalesPage() {
  const [sales, setSales] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);

  const [discountPct, setDiscountPct] = useState(20);
  const [displayType, setDisplayType] = useState<"percentage" | "label">("percentage");
  const [displayLabel, setDisplayLabel] = useState("SALE");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showInQr, setShowInQr] = useState(true);
  const [showInCatalog, setShowInCatalog] = useState(true);
  const [showInOrder, setShowInOrder] = useState(true);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  const formatDateTimeLocal = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  };

  const resetForm = () => {
    setDiscountPct(20);
    setDisplayType("percentage");
    setDisplayLabel("SALE");
    setStartAt("");
    setEndAt("");
    setSelectedCategories([]);
    setShowInQr(true);
    setShowInCatalog(true);
    setShowInOrder(true);
    setEditingSaleId(null);
  };

  const loadData = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;
    const { data: userRecord } = await supabase.from("users").select("tenant_id, branch_id").eq("id", user.id).single();
    if (!userRecord) return;
    setTenantId(userRecord.tenant_id);
    setBranchId(userRecord.branch_id);

    const { data: s } = await supabase.from("flash_sales").select("*, flash_sale_categories!left(category_id)").eq("tenant_id", userRecord.tenant_id).order("created_at", { ascending: false });
    setSales(s || []);
    const { data: c } = await supabase.from("categories").select("*").eq("tenant_id", userRecord.tenant_id).order("name");
    setCategories(c || []);
  };

  const saveSale = async () => {
    if (!tenantId || !startAt || !endAt) return;
    const payload = {
      tenant_id: tenantId,
      branch_id: branchId,
      discount_percentage: discountPct,
      display_type: displayType,
      display_label: displayLabel,
      start_at: new Date(startAt).toISOString(),
      end_at: new Date(endAt).toISOString(),
      show_in_qr: showInQr,
      show_in_catalog: showInCatalog,
      show_in_order: showInOrder,
    };

    const { data: sale, error } = editingSaleId
      ? await supabase.from("flash_sales").update(payload).eq("id", editingSaleId).select().single()
      : await supabase.from("flash_sales").insert(payload).select().single();

    if (error || !sale) { alert(error?.message); return; }

    if (editingSaleId) {
      const { error: deleteError } = await supabase.from("flash_sale_categories").delete().eq("flash_sale_id", editingSaleId);
      if (deleteError) { alert(deleteError.message); return; }
    }

    if (selectedCategories.length > 0) {
      const { error: categoriesError } = await supabase
        .from("flash_sale_categories")
        .insert(selectedCategories.map((catId) => ({ flash_sale_id: sale.id, category_id: catId })));
      if (categoriesError) { alert(categoriesError.message); return; }
    }
    resetForm();
    loadData();
  };

  const editSale = (sale: any) => {
    setEditingSaleId(sale.id);
    setDiscountPct(Number(sale.discount_percentage || 20));
    setDisplayType(sale.display_type === "label" ? "label" : "percentage");
    setDisplayLabel(sale.display_label || "SALE");
    setStartAt(formatDateTimeLocal(sale.start_at));
    setEndAt(formatDateTimeLocal(sale.end_at));
    setSelectedCategories((sale.flash_sale_categories || []).map((item: any) => item.category_id).filter(Boolean));
    setShowInQr(sale.show_in_qr !== false);
    setShowInCatalog(sale.show_in_catalog !== false);
    setShowInOrder(sale.show_in_order !== false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteSale = async (id: string) => {
    await supabase.from("flash_sales").delete().eq("id", id);
    loadData();
  };

  const toggleActive = async (sale: any) => {
    await supabase.from("flash_sales").update({ is_active: !sale.is_active }).eq("id", sale.id);
    loadData();
  };

  const isSubcategory = (cat: any) => cat.parent_id !== null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-100 mb-1">Descuentos por Tiempo Limitado</h1>
      <p className="text-sm text-gray-400 mb-6">Creá ofertas flash aplicables a categorías o subcategorías</p>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">{editingSaleId ? "Editar oferta flash" : "Nueva oferta flash"}</h2>
            <p className="text-xs text-gray-500">{editingSaleId ? "Actualizá los datos y guardá los cambios." : "Definí el descuento, vigencia, canales y categorías."}</p>
          </div>
          {editingSaleId && (
            <button onClick={resetForm} className="inline-flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-2 text-xs font-bold text-gray-300 hover:bg-gray-800">
              <X size={14} />
              Cancelar
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">% Descuento</label>
            <input type="number" min={1} max={100} className="border rounded-lg px-3 py-2 text-sm w-full" value={discountPct} onChange={(e) => setDiscountPct(Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Mostrar como</label>
            <select className="border rounded-lg px-3 py-2 text-sm w-full" value={displayType} onChange={(e) => setDisplayType(e.target.value as any)}>
              <option value="percentage">Porcentaje (20%)</option>
              <option value="label">Texto (SALE)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Etiqueta (si es texto)</label>
            <input className="border rounded-lg px-3 py-2 text-sm w-full" value={displayLabel} onChange={(e) => setDisplayLabel(e.target.value)} disabled={displayType !== "label"} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Desde</label>
            <input type="datetime-local" className="border rounded-lg px-3 py-2 text-sm w-full" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Hasta</label>
            <input type="datetime-local" className="border rounded-lg px-3 py-2 text-sm w-full" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Categorías / Subcategorías</label>
          <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-3">
            <label className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm font-bold text-gray-300">
              <input type="checkbox" checked={showInQr} onChange={(e) => setShowInQr(e.target.checked)} />
              Menu QR
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm font-bold text-gray-300">
              <input type="checkbox" checked={showInCatalog} onChange={(e) => setShowInCatalog(e.target.checked)} />
              Catalogo
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm font-bold text-gray-300">
              <input type="checkbox" checked={showInOrder} onChange={(e) => setShowInOrder(e.target.checked)} />
              Delivery / Order
            </label>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
            {categories.filter((c) => !c.parent_id).map((cat) => (
              <div key={cat.id}>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-1">
                  <input type="checkbox" checked={selectedCategories.includes(cat.id)} onChange={() => setSelectedCategories((prev) => prev.includes(cat.id) ? prev.filter((id) => id !== cat.id) : [...prev, cat.id])} />
                  {cat.name}
                </label>
                <div className="ml-4 space-y-0.5">
                  {categories.filter((c) => c.parent_id === cat.id).map((sub) => (
                    <label key={sub.id} className="flex items-center gap-2 text-xs text-gray-400">
                      <input type="checkbox" checked={selectedCategories.includes(sub.id)} onChange={() => setSelectedCategories((prev) => prev.includes(sub.id) ? prev.filter((id) => id !== sub.id) : [...prev, sub.id])} />
                      └ {sub.name}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <button onClick={saveSale} disabled={!startAt || !endAt || selectedCategories.length === 0} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-black disabled:opacity-50 flex items-center gap-1">
          {editingSaleId ? <Pencil size={16} /> : <Plus size={16} />}
          {editingSaleId ? "Guardar cambios" : "Crear oferta"}
        </button>
      </div>

      <div className="space-y-2">
        {sales.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No hay ofertas creadas</div>
        ) : sales.map((sale) => (
          <div key={sale.id} className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl"><Percent size={20} /></span>
              <div>
                <p className="font-medium text-gray-100">{sale.display_type === "label" ? sale.display_label : `${sale.discount_percentage}%`}</p>
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock size={11} />
                  {new Date(sale.start_at).toLocaleDateString()} → {new Date(sale.end_at).toLocaleDateString()}
                  {" · "}{(sale.flash_sale_categories || []).length} categoría(s)
                </p>
                <p className="mt-1 text-[11px] font-bold uppercase text-gray-500">
                  {[
                    sale.show_in_qr !== false ? "QR" : null,
                    sale.show_in_catalog !== false ? "Catalogo" : null,
                    sale.show_in_order !== false ? "Order" : null,
                  ].filter(Boolean).join(" / ") || "Sin canales"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggleActive(sale)} className={`px-2 py-1 rounded text-xs font-medium ${sale.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                {sale.is_active ? "Activa" : "Inactiva"}
              </button>
              <button onClick={() => editSale(sale)} className="p-1.5 rounded hover:bg-gray-800 text-gray-300"><Pencil size={14} /></button>
              <button onClick={() => deleteSale(sale.id)} className="p-1.5 rounded hover:bg-red-50 text-red-400"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
