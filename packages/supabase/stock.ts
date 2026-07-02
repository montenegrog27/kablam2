type StockClient = any;

type StockLine = {
  productId?: string | null;
  comboId?: string | null;
  quantity: number;
  extras?: any[] | null;
};

type StockSource = "order" | "catalog_order";

function addQuantity(map: Map<string, number>, productId: string | null | undefined, quantity: number) {
  if (!productId || !Number.isFinite(quantity) || quantity <= 0) return;
  map.set(productId, Number(map.get(productId) || 0) + quantity);
}

async function expandStockLines(supabase: StockClient, lines: StockLine[]) {
  const quantities = new Map<string, number>();
  const comboIds = new Set<string>();
  const promotionComboRefs: Array<{ comboId: string; quantity: number }> = [];

  lines.forEach((line) => {
    const quantity = Math.max(0, Number(line.quantity || 1));
    if (line.productId) addQuantity(quantities, line.productId, quantity);
    if (line.comboId) comboIds.add(line.comboId);

    (line.extras || []).forEach((extra: any) => {
      if (extra?.type !== "incluye") return;
      const extraQuantity = quantity * Math.max(1, Number(extra.quantity || 1));
      if (extra.itemType === "product") addQuantity(quantities, extra.id, extraQuantity);
      if (extra.itemType === "combo" && extra.id) {
        comboIds.add(extra.id);
        promotionComboRefs.push({ comboId: extra.id, quantity: extraQuantity });
      }
    });
  });

  const directComboLines = lines
    .filter((line) => line.comboId)
    .map((line) => ({ comboId: String(line.comboId), quantity: Math.max(0, Number(line.quantity || 1)) }));
  const allComboLines = [...directComboLines, ...promotionComboRefs];

  if (comboIds.size > 0) {
    const { data, error } = await supabase
      .from("combo_products")
      .select("combo_id, product_id, quantity")
      .in("combo_id", Array.from(comboIds));
    if (error) throw new Error(error.message);

    allComboLines.forEach((comboLine) => {
      (data || [])
        .filter((row: any) => row.combo_id === comboLine.comboId)
        .forEach((row: any) => {
          addQuantity(quantities, row.product_id, comboLine.quantity * Number(row.quantity || 1));
        });
    });
  }

  return quantities;
}

async function loadManagedProducts(supabase: StockClient, tenantId: string, productIds: string[]) {
  if (productIds.length === 0) return new Map<string, any>();
  const { data, error } = await supabase
    .from("products")
    .select("id, tenant_id, branch_id, name, manages_stock, stock_unit, stock_low_threshold, allow_negative_stock")
    .eq("tenant_id", tenantId)
    .in("id", productIds);
  if (error) throw new Error(error.message);
  return new Map((data || []).filter((product: any) => product.manages_stock === true).map((product: any) => [product.id, product]));
}

async function ensureStockItem(supabase: StockClient, tenantId: string, branchId: string, product: any) {
  const { data: existing, error: existingError } = await supabase
    .from("stock_items")
    .select("*")
    .eq("branch_id", branchId)
    .eq("product_id", product.id)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("stock_items")
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      product_id: product.id,
      current_quantity: 0,
      unit: product.stock_unit || "unit",
      low_threshold: Number(product.stock_low_threshold || 0),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function movementExists(
  supabase: StockClient,
  source: StockSource,
  sourceId: string,
  productId: string,
  movementType: "sale" | "sale_reversal",
) {
  const column = source === "order" ? "order_id" : "catalog_order_id";
  const { data, error } = await supabase
    .from("stock_movements")
    .select("id, quantity_delta")
    .eq(column, sourceId)
    .eq("product_id", productId)
    .eq("movement_type", movementType)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function insertMovement({
  supabase,
  tenantId,
  branchId,
  product,
  item,
  source,
  sourceId,
  movementType,
  delta,
  reason,
  userId,
  metadata,
}: {
  supabase: StockClient;
  tenantId: string;
  branchId: string;
  product: any;
  item: any;
  source: StockSource;
  sourceId: string;
  movementType: "sale" | "sale_reversal";
  delta: number;
  reason: string;
  userId?: string | null;
  metadata?: Record<string, any>;
}) {
  const before = Number(item.current_quantity || 0);
  const after = before + delta;
  const unit = item.unit || product.stock_unit || "unit";

  if (
    movementType === "sale" &&
    product.allow_negative_stock === false &&
    after < 0
  ) {
    throw new Error(
      `Stock insuficiente para ${product.name}. Disponible: ${before} ${unit}. Requerido: ${Math.abs(delta)} ${unit}.`,
    );
  }

  const { error: itemError } = await supabase
    .from("stock_items")
    .update({
      current_quantity: after,
      unit,
      low_threshold: Number(item.low_threshold ?? product.stock_low_threshold ?? 0),
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id);
  if (itemError) throw new Error(itemError.message);

  const payload: any = {
    tenant_id: tenantId,
    branch_id: branchId,
    product_id: product.id,
    movement_type: movementType,
    quantity_delta: delta,
    quantity_before: before,
    quantity_after: after,
    unit,
    reason,
    created_by: userId || null,
    metadata: metadata || {},
  };
  if (source === "order") payload.order_id = sourceId;
  if (source === "catalog_order") payload.catalog_order_id = sourceId;

  const { error: movementError } = await supabase.from("stock_movements").insert(payload);
  if (movementError) throw new Error(movementError.message);
}

async function applyStockForLines({
  supabase,
  tenantId,
  branchId,
  source,
  sourceId,
  lines,
  action,
  userId,
}: {
  supabase: StockClient;
  tenantId: string;
  branchId: string;
  source: StockSource;
  sourceId: string;
  lines: StockLine[];
  action: "sale" | "reversal";
  userId?: string | null;
}) {
  const quantities = await expandStockLines(supabase, lines);
  const productIds = Array.from(quantities.keys());
  const products = await loadManagedProducts(supabase, tenantId, productIds);
  const result = { applied: 0, skipped: productIds.length - products.size, products: [] as any[] };

  for (const [productId, quantity] of quantities.entries()) {
    const product = products.get(productId);
    if (!product) continue;

    if (action === "sale") {
      const existingSale = await movementExists(supabase, source, sourceId, productId, "sale");
      if (existingSale) continue;

      const item = await ensureStockItem(supabase, tenantId, branchId, product);
      await insertMovement({
        supabase,
        tenantId,
        branchId,
        product,
        item,
        source,
        sourceId,
        movementType: "sale",
        delta: -quantity,
        reason: source === "order" ? "Venta entregada" : "Pedido de catalogo entregado",
        userId,
        metadata: { quantity, source },
      });
      result.applied += 1;
      result.products.push({ productId, name: product.name, delta: -quantity });
    }

    if (action === "reversal") {
      const existingSale = await movementExists(supabase, source, sourceId, productId, "sale");
      const existingReversal = await movementExists(supabase, source, sourceId, productId, "sale_reversal");
      if (!existingSale || existingReversal) continue;

      const item = await ensureStockItem(supabase, tenantId, branchId, product);
      await insertMovement({
        supabase,
        tenantId,
        branchId,
        product,
        item,
        source,
        sourceId,
        movementType: "sale_reversal",
        delta: Math.abs(Number(existingSale.quantity_delta || quantity)),
        reason: source === "order" ? "Pedido cancelado" : "Pedido de catalogo cancelado",
        userId,
        metadata: { quantity, source },
      });
      result.applied += 1;
      result.products.push({ productId, name: product.name, delta: Math.abs(Number(existingSale.quantity_delta || quantity)) });
    }
  }

  return result;
}

export async function applyOrderStockMovement({
  supabase,
  orderId,
  action,
  userId,
}: {
  supabase: StockClient;
  orderId: string;
  action: "sale" | "reversal";
  userId?: string | null;
}) {
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, tenant_id, branch_id")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw new Error(orderError.message);
  if (!order) throw new Error("order_not_found");

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("product_id, combo_id, quantity, extras")
    .eq("order_id", orderId);
  if (itemsError) throw new Error(itemsError.message);

  return applyStockForLines({
    supabase,
    tenantId: order.tenant_id,
    branchId: order.branch_id,
    source: "order",
    sourceId: order.id,
    action,
    userId,
    lines: (items || []).map((item: any) => ({
      productId: item.product_id,
      comboId: item.combo_id,
      quantity: Number(item.quantity || 1),
      extras: Array.isArray(item.extras) ? item.extras : [],
    })),
  });
}

export async function applyCatalogOrderStockMovement({
  supabase,
  catalogOrderId,
  action,
  userId,
}: {
  supabase: StockClient;
  catalogOrderId: string;
  action: "sale" | "reversal";
  userId?: string | null;
}) {
  const { data: order, error: orderError } = await supabase
    .from("catalog_orders")
    .select("id, tenant_id, branch_id, product_id, combo_id, quantity")
    .eq("id", catalogOrderId)
    .maybeSingle();
  if (orderError) throw new Error(orderError.message);
  if (!order) throw new Error("catalog_order_not_found");

  return applyStockForLines({
    supabase,
    tenantId: order.tenant_id,
    branchId: order.branch_id,
    source: "catalog_order",
    sourceId: order.id,
    action,
    userId,
    lines: [{
      productId: order.product_id,
      comboId: order.combo_id,
      quantity: Number(order.quantity || 1),
      extras: [],
    }],
  });
}
