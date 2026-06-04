import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { buildComanda, buildTicket } from "./escpos";

type PrintJob = {
  orderId: string;
  type: "comanda" | "ticket";
  branchId: string;
};

async function printToLocalAgent(job: PrintJob, logs: string[]): Promise<void> {
  try {
    // Cargar datos del pedido
    const { data: order } = await supabase
      .from("orders")
      .select("*, order_items(*, products(*), combos(*))")
      .eq("id", job.orderId)
      .single();

    if (!order) {
      logs.push(`⚠️ Pedido ${job.orderId} no encontrado`);
      return;
    }

    const { data: branch } = await supabase
      .from("branches")
      .select("name")
      .eq("id", job.branchId)
      .single();

    const branchName = branch?.name || "";
    const escpos = job.type === "comanda"
      ? buildComanda(order, order.order_items || [], branchName)
      : buildTicket(order, order.order_items || [], branchName, order.total || 0, "Pago");

    const base64 = btoa(String.fromCharCode(...escpos));

    // Obtener impresoras configuradas para este tipo
    const col = job.type === "comanda" ? "print_comandas" : "print_ticket";
    const { data: printers } = await supabase
      .from("printers")
      .select("*")
      .eq("branch_id", job.branchId)
      .eq(col, true);

    if (!printers?.length) {
      logs.push(`ℹ️ No hay impresoras configuradas para ${job.type}`);
      return;
    }

    for (const printer of printers) {
      const agentUrl = printer.agent_url || "http://127.0.0.1:9102/";

      // Enviar al agente local
      logs.push(`📡 Enviando a agente local (${agentUrl})...`);
      try {
        const localRes = await fetch(`${agentUrl}print`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: base64,
            printerIp: printer.ip_address,
            printerPort: printer.port || 9100,
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (localRes.ok) {
          logs.push(`✅ Impresión local completada para ${printer.name}`);
        } else {
          const err = await localRes.json();
          logs.push(`❌ Error agente local: ${err.error}`);
        }
      } catch {
        logs.push(`ℹ️ Agente local no disponible. Ejecutá: node print-agent.js`);
      }
    }
  } catch (err: any) {
    logs.push(`❌ Error en agente local: ${err.message}`);
  }
}

export async function printOrder(job: PrintJob): Promise<string[]> {
  const logs: string[] = [];

  try {
    logs.push(`🖨️ Iniciando impresión ${job.type} para pedido ${job.orderId}`);

    // Try network printers via API (Vercel - for remote printers)
    logs.push(`📡 Enviando a API /api/print...`);
    const res = await fetch("/api/print", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job),
    });
    const result = await res.json();
    logs.push(`📡 API respondió: ${JSON.stringify(result)}`);

    // Try local print agent (127.0.0.1:9102) - for local printers
    const shouldBuildLocal = Array.isArray(result?.results) &&
      result.results.some((r: any) => r.status === "error");

    if (shouldBuildLocal || true) {
      logs.push(`📡 Intentando agente local (127.0.0.1:9102)...`);
      await printToLocalAgent(job, logs);
    }

    // Try USB printers via WebUSB if available
    if ((navigator as any).usb) {
      logs.push(`🔌 WebUSB disponible, intentando impresoras USB...`);
      await printUSBOrder(job, logs);
    } else {
      logs.push(`ℹ️ WebUSB no disponible en este navegador`);
    }
  } catch (err: any) {
    logs.push(`❌ Error: ${err.message}`);
    console.error("Print error:", err);
  }

  return logs;
}

async function printUSBOrder(job: PrintJob, logs: string[]): Promise<void> {
  const { data: printers } = await supabase
    .from("printers")
    .select("*")
    .eq("branch_id", job.branchId)
    .eq("type", "usb");

  if (!printers?.length) {
    logs.push(`ℹ️ No hay impresoras USB configuradas`);
    return;
  }

  const usb = (navigator as any).usb;
  const devices = await usb.getDevices();
  logs.push(`🔌 Dispositivos USB autorizados: ${devices.length}`);

  for (const printer of printers) {
    logs.push(`🔍 Buscando impresora USB: ${printer.name} (VID:${printer.usb_vendor_id} PID:${printer.usb_product_id})`);

    let match = devices.find(
      (d: any) => d.vendorId === printer.usb_vendor_id && d.productId === printer.usb_product_id
    );

    if (!match) {
      // Intentar pedir autorización (solo funciona si hay un gesto de usuario activo)
      try {
        logs.push(`🔌 Solicitando autorización USB...`);
        match = await usb.requestDevice({
          filters: [{ vendorId: printer.usb_vendor_id, productId: printer.usb_product_id }]
        });
        logs.push(`✅ Impresora ${printer.name} autorizada!`);
      } catch (err: any) {
        logs.push(`⚠️ Impresora ${printer.name} no autorizada. Usá el botón Probar en Admin > Impresoras.`);
        continue;
      }
    }

    const shouldPrintComanda = job.type === "comanda" && printer.print_comandas;
    const shouldPrintTicket = job.type === "ticket" && printer.print_ticket;
    if (!shouldPrintComanda && !shouldPrintTicket) {
      logs.push(`ℹ️ Impresora ${printer.name} no configurada para ${job.type}`);
      continue;
    }

    // Cargar datos para imprimir
    const { data: order } = await supabase
      .from("orders")
      .select("*, order_items(*, products(*), combos(*))")
      .eq("id", job.orderId)
      .single();

    if (!order) {
      logs.push(`⚠️ Pedido ${job.orderId} no encontrado`);
      continue;
    }

    const { data: branch } = await supabase
      .from("branches")
      .select("name")
      .eq("id", job.branchId)
      .single();

    const branchName = branch?.name || "";
    logs.push(`🏪 Sucursal: ${branchName}`);

    let data: Uint8Array;
    if (job.type === "comanda") {
      data = buildComanda(order, order.order_items || [], branchName);
    } else {
      data = buildTicket(order, order.order_items || [], branchName, order.total || 0, "Pago");
    }
    logs.push(`📄 Datos ESC/POS generados: ${data.length} bytes`);

    // Send via WebUSB
    try {
      logs.push(`🔌 Conectando a ${match.productName}...`);
      await match.open();
      await match.selectConfiguration(1);
      await match.claimInterface(0);

      const iface = match.configurations[0].interfaces[0];
      const endpoint = iface.alternate.endpoints.find((ep: any) => ep.direction === "out");
      if (!endpoint) {
        logs.push(`⚠️ No se encontró endpoint de salida`);
        await match.close();
        continue;
      }

      logs.push(`📤 Enviando datos a endpoint #${endpoint.endpointNumber}...`);
      await match.transferOut(endpoint.endpointNumber, data);
      logs.push(`✅ Datos enviados correctamente a ${printer.name}`);

      await match.close();
    } catch (err: any) {
      logs.push(`❌ Error USB: ${err.message}`);
      console.error(`USB print error for ${printer.name}:`, err);
    }
  }
}

export async function printComandasAndTicket(orderId: string, branchId: string): Promise<string[]> {
  const logs: string[] = [];
  logs.push(`🖨️🖨️ Imprimiendo comanda + ticket para pedido ${orderId}`);
  const comandaLogs = await printOrder({ orderId, type: "comanda", branchId });
  const ticketLogs = await printOrder({ orderId, type: "ticket", branchId });
  logs.push(...comandaLogs, ...ticketLogs);
  console.log("[PRINT LOGS]", logs.join("\n"));
  return logs;
}
