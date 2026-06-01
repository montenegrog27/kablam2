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

const GENERAL_PRICE = 30000;

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
      price: GENERAL_PRICE * 0.5,
      description: "Maximo beneficio por ser de los clientes mas frecuentes.",
    };
  }

  if (orderCount > 3) {
    return {
      key: "community",
      label: "Comunidad Mordisco",
      badge: "Comunidad Mordisco",
      discount: 25,
      price: GENERAL_PRICE * 0.75,
      description: "Precio especial para clientes que ya son parte de la casa.",
    };
  }

  return {
    key: "general",
    label: "Invitado General",
    badge: "Primer Cumple",
    discount: 0,
    price: GENERAL_PRICE,
    description: "Acceso general al primer aniversario.",
  };
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
    message,
  });
}

async function purchaseInvitation(body: {
  branchSlug: string;
  name: string;
  dni: string;
  phone: string;
  benefitKey?: string;
  price?: number;
}) {
  const service = createServiceClient();
  const branch = await getBranch(service, body.branchSlug);
  if (!branch) return NextResponse.json({ error: "Sucursal no encontrada" }, { status: 404 });

  const phone = normalizePhone(body.phone);
  const code = invitationCode(phone);
  const price = Number(body.price || GENERAL_PRICE);
  const payload = {
    tenant_id: branch.tenant_id,
    branch_id: branch.id,
    invitation_code: code,
    customer_name: body.name,
    dni: body.dni,
    whatsapp: phone,
    benefit_tier: body.benefitKey || "general",
    price,
    status: "issued",
  };

  const { data, error } = await service
    .from("anniversary_invitations")
    .insert(payload)
    .select("*")
    .single();

  return NextResponse.json({
    ok: true,
    invitation: data || {
      ...payload,
      id: code,
      created_at: new Date().toISOString(),
      persisted: false,
    },
    warning: error?.message || null,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const action = String(body.action || "verify");

  if (action === "purchase") {
    if (!body.name || !body.dni || !body.phone || !body.branchSlug) {
      return NextResponse.json({ error: "Faltan datos para generar la invitacion" }, { status: 400 });
    }
    return purchaseInvitation(body);
  }

  return verifyCustomer(String(body.branchSlug || ""), String(body.name || ""), String(body.phone || ""));
}
