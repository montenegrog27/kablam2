"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  FileUp,
  Link2,
  Receipt,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";

type MpMovement = {
  id: string;
  external_id?: string | null;
  operation_date: string;
  description: string;
  operation_type?: string | null;
  amount: number;
  balance_after?: number | null;
  counterparty?: string | null;
  reference?: string | null;
  status: string;
  central_cash_movement_id?: string | null;
  raw?: any;
};

type CentralMovement = {
  id: string;
  account_id: string;
  type: string;
  amount: number;
  description: string;
  created_at: string;
};

const money = (value: number) => `$${Math.round(value || 0).toLocaleString("es-AR")}`;
const todayIso = () => new Date().toISOString();

function parseMoney(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const cleaned = raw
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString();

  const ddmmyyyy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy, hh = "12", min = "00"] = ddmmyyyy;
    const year = yyyy.length === 2 ? `20${yyyy}` : yyyy;
    return new Date(`${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${hh.padStart(2, "0")}:${min}:00-03:00`).toISOString();
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function splitCsvLine(line: string) {
  const result: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if ((char === "," || char === ";") && !quoted) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function getColumn(row: Record<string, string>, candidates: string[]) {
  const entries = Object.entries(row);
  const normalized = candidates.map((item) => item.toLowerCase());
  const found = entries.find(([key]) => normalized.some((candidate) => key.toLowerCase().includes(candidate)));
  return found?.[1] || "";
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function stableMovementId(row: Record<string, string>, operationDate: string, amount: number, description: string) {
  const explicit = getColumn(row, ["id", "codigo", "operacion", "operation"]);
  if (explicit) return explicit;
  return `${operationDate.slice(0, 10)}:${description}:${amount}:${getColumn(row, ["referencia", "comprobante", "factura"])}`;
}

export default function MercadoPagoTreasuryPage() {
  const [tenantId, setTenantId] = useState("");
  const [userId, setUserId] = useState("");
  const [settings, setSettings] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [centralMovements, setCentralMovements] = useState<CentralMovement[]>([]);
  const [mpMovements, setMpMovements] = useState<MpMovement[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("pending");
  const [realBalance, setRealBalance] = useState("");
  const [importing, setImporting] = useState(false);
  const [expenseCategoryId, setExpenseCategoryId] = useState("");

  useEffect(() => { load(); }, []);

  const mercadoPagoAccount = useMemo(() => {
    return accounts.find((account) => /mercado|mp|transfer/i.test(`${account.name} ${account.type}`)) || accounts.find((account) => account.type === "transfer") || accounts[0];
  }, [accounts]);

  const expectedBalance = Number(mercadoPagoAccount?.balance || 0);
  const real = Number(settings?.real_balance || 0);
  const difference = real - expectedBalance;
  const pendingMovements = mpMovements.filter((movement) => movement.status === "pending");
  const pendingIncoming = pendingMovements.filter((movement) => Number(movement.amount) > 0).reduce((sum, movement) => sum + Number(movement.amount), 0);
  const pendingOutgoing = pendingMovements.filter((movement) => Number(movement.amount) < 0).reduce((sum, movement) => sum + Math.abs(Number(movement.amount)), 0);

  const filteredMovements = mpMovements.filter((movement) => {
    const matchesStatus = status === "all" || movement.status === status;
    const text = `${movement.description} ${movement.counterparty || ""} ${movement.reference || ""}`.toLowerCase();
    return matchesStatus && text.includes(query.toLowerCase());
  });

  const load = async () => {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    const authUser = authData.user;
    if (!authUser) return;
    setUserId(authUser.id);

    const { data: userRecord } = await supabase.from("users").select("tenant_id").eq("id", authUser.id).single();
    if (!userRecord?.tenant_id) return;
    setTenantId(userRecord.tenant_id);

    await supabase.from("mercadopago_treasury_settings").upsert({
      tenant_id: userRecord.tenant_id,
      account_label: "Mercado Pago",
    }, { onConflict: "tenant_id", ignoreDuplicates: true });

    const [{ data: settingsRow }, { data: accountRows }, { data: centralRows }, { data: mpRows }, { data: categoryRows }] = await Promise.all([
      supabase.from("mercadopago_treasury_settings").select("*").eq("tenant_id", userRecord.tenant_id).maybeSingle(),
      supabase.from("central_cash_accounts").select("*").eq("tenant_id", userRecord.tenant_id).eq("is_active", true).order("name"),
      supabase.from("central_cash_movements").select("*").eq("tenant_id", userRecord.tenant_id).order("created_at", { ascending: false }).limit(300),
      supabase.from("mercadopago_account_movements").select("*").eq("tenant_id", userRecord.tenant_id).order("operation_date", { ascending: false }).limit(300),
      supabase.from("expense_categories").select("*").eq("tenant_id", userRecord.tenant_id).eq("is_active", true).order("name"),
    ]);

    setSettings(settingsRow);
    setRealBalance(String(settingsRow?.real_balance || ""));
    setAccounts(accountRows || []);
    setCentralMovements((centralRows || []) as CentralMovement[]);
    setMpMovements((mpRows || []) as MpMovement[]);
    setCategories(categoryRows || []);
    setLoading(false);
  };

  const saveBalance = async () => {
    if (!tenantId) return;
    const { error } = await supabase.from("mercadopago_treasury_settings").upsert({
      tenant_id: tenantId,
      account_label: settings?.account_label || "Mercado Pago",
      real_balance: Number(realBalance || 0),
      last_balance_at: todayIso(),
      updated_at: todayIso(),
    }, { onConflict: "tenant_id" });

    if (error) setMessage(error.message);
    else {
      setMessage("Saldo real actualizado");
      await load();
    }
  };

  const importCsv = async (file: File) => {
    if (!tenantId) return;
    setImporting(true);
    setMessage("");

    const rows = parseCsv(await file.text());
    const payload = rows.map((row) => {
      const amount = parseMoney(getColumn(row, ["importe", "monto", "amount", "neto"]));
      const signText = `${getColumn(row, ["tipo", "type", "operacion"])} ${getColumn(row, ["descripcion", "description"])}`.toLowerCase();
      const signedAmount = /egreso|salida|retiro|debit|débito|pago|compra|envio/.test(signText) && amount > 0
        ? -amount
        : amount;
      const operationDate = parseDate(getColumn(row, ["fecha", "date"]));
      const description = getColumn(row, ["descripcion", "description", "detalle", "concepto"]) || "Movimiento Mercado Pago";

      return {
        tenant_id: tenantId,
        external_id: stableMovementId(row, operationDate, signedAmount, description),
        operation_date: operationDate,
        description,
        operation_type: getColumn(row, ["tipo", "type", "operacion"]) || null,
        amount: signedAmount,
        balance_after: parseMoney(getColumn(row, ["saldo", "balance"])) || null,
        counterparty: getColumn(row, ["contraparte", "cliente", "proveedor", "nombre"]) || null,
        reference: getColumn(row, ["referencia", "comprobante", "factura"]) || null,
        status: "pending",
        raw: row,
        created_by: userId,
      };
    }).filter((row) => row.description && Number.isFinite(row.amount));

    if (payload.length === 0) {
      setMessage("No pude leer movimientos del archivo. Revisá columnas de fecha, descripcion e importe.");
      setImporting(false);
      return;
    }

    const { error } = await supabase.from("mercadopago_account_movements").upsert(payload, {
      onConflict: "tenant_id,external_id",
      ignoreDuplicates: true,
    });

    setImporting(false);
    if (error) setMessage(error.message);
    else {
      setMessage(`Importados ${payload.length} movimientos`);
      await load();
    }
  };

  const findSuggestedMatch = (movement: MpMovement) => {
    const movementDate = new Date(movement.operation_date).getTime();
    const amount = Math.abs(Number(movement.amount || 0));
    return centralMovements.find((central) => {
      const centralAmount = Math.abs(Number(central.amount || 0));
      const diffDays = Math.abs(new Date(central.created_at).getTime() - movementDate) / 86400000;
      return Math.abs(centralAmount - amount) < 1 && diffDays <= 3;
    });
  };

  const reconcile = async (movement: MpMovement, centralMovement?: CentralMovement | null) => {
    const match = centralMovement || findSuggestedMatch(movement);
    const { error } = await supabase.from("mercadopago_account_movements").update({
      status: "reconciled",
      central_cash_movement_id: match?.id || null,
      updated_at: todayIso(),
    }).eq("id", movement.id);

    if (error) setMessage(error.message);
    else {
      setMessage("Movimiento conciliado");
      await load();
    }
  };

  const createCentralAdjustment = async (movement: MpMovement) => {
    if (!tenantId || !mercadoPagoAccount) return;
    const amount = Math.abs(Number(movement.amount || 0));
    if (amount <= 0) return;

    const type = Number(movement.amount) >= 0 ? "manual_in" : "manual_out";
    const nextBalance = Number(mercadoPagoAccount.balance || 0) + (Number(movement.amount) >= 0 ? amount : -amount);
    const { data: centralMovement, error: movementError } = await supabase.from("central_cash_movements").insert({
      tenant_id: tenantId,
      account_id: mercadoPagoAccount.id,
      type,
      amount,
      description: `Mercado Pago: ${movement.description}`,
      payment_method_name: mercadoPagoAccount.name,
      created_by: userId,
      metadata: {
        mercadopago_movement_id: movement.id,
        external_id: movement.external_id || null,
        reference: movement.reference || null,
      },
    }).select("id").single();

    if (movementError) {
      setMessage(movementError.message);
      return;
    }

    const [{ error: accountError }, { error: mpError }] = await Promise.all([
      supabase.from("central_cash_accounts").update({ balance: nextBalance, updated_at: todayIso() }).eq("id", mercadoPagoAccount.id),
      supabase.from("mercadopago_account_movements").update({
        status: "reconciled",
        central_cash_movement_id: centralMovement?.id || null,
        updated_at: todayIso(),
      }).eq("id", movement.id),
    ]);

    if (accountError || mpError) setMessage(accountError?.message || mpError?.message || "No se pudo ajustar");
    else {
      setMessage("Movimiento creado en Caja Central y conciliado");
      await load();
    }
  };

  const createExpense = async (movement: MpMovement) => {
    if (!tenantId || !mercadoPagoAccount) return;
    const amount = Math.abs(Number(movement.amount || 0));
    if (amount <= 0) return;

    const { data: expense, error: expenseError } = await supabase.from("expenses").insert({
      tenant_id: tenantId,
      description: movement.description,
      amount,
      tax_amount: 0,
      total: amount,
      category_id: expenseCategoryId || null,
      expense_date: movement.operation_date.split("T")[0],
      reference: movement.reference || movement.external_id || null,
      notes: "Creado desde conciliacion Mercado Pago",
      paid_from_central: true,
      created_by: userId,
    }).select("id").single();

    if (expenseError) {
      setMessage(expenseError.message);
      return;
    }

    const { data: centralMovement, error: movementError } = await supabase.from("central_cash_movements").insert({
      tenant_id: tenantId,
      account_id: mercadoPagoAccount.id,
      expense_id: expense?.id || null,
      type: "expense_out",
      amount,
      description: `Gasto Mercado Pago: ${movement.description}`,
      payment_method_name: mercadoPagoAccount.name,
      created_by: userId,
      metadata: { mercadopago_movement_id: movement.id },
    }).select("id").single();

    if (movementError) {
      setMessage(movementError.message);
      return;
    }

    const nextBalance = Number(mercadoPagoAccount.balance || 0) - amount;
    await Promise.all([
      supabase.from("central_cash_accounts").update({ balance: nextBalance, updated_at: todayIso() }).eq("id", mercadoPagoAccount.id),
      supabase.from("mercadopago_account_movements").update({
        status: "reconciled",
        central_cash_movement_id: centralMovement?.id || null,
        expense_id: expense?.id || null,
        updated_at: todayIso(),
      }).eq("id", movement.id),
    ]);

    setMessage("Gasto creado y movimiento conciliado");
    await load();
  };

  if (loading) return <div className="text-sm text-gray-500">Cargando Mercado Pago...</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-100">Mercado Pago</h1>
          <p className="mt-1 text-sm text-gray-500">Saldo real, movimientos y conciliacion contra Caja Central.</p>
        </div>
        <div className="rounded-2xl border border-blue-800/60 bg-blue-950/20 px-4 py-3 text-sm text-blue-100">
          <div className="flex items-center gap-2 font-bold"><ShieldCheck size={16} /> Modo seguro</div>
          <p className="mt-1 text-xs text-blue-100/70">Primero conciliamos. Las transferencias reales quedan fuera hasta tener API habilitada.</p>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        <Kpi label="Saldo real MP" value={money(real)} tone="blue" />
        <Kpi label="Saldo Kablam" value={money(expectedBalance)} tone="emerald" />
        <Kpi label="Diferencia" value={money(difference)} tone={Math.abs(difference) <= 1 ? "emerald" : "amber"} />
        <Kpi label="Pendiente neto" value={money(pendingIncoming - pendingOutgoing)} tone="white" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <div className="mb-4 flex items-center gap-2">
            <Wallet size={18} className="text-gray-400" />
            <h2 className="font-bold text-gray-100">Saldo real</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <input className="input" type="number" step="0.01" value={realBalance} onChange={(event) => setRealBalance(event.target.value)} placeholder="Saldo actual en Mercado Pago" />
            <button onClick={saveBalance} className="rounded-xl bg-white px-4 py-3 text-sm font-black text-gray-950">Guardar saldo</button>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Cuenta Kablam vinculada: <span className="font-semibold text-gray-300">{mercadoPagoAccount?.name || "Sin cuenta"}</span>
          </p>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <div className="mb-4 flex items-center gap-2">
            <FileUp size={18} className="text-gray-400" />
            <h2 className="font-bold text-gray-100">Importar movimientos</h2>
          </div>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-gray-700 bg-gray-950 px-4 py-8 text-center hover:bg-gray-900">
            <FileUp size={26} className="mb-2 text-gray-400" />
            <span className="text-sm font-bold text-gray-100">{importing ? "Importando..." : "Subir CSV de Mercado Pago"}</span>
            <span className="mt-1 text-xs text-gray-500">Acepta columnas como Fecha, Descripcion, Importe, Saldo, Referencia.</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) importCsv(file);
              event.currentTarget.value = "";
            }} />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-300" />
          <h2 className="font-bold text-gray-100">Acciones recomendadas</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Action label="Ingresos sin conciliar" value={money(pendingIncoming)} helper="Transferencias/cobros que pueden faltar en Caja Central." />
          <Action label="Egresos sin conciliar" value={money(pendingOutgoing)} helper="Pagos/compras/retiros que podrian ser gastos." />
          <Action label="Ajuste sugerido" value={money(difference)} helper="Usalo solo si el saldo MP real no coincide con Kablam." />
        </div>
      </section>

      <section className="rounded-2xl border border-gray-800 bg-gray-900">
        <div className="space-y-3 border-b border-gray-800 p-4 md:flex md:items-center md:justify-between md:gap-3 md:space-y-0">
          <div>
            <h2 className="font-bold text-gray-100">Movimientos Mercado Pago</h2>
            <p className="text-xs text-gray-500">Conciliacion contra movimientos de Caja Central.</p>
          </div>
          <div className="flex flex-col gap-2 md:flex-row">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input className="input pl-9 md:w-72" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar..." />
            </div>
            <select className="input md:w-44" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="pending">Pendientes</option>
              <option value="reconciled">Conciliados</option>
              <option value="ignored">Ignorados</option>
              <option value="all">Todos</option>
            </select>
            <select className="input md:w-56" value={expenseCategoryId} onChange={(event) => setExpenseCategoryId(event.target.value)}>
              <option value="">Cat. gasto opcional</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>
        </div>

        <div className="divide-y divide-gray-800">
          {filteredMovements.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-gray-500">No hay movimientos para mostrar</div>
          ) : filteredMovements.map((movement) => {
            const suggested = findSuggestedMatch(movement);
            const isOut = Number(movement.amount) < 0;
            return (
              <article key={movement.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    {isOut ? <ArrowUpCircle className="mt-0.5 flex-shrink-0 text-red-400" size={18} /> : <ArrowDownCircle className="mt-0.5 flex-shrink-0 text-emerald-400" size={18} />}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-gray-100">{movement.description}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {new Date(movement.operation_date).toLocaleString("es-AR")}
                        {movement.counterparty ? ` · ${movement.counterparty}` : ""}
                        {movement.reference ? ` · ${movement.reference}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-black tabular-nums ${isOut ? "text-red-300" : "text-emerald-300"}`}>{money(Number(movement.amount || 0))}</p>
                    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${movement.status === "reconciled" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
                      {movement.status}
                    </span>
                  </div>
                </div>

                {suggested && movement.status === "pending" && (
                  <div className="mt-3 rounded-xl border border-blue-900/60 bg-blue-950/20 px-3 py-2 text-xs text-blue-100">
                    Posible match: <span className="font-bold">{suggested.description}</span> por {money(Number(suggested.amount || 0))}
                  </div>
                )}

                {movement.status === "pending" && (
                  <div className="mt-3 grid gap-2 md:grid-cols-4">
                    <button onClick={() => reconcile(movement, suggested)} className="rounded-xl border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-xs font-bold text-emerald-200">
                      <CheckCircle2 size={14} className="mr-1 inline" /> Conciliar
                    </button>
                    <button onClick={() => createCentralAdjustment(movement)} className="rounded-xl border border-gray-700 px-3 py-2 text-xs font-bold text-gray-200">
                      <RefreshCw size={14} className="mr-1 inline" /> Crear movimiento
                    </button>
                    {isOut && (
                      <button onClick={() => createExpense(movement)} className="rounded-xl border border-red-900 bg-red-950/20 px-3 py-2 text-xs font-bold text-red-200">
                        <Receipt size={14} className="mr-1 inline" /> Crear gasto
                      </button>
                    )}
                    <button onClick={() => supabase.from("mercadopago_account_movements").update({ status: "ignored", updated_at: todayIso() }).eq("id", movement.id).then(load)} className="rounded-xl border border-gray-700 px-3 py-2 text-xs font-bold text-gray-400">
                      Ignorar
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {message && <p className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-300">{message}</p>}

      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Link2 size={18} className="text-gray-400" />
          <h2 className="font-bold text-gray-100">Conexion API preparada</h2>
        </div>
        <p className="text-sm text-gray-500">
          Esta vista ya separa conciliacion, saldo real y movimientos. El siguiente paso es conectar OAuth/credenciales de Mercado Pago en backend para descargar reportes automaticamente. Mientras tanto, el CSV te deja operar hoy sin esperar aprobaciones.
        </p>
      </section>

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgb(55 65 81);
          background: rgb(3 7 18);
          padding: 0.75rem 0.875rem;
          font-size: 0.875rem;
          color: rgb(243 244 246);
          outline: none;
        }

        .input::placeholder {
          color: rgb(107 114 128);
        }

        .input:focus {
          border-color: rgb(156 163 175);
          box-shadow: 0 0 0 1px rgb(156 163 175 / 0.35);
        }
      `}</style>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: "white" | "emerald" | "blue" | "amber" }) {
  const colors = {
    white: "text-gray-100",
    emerald: "text-emerald-300",
    blue: "text-blue-300",
    amber: "text-amber-300",
  };
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-2 text-xl font-black tabular-nums ${colors[tone]}`}>{value}</p>
    </div>
  );
}

function Action({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-lg font-black text-gray-100">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{helper}</p>
    </div>
  );
}
