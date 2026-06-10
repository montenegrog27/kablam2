import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ARGENTINA_OFFSET = "-03:00";
const MIN_OVERNIGHT_REPORT_END = 90;

type BranchHour = {
  branch_id: string;
  day_of_week: number;
  open_time?: string | null;
  close_time?: string | null;
  is_closed?: boolean | null;
};

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function normalizeArgWhatsapp(value: unknown) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("549")) digits = digits.slice(3);
  else if (digits.startsWith("54")) digits = digits.slice(2);
  if (digits.startsWith("9")) digits = digits.slice(1);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.startsWith("15")) digits = digits.slice(2);
  if (digits.length !== 10) return null;
  return `549${digits}`;
}

function money(value: number) {
  return `$${Math.round(value || 0).toLocaleString("es-AR")}`;
}

function addDays(dateStr: string, days: number) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().split("T")[0];
}

function dayOfWeek(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function timeToMinutes(value?: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function minutesToUtcIso(dateStr: string, absoluteMinutes: number) {
  const date = addDays(dateStr, Math.floor(absoluteMinutes / 1440));
  const minutes = ((absoluteMinutes % 1440) + 1440) % 1440;
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return new Date(`${date}T${hour}:${minute}:00${ARGENTINA_OFFSET}`).toISOString();
}

function buildBusinessWindow(dateStr: string, branchHours: BranchHour[]) {
  const hoursForDay = branchHours.filter((hour) => Number(hour.day_of_week) === dayOfWeek(dateStr) && !hour.is_closed);
  const ranges = hoursForDay
    .map((hour) => {
      const open = timeToMinutes(hour.open_time);
      const close = timeToMinutes(hour.close_time);
      if (open === null || close === null) return null;
      const crossesMidnight = close <= open;
      return {
        open,
        close: crossesMidnight ? Math.max(close + 1440, 1440 + MIN_OVERNIGHT_REPORT_END) : close,
      };
    })
    .filter((range): range is { open: number; close: number } => Boolean(range));

  if (ranges.length === 0) {
    return {
      start: minutesToUtcIso(dateStr, 0),
      end: minutesToUtcIso(dateStr, 1440 + MIN_OVERNIGHT_REPORT_END),
      label: "00:00 a 01:30 del dia siguiente",
    };
  }

  const startMinutes = Math.min(...ranges.map((range) => range.open));
  const endMinutes = Math.max(...ranges.map((range) => range.close));
  const endLocalMinutes = endMinutes % 1440;
  const startLabel = `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`;
  const endLabel = `${String(Math.floor(endLocalMinutes / 60)).padStart(2, "0")}:${String(endLocalMinutes % 60).padStart(2, "0")}`;
  return {
    start: minutesToUtcIso(dateStr, startMinutes),
    end: minutesToUtcIso(dateStr, endMinutes),
    label: `${startLabel} a ${endLabel}${endMinutes >= 1440 ? " del dia siguiente" : ""}`,
  };
}

function argentinaDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function buildReportMessage(closure: any, branchName: string, registerName: string) {
  const difference = Number(closure.difference || 0);
  const payments = Object.entries(closure.payments || {})
    .map(([name, amount]) => `- ${name}: ${money(Number(amount))}`)
    .join("\n") || "- Sin detalle";

  return [
    `*Cierre de caja - ${branchName}*`,
    `Caja: ${registerName}`,
    `Hora: ${new Date(closure.closed_at).toLocaleString("es-AR")}`,
    "",
    `Pedidos: *${closure.total_orders || 0}*`,
    `Ventas totales: *${money(Number(closure.total_revenue || 0))}*`,
    `Sin envio: ${money(Number(closure.total_without_shipping || 0))}`,
    `Envios: ${money(Number(closure.total_shipping || 0))}`,
    "",
    `Efectivo esperado: ${money(Number(closure.expected_cash || 0))}`,
    `Efectivo contado: ${money(Number(closure.closing_amount || 0))}`,
    `Diferencia: *${money(difference)}*`,
    closure.difference_reason ? `Motivo: ${closure.difference_reason}` : null,
    `Caja chica para manana: ${money(Number(closure.carry_over || 0))}`,
    "",
    "*Medios de pago*",
    payments,
    "",
    `Costo estimado: ${money(Number(closure.total_cost || 0))}`,
    `Ganancia bruta: *${money(Number(closure.profit || 0))}*`,
  ].filter(Boolean).join("\n");
}

function getRecipients(settings: any) {
  const rows = Array.isArray(settings?.daily_report_whatsapp_recipients)
    ? settings.daily_report_whatsapp_recipients
    : [];
  const recipients = rows
    .map((item: any) => ({
      name: String(item?.name || "Contacto"),
      phone: normalizeArgWhatsapp(item?.phone),
    }))
    .filter((item: { phone: string | null }) => Boolean(item.phone));

  const legacyPhone = normalizeArgWhatsapp(settings?.daily_report_whatsapp_phone);
  if (recipients.length === 0 && legacyPhone) {
    recipients.push({ name: "Dueño", phone: legacyPhone });
  }

  return recipients;
}

function isUuid(value: string | null | undefined) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}

async function resolveWhatsappBranchId(
  supabase: ReturnType<typeof serviceClient>,
  tenantId: string,
  preferred: string | null | undefined,
  branchUuid: string | null | undefined,
) {
  if (preferred && preferred !== "admin" && !isUuid(preferred)) return preferred;

  if (branchUuid) {
    const { data } = await supabase
      .from("branches")
      .select("slug")
      .eq("id", branchUuid)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (data?.slug) return data.slug;
  }

  const { data } = await supabase
    .from("branches")
    .select("slug")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.slug || null;
}

async function hydrateClosures(supabase: ReturnType<typeof serviceClient>, closures: any[]) {
  const branchIds = [...new Set(closures.map((closure) => closure.branch_id).filter(Boolean))];
  const registerIds = [...new Set(closures.map((closure) => closure.cash_register_id).filter(Boolean))];

  const [{ data: branches }, { data: registers }] = await Promise.all([
    branchIds.length > 0
      ? supabase.from("branches").select("id, name, slug").in("id", branchIds)
      : { data: [] },
    registerIds.length > 0
      ? supabase.from("cash_registers").select("id, name").in("id", registerIds)
      : { data: [] },
  ]);

  const branchById = Object.fromEntries((branches || []).map((branch: any) => [branch.id, branch]));
  const registerById = Object.fromEntries((registers || []).map((register: any) => [register.id, register]));

  return closures.map((closure) => ({
    ...closure,
    branches: branchById[closure.branch_id] || null,
    cash_registers: registerById[closure.cash_register_id] || null,
  }));
}

function buildDailyReportMessage(closures: any[], date: string) {
  const totals = closures.reduce(
    (acc, closure) => {
      acc.orders += Number(closure.total_orders || 0);
      acc.revenue += Number(closure.total_revenue || 0);
      acc.withoutShipping += Number(closure.total_without_shipping || 0);
      acc.shipping += Number(closure.total_shipping || 0);
      acc.expected += Number(closure.expected_cash || 0);
      acc.counted += Number(closure.closing_amount || 0);
      acc.difference += Number(closure.difference || 0);
      acc.cost += Number(closure.total_cost || 0);
      acc.profit += Number(closure.profit || 0);
      return acc;
    },
    { orders: 0, revenue: 0, withoutShipping: 0, shipping: 0, expected: 0, counted: 0, difference: 0, cost: 0, profit: 0 },
  );

  const closureLines = closures.map((closure) => {
    const branch = closure.branches?.name || "Sucursal";
    const register = closure.cash_registers?.name || "Caja";
    return `- ${branch} / ${register}: ${money(Number(closure.total_revenue || 0))} · dif. ${money(Number(closure.difference || 0))}`;
  });

  return [
    `*Reporte diario de cierres*`,
    `Fecha: ${new Date(`${date}T12:00:00-03:00`).toLocaleDateString("es-AR")}`,
    "",
    `Cierres: *${closures.length}*`,
    `Pedidos: *${totals.orders}*`,
    `Ventas totales: *${money(totals.revenue)}*`,
    `Sin envio: ${money(totals.withoutShipping)}`,
    `Envios: ${money(totals.shipping)}`,
    "",
    `Efectivo esperado: ${money(totals.expected)}`,
    `Efectivo contado: ${money(totals.counted)}`,
    `Diferencia neta: *${money(totals.difference)}*`,
    "",
    `Costo estimado: ${money(totals.cost)}`,
    `Ganancia bruta: *${money(totals.profit)}*`,
    "",
    "*Cierres*",
    closureLines.join("\n") || "- Sin cierres",
  ].join("\n");
}

async function sendWhatsapp(phone: string, message: string, branchId: string | null) {
  const whatsappToken = String(process.env.WHATSAPP_TOKEN || "")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!whatsappToken) return { ok: false, skipped: true, status: 503, response: "WHATSAPP_TOKEN missing" };
  if (!branchId) return { ok: false, status: 400, response: "branch_slug_missing" };

  const response = await fetch("https://whatsapp.mordiscoburgers.com.ar/api/whatsapp/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${whatsappToken}`,
    },
    body: JSON.stringify({
      slug: "mordiscoburgers",
      branchId,
      phone,
      message,
    }),
  });

  return {
    ok: response.ok,
    status: response.status,
    response: await response.text(),
  };
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "missing_token" }, { status: 401 });

  const supabase = serviceClient();
  const { data: authData } = await supabase.auth.getUser(token);
  const authUser = authData.user;
  if (!authUser) return NextResponse.json({ error: "invalid_token" }, { status: 401 });

  const body = await req.json();
  const closureId = String(body.closureId || "");
  const date = String(body.date || "");
  const requestedBranchId = String(body.branchId || "");
  if (!closureId && !date) return NextResponse.json({ error: "closure_id_or_date_required" }, { status: 400 });

  const { data: user } = await supabase
    .from("users")
    .select("id, tenant_id, role")
    .eq("id", authUser.id)
    .maybeSingle();
  if (!user?.tenant_id) return NextResponse.json({ error: "user_not_found" }, { status: 403 });

  const { data: settings } = await supabase
    .from("financial_settings")
    .select("daily_report_whatsapp_enabled, daily_report_whatsapp_phone, daily_report_whatsapp_recipients")
    .eq("tenant_id", user.tenant_id)
    .maybeSingle();

  if (!settings?.daily_report_whatsapp_enabled) {
    return NextResponse.json({ skipped: true, reason: "disabled" });
  }

  const recipients = getRecipients(settings);
  if (recipients.length === 0) return NextResponse.json({ skipped: true, reason: "recipients_missing_or_invalid" });

  let message = "";
  let branchId: string | null = null;

  if (closureId) {
    const { data: closure } = await supabase
      .from("cash_closures")
      .select("*")
      .eq("id", closureId)
      .eq("tenant_id", user.tenant_id)
      .maybeSingle();
    if (!closure) return NextResponse.json({ error: "closure_not_found" }, { status: 404 });
    const hydratedClosure = (await hydrateClosures(supabase, [closure]))[0];

    const closureBusinessDate = hydratedClosure.opened_at
      ? argentinaDate(hydratedClosure.opened_at)
      : argentinaDate(hydratedClosure.closed_at);
    const { data: closureBranchHourRows } = await supabase
      .from("branch_hours")
      .select("branch_id, day_of_week, open_time, close_time, is_closed")
      .eq("branch_id", hydratedClosure.branch_id);
    const closureWindow = buildBusinessWindow(closureBusinessDate, (closureBranchHourRows || []) as BranchHour[]);
    const { data: rawDayClosures } = await supabase
      .from("cash_closures")
      .select("*")
      .eq("tenant_id", user.tenant_id)
      .eq("branch_id", hydratedClosure.branch_id)
      .gte("closed_at", closureWindow.start)
      .lt("closed_at", closureWindow.end)
      .order("closed_at", { ascending: true });
    const dayClosures = await hydrateClosures(supabase, rawDayClosures || []);

    message = [
      buildReportMessage(
      hydratedClosure,
      hydratedClosure.branches?.name || "Sucursal",
      hydratedClosure.cash_registers?.name || "Caja",
      ),
      buildDailyReportMessage(dayClosures.length > 0 ? dayClosures : [hydratedClosure], closureBusinessDate),
      `Rango buscado: ${closureWindow.label}`,
    ].filter(Boolean).join("\n\n");
    branchId = await resolveWhatsappBranchId(
      supabase,
      user.tenant_id,
      hydratedClosure.branches?.slug,
      hydratedClosure.branch_id,
    );
  } else {
    if (!requestedBranchId) return NextResponse.json({ error: "branch_id_required" }, { status: 400 });

    const { data: branchHourRows } = await supabase
      .from("branch_hours")
      .select("branch_id, day_of_week, open_time, close_time, is_closed")
      .eq("branch_id", requestedBranchId);
    const window = buildBusinessWindow(date, (branchHourRows || []) as BranchHour[]);

    let closuresQuery = supabase
      .from("cash_closures")
      .select("*")
      .eq("tenant_id", user.tenant_id)
      .gte("closed_at", window.start)
      .lt("closed_at", window.end);

    closuresQuery = closuresQuery.eq("branch_id", requestedBranchId);

    const { data: rawClosures, error: closuresError } = await closuresQuery.order("closed_at", { ascending: true });
    if (closuresError) {
      return NextResponse.json({ error: closuresError.message }, { status: 500 });
    }
    const closures = await hydrateClosures(supabase, rawClosures || []);

    if (!closures?.length) return NextResponse.json({ error: "no_closures_for_date" }, { status: 404 });

    message = [
      buildDailyReportMessage(closures, date),
      `Rango buscado: ${window.label}`,
    ].join("\n\n");
    branchId = await resolveWhatsappBranchId(
      supabase,
      user.tenant_id,
      closures[0]?.branches?.slug,
      requestedBranchId || closures[0]?.branch_id,
    );
  }

  const results = await Promise.all(
    recipients.map((recipient: { name: string; phone: string }) =>
      sendWhatsapp(recipient.phone, message, branchId).then((result) => ({
        ...result,
        recipient: recipient.name,
        phone: recipient.phone,
      })),
    ),
  );

  const failed = results.filter((result: any) => result.ok !== true);
  return NextResponse.json({
    ok: failed.length === 0,
    sent: results.length - failed.length,
    failed: failed.length,
    results,
  }, { status: failed.length === results.length ? 502 : 200 });
}
