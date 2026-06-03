"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Activity, CheckCircle2, RefreshCw, Server, Wifi, XCircle } from "lucide-react";

type DiagnosticResponse = {
  realtime: {
    httpUrl: string;
    wsUrl: string;
    health: {
      ok: boolean;
      status: number;
      latencyMs: number;
      data: {
        status?: string;
        mqtt?: string;
        websocket?: string;
        connectedClients?: number;
        presenceRecords?: number;
        uptime?: number;
      };
    };
    presence: {
      ok: boolean;
      status: number;
      latencyMs: number;
      data: {
        clients?: Array<{
          clientId: string;
          tenantId: string;
          branchId: string;
          role: string;
          connectedAt: number;
          lastHeartbeat: number;
        }>;
      };
    } | null;
  };
  branches: Array<{
    id: string;
    name: string | null;
    slug: string | null;
    tenant_id: string;
  }>;
  checkedAt: string;
};

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"
      }`}
    >
      {ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
      {label}
    </span>
  );
}

function formatRelativeTime(timestamp?: number) {
  if (!timestamp) return "-";
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `hace ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes}m`;
  return `hace ${Math.round(minutes / 60)}h`;
}

export default function RealtimeDiagnosticsPage() {
  const [data, setData] = useState<DiagnosticResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const clients = data?.realtime.presence?.data.clients || [];
  const clientsByBranch = useMemo(() => {
    const map = new Map<string, typeof clients>();
    for (const client of clients) {
      map.set(client.branchId, [...(map.get(client.branchId) || []), client]);
    }
    return map;
  }, [clients]);

  const loadDiagnostics = async () => {
    setLoading(true);
    setError("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("No hay sesion activa.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/realtime/diagnostics", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const json = await response.json();

    if (!response.ok) {
      setError(json?.details || json?.error || "No se pudo cargar el diagnostico.");
      setLoading(false);
      return;
    }

    setData(json);
    setLoading(false);
  };

  useEffect(() => {
    loadDiagnostics();
  }, []);

  const health = data?.realtime.health;
  const realtimeOk = Boolean(health?.ok && health.data.status === "ok");
  const mqttOk = health?.data.mqtt === "connected";
  const wsOk = health?.data.websocket === "listening";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Realtime KDS</h1>
          <p className="text-sm text-gray-400">Estado de conexion de cocina y cajas por sucursal.</p>
        </div>
        <button
          onClick={loadDiagnostics}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-950 hover:bg-gray-200 disabled:opacity-60"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Actualizar
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-gray-400">Servidor</span>
            <Server size={18} className="text-gray-500" />
          </div>
          <StatusPill ok={realtimeOk} label={realtimeOk ? "Online" : "Con problemas"} />
          <p className="mt-3 text-xs text-gray-500">{health ? `${health.latencyMs} ms` : "Sin datos"}</p>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-gray-400">MQTT</span>
            <Activity size={18} className="text-gray-500" />
          </div>
          <StatusPill ok={mqttOk} label={mqttOk ? "Conectado" : "Desconectado"} />
          <p className="mt-3 text-xs text-gray-500">Canal interno de eventos.</p>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-gray-400">WebSocket</span>
            <Wifi size={18} className="text-gray-500" />
          </div>
          <StatusPill ok={wsOk} label={wsOk ? "Escuchando" : "Sin conexion"} />
          <p className="mt-3 text-xs text-gray-500">{clients.length} clientes conectados.</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-100">Sucursales</h2>
        </div>
        <div className="divide-y divide-gray-800">
          {data?.branches.map((branch) => {
            const branchClients = clientsByBranch.get(branch.id) || [];
            return (
              <div key={branch.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-gray-100">{branch.name || branch.slug || branch.id}</p>
                  <p className="text-xs text-gray-500">{branch.id}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill ok={branchClients.length > 0} label={branchClients.length > 0 ? "KDS conectado" : "Sin KDS conectado"} />
                  <span className="rounded-full bg-gray-800 px-2.5 py-1 text-xs text-gray-300">{branchClients.length} clientes</span>
                  {branchClients[0] && (
                    <span className="text-xs text-gray-500">ultimo pulso {formatRelativeTime(branchClients[0].lastHeartbeat)}</span>
                  )}
                </div>
              </div>
            );
          })}
          {!loading && data?.branches.length === 0 && <div className="px-4 py-8 text-center text-sm text-gray-500">No hay sucursales para mostrar.</div>}
        </div>
      </div>

      {data && <p className="text-xs text-gray-500">Ultima revision: {new Date(data.checkedAt).toLocaleString()}</p>}
    </div>
  );
}
