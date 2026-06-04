"use client";
import { useEffect, useState, useRef } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Plus, Trash2, Move, RotateCw } from "lucide-react";

const OBJECT_TYPES = [
  { type: "table", label: "Mesa", icon: "▣", color: "#ffffff" },
  { type: "wall", label: "Pared", icon: "▬", color: "#4B5563" },
  { type: "counter", label: "Barra", icon: "▭", color: "#92400E" },
  { type: "column", label: "Columna", icon: "◻", color: "#6B7280" },
  { type: "tree", label: "Planta", icon: "🌴", color: "#059669" },
  { type: "decoration", label: "Decoración", icon: "🎍", color: "#7C3AED" },
];

export default function TablesEditorPage() {
  const [tables, setTables] = useState<any[]>([]);
  const [objects, setObjects] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<"table" | "object" | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: r } = await supabase.from("users").select("tenant_id, branch_id").eq("id", u.user.id).single();
    if (!r) return;
    setTenantId(r.tenant_id);
    setBranchId(r.branch_id);
    const [{ data: t }, { data: o }] = await Promise.all([
      supabase.from("tables").select("*").eq("branch_id", r.branch_id).order("number"),
      supabase.from("floor_objects").select("*").eq("branch_id", r.branch_id).order("created_at"),
    ]);
    setTables(t || []);
    setObjects(o || []);
  };

  const addItem = async (type: string) => {
    if (!branchId || !tenantId) return;
    if (type === "table") {
      const maxNum = tables.reduce((m, t) => Math.max(m, t.number || 0), 0);
      const { data } = await supabase.from("tables").insert({
        tenant_id: tenantId, branch_id: branchId, number: maxNum + 1, capacity: 4,
        pos_x: 50 + (tables.length % 4) * 80, pos_y: 50 + Math.floor(tables.length / 4) * 80,
      }).select().single();
      if (data) setTables([...tables, data]);
    } else {
      const { data } = await supabase.from("floor_objects").insert({
        tenant_id: tenantId, branch_id: branchId, type,
        pos_x: 100 + Math.random() * 200, pos_y: 100 + Math.random() * 200,
        width: type === "wall" ? 200 : type === "counter" ? 120 : type === "column" ? 30 : 40,
        height: type === "wall" ? 12 : type === "counter" ? 30 : type === "column" ? 30 : 40,
      }).select().single();
      if (data) setObjects([...objects, data]);
    }
  };

  const updateItem = async (type: "table" | "object", id: string, updates: any) => {
    if (type === "table") {
      setTables((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
      await supabase.from("tables").update(updates).eq("id", id);
    } else {
      setObjects((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)));
      await supabase.from("floor_objects").update(updates).eq("id", id);
    }
  };

  const deleteItem = async (type: "table" | "object", id: string) => {
    if (!confirm("¿Eliminar?")) return;
    if (type === "table") {
      await supabase.from("tables").delete().eq("id", id);
      setTables(tables.filter((t) => t.id !== id));
    } else {
      await supabase.from("floor_objects").delete().eq("id", id);
      setObjects(objects.filter((o) => o.id !== id));
    }
    setSelectedId(null);
  };

  const handleMouseDown = (e: React.MouseEvent, type: "table" | "object", id: string) => {
    if (resizing) return;
    setDragging(id); setSelectedId(id); setSelectedType(type);
    setDragStart({ x: e.clientX, y: e.clientY });
    e.preventDefault();
  };

  const handleResizeDown = (e: React.MouseEvent, type: "table" | "object", id: string) => {
    e.stopPropagation();
    setResizing(id); setSelectedId(id); setSelectedType(type);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
      if (dragging) {
        const table = tables.find((t) => t.id === dragging);
        const obj = objects.find((o) => o.id === dragging);
        const item = table || obj;
        if (!item) return;
        const type = table ? "table" : "object";
        updateItem(type, dragging, { pos_x: Math.max(0, Number(item.pos_x) + dx), pos_y: Math.max(0, Number(item.pos_y) + dy) });
        setDragStart({ x: e.clientX, y: e.clientY });
      }
      if (resizing) {
        const table = tables.find((t) => t.id === resizing);
        const obj = objects.find((o) => o.id === resizing);
        const item = table || obj;
        if (!item) return;
        const minW = item.type === "wall" ? 40 : 20;
        const minH = item.type === "wall" ? 8 : 20;
        const type = table ? "table" : "object";
        updateItem(type, resizing, { width: Math.max(minW, Number(item.width) + dx), height: Math.max(minH, Number(item.height) + dy) });
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    };
    const onUp = () => { setDragging(null); setResizing(null); };
    if (dragging || resizing) { window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp); }
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging, resizing, dragStart, tables, objects]);

  const selectedTable = selectedType === "table" ? tables.find((t) => t.id === selectedId) : null;
  const selectedObj = selectedType === "object" ? objects.find((o) => o.id === selectedId) : null;

  const getObjStyle = (type: string) => {
    const t = OBJECT_TYPES.find((o) => o.type === type);
    return t ? t.color : "#6B7280";
  };

  const renderObjIcon = (obj: any) => {
    if (obj.type === "tree") return <span className="text-2xl pointer-events-none">🌴</span>;
    if (obj.type === "decoration") return <span className="text-xl pointer-events-none">🎍</span>;
    if (obj.type === "column") return <span className="text-gray-400 text-lg pointer-events-none">◻</span>;
    if (obj.type === "counter") return <span className="text-amber-700 text-xs font-bold pointer-events-none uppercase tracking-widest">BARRA</span>;
    return null;
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-xl p-2">
        {OBJECT_TYPES.map((ot) => (
          <button key={ot.type} onClick={() => addItem(ot.type)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-gray-300 hover:bg-gray-800 transition border border-gray-700">
            <span style={{ color: ot.color }}>{ot.icon}</span> {ot.label}
          </button>
        ))}
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Canvas */}
        <div className="flex-1 bg-gray-950 border border-gray-700 rounded-xl overflow-hidden relative">
          <div ref={canvasRef} className="w-full h-full relative" style={{ minHeight: "65vh" }}
            onMouseDown={(e) => { if (e.target === canvasRef.current) { setSelectedId(null); setSelectedType(null); } }}>
            {/* Floor objects */}
            {objects.map((obj) => (
              <div key={obj.id}
                onMouseDown={(e) => handleMouseDown(e, "object", obj.id)}
                className={`absolute cursor-grab active:cursor-grabbing flex items-center justify-center border transition-shadow ${
                  obj.type === "wall" ? "rounded-sm" : obj.type === "column" ? "rounded-full" : "rounded-lg"
                } ${selectedId === obj.id ? "border-yellow-400 shadow-lg shadow-yellow-500/20" : "border-transparent hover:border-gray-500"}`}
                style={{
                  left: Number(obj.pos_x), top: Number(obj.pos_y),
                  width: Number(obj.width), height: Number(obj.height),
                  background: obj.type === "wall" || obj.type === "counter" || obj.type === "column" ? getObjStyle(obj.type) : "transparent",
                  transform: `rotate(${Number(obj.rotation)}deg)`,
                }}>
                {renderObjIcon(obj)}
                {/* Resize handle for non-tree/decoration */}
                {obj.type !== "tree" && obj.type !== "decoration" && (
                  <div onMouseDown={(e) => handleResizeDown(e, "object", obj.id)}
                    className="absolute bottom-0 right-0 w-3 h-3 bg-gray-500 hover:bg-yellow-400 cursor-se-resize rounded-sm"
                    style={{ transform: "translate(1px, 1px)" }} />
                )}
              </div>
            ))}
            {/* Tables */}
            {tables.map((table) => (
              <div key={table.id}
                onMouseDown={(e) => handleMouseDown(e, "table", table.id)}
                className={`absolute cursor-grab active:cursor-grabbing flex flex-col items-center justify-center border-2 transition-shadow ${
                  table.shape === "round" ? "rounded-full" : "rounded-xl"
                } ${selectedId === table.id ? "border-emerald-400 shadow-lg shadow-emerald-500/20" : "border-gray-600 hover:border-gray-500"}`}
                style={{
                  left: Number(table.pos_x), top: Number(table.pos_y),
                  width: Number(table.width), height: Number(table.height),
                  transform: `rotate(${Number(table.rotation)}deg)`,
                }}>
                <span className="text-lg font-bold text-gray-100 pointer-events-none">{table.number}</span>
                <span className="text-[10px] text-gray-500 pointer-events-none">{table.capacity}p</span>
                <div onMouseDown={(e) => handleResizeDown(e, "table", table.id)}
                  className="absolute bottom-0 right-0 w-4 h-4 bg-gray-500 hover:bg-emerald-400 cursor-se-resize rounded-bl-sm"
                  style={{ transform: "translate(2px, 2px)" }} />
              </div>
            ))}
            {tables.length === 0 && objects.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm">
                Agregá mesas y objetos desde la barra superior
              </div>
            )}
          </div>
        </div>

        {/* Properties panel */}
        <div className="w-72 bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4 overflow-y-auto">
          <h3 className="text-sm font-semibold text-gray-100">
            {selectedTable ? `Mesa ${selectedTable.number}` : selectedObj ? OBJECT_TYPES.find((o) => o.type === selectedObj.type)?.label || "Objeto" : "Propiedades"}
          </h3>
          {!selectedTable && !selectedObj ? (
            <p className="text-xs text-gray-500">Seleccioná un elemento</p>
          ) : (
            <>
              {selectedTable && (
                <>
                  <Field label="Número" value={selectedTable.number} onChange={(v) => updateItem("table", selectedTable.id, { number: Number(v) })} />
                  <Field label="Capacidad" value={selectedTable.capacity} onChange={(v) => updateItem("table", selectedTable.id, { capacity: Number(v) })} />
                  <Select label="Forma" value={selectedTable.shape} options={[{ v: "rect", l: "Rectangular" }, { v: "round", l: "Redonda" }]}
                    onChange={(v) => updateItem("table", selectedTable.id, { shape: v })} />
                  <PosFields x={selectedTable.pos_x} y={selectedTable.pos_y} onChange={(x, y) => updateItem("table", selectedTable.id, { pos_x: x, pos_y: y })} />
                  <button onClick={() => deleteItem("table", selectedTable.id)} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-900/30 text-red-400 rounded-lg text-sm hover:bg-red-900/50 transition">
                    <Trash2 size={14} /> Eliminar mesa
                  </button>
                </>
              )}
              {selectedObj && (
                <>
                  <Field label="Ancho" value={Math.round(Number(selectedObj.width))} onChange={(v) => updateItem("object", selectedObj.id, { width: Number(v) })} />
                  <Field label="Alto" value={Math.round(Number(selectedObj.height))} onChange={(v) => updateItem("object", selectedObj.id, { height: Number(v) })} />
                  <PosFields x={selectedObj.pos_x} y={selectedObj.pos_y} onChange={(x, y) => updateItem("object", selectedObj.id, { pos_x: x, pos_y: y })} />
                  <div>
                    <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Rotación</label>
                    <div className="flex items-center gap-2">
                      <input type="range" min={0} max={360} value={selectedObj.rotation || 0}
                        onChange={(e) => updateItem("object", selectedObj.id, { rotation: Number(e.target.value) })}
                        className="flex-1 accent-emerald-500" />
                      <span className="text-xs text-gray-400 w-8">{Math.round(selectedObj.rotation || 0)}°</span>
                    </div>
                  </div>
                  <button onClick={() => deleteItem("object", selectedObj.id)} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-900/30 text-red-400 rounded-lg text-sm hover:bg-red-900/50 transition">
                    <Trash2 size={14} /> Eliminar
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100" />
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: { v: string; l: string }[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100">
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

function PosFields({ x, y, onChange }: { x: number; y: number; onChange: (x: number, y: number) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="X" value={Math.round(Number(x))} onChange={(v) => onChange(Number(v), Number(y))} />
      <Field label="Y" value={Math.round(Number(y))} onChange={(v) => onChange(Number(x), Number(v))} />
    </div>
  );
}
