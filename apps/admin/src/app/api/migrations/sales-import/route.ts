import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

type ImportPayload = {
  schemaVersion?: number;
  source?: {
    project?: string;
    branch?: string;
    branchId?: string;
  };
  clients?: Array<{
    name?: string;
    phone?: string;
    address?: string;
  }>;
  orders?: Array<{
    saleId?: string;
    status?: string;
    saleType?: string;
    total?: number;
    subtotal?: number;
    shippingCost?: number;
    discount?: number;
    customerName?: string;
    customerPhone?: string;
    phoneNormalized?: string;
    customerAddress?: string;
    paymentMethod?: string;
    createdAtISO?: string | null;
    createdAtText?: string;
    items?: Array<{
      sourceItemKey?: string;
      sourceProductId?: string;
      name?: string;
      quantity?: number;
      price?: number;
      total?: number;
      note?: string;
    }>;
  }>;
};

type ImportOrder = NonNullable<ImportPayload["orders"]>[number];
type ImportOrderItem = NonNullable<ImportOrder["items"]>[number];

type CustomerResolution = {
  sourceKey: string;
  customerId: string;
};

type ProductMapping = {
  sourceItemKey: string;
  targetType: "product" | "combo";
  productId: string;
  variantId?: string | null;
};

type ExistingCustomer = {
  id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
};

type ImportBatch = {
  id: string;
  tenant_id: string;
  branch_id: string;
  status: string;
  summary?: Record<string, number>;
};

type SupabaseService = ReturnType<typeof createServiceClient>;

const statusMap: Record<string, string> = {
  pending: "unconfirmed",
  confirmed: "confirmed",
  preparing: "preparing",
  ready: "ready",
  send: "sent",
  sent: "sent",
  delivered: "delivered",
  cancelled: "cancelled",
  canceled: "cancelled",
  PENDING: "unconfirmed",
  IN_COURSE: "preparing",
  READY: "ready",
  SENT: "sent",
  CLOSED: "delivered",
  CANCELLED: "cancelled",
};

function normalizePhone(value: unknown) {
  return String(value || "")
    .replace(/\D/g, "")
    .replace(/^549/, "")
    .replace(/^54/, "")
    .replace(/^9(\d{10})$/, "$1");
}

function normalizeOrderType(value: unknown) {
  const type = String(value || "").toLowerCase();
  if (type.includes("pedido")) return "pedidosya";
  if (type.includes("delivery")) return "delivery";
  return "takeaway";
}

function normalizeStatus(value: unknown) {
  const status = String(value || "");
  return statusMap[status] || statusMap[status.toLowerCase()] || "delivered";
}

function toISO(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sourceCustomerKey(order: ImportOrder) {
  const phone = normalizePhone(order.phoneNormalized || order.customerPhone);
  if (phone) return `phone:${phone}`;
  return `name:${normalizeText(order.customerName)}|address:${normalizeText(order.customerAddress)}`;
}

function sourceItemKey(item: ImportOrderItem) {
  return String(item.sourceItemKey || item.sourceProductId || normalizeText(item.name)).trim();
}

function levenshtein(a: string, b: string) {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

function similarity(a: unknown, b: unknown) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return 0;
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

async function getUserTenantId(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (!token) return null;

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return null;

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: userRecord } = await service
    .from("users")
    .select("tenant_id")
    .eq("id", authData.user.id)
    .single();

  return userRecord?.tenant_id || null;
}

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function addSummaries(
  previous: Record<string, number> | null | undefined,
  current: Record<string, number>,
) {
  const next: Record<string, number> = { ...(previous || {}) };
  Object.entries(current).forEach(([key, value]) => {
    next[key] = Number(next[key] || 0) + Number(value || 0);
  });
  return next;
}

async function countBatchRecords(
  service: SupabaseService,
  batchId: string,
  recordType: string,
  action?: string,
) {
  let request = service
    .from("migration_import_records")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .eq("record_type", recordType);

  if (action) request = request.eq("action", action);

  const { count, error } = await request;
  if (error) return 0;
  return count || 0;
}

async function fetchAllBatchRecords(service: SupabaseService, batchId: string) {
  const records = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await service
      .from("migration_import_records")
      .select("*")
      .eq("batch_id", batchId)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    records.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return records;
}

export async function GET(req: NextRequest) {
  const tenantId = await getUserTenantId(req);
  if (!tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const batchId = req.nextUrl.searchParams.get("batchId");
  const service = createServiceClient();

  if (batchId) {
    const { data, error } = await service
      .from("migration_import_errors")
      .select("sale_id, message, payload, created_at")
      .eq("tenant_id", tenantId)
      .eq("batch_id", batchId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json(
        {
          error: "No se pudieron leer los errores",
          detail: error.message,
          hint: "Verifica que create_migration_import_batches.sql este aplicado completo en Supabase.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ errors: data || [] });
  }

  const { data, error } = await service
    .from("migration_import_batches")
    .select("id, branch_id, source_label, status, summary, created_at, completed_at, rolled_back_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    return NextResponse.json(
      {
        error:
          "No se pudo leer el historial. Aplica create_migration_import_batches.sql en Supabase.",
      },
      { status: 500 },
    );
  }

  const batchesWithRecordCounts = await Promise.all(
    (data || []).map(async (batch) => {
      const [createdOrders, createdCustomers, updatedCustomers] = await Promise.all([
        countBatchRecords(service, batch.id, "order", "created"),
        countBatchRecords(service, batch.id, "customer", "created"),
        countBatchRecords(service, batch.id, "customer", "updated"),
      ]);

      return {
        ...batch,
        summary: {
          ...(batch.summary || {}),
          createdOrders,
          createdCustomers,
          updatedCustomers,
        },
      };
    }),
  );

  return NextResponse.json({ batches: batchesWithRecordCounts });
}

export async function DELETE(req: NextRequest) {
  const tenantId = await getUserTenantId(req);
  if (!tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { batchId } = await req.json();
  if (!batchId) {
    return NextResponse.json({ error: "Falta batchId" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: batch } = await service
    .from("migration_import_batches")
    .select("id, tenant_id, branch_id, status, summary")
    .eq("id", batchId)
    .eq("tenant_id", tenantId)
    .single<ImportBatch>();

  if (!batch) {
    return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  }

  if (batch.status === "rolled_back") {
    return NextResponse.json({ ok: true, alreadyRolledBack: true });
  }

  const records = await fetchAllBatchRecords(service, batchId);
  let deletedOrders = 0;
  let deletedCustomers = 0;
  let restoredCustomers = 0;
  const errors: Array<{ recordId?: string; message: string }> = [];

  for (const record of records.filter((item) => item.record_type === "order")) {
    try {
      await service.from("order_payments").delete().eq("order_id", record.record_id);
      await service.from("order_items").delete().eq("order_id", record.record_id);
      await service.from("order_analytics").delete().eq("order_id", record.record_id);
      const { error } = await service
        .from("orders")
        .delete()
        .eq("id", record.record_id)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
      deletedOrders += 1;
    } catch (error) {
      errors.push({
        recordId: record.record_id,
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  for (const record of records.filter((item) => item.record_type === "customer")) {
    try {
      if (record.action === "created") {
        const { error } = await service
          .from("customers")
          .delete()
          .eq("id", record.record_id)
          .eq("tenant_id", tenantId);
        if (error) throw new Error(error.message);
        deletedCustomers += 1;
      }

      if (record.action === "updated") {
        const previous = record.previous_data || {};
        const { error } = await service
          .from("customers")
          .update({
            name: previous.name ?? null,
            address: previous.address ?? null,
          })
          .eq("id", record.record_id)
          .eq("tenant_id", tenantId);
        if (error) throw new Error(error.message);
        restoredCustomers += 1;
      }
    } catch (error) {
      errors.push({
        recordId: record.record_id,
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  await service
    .from("migration_import_batches")
    .update({
      status: errors.length > 0 ? "rollback_partial" : "rolled_back",
      rolled_back_at: new Date().toISOString(),
      summary: {
        ...(batch.summary || {}),
        rollbackDeletedOrders: deletedOrders,
        rollbackDeletedCustomers: deletedCustomers,
        rollbackRestoredCustomers: restoredCustomers,
        rollbackErrors: errors.length,
      },
    })
    .eq("id", batchId);

  return NextResponse.json({
    ok: errors.length === 0,
    summary: {
      deletedOrders,
      deletedCustomers,
      restoredCustomers,
      errors: errors.length,
    },
    errors: errors.slice(0, 50),
  });
}

export async function POST(req: NextRequest) {
  const tenantId = await getUserTenantId(req);
  if (!tenantId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const branchId = String(body.branchId || "");
  const dryRun = Boolean(body.dryRun);
  const incomingBatchId = body.batchId ? String(body.batchId) : "";
  const sourceLabel = String(body.sourceLabel || body.payload?.source?.project || "migration");
  const payload = body.payload as ImportPayload;
  const orders = Array.isArray(payload?.orders) ? payload.orders : [];
  const customerResolutionItems = (
    Array.isArray(body.customerResolutions) ? body.customerResolutions : []
  ) as CustomerResolution[];
  const productMappingItems = (
    Array.isArray(body.productMappings) ? body.productMappings : []
  ) as ProductMapping[];
  const customerResolutions = new Map(
    customerResolutionItems
      .filter((item: CustomerResolution) => item?.sourceKey && item?.customerId)
      .map((item: CustomerResolution) => [item.sourceKey, item.customerId]),
  );
  const productMappings = new Map(
    productMappingItems
      .filter((item: ProductMapping) => item?.sourceItemKey && item?.productId)
      .map((item: ProductMapping) => [item.sourceItemKey, item]),
  );

  if (!branchId || orders.length === 0) {
    return NextResponse.json(
      { error: "Falta branchId o no hay ventas para importar" },
      { status: 400 },
    );
  }

  const service = createServiceClient();

  const { data: branch } = await service
    .from("branches")
    .select("id, tenant_id")
    .eq("id", branchId)
    .eq("tenant_id", tenantId)
    .single();

  if (!branch) {
    return NextResponse.json({ error: "Sucursal invalida" }, { status: 404 });
  }

  const preview = { phones: new Set<string>(), total: 0 };
  const sourceClients = new Map<string, { key: string; name: string; phone: string; address: string }>();
  const sourceProducts = new Map<
    string,
    { sourceItemKey: string; sourceProductId: string; name: string; orders: number; quantity: number; total: number }
  >();

  orders.forEach((order) => {
    const phone = normalizePhone(order.phoneNormalized || order.customerPhone);
    if (phone) preview.phones.add(phone);
    preview.total += Number(order.total || 0);

    const key = sourceCustomerKey(order);
    if (!sourceClients.has(key)) {
      sourceClients.set(key, {
        key,
        name: order.customerName || "",
        phone,
        address: order.customerAddress || "",
      });
    }

    (order.items || []).forEach((item) => {
      const keyItem = sourceItemKey(item);
      if (!keyItem) return;
      const current = sourceProducts.get(keyItem) || {
        sourceItemKey: keyItem,
        sourceProductId: String(item.sourceProductId || ""),
        name: item.name || "",
        orders: 0,
        quantity: 0,
        total: 0,
      };
      current.orders += 1;
      current.quantity += Number(item.quantity || 0);
      current.total += Number(item.total || Number(item.price || 0) * Number(item.quantity || 0));
      sourceProducts.set(keyItem, current);
    });
  });

  const { data: existingCustomers } = await service
    .from("customers")
    .select("id, name, phone, address")
    .eq("tenant_id", tenantId);

  const customerRows = (existingCustomers || []) as ExistingCustomer[];
  const exactCustomerMatches = Array.from(sourceClients.values())
    .map((client) => ({
      source: client,
      match: customerRows.find((customer) => normalizePhone(customer.phone) === client.phone) || null,
    }))
    .filter((item) => item.match);

  const similarCustomerMatches = Array.from(sourceClients.values())
    .filter((client) => !exactCustomerMatches.some((match) => match.source.key === client.key))
    .map((client) => ({
      source: client,
      matches: customerRows
        .map((customer) => ({
          customer,
          score: Math.max(
            similarity(client.name, customer.name),
            similarity(`${client.name} ${client.address}`, `${customer.name || ""} ${customer.address || ""}`),
          ),
        }))
        .filter((match) => match.score >= 0.72)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5),
    }))
    .filter((item) => item.matches.length > 0);

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      summary: {
        orders: orders.length,
        clients: preview.phones.size,
        total: preview.total,
      },
      exactCustomerMatches,
      similarCustomerMatches,
      sourceProducts: Array.from(sourceProducts.values()).sort((a, b) => b.quantity - a.quantity),
    });
  }

  let createdCustomers = 0;
  let updatedCustomers = 0;
  let createdOrders = 0;
  let skippedOrders = 0;
  let batchId = incomingBatchId;
  const errors: Array<{ saleId?: string; message: string }> = [];
  const customerCache = new Map<string, string>();

  if (batchId) {
    const { data: existingBatch } = await service
      .from("migration_import_batches")
      .select("id, summary")
      .eq("id", batchId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!existingBatch) {
      return NextResponse.json({ error: "Lote de importacion invalido" }, { status: 400 });
    }
  } else {
    const { data: newBatch, error: batchError } = await service
      .from("migration_import_batches")
      .insert({
        tenant_id: tenantId,
        branch_id: branchId,
        source_label: sourceLabel,
        status: "importing",
        summary: {},
      })
      .select("id")
      .single();

    if (batchError || !newBatch) {
      return NextResponse.json(
        {
          error:
            "No se pudo crear el lote. Aplica create_migration_import_batches.sql en Supabase.",
          detail: batchError?.message,
        },
        { status: 500 },
      );
    }

    batchId = newBatch.id;
  }

  for (const order of orders) {
    try {
      const phone = normalizePhone(order.phoneNormalized || order.customerPhone);
      const sourceKey = sourceCustomerKey(order);
      if (!phone && !customerResolutions.has(sourceKey)) {
        skippedOrders += 1;
        errors.push({ saleId: order.saleId, message: "Venta sin telefono" });
        continue;
      }

      let customerId: string | undefined = customerCache.get(phone);

      if (!customerId) {
        const resolvedCustomerId = customerResolutions.get(sourceKey);
        if (resolvedCustomerId) {
          const { data: resolvedCustomer } = await service
            .from("customers")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("id", resolvedCustomerId)
            .maybeSingle();

          if (resolvedCustomer) {
            customerId = resolvedCustomer.id;
          }
        }

        if (customerId) {
          customerCache.set(phone || sourceKey, customerId);
        }
      }

      if (!customerId && phone) {
        const { data: existingCustomer } = await service
          .from("customers")
          .select("id, name, address")
          .eq("tenant_id", tenantId)
          .eq("phone", phone)
          .maybeSingle();

        if (existingCustomer) {
          customerId = existingCustomer.id;
          const updates: Record<string, string> = {};
          if (order.customerName && !existingCustomer.name) updates.name = order.customerName;
          if (order.customerAddress && !existingCustomer.address) updates.address = order.customerAddress;
          if (Object.keys(updates).length > 0) {
            await service.from("customers").update(updates).eq("id", customerId);
            await service.from("migration_import_records").insert({
              batch_id: batchId,
              tenant_id: tenantId,
              record_type: "customer",
              record_id: customerId,
              action: "updated",
              previous_data: {
                name: existingCustomer.name,
                address: existingCustomer.address,
              },
            });
            updatedCustomers += 1;
          }
        } else {
          const { data: insertedCustomer, error: customerError } = await service
            .from("customers")
            .insert({
              tenant_id: tenantId,
              name: order.customerName || "Cliente",
              phone,
              address: order.customerAddress || null,
            })
            .select("id")
            .single();

          if (customerError || !insertedCustomer) {
            throw new Error(customerError?.message || "No se pudo crear cliente");
          }

          customerId = insertedCustomer.id;
          await service.from("migration_import_records").insert({
            batch_id: batchId,
            tenant_id: tenantId,
            record_type: "customer",
            record_id: customerId,
            action: "created",
          });
          createdCustomers += 1;
        }

        if (!customerId) throw new Error("No se pudo resolver el cliente");
        customerCache.set(phone || sourceKey, customerId);
      }

      const total = Number(order.total || 0);
      if (total <= 0) {
        skippedOrders += 1;
        errors.push({
          saleId: order.saleId,
          message: "Venta omitida: total 0 o invalido",
        });
        continue;
      }

      const createdAt = toISO(order.createdAtISO);
      if (!createdAt) {
        skippedOrders += 1;
        errors.push({
          saleId: order.saleId,
          message: "Venta omitida: falta createdAtISO estable en el export",
        });
        continue;
      }

      const shippingCost = Number(order.shippingCost || 0);
      const discount = Number(order.discount || 0);
      const subtotal = Number(order.subtotal ?? Math.max(total - shippingCost + discount, 0));

      const { data: existingOrder } = await service
        .from("orders")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("branch_id", branchId)
        .eq("customer_phone", phone)
        .eq("created_at", createdAt)
        .eq("total", total)
        .maybeSingle();

      if (existingOrder) {
        skippedOrders += 1;
        continue;
      }

      const status = normalizeStatus(order.status);
      const isPaid = !["unconfirmed", "cancelled"].includes(status);

      const { data: insertedOrder, error: orderError } = await service
        .from("orders")
        .insert({
          tenant_id: tenantId,
          branch_id: branchId,
          customer_id: customerId,
          sales_channel: "migration",
          status,
          type: normalizeOrderType(order.saleType),
          customer_name: order.customerName || "Cliente",
          customer_phone: phone,
          address: order.customerAddress || null,
          subtotal,
          total,
          shipping_cost: shippingCost,
          discount,
          paid_amount: isPaid ? total : 0,
          is_paid: isPaid,
          created_at: createdAt,
        })
        .select("id")
        .single();

      if (orderError || !insertedOrder) {
        throw new Error(orderError?.message || "No se pudo crear venta");
      }

      await service.from("migration_import_records").insert({
        batch_id: batchId,
        tenant_id: tenantId,
        record_type: "order",
        record_id: insertedOrder.id,
        action: "created",
        previous_data: {
          saleId: order.saleId || null,
          source: payload.source || null,
        },
      });

      const itemsToInsert = (order.items || [])
        .map((item) => {
          const key = sourceItemKey(item);
          const mapping = productMappings.get(key);
          if (!mapping) return null;
          const quantity = Number(item.quantity || 0) || 1;
          const unitPrice = Number(item.price || 0);
          return {
            order_id: insertedOrder.id,
            item_type: mapping.targetType,
            product_id: mapping.productId,
            combo_id: mapping.targetType === "combo" ? mapping.productId : null,
            variant_id: mapping.variantId || null,
            quantity,
            unit_price: unitPrice,
            total: Number(item.total || unitPrice * quantity || 0),
            note: item.note || "",
          };
        })
        .filter(Boolean);

      if (itemsToInsert.length > 0) {
        const { error: itemsError } = await service.from("order_items").insert(itemsToInsert);
        if (itemsError) {
          throw new Error(`Venta creada, pero fallaron items: ${itemsError.message}`);
        }
      }

      createdOrders += 1;
    } catch (error) {
      errors.push({
        saleId: order.saleId,
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  const currentSummary = {
    createdCustomers,
    updatedCustomers,
    createdOrders,
    skippedOrders,
    errors: errors.length,
  };

  const { data: batchBeforeUpdate } = await service
    .from("migration_import_batches")
    .select("summary")
    .eq("id", batchId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const cumulativeSummary = addSummaries(batchBeforeUpdate?.summary, currentSummary);

  await service
    .from("migration_import_batches")
    .update({
      status: errors.length > 0 ? "partial" : "completed",
      completed_at: new Date().toISOString(),
      summary: cumulativeSummary,
    })
    .eq("id", batchId);

  if (errors.length > 0) {
    await service.from("migration_import_errors").insert(
      errors.map((error) => ({
        batch_id: batchId,
        tenant_id: tenantId,
        sale_id: error.saleId || null,
        message: error.message,
      })),
    );
  }

  return NextResponse.json({
    ok: errors.length === 0,
    batchId,
    summary: cumulativeSummary,
    errors: errors.slice(0, 50),
  });
}
