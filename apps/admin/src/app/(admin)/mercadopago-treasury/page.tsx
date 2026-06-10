"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  CheckCircle2,
  Clock3,
  CloudDownload,
  FileUp,
  Link2,
  Receipt,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
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

function localDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function closedReportMaxDateInput() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return localDateInputValue(date);
}

function dateInputToLocalIso(date: string, endOfDay = false) {
  const [year, month, day] = date.split("-").map(Number);
  const local = new Date(
    year,
    (month || 1) - 1,
    day || 1,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  );
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const safeEnd = todayStart.getTime() - 1;
  const safeTime = endOfDay ? Math.min(local.getTime(), safeEnd) : Math.min(local.getTime(), safeEnd - 24 * 60 * 60 * 1000 + 1);
  return new Date(safeTime).toISOString();
}

function parseSettingsNotes(value?: string | null) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  const [syncing, setSyncing] = useState(false);
  const [mpApiConfigured, setMpApiConfigured] = useState(false);
  const [mpReportConfigOk, setMpReportConfigOk] = useState(false);
  const [syncFrom, setSyncFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().slice(0, 10);
  });
  const [syncTo, setSyncTo] = useState(() => closedReportMaxDateInput());
  const [expenseCategoryId, setExpenseCategoryId] = useState("");
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [purchaseCategories, setPurchaseCategories] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [purchaseCategoryId, setPurchaseCategoryId] = useState("");

  useEffect(() => { load(); }, []);

  const mercadoPagoAccount = useMemo(() => {
    return accounts.find((account) => /mercado|mp|transfer/i.test(`${account.name} ${account.type}`)) || accounts.find((account) => account.type === "transfer") || accounts[0];
  }, [accounts]);

  const expectedBalance = Number(mercadoPagoAccount?.balance || 0);
  const real = Number(settings?.real_balance || 0);
  const difference = real - expectedBalance;
  const settingsNotes = useMemo(() => parseSettingsNotes(settings?.notes), [settings]);
  const pendingReportId = settings?.external_user_id ? String(settings.external_user_id) : "";
  const latestImportedMovement = useMemo(
    () => mpMovements.find((movement) => movement.balance_after !== null && movement.balance_after !== undefined),
    [mpMovements],
  );
  const pendingMovements = mpMovements.filter((movement) => movement.status === "pending");
  const pendingIncoming = pendingMovements.filter((movement) => Number(movement.amount) > 0).reduce((sum, movement) => sum + Number(movement.amount), 0);
  const pendingOutgoing = pendingMovements.filter((movement) => Number(movement.amount) < 0).reduce((sum, movement) => sum + Math.abs(Number(movement.amount)), 0);
  const totalIncoming = mpMovements.filter((movement) => Number(movement.amount) > 0).reduce((sum, movement) => sum + Number(movement.amount), 0);
  const totalOutgoing = mpMovements.filter((movement) => Number(movement.amount) < 0).reduce((sum, movement) => sum + Math.abs(Number(movement.amount)), 0);
  const reconciledCount = mpMovements.filter((movement) => movement.status === "reconciled").length;
  const ignoredCount = mpMovements.filter((movement) => movement.status === "ignored").length;
  const reconciliationPct = mpMovements.length > 0 ? Math.round((reconciledCount / mpMovements.length) * 100) : 0;
  const consolidatedBalance = real || Number(latestImportedMovement?.balance_after || 0);
  const dayBuckets = useMemo(() => {
    const map = new Map<string, { date: string; incoming: number; outgoing: number; count: number }>();
    mpMovements.forEach((movement) => {
      const key = movement.operation_date.slice(0, 10);
      const current = map.get(key) || { date: key, incoming: 0, outgoing: 0, count: 0 };
      const amount = Number(movement.amount || 0);
      if (amount >= 0) current.incoming += amount;
      else current.outgoing += Math.abs(amount);
      current.count += 1;
      map.set(key, current);
    });
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  }, [mpMovements]);

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

    const [
      { data: settingsRow },
      { data: accountRows },
      { data: centralRows },
      { data: mpRows },
      { data: categoryRows },
      { data: supplierRows },
      { data: purchaseCategoryRows },
    ] = await Promise.all([
      supabase.from("mercadopago_treasury_settings").select("*").eq("tenant_id", userRecord.tenant_id).maybeSingle(),
      supabase.from("central_cash_accounts").select("*").eq("tenant_id", userRecord.tenant_id).eq("is_active", true).order("name"),
      supabase.from("central_cash_movements").select("*").eq("tenant_id", userRecord.tenant_id).order("created_at", { ascending: false }).limit(300),
      supabase.from("mercadopago_account_movements").select("*").eq("tenant_id", userRecord.tenant_id).order("operation_date", { ascending: false }).limit(300),
      supabase.from("expense_categories").select("*").eq("tenant_id", userRecord.tenant_id).eq("is_active", true).order("name"),
      supabase.from("suppliers").select("*").eq("tenant_id", userRecord.tenant_id).eq("is_active", true).order("name"),
      supabase.from("purchase_categories").select("*").eq("tenant_id", userRecord.tenant_id).eq("is_active", true).order("name"),
    ]);

    setSettings(settingsRow);
    setRealBalance(String(settingsRow?.real_balance || ""));
    setAccounts(accountRows || []);
    setCentralMovements((centralRows || []) as CentralMovement[]);
    setMpMovements((mpRows || []) as MpMovement[]);
    setCategories(categoryRows || []);
    setSuppliers(supplierRows || []);
    setPurchaseCategories(purchaseCategoryRows || []);
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (token) {
      fetch("/api/mercadopago/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "status" }),
      })
        .then((response) => response.json())
        .then((data) => {
          setMpApiConfigured(Boolean(data.configured));
          setMpReportConfigOk(Boolean(data.reportConfigOk));
        })
        .catch(() => {
          setMpApiConfigured(false);
          setMpReportConfigOk(false);
        });
    }
    setLoading(false);
  };

  const callMpSync = async (body: Record<string, any>) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("No hay sesion activa.");

    const response = await fetch("/api/mercadopago/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo sincronizar Mercado Pago.");
    return data;
  };

  const syncMercadoPago = async () => {
    setSyncing(true);
    setMessage("");
    try {
      const data = await callMpSync({
        action: "sync_auto",
        beginDate: dateInputToLocalIso(syncFrom),
        endDate: dateInputToLocalIso(syncTo, true),
      });
      if (data.status === "imported") {
        setMessage(`Sincronizado: importados ${data.imported || 0} movimientos${data.fileName ? ` desde ${data.fileName}` : ""}.`);
      } else {
        setMessage(data.message || "Sincronizacion iniciada. Volve a tocar sincronizar en unos minutos.");
      }
      await load();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setSyncing(false);
    }
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

  const createPurchase = async (movement: MpMovement) => {
    if (!tenantId || !mercadoPagoAccount) return;
    if (!supplierId) {
      setMessage("Selecciona proveedor para crear una compra.");
      return;
    }
    const amount = Math.abs(Number(movement.amount || 0));
    if (amount <= 0) return;

    const { data: purchase, error: purchaseError } = await supabase.from("purchases").insert({
      tenant_id: tenantId,
      supplier_id: supplierId,
      category_id: purchaseCategoryId || null,
      invoice_number: movement.reference || null,
      description: movement.description,
      subtotal: amount,
      tax_amount: 0,
      total: amount,
      status: "completed",
      purchase_date: movement.operation_date.split("T")[0],
      notes: "Creado desde conciliacion Mercado Pago",
      created_by: userId,
    }).select("id").single();

    if (purchaseError) {
      setMessage(purchaseError.message);
      return;
    }

    const { data: centralMovement, error: movementError } = await supabase.from("central_cash_movements").insert({
      tenant_id: tenantId,
      account_id: mercadoPagoAccount.id,
      purchase_id: purchase?.id || null,
      type: "purchase_out",
      amount,
      description: `Compra Mercado Pago: ${movement.description}`,
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
        purchase_id: purchase?.id || null,
        updated_at: todayIso(),
      }).eq("id", movement.id),
    ]);

    setMessage("Compra creada y movimiento conciliado");
    await load();
  };

  if (loading) return <div className="text-sm text-gray-500">Cargando Mercado Pago...</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-100">Mercado Pago</h1>
          <p className="mt-1 text-sm text-gray-500">Saldo consolidado, movimientos y conciliacion contra Caja Central.</p>
        </div>
        <div className={`rounded-2xl border px-4 py-3 text-sm ${
          mpApiConfigured ? "border-emerald-800/60 bg-emerald-950/20 text-emerald-100" : "border-amber-800/60 bg-amber-950/20 text-amber-100"
        }`}>
          <div className="flex items-center gap-2 font-bold">
            {mpApiConfigured ? <ShieldCheck size={16} /> : <AlertTriangle size={16} />}
            {mpApiConfigured ? "API conectada" : "API sin token"}
          </div>
          <p className="mt-1 text-xs opacity-75">
            {pendingReportId
              ? `Reporte pendiente: #${pendingReportId}`
              : settingsNotes.last_imported_at
                ? `Ultima importacion: ${formatDateTime(settingsNotes.last_imported_at)}`
                : "Sin reportes pendientes."}
          </p>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Saldo Mercado Pago" value={money(consolidatedBalance)} helper={latestImportedMovement ? `Ult. movimiento ${formatDateTime(latestImportedMovement.operation_date)}` : "Saldo cargado manualmente"} tone="blue" icon={Wallet} />
        <Kpi label="Saldo Kablam" value={money(expectedBalance)} helper={mercadoPagoAccount?.name || "Cuenta central"} tone="emerald" icon={ShieldCheck} />
        <Kpi label="Diferencia" value={money(difference)} helper={Math.abs(difference) <= 1 ? "Caja conciliada" : "Revisar movimientos pendientes"} tone={Math.abs(difference) <= 1 ? "emerald" : "amber"} icon={AlertTriangle} />
        <Kpi label="Conciliacion" value={`${reconciliationPct}%`} helper={`${reconciledCount}/${mpMovements.length} movimientos`} tone="white" icon={BarChart3} />
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <MiniStat label="Ingresos importados" value={money(totalIncoming)} icon={TrendingUp} color="text-emerald-300" />
        <MiniStat label="Egresos importados" value={money(totalOutgoing)} icon={TrendingDown} color="text-red-300" />
        <MiniStat label="Pendiente ingreso" value={money(pendingIncoming)} icon={ArrowDownCircle} color="text-blue-300" />
        <MiniStat label="Pendiente egreso" value={money(pendingOutgoing)} icon={ArrowUpCircle} color="text-amber-300" />
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
            <CloudDownload size={18} className="text-gray-400" />
            <h2 className="font-bold text-gray-100">Sincronizacion</h2>
          </div>
          <div className="mb-4 rounded-2xl border border-gray-800 bg-gray-950 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-gray-400">API Mercado Pago</p>
              <p className="text-xs text-gray-500">
                {mpApiConfigured
                    ? mpReportConfigOk
                      ? "Token y configuracion de reportes OK."
                      : "Token configurado. Falta crear o validar la configuracion de reportes."
                    : "Falta cargar el token del tenant en Superadmin > Integrations."}
              </p>
              </div>
              <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${mpApiConfigured ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
                {mpApiConfigured ? "conectado" : "sin token"}
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="text-xs text-gray-500">
                Desde
                <input className="input mt-1" type="date" value={syncFrom} onChange={(event) => setSyncFrom(event.target.value)} />
              </label>
              <label className="text-xs text-gray-500">
                Hasta
                <input className="input mt-1" type="date" value={syncTo} max={closedReportMaxDateInput()} onChange={(event) => setSyncTo(event.target.value)} />
              </label>
            </div>
            <button
              onClick={syncMercadoPago}
              disabled={syncing || !mpApiConfigured}
              className="mt-3 w-full rounded-xl border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm font-black text-emerald-100 transition hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CloudDownload size={16} className="mr-2 inline" />
              {syncing ? "Sincronizando..." : "Sincronizar Mercado Pago"}
            </button>
            <p className="mt-2 text-xs text-gray-500">
              Mercado Pago genera reportes por dias cerrados. El maximo sincronizable es ayer a las 23:59.
            </p>
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

      <section className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <div className="mb-4 flex items-center gap-2">
            <Clock3 size={18} className="text-gray-400" />
            <h2 className="font-bold text-gray-100">Ultimos dias</h2>
          </div>
          <div className="space-y-2">
            {dayBuckets.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">Sin movimientos importados</p>
            ) : dayBuckets.map((day) => (
              <div key={day.date} className="rounded-xl border border-gray-800 bg-gray-950 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-100">{new Date(`${day.date}T12:00:00`).toLocaleDateString("es-AR")}</p>
                  <p className="text-xs text-gray-500">{day.count} mov.</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-emerald-500/10 px-2 py-1 text-emerald-200">+ {money(day.incoming)}</div>
                  <div className="rounded-lg bg-red-500/10 px-2 py-1 text-red-200">- {money(day.outgoing)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-300" />
            <h2 className="font-bold text-gray-100">Acciones recomendadas</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Action label="Ingresos sin conciliar" value={money(pendingIncoming)} helper="Cobros que pueden faltar en Caja Central." />
            <Action label="Egresos sin conciliar" value={money(pendingOutgoing)} helper="Pagos o compras para clasificar." />
            <Action label="Ignorados" value={ignoredCount.toString()} helper="Movimientos apartados del flujo." />
          </div>
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
            <select className="input md:w-56" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              <option value="">Proveedor compra</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
            <select className="input md:w-56" value={purchaseCategoryId} onChange={(event) => setPurchaseCategoryId(event.target.value)}>
              <option value="">Cat. compra opcional</option>
              {purchaseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>
        </div>

        <div className="divide-y divide-gray-800">
          {filteredMovements.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-gray-500">No hay movimientos para mostrar</div>
          ) : filteredMovements.map((movement) => {
            const suggested = findSuggestedMatch(movement);
            const isOut = Number(movement.amount) < 0;
            const statusStyle =
              movement.status === "reconciled"
                ? "bg-emerald-500/10 text-emerald-300"
                : movement.status === "ignored"
                  ? "bg-gray-700/60 text-gray-300"
                  : "bg-amber-500/10 text-amber-300";
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
                    <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${statusStyle}`}>
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
                  <div className="mt-3 grid gap-2 md:grid-cols-5">
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
                    {isOut && (
                      <button onClick={() => createPurchase(movement)} className="rounded-xl border border-purple-900 bg-purple-950/20 px-3 py-2 text-xs font-bold text-purple-200">
                        <Receipt size={14} className="mr-1 inline" /> Crear compra
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
          <h2 className="font-bold text-gray-100">Como funciona la sincronizacion</h2>
        </div>
        <p className="text-sm text-gray-500">
          Kablam pide el reporte oficial de Mercado Pago, guarda el reporte pendiente y no crea otro hasta resolverlo. Cuando Mercado Pago lo termina, el mismo boton importa los movimientos y actualiza el saldo disponible si el archivo trae saldo.
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

function Kpi({
  label,
  value,
  helper,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  helper?: string;
  tone: "white" | "emerald" | "blue" | "amber";
  icon?: any;
}) {
  const colors = {
    white: "text-gray-100",
    emerald: "text-emerald-300",
    blue: "text-blue-300",
    amber: "text-amber-300",
  };
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
        {Icon && <Icon size={16} className={colors[tone]} />}
      </div>
      <p className={`text-2xl font-black tabular-nums ${colors[tone]}`}>{value}</p>
      {helper && <p className="mt-2 text-xs text-gray-500">{helper}</p>}
    </div>
  );
}

function MiniStat({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-gray-500">{label}</p>
        <Icon size={16} className={color} />
      </div>
      <p className={`mt-2 text-lg font-black tabular-nums ${color}`}>{value}</p>
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
