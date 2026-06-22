import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CatalogOrderBody = {
  branchSlug?: string;
  productId?: string;
  customer?: {
    name?: string;
    phone?: string;
    address?: string;
  };
  requestedDate?: string;
  notes?: string;
};

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function money(value: number) {
  return `$${Math.round(value || 0).toLocaleString("es-AR")}`;
}

function normalizeArgWhatsapp(value: unknown) {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("549")) return digits;
  if (digits.startsWith("54")) digits = digits.slice(2);
  if (digits.startsWith("9")) digits = digits.slice(1);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.startsWith("15")) digits = digits.slice(2);
  return digits.length === 10 ? `549${digits}` : null;
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00-03:00`);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() >= today.getTime();
}

function getDefaultVariant(product: any) {
  return (
    product.product_variants?.find((variant: any) => variant.is_default) ||
    product.product_variants?.[0]
  );
}

async function sendWhatsapp({
  branchSlug,
  phone,
  message,
}: {
  branchSlug: string;
  phone: string;
  message: string;
}) {
  const token = String(
    process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_API_TOKEN || "",
  )
    .trim()
    .replace(/^["']|["']$/g, "");
  const baseUrl = String(
    process.env.WHATSAPP_SERVER_URL || "https://whatsapp.mordiscoburgers.com.ar",
  ).replace(/\/$/, "");

  if (!token) {
    return { ok: false, skipped: true, error: "WHATSAPP_TOKEN missing" };
  }

  const response = await fetch(`${baseUrl}/api/whatsapp/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      slug: "mordiscoburgers",
      branchId: branchSlug,
      phone,
      message,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok && !payload?.error,
    status: response.status,
    response: payload,
    error:
      payload?.error || (!response.ok ? `whatsapp_${response.status}` : null),
  };
}

function buildCustomerMessage(args: {
  branchName: string;
  productName: string;
  total: number;
  requestedDate: string;
  address: string;
  notes?: string | null;
  depositRequired: boolean;
  depositPercent: number;
  depositAmount: number;
  transferAlias?: string | null;
  instructions?: string | null;
}) {
  return [
    `Hola! Recibimos tu encargo en ${args.branchName}.`,
    "",
    `Producto: ${args.productName}`,
    `Total estimado: ${money(args.total)}`,
    `Fecha solicitada: ${args.requestedDate}`,
    `Entrega: ${args.address}`,
    args.notes ? `Nota: ${args.notes}` : null,
    "",
    args.depositRequired
      ? `Para confirmar, transferi una sena del ${args.depositPercent}%: ${money(args.depositAmount)}.`
      : "Te contactaremos por WhatsApp para confirmar el pedido.",
    args.depositRequired && args.transferAlias
      ? `Alias: ${args.transferAlias}`
      : null,
    args.instructions || null,
    "",
    "Cuando lo revisemos te confirmamos disponibilidad y horario.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildBranchMessage(args: {
  branchName: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  total: number;
  requestedDate: string;
  address: string;
  notes?: string | null;
  depositRequired: boolean;
  depositPercent: number;
  depositAmount: number;
}) {
  return [
    `Nuevo encargo de catalogo - ${args.branchName}`,
    "",
    `Cliente: ${args.customerName}`,
    `WhatsApp: ${args.customerPhone}`,
    `Producto: ${args.productName}`,
    `Total: ${money(args.total)}`,
    args.depositRequired
      ? `Sena requerida: ${args.depositPercent}% (${money(args.depositAmount)})`
      : "Sin sena configurada",
    `Fecha solicitada: ${args.requestedDate}`,
    `Direccion: ${args.address}`,
    args.notes ? `Nota: ${args.notes}` : null,
    "",
    "Contactar al cliente para confirmar disponibilidad y coordinar.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(req: Request) {
  const supabase = serviceClient();

  try {
    const body = (await req.json()) as CatalogOrderBody;
    const branchSlug = String(body.branchSlug || "").trim();
    const productId = String(body.productId || "").trim();
    const customerName = String(body.customer?.name || "").trim();
    const customerPhone = normalizeArgWhatsapp(body.customer?.phone);
    const deliveryAddress = String(body.customer?.address || "").trim();
    const requestedDate = String(body.requestedDate || "").trim();
    const notes = String(body.notes || "").trim();

    if (!branchSlug || !productId) {
      return NextResponse.json(
        { error: "branch_and_product_required" },
        { status: 400 },
      );
    }

    if (
      !customerName ||
      !customerPhone ||
      !deliveryAddress ||
      !isValidDate(requestedDate)
    ) {
      return NextResponse.json(
        { error: "customer_data_required" },
        { status: 400 },
      );
    }

    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("id, tenant_id, name, slug, phone")
      .eq("slug", branchSlug)
      .maybeSingle();

    if (branchError) throw new Error(branchError.message);
    if (!branch) {
      return NextResponse.json({ error: "branch_not_found" }, { status: 404 });
    }

    const [{ data: settings, error: settingsError }, { data: product, error: productError }] =
      await Promise.all([
        supabase
          .from("branch_settings")
          .select(
            "catalog_order_whatsapp_phone, catalog_order_deposit_enabled, catalog_order_deposit_percent, catalog_order_transfer_alias, catalog_order_instructions",
          )
          .eq("branch_id", branch.id)
          .maybeSingle(),
        supabase
          .from("products")
          .select(
            "id, name, branch_id, is_active, product_variants(id, price, is_default)",
          )
          .eq("id", productId)
          .eq("branch_id", branch.id)
          .eq("is_active", true)
          .maybeSingle(),
      ]);

    if (settingsError) throw new Error(settingsError.message);
    if (productError) throw new Error(productError.message);
    if (!product) {
      return NextResponse.json({ error: "product_not_found" }, { status: 404 });
    }

    const variant = getDefaultVariant(product);
    if (!variant) {
      return NextResponse.json(
        { error: "product_without_price" },
        { status: 409 },
      );
    }

    const total = Number(variant.price || 0);
    const depositRequired = Boolean(settings?.catalog_order_deposit_enabled);
    const depositPercent = depositRequired
      ? Math.max(
          0,
          Math.min(100, Number(settings?.catalog_order_deposit_percent ?? 50)),
        )
      : 0;
    const depositAmount = depositRequired
      ? Math.round(total * depositPercent) / 100
      : 0;
    const transferAlias =
      String(settings?.catalog_order_transfer_alias || "").trim() || null;
    const branchReceiverPhone = normalizeArgWhatsapp(
      settings?.catalog_order_whatsapp_phone || branch.phone,
    );

    if (!branchReceiverPhone) {
      return NextResponse.json(
        { error: "branch_catalog_whatsapp_not_configured" },
        { status: 409 },
      );
    }

    if (depositRequired && !transferAlias) {
      return NextResponse.json(
        { error: "catalog_transfer_alias_required" },
        { status: 409 },
      );
    }

    const { data: order, error: orderError } = await supabase
      .from("catalog_orders")
      .insert({
        tenant_id: branch.tenant_id,
        branch_id: branch.id,
        product_id: product.id,
        product_name: product.name,
        unit_price: total,
        quantity: 1,
        total,
        customer_name: customerName,
        customer_phone: customerPhone,
        delivery_address: deliveryAddress,
        requested_date: requestedDate,
        notes: notes || null,
        deposit_required: depositRequired,
        deposit_percent: depositPercent,
        deposit_amount: depositAmount,
        transfer_alias: transferAlias,
        status: "pending",
        raw: { source: "customer_catalog", branchSlug, variantId: variant.id },
      })
      .select("id")
      .single();

    if (orderError) throw new Error(orderError.message);

    const customerMessage = buildCustomerMessage({
      branchName: branch.name,
      productName: product.name,
      total,
      requestedDate,
      address: deliveryAddress,
      notes,
      depositRequired,
      depositPercent,
      depositAmount,
      transferAlias,
      instructions: settings?.catalog_order_instructions || null,
    });
    const branchMessage = buildBranchMessage({
      branchName: branch.name,
      customerName,
      customerPhone,
      productName: product.name,
      total,
      requestedDate,
      address: deliveryAddress,
      notes,
      depositRequired,
      depositPercent,
      depositAmount,
    });

    const [customerSend, branchSend] = await Promise.all([
      sendWhatsapp({
        branchSlug: branch.slug,
        phone: customerPhone,
        message: customerMessage,
      }),
      sendWhatsapp({
        branchSlug: branch.slug,
        phone: branchReceiverPhone,
        message: branchMessage,
      }),
    ]);

    await supabase
      .from("catalog_orders")
      .update({
        customer_whatsapp_sent: Boolean(customerSend.ok),
        branch_whatsapp_sent: Boolean(branchSend.ok),
        customer_whatsapp_response: customerSend,
        branch_whatsapp_response: branchSend,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    const whatsappOk = Boolean(customerSend.ok && branchSend.ok);
    return NextResponse.json(
      {
        success: whatsappOk,
        orderId: order.id,
        total,
        depositRequired,
        depositPercent,
        depositAmount,
        transferAlias,
        customerWhatsappSent: Boolean(customerSend.ok),
        branchWhatsappSent: Boolean(branchSend.ok),
        error: whatsappOk
          ? null
          : customerSend.error || branchSend.error || "whatsapp_send_failed",
      },
      { status: whatsappOk ? 201 : 207 },
    );
  } catch (error) {
    console.error("catalog order error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "catalog_order_failed" },
      { status: 500 },
    );
  }
}
