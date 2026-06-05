"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Save, Calculator } from "lucide-react";

const DEFAULT_FORM = {
  monthly_rent: "",
  monthly_gas: "",
  monthly_electricity: "",
  monthly_internet: "",
  monthly_payroll: "",
  operating_days_per_month: "26",
};

export default function FinancialSettingsPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: userRecord } = await supabase.from("users").select("tenant_id").eq("id", u.user.id).single();
    if (!userRecord?.tenant_id) return;
    setTenantId(userRecord.tenant_id);

    const { data } = await supabase
      .from("financial_settings")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id)
      .maybeSingle();

    if (data) {
      setForm({
        monthly_rent: String(data.monthly_rent || ""),
        monthly_gas: String(data.monthly_gas || ""),
        monthly_electricity: String(data.monthly_electricity || ""),
        monthly_internet: String(data.monthly_internet || ""),
        monthly_payroll: String(data.monthly_payroll || ""),
        operating_days_per_month: String(data.operating_days_per_month || 26),
      });
    }
    setLoading(false);
  };

  const totals = useMemo(() => {
    const fixed =
      Number(form.monthly_rent || 0) +
      Number(form.monthly_gas || 0) +
      Number(form.monthly_electricity || 0) +
      Number(form.monthly_internet || 0);
    const days = Math.max(1, Number(form.operating_days_per_month || 26));
    return {
      monthlyFixed: fixed,
      dailyFixed: fixed / days,
      dailyPayroll: Number(form.monthly_payroll || 0) / days,
    };
  }, [form]);

  const update = (key: keyof typeof DEFAULT_FORM, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    setSaving(true);
    setMessage("");

    const payload = {
      tenant_id: tenantId,
      monthly_rent: Number(form.monthly_rent || 0),
      monthly_gas: Number(form.monthly_gas || 0),
      monthly_electricity: Number(form.monthly_electricity || 0),
      monthly_internet: Number(form.monthly_internet || 0),
      monthly_payroll: Number(form.monthly_payroll || 0),
      operating_days_per_month: Math.max(1, Number(form.operating_days_per_month || 26)),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("financial_settings").upsert(payload, { onConflict: "tenant_id" });
    setSaving(false);
    if (error) setMessage(error.message);
    else setMessage("Configuracion financiera guardada");
  };

  if (loading) return <div className="text-sm text-gray-500">Cargando configuracion...</div>;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Configuracion Financiera</h1>
        <p className="mt-1 text-sm text-gray-500">
          Estos valores se prorratean en el reporte diario para calcular rentabilidad operativa real.
        </p>
      </div>

      <form onSubmit={save} className="rounded-xl border border-gray-700 bg-gray-900 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <MoneyField label="Alquiler mensual" value={form.monthly_rent} onChange={(value) => update("monthly_rent", value)} />
          <MoneyField label="Gas mensual" value={form.monthly_gas} onChange={(value) => update("monthly_gas", value)} />
          <MoneyField label="Electricidad mensual" value={form.monthly_electricity} onChange={(value) => update("monthly_electricity", value)} />
          <MoneyField label="Internet mensual" value={form.monthly_internet} onChange={(value) => update("monthly_internet", value)} />
          <MoneyField label="Sueldos mensual" value={form.monthly_payroll} onChange={(value) => update("monthly_payroll", value)} />
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-300">Dias operativos por mes</label>
            <input
              type="number"
              min="1"
              className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
              value={form.operating_days_per_month}
              onChange={(e) => update("operating_days_per_month", e.target.value)}
            />
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <SummaryCard label="Costos fijos mensuales" value={totals.monthlyFixed} />
          <SummaryCard label="Costos fijos diarios" value={totals.dailyFixed} />
          <SummaryCard label="Costo laboral diario" value={totals.dailyPayroll} />
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button disabled={saving} className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-bold text-gray-950 disabled:opacity-50">
            <Save size={16} /> {saving ? "Guardando..." : "Guardar"}
          </button>
          {message && <span className="text-sm text-gray-400">{message}</span>}
        </div>
      </form>
    </div>
  );
}

function MoneyField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-300">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          className="w-full rounded-lg border border-gray-600 bg-gray-800 py-2 pl-8 pr-3 text-sm text-gray-100"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-950 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        <Calculator size={13} /> {label}
      </div>
      <p className="text-xl font-bold tabular-nums text-gray-100">${Math.round(value).toLocaleString("es-AR")}</p>
    </div>
  );
}
