"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Plus, Trash2, Move, Maximize, Save } from "lucide-react";

export default function TablesEditorPage() {
  const [tables, setTables] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [resizing, setResizing] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: r } = await supabase.from("users").select("tenant_id, branch_id").eq("id", u.user.id).single();
    if (!r) return;
    setTenantId(r.tenant_id);
    setBranchId(r.branch_id);
    const { data } = await supabase.from("tables").select("*").eq("branch_id", r.branch_id).order("number");
    setTables(data || []);
  };

  const addTable = async () => {
    if (!branchId || !tenantId) return;
    const maxNum = tables.reduce((m, t) => Math.max(m, t.number || 0), 0);
    const { data } = await supabase.from("tables").insert({
      tenant_id: tenantId, branch_id: branchId, number: maxNum + 1, capacity: 4,
      pos_x: 50 + (tables.length % 4) * 80, pos_y: 50 + Math.floor(tables.length / 4) * 80,
    }).select().single();
    if (data) setTables([...tables, data]);
  };

  const updateTable = async (id: string, updates: any) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    await supabase.from("tables").update(updates).eq("id", id);
  };

  const deleteTable = async (id: string) => {
    if (!confirm("¿Eliminar mesa?")) return;
    await supabase.from("tables").delete().eq("id", id);
    setTables(tables.filter((t) => t.id !== id));
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current) setSelectedId(null);
  };

  const handleTableMouseDown = (e: React.MouseEvent, id: string) => {
    if (resizing) return;
    setDragging(id);
    setSelectedId(id);
    setDragStart({ x: e.clientX, y: e.clientY });
    e.preventDefault();
  };

  const handleResizeMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setResizing(id);
    setSelectedId(id);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragging) {
        const table = tables.find((t) => t.id === dragging);
        if (!table) return;
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        updateTable(dragging, { pos_x: Math.max(0, Number(table.pos_x) + dx), pos_y: Math.max(0, Number(table.pos_y) + dy) });
        setDragStart({ x: e.clientX, y: e.clientY });
      }
      if (resizing) {
        const table = tables.find((t) => t.id === resizing);
        if (!table) return;
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        updateTable(resizing, {
          width: Math.max(40, Number(table.width) + dx),
          height: Math.max(30, Number(table.height) + dy),
        });
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    };
    const handleMouseUp = () => { setDragging(null); setResizing(null); };
    if (dragging || resizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
  }, [dragging, resizing, dragStart, tables]);

  const selected = tables.find((t) => t.id === selectedId);

  return (
    <div className="h-full flex gap-4">
      {/* Canvas */}
      <div className="flex-1 bg-gray-900 border border-gray-700 rounded-xl overflow-hidden relative" style={{ minHeight: "70vh" }}>
        <div
          ref={canvasRef}
          className="w-full h-full relative"
          style={{ minHeight: "70vh" }}
          onMouseDown={handleCanvasMouseDown}
        >
          {tables.map((table) => {
            const isSelected = selectedId === table.id;
            return (
              <div
                key={table.id}
                onMouseDown={(e) => handleTableMouseDown(e, table.id)}
                className={`absolute cursor-grab active:cursor-grabbing flex flex-col items-center justify-center border-2 transition-shadow ${
                  table.shape === "round" ? "rounded-full" : "rounded-xl"
                } ${isSelected ? "border-emerald-400 shadow-lg shadow-emerald-500/20" : "border-gray-600 hover:border-gray-500"}`}
                style={{
                  left: Number(table.pos_x), top: Number(table.pos_y),
                  width: Number(table.width), height: Number(table.height),
                  transform: `rotate(${Number(table.rotation)}deg)`,
                }}
              >
                <span className="text-lg font-bold text-gray-100 pointer-events-none">{table.number}</span>
                <span className="text-[10px] text-gray-500 pointer-events-none">{table.capacity} pers</span>
                {/* Resize handle */}
                <div
                  onMouseDown={(e) => handleResizeMouseDown(e, table.id)}
                  className="absolute bottom-0 right-0 w-4 h-4 bg-gray-500 hover:bg-emerald-400 cursor-se-resize rounded-bl-sm"
                  style={{ transform: "translate(2px, 2px)" }}
                />
              </div>
            );
          })}
          {tables.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm">
              Haz clic en "Agregar mesa" para empezar
            </div>
          )}
        </div>
        <button onClick={addTable} className="absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition shadow-lg">
          <Plus size={16} /> Agregar mesa
        </button>
      </div>

      {/* Properties panel */}
      <div className="w-72 bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-100">Propiedades</h3>
        {!selected ? (
          <p className="text-xs text-gray-500">Seleccioná una mesa en el plano</p>
        ) : (
          <>
            <div>
              <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Número</label>
              <input type="number" value={selected.number} onChange={(e) => updateTable(selected.id, { number: Number(e.target.value) })}
                className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Capacidad</label>
              <input type="number" min={1} value={selected.capacity} onChange={(e) => updateTable(selected.id, { capacity: Number(e.target.value) })}
                className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Forma</label>
              <select value={selected.shape} onChange={(e) => updateTable(selected.id, { shape: e.target.value })}
                className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100">
                <option value="rect">Rectangular</option>
                <option value="round">Redonda</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">X</label>
                <input type="number" value={Math.round(Number(selected.pos_x))} onChange={(e) => updateTable(selected.id, { pos_x: Number(e.target.value) })}
                  className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Y</label>
                <input type="number" value={Math.round(Number(selected.pos_y))} onChange={(e) => updateTable(selected.id, { pos_y: Number(e.target.value) })}
                  className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100" />
              </div>
            </div>
            <button onClick={() => deleteTable(selected.id)} className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-900/30 text-red-400 rounded-lg text-sm hover:bg-red-900/50 transition">
              <Trash2 size={14} /> Eliminar mesa
            </button>
          </>
        )}
      </div>
    </div>
  );
}
