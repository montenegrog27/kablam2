"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  Layers3,
  LineChart,
  Link2,
  Loader2,
  Megaphone,
  MousePointerClick,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  WalletCards,
  Wand2,
  type LucideIcon,
} from "lucide-react";

type Tab = "overview" | "campaigns" | "builder" | "audiences" | "integrations";

type MetaIntegration = {
  status?: string;
  updated_at?: string;
  token_masked?: string;
  metadata?: Record<string, unknown>;
} | null;

type MetaAccount = {
  id: string;
  provider_account_id: string;
  name: string;
  currency?: string | null;
  timezone_name?: string | null;
  business_name?: string | null;
  status?: string | null;
  is_primary?: boolean;
  last_synced_at?: string | null;
};

type MetaCampaign = {
  id: string;
  provider_campaign_id: string;
  name: string;
  objective?: string | null;
  status?: string | null;
  effective_status?: string | null;
  daily_budget?: number | string | null;
  lifetime_budget?: number | string | null;
  last_synced_at?: string | null;
};

type MetaAudience = {
  id: string;
  provider_audience_id?: string | null;
  name: string;
  subtype?: string | null;
  size_lower_bound?: number | null;
  size_upper_bound?: number | null;
  delivery_status?: string | null;
  operation_status?: string | null;
  source?: string | null;
};

type SyncRun = {
  id: string;
  status: string;
  sync_type: string;
  started_at: string;
  finished_at?: string | null;
  accounts_count: number;
  campaigns_count: number;
  insights_count: number;
  error?: string | null;
};

type InsightPoint = {
  date: string;
  spend: number;
  purchase_value: number;
  clicks: number;
};

type AdsSummary = {
  integration: MetaIntegration;
  accounts: MetaAccount[];
  campaigns: MetaCampaign[];
  audiences: MetaAudience[];
  syncRuns: SyncRun[];
  insights: {
    totals: {
      spend: number;
      impressions: number;
      clicks: number;
      inline_link_clicks: number;
      purchases: number;
      purchase_value: number;
      leads: number;
      roas: number;
      ctr: number;
      cpa: number;
    };
    byDate: InsightPoint[];
  };
};

const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Resumen", icon: BarChart3 },
  { id: "campaigns", label: "Campanas", icon: Megaphone },
  { id: "builder", label: "Crear draft", icon: Wand2 },
  { id: "audiences", label: "Audiencias", icon: Users },
  { id: "integrations", label: "Integracion", icon: Link2 },
];

const emptySummary: AdsSummary = {
  integration: null,
  accounts: [],
  campaigns: [],
  audiences: [],
  syncRuns: [],
  insights: {
    totals: {
      spend: 0,
      impressions: 0,
      clicks: 0,
      inline_link_clicks: 0,
      purchases: 0,
      purchase_value: 0,
      leads: 0,
      roas: 0,
      ctr: 0,
      cpa: 0,
    },
    byDate: [],
  },
};

const money = (value: number | string | null | undefined) => `$${Math.round(Number(value || 0)).toLocaleString("es-AR")}`;
const compact = (value: number | string | null | undefined) => Number(value || 0).toLocaleString("es-AR", { notation: "compact", maximumFractionDigits: 1 });
const pct = (value: number) => `${value.toFixed(1)}%`;

export default function AdsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [summary, setSummary] = useState<AdsSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [draftObjective, setDraftObjective] = useState("Pedidos online");
  const [draftBudget, setDraftBudget] = useState(12000);
  const [draftAudience, setDraftAudience] = useState("Compradores recientes + lookalike");

  const authHeaders = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("No hay sesion activa.");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/ads/meta/summary", { headers: await authHeaders() });
      const data = (await response.json()) as AdsSummary & { error?: string; details?: string };
      if (!response.ok) throw new Error(data.details || data.error || "No se pudo cargar Meta Ads.");
      setSummary(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar Meta Ads.");
      setSummary(emptySummary);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const connected = summary.integration?.status === "active";
  const totals = summary.insights.totals;
  const lastSync = summary.syncRuns[0];

  const filteredCampaigns = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return summary.campaigns;
    return summary.campaigns.filter((campaign) => {
      return (
        campaign.name.toLowerCase().includes(query) ||
        campaign.provider_campaign_id.toLowerCase().includes(query) ||
        String(campaign.objective || "").toLowerCase().includes(query)
      );
    });
  }, [search, summary.campaigns]);

  const connectMeta = async () => {
    setConnecting(true);
    setMessage("");
    try {
      const response = await fetch("/api/ads/meta/connect", {
        method: "POST",
        headers: await authHeaders(),
      });
      const data = (await response.json()) as { authUrl?: string; error?: string; details?: string };
      if (!response.ok || !data.authUrl) throw new Error(data.details || data.error || "No se pudo iniciar OAuth.");
      window.location.href = data.authUrl;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo conectar Meta.");
      setConnecting(false);
    }
  };

  const syncMeta = async () => {
    setSyncing(true);
    setMessage("");
    try {
      const response = await fetch("/api/ads/meta/sync", {
        method: "POST",
        headers: await authHeaders(),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; details?: string; accounts?: number; campaigns?: number; insights?: number };
      if (!response.ok) throw new Error(data.details || data.error || "No se pudo sincronizar.");
      setMessage(`Sync OK: ${data.accounts || 0} cuentas, ${data.campaigns || 0} campanas, ${data.insights || 0} filas de metricas.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo sincronizar Meta.");
    } finally {
      setSyncing(false);
    }
  };

  const forecastRevenue = draftBudget * 7 * 5.5;
  const forecastOrders = Math.max(1, Math.round(forecastRevenue / 9800));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-cyan-300">
            <Target size={16} />
            Meta Ads Command Center
          </div>
          <h1 className="mt-2 text-3xl font-bold text-white">Ads Center</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
            Integracion multi-tenant con Meta Marketing API para cuentas, campanas, insights y atribucion comercial del POS.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <IconButton icon={Link2} label={connected ? "Reconectar Meta" : "Conectar Meta"} onClick={connectMeta} loading={connecting} variant={connected ? "secondary" : "primary"} />
          <IconButton icon={RefreshCw} label="Sincronizar" onClick={syncMeta} loading={syncing} disabled={!connected} />
          <IconButton icon={Plus} label="Nuevo draft" onClick={() => setTab("builder")} variant="secondary" />
        </div>
      </header>

      {message && (
        <div className="flex items-start gap-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          {message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi icon={CircleDollarSign} label="Revenue atribuido Meta" value={money(totals.purchase_value)} delta={`${totals.purchases.toFixed(0)} compras reportadas`} tone="emerald" />
        <Kpi icon={WalletCards} label="Inversion Meta" value={money(totals.spend)} delta={`${money(totals.cpa)} CPA medio`} tone="amber" />
        <Kpi icon={TrendingUp} label="ROAS Meta" value={`${totals.roas.toFixed(2)}x`} delta="Ultimos 30 dias sincronizados" tone="cyan" />
        <Kpi icon={MousePointerClick} label="CTR Meta" value={pct(totals.ctr)} delta={`${compact(totals.clicks)} clicks / ${compact(totals.impressions)} impresiones`} tone="violet" />
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-gray-800">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
              tab === id ? "border-cyan-400 text-white" : "border-transparent text-gray-500 hover:text-gray-200"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border border-gray-800 bg-gray-900 py-16 text-gray-400">
          <Loader2 className="mr-2 animate-spin" size={18} />
          Cargando Meta Ads...
        </div>
      ) : (
        <>
          {tab === "overview" && (
            <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
              <Panel title="Performance diaria" icon={LineChart} action="Ultimos 30 dias">
                {summary.insights.byDate.length === 0 ? (
                  <EmptyState title="Sin insights sincronizados" detail="Conecta Meta y ejecuta una sincronizacion para ver gasto, conversiones y ROAS." />
                ) : (
                  <div className="space-y-4">
                    {summary.insights.byDate.slice(-10).map((point) => {
                      const maxRevenue = Math.max(1, ...summary.insights.byDate.map((item) => item.purchase_value));
                      const maxSpend = Math.max(1, ...summary.insights.byDate.map((item) => item.spend));
                      return (
                        <div key={point.date} className="grid grid-cols-[92px_1fr_100px] items-center gap-3">
                          <span className="text-xs font-semibold text-gray-400">{point.date.slice(5)}</span>
                          <div className="space-y-1.5">
                            <div className="h-2 rounded bg-gray-800">
                              <div className="h-2 rounded bg-cyan-400" style={{ width: `${Math.max(5, (point.purchase_value / maxRevenue) * 100)}%` }} />
                            </div>
                            <div className="h-2 rounded bg-gray-800">
                              <div className="h-2 rounded bg-amber-400" style={{ width: `${Math.max(5, (point.spend / maxSpend) * 100)}%` }} />
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-bold text-white">{money(point.purchase_value)}</p>
                            <p className="text-[10px] text-gray-500">{money(point.spend)}</p>
                          </div>
                        </div>
                      );
                    })}
                    <div className="mt-5 flex gap-4 text-xs text-gray-400">
                      <Legend color="bg-cyan-400" label="Purchase value" />
                      <Legend color="bg-amber-400" label="Spend" />
                    </div>
                  </div>
                )}
              </Panel>

              <Panel title="Estado de integracion" icon={ShieldCheck} action={connected ? "Conectado" : "Pendiente"}>
                <div className="space-y-3">
                  <HealthRow label="OAuth Meta" value={connected ? 100 : 0} />
                  <HealthRow label="Cuentas detectadas" value={summary.accounts.length > 0 ? 100 : 0} />
                  <HealthRow label="Campanas sincronizadas" value={summary.campaigns.length > 0 ? 100 : 0} />
                  <HealthRow label="Insights 30 dias" value={summary.insights.byDate.length > 0 ? 100 : 0} />
                </div>
                <div className="mt-5 rounded-lg border border-gray-800 bg-gray-950 p-4">
                  <p className="text-xs font-semibold uppercase text-gray-500">Ultimo sync</p>
                  <p className="mt-1 text-sm font-bold text-white">{lastSync ? new Date(lastSync.started_at).toLocaleString("es-AR") : "Nunca"}</p>
                  {lastSync?.error && <p className="mt-2 text-xs text-red-300">{lastSync.error}</p>}
                </div>
              </Panel>

              <Panel title="Cuentas publicitarias" icon={Layers3} action={`${summary.accounts.length} cuentas`}>
                <div className="grid gap-3 md:grid-cols-2">
                  {summary.accounts.length === 0 ? (
                    <EmptyState title="No hay cuentas" detail="Meta va a devolver las ad accounts disponibles para el usuario autorizado." />
                  ) : summary.accounts.map((account) => (
                    <div key={account.id} className="rounded-lg border border-gray-800 bg-gray-950 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-white">{account.name}</p>
                          <p className="mt-1 text-xs text-gray-500">{account.provider_account_id}</p>
                        </div>
                        {account.is_primary && <span className="rounded-md bg-cyan-500/10 px-2 py-1 text-[10px] font-bold text-cyan-300">Principal</span>}
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <MiniMetric label="Moneda" value={account.currency || "-"} />
                        <MiniMetric label="Timezone" value={account.timezone_name || "-"} />
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Optimizacion" icon={Sparkles} action="AI ready">
                <div className="space-y-3">
                  <Insight title="Atribucion POS pendiente" detail="Meta reporta Purchase Value. El siguiente paso pro es cruzarlo con ordenes reales por UTM/click_id para ROAS propio de Kablam." value="Prioridad alta" />
                  <Insight title="Crear reglas automaticas" detail="Cuando haya 7 dias de datos, se pueden sugerir pausas por CPA y escalado por ROAS." value="Proximo" />
                  <Insight title="Audiencias CRM" detail="La base de clientes ya existe en el POS. Falta exportar hashes a Custom Audiences con consentimiento." value="Growth" />
                </div>
              </Panel>
            </div>
          )}

          {tab === "campaigns" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
                <Search size={16} className="text-gray-500" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar campana, objetivo o ID"
                  className="w-full bg-transparent text-sm text-white outline-none placeholder:text-gray-600"
                />
              </div>
              <div className="overflow-hidden rounded-lg border border-gray-800 bg-gray-900">
                <div className="grid min-w-[900px] grid-cols-[1.5fr_150px_120px_120px_120px_120px] gap-3 border-b border-gray-800 px-4 py-3 text-[10px] font-bold uppercase text-gray-500">
                  <span>Campana</span>
                  <span>Objetivo</span>
                  <span>Estado</span>
                  <span>Budget diario</span>
                  <span>Budget lifetime</span>
                  <span>Acciones</span>
                </div>
                <div className="overflow-x-auto">
                  {filteredCampaigns.length === 0 ? (
                    <div className="px-4 py-10">
                      <EmptyState title="Sin campanas Meta" detail="Sincroniza para importar campanas desde la cuenta publicitaria conectada." />
                    </div>
                  ) : filteredCampaigns.map((campaign) => (
                    <div key={campaign.id} className="grid min-w-[900px] grid-cols-[1.5fr_150px_120px_120px_120px_120px] items-center gap-3 border-b border-gray-800 px-4 py-3 last:border-b-0 hover:bg-gray-800/40">
                      <div>
                        <p className="text-sm font-semibold text-white">{campaign.name}</p>
                        <p className="text-xs text-gray-500">{campaign.provider_campaign_id}</p>
                      </div>
                      <span className="text-xs text-gray-300">{campaign.objective || "-"}</span>
                      <StatusPill value={campaign.effective_status || campaign.status || "unknown"} />
                      <span className="text-sm text-gray-300">{campaign.daily_budget ? money(campaign.daily_budget) : "-"}</span>
                      <span className="text-sm text-gray-300">{campaign.lifetime_budget ? money(campaign.lifetime_budget) : "-"}</span>
                      <div className="flex gap-1">
                        <TinyButton icon={Eye} label="Ver" />
                        <TinyButton icon={(campaign.effective_status || campaign.status) === "PAUSED" ? Play : Pause} label="Estado" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "builder" && (
            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <Panel title="Draft de campana Meta" icon={Wand2} action="No publica todavia">
                <div className="space-y-4">
                  <Field label="Objetivo">
                    <select value={draftObjective} onChange={(event) => setDraftObjective(event.target.value)} className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none">
                      <option>Pedidos online</option>
                      <option>WhatsApp leads</option>
                      <option>Remarketing de clientes</option>
                      <option>Alcance local</option>
                    </select>
                  </Field>
                  <Field label="Audiencia">
                    <select value={draftAudience} onChange={(event) => setDraftAudience(event.target.value)} className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none">
                      <option>Compradores recientes + lookalike</option>
                      <option>Clientes dormidos 45 a 120 dias</option>
                      <option>Radio local por sucursal</option>
                      <option>Carrito iniciado sin compra</option>
                    </select>
                  </Field>
                  <Field label={`Presupuesto diario: ${money(draftBudget)}`}>
                    <input type="range" min={3000} max={50000} step={1000} value={draftBudget} onChange={(event) => setDraftBudget(Number(event.target.value))} className="w-full accent-cyan-400" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <MiniMetric label="Revenue 7d estimado" value={money(forecastRevenue)} />
                    <MiniMetric label="Pedidos estimados" value={String(forecastOrders)} />
                    <MiniMetric label="ROAS objetivo" value={`${(forecastRevenue / (draftBudget * 7)).toFixed(1)}x`} />
                    <MiniMetric label="CPA maximo" value={money((draftBudget * 7) / forecastOrders)} />
                  </div>
                  <IconButton icon={Send} label="Guardar draft interno" disabled />
                </div>
              </Panel>

              <Panel title="Checklist para publicar" icon={Layers3} action="Profesional">
                <div className="space-y-3">
                  <ChecklistItem done={connected} title="Cuenta Meta conectada" detail="OAuth multi-tenant con token guardado server-side." />
                  <ChecklistItem done={summary.accounts.length > 0} title="Ad account detectada" detail="La cuenta publicitaria queda normalizada en ad_accounts." />
                  <ChecklistItem done={summary.campaigns.length > 0} title="Campanas importadas" detail="Se sincronizan status, objetivo y presupuestos." />
                  <ChecklistItem title="Creativos y aprobacion" detail="Antes de publicar pauta real, hay que cargar assets y pedir confirmacion explicita." />
                </div>
              </Panel>
            </div>
          )}

          {tab === "audiences" && (
            <div className="grid gap-4 lg:grid-cols-2">
              {summary.audiences.length === 0 ? (
                <Panel title="Audiencias Meta" icon={Users} action="Proximo paso">
                  <EmptyState title="Aun no se sincronizan audiencias" detail="La base esta preparada. El siguiente endpoint puede traer Custom Audiences y despues exportar segmentos CRM con hashing." />
                </Panel>
              ) : summary.audiences.map((audience) => (
                <Panel key={audience.id} title={audience.name} icon={Users} action={audience.subtype || "Meta"}>
                  <div className="grid grid-cols-3 gap-3">
                    <MiniMetric label="Tamano min" value={compact(audience.size_lower_bound)} />
                    <MiniMetric label="Tamano max" value={compact(audience.size_upper_bound)} />
                    <MiniMetric label="Estado" value={audience.delivery_status || audience.operation_status || "-"} />
                  </div>
                </Panel>
              ))}
            </div>
          )}

          {tab === "integrations" && (
            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <Panel title="Meta Marketing API" icon={Link2} action={connected ? "Conectado" : "No conectado"}>
                <div className="space-y-4">
                  <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
                    <p className="text-xs font-semibold uppercase text-gray-500">Token</p>
                    <p className="mt-1 text-sm font-bold text-white">{summary.integration?.token_masked || "Sin token"}</p>
                  </div>
                  <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
                    <p className="text-xs font-semibold uppercase text-gray-500">Actualizado</p>
                    <p className="mt-1 text-sm font-bold text-white">{summary.integration?.updated_at ? new Date(summary.integration.updated_at).toLocaleString("es-AR") : "Nunca"}</p>
                  </div>
                  <div className="flex gap-2">
                    <IconButton icon={Link2} label={connected ? "Reconectar" : "Conectar"} onClick={connectMeta} loading={connecting} />
                    <IconButton icon={RefreshCw} label="Sync" onClick={syncMeta} loading={syncing} disabled={!connected} variant="secondary" />
                  </div>
                </div>
              </Panel>

              <Panel title="Requisitos tecnicos" icon={ShieldCheck} action="Meta">
                <div className="space-y-3">
                  <ChecklistItem done={connected} title="OAuth app" detail="Variables requeridas: META_APP_ID, META_APP_SECRET, META_REDIRECT_URI." />
                  <ChecklistItem done={summary.accounts.length > 0} title="Permisos" detail="Scopes solicitados: ads_read, ads_management, business_management." />
                  <ChecklistItem done={summary.insights.byDate.length > 0} title="Insights API" detail="Se consulta nivel campaign con time_increment diario." />
                  <ChecklistItem title="Eventos server-side" detail="Siguiente etapa: Meta Pixel + Conversions API para medir ordenes propias." />
                </div>
              </Panel>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, delta, tone }: { icon: LucideIcon; label: string; value: string; delta: string; tone: "emerald" | "amber" | "cyan" | "violet" }) {
  const tones = {
    emerald: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
    amber: "text-amber-300 bg-amber-500/10 border-amber-500/20",
    cyan: "text-cyan-300 bg-cyan-500/10 border-cyan-500/20",
    violet: "text-violet-300 bg-violet-500/10 border-violet-500/20",
  };
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${tones[tone]}`}>
          <Icon size={18} />
        </div>
        <ArrowUpRight size={16} className="text-gray-600" />
      </div>
      <p className="mt-4 text-xs font-semibold uppercase text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
      <p className="mt-2 text-xs text-gray-400">{delta}</p>
    </div>
  );
}

function Panel({ title, icon: Icon, action, children }: { title: string; icon: LucideIcon; action?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-800 text-cyan-300">
            <Icon size={17} />
          </div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
        </div>
        {action && <span className="rounded-md border border-gray-700 px-2 py-1 text-xs font-semibold text-gray-400">{action}</span>}
      </div>
      {children}
    </section>
  );
}

function IconButton({ icon: Icon, label, onClick, variant = "primary", loading = false, disabled = false }: { icon: LucideIcon; label: string; onClick?: () => void; variant?: "primary" | "secondary"; loading?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        variant === "primary"
          ? "border-cyan-400 bg-cyan-400 text-gray-950 hover:bg-cyan-300"
          : "border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-500 hover:text-white"
      }`}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}
      {label}
    </button>
  );
}

function TinyButton({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button title={label} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-700 text-gray-400 hover:border-cyan-400 hover:text-cyan-200">
      <Icon size={15} />
    </button>
  );
}

function Insight({ title, detail, value }: { title: string; detail: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-xs leading-5 text-gray-400">{detail}</p>
        </div>
        <span className="shrink-0 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-300">{value}</span>
      </div>
    </div>
  );
}

function HealthRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="font-bold text-white">{value}%</span>
      </div>
      <div className="h-2 rounded bg-gray-800">
        <div className="h-2 rounded bg-cyan-400" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded ${color}`} />
      {label}
    </span>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase text-gray-500">{label}</span>
      {children}
    </label>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
      <p className="text-[10px] font-semibold uppercase text-gray-500">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function ChecklistItem({ title, detail, done = false }: { title: string; detail: string; done?: boolean }) {
  return (
    <div className="flex gap-3 rounded-lg border border-gray-800 bg-gray-950 p-4">
      <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${done ? "bg-emerald-500 text-gray-950" : "bg-gray-800 text-gray-500"}`}>
        {done ? <BadgeCheck size={15} /> : <CheckCircle2 size={15} />}
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-xs leading-5 text-gray-400">{detail}</p>
      </div>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const classes = normalized.includes("active")
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
    : normalized.includes("pause")
      ? "border-gray-500/30 bg-gray-500/10 text-gray-300"
      : "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return <span className={`w-fit rounded-md border px-2 py-1 text-xs font-semibold ${classes}`}>{value}</span>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-700 bg-gray-950 p-6 text-center">
      <p className="text-sm font-bold text-white">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-gray-500">{detail}</p>
    </div>
  );
}
