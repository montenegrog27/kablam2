import { supabaseBrowser as supabase } from "@kablam/supabase/client";

type PrintJob = {
  orderId: string;
  type: "comanda" | "ticket";
  branchId: string;
};

export async function printOrder(job: PrintJob): Promise<void> {
  try {
    // Try network printers via API
    await fetch("/api/print", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job),
    });

    // Try USB printers via WebUSB if available
    await printUSBOrder(job);
  } catch (err) {
    console.error("Print error:", err);
  }
}

async function printUSBOrder(job: PrintJob): Promise<void> {
  if (!(navigator as any).usb) return;

  const { data: printers } = await supabase
    .from("printers")
    .select("*")
    .eq("branch_id", job.branchId)
    .eq("type", "usb");

  if (!printers?.length) return;

  const usb = (navigator as any).usb;
  const devices = await usb.getDevices();

  const { buildComanda, buildTicket } = await import("./escpos");

  for (const printer of printers) {
    const match = devices.find(
      (d: any) => d.vendorId === printer.usb_vendor_id && d.productId === printer.usb_product_id
    );
    if (!match) continue;

    const shouldPrintComanda = job.type === "comanda" && printer.print_comandas;
    const shouldPrintTicket = job.type === "ticket" && printer.print_ticket;
    if (!shouldPrintComanda && !shouldPrintTicket) continue;

    // Cargar datos para imprimir
    const { data: order } = await supabase
      .from("orders")
      .select("*, order_items(*, products(*))")
      .eq("id", job.orderId)
      .single();

    if (!order) continue;

    const { data: branch } = await supabase
      .from("branches")
      .select("name")
      .eq("id", job.branchId)
      .single();

    const branchName = branch?.name || "";

    let data: Uint8Array;
    if (job.type === "comanda") {
      data = buildComanda(order, order.order_items || [], branchName);
    } else {
      data = buildTicket(order, order.order_items || [], branchName, order.total || 0, "Pago");
    }

    // Send via WebUSB
    try {
      await match.open();
      await match.selectConfiguration(1);
      await match.claimInterface(0);

      const iface = match.configurations[0].interfaces[0];
      const endpoint = iface.alternate.endpoints.find((ep: any) => ep.direction === "out");
      if (endpoint) {
        await match.transferOut(endpoint.endpointNumber, data);
      }

      await match.close();
    } catch (err) {
      console.error(`USB print error for ${printer.name}:`, err);
    }
  }
}

export async function printComandasAndTicket(orderId: string, branchId: string): Promise<void> {
  // Print comandas
  await printOrder({ orderId, type: "comanda", branchId });
  // Print ticket
  await printOrder({ orderId, type: "ticket", branchId });
}
