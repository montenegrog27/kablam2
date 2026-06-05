"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { Save, Calculator, Plus, Trash2, Building2, Users } from "lucide-react";

type Frequency = "MONTHLY" | "WEEKLY" | "BIWEEKLY" | "EVERY_X_DAYS" | "MANUAL";

type CostItem = {
  id: string;
  name: string;
  amount: string;
  frequency: Frequency;
  everyDays: string;
  lastPaidAt: string;
  notes?: string;
};

type WhatsappRecipient = {
  id: string;
  name: string;
  phone: string;
};

type BranchOption = {
  id: string;
  name: string;
  slug: string;
};

const DEFAULT_FORM = {
  monthly_rent: "",
  monthly_gas: "",
  monthly_electricity: "",
  monthly_internet: "",
  monthly_payroll: "",
  operating_days_per_month: "26",
  daily_report_whatsapp_enabled: false,
  daily_report_whatsapp_phone: "",
};

const emptyItem = (): CostItem => ({
  id: crypto.randomUUID(),
  name: "",
  amount: "",
  frequency: "MONTHLY",
  everyDays: "",
  lastPaidAt: "",
  notes: "",
});

const emptyRecipient = (): WhatsappRecipient => ({
  id: crypto.randomUUID(),
  name: "",
  phone: "",
});

function getMonthlyEquivalent(item: Pick<CostItem, "amount" | "frequency" | "everyDays">) {
  const amount = Number(item.amount || 0);
  if (item.frequency === "WEEKLY") return amount * 52 / 12;
  if (item.frequency === "BIWEEKLY") return amount * 26 / 12;
  if (item.frequency === "EVERY_X_DAYS") {
    const days = Math.max(1, Number(item.everyDays || 1));
    return amount * 30 / days;
  }
  if (item.frequency === "MANUAL") return 0;
  return amount;
}

const normalizeItems = (items: CostItem[]) =>
  items
    .map((item) => ({
      id: item.id || crypto.randomUUID(),
      name: item.name.trim(),
      amount: Number(item.amount || 0),
      frequency: item.frequency || "MONTHLY",
      everyDays: Math.max(0, Number(item.everyDays || 0)),
      lastPaidAt: item.lastPaidAt || null,
      monthlyEquivalent: getMonthlyEquivalent(item),
      notes: item.notes?.trim() || "",
    }))
    .filter((item) => item.name || item.amount > 0);

export default function FinancialSettingsPage() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [fixedCostItems, setFixedCostItems] = useState<CostItem[]>([]);
  const [payrollItems, setPayrollItems] = useState<CostItem[]>([]);
  const [whatsappRecipients, setWhatsappRecipients] = useState<WhatsappRecipient[]>([]);
  const [resendDate, setResendDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [resendBranchId, setResendBranchId] = useState("");
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [resending, setResending] = useState(false);
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

    const { data: branchRows } = await supabase
      .from("branches")
      .select("id, name, slug")
      .eq("tenant_id", userRecord.tenant_id)
      .order("name", { ascending: true });
    const branchOptions = (branchRows || []).map((branch: any) => ({
      id: branch.id,
      name: branch.name || branch.slug || "Sucursal",
      slug: branch.slug || "",
    }));
    setBranches(branchOptions);
    setResendBranchId((current) => current || branchOptions[0]?.id || "");

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
        daily_report_whatsapp_enabled: Boolean(data.daily_report_whatsapp_enabled),
        daily_report_whatsapp_phone: String(data.daily_report_whatsapp_phone || ""),
      });
      const recipients = Array.isArray(data.daily_report_whatsapp_recipients)
        ? data.daily_report_whatsapp_recipients
        : [];
      setWhatsappRecipients(
        recipients.length > 0
          ? recipients.map((item: any) => ({
            id: item.id || crypto.randomUUID(),
            name: item.name || "",
            phone: item.phone || "",
          }))
          : data.daily_report_whatsapp_phone
            ? [{ id: crypto.randomUUID(), name: "Dueño", phone: String(data.daily_report_whatsapp_phone || "") }]
            : [],
      );
      setFixedCostItems((data.fixed_cost_items || []).map((item: any) => ({
        id: item.id || crypto.randomUUID(),
        name: item.name || "",
        amount: String(item.amount || ""),
        frequency: item.frequency || "MONTHLY",
        everyDays: String(item.everyDays || ""),
        lastPaidAt: item.lastPaidAt || "",
        notes: item.notes || "",
      })));
      setPayrollItems((data.payroll_items || []).map((item: any) => ({
        id: item.id || crypto.randomUUID(),
        name: item.name || "",
        amount: String(item.amount || ""),
        frequency: item.frequency || "MONTHLY",
        everyDays: String(item.everyDays || ""),
        lastPaidAt: item.lastPaidAt || "",
        notes: item.notes || "",
      })));
    }
    setLoading(false);
  };

  const totals = useMemo(() => {
    const baseFixed =
      Number(form.monthly_rent || 0) +
      Number(form.monthly_gas || 0) +
      Number(form.monthly_electricity || 0) +
      Number(form.monthly_internet || 0);
    const customFixed = fixedCostItems.reduce((sum, item) => sum + getMonthlyEquivalent(item), 0);
    const basePayroll = Number(form.monthly_payroll || 0);
    const teamPayroll = payrollItems.reduce((sum, item) => sum + getMonthlyEquivalent(item), 0);
    const days = Math.max(1, Number(form.operating_days_per_month || 26));

    return {
      monthlyFixed: baseFixed + customFixed,
      monthlyPayroll: basePayroll + teamPayroll,
      dailyFixed: (baseFixed + customFixed) / days,
      dailyPayroll: (basePayroll + teamPayroll) / days,
    };
  }, [form, fixedCostItems, payrollItems]);

  const update = (key: keyof typeof DEFAULT_FORM, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateItem = (
    setter: React.Dispatch<React.SetStateAction<CostItem[]>>,
    id: string,
    key: keyof CostItem,
    value: string,
  ) => {
    setter((items) => items.map((item) => item.id === id ? { ...item, [key]: value } : item));
  };

  const removeItem = (setter: React.Dispatch<React.SetStateAction<CostItem[]>>, id: string) => {
    setter((items) => items.filter((item) => item.id !== id));
  };

  const updateRecipient = (id: string, key: keyof WhatsappRecipient, value: string) => {
    setWhatsappRecipients((items) => items.map((item) => item.id === id ? { ...item, [key]: value } : item));
  };

  const normalizedRecipients = () =>
    whatsappRecipients
      .map((item) => ({
        id: item.id || crypto.randomUUID(),
        name: item.name.trim() || "Contacto",
        phone: item.phone.trim(),
      }))
      .filter((item) => item.phone);

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
      daily_report_whatsapp_enabled: Boolean(form.daily_report_whatsapp_enabled),
      daily_report_whatsapp_phone: normalizedRecipients()[0]?.phone || String(form.daily_report_whatsapp_phone || "").trim() || null,
      daily_report_whatsapp_recipients: normalizedRecipients(),
      fixed_cost_items: normalizeItems(fixedCostItems),
      payroll_items: normalizeItems(payrollItems),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("financial_settings").upsert(payload, { onConflict: "tenant_id" });
    setSaving(false);
    if (error) setMessage(error.message);
    else setMessage("Configuracion financiera guardada");
  };

  const resendReport = async () => {
    setResending(true);
    setMessage("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setMessage("No hay sesion activa.");
      setResending(false);
      return;
    }

    const response = await fetch("/api/cash-closure-report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ date: resendDate, branchId: resendBranchId }),
    });
    const result = await response.json();
    setMessage(response.ok ? `Reporte reenviado: ${result.sent || 0} mensajes` : result.error || "No se pudo reenviar");
    setResending(false);
  };

  if (loading) return <div className="text-sm text-gray-500">Cargando configuracion...</div>;

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Configuracion Financiera</h1>
        <p className="mt-1 text-sm text-gray-500">
          Define costos fijos, equipo y dias operativos. El reporte diario prorratea estos valores para calcular rentabilidad real.
        </p>
      </div>

      <form onSubmit={save} className="space-y-6">
        <section className="rounded-xl border border-gray-700 bg-gray-900 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Building2 size={18} className="text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-100">Costos base mensuales</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <MoneyField label="Alquiler mensual" value={form.monthly_rent} onChange={(value) => update("monthly_rent", value)} />
            <MoneyField label="Gas mensual" value={form.monthly_gas} onChange={(value) => update("monthly_gas", value)} />
            <MoneyField label="Electricidad mensual" value={form.monthly_electricity} onChange={(value) => update("monthly_electricity", value)} />
            <MoneyField label="Internet mensual" value={form.monthly_internet} onChange={(value) => update("monthly_internet", value)} />
          </div>
        </section>

        <DynamicItemsSection
          title="Otros costos fijos"
          description="Community manager, contador, software, seguros, mantenimiento, garrafas o cualquier costo recurrente que quieras anticipar."
          items={fixedCostItems}
          addLabel="Agregar costo fijo"
          onAdd={() => setFixedCostItems((items) => [...items, emptyItem()])}
          onChange={(id, key, value) => updateItem(setFixedCostItems, id, key, value)}
          onRemove={(id) => removeItem(setFixedCostItems, id)}
        />

        <section className="rounded-xl border border-gray-700 bg-gray-900 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Users size={18} className="text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-100">Equipo y sueldos</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <MoneyField
              label="Sueldos generales mensual"
              value={form.monthly_payroll}
              onChange={(value) => update("monthly_payroll", value)}
            />
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
          <p className="mt-3 text-xs text-gray-500">
            Si cargas empleados abajo, se suman al campo de sueldos generales. Deja este campo en 0 si queres manejar todo empleado por empleado.
          </p>
        </section>

        <DynamicItemsSection
          title="Empleados y colaboradores"
          description="Carga cajeros, cocina, encargados o colaboradores con su frecuencia de pago para medir mejor el costo laboral diario."
          items={payrollItems}
          addLabel="Agregar empleado"
          onAdd={() => setPayrollItems((items) => [...items, emptyItem()])}
          onChange={(id, key, value) => updateItem(setPayrollItems, id, key, value)}
          onRemove={(id) => removeItem(setPayrollItems, id)}
        />

        <section className="rounded-xl border border-gray-700 bg-gray-900 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Calculator size={18} className="text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-100">Reporte por WhatsApp</h2>
          </div>
          <div className="space-y-4">
            <label className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-950 px-4 py-3 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={Boolean(form.daily_report_whatsapp_enabled)}
                onChange={(event) => update("daily_report_whatsapp_enabled", event.target.checked)}
                className="h-4 w-4 rounded border-gray-600"
              />
              Enviar al cerrar caja
            </label>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-200">Contactos</h3>
                  <p className="text-xs text-gray-500">Se envia a todos los contactos activos de esta lista.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setWhatsappRecipients((items) => [...items, emptyRecipient()])}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
                >
                  <Plus size={15} /> Agregar contacto
                </button>
              </div>

              {whatsappRecipients.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-700 bg-gray-950 px-4 py-6 text-center text-sm text-gray-500">
                  No hay contactos cargados.
                </div>
              ) : (
                <div className="space-y-2">
                  {whatsappRecipients.map((recipient) => (
                    <div key={recipient.id} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                      <input
                        className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
                        placeholder="Nombre"
                        value={recipient.name}
                        onChange={(event) => updateRecipient(recipient.id, "name", event.target.value)}
                      />
                      <input
                        className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
                        placeholder="WhatsApp, ej: 3794 123456"
                        value={recipient.phone}
                        onChange={(event) => updateRecipient(recipient.id, "phone", event.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setWhatsappRecipients((items) => items.filter((item) => item.id !== recipient.id))}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-900/60 text-red-300 hover:bg-red-950/40"
                        aria-label="Eliminar contacto"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-500">Los telefonos se normalizan a formato Argentina, por ejemplo 5493794123456.</p>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
              <h3 className="text-sm font-semibold text-gray-200">Reenviar reporte</h3>
              <p className="mt-1 text-xs text-gray-500">Selecciona sucursal y fecha para reenviar el resumen de cierres de ese dia.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(180px,1fr)_180px_auto_1fr] md:items-center">
                <select
                  className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
                  value={resendBranchId}
                  onChange={(event) => setResendBranchId(event.target.value)}
                >
                  <option value="">Seleccionar sucursal</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
                  value={resendDate}
                  onChange={(event) => setResendDate(event.target.value)}
                />
                <button
                  type="button"
                  onClick={resendReport}
                  disabled={resending || !resendDate || !resendBranchId}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-gray-950 disabled:opacity-50"
                >
                  {resending ? "Reenviando..." : "Reenviar"}
                </button>
                <span className="text-xs text-gray-500">Usa los contactos guardados arriba.</span>
              </div>
            </div>
          </div>
        </section>

        <div className="rounded-xl border border-gray-700 bg-gray-900 p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <SummaryCard label="Costos fijos mensuales" value={totals.monthlyFixed} />
            <SummaryCard label="Costos fijos diarios" value={totals.dailyFixed} />
            <SummaryCard label="Labor mensual" value={totals.monthlyPayroll} />
            <SummaryCard label="Labor diario" value={totals.dailyPayroll} />
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button disabled={saving} className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-bold text-gray-950 disabled:opacity-50">
              <Save size={16} /> {saving ? "Guardando..." : "Guardar"}
            </button>
            {message && <span className="text-sm text-gray-400">{message}</span>}
          </div>
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

function DynamicItemsSection({
  title,
  description,
  items,
  addLabel,
  onAdd,
  onChange,
  onRemove,
}: {
  title: string;
  description: string;
  items: CostItem[];
  addLabel: string;
  onAdd: () => void;
  onChange: (id: string, key: keyof CostItem, value: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="rounded-xl border border-gray-700 bg-gray-900 p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-600 px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
        >
          <Plus size={16} /> {addLabel}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-700 bg-gray-950 px-4 py-6 text-center text-sm text-gray-500">
          No hay items cargados.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="grid gap-3 rounded-lg border border-gray-700 bg-gray-950 p-3 md:grid-cols-[1.1fr_0.7fr_0.8fr_0.7fr_0.8fr_auto]">
              <input
                placeholder="Nombre"
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
                value={item.name}
                onChange={(e) => onChange(item.id, "name", e.target.value)}
              />
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Monto"
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 py-2 pl-8 pr-3 text-sm text-gray-100"
                  value={item.amount}
                  onChange={(e) => onChange(item.id, "amount", e.target.value)}
                />
              </div>
              <select
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
                value={item.frequency}
                onChange={(e) => onChange(item.id, "frequency", e.target.value)}
              >
                <option value="MONTHLY">Mensual</option>
                <option value="WEEKLY">Semanal</option>
                <option value="BIWEEKLY">Quincenal</option>
                <option value="EVERY_X_DAYS">Cada X dias</option>
                <option value="MANUAL">Manual</option>
              </select>
              <input
                type="number"
                min="1"
                placeholder="Dias"
                disabled={item.frequency !== "EVERY_X_DAYS"}
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 disabled:opacity-40"
                value={item.everyDays}
                onChange={(e) => onChange(item.id, "everyDays", e.target.value)}
              />
              <input
                type="date"
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
                value={item.lastPaidAt}
                onChange={(e) => onChange(item.id, "lastPaidAt", e.target.value)}
              />
              <input
                placeholder="Notas opcionales"
                className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 md:col-span-5"
                value={item.notes || ""}
                onChange={(e) => onChange(item.id, "notes", e.target.value)}
              />
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-900/60 text-red-300 hover:bg-red-950/40"
                aria-label="Eliminar"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
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
