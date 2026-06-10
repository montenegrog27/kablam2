"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Search, Download, Users, Phone, Calendar, Gift } from "lucide-react";

export default function EventoPage() {
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: r } = await supabase.from("users").select("tenant_id").eq("id", u.user.id).single();
    if (!r) return;

    const { data } = await supabase
      .from("event_registrations")
      .select("*")
      .eq("tenant_id", r.tenant_id)
      .order("created_at", { ascending: false });

    setRegistrations(data || []);
    setLoading(false);
  };

  const filtered = registrations.filter((r) =>
    r.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.phone?.includes(search)
  );

  const totalPeople = registrations.reduce((s, r) => s + 1 + Number(r.companions || 0), 0);

  const exportCSV = () => {
    const headers = ["Nombre", "Teléfono", "Acompañantes", "Total personas", "Fecha"];
    const rows = filtered.map((r) => [
      r.name, r.phone, r.companions || 0, 1 + Number(r.companions || 0),
      new Date(r.created_at).toLocaleString(),
    ]);
    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "cumple-mordisco.csv"; a.click();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2"><Gift className="text-pink-400" /> Cumple Mordisco</h1>
          <p className="text-sm text-gray-500 mt-0.5">{registrations.length} registros · {totalPeople} personas</p>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 bg-gray-900 text-gray-300 border border-gray-700 rounded-lg text-sm font-medium hover:bg-gray-800 transition">
          <Download size={14} /> Exportar CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Registros", value: registrations.length.toString(), icon: Users, color: "text-blue-400" },
          { label: "Personas total", value: totalPeople.toString(), icon: Users, color: "text-purple-400" },
          { label: "Prom. acompañantes", value: registrations.length > 0 ? (totalPeople / registrations.length - 1).toFixed(1) : "0", icon: Users, color: "text-pink-400" },
          { label: "Teléfonos", value: [...new Set(registrations.map((r) => r.phone))].length.toString(), icon: Phone, color: "text-green-400" },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon size={14} className={s.color} />
              <span className="text-xs text-gray-500">{s.label}</span>
            </div>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-sm bg-gray-900 text-gray-100 placeholder-gray-500"
          placeholder="Buscar por nombre o teléfono..." />
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">Sin registros</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {filtered.map((reg) => (
              <div key={reg.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-gray-800/30 transition">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                    {reg.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-100">{reg.name}</p>
                    <p className="text-xs text-gray-500">{reg.phone} · {1 + Number(reg.companions || 0)} persona(s)</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Users size={12} /> +{reg.companions || 0}
                  </span>
                  <p className="text-[10px] text-gray-600 mt-0.5">
                    {new Date(reg.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
