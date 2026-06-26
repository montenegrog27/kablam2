const center = (s) => `\x1b\x61\x01${s}\x1b\x61\x00`;
const bold = (s) => `\x1b\x45\x01${s}\x1b\x45\x00`;
const large = (s) => `\x1b\x21\x30${s}\x1b\x21\x00`;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "");
}

function money(value) {
  return Number(value || 0).toLocaleString("es-AR");
}

function getItemName(item) {
  if (item.item_type === "promotion") {
    return item.extras?.find((extra) => extra?.type === "promotion")?.name || item.name || "Promo";
  }

  return (
    item.products?.name ||
    item.combos?.name ||
    item.combo?.name ||
    item.name ||
    (item.combo_id ? "Combo" : "Producto")
  );
}

export function buildComanda(order, items, branchName, config = {}) {
  const lines = [];
  lines.push("\x1b\x40");
  lines.push("\x1b\x74\x03");
  lines.push(center(large(normalizeText(branchName || "KABLAM"))));

  if (config.comanda_header) lines.push(center(normalizeText(config.comanda_header)));

  lines.push(center(bold("COMANDA")));
  lines.push(center(`Pedido #${String(order.id || "").slice(-6).toUpperCase()}`));
  lines.push(center(`Cliente: ${normalizeText(order.customer_name || "N/A")}`));
  lines.push(center(`Tipo: ${order.type === "delivery" ? "DELIVERY" : "TAKEAWAY"}`));
  if (order.type === "delivery" && order.address) lines.push(center(`Dir: ${normalizeText(order.address)}`));
  lines.push("--------------------------------");
  lines.push("");

  items.forEach((item) => {
    const qty = item.quantity || 1;
    lines.push(`${qty}x ${normalizeText(getItemName(item))}`);

    if (item.item_type === "promotion") {
      const included = (item.extras || []).filter((extra) => extra?.type === "incluye");
      included.forEach((extra) => lines.push(`   incluye: ${normalizeText(extra.name)}`));
    }

    (item.extras || [])
      .filter((extra) => extra?.type === "extra" || extra?.type === "sin")
      .forEach((extra) => {
        const prefix = extra.type === "sin" ? "SIN" : "+";
        lines.push(`   ${prefix} ${normalizeText(extra.name)}`);
      });

    (item.modifiers || []).forEach((modifier) => lines.push(`   + ${normalizeText(modifier.name)}`));
    if (item.note) lines.push(`   NOTA: ${normalizeText(item.note)}`);
  });

  lines.push("");
  lines.push("--------------------------------");
  if (order.notes || order.note) lines.push(`NOTA PEDIDO: ${normalizeText(order.notes || order.note)}`);
  if (config.comanda_footer) lines.push(center(normalizeText(config.comanda_footer)));
  lines.push("\x1b\x64\x05");
  lines.push("\x1d\x56\x00");

  return Buffer.from(lines.join("\n") + "\n", "binary");
}

export function buildTicket(order, items, branchName, total, payment, config = {}) {
  const lines = [];
  lines.push("\x1b\x40");
  lines.push("\x1b\x74\x03");
  lines.push(center(large(normalizeText(branchName || "KABLAM"))));
  if (config.ticket_header) lines.push(center(normalizeText(config.ticket_header)));
  lines.push(center("TICKET DE COMPRA"));
  lines.push(center(new Date().toLocaleString("es-AR")));
  lines.push("================================");
  lines.push("");

  items.forEach((item) => {
    const qty = item.quantity || 1;
    const name = normalizeText(getItemName(item)).slice(0, 24).padEnd(24);
    const price = Number(item.unit_price || item.price || 0);
    lines.push(`${qty}x ${name} $${money(qty * price).padStart(8)}`);
  });

  lines.push("");
  lines.push("================================");
  lines.push(`${bold("TOTAL".padEnd(28))} $${money(total).padStart(8)}`);
  lines.push("");
  lines.push(center(`Pago: ${normalizeText(payment || "N/A")}`));
  if (config.ticket_footer) lines.push(center(normalizeText(config.ticket_footer)));
  lines.push("\x1b\x64\x05");
  lines.push("\x1d\x56\x00");

  return Buffer.from(lines.join("\n") + "\n", "binary");
}
