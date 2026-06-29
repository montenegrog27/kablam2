import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MP_API = "https://api.mercadopago.com";

class MercadoPagoApiError extends Error {
  status: number;
  path: string;
  body: string;

  constructor(path: string, status: number, body: string) {
    super(`mercadopago_${status}`);
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

function sanitizeMpPath(path: string) {
  return path.replace(/access_token=[^&]+/g, "access_token=***");
}

function parseSettingsNotes(value?: string | null) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function saveSettingsNotes(
  supabase: ReturnType<typeof serviceClient>,
  tenantId: string,
  notes: Record<string, any>,
) {
  const { error } = await supabase.from("mercadopago_treasury_settings").upsert({
    tenant_id: tenantId,
    account_label: "Mercado Pago",
    oauth_status: "connected",
    notes: JSON.stringify(notes),
    updated_at: new Date().toISOString(),
  }, { onConflict: "tenant_id" });
  if (error) throw new Error(error.message);
}

async function savePendingTask(
  supabase: ReturnType<typeof serviceClient>,
  tenantId: string,
  taskId: string | null,
  notes: Record<string, any>,
) {
  const { error } = await supabase.from("mercadopago_treasury_settings").upsert({
    tenant_id: tenantId,
    account_label: "Mercado Pago",
    oauth_status: "connected",
    external_user_id: taskId,
    notes: JSON.stringify(notes),
    updated_at: new Date().toISOString(),
  }, { onConflict: "tenant_id" });
  if (error) throw new Error(error.message);
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
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

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getColumn(row: Record<string, string>, candidates: string[]) {
  const normalized = candidates.map(normalizeKey);
  const found = Object.entries(row).find(([key]) => {
    const normalizedKey = normalizeKey(key);
    return normalized.some((candidate) => normalizedKey.includes(candidate));
  });
  return found?.[1] || "";
}

function parseMoney(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const negative = /^\(.*\)$/.test(raw) || raw.includes("-");
  const cleaned = raw
    .replace(/[()$]/g, "")
    .replace(/\s/g, "")
    .replace(/-/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -parsed : parsed;
}

function parseDate(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString();

  const ddmmyyyy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy, hh = "12", min = "00"] = ddmmyyyy;
    const year = yyyy.length === 2 ? `20${yyyy}` : yyyy;
    return new Date(
      `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${hh.padStart(2, "0")}:${min}:00-03:00`,
    ).toISOString();
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function getSignedAmount(row: Record<string, string>) {
  const settlementNet = parseMoney(getColumn(row, [
    "SETTLEMENT_NET_AMOUNT",
    "settlement net amount",
    "net settlement",
    "importe neto",
    "monto neto",
  ]));
  if (settlementNet !== 0) return settlementNet;

  const credit = parseMoney(getColumn(row, ["NET_CREDIT_AMOUNT", "credito", "credit", "haber"]));
  const debit = parseMoney(getColumn(row, ["NET_DEBIT_AMOUNT", "debito", "debit", "debe"]));
  if (credit || debit) return credit - Math.abs(debit);

  const amount = parseMoney(getColumn(row, ["amount", "importe", "monto", "gross_amount"]));
  const signText = `${getColumn(row, ["transaction_type", "type", "tipo", "descripcion"])} ${getColumn(row, ["description", "detalle"])}`.toLowerCase();
  return /withdrawal|refund|chargeback|debit|debito|d[eé]bito|retiro|egreso|pago|compra/.test(signText) && amount > 0
    ? -amount
    : amount;
}

function toMovementPayload(row: Record<string, string>, tenantId: string, userId: string) {
  const operationDate = parseDate(getColumn(row, [
    "TRANSACTION_DATE",
    "DATE",
    "fecha",
    "operation_date",
    "settlement_date",
  ]));
  const amount = getSignedAmount(row);
  const description =
    getColumn(row, ["DESCRIPTION", "descripcion", "detalle", "concepto"]) ||
    getColumn(row, ["TRANSACTION_TYPE", "tipo"]) ||
    "Movimiento Mercado Pago";
  const externalId =
    getColumn(row, ["SOURCE_ID", "source id", "ID", "operation", "operacion"]) ||
    `${operationDate.slice(0, 10)}:${description}:${amount}:${getColumn(row, ["EXTERNAL_REFERENCE", "referencia", "reference"])}`;

  return {
    tenant_id: tenantId,
    external_id: String(externalId),
    operation_date: operationDate,
    description,
    operation_type: getColumn(row, ["TRANSACTION_TYPE", "tipo", "type"]) || null,
    amount,
    balance_after: parseMoney(getColumn(row, [
      "BALANCE_AMOUNT",
      "available balance",
      "balance",
      "saldo",
    ])) || null,
    counterparty: getColumn(row, ["COUNTERPARTY", "contraparte", "cliente", "proveedor", "payer"]) || null,
    reference: getColumn(row, ["EXTERNAL_REFERENCE", "referencia", "reference", "comprobante"]) || null,
    status: "pending",
    raw: row,
    created_by: userId,
  };
}

async function getAuthorizedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { error: "unauthorized" as const };

  const supabase = serviceClient();
  const token = authHeader.slice("Bearer ".length);
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return { error: "unauthorized" as const };

  const { data: userRecord } = await supabase
    .from("users")
    .select("id, tenant_id, role")
    .eq("id", authData.user.id)
    .single();

  if (!userRecord?.tenant_id) return { error: "user_without_tenant" as const };
  if (!["owner", "manager", "admin"].includes(userRecord.role)) return { error: "forbidden" as const };
  return { supabase, user: userRecord };
}

async function mpAccessToken(
  supabase: ReturnType<typeof serviceClient>,
  tenantId: string,
) {
  const { data } = await supabase
    .from("tenant_integrations")
    .select("access_token, status")
    .eq("tenant_id", tenantId)
    .eq("provider", "mercadopago")
    .maybeSingle();

  if (data?.status !== "disabled" && data?.access_token) return data.access_token;
  return process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || "";
}

async function mpFetch(path: string, accessToken: string, init?: RequestInit) {
  const token = accessToken;
  if (!token) {
    throw new Error("missing_mercadopago_access_token");
  }

  const response = await fetch(`${MP_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new MercadoPagoApiError(path, response.status, text);
  }

  return response;
}

function defaultReportConfig(tenantId: string) {
  return {
    file_name_prefix: `kablam-${tenantId.slice(0, 8)}-settlement`,
    show_fee_prevision: false,
    show_chargeback_cancel: true,
    coupon_detailed: true,
    include_withdraw: true,
    shipping_detail: true,
    refund_detailed: true,
    display_timezone: "GMT-04",
    header_language: "es",
    frequency: {
      hour: 0,
      type: "monthly",
      value: 1,
    },
    columns: [
      { key: "TRANSACTION_DATE" },
      { key: "SOURCE_ID" },
      { key: "EXTERNAL_REFERENCE" },
      { key: "RECORD_TYPE" },
      { key: "DESCRIPTION" },
      { key: "TRANSACTION_TYPE" },
      { key: "NET_CREDIT_AMOUNT" },
      { key: "NET_DEBIT_AMOUNT" },
      { key: "BALANCE_AMOUNT" },
    ],
  };
}

function minimalReportConfig(tenantId: string) {
  return {
    file_name_prefix: `kablam-${tenantId.slice(0, 8)}-settlement`,
    display_timezone: "GMT-04",
    header_language: "es",
    frequency: {
      hour: 0,
      type: "monthly",
      value: 1,
    },
    columns: [
      { key: "TRANSACTION_DATE" },
      { key: "SOURCE_ID" },
      { key: "EXTERNAL_REFERENCE" },
    ],
  };
}

async function upsertReportConfig(accessToken: string, tenantId: string) {
  const config = defaultReportConfig(tenantId);

  const current = await mpFetch("/v1/account/settlement_report/config", accessToken, {
    method: "GET",
  }).catch((error) => {
    if (error instanceof MercadoPagoApiError && error.status === 404) return null;
    throw error;
  });

  const method = current ? "PUT" : "POST";
  let response = await mpFetch("/v1/account/settlement_report/config", accessToken, {
    method,
    body: JSON.stringify(config),
  }).catch(async (error) => {
    if (!(error instanceof MercadoPagoApiError) || error.status !== 400) throw error;
    return mpFetch("/v1/account/settlement_report/config", accessToken, {
      method,
      body: JSON.stringify(minimalReportConfig(tenantId)),
    });
  });

  return response.json();
}

async function ensureReportConfig(accessToken: string, tenantId: string) {
  const current = await mpFetch("/v1/account/settlement_report/config", accessToken, {
    method: "GET",
  }).catch((error) => {
    if (error instanceof MercadoPagoApiError && error.status === 404) return null;
    throw error;
  });

  if (current) {
    return { configured: true, config: await current.json().catch(() => null) };
  }

  return { configured: false, config: await upsertReportConfig(accessToken, tenantId) };
}

async function downloadAndImportReport({
  fileName,
  accessToken,
  tenantId,
  userId,
  supabase,
}: {
  fileName: string;
  accessToken: string;
  tenantId: string;
  userId: string;
  supabase: ReturnType<typeof serviceClient>;
}) {
  const response = await mpFetch(`/v1/account/settlement_report/${encodeURIComponent(fileName)}`, accessToken, {
    headers: { Accept: "text/csv,*/*" },
  });
  const csvText = await response.text();
  return importCsvText({ csvText, tenantId, userId, supabase });
}

function sameReportRange(report: any, beginDate: string, endDate: string) {
  const reportBegin = report?.begin_date ? new Date(report.begin_date).getTime() : 0;
  const reportEnd = report?.end_date ? new Date(report.end_date).getTime() : 0;
  return (
    Math.abs(reportBegin - new Date(beginDate).getTime()) < 60000 &&
    Math.abs(reportEnd - new Date(endDate).getTime()) < 60000
  );
}

async function searchReports({
  accessToken,
  beginDate,
  endDate,
  reportId,
}: {
  accessToken: string;
  beginDate?: string;
  endDate?: string;
  reportId?: string | number | null;
}) {
  const params = new URLSearchParams();
  params.set("limit", "50");
  params.set("format", "CSV");
  if (reportId) params.set("id", String(reportId));
  if (beginDate) params.set("begin_date", beginDate);
  if (endDate) params.set("end_date", endDate);
  if (!reportId) params.set("created_from", "manual");

  const response = await mpFetch(`/v1/account/settlement_report/search?${params.toString()}`, accessToken);
  const data = await response.json();
  return Array.isArray(data?.results) ? data.results : [];
}

async function getReportList(accessToken: string) {
  const response = await mpFetch("/v1/account/settlement_report/list", accessToken);
  const data = await response.json();
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

function getReportFileName(report: any) {
  return report?.file_name || report?.filename || report?.fileName || report?.name || "";
}

function getReportStatus(report: any) {
  return String(report?.status || report?.state || "").toLowerCase();
}

function isReportReady(report: any) {
  const status = getReportStatus(report);
  return Boolean(getReportFileName(report)) || ["processed", "ready", "finished", "completed", "success"].includes(status);
}

function reportCreatedAt(report: any) {
  const raw = report?.date_created || report?.generation_date || report?.created_at || report?.last_modified;
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function isStalePendingReport(report: any) {
  if (getReportStatus(report) !== "pending") return false;
  if (report?.report_id || getReportFileName(report)) return false;
  const createdAt = reportCreatedAt(report);
  if (!createdAt) return false;
  const hasGenerationMetadata = Boolean(report?.format || report?.account_id);
  const staleAfterMinutes = hasGenerationMetadata ? 20 : 10;
  return Date.now() - createdAt > staleAfterMinutes * 60 * 1000;
}

function normalizeReportRange(beginDateValue: unknown, endDateValue: unknown) {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const safeEnd = todayStart.getTime() - 1;
  const requestedBegin = new Date(String(beginDateValue || now - 7 * 86400000)).getTime();
  const requestedEnd = new Date(String(endDateValue || now)).getTime();
  const endTime = Math.min(
    Number.isFinite(requestedEnd) ? requestedEnd : now,
    safeEnd,
  );
  const beginTime = Math.min(
    Number.isFinite(requestedBegin) ? requestedBegin : endTime - 7 * 86400000,
    endTime - 60 * 1000,
  );

  return {
    beginDate: new Date(beginTime).toISOString(),
    endDate: new Date(endTime).toISOString(),
    adjusted: requestedEnd > safeEnd,
  };
}

function reportEndsInFuture(report: any) {
  const endTime = report?.end_date ? new Date(report.end_date).getTime() : 0;
  if (!Number.isFinite(endTime) || endTime <= 0) return false;
  return endTime > Date.now() - 5 * 60 * 1000;
}

function matchesNormalizedRange(report: any, beginDate: string, endDate: string) {
  if (!sameReportRange(report, beginDate, endDate)) return false;
  return !reportEndsInFuture(report);
}

async function findGeneratedReport({
  accessToken,
  taskId,
  beginDate,
  endDate,
}: {
  accessToken: string;
  taskId?: string;
  beginDate: string;
  endDate: string;
}) {
  const list = await getReportList(accessToken).catch(() => []);
  const listed = list.find((report: any) => String(report.id) === String(taskId) && !reportEndsInFuture(report)) ||
    list.find((report: any) => matchesNormalizedRange(report, beginDate, endDate) && report.created_from === "manual");

  if (getReportFileName(listed)) return listed;

  if (listed?.report_id) {
    const byId = await searchReports({ accessToken, reportId: listed.report_id }).catch(() => []);
    const foundById = byId.find((report: any) => getReportFileName(report) || isReportReady(report));
    if (foundById) return foundById;
  }

  const byRange = await searchReports({ accessToken, beginDate, endDate }).catch(() => []);
  return byRange.find((report: any) => String(report.id) === String(listed?.report_id || "")) ||
    byRange.find((report: any) => matchesNormalizedRange(report, beginDate, endDate) && isReportReady(report)) ||
    listed ||
    byRange.find((report: any) => !reportEndsInFuture(report)) ||
    null;
}

async function importGeneratedReport({
  report,
  accessToken,
  tenantId,
  userId,
  supabase,
}: {
  report: any;
  accessToken: string;
  tenantId: string;
  userId: string;
  supabase: ReturnType<typeof serviceClient>;
}) {
  const fileName = getReportFileName(report);
  if (!fileName) return null;

  const result = await downloadAndImportReport({
    fileName,
    accessToken,
    tenantId,
    userId,
    supabase,
  });

  await savePendingTask(supabase, tenantId, null, {
    last_action: "import_report",
    last_imported_file: fileName,
    last_imported_at: new Date().toISOString(),
  });

  return { ...result, fileName };
}

async function createAndSaveReport({
  beginDate,
  endDate,
  accessToken,
  tenantId,
  supabase,
}: {
  beginDate: string;
  endDate: string;
  accessToken: string;
  tenantId: string;
  supabase: ReturnType<typeof serviceClient>;
}) {
  const response = await mpFetch("/v1/account/settlement_report", accessToken, {
    method: "POST",
    body: JSON.stringify({ begin_date: beginDate, end_date: endDate }),
  });
  const report = await response.json();
  const nextTaskId = String(report.id || report.report_id || "");
  await savePendingTask(supabase, tenantId, nextTaskId, {
    last_action: "create_report",
    last_task_id: nextTaskId,
    last_report_id: report.report_id || null,
    last_begin_date: beginDate,
    last_end_date: endDate,
    created_at: new Date().toISOString(),
  });

  return { report, taskId: nextTaskId };
}

function reportRangeDebug(report: any, beginDate: string, endDate: string) {
  return {
    requestedBeginDate: beginDate,
    requestedEndDate: endDate,
    mercadoPagoBeginDate: report?.begin_date || null,
    mercadoPagoEndDate: report?.end_date || null,
    mercadoPagoEndIsFuture: reportEndsInFuture(report),
  };
}

async function importCsvText({
  csvText,
  tenantId,
  userId,
  supabase,
}: {
  csvText: string;
  tenantId: string;
  userId: string;
  supabase: ReturnType<typeof serviceClient>;
}) {
  const rows = parseCsv(csvText);
  const payload = rows
    .map((row) => toMovementPayload(row, tenantId, userId))
    .filter((row) => row.description && row.external_id && Number.isFinite(row.amount));

  if (payload.length === 0) return { imported: 0, latestBalance: null as number | null };

  const { error } = await supabase.from("mercadopago_account_movements").upsert(payload, {
    onConflict: "tenant_id,external_id",
    ignoreDuplicates: true,
  });
  if (error) throw new Error(error.message);

  const latestWithBalance = payload
    .filter((row) => row.balance_after !== null && row.balance_after !== undefined)
    .sort((a, b) => new Date(b.operation_date).getTime() - new Date(a.operation_date).getTime())[0];

  if (latestWithBalance) {
    await supabase.from("mercadopago_treasury_settings").upsert({
      tenant_id: tenantId,
      account_label: "Mercado Pago",
      real_balance: latestWithBalance.balance_after,
      last_balance_at: latestWithBalance.operation_date,
      oauth_status: "connected",
      updated_at: new Date().toISOString(),
    }, { onConflict: "tenant_id" });
  }

  return { imported: payload.length, latestBalance: latestWithBalance?.balance_after ?? null };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthorizedUser(req);
    if ("error" in auth) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.error === "forbidden" ? 403 : 401 },
      );
    }

    const body = await req.json();
    const action = String(body.action || "");

    const accessToken = await mpAccessToken(auth.supabase, auth.user.tenant_id);

    if (action === "status") {
      if (!accessToken) return NextResponse.json({ configured: false });
      const configResponse = await mpFetch("/v1/account/settlement_report/config", accessToken, {
        method: "GET",
      }).catch((error) => {
        if (error instanceof MercadoPagoApiError) {
          return { error };
        }
        throw error;
      });

      return NextResponse.json({
        configured: Boolean(accessToken),
        reportConfigOk: !(configResponse && "error" in configResponse),
        reportConfigError: configResponse && "error" in configResponse
          ? {
              status: configResponse.error.status,
              body: configResponse.error.body,
              endpoint: configResponse.error.path,
            }
          : null,
      });
    }

    if (action === "configure_report") {
      const config = await upsertReportConfig(accessToken, auth.user.tenant_id);
      await saveSettingsNotes(auth.supabase, auth.user.tenant_id, {
        last_action: "configure_report",
        configured_at: new Date().toISOString(),
      });
      return NextResponse.json({ config });
    }

    if (action === "sync_auto") {
      const reportRange = normalizeReportRange(body.beginDate, body.endDate);
      const { beginDate, endDate } = reportRange;
      let configOk = true;

      await ensureReportConfig(accessToken, auth.user.tenant_id).catch(() => {
        configOk = false;
      });

      const { data: settings } = await auth.supabase
        .from("mercadopago_treasury_settings")
        .select("external_user_id, notes")
        .eq("tenant_id", auth.user.tenant_id)
        .maybeSingle();
      const notes = parseSettingsNotes(settings?.notes);
      const taskId = settings?.external_user_id
        ? String(settings.external_user_id)
        : notes.last_task_id
          ? String(notes.last_task_id)
          : "";

      if (taskId) {
        const savedTaskReports = await searchReports({ accessToken, reportId: taskId }).catch(() => []);
        const savedTaskReport = savedTaskReports[0] || null;
        if (savedTaskReport && getReportStatus(savedTaskReport) === "pending" && reportEndsInFuture(savedTaskReport)) {
          await savePendingTask(auth.supabase, auth.user.tenant_id, null, {
            ...notes,
            last_action: "clear_future_pending_report",
            stale_task_id: taskId,
            stale_report_end_date: savedTaskReport.end_date || null,
            cleared_at: new Date().toISOString(),
          });

          const created = await createAndSaveReport({
            beginDate,
            endDate,
            accessToken,
            tenantId: auth.user.tenant_id,
            supabase: auth.supabase,
          });

          return NextResponse.json({
            status: "created",
            configOk,
            taskId: created.taskId,
            report: created.report,
            reportRange: reportRangeDebug(created.report, beginDate, endDate),
            staleTaskId: taskId,
            rangeAdjusted: reportRange.adjusted,
            message: "El reporte pendiente anterior terminaba en el futuro. Cree uno nuevo con rango valido hasta ahora.",
          });
        }
      }

      const existingReport = await findGeneratedReport({
        accessToken,
        taskId: taskId || undefined,
        beginDate,
        endDate,
      });

      if (existingReport && isReportReady(existingReport)) {
        const imported = await importGeneratedReport({
          report: existingReport,
          accessToken,
          tenantId: auth.user.tenant_id,
          userId: auth.user.id,
          supabase: auth.supabase,
        });

        if (imported) {
          return NextResponse.json({
            status: "imported",
            configOk,
            imported: imported.imported,
            latestBalance: imported.latestBalance,
            fileName: imported.fileName,
          });
        }
      }

      if (existingReport && getReportStatus(existingReport) !== "") {
        const nextTaskId = String(existingReport.id || existingReport.report_id || taskId || "");

        if (isStalePendingReport(existingReport)) {
          await savePendingTask(auth.supabase, auth.user.tenant_id, null, {
            ...notes,
            last_action: "replace_stale_pending_report",
            stale_task_id: nextTaskId,
            stale_report: {
              id: existingReport.id || null,
              status: getReportStatus(existingReport),
              date_created: existingReport.date_created || existingReport.generation_date || null,
            },
            cleared_at: new Date().toISOString(),
          });

          const created = await createAndSaveReport({
            beginDate,
            endDate,
            accessToken,
            tenantId: auth.user.tenant_id,
            supabase: auth.supabase,
          });

          return NextResponse.json({
            status: "created",
            configOk,
            taskId: created.taskId,
            report: created.report,
            reportRange: reportRangeDebug(created.report, beginDate, endDate),
            staleTaskId: nextTaskId,
            message: "El reporte anterior estaba pendiente sin archivo ni datos de generacion. Cree uno nuevo con la configuracion actual.",
          });
        }

        await savePendingTask(auth.supabase, auth.user.tenant_id, nextTaskId, {
          ...notes,
          last_action: "report_pending",
          last_task_id: nextTaskId,
          last_report_id: existingReport.report_id || null,
          last_begin_date: beginDate,
          last_end_date: endDate,
          last_status: getReportStatus(existingReport),
          updated_at: new Date().toISOString(),
        });

          return NextResponse.json({
            status: "pending",
            configOk,
            taskId: nextTaskId,
            taskStatus: getReportStatus(existingReport),
            report: existingReport,
            rangeAdjusted: reportRange.adjusted,
            message: reportRange.adjusted
              ? "Ajuste el rango para no pedir fechas futuras. Mercado Pago todavia esta procesando el reporte vigente."
              : "Mercado Pago todavia esta procesando el reporte. No cree otro para evitar duplicados.",
          });
        }

      if (taskId) {
        try {
          const taskResponse = await mpFetch(
            `/v1/account/settlement_report/task/${encodeURIComponent(taskId)}?access_token=${encodeURIComponent(accessToken)}`,
            accessToken,
          );
          const task = await taskResponse.json();

          if (getReportStatus(task) === "pending" && reportEndsInFuture(task)) {
            await savePendingTask(auth.supabase, auth.user.tenant_id, null, {
              ...notes,
              last_action: "clear_future_task_report",
              stale_task_id: taskId,
              stale_report_end_date: task.end_date || null,
              cleared_at: new Date().toISOString(),
            });

            const created = await createAndSaveReport({
              beginDate,
              endDate,
              accessToken,
              tenantId: auth.user.tenant_id,
              supabase: auth.supabase,
            });

            return NextResponse.json({
              status: "created",
              configOk,
              taskId: created.taskId,
              report: created.report,
              reportRange: reportRangeDebug(created.report, beginDate, endDate),
              staleTaskId: taskId,
              rangeAdjusted: reportRange.adjusted,
              message: "La tarea pendiente anterior terminaba en el futuro. Cree un reporte nuevo con rango valido hasta ahora.",
            });
          }

          if (isReportReady(task)) {
            const result = await importGeneratedReport({
              report: task,
              accessToken,
              tenantId: auth.user.tenant_id,
              userId: auth.user.id,
              supabase: auth.supabase,
            });

            if (result) {
              return NextResponse.json({
                status: "imported",
                configOk,
                imported: result.imported,
                latestBalance: result.latestBalance,
                fileName: result.fileName,
              });
            }
          }

          return NextResponse.json({
            status: "pending",
            configOk,
            taskId,
            taskStatus: getReportStatus(task) || "pending",
            report: task,
            rangeAdjusted: reportRange.adjusted,
            message: reportRange.adjusted
              ? "Ajuste el rango para no pedir fechas futuras. Mercado Pago todavia esta procesando el reporte."
              : "Mercado Pago todavia esta procesando el reporte. Volve a tocar sincronizar en unos minutos.",
          });
        } catch (error) {
          if (!(error instanceof MercadoPagoApiError) || error.status !== 404) throw error;
          await savePendingTask(auth.supabase, auth.user.tenant_id, null, {
            ...notes,
            last_action: "clear_stale_task",
            stale_task_id: taskId,
            cleared_at: new Date().toISOString(),
          });

          const created = await createAndSaveReport({
            beginDate,
            endDate,
            accessToken,
            tenantId: auth.user.tenant_id,
            supabase: auth.supabase,
          });
          return NextResponse.json({
            status: "created",
            configOk,
            taskId: created.taskId,
            report: created.report,
            reportRange: reportRangeDebug(created.report, beginDate, endDate),
            rangeAdjusted: reportRange.adjusted,
            message: reportRange.adjusted
              ? "El rango terminaba en el futuro. Lo ajuste hasta ahora y cree un reporte nuevo."
              : "No encontre el reporte anterior en task, list ni search. Cree uno nuevo y lo deje guardado para consultar en el proximo intento.",
            staleTaskId: taskId,
          });
        }
      }

      const created = await createAndSaveReport({
        beginDate,
        endDate,
        accessToken,
        tenantId: auth.user.tenant_id,
        supabase: auth.supabase,
      });

      return NextResponse.json({
        status: "created",
        configOk,
        taskId: created.taskId,
        report: created.report,
        reportRange: reportRangeDebug(created.report, beginDate, endDate),
        rangeAdjusted: reportRange.adjusted,
        message: reportRange.adjusted
          ? "El rango terminaba en el futuro. Lo ajuste hasta ahora y solicite el reporte."
          : "Reporte solicitado. Volve a tocar sincronizar en unos minutos para importarlo.",
      });
    }

    if (action === "create_report") {
      const { beginDate, endDate } = normalizeReportRange(body.beginDate, body.endDate);
      const existingReport = await findGeneratedReport({
        accessToken,
        beginDate,
        endDate,
      });

      if (existingReport) {
        const taskId = String(existingReport.id || existingReport.report_id || "");
        await savePendingTask(auth.supabase, auth.user.tenant_id, taskId, {
          last_action: "reuse_existing_report",
          last_task_id: taskId,
          last_report_id: existingReport.report_id || null,
          last_begin_date: beginDate,
          last_end_date: endDate,
          updated_at: new Date().toISOString(),
        });
        return NextResponse.json({
          report: existingReport,
          reused: true,
          message: "Ya habia un reporte de Mercado Pago para ese rango. Lo reutilice para evitar duplicados.",
        });
      }

      const created = await createAndSaveReport({
        beginDate,
        endDate,
        accessToken,
        tenantId: auth.user.tenant_id,
        supabase: auth.supabase,
      });
      return NextResponse.json({ report: created.report, taskId: created.taskId });
    }

    if (action === "check_report") {
      const taskId = String(body.taskId || "").trim();
      if (!taskId) return NextResponse.json({ error: "task_id_required" }, { status: 400 });
      const { beginDate, endDate } = normalizeReportRange(body.beginDate, body.endDate);
      const found = await findGeneratedReport({
        accessToken,
        taskId,
        beginDate,
        endDate,
      });

      if (found) return NextResponse.json({ report: found, source: "list_or_search" });

      const response = await mpFetch(
        `/v1/account/settlement_report/task/${encodeURIComponent(taskId)}?access_token=${encodeURIComponent(accessToken)}`,
        accessToken,
      );
      const report = await response.json();
      return NextResponse.json({ report, source: "task" });
    }

    if (action === "download_report") {
      const fileName = String(body.fileName || "").trim();
      if (!fileName) return NextResponse.json({ error: "file_name_required" }, { status: 400 });
      const result = await downloadAndImportReport({
        fileName,
        accessToken,
        tenantId: auth.user.tenant_id,
        userId: auth.user.id,
        supabase: auth.supabase,
      });
      return NextResponse.json({ ...result, fileName });
    }

    if (action === "import_csv") {
      const csvText = String(body.csvText || "");
      const result = await importCsvText({
        csvText,
        tenantId: auth.user.tenant_id,
        userId: auth.user.id,
        supabase: auth.supabase,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  } catch (error) {
    if (error instanceof MercadoPagoApiError) {
      return NextResponse.json(
        {
          error: error.message,
          status: error.status,
          endpoint: sanitizeMpPath(error.path),
          mercadopago_response: error.body,
        },
        { status: error.status >= 400 && error.status < 600 ? error.status : 500 },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "mercadopago_sync_failed" },
      { status: 500 },
    );
  }
}
