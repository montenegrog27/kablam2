// ESC/POS commands for thermal printers
export function buildComanda(order: any, items: any[], branchName: string): Uint8Array {
  const enc = new TextEncoder();
  const lines: string[] = [];

  const center = (s: string) => `\x1b\x61\x01${s}\x1b\x61\x00`;
  const bold = (s: string) => `\x1b\x45\x01${s}\x1b\x45\x00`;
  const doubleH = (s: string) => `\x1b\x64\x01${s}\x1b\x64\x00`;
  const large = (s: string) => `\x1b\x21\x30${s}\x1b\x21\x00`;

  lines.push('\x1b\x40'); // Initialize
  lines.push('\x1b\x74\x03'); // Code page 850 (Latin-1)

  // Header
  lines.push(center(large(branchName || "KABLAM")));
  lines.push(center("COMANDA"));
  lines.push(center(`Pedido #${order.id?.slice(0, 8) || "N/A"}`));
  lines.push(center(`Cliente: ${order.customer_name || "N/A"}`));
  lines.push(center(`Tipo: ${order.type === "delivery" ? "DELIVERY" : "TAKEAWAY"}`));
  if (order.type === "delivery" && order.address) {
    lines.push(center(`Dir: ${order.address}`));
  }
  lines.push('--------------------------------');
  lines.push('');

  // Items
  items.forEach((item: any, i: number) => {
    const qty = item.quantity || 1;
    const name = item.products?.name || item.name || "Producto";
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
  lines.push(center('¡Gracias por su pedido!'));
  lines.push('\x1b\x64\x05'); // 5 line feeds
  lines.push('\x1d\x56\x00'); // Cut paper

  return enc.encode(lines.join('\n') + '\n');
}

export function buildTicket(order: any, items: any[], branchName: string, total: number, payment: string): Uint8Array {
  const enc = new TextEncoder();
  const lines: string[] = [];

  const center = (s: string) => `\x1b\x61\x01${s}\x1b\x61\x00`;
  const bold = (s: string) => `\x1b\x45\x01${s}\x1b\x45\x00`;
  const large = (s: string) => `\x1b\x21\x30${s}\x1b\x21\x00`;

  lines.push('\x1b\x40');
  lines.push('\x1b\x74\x03');

  lines.push(center(large(branchName || "KABLAM")));
  lines.push(center("TICKET DE COMPRA"));
  lines.push(center(new Date().toLocaleString("es-AR")));
  lines.push('================================');
  lines.push('');

  items.forEach((item: any) => {
    const qty = item.quantity || 1;
    const name = item.products?.name || item.name || "Producto";
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
  lines.push(center('¡Gracias por tu compra!'));
  lines.push('\x1b\x64\x05');
  lines.push('\x1d\x56\x00');

  return enc.encode(lines.join('\n') + '\n');
}
