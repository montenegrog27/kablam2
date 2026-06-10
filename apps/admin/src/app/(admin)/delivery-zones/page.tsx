"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Trash2, Save, MapPin, Target, Crosshair } from "lucide-react";

const ZONE_COLORS = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

export default function DeliveryZonesPage() {
  const [zones, setZones] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branchLng, setBranchLng] = useState(-58.98);
  const [branchLat, setBranchLat] = useState(-27.45);
  const [selectedZone, setSelectedZone] = useState<any | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapboxRef = useRef<any>(null);
  const drawRef = useRef<any>(null);
  const loadingRef = useRef(false);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState(ZONE_COLORS[0]);

  useEffect(() => {
    load();
    return () => {
      if (mapboxRef.current) { mapboxRef.current.remove(); mapboxRef.current = null; }
      drawRef.current = null;
      loadingRef.current = false;
    };
  }, []);

  const load = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: r } = await supabase.from("users").select("tenant_id, branch_id").eq("id", u.user.id).single();
    if (!r) return;
    setTenantId(r.tenant_id); setBranchId(r.branch_id);
    const { data: branch } = await supabase.from("branches").select("lat, lng").eq("id", r.branch_id).single();
    if (branch?.lat) { setBranchLat(Number(branch.lat)); setBranchLng(Number(branch.lng)); }
    const { data: z } = await supabase.from("delivery_zones").select("*").eq("branch_id", r.branch_id).order("name");
    setZones(z || []);
    loadMapbox();
  };

  const loadMapbox = async () => {
    if (loadingRef.current || mapboxRef.current || !mapRef.current) return;
    loadingRef.current = true;
    // Load Mapbox GL JS
    if (!(window as any).mapboxgl) {
      const link = document.createElement("link");
      link.href = "https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css"; link.rel = "stylesheet";
      document.head.appendChild(link);
      const drawCss = document.createElement("link");
      drawCss.href = "https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-draw/v1.4.3/mapbox-gl-draw.css"; drawCss.rel = "stylesheet";
      document.head.appendChild(drawCss);
      const script = document.createElement("script");
      script.src = "https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js";
      await new Promise<void>((resolve) => { script.onload = () => resolve(); document.head.appendChild(script); });
    }
    if (!(window as any).MapboxDraw) {
      const drawScript = document.createElement("script");
      drawScript.src = "https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-draw/v1.4.3/mapbox-gl-draw.js";
      await new Promise<void>((resolve) => { drawScript.onload = () => resolve(); document.head.appendChild(drawScript); });
    }

    const mb = (window as any).mapboxgl;
    mb.accessToken = MAPBOX_TOKEN;
    const map = new mb.Map({ container: mapRef.current, style: "mapbox://styles/mapbox/light-v11", center: [branchLng, branchLat], zoom: 14 });
    const el = document.createElement("div");
    el.innerHTML = "🏪";
    el.style.fontSize = "28px";
    new mb.Marker({ element: el, draggable: true }).setLngLat([branchLng, branchLat]).addTo(map);
    map.on("load", () => {
      const Draw = (window as any).MapboxDraw;
      const draw = new Draw({ displayControlsDefault: false, controls: { polygon: true, trash: true } });
      map.addControl(draw, "top-left");
      map.on("draw.create", (e: any) => {
        const coords = e.features[0].geometry.coordinates[0].map((c: number[]) => [c[1], c[0]]);
        setDrawMode(false);
        draw.changeMode("simple_select");
        setSelectedZone({ coordinates: coords, name: "", color: formColor });
        setFormName(""); setFormColor(ZONE_COLORS[0]);
      });
      drawRef.current = draw;
      mapboxRef.current = map;
      setMapLoaded(true);
    });
  };

  const addZoneToMap = (zone: any, map: any, mb: any) => {
    const coords = (zone.coordinates || []).map((c: number[]) => [c[1], c[0]]);
    if (coords.length < 3) return;
    const id = `zone-${zone.id}`;
    map.addSource(id, { type: "geojson", data: { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] } } });
    map.addLayer({ id, type: "fill", source: id, paint: { "fill-color": zone.color || "#3B82F6", "fill-opacity": 0.12 } });
    map.addLayer({ id: `${id}-border`, type: "line", source: id, paint: { "line-color": zone.color || "#3B82F6", "line-width": 2 } });
  };

  useEffect(() => {
    if (!mapboxRef.current || !mapLoaded) return;
    // Re-add zones when they change
    zones.forEach((zone) => {
      const id = `zone-${zone.id}`;
      if (!mapboxRef.current.getSource(id)) addZoneToMap(zone, mapboxRef.current, (window as any).mapboxgl);
    });
  }, [zones, mapLoaded]);

  const toggleDrawMode = () => {
    if (!drawRef.current) return;
    if (drawMode) {
      drawRef.current.changeMode("simple_select");
      setDrawMode(false);
    } else {
      drawRef.current.changeMode("draw_polygon");
      setDrawMode(true);
      setSelectedZone(null);
    }
  };

  const saveZone = async () => {
    if (!tenantId || !branchId || !formName) return;
    const coords = selectedZone?.coordinates || [];
    if (selectedZone?.id) {
      await supabase.from("delivery_zones").update({ name: formName, color: formColor, coordinates: coords }).eq("id", selectedZone.id);
    } else {
      await supabase.from("delivery_zones").insert({ tenant_id: tenantId, branch_id: branchId, name: formName, color: formColor, coordinates: coords });
    }
    setSelectedZone(null);
    const { data: z } = await supabase.from("delivery_zones").select("*").eq("branch_id", branchId).order("name");
    setZones(z || []);
  };

  const deleteZone = async (id: string) => {
    if (!confirm("Eliminar zona?")) return;
    if (mapboxRef.current) {
      try { mapboxRef.current.removeLayer(`zone-${id}`); } catch {}
      try { mapboxRef.current.removeLayer(`zone-${id}-border`); } catch {}
      try { mapboxRef.current.removeSource(`zone-${id}`); } catch {}
    }
    await supabase.from("delivery_zones").delete().eq("id", id);
    setZones(zones.filter((z) => z.id !== id));
    setSelectedZone(null);
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-100">Zonas de Delivery</h1>
        {!MAPBOX_TOKEN && <p className="text-xs text-red-400">Configurá NEXT_PUBLIC_MAPBOX_TOKEN en .env</p>}
      </div>
      <div className="flex gap-4 flex-1 min-h-0">
        <div className="flex-1 bg-gray-900 border border-gray-700 rounded-xl overflow-hidden relative">
          <div ref={mapRef} className="w-full h-full min-h-[65vh]" />
          {mapLoaded && (
            <div className="absolute top-4 right-4 z-10 flex gap-2">
              <button onClick={toggleDrawMode}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition shadow-lg ${drawMode ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-600"}`}>
                <Target size={16} /> {drawMode ? "Dibujando..." : "Dibujar zona"}
              </button>
            </div>
          )}
        </div>
        <div className="w-80 bg-gray-900 border border-gray-700 rounded-xl overflow-y-auto">
          {selectedZone ? (
            <div className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-100">{selectedZone?.id ? "Editar zona" : "Nueva zona"}</h3>
              <div className="flex gap-2 flex-wrap">
                {ZONE_COLORS.map((c) => (
                  <button key={c} onClick={() => setFormColor(c)}
                    className="w-6 h-6 rounded-full border-2 transition" style={{ backgroundColor: c, borderColor: formColor === c ? "#fff" : "transparent" }} />
                ))}
              </div>
              <input value={formName} onChange={(e) => setFormName(e.target.value)}
                className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-800 text-gray-100 placeholder-gray-500" placeholder="Nombre de la zona" />
              <div className="flex gap-2">
                <button onClick={saveZone} disabled={!formName}
                  className="flex-1 py-2.5 bg-emerald-700 text-white rounded-lg text-sm font-bold hover:bg-emerald-600 disabled:opacity-40 flex items-center justify-center gap-2"><Save size={14} /> Guardar</button>
                <button onClick={() => { if (drawRef.current) drawRef.current.deleteAll(); setSelectedZone(null); }}
                  className="px-4 py-2.5 bg-gray-800 text-gray-400 rounded-lg text-sm hover:bg-gray-750 border border-gray-700">Cancelar</button>
              </div>
            </div>
          ) : (
            <div className="p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-100 flex items-center gap-2"><MapPin size={14} /> Zonas ({zones.length})</h3>
              {zones.length === 0 ? (
                <p className="text-xs text-gray-500">Sin zonas. Hacé clic en Dibujar zona y marcá el polígono en el mapa.</p>
              ) : zones.map((z) => (
                <div key={z.id} onClick={() => { setSelectedZone(z); setFormName(z.name); setFormColor(z.color || ZONE_COLORS[0]); }}
                  className="bg-gray-800 rounded-xl p-3 border border-gray-700 cursor-pointer hover:border-gray-600 transition">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: z.color || "#3B82F6" }} />
                      <span className="text-sm font-semibold text-gray-100">{z.name}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); deleteZone(z.id); }} className="p-1 rounded hover:bg-red-900/30 text-red-400"><Trash2 size={12} /></button>
                  </div>
                  <div className="text-[10px] text-gray-500"><Target size={10} className="inline" /> {(z.coordinates || []).length} puntos</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
