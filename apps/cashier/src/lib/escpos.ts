// ESC/POS commands for thermal printers
const center = (s: string) => `\x1b\x61\x01${s}\x1b\x61\x00`;
const bold = (s: string) => `\x1b\x45\x01${s}\x1b\x45\x00`;
const large = (s: string) => `\x1b\x21\x30${s}\x1b\x21\x00`;

type PrinterConfig = {
  ticket_header?: string;
  ticket_footer?: string;
  comanda_header?: string;
  comanda_footer?: string;
};

function getItemName(item: any) {
  return (
    item.products?.name ||
    item.combos?.name ||
    item.combo?.name ||
    item.name ||
    (item.combo_id ? "Combo" : "Producto")
  );
}

export function buildComanda(
  order: any,
  items: any[],
  branchName: string,
  config?: PrinterConfig
): Uint8Array {
  const enc = new TextEncoder();
  const lines: string[] = [];

  lines.push('\x1b\x40');
  lines.push('\x1b\x74\x03');

  lines.push(center(large(branchName || "KABLAM")));

  if (config?.comanda_header) {
    lines.push(center(config.comanda_header));
  }

  lines.push(center("COMANDA"));
  lines.push(center(`Pedido #${order.id?.slice(0, 8) || "N/A"}`));
  lines.push(center(`Cliente: ${order.customer_name || "N/A"}`));
  lines.push(center(`Tipo: ${order.type === "delivery" ? "DELIVERY" : "TAKEAWAY"}`));
  if (order.type === "delivery" && order.address) {
    lines.push(center(`Dir: ${order.address}`));
  }
  lines.push('--------------------------------');
  lines.push('');

  items.forEach((item: any) => {
    const qty = item.quantity || 1;
    const name = getItemName(item);
    lines.push(`${qty}x ${name}`);
    if (item.note) {
      lines.push(`   NOTA: ${item.note}`);
    }
    if (item.modifiers?.length) {
      item.modifiers.forEach((m: any) => {
        lines.push(`   + ${m.name}`);
      });
    }
  });

  lines.push('');
  lines.push('--------------------------------');
  if (config?.comanda_footer) {
    lines.push(center(config.comanda_footer));
  } else {
    lines.push(center('¡Gracias por su pedido!'));
  }
  lines.push('\x1b\x64\x05');
  lines.push('\x1d\x56\x00');

  return enc.encode(lines.join('\n') + '\n');
}

export function buildTicket(
  order: any,
  items: any[],
  branchName: string,
  total: number,
  payment: string,
  config?: PrinterConfig
): Uint8Array {
  const enc = new TextEncoder();
  const lines: string[] = [];

  lines.push('\x1b\x40');
  lines.push('\x1b\x74\x03');

  lines.push(center(large(branchName || "KABLAM")));

  if (config?.ticket_header) {
    lines.push(center(config.ticket_header));
  }

  lines.push(center("TICKET DE COMPRA"));
  lines.push(center(new Date().toLocaleString("es-AR")));
  lines.push('================================');
  lines.push('');

  items.forEach((item: any) => {
    const qty = item.quantity || 1;
    const name = getItemName(item);
    const price = item.unit_price || item.price || 0;
    const lineTotal = qty * price;
    lines.push(`${qty}x ${name.padEnd(25)} $${lineTotal.toFixed(2).padStart(8)}`);
  });

  lines.push('');
  lines.push('================================');
  lines.push(`${bold("SUBTOTAL".padEnd(30))} $${total.toFixed(2).padStart(8)}`);
  if (order.discount > 0) {
    lines.push(`${"DESCUENTO".padEnd(30)} -$${order.discount.toFixed(2).padStart(8)}`);
  }
  if (order.shipping_cost > 0) {
    lines.push(`${"ENVÍO".padEnd(30)} $${order.shipping_cost.toFixed(2).padStart(8)}`);
  }
  lines.push('--------------------------------');
  lines.push(`${bold("TOTAL".padEnd(30))} $${(total - order.discount + (order.shipping_cost || 0)).toFixed(2).padStart(8)}`);

  lines.push('');
  lines.push(center(`Pago: ${payment || "N/A"}`));
  if (config?.ticket_footer) {
    lines.push(center(config.ticket_footer));
  } else {
    lines.push(center('¡Gracias por tu compra!'));
  }
  lines.push('\x1b\x64\x05');
  lines.push('\x1d\x56\x00');

  return enc.encode(lines.join('\n') + '\n');
}
