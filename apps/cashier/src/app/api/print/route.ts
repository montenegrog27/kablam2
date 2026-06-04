import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import net from "net";
import { buildComanda, buildTicket } from "@/lib/escpos";

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const { orderId, type: printType, branchId } = await req.json();

    if (!orderId || !printType || !branchId) {
      return NextResponse.json({ error: "Faltan datos: orderId, type, branchId" }, { status: 400 });
    }

    // Cargar datos del pedido
    const { data: order } = await supabase
      .from("orders")
      .select("*, order_items(*, products(*), combos(*))")
      .eq("id", orderId)
      .single();

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Cargar sucursal
    const { data: branch } = await supabase
      .from("branches")
      .select("name")
      .eq("id", branchId)
      .single();

    const branchName = branch?.name || "";

    // Buscar impresoras según el tipo
    let query = supabase
      .from("printers")
      .select("*, printer_categories!left(*)")
      .eq("branch_id", branchId);

    if (printType === "comanda") {
      query = query.eq("print_comandas", true);
    } else if (printType === "ticket") {
      query = query.eq("print_ticket", true);
    }

    const { data: printers } = await query;

    if (!printers || printers.length === 0) {
      return NextResponse.json({ message: "No hay impresoras configuradas para este tipo" });
    }

    const results: any[] = [];

    for (const printer of printers) {
      if (printer.type === "network" && printer.ip_address) {
        let dataToPrint: Uint8Array;

        if (printType === "comanda") {
          // Filtrar items por categorías asignadas a esta impresora
          const assignedCatIds = (printer.printer_categories || []).map((pc: any) => pc.category_id);
          let itemsToPrint = order.order_items || [];

          if (assignedCatIds.length > 0) {
            // Cargar categorías de los productos
            const productIds = itemsToPrint
              .map((i: any) => i.product_id)
              .filter(Boolean);
            const { data: products } = await supabase
              .from("products")
              .select("id, category_id")
              .in("id", productIds);

            const productCatMap: Record<string, string> = {};
            (products || []).forEach((p: any) => { productCatMap[p.id] = p.category_id; });

            itemsToPrint = itemsToPrint.filter((item: any) => {
              if (item.combo_id) return true;
              return assignedCatIds.includes(productCatMap[item.product_id]);
            });
          }

          dataToPrint = buildComanda(order, itemsToPrint, branchName, {
            comanda_header: printer.comanda_header,
            comanda_footer: printer.comanda_footer,
          });
        } else {
          dataToPrint = buildTicket(order, order.order_items || [], branchName, order.total || 0, "Pago", {
            ticket_header: printer.ticket_header,
            ticket_footer: printer.ticket_footer,
          });
        }

        // Enviar a impresora de red vía TCP
        try {
          await sendToNetworkPrinter(printer.ip_address, printer.port || 9100, dataToPrint);
          results.push({ printer: printer.name, status: "ok" });
        } catch (err: any) {
          results.push({ printer: printer.name, status: "error", error: err.message });
        }
      }
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    console.error("Print error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function sendToNetworkPrinter(ip: string, port: number, data: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);

    socket.connect(port, ip, () => {
      socket.write(Buffer.from(data), (err) => {
        if (err) {
          socket.destroy();
          reject(err);
          return;
        }
        socket.end();
        resolve();
      });
    });

    socket.on("error", (err) => {
      socket.destroy();
      reject(err);
    });

    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Timeout conectando a la impresora"));
    });
  });
}
