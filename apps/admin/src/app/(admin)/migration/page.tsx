"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { CheckCircle, FileJson, Link2, RotateCcw, Upload, XCircle } from "lucide-react";

type ExportOrderItem = {
  sourceItemKey?: string;
  sourceProductId?: string;
  name?: string;
  quantity?: number;
  price?: number;
  total?: number;
  note?: string;
};

type ExportOrder = {
  saleId?: string;
  total?: number;
  customerName?: string;
  customerPhone?: string;
  phoneNormalized?: string;
  customerAddress?: string;
  items?: ExportOrderItem[];
};

type ImportPayload = {
  schemaVersion?: number;
  exportedAt?: string;
  source?: {
    project?: string;
    branch?: string;
    branchId?: string;
    slug?: string;
  };
  summary?: {
    orders?: number;
    clients?: number;
    total?: number;
  };
  clients?: unknown[];
  orders?: ExportOrder[];
};

type Branch = {
  id: string;
  name: string;
  slug?: string;
};

type TargetProduct = {
  key: string;
  label: string;
  targetType: "product" | "combo";
  productId: string;
  variantId: string | null;
};

type SourceProduct = {
  sourceItemKey: string;
  sourceProductId: string;
  name: string;
  orders: number;
  quantity: number;
  total: number;
};

type SimilarMatch = {
  source: {
    key: string;
    name: string;
    phone: string;
    address: string;
  };
  matches: Array<{
    customer: {
      id: string;
      name: string | null;
      phone: string | null;
      address: string | null;
    };
    score: number;
  }>;
};

type ImportResult = {
  ok?: boolean;
  dryRun?: boolean;
  batchId?: string;
  summary?: Record<string, number>;
  errors?: Array<{ saleId?: string; message: string }>;
  error?: string;
  exactCustomerMatches?: unknown[];
  similarCustomerMatches?: SimilarMatch[];
  sourceProducts?: SourceProduct[];
};

type ImportBatch = {
  id: string;
  source_label?: string | null;
  status: string;
  summary?: Record<string, number>;
  created_at?: string;
  rolled_back_at?: string | null;
};

type ImportErrorRow = {
  sale_id?: string | null;
  message: string;
  created_at?: string;
};

type ProductMapping = {
  sourceItemKey: string;
  targetType: "product" | "combo";
  productId: string;
  variantId: string | null;
};

function normalizePhone(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sourceItemKey(item: ExportOrderItem) {
  return String(item.sourceItemKey || item.sourceProductId || normalizeText(item.name)).trim();
}

function mergePayloads(payloads: ImportPayload[]): ImportPayload {
  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    source: {
      project: payloads.map((payload) => payload.source?.project).filter(Boolean).join("+") || "mixed",
      branch: "multiple",
    },
    clients: payloads.flatMap((payload) => payload.clients || []),
    orders: payloads.flatMap((payload) =>
      (payload.orders || []).map((order) => ({
        ...order,
        sourceProject: payload.source?.project,
      })),
    ),
  };
}

function bestProductGuess(sourceName: string, targets: TargetProduct[]) {
  const source = normalizeText(sourceName);
  if (!source) return "";
  const exact = targets.find((target) => normalizeText(target.label) === source);
  if (exact) return exact.key;
  const includes = targets.find((target) => {
    const label = normalizeText(target.label);
    return label.includes(source) || source.includes(label);
  });
  return includes?.key || "";
}

export default function MigrationPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [payloads, setPayloads] = useState<ImportPayload[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [targets, setTargets] = useState<TargetProduct[]>([]);
  const [productSelections, setProductSelections] = useState<Record<string, string>>({});
  const [customerSelections, setCustomerSelections] = useState<Record<string, string>>({});
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [chunkSize, setChunkSize] = useState(500);
  const [progress, setProgress] = useState("");
  const [batchErrors, setBatchErrors] = useState<ImportErrorRow[]>([]);

  async function loadInitialData() {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (!userRecord) return;

    const [{ data: branchRows }, { data: products }, { data: combos }] = await Promise.all([
      supabase.from("branches").select("id, name, slug").eq("tenant_id", userRecord.tenant_id).order("name"),
      supabase
        .from("products")
        .select("id, name, product_variants(id, name, price, is_default)")
        .eq("tenant_id", userRecord.tenant_id)
        .order("name"),
      supabase.from("combos").select("id, name, price").eq("tenant_id", userRecord.tenant_id).order("name"),
    ]);

    const branchList = branchRows || [];
    setBranches(branchList);
    if (branchList.length === 1) setBranchId(branchList[0].id);

    const productTargets: TargetProduct[] = (products || []).flatMap((product) => {
      const variants = Array.isArray(product.product_variants) ? product.product_variants : [];
      if (variants.length === 0) {
        return [
          {
            key: `product:${product.id}:`,
            label: product.name,
            targetType: "product" as const,
            productId: product.id,
            variantId: null,
          },
        ];
      }

      return variants.map((variant) => ({
        key: `product:${product.id}:${variant.id}`,
        label: variant.name ? `${product.name} - ${variant.name}` : product.name,
        targetType: "product" as const,
        productId: product.id,
        variantId: variant.id,
      }));
    });

    const comboTargets: TargetProduct[] = (combos || []).map((combo) => ({
      key: `combo:${combo.id}:`,
      label: combo.name,
      targetType: "combo",
      productId: combo.id,
      variantId: null,
    }));

    setTargets([...productTargets, ...comboTargets].sort((a, b) => a.label.localeCompare(b.label)));
    await loadBatches();
  }

  async function loadBatches() {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;

    const response = await fetch("/api/migrations/sales-import", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (Array.isArray(data.batches)) setBatches(data.batches);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInitialData();
  }, []);

  const payload = useMemo(() => mergePayloads(payloads), [payloads]);
  const orders = useMemo(() => payload.orders || [], [payload]);

  const localSourceProducts = useMemo(() => {
    const products = new Map<string, SourceProduct>();

    orders.forEach((order) => {
      (order.items || []).forEach((item) => {
        const key = sourceItemKey(item);
        if (!key) return;
        const current = products.get(key) || {
          sourceItemKey: key,
          sourceProductId: String(item.sourceProductId || ""),
          name: item.name || "",
          orders: 0,
          quantity: 0,
          total: 0,
        };
        current.orders += 1;
        current.quantity += Number(item.quantity || 0);
        current.total += Number(item.total || Number(item.price || 0) * Number(item.quantity || 0));
        products.set(key, current);
      });
    });

    return Array.from(products.values()).sort((a, b) => b.quantity - a.quantity);
  }, [orders]);

  const sourceProducts = result?.sourceProducts || localSourceProducts;

  const preview = useMemo(() => {
    const phones = new Set(
      orders
        .map((order) => normalizePhone(order.phoneNormalized || order.customerPhone))
        .filter(Boolean),
    );

    return {
      files: payloads.length,
      orders: orders.length,
      clients: phones.size,
      total: orders.reduce((sum, order) => sum + Number(order.total || 0), 0),
      products: localSourceProducts.length,
    };
  }, [localSourceProducts.length, orders, payloads.length]);

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setResult(null);
    setProductSelections({});
    setCustomerSelections({});
    if (files.length === 0) return;

    try {
      const parsed = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          payload: JSON.parse(await file.text()) as ImportPayload,
        })),
      );

      setPayloads(parsed.map((item) => item.payload));
      setFileNames(parsed.map((item) => item.name));
    } catch {
      setPayloads([]);
      setFileNames([]);
      setResult({ error: "Uno de los archivos no es un JSON valido" });
    }
  };

  const buildProductMappings = () =>
    Object.entries(productSelections)
      .map(([sourceKey, targetKey]): ProductMapping | null => {
        const target = targets.find((item) => item.key === targetKey);
        if (!target) return null;
        return {
          sourceItemKey: sourceKey,
          targetType: target.targetType,
          productId: target.productId,
          variantId: target.variantId,
        };
      })
      .filter((item): item is ProductMapping => Boolean(item));

  const buildCustomerResolutions = () =>
    Object.entries(customerSelections)
      .filter(([, customerId]) => customerId && customerId !== "__new__")
      .map(([sourceKey, customerId]) => ({ sourceKey, customerId }));

  const runImport = async (dryRun: boolean) => {
    if (!payload || !branchId) return;

    setLoading(true);
    setResult(null);

    const getFreshToken = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const expiresAt = sessionData.session?.expires_at || 0;
      if (expiresAt * 1000 - Date.now() < 120000) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        return refreshed.session?.access_token;
      }
      return sessionData.session?.access_token;
    };

    const requestImport = async (payloadPart: ImportPayload, batchId?: string) => {
      const token = await getFreshToken();

      return fetch("/api/migrations/sales-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          branchId,
          payload: payloadPart,
          dryRun,
          batchId,
          sourceLabel: fileNames.join(", ") || payload.source?.project || "migration",
          customerResolutions: buildCustomerResolutions(),
          productMappings: buildProductMappings(),
        }),
      });
    };

    if (!dryRun) {
      const allOrders = payload.orders || [];
      let batchId = "";
      const aggregate: Record<string, number> = {};
      const allErrors: Array<{ saleId?: string; message: string }> = [];
      const size = Math.max(1, chunkSize);

      for (let index = 0; index < allOrders.length; index += size) {
        const chunk = allOrders.slice(index, index + size);
        setProgress(`Importando ${index + 1}-${Math.min(index + chunk.length, allOrders.length)} / ${allOrders.length}`);
        const response = await requestImport({ ...payload, orders: chunk }, batchId || undefined);
        const data = await response.json();
        if (data.batchId) batchId = data.batchId;
        if (data.error) {
          setResult(data);
          setProgress("");
          setLoading(false);
          return;
        }
        Object.entries(data.summary || {}).forEach(([key, value]) => {
          aggregate[key] = (aggregate[key] || 0) + Number(value || 0);
        });
        if (Array.isArray(data.errors)) allErrors.push(...data.errors);
        setProgress(`Importadas ${Math.min(index + chunk.length, allOrders.length)} / ${allOrders.length}`);
      }

      const finalResult = { ok: allErrors.length === 0, batchId, summary: aggregate, errors: allErrors.slice(0, 200) };
      setResult(finalResult);
      setBatchErrors(allErrors.map((error) => ({ sale_id: error.saleId || null, message: error.message })));
      setProgress("");
      await loadBatches();
      setLoading(false);
      return;
    }

    const response = await requestImport(payload);
    const data = await response.json();
    setResult(data);

    if (dryRun && Array.isArray(data.sourceProducts)) {
      const guesses: Record<string, string> = {};
      data.sourceProducts.forEach((product: SourceProduct) => {
        const guess = bestProductGuess(product.name, targets);
        if (guess) guesses[product.sourceItemKey] = guess;
      });
      setProductSelections((prev) => ({ ...guesses, ...prev }));
    }

    setLoading(false);
  };

  const rollbackBatch = async (batchId: string) => {
    if (!confirm("Esto va a borrar las ventas importadas en este lote y revertir clientes creados por el lote. ¿Seguimos?")) return;

    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const response = await fetch("/api/migrations/sales-import", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ batchId }),
    });

    const data = await response.json();
    setResult(data);
    await loadBatches();
    setLoading(false);
  };

  const loadBatchErrors = async (batchId: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;

    const response = await fetch(`/api/migrations/sales-import?batchId=${batchId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (data.error) setResult(data);
    setBatchErrors(Array.isArray(data.errors) ? data.errors : []);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-500">Migracion pro</p>
        <h1 className="text-2xl font-bold text-gray-100">Importar ventas, clientes y productos</h1>
        <p className="mt-1 text-sm text-gray-500">
          Acepta uno o varios JSON exportados desde Mordisco/Kablam0 y menupolemico.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="space-y-4 rounded-xl border border-gray-700 bg-gray-900 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Sucursal destino
            </label>
            <select
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
            >
              <option value="">Seleccionar sucursal</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name || branch.slug || branch.id}
                </option>
              ))}
            </select>
          </div>

          <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-gray-600 bg-gray-950/40 p-6 text-center transition hover:border-gray-400">
            <FileJson className="mb-3 text-gray-400" size={34} />
            <span className="text-sm font-semibold text-gray-100">
              {fileNames.length > 0 ? `${fileNames.length} archivo(s) seleccionados` : "Seleccionar JSON"}
            </span>
            <span className="mt-1 text-xs text-gray-500">
              {fileNames.join(", ") || "Podés subir exports de ambos sistemas juntos"}
            </span>
            <input type="file" multiple accept="application/json,.json" onChange={handleFiles} className="hidden" />
          </label>

          <div className="flex flex-wrap gap-2">
            <select
              value={chunkSize}
              onChange={(event) => setChunkSize(Number(event.target.value))}
              className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
            >
              <option value={100}>Tandas de 100</option>
              <option value={500}>Tandas de 500</option>
              <option value={1000}>Tandas de 1000</option>
            </select>
            <button
              onClick={() => runImport(true)}
              disabled={payloads.length === 0 || !branchId || loading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-600 px-3 py-2 text-sm font-medium text-gray-200 disabled:opacity-40"
            >
              <CheckCircle size={16} />
              Analizar
            </button>
            <button
              onClick={() => runImport(false)}
              disabled={payloads.length === 0 || !branchId || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-gray-950 disabled:opacity-40"
            >
              <Upload size={16} />
              Importar
            </button>
          </div>
          {progress && <p className="text-sm text-blue-300">{progress}</p>}
        </section>

        <aside className="space-y-3 rounded-xl border border-gray-700 bg-gray-900 p-5">
          <h2 className="font-semibold text-gray-100">Preview</h2>
          {[
            ["Archivos", preview.files],
            ["Ventas", preview.orders],
            ["Clientes por telefono", preview.clients],
            ["Productos detectados", preview.products],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-gray-950 p-3">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-2xl font-bold text-gray-100">{value}</p>
            </div>
          ))}
          <div className="rounded-lg bg-gray-950 p-3">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-2xl font-bold text-emerald-400">
              ${preview.total.toLocaleString("es-AR")}
            </p>
          </div>
        </aside>
      </div>

      {batches.length > 0 && (
        <section className="space-y-3 rounded-xl border border-gray-700 bg-gray-900 p-5">
          <h2 className="font-semibold text-gray-100">Importaciones recientes</h2>
          <div className="overflow-auto rounded-lg border border-gray-700">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-gray-950 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Origen</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Ventas</th>
                  <th className="px-3 py-2">Clientes</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id} className="border-t border-gray-800">
                    <td className="px-3 py-2 text-gray-300">
                      {batch.created_at ? new Date(batch.created_at).toLocaleString("es-AR") : "-"}
                    </td>
                    <td className="px-3 py-2 text-gray-300">{batch.source_label || "-"}</td>
                    <td className="px-3 py-2 text-gray-300">{batch.status}</td>
                    <td className="px-3 py-2 text-gray-300">{batch.summary?.createdOrders || 0}</td>
                    <td className="px-3 py-2 text-gray-300">{batch.summary?.createdCustomers || 0}</td>
                    <td className="px-3 py-2 text-right">
                      {(batch.summary?.errors || 0) > 0 && (
                        <button
                          onClick={() => loadBatchErrors(batch.id)}
                          className="mr-2 inline-flex items-center gap-2 rounded-lg border border-amber-900/70 px-3 py-1.5 text-xs font-medium text-amber-200"
                        >
                          Ver errores
                        </button>
                      )}
                      <button
                        onClick={() => rollbackBatch(batch.id)}
                        disabled={loading || batch.status === "rolled_back"}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-900/70 px-3 py-1.5 text-xs font-medium text-red-200 disabled:opacity-40"
                      >
                        <RotateCcw size={14} />
                        Deshacer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {batchErrors.length > 0 && (
        <section className="space-y-3 rounded-xl border border-red-900/60 bg-red-950/20 p-5">
          <h2 className="font-semibold text-gray-100">Errores de importacion</h2>
          <div className="max-h-80 overflow-auto rounded-lg border border-red-900/50">
            {batchErrors.map((error, index) => (
              <div key={`${error.sale_id || "error"}-${index}`} className="border-b border-red-900/30 p-3 text-sm">
                <span className="font-mono text-red-200">{error.sale_id || "-"}</span>
                <span className="ml-3 text-red-100">{error.message}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {result?.similarCustomerMatches && result.similarCustomerMatches.length > 0 && (
        <section className="space-y-3 rounded-xl border border-amber-900/60 bg-amber-950/20 p-5">
          <h2 className="font-semibold text-gray-100">Clientes parecidos</h2>
          <p className="text-sm text-gray-400">
            Los teléfonos exactos se unen solos. Para estos parecidos, elegí si usar un cliente existente o crear uno nuevo.
          </p>
          <div className="grid gap-3">
            {result.similarCustomerMatches.map((match) => (
              <div key={match.source.key} className="rounded-lg border border-gray-700 bg-gray-900 p-3">
                <div className="mb-2 text-sm">
                  <span className="font-semibold text-gray-100">{match.source.name || "Sin nombre"}</span>
                  <span className="ml-2 text-gray-500">{match.source.phone || "sin telefono"}</span>
                  {match.source.address && <span className="ml-2 text-gray-500">{match.source.address}</span>}
                </div>
                <select
                  value={customerSelections[match.source.key] || "__new__"}
                  onChange={(event) =>
                    setCustomerSelections((prev) => ({ ...prev, [match.source.key]: event.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
                >
                  <option value="__new__">Crear cliente nuevo</option>
                  {match.matches.map(({ customer, score }) => (
                    <option key={customer.id} value={customer.id}>
                      Usar {customer.name || "Sin nombre"} - {customer.phone || "sin telefono"} ({Math.round(score * 100)}%)
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      {sourceProducts.length > 0 && (
        <section className="space-y-3 rounded-xl border border-gray-700 bg-gray-900 p-5">
          <div className="flex items-center gap-2">
            <Link2 size={18} />
            <h2 className="font-semibold text-gray-100">Matching de productos</h2>
          </div>
          <p className="text-sm text-gray-400">
            Si dejás un producto sin match, la venta igual se importa pero no suma historial por producto.
          </p>

          <div className="max-h-[560px] overflow-auto rounded-lg border border-gray-700">
            {sourceProducts.map((product) => (
              <div key={product.sourceItemKey} className="grid gap-3 border-b border-gray-800 p-3 md:grid-cols-[1fr_1.2fr]">
                <div>
                  <p className="font-medium text-gray-100">{product.name || product.sourceItemKey}</p>
                  <p className="text-xs text-gray-500">
                    {product.quantity} unidades - {product.orders} ventas - ${product.total.toLocaleString("es-AR")}
                  </p>
                </div>
                <select
                  value={productSelections[product.sourceItemKey] || ""}
                  onChange={(event) =>
                    setProductSelections((prev) => ({ ...prev, [product.sourceItemKey]: event.target.value }))
                  }
                  className="rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100"
                >
                  <option value="">Sin match</option>
                  {targets.map((target) => (
                    <option key={target.key} value={target.key}>
                      {target.targetType === "combo" ? "[Combo] " : ""}
                      {target.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>
      )}

      {result && (
        <section
          className={`rounded-xl border p-5 ${
            result.error || result.summary?.errors
              ? "border-red-900/60 bg-red-950/30"
              : "border-emerald-900/60 bg-emerald-950/20"
          }`}
        >
          <div className="flex items-center gap-2">
            {result.error || result.summary?.errors ? (
              <XCircle size={18} className="text-red-300" />
            ) : (
              <CheckCircle size={18} className="text-emerald-300" />
            )}
            <h2 className="font-semibold text-gray-100">
              {result.dryRun ? "Analisis" : "Resultado"}
            </h2>
          </div>

          {result.error ? (
            <p className="mt-3 text-sm text-red-200">{result.error}</p>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-5">
              {Object.entries(result.summary || {}).map(([key, value]) => (
                <div key={key} className="rounded-lg bg-gray-950/60 p-3">
                  <p className="text-xs text-gray-500">{key}</p>
                  <p className="text-xl font-bold text-gray-100">{value}</p>
                </div>
              ))}
            </div>
          )}

          {(result.errors || []).length > 0 && (
            <div className="mt-4 max-h-64 overflow-auto rounded-lg border border-red-900/50">
              {(result.errors || []).map((error, index) => (
                <div key={`${error.saleId || "error"}-${index}`} className="border-b border-red-900/30 p-3 text-sm">
                  <span className="font-mono text-red-200">{error.saleId || "-"}</span>
                  <span className="ml-3 text-red-100">{error.message}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
