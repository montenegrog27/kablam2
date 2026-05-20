"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Plus, Trash2, ChevronUp, ChevronDown, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

const ICONS = [
  "🍔", "🌭", "🍕", "🧀", "🥩", "🍗", "🥓", "🥚", "🧈",
  "🥬", "🍅", "🧅", "🥒", "🌶️", "🥕", "🧄", "🍄", "🥑",
  "🍟", "🥔", "🌽", "🥖", "🍞", "🥐", "🧇", "🥞",
  "🥤", "🥛", "🧃", "☕", "🫗", "🧊",
  "🧂", "🫘", "🫒",
];

function EmojiPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="border rounded-lg px-3 py-2 text-2xl h-[38px] w-[48px] flex items-center justify-center hover:bg-gray-800 transition"
      >{value}</button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-xl p-3 w-[280px]">
          <div className="grid grid-cols-7 gap-1">
            {ICONS.map((ic) => (
              <button key={ic} onClick={() => { onChange(ic); setOpen(false); }}
                className={`text-xl w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-800 transition ${ic === value ? "ring-2 ring-black bg-gray-800" : ""}`}
              >{ic}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function KDSConfigPage() {
  const [config, setConfig] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [ingredientId, setIngredientId] = useState("");
  const [icon, setIcon] = useState("🍔");
  const [error, setError] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setError("");
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;
    const { data: userRecord } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
    if (!userRecord) return;
    setTenantId(userRecord.tenant_id);

    const { data: cfg } = await supabase.from("kds_config").select("*, ingredients(name)").eq("tenant_id", userRecord.tenant_id).order("sort_order");
    setConfig(cfg || []);

    const { data: ing } = await supabase.from("ingredients").select("*").eq("tenant_id", userRecord.tenant_id).order("name");
    setIngredients(ing || []);
  };

  const addItem = async () => {
    setError("");
    if (!tenantId || !ingredientId) return;
    const maxOrder = config.reduce((max: number, c: any) => Math.max(max, c.sort_order || 0), 0);
    const { error: err } = await supabase.from("kds_config").insert({
      tenant_id: tenantId,
      name: name || ingredients.find((i) => i.id === ingredientId)?.name,
      ingredient_id: ingredientId,
      icon,
      sort_order: maxOrder + 1,
    });
    if (err) {
      setError(err.message);
      return;
    }
    setName(""); setIngredientId(""); setIcon("🍔");
    loadData();
  };

  const removeItem = async (id: string) => {
    setError("");
    await supabase.from("kds_config").delete().eq("id", id);
    loadData();
  };

  const moveUp = async (idx: number) => {
    if (idx === 0) return;
    const items = [...config];
    [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
    for (let i = 0; i < items.length; i++) {
      await supabase.from("kds_config").update({ sort_order: i }).eq("id", items[i].id);
    }
    loadData();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-100 mb-1">Configuración KDS</h1>
      <p className="text-sm text-gray-400 mb-6">Seleccioná qué ingredientes se muestran en el contador del KDS</p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2 mb-4">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6">
        <div className="flex gap-3 items-end">
          <EmojiPicker value={icon} onChange={setIcon} />
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">Ingrediente</label>
            <select className="border rounded-lg px-3 py-2 text-sm w-full" value={ingredientId} onChange={(e) => setIngredientId(e.target.value)}>
              <option value="">Seleccionar...</option>
              {ingredients.map((ing) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
            </select>
          </div>
          <button onClick={addItem} disabled={!ingredientId} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-black disabled:opacity-50 flex items-center gap-1"><Plus size={16} /> Agregar</button>
        </div>
      </div>

      <div className="space-y-2">
        {config.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No hay ingredientes configurados</div>
        ) : config.map((item, idx) => (
          <div key={item.id} className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{item.icon || "🍔"}</span>
              <div>
                <p className="font-medium text-gray-100">{item.name}</p>
                <p className="text-xs text-gray-400">{item.ingredients?.name || "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => moveUp(idx)} className="p-1.5 rounded hover:bg-gray-800 text-gray-400 disabled:opacity-20" disabled={idx === 0} title="Subir">
                <ChevronUp size={16} />
              </button>
              <button onClick={() => removeItem(item.id)} className="p-1.5 rounded hover:bg-red-50 text-red-400"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
