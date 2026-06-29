import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { usb } from "usb";
import { buildComanda, buildTicket } from "./escpos.js";

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "BRANCH_ID"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[print-agent] Missing env ${key}`);
    process.exit(1);
  }
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const branchId = process.env.BRANCH_ID;
const tenantId = process.env.TENANT_ID || null;
const printMode = process.env.PRINT_MODE || "device";
const devicePath = process.env.PRINT_DEVICE_PATH || "/dev/usb/lp0";
const stateFile = path.resolve(process.env.PRINTED_STATE_FILE || "./printed-orders.json");
const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS || 15000);
const printTickets = process.env.PRINT_TICKETS === "true";

let printed = new Set();

async function loadState() {
  try {
    const raw = await fs.readFile(stateFile, "utf8");
    printed = new Set(JSON.parse(raw));
  } catch {
    printed = new Set();
  }
}

async function saveState() {
  const values = [...printed].slice(-1000);
  await fs.writeFile(stateFile, JSON.stringify(values, null, 2));
}

function markKey(orderId, type, printerId) {
  return `${orderId}:${type}:${printerId || "default"}`;
}

async function fetchOrder(orderId) {
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*, products(*), combos(*))")
    .eq("id", orderId)
    .eq("branch_id", branchId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function fetchBranchName() {
  const { data } = await supabase.from("branches").select("name").eq("id", branchId).maybeSingle();
  return data?.name || "KABLAM";
}

async function fetchPrinters(type) {
  const col = type === "comanda" ? "print_comandas" : "print_ticket";
  let query = supabase
    .from("printers")
    .select("*, printer_categories(*)")
    .eq("branch_id", branchId)
    .eq(col, true);

  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).filter((printer) => ["raspberry", "usb", "network"].includes(printer.type || ""));
}

async function filterItemsForPrinter(order, printer) {
  const assignedCatIds = (printer.printer_categories || []).map((row) => row.category_id).filter(Boolean);
  let items = order.order_items || [];

  if (assignedCatIds.length === 0) return items;

  const productIds = items.map((item) => item.product_id).filter(Boolean);
  if (productIds.length === 0) return items;

  const { data: products } = await supabase.from("products").select("id, category_id").in("id", productIds);
  const productCatMap = Object.fromEntries((products || []).map((product) => [product.id, product.category_id]));

  return items.filter((item) => {
    if (item.item_type === "promotion") return true;
    if (item.combo_id) return true;
    return assignedCatIds.includes(productCatMap[item.product_id]);
  });
}

async function writeToDevice(buffer) {
  await fs.writeFile(devicePath, buffer);
}

async function writeToUsb(buffer, printer) {
  if (!printer.usb_vendor_id || !printer.usb_product_id) {
    throw new Error(`Printer ${printer.name} does not have usb_vendor_id/usb_product_id`);
  }

  const device = usb.findByIds(Number(printer.usb_vendor_id), Number(printer.usb_product_id));
  if (!device) throw new Error(`USB printer not found: VID ${printer.usb_vendor_id} PID ${printer.usb_product_id}`);

  device.open();
  try {
    const iface = device.interfaces[0];
    if (!iface) throw new Error("USB interface not found");
    if (iface.isKernelDriverActive?.()) iface.detachKernelDriver();
    iface.claim();
    const endpoint = iface.endpoints.find((ep) => ep.direction === "out");
    if (!endpoint) throw new Error("USB output endpoint not found");

    await new Promise((resolve, reject) => endpoint.transfer(buffer, (error) => (error ? reject(error) : resolve())));
    iface.release(true, () => {});
  } finally {
    device.close();
  }
}

async function sendToPrinter(buffer, printer) {
  if (printMode === "usb") {
    await writeToUsb(buffer, printer);
    return;
  }

  await writeToDevice(buffer);
}

async function printOrder(orderId, reason = "realtime", options = {}) {
  const force = options.force === true;
  const dedupeSuffix = options.dedupeSuffix || "";
  const jobs = options.jobs || ["comanda", ...(printTickets ? ["ticket"] : [])];
  const order = await fetchOrder(orderId);
  if (!order) {
    console.warn(`[print-agent] Order ${orderId} not found for branch ${branchId}`);
    return;
  }

  if (tenantId && order.tenant_id !== tenantId) {
    console.warn(`[print-agent] Ignoring order ${orderId}: tenant mismatch`);
    return;
  }

  const branchName = await fetchBranchName();
  for (const jobType of jobs) {
    const printers = await fetchPrinters(jobType);
    if (printers.length === 0) {
      console.log(`[print-agent] No printers configured for ${jobType}`);
      continue;
    }

    for (const printer of printers) {
      const key = `${markKey(order.id, jobType, printer.id)}${dedupeSuffix}`;
      if (!force && printed.has(key)) continue;

      const items = jobType === "comanda" ? await filterItemsForPrinter(order, printer) : order.order_items || [];
      if (jobType === "comanda" && items.length === 0) {
        console.log(`[print-agent] ${printer.name}: no matching items for order ${order.id}`);
        printed.add(key);
        await saveState();
        continue;
      }

      const data =
        jobType === "comanda"
          ? buildComanda(order, items, branchName, {
              comanda_header: printer.comanda_header,
              comanda_footer: printer.comanda_footer,
            })
          : buildTicket(order, items, branchName, order.total || 0, order.payment_method || "Pago", {
              ticket_header: printer.ticket_header,
              ticket_footer: printer.ticket_footer,
            });

      await sendToPrinter(data, printer);
      printed.add(key);
      await saveState();
      console.log(`[print-agent] Printed ${jobType} for order ${order.id} on ${printer.name} (${reason})`);
    }
  }
}

function subscribeRealtime() {
  const channel = supabase
    .channel(`kablam-print-agent-${branchId}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "orders",
        filter: `branch_id=eq.${branchId}`,
      },
      async (payload) => {
        const oldStatus = payload.old?.status;
        const nextStatus = payload.new?.status;
        const oldReprintAt = payload.old?.reprint_at || null;
        const nextReprintAt = payload.new?.reprint_at || null;
        const oldComandaPrintAt = payload.old?.comanda_print_at || null;
        const nextComandaPrintAt = payload.new?.comanda_print_at || null;
        const oldTicketPrintAt = payload.old?.ticket_print_at || null;
        const nextTicketPrintAt = payload.new?.ticket_print_at || null;
        const shouldAutoPrint = nextStatus === "preparing" && oldStatus !== "preparing";
        const shouldPrintComanda = nextComandaPrintAt && nextComandaPrintAt !== oldComandaPrintAt;
        const shouldReprint = nextReprintAt && nextReprintAt !== oldReprintAt;
        const shouldPrintTicket = nextTicketPrintAt && nextTicketPrintAt !== oldTicketPrintAt;
        if (!shouldAutoPrint && !shouldPrintComanda && !shouldReprint && !shouldPrintTicket) return;

        try {
          if (shouldPrintComanda) {
            await printOrder(payload.new.id, "comanda-print", {
              force: true,
              jobs: ["comanda"],
              dedupeSuffix: `:comanda:${nextComandaPrintAt}`,
            });
          } else if (shouldPrintTicket) {
            await printOrder(payload.new.id, "ticket-print", {
              force: true,
              jobs: ["ticket"],
              dedupeSuffix: `:ticket:${nextTicketPrintAt}`,
            });
          } else if (shouldReprint) {
            await printOrder(payload.new.id, "reprint", {
              force: true,
              dedupeSuffix: `:${nextReprintAt}`,
            });
          } else {
            await printOrder(payload.new.id, "realtime");
          }
        } catch (error) {
          console.error(`[print-agent] Print failed for ${payload.new.id}:`, error);
        }
      },
    )
    .subscribe((status) => console.log(`[print-agent] Realtime status: ${status}`));

  return channel;
}

async function pollMissedOrders() {
  const since = new Date(Date.now() - 1000 * 60 * 30).toISOString();
  const { data, error } = await supabase
    .from("orders")
    .select("id, status, preparing_at, tenant_id")
    .eq("branch_id", branchId)
    .eq("status", "preparing")
    .gte("preparing_at", since)
    .order("preparing_at", { ascending: false });

  if (error) {
    console.error("[print-agent] Poll failed:", error.message);
    return;
  }

  for (const order of data || []) {
    if (tenantId && order.tenant_id !== tenantId) continue;
    try {
      await printOrder(order.id, "poll");
    } catch (error) {
      console.error(`[print-agent] Poll print failed for ${order.id}:`, error);
    }
  }
}

await loadState();
console.log(`[print-agent] Starting for branch ${branchId}`);
console.log(`[print-agent] Mode: ${printMode}${printMode === "device" ? ` (${devicePath})` : ""}`);
subscribeRealtime();
await pollMissedOrders();
setInterval(pollMissedOrders, pollIntervalMs);
