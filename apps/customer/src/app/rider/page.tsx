"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Search, Plus, X, GripVertical, Navigation, MapPin, Phone, ChevronUp, ChevronDown, Bike } from "lucide-react";

type OrderItem = {
  id: string;
  number: string;
  customer: string;
  address: string;
  phone: string;
  lat?: number;
  lng?: number;
  packNumber: number;
};

export default function RiderPage() {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [riderPos, setRiderPos] = useState<{ lat: number; lng: number } | null>(null);
  const [map, setMap] = useState<any>(null);
  const [L, setL] = useState<any>(null);
  const [markers, setMarkers] = useState<any[]>([]);
  const [riderMarker, setRiderMarker] = useState<any>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInitRef = useRef(false);

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("rider_orders");
      if (saved) setOrders(JSON.parse(saved));
    } catch {}
    // Get rider position
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition((pos) => {
        setRiderPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      });
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    try { localStorage.setItem("rider_orders", JSON.stringify(orders)); } catch {}
  }, [orders]);

  const addOrder = async () => {
    const id = code.trim().toUpperCase();
    if (!id || orders.find((o) => o.id === id)) return;
    setLoading(true); setError("");

    const { data: order } = await supabase
      .from("orders")
      .select("id, customer_name, address, customer_phone, customer_lat, customer_lng")
      .ilike("id", `${id}%`)
      .in("status", ["ready", "sent"])
      .limit(1)
      .single();

    if (!order) {
      setError("Pedido no encontrado o no disponible");
      setLoading(false); return;
    }

    const newOrder: OrderItem = {
      id: order.id,
      number: order.id.slice(-6).toUpperCase(),
      customer: order.customer_name || "Cliente",
      address: order.address || "Sin dirección",
      phone: order.customer_phone || "",
      lat: order.customer_lat || undefined,
      lng: order.customer_lng || undefined,
      packNumber: orders.length + 1,
    };
    setOrders((prev) => [...prev, newOrder]);
    setCode("");
    setLoading(false);
  };

  const removeOrder = (id: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const moveOrder = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= orders.length) return;
    const updated = [...orders];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    setOrders(updated);
  };

  // Init map
  useEffect(() => {
    if (!mapRef.current || riderPos || mapInitRef.current) return;
    mapInitRef.current = true;
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      const link = document.createElement("link");
      link.rel = "stylesheet"; link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
      const leaflet = (window as any).L;
      setL(leaflet);
      const m = leaflet.map(mapRef.current).setView([-27.45, -58.98], 13);
      leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "OpenStreetMap" }).addTo(m);
      setMap(m);
    };
    document.head.appendChild(script);
  }, [riderPos]);

  // Update markers
  useEffect(() => {
    if (!L || !map) return;
    markers.forEach((m: any) => map.removeLayer(m));
    const newMarkers: any[] = [];

    orders.forEach((order, idx) => {
      if (!order.lat || !order.lng) return;
      const color = idx === 0 ? "#10B981" : idx === 1 ? "#3B82F6" : "#6B7280";
      const icon = L.divIcon({
        html: `<div style="background:${color};color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3)">${idx + 1}</div>`,
        className: "", iconSize: [28, 28], iconAnchor: [14, 14],
      });
      const marker = L.marker([order.lat, order.lng], { icon })
        .addTo(map)
        .bindPopup(`<b>#${order.number}</b><br/>${order.customer}<br/>${order.address}`);
      newMarkers.push(marker);
    });

    if (riderPos) {
      const bikeIcon = L.divIcon({
        html: '<div style="font-size:24px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5))">&#x1F6B4;</div>',
        className: "", iconSize: [24, 24], iconAnchor: [12, 12],
      });
      if (riderMarker) map.removeLayer(riderMarker);
      const rm = L.marker([riderPos.lat, riderPos.lng], { icon: bikeIcon }).addTo(map);
      setRiderMarker(rm);
      newMarkers.push(rm);
    }

    setMarkers(newMarkers);

    // Fit bounds
    if (orders.some((o) => o.lat) || riderPos) {
      const points = [
        ...orders.filter((o) => o.lat && o.lng).map((o) => [o.lat, o.lng] as [number, number]),
        ...(riderPos ? [[riderPos.lat, riderPos.lng] as [number, number]] : []),
      ];
      if (points.length >= 2) {
        map.fitBounds(points, { padding: [50, 50] });
      } else if (points.length === 1) {
        map.setView(points[0], 15);
      }
    }
  }, [orders, riderPos, L, map]);

  const callCustomer = (phone: string) => {
    window.open(`tel:${phone}`);
  };

  const openMap = (lat?: number, lng?: number) => {
    if (lat && lng) window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-emerald-600 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow-lg">
        <div className="flex items-center gap-2">
          <Bike size={22} />
          <span className="font-bold text-lg">Rider</span>
          {riderPos && <span className="text-xs bg-emerald-500 px-2 py-0.5 rounded-full">📍 Activo</span>}
        </div>
        <span className="text-sm font-semibold">{orders.length} pedido(s)</span>
      </div>

      {/* Map */}
      <div ref={mapRef} className="w-full h-48 bg-gray-200" />

      {/* Add order */}
      <div className="px-4 py-3 bg-white border-b border-gray-200">
        <form onSubmit={(e) => { e.preventDefault(); addOrder(); }} className="flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            placeholder="Código del pedido..." />
          <button type="submit" disabled={loading || !code}
            className="px-5 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 transition disabled:opacity-40 flex items-center gap-2">
            <Plus size={18} /> Agregar
          </button>
        </form>
        {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
      </div>

      {/* Orders list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {orders.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Bike size={48} className="mx-auto mb-3 opacity-30" />
            <p className="font-semibold">Sin pedidos asignados</p>
            <p className="text-sm mt-1">Ingresá el código del pedido para empezar</p>
          </div>
        ) : orders.map((order, idx) => (
          <div key={order.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${idx === 0 ? "bg-emerald-500" : idx === 1 ? "bg-blue-500" : "bg-gray-500"}`}>
                  {idx + 1}
                </div>
                <div>
                  <p className="font-bold text-gray-900">#{order.number}</p>
                  <p className="text-xs text-gray-500">{order.customer}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => moveOrder(idx, -1)} disabled={idx === 0}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-20"><ChevronUp size={16} /></button>
                <button onClick={() => moveOrder(idx, 1)} disabled={idx === orders.length - 1}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 disabled:opacity-20"><ChevronDown size={16} /></button>
                <button onClick={() => removeOrder(order.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"><X size={16} /></button>
              </div>
            </div>

            {/* Address */}
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <MapPin size={14} className="mt-0.5 flex-shrink-0 text-gray-400" />
              <span>{order.address}</span>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button onClick={() => callCustomer(order.phone)} className="flex-1 py-2.5 bg-emerald-100 text-emerald-700 rounded-xl text-sm font-bold hover:bg-emerald-200 transition flex items-center justify-center gap-2">
                <Phone size={15} /> Llamar
              </button>
              <button onClick={() => openMap(order.lat, order.lng)} disabled={!order.lat || !order.lng}
                className="flex-1 py-2.5 bg-blue-100 text-blue-700 rounded-xl text-sm font-bold hover:bg-blue-200 transition disabled:opacity-40 flex items-center justify-center gap-2">
                <Navigation size={15} /> Navegar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
