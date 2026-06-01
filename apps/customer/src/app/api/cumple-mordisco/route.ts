import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

type OrderRow = {
  id: string;
  branch_id: string | null;
  customer_id: string | null;
  customer_phone: string | null;
  customer_name: string | null;
  total: number | null;
  type: string | null;
  status: string | null;
  created_at: string;
  branches?: { name?: string | null } | null;
};

const LOTS = [
  { key: "lote_1", name: "Lote 1", basePrice: 20000, capacity: 0, position: 1, isActive: true },
  { key: "lote_2", name: "Lote 2", basePrice: 25000, capacity: 0, position: 2, isActive: true },
  { key: "lote_3", name: "Lote 3", basePrice: 30000, capacity: 0, position: 3, isActive: true },
];

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function normalizePhone(value: unknown) {
  return String(value || "")
    .replace(/\D/g, "")
    .replace(/^549/, "")
    .replace(/^54/, "")
    .replace(/^9(\d{10})$/, "$1");
}

function getTier(orderCount: number, topPercentile: number) {
  if (orderCount > 0 && topPercentile <= 10) {
    return {
      key: "founder",
      label: "Fundadores",
      badge: "Badge Fundador",
      discount: 50,
      description: "Maximo beneficio por ser de los clientes mas frecuentes.",
    };
  }

  if (orderCount > 3) {
    return {
      key: "community",
      label: "Comunidad Mordisco",
      badge: "Comunidad Mordisco",
      discount: 25,
      description: "Precio especial para clientes que ya son parte de la casa.",
    };
  }

  return {
    key: "general",
    label: "Invitado General",
    badge: "Primer Cumple",
    discount: 0,
    description: "Acceso general al primer aniversario.",
  };
}

async function loadLots(service: ReturnType<typeof createServiceClient>, tenantId: string, branchId: string) {
  const { data, error } = await service
    .from("anniversary_lots")
    .select("lot_key, name, base_price, capacity, position, is_active")
    .eq("tenant_id", tenantId)
    .or(`branch_id.eq.${branchId},branch_id.is.null`)
    .order("position", { ascending: true });

  if (error || !data || data.length === 0) return LOTS;

  return data
    .filter((lot) => lot.is_active)
    .map((lot) => ({
      key: lot.lot_key,
      name: lot.name,
      basePrice: Number(lot.base_price || 0),
      capacity: Number(lot.capacity || 0),
      position: Number(lot.position || 0),
      isActive: Boolean(lot.is_active),
    }));
}

async function countSoldByLot(service: ReturnType<typeof createServiceClient>, tenantId: string, branchId: string) {
  const { data } = await service
    .from("anniversary_invitations")
    .select("lot_key")
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .neq("status", "cancelled");

  const counts = new Map<string, number>();
  (data || []).forEach((row: { lot_key?: string | null }) => {
    if (!row.lot_key) return;
    counts.set(row.lot_key, (counts.get(row.lot_key) || 0) + 1);
  });
  return counts;
}

async function lotsForTier(
  service: ReturnType<typeof createServiceClient>,
  tenantId: string,
  branchId: string,
  discount: number,
) {
  const [lots, soldByLot] = await Promise.all([
    loadLots(service, tenantId, branchId),
    countSoldByLot(service, tenantId, branchId),
  ]);

  return lots.map((lot) => ({
    ...lot,
    discount,
    sold: soldByLot.get(lot.key) || 0,
    available: lot.capacity > 0 ? Math.max(lot.capacity - (soldByLot.get(lot.key) || 0), 0) : null,
    finalPrice: Math.round(lot.basePrice * (1 - discount / 100)),
  }));
}

function monthsSince(value: string | null) {
  if (!value) return 0;
  const start = new Date(value);
  const now = new Date();
  return Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth());
}

function randomMessageSeed(phone: string) {
  return normalizePhone(phone)
    .split("")
    .reduce((sum, digit) => sum + Number(digit || 0), 0);
}

function buildMessages(name: string, orderCount: number, firstOrderAt: string | null, topPercentile: number) {
  const displayName = name || "Mordedor";
  const months = monthsSince(firstOrderAt);
  const year = firstOrderAt ? new Date(firstOrderAt).getFullYear() : new Date().getFullYear();
  const messages = [
    `Hola ${displayName}. Encontramos ${orderCount} pedidos realizados con este numero. Gracias por ser parte de Mordisco.`,
    `Mordedor desde hace ${months || 1} meses. Gracias por acompañarnos desde casi el comienzo.`,
    `Cliente desde ${year}. Estuviste antes de que Mordisco cumpliera su primer ano.`,
    `${orderCount} pedidos realizados. Definitivamente sabemos quien ama las hamburguesas.`,
    `Sos cliente recurrente. Tu proxima hamburguesa probablemente ya te esta esperando.`,
    `Segun nuestros registros... ya mordiste unas cuantas veces.`,
    "Tus pedidos ayudaron a construir este primer ano. Gracias por ser parte.",
    "No sos un invitado cualquiera. Sos parte de la historia de Mordisco.",
  ];

  if (topPercentile <= 10) {
    messages.push("Sos parte del Top 10% de clientes mas frecuentes.");
  }

  return messages;
}

function invitationCode(phone: string) {
  const normalized = normalizePhone(phone);
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MD-${normalized.slice(-4) || "0000"}-${random}`;
}

async function getBranch(service: ReturnType<typeof createServiceClient>, branchSlug: string) {
  const { data } = await service
    .from("branches")
    .select("id, tenant_id, name, slug")
    .eq("slug", branchSlug)
    .maybeSingle();
  return data;
}

async function verifyCustomer(branchSlug: string, name: string, phoneInput: string) {
  const service = createServiceClient();
  const branch = await getBranch(service, branchSlug);
  if (!branch) return NextResponse.json({ error: "Sucursal no encontrada" }, { status: 404 });

  const phone = normalizePhone(phoneInput);
  if (phone.length < 8) {
    return NextResponse.json({ error: "Ingresa un WhatsApp valido" }, { status: 400 });
  }

  const phoneVariants = Array.from(new Set([phone, `54${phone}`, `549${phone}`]));

  const { data: customers } = await service
    .from("customers")
    .select("id, name, phone, address, created_at")
    .eq("tenant_id", branch.tenant_id)
    .in("phone", phoneVariants);

  const customer = customers?.[0] || null;

  const { data: orderRows } = await service
    .from("orders")
    .select("id, branch_id, customer_id, customer_phone, customer_name, total, type, status, created_at, branches(name)")
    .eq("tenant_id", branch.tenant_id)
    .neq("status", "cancelled")
    .or(`customer_phone.in.(${phoneVariants.join(",")})${customer?.id ? `,customer_id.eq.${customer.id}` : ""}`)
    .order("created_at", { ascending: true });

  const orders = (orderRows || []) as OrderRow[];
  const orderCount = orders.length;
  const totalSpent = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const firstOrderAt = orders[0]?.created_at || customer?.created_at || null;
  const lastOrderAt = orders[orders.length - 1]?.created_at || null;
  const monthsActive = Math.max(1, monthsSince(firstOrderAt));
  const frequency = orderCount > 0 ? orderCount / monthsActive : 0;

  const branchCounts = new Map<string, { id: string; name: string; orders: number }>();
  orders.forEach((order) => {
    const key = order.branch_id || branch.id;
    const current = branchCounts.get(key) || {
      id: key,
      name: order.branches?.name || branch.name || "Mordisco",
      orders: 0,
    };
    current.orders += 1;
    branchCounts.set(key, current);
  });
  const favoriteBranch = Array.from(branchCounts.values()).sort((a, b) => b.orders - a.orders)[0] || {
    id: branch.id,
    name: branch.name || "Mordisco",
    orders: 0,
  };

  const { data: tenantOrders } = await service
    .from("orders")
    .select("customer_id, customer_phone")
    .eq("tenant_id", branch.tenant_id)
    .neq("status", "cancelled");

  const counts = new Map<string, number>();
  (tenantOrders || []).forEach((order: { customer_id?: string | null; customer_phone?: string | null }) => {
    const key = order.customer_id || normalizePhone(order.customer_phone);
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const distribution = Array.from(counts.values()).sort((a, b) => b - a);
  const position = Math.max(1, distribution.findIndex((value) => value <= orderCount) + 1 || distribution.length);
  const topPercentile = distribution.length > 0 ? Math.ceil((position / distribution.length) * 100) : 100;
  const tier = getTier(orderCount, topPercentile);
  const messages = buildMessages(customer?.name || name, orderCount, firstOrderAt, topPercentile);
  const message = messages[randomMessageSeed(phone) % messages.length];
  const lots = await lotsForTier(service, branch.tenant_id, branch.id, tier.discount);

  return NextResponse.json({
    ok: true,
    customer: {
      exists: Boolean(customer || orderCount > 0),
      name: customer?.name || name,
      phone,
      orderCount,
      firstOrderAt,
      lastOrderAt,
      totalSpent,
      favoriteBranch,
      approximateDistanceKm: null,
      frequency: Number(frequency.toFixed(2)),
      topPercentile,
    },
    benefit: tier,
    lots,
    message,
  });
}

async function sendPaymentWhatsapp({
  branchSlug,
  branchName,
  name,
  phone,
  code,
  lotName,
  price,
}: {
  branchSlug: string;
  branchName: string;
  name: string;
  phone: string;
  code: string;
  lotName: string;
  price: number;
}) {
  if (!process.env.WHATSAPP_TOKEN) return { skipped: true, reason: "WHATSAPP_TOKEN missing" };

  const message = `Hola ${name}! Tu invitacion ${code} para el Primer Aniversario Mordisco quedo pre-reservada.\n\nAcceso: ${lotName}\nTotal a abonar: $${price.toLocaleString("es-AR")}\n\nPara confirmar tu entrada, abona al alias:\n*mordisco.arg*\n\nCuando hagas la transferencia, responde este mensaje con el comprobante.`;
  const response = await fetch("https://whatsapp.mordiscoburgers.com.ar/api/whatsapp/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    },
    body: JSON.stringify({
      slug: "mordiscoburgers",
      branchId: branchSlug,
      phone,
      message,
    }),
  });

  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    branchName,
    response: text,
  };
}

async function purchaseInvitation(body: {
  branchSlug: string;
  name: string;
  dni?: string;
  phone: string;
  benefitKey?: string;
  lotKey?: string;
  lotName?: string;
  basePrice?: number;
  discount?: number;
  price?: number;
}) {
  const service = createServiceClient();
  const branch = await getBranch(service, body.branchSlug);
  if (!branch) return NextResponse.json({ error: "Sucursal no encontrada" }, { status: 404 });

  const phone = normalizePhone(body.phone);
  const code = invitationCode(phone);
  const lots = await loadLots(service, branch.tenant_id, branch.id);
  const selectedLot = lots.find((lot) => lot.key === body.lotKey) || lots[0] || LOTS[0];
  const soldByLot = await countSoldByLot(service, branch.tenant_id, branch.id);
  const sold = soldByLot.get(selectedLot.key) || 0;
  if (selectedLot.capacity > 0 && sold >= selectedLot.capacity) {
    return NextResponse.json({ error: "Este lote ya no tiene cupo disponible" }, { status: 409 });
  }
  const discount = Number(body.discount || 0);
  const basePrice = Number(body.basePrice || selectedLot.basePrice);
  const price = Number(body.price || Math.round(basePrice * (1 - discount / 100)));
  const payload = {
    tenant_id: branch.tenant_id,
    branch_id: branch.id,
    invitation_code: code,
    customer_name: body.name,
    dni: body.dni || null,
    whatsapp: phone,
    benefit_tier: body.benefitKey || "general",
    lot_key: body.lotKey || selectedLot.key,
    lot_name: body.lotName || selectedLot.name,
    base_price: basePrice,
    discount_percent: discount,
    price,
    status: "issued",
  };

  const { data, error } = await service
    .from("anniversary_invitations")
    .insert(payload)
    .select("*")
    .single();

  const savedInvitation = data || {
    ...payload,
    id: code,
    created_at: new Date().toISOString(),
    persisted: false,
  };

  const whatsappResult = await sendPaymentWhatsapp({
    branchSlug: branch.slug || body.branchSlug,
    branchName: branch.name || "Mordisco",
    name: body.name,
    phone,
    code,
    lotName: payload.lot_name,
    price,
  });

  if (data?.id) {
    await service
      .from("anniversary_invitations")
      .update({
        last_whatsapp_sent_at: whatsappResult && "ok" in whatsappResult && whatsappResult.ok ? new Date().toISOString() : null,
        last_whatsapp_message: `Pago al alias mordisco.arg - ${payload.lot_name} - ${price}`,
      })
      .eq("id", data.id);
  }

  return NextResponse.json({
    ok: true,
    invitation: savedInvitation,
    whatsapp: whatsappResult,
    warning: error?.message || null,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const action = String(body.action || "verify");

  if (action === "purchase") {
    if (!body.name || !body.phone || !body.branchSlug) {
      return NextResponse.json({ error: "Faltan datos para generar la invitacion" }, { status: 400 });
    }
    return purchaseInvitation(body);
  }

  return verifyCustomer(String(body.branchSlug || ""), String(body.name || ""), String(body.phone || ""));
}
