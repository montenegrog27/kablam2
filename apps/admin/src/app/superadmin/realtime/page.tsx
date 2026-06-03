"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { CheckCircle2, RefreshCw, Server, Shield, Wifi, XCircle } from "lucide-react";

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
  };
  branches: Array<{
    id: string;
    name: string | null;
    slug: string | null;
    tenant_id: string;
    tenants?: Array<{ name: string | null; slug: string | null }> | null;
  }>;
  checkedAt: string;
};

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
      }`}
    >
      {ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
      {label}
    </span>
  );
}

function formatUptime(seconds?: number) {
  if (!seconds) return "-";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export default function SuperadminRealtimePage() {
  const [data, setData] = useState<DiagnosticResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

    const response = await fetch("/api/realtime/diagnostics?scope=platform", {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Realtime KDS</h1>
          <p className="text-sm text-gray-600">Diagnostico global de infraestructura realtime.</p>
        </div>
        <button
          onClick={loadDiagnostics}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Actualizar
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-3 flex items-center justify-between text-gray-500">
            <span className="text-sm">Servidor</span>
            <Server size={18} />
          </div>
          <StatusPill ok={realtimeOk} label={realtimeOk ? "Online" : "Con problemas"} />
          <p className="mt-3 text-xs text-gray-500">{health ? `${health.latencyMs} ms` : "Sin datos"}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-3 flex items-center justify-between text-gray-500">
            <span className="text-sm">MQTT</span>
            <Shield size={18} />
          </div>
          <StatusPill ok={mqttOk} label={mqttOk ? "Conectado" : "Desconectado"} />
          <p className="mt-3 text-xs text-gray-500">Broker interno.</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-3 flex items-center justify-between text-gray-500">
            <span className="text-sm">WebSocket</span>
            <Wifi size={18} />
          </div>
          <StatusPill ok={wsOk} label={wsOk ? "Escuchando" : "Sin conexion"} />
          <p className="mt-3 text-xs text-gray-500">{health?.data.connectedClients ?? 0} clientes conectados.</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-3 flex items-center justify-between text-gray-500">
            <span className="text-sm">Uptime</span>
            <Server size={18} />
          </div>
          <p className="text-lg font-semibold text-gray-900">{formatUptime(health?.data.uptime)}</p>
          <p className="mt-3 text-xs text-gray-500">{health?.data.presenceRecords ?? 0} registros de presencia.</p>
        </div>
      </div>

      <div className="rounded-lg border bg-white">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Endpoints activos</h2>
        </div>
        <div className="grid gap-3 p-4 text-sm md:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase text-gray-500">HTTP</p>
            <p className="mt-1 break-all font-mono text-gray-900">{data?.realtime.httpUrl || "-"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-gray-500">WebSocket</p>
            <p className="mt-1 break-all font-mono text-gray-900">{data?.realtime.wsUrl || "-"}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-white">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Sucursales registradas</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Sucursal</th>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Branch ID</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data?.branches.map((branch) => (
                <tr key={branch.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{branch.name || branch.slug || branch.id}</td>
                  <td className="px-4 py-3 text-gray-600">{branch.tenants?.[0]?.name || branch.tenant_id}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{branch.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data && <p className="text-xs text-gray-500">Ultima revision: {new Date(data.checkedAt).toLocaleString()}</p>}
    </div>
  );
}
