"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { MessageCircle, RefreshCw, Save, Search, Send, Settings, Ticket, Users } from "lucide-react";

const currency = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const defaultMessage =
  "Hola! Tu invitacion para el Primer Aniversario Mordisco ya esta registrada. Guarda este WhatsApp: vamos a enviarte novedades del evento por aca.";

export default function AnniversaryDashboardPage() {
  const [items, setItems] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [message, setMessage] = useState(defaultMessage);
  const [result, setResult] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const response = await fetch("/api/anniversary-invitations", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await response.json();
    setItems(Array.isArray(data.invitations) ? data.invitations : []);
    setLots(Array.isArray(data.lots) ? data.lots : []);
    setResult(data.error ? `${data.error}${data.detail ? `: ${data.detail}` : ""}` : "");
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (tier && item.benefit_tier !== tier) return false;
      if (!term) return true;
      return [item.customer_name, item.whatsapp, item.invitation_code, item.lot_name]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [items, search, tier]);

  const totals = useMemo(() => ({
    count: items.length,
    revenue: items.reduce((sum, item) => sum + Number(item.price || 0), 0),
    founders: items.filter((item) => item.benefit_tier === "founder").length,
    community: items.filter((item) => item.benefit_tier === "community").length,
  }), [items]);

  const lotStats = useMemo(() => {
    const sold = new Map<string, number>();
    items.forEach((item) => {
      if (!item.lot_key) return;
      sold.set(item.lot_key, (sold.get(item.lot_key) || 0) + 1);
    });
    return sold;
  }, [items]);

  const updateLot = (index: number, key: string, value: string | number | boolean) => {
    setLots((prev) => prev.map((lot, lotIndex) => (lotIndex === index ? { ...lot, [key]: value } : lot)));
  };

  const saveLots = async () => {
    setLoading(true);
    setResult("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const response = await fetch("/api/anniversary-invitations", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ lots }),
    });
    const data = await response.json();
    setResult(data.error ? `${data.error}${data.detail ? `: ${data.detail}` : ""}` : "Lotes guardados.");
    if (Array.isArray(data.lots)) setLots(data.lots);
    setLoading(false);
  };

  const sendWhatsapp = async () => {
    if (!selected) return;
    setLoading(true);
    setResult("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const response = await fetch("/api/anniversary-invitations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ invitationId: selected.id, message }),
    });
    const data = await response.json();
    setResult(data.error ? `${data.error}${data.detail ? `: ${JSON.stringify(data.detail)}` : ""}` : "WhatsApp enviado.");
    await load();
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-gray-500">Cumple Mordisco</p>
          <h1 className="text-2xl font-bold text-gray-100">Inscriptos aniversario</h1>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-100">
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Inscriptos", value: totals.count.toString(), icon: Users },
          { label: "Recaudacion", value: currency.format(totals.revenue), icon: Ticket },
          { label: "Fundadores", value: totals.founders.toString(), icon: Ticket },
          { label: "Comunidad", value: totals.community.toString(), icon: Ticket },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <div className="mb-2 flex items-center gap-2 text-gray-500">
              <stat.icon size={16} />
              <p className="text-xs">{stat.label}</p>
            </div>
            <p className="text-xl font-bold text-gray-100">{stat.value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Settings size={17} className="text-gray-500" />
            <h2 className="font-bold text-gray-100">Configurar lotes</h2>
          </div>
          <button onClick={saveLots} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-bold text-black disabled:opacity-50">
            <Save size={16} />
            Guardar lotes
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {lots.map((lot, index) => {
            const sold = lotStats.get(lot.lot_key) || 0;
            const capacity = Number(lot.capacity || 0);
            const available = capacity > 0 ? Math.max(capacity - sold, 0) : null;

            return (
              <div key={lot.lot_key || index} className="rounded-lg border border-gray-800 bg-gray-950 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <input
                    value={lot.name || ""}
                    onChange={(event) => updateLot(index, "name", event.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-semibold text-gray-100 outline-none"
                  />
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    <input
                      type="checkbox"
                      checked={Boolean(lot.is_active)}
                      onChange={(event) => updateLot(index, "is_active", event.target.checked)}
                    />
                    Activo
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label>
                    <span className="mb-1 block text-xs text-gray-500">Precio</span>
                    <input
                      type="number"
                      value={Number(lot.base_price || 0)}
                      onChange={(event) => updateLot(index, "base_price", Number(event.target.value || 0))}
                      className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none"
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs text-gray-500">Cupo</span>
                    <input
                      type="number"
                      value={Number(lot.capacity || 0)}
                      onChange={(event) => updateLot(index, "capacity", Number(event.target.value || 0))}
                      className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none"
                    />
                  </label>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                  <span>Vendidas: {sold}</span>
                  <span>{available === null ? "Cupo ilimitado" : `Disponibles: ${available}`}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <section className="rounded-lg border border-gray-800 bg-gray-900">
          <div className="grid gap-3 border-b border-gray-800 p-4 md:grid-cols-[1fr_180px]">
            <label className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nombre, WhatsApp, codigo o lote"
                className="w-full rounded-lg border border-gray-700 bg-gray-950 py-2 pl-9 pr-3 text-sm text-gray-100 outline-none"
              />
            </label>
            <select value={tier} onChange={(event) => setTier(event.target.value)} className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100">
              <option value="">Todas las categorias</option>
              <option value="general">Invitado General</option>
              <option value="community">Comunidad</option>
              <option value="founder">Fundadores</option>
            </select>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">Sin inscriptos</div>
          ) : (
            <div className="max-h-[650px] overflow-auto">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelected(item);
                    setMessage(
                      `Hola ${item.customer_name}! Tu invitacion ${item.invitation_code} para el Primer Aniversario Mordisco esta confirmada. Tu acceso: ${item.lot_name || "Cumple Mordisco"} (${currency.format(Number(item.price || 0))}).`,
                    );
                  }}
                  className={`grid w-full grid-cols-12 gap-2 border-b border-gray-800 px-4 py-3 text-left hover:bg-gray-800/60 ${
                    selected?.id === item.id ? "bg-gray-800" : ""
                  }`}
                >
                  <div className="col-span-4">
                    <p className="font-semibold text-gray-100">{item.customer_name}</p>
                    <p className="text-xs text-gray-500">{item.whatsapp}</p>
                  </div>
                  <div className="col-span-3 text-sm text-gray-300">{item.invitation_code}</div>
                  <div className="col-span-2 text-sm text-gray-400">{item.lot_name || "-"}</div>
                  <div className="col-span-2 text-right text-sm font-semibold text-emerald-300">{currency.format(Number(item.price || 0))}</div>
                  <div className="col-span-1 flex justify-end">
                    <MessageCircle size={16} className={item.last_whatsapp_sent_at ? "text-emerald-400" : "text-gray-500"} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="font-bold text-gray-100">WhatsApp</h2>
          {!selected ? (
            <p className="mt-4 text-sm text-gray-500">Selecciona un inscripto para enviarle un mensaje.</p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg bg-gray-950 p-3">
                <p className="font-semibold text-gray-100">{selected.customer_name}</p>
                <p className="text-sm text-gray-500">{selected.whatsapp}</p>
                {selected.last_whatsapp_sent_at && (
                  <p className="mt-2 text-xs text-emerald-400">Ultimo WhatsApp: {new Date(selected.last_whatsapp_sent_at).toLocaleString("es-AR")}</p>
                )}
              </div>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={8}
                className="w-full rounded-lg border border-gray-700 bg-gray-950 p-3 text-sm text-gray-100 outline-none"
              />
              <button onClick={sendWhatsapp} disabled={loading || !message.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 text-sm font-bold text-black disabled:opacity-50">
                <Send size={16} />
                Enviar WhatsApp
              </button>
            </div>
          )}
          {result && <p className="mt-4 rounded-lg bg-gray-950 p-3 text-sm text-gray-300">{result}</p>}
        </aside>
      </div>
    </div>
  );
}
