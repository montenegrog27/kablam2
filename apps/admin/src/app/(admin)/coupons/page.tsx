"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import {
  CalendarDays,
  Copy,
  Eye,
  Printer,
  RefreshCw,
  Search,
  TicketPercent,
  Trash2,
  Wand2,
} from "lucide-react";

type Coupon = {
  id?: string;
  tenant_id?: string;
  name: string;
  code: string;
  discount_type: "percentage" | "fixed" | "free_shipping";
  discount_value?: number | null;
  requires_phone?: boolean;
  allowed_phone?: string | null;
  has_expiration?: boolean;
  expires_at?: string | null;
  usage_type?: string;
  usage_limit?: number | null;
  weekly_limit?: number | null;
  monthly_limit?: number | null;
  usage_scope?: "global" | "phone";
  is_accumulable?: boolean;
  is_active?: boolean;
  total_uses?: number | null;
  campaign?: string | null;
  batch_id?: string | null;
  prefix?: string | null;
  print_label?: string | null;
  print_note?: string | null;
  created_at?: string;
};

type DiscountType = Coupon["discount_type"];
type UsageScope = "global" | "phone";
type BatchStatusFilter = "all" | "active" | "inactive" | "mixed" | "expired";
type BatchSort =
  | "created_desc"
  | "created_asc"
  | "name_asc"
  | "name_desc"
  | "count_desc"
  | "uses_desc"
  | "expires_asc";
type PrintOrientation = "portrait" | "landscape";
type LogoPosition = "none" | "top" | "bottom" | "left" | "right";

type CouponBranding = {
  logo_url?: string | null;
  font_family?: string | null;
  font_primary?: string | null;
  font_url?: string | null;
};

type CouponBatch = {
  id: string;
  label: string;
  prefix?: string | null;
  count: number;
  activeCount: number;
  inactiveCount: number;
  totalUses: number;
  createdAt?: string;
  expiresAt?: string | null;
  firstCode: string;
  lastCode: string;
  discountLabel: string;
  status: "active" | "inactive" | "mixed";
  expired: boolean;
};

const inputClass =
  "w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none transition focus:border-orange-500";

const labelClass = "text-xs font-semibold uppercase tracking-wide text-gray-400";

function sanitizePrefix(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function normalizeCode(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function money(value?: number | null) {
  return `$${Number(value || 0).toLocaleString("es-AR")}`;
}

function discountLabel(coupon: Pick<Coupon, "discount_type" | "discount_value">) {
  if (coupon.discount_type === "free_shipping") return "Envío gratis";
  if (coupon.discount_type === "percentage") return `${coupon.discount_value || 0}% OFF`;
  return `${money(coupon.discount_value)} OFF`;
}

function formatDate(value?: string | null) {
  if (!value) return "Sin vencimiento";
  return new Date(value).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function chunk<T>(items: T[], size: number) {
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size));
  }
  return pages;
}

function getGoogleFontFamily(fontUrl?: string | null) {
  if (!fontUrl || !fontUrl.includes("fonts.googleapis.com")) return null;

  try {
    const url = new URL(fontUrl);
    const family = url.searchParams.getAll("family")[0];
    return family?.split(":")[0]?.replace(/\+/g, " ").trim() || null;
  } catch {
    const match = fontUrl.match(/[?&]family=([^&]+)/);
    return match?.[1]?.split(":")[0]?.replace(/\+/g, " ").trim() || null;
  }
}

function getLoadedFontFamily(branding?: CouponBranding | null) {
  return (
    getGoogleFontFamily(branding?.font_url) ||
    branding?.font_family ||
    branding?.font_primary ||
    "CouponTenantFont"
  );
}

function getBrandFontFamily(branding?: CouponBranding | null) {
  const loadedFamily = getLoadedFontFamily(branding);
  const fallbackFamily = branding?.font_family || branding?.font_primary;
  return `'${loadedFamily}', ${fallbackFamily ? `'${fallbackFamily}', ` : ""}sans-serif`;
}

function secureRandomInt(maxExclusive: number) {
  if (maxExclusive <= 1) return 0;
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) return Math.floor(Math.random() * maxExclusive);

  const maxUint = 0xffffffff;
  const limit = maxUint - (maxUint % maxExclusive);
  const buffer = new Uint32Array(1);

  do {
    cryptoApi.getRandomValues(buffer);
  } while (buffer[0] >= limit);

  return buffer[0] % maxExclusive;
}

function generateCodes({
  prefix,
  quantity,
  suffixLength,
  existingCodes,
}: {
  prefix: string;
  quantity: number;
  suffixLength: number;
  existingCodes: Set<string>;
}) {
  const codes: string[] = [];
  const length = Math.max(1, Math.min(12, suffixLength));
  const maxCombinations = 10 ** length;
  const usedForPrefix = Array.from(existingCodes).filter((code) => code.startsWith(prefix)).length;
  const availableCombinations = Math.max(0, maxCombinations - usedForPrefix);
  const maxAttempts = Math.max(quantity * 30, 250);
  let attempts = 0;

  if (quantity > availableCombinations) {
    throw new Error(`No hay suficientes codigos disponibles con ${length} digitos. Aumenta los digitos del codigo.`);
  }

  while (codes.length < quantity && attempts < maxAttempts) {
    attempts += 1;
    const randomNumber = secureRandomInt(maxCombinations);
    const suffix = String(randomNumber).padStart(length, "0");
    const code = `${prefix}${suffix}`;

    if (existingCodes.has(code) || codes.includes(code)) continue;
    codes.push(code);
  }

  if (codes.length < quantity) {
    throw new Error("No pude generar suficientes codigos unicos. Aumenta los digitos del codigo.");
  }

  return codes;
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branding, setBranding] = useState<CouponBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"single" | "batch">("batch");

  const [name, setName] = useState("Cumple Mordisco");
  const [campaign, setCampaign] = useState("Evento Cumple Mordisco");
  const [code, setCode] = useState("");
  const [prefix, setPrefix] = useState("cumplemordisco");
  const [quantity, setQuantity] = useState("9");
  const [suffixLength, setSuffixLength] = useState("3");
  const [discountType, setDiscountType] = useState<DiscountType>("percentage");
  const [discountValue, setDiscountValue] = useState("20");
  const [requiresPhone, setRequiresPhone] = useState(true);
  const [allowedPhone, setAllowedPhone] = useState("");
  const [hasExpiration, setHasExpiration] = useState(true);
  const [expiresAt, setExpiresAt] = useState("");
  const [usageType, setUsageType] = useState("one_time");
  const [usageLimit, setUsageLimit] = useState("");
  const [weeklyLimit, setWeeklyLimit] = useState("");
  const [monthlyLimit, setMonthlyLimit] = useState("");
  const [usageScope, setUsageScope] = useState<UsageScope>("phone");
  const [isAccumulable, setIsAccumulable] = useState(false);
  const [printLabel, setPrintLabel] = useState("Cupón especial");
  const [printNote, setPrintNote] = useState("Mostrá este cupón al hacer tu pedido.");
  const [printCoupons, setPrintCoupons] = useState<Coupon[]>([]);
  const [batchSearch, setBatchSearch] = useState("");
  const [batchStatusFilter, setBatchStatusFilter] = useState<BatchStatusFilter>("all");
  const [batchSort, setBatchSort] = useState<BatchSort>("created_desc");
  const [printOrientation, setPrintOrientation] = useState<PrintOrientation>("portrait");
  const [printColumns, setPrintColumns] = useState("3");
  const [printRows, setPrintRows] = useState("3");
  const [couponWidthMm, setCouponWidthMm] = useState("");
  const [couponHeightMm, setCouponHeightMm] = useState("");
  const [couponGapMm, setCouponGapMm] = useState("3");
  const [printTextColor, setPrintTextColor] = useState("#111827");
  const [printBackgroundColor, setPrintBackgroundColor] = useState("#ffffff");
  const [logoPosition, setLogoPosition] = useState<LogoPosition>("top");
  const [logoAngle, setLogoAngle] = useState("0");
  const [logoSizeMm, setLogoSizeMm] = useState("18");

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!branding?.font_url) return;

    const fontUrl = branding.font_url;
    const fontFamily = getLoadedFontFamily(branding);
    const existing = document.querySelector(`style[data-coupon-font="${fontUrl}"], link[data-coupon-font="${fontUrl}"]`);
    if (existing) return;

    const isFontFile = /\.(woff|woff2|ttf|otf)(\?.*)?$/i.test(fontUrl);
    if (isFontFile) {
      const style = document.createElement("style");
      style.setAttribute("data-coupon-font", fontUrl);
      style.textContent = `
        @font-face {
          font-family: "${fontFamily}";
          src: url("${fontUrl}");
          font-display: swap;
        }
      `;
      document.head.appendChild(style);
      return () => style.remove();
    }

    const link = document.createElement("link");
    link.setAttribute("data-coupon-font", fontUrl);
    link.rel = "stylesheet";
    link.href = fontUrl;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
    return () => link.remove();
  }, [branding]);

  const existingCodes = useMemo(
    () => new Set(coupons.map((coupon) => coupon.code?.toUpperCase())),
    [coupons],
  );

  const couponsPerSheet = Math.max(1, (Number(printColumns) || 1) * (Number(printRows) || 1));
  const printPageWidthMm = printOrientation === "portrait" ? 210 : 297;
  const printPageHeightMm = printOrientation === "portrait" ? 297 : 210;
  const printMarginMm = 3;
  const printGapMm = Math.max(0, Number(couponGapMm) || 0);
  const printableWidthMm = printPageWidthMm - printMarginMm * 2;
  const printableHeightMm = printPageHeightMm - printMarginMm * 2;
  const computedCouponWidthMm =
    Number(couponWidthMm) ||
    (printableWidthMm - printGapMm * (Math.max(1, Number(printColumns) || 1) - 1)) /
      Math.max(1, Number(printColumns) || 1);
  const computedCouponHeightMm =
    Number(couponHeightMm) ||
    (printableHeightMm - printGapMm * (Math.max(1, Number(printRows) || 1) - 1)) /
      Math.max(1, Number(printRows) || 1);
  const codeBandColor = printTextColor;
  const couponFontFamily = getBrandFontFamily(branding);
  const tenantLogoUrl = branding?.logo_url || "";
  const logoSizePx = Math.max(24, Number(logoSizeMm || 18) * 2.25);

  const previewCodes = useMemo(() => {
    const cleanPrefix = sanitizePrefix(prefix || "CUPON");
    try {
      return generateCodes({
        prefix: cleanPrefix,
        quantity: Math.min(Number(quantity) || 1, Math.max(1, couponsPerSheet)),
        suffixLength: Number(suffixLength) || 3,
        existingCodes,
      });
    } catch {
      return [];
    }
  }, [couponsPerSheet, existingCodes, prefix, quantity, suffixLength]);

  const printablePages = useMemo(
    () => chunk(printCoupons, couponsPerSheet),
    [couponsPerSheet, printCoupons],
  );

  const loadData = async () => {
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: userRecord } = await supabase
      .from("users")
      .select("tenant_id, branch_id")
      .eq("id", user.id)
      .single();

    if (!userRecord) {
      setLoading(false);
      return;
    }

    setTenantId(userRecord.tenant_id);

    let brandingBranchId = userRecord.branch_id as string | null;
    if (!brandingBranchId) {
      const { data: firstBranch } = await supabase
        .from("branches")
        .select("id")
        .eq("tenant_id", userRecord.tenant_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      brandingBranchId = firstBranch?.id || null;
    }

    if (brandingBranchId) {
      const { data: branchSettings } = await supabase
        .from("branch_settings")
        .select("logo_url, font_family, font_primary, font_url")
        .eq("branch_id", brandingBranchId)
        .maybeSingle();

      setBranding(branchSettings || null);
    } else {
      setBranding(null);
    }

    const { data } = await supabase
      .from("coupons")
      .select("*")
      .eq("tenant_id", userRecord.tenant_id)
      .order("created_at", { ascending: false });

    setCoupons(data || []);
    setLoading(false);
  };

  const buildCouponPayload = (couponCode: string, couponName: string, batchId?: string) => ({
    tenant_id: tenantId,
    name: couponName,
    code: normalizeCode(couponCode),
    discount_type: discountType,
    discount_value:
      discountType === "percentage" || discountType === "fixed"
        ? Number(discountValue || 0)
        : null,
    requires_phone: requiresPhone,
    allowed_phone: requiresPhone && allowedPhone ? allowedPhone.replace(/\D/g, "") : null,
    has_expiration: hasExpiration,
    expires_at: hasExpiration ? expiresAt || null : null,
    usage_type: usageType,
    usage_limit: usageType === "limited" ? Number(usageLimit || 0) : null,
    weekly_limit: usageType === "weekly_limited" ? Number(weeklyLimit || 0) : null,
    monthly_limit: usageType === "monthly_limited" ? Number(monthlyLimit || 0) : null,
    usage_scope: usageScope,
    is_accumulable: isAccumulable,
    campaign: campaign || null,
    batch_id: batchId || null,
    prefix: mode === "batch" ? sanitizePrefix(prefix) : null,
    print_label: printLabel || null,
    print_note: printNote || null,
  });

  const validateForm = () => {
    if (!tenantId) return "No se encontró el tenant del usuario.";
    if (!name.trim()) return "Completá el nombre de la campaña.";
    if (discountType !== "free_shipping" && Number(discountValue) <= 0) {
      return "El descuento debe ser mayor a cero.";
    }
    if (hasExpiration && !expiresAt) return "Elegí una fecha de vencimiento.";
    if (usageType === "limited" && Number(usageLimit) <= 0) return "Indicá el límite total.";
    if (usageType === "weekly_limited" && Number(weeklyLimit) <= 0) {
      return "Indicá cuántas veces se puede usar por semana.";
    }
    if (usageType === "monthly_limited" && Number(monthlyLimit) <= 0) {
      return "Indicá cuántas veces se puede usar por mes.";
    }
    if (mode === "single" && !normalizeCode(code)) return "Ingresá el código del cupón.";
    if (mode === "batch" && !sanitizePrefix(prefix)) return "Ingresá un prefijo válido.";
    if (mode === "batch" && Number(quantity) <= 0) return "La cantidad debe ser mayor a cero.";
    return "";
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const formError = validateForm();
    if (formError) {
      setMessage(formError);
      return;
    }

    setSaving(true);
    setMessage("");

    if (mode === "single") {
      const payload = buildCouponPayload(code, name);
      const { data, error } = await supabase.from("coupons").insert(payload).select("*").single();

      setSaving(false);

      if (error) {
        setMessage(error.message);
        return;
      }

      setCode("");
      setPrintCoupons(data ? [data] : [payload as Coupon]);
      setMessage("Cupón creado correctamente.");
      await loadData();
      return;
    }

    const batchId = crypto.randomUUID();
    let codes: string[];
    try {
      codes = generateCodes({
        prefix: sanitizePrefix(prefix),
        quantity: Math.min(Number(quantity) || 1, 500),
        suffixLength: Number(suffixLength) || 3,
        existingCodes,
      });
    } catch (error: any) {
      setSaving(false);
      setMessage(error?.message || "No se pudieron generar codigos.");
      return;
    }

    const payload = codes.map((generatedCode, index) =>
      buildCouponPayload(generatedCode, `${name} #${index + 1}`, batchId),
    );

    const { data, error } = await supabase.from("coupons").insert(payload).select("*");
    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setPrintCoupons((data as Coupon[]) || (payload as Coupon[]));
    setMessage(`Lote creado: ${codes.length} cupones listos para imprimir.`);
    await loadData();
  };

  const toggleActive = async (id: string | undefined, current: boolean | undefined) => {
    if (!id) return;
    await supabase.from("coupons").update({ is_active: !current }).eq("id", id);
    await loadData();
  };

  const loadBatchForPrint = async (batchId?: string | null) => {
    if (!batchId || !tenantId) return;
    const { data, error } = await supabase
      .from("coupons")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("batch_id", batchId)
      .order("code", { ascending: true });

    if (error) {
      setMessage(error.message);
      return;
    }

    setPrintCoupons(data || []);
    setMessage(`Lote cargado para imprimir: ${data?.length || 0} cupones.`);
  };

  const deleteBatch = async (batch: CouponBatch) => {
    if (!tenantId) return;

    const confirmed = window.confirm(
      `¿Eliminar el lote "${batch.label}" con ${batch.count} cupones?\n\nEsta accion no se puede deshacer.`,
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from("coupons")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("batch_id", batch.id);

    if (error) {
      setMessage(
        `No se pudo eliminar el lote. Si algun cupon ya fue usado o esta en una orden, conviene desactivarlo para conservar el historial. Detalle: ${error.message}`,
      );
      return;
    }

    setPrintCoupons((current) =>
      current.some((coupon) => coupon.batch_id === batch.id) ? [] : current,
    );
    setMessage(`Lote eliminado: ${batch.label}`);
    await loadData();
  };

  const handlePrint = () => {
    if (printCoupons.length === 0) {
      setMessage("Primero generá o cargá un lote para imprimir.");
      return;
    }
    window.print();
  };

  const copyCode = async (couponCode: string) => {
    await navigator.clipboard.writeText(couponCode);
    setMessage(`Código copiado: ${couponCode}`);
  };

  const batches = useMemo<CouponBatch[]>(() => {
    const map = new Map<string, Coupon[]>();

    coupons.forEach((coupon) => {
      if (!coupon.batch_id) return;
      map.set(coupon.batch_id, [...(map.get(coupon.batch_id) || []), coupon]);
    });

    return Array.from(map.entries()).map(([id, batchCoupons]) => {
      const sortedCoupons = [...batchCoupons].sort((a, b) =>
        String(a.code || "").localeCompare(String(b.code || "")),
      );
      const first = sortedCoupons[0];
      const activeCount = batchCoupons.filter((coupon) => coupon.is_active !== false).length;
      const inactiveCount = batchCoupons.length - activeCount;
      const createdAt = batchCoupons
        .map((coupon) => coupon.created_at)
        .filter(Boolean)
        .sort()
        .at(0);
      const expiresAt =
        batchCoupons
          .map((coupon) => coupon.expires_at)
          .filter(Boolean)
          .sort()
          .at(0) || null;
      const status =
        activeCount === batchCoupons.length
          ? "active"
          : inactiveCount === batchCoupons.length
            ? "inactive"
            : "mixed";

      return {
        id,
        label: first?.campaign || first?.name || "Lote sin nombre",
        prefix: first?.prefix,
        count: batchCoupons.length,
        activeCount,
        inactiveCount,
        totalUses: batchCoupons.reduce((sum, coupon) => sum + Number(coupon.total_uses || 0), 0),
        createdAt,
        expiresAt,
        firstCode: sortedCoupons[0]?.code || "",
        lastCode: sortedCoupons.at(-1)?.code || "",
        discountLabel: first ? discountLabel(first) : "Cupón",
        status,
        expired: Boolean(expiresAt && new Date(expiresAt) < new Date()),
      };
    });
  }, [coupons]);

  const filteredBatches = useMemo(() => {
    const search = batchSearch.trim().toUpperCase();

    return batches
      .filter((batch) => {
        if (batchStatusFilter === "active" && batch.status !== "active") return false;
        if (batchStatusFilter === "inactive" && batch.status !== "inactive") return false;
        if (batchStatusFilter === "mixed" && batch.status !== "mixed") return false;
        if (batchStatusFilter === "expired" && !batch.expired) return false;

        if (!search) return true;
        return [
          batch.label,
          batch.prefix || "",
          batch.firstCode,
          batch.lastCode,
          batch.discountLabel,
        ]
          .join(" ")
          .toUpperCase()
          .includes(search);
      })
      .sort((a, b) => {
        if (batchSort === "created_asc") {
          return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
        }
        if (batchSort === "name_asc") return a.label.localeCompare(b.label);
        if (batchSort === "name_desc") return b.label.localeCompare(a.label);
        if (batchSort === "count_desc") return b.count - a.count;
        if (batchSort === "uses_desc") return b.totalUses - a.totalUses;
        if (batchSort === "expires_asc") {
          return String(a.expiresAt || "9999").localeCompare(String(b.expiresAt || "9999"));
        }
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
  }, [batchSearch, batchSort, batchStatusFilter, batches]);

  return (
    <div className="min-h-screen bg-gray-950 p-4 text-gray-100 md:p-6">
      <style>{`
        @media screen {
          .coupon-print-root { display: none; }
          .coupon-preview-card .text-gray-500 {
            color: inherit !important;
            opacity: 0.7;
          }
        }
        @media print {
          html, body, .coupon-print-root, .coupon-print-root * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * { visibility: hidden !important; }
          .coupon-print-root, .coupon-print-root * { visibility: visible !important; }
          .coupon-print-root {
            display: block !important;
            position: absolute;
            inset: 0;
            background: transparent !important;
            color: ${printTextColor};
          }
          @page { size: A4 ${printOrientation}; margin: ${printMarginMm}mm; }
          .coupon-print-sheet {
            width: ${printableWidthMm}mm;
            min-height: ${printableHeightMm}mm;
            display: grid;
            grid-template-columns: repeat(${Math.max(1, Number(printColumns) || 1)}, ${computedCouponWidthMm}mm);
            grid-auto-rows: ${computedCouponHeightMm}mm;
            gap: ${printGapMm}mm;
            align-content: start;
            justify-content: start;
            page-break-after: always;
          }
          .coupon-print-card {
            width: ${computedCouponWidthMm}mm;
            height: ${computedCouponHeightMm}mm;
            border: 1.5px dashed #111827;
            border-radius: 8px;
            background: ${printBackgroundColor} !important;
            background-color: ${printBackgroundColor} !important;
            color: ${printTextColor} !important;
            font-family: ${couponFontFamily};
            padding: 5mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            break-inside: avoid;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-200">
            <TicketPercent size={14} />
            Motor de cupones
          </div>
          <h1 className="text-2xl font-bold md:text-3xl">Cupones</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-400">
            Generá códigos individuales o lotes para eventos. Los lotes se imprimen en A4 con
            9 cupones por hoja y se validan en customer/cashier con límites por uso, semana,
            mes y WhatsApp.
          </p>
        </div>

        <button
          onClick={loadData}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:bg-gray-900"
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-100">
          {message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <form onSubmit={handleCreate} className="rounded-xl border border-gray-800 bg-gray-900/70 p-4 shadow-xl md:p-6">
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-gray-950 p-1">
            <button
              type="button"
              onClick={() => setMode("batch")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                mode === "batch" ? "bg-orange-500 text-white" : "text-gray-400 hover:bg-gray-900"
              }`}
            >
              Lote imprimible
            </button>
            <button
              type="button"
              onClick={() => setMode("single")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                mode === "single" ? "bg-orange-500 text-white" : "text-gray-400 hover:bg-gray-900"
              }`}
            >
              Cupón individual
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className={labelClass}>Nombre interno</span>
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            </label>

            <label className="space-y-2">
              <span className={labelClass}>Campaña / evento</span>
              <input className={inputClass} value={campaign} onChange={(e) => setCampaign(e.target.value)} />
            </label>

            {mode === "single" ? (
              <label className="space-y-2 md:col-span-2">
                <span className={labelClass}>Código</span>
                <input
                  className={inputClass}
                  placeholder="Ej: CUMPLEMORDISCO432"
                  value={code}
                  onChange={(e) => setCode(normalizeCode(e.target.value))}
                />
              </label>
            ) : (
              <>
                <label className="space-y-2">
                  <span className={labelClass}>Prefijo</span>
                  <input
                    className={inputClass}
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder="cumplemordisco"
                  />
                </label>
                <label className="space-y-2">
                  <span className={labelClass}>Cantidad</span>
                  <input className={inputClass} type="number" min={1} max={500} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                </label>
                <label className="space-y-2">
                  <span className={labelClass}>Digitos aleatorios</span>
                  <input className={inputClass} type="number" min={3} max={12} value={suffixLength} onChange={(e) => setSuffixLength(e.target.value)} />
                  <span className="block text-[11px] text-gray-500">
                    Se genera un numero aleatorio despues del prefijo, no correlativo.
                  </span>
                </label>
              </>
            )}

            <label className="space-y-2">
              <span className={labelClass}>Tipo de beneficio</span>
              <select className={inputClass} value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)}>
                <option value="percentage">% Descuento</option>
                <option value="fixed">$ Monto fijo</option>
                <option value="free_shipping">Envío gratis</option>
              </select>
            </label>

            {discountType !== "free_shipping" && (
              <label className="space-y-2">
                <span className={labelClass}>Valor</span>
                <input className={inputClass} type="number" min={0} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
              </label>
            )}

            <label className="space-y-2">
              <span className={labelClass}>Regla de uso</span>
              <select className={inputClass} value={usageType} onChange={(e) => setUsageType(e.target.value)}>
                <option value="unlimited">Uso ilimitado</option>
                <option value="one_time">Una sola vez</option>
                <option value="limited">Límite total</option>
                <option value="weekly_limited">X veces por semana</option>
                <option value="monthly_limited">X veces por mes</option>
              </select>
            </label>

            <label className="space-y-2">
              <span className={labelClass}>Alcance del límite</span>
              <select className={inputClass} value={usageScope} onChange={(e) => setUsageScope(e.target.value as UsageScope)}>
                <option value="global">Global del cupón</option>
                <option value="phone">Por WhatsApp</option>
              </select>
            </label>

            {usageType === "limited" && (
              <label className="space-y-2">
                <span className={labelClass}>Usos máximos</span>
                <input className={inputClass} type="number" min={1} value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} />
              </label>
            )}

            {usageType === "weekly_limited" && (
              <label className="space-y-2">
                <span className={labelClass}>Usos por semana</span>
                <input className={inputClass} type="number" min={1} value={weeklyLimit} onChange={(e) => setWeeklyLimit(e.target.value)} />
              </label>
            )}

            {usageType === "monthly_limited" && (
              <label className="space-y-2">
                <span className={labelClass}>Usos por mes</span>
                <input className={inputClass} type="number" min={1} value={monthlyLimit} onChange={(e) => setMonthlyLimit(e.target.value)} />
              </label>
            )}

            <label className="space-y-2">
              <span className={labelClass}>Fecha de vencimiento</span>
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  disabled={!hasExpiration}
                  className={inputClass}
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setHasExpiration((value) => !value)}
                  className={`shrink-0 rounded-lg border px-3 text-xs font-semibold ${
                    hasExpiration ? "border-orange-500 bg-orange-500/10 text-orange-200" : "border-gray-700 text-gray-400"
                  }`}
                >
                  {hasExpiration ? "Activa" : "Sin fecha"}
                </button>
              </div>
            </label>

            <label className="space-y-2">
              <span className={labelClass}>WhatsApp</span>
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  placeholder="Opcional: número específico"
                  value={allowedPhone}
                  onChange={(e) => setAllowedPhone(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setRequiresPhone((value) => !value)}
                  className={`shrink-0 rounded-lg border px-3 text-xs font-semibold ${
                    requiresPhone ? "border-orange-500 bg-orange-500/10 text-orange-200" : "border-gray-700 text-gray-400"
                  }`}
                >
                  {requiresPhone ? "Requiere" : "Libre"}
                </button>
              </div>
            </label>

            <label className="space-y-2">
              <span className={labelClass}>Título impreso</span>
              <input className={inputClass} value={printLabel} onChange={(e) => setPrintLabel(e.target.value)} />
            </label>

            <label className="space-y-2">
              <span className={labelClass}>Nota impresa</span>
              <input className={inputClass} value={printNote} onChange={(e) => setPrintNote(e.target.value)} />
            </label>
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-950 p-4 md:flex-row md:items-center md:justify-between">
            <label className="flex items-center gap-3 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={isAccumulable}
                onChange={(e) => setIsAccumulable(e.target.checked)}
                className="h-4 w-4 accent-orange-500"
              />
              Se puede combinar con otros descuentos del día
            </label>

            <button
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-400 disabled:opacity-50"
            >
              <Wand2 size={17} />
              {saving ? "Generando..." : mode === "batch" ? "Generar lote" : "Crear cupón"}
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-bold">Vista previa A4</h2>
                <p className="text-xs text-gray-400">
                  {couponsPerSheet} cupones por hoja, margen minimo.
                </p>
              </div>
              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-xs font-bold text-gray-950"
              >
                <Printer size={15} />
                Imprimir
              </button>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Hoja</span>
                <select
                  className={inputClass}
                  value={printOrientation}
                  onChange={(e) => setPrintOrientation(e.target.value as PrintOrientation)}
                >
                  <option value="portrait">Vertical</option>
                  <option value="landscape">Apaisada</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Separacion mm</span>
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  value={couponGapMm}
                  onChange={(e) => setCouponGapMm(e.target.value)}
                />
              </label>

              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Columnas</span>
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  max={6}
                  value={printColumns}
                  onChange={(e) => setPrintColumns(e.target.value)}
                />
              </label>

              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Filas</span>
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  max={8}
                  value={printRows}
                  onChange={(e) => setPrintRows(e.target.value)}
                />
              </label>

              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Ancho mm</span>
                <input
                  className={inputClass}
                  type="number"
                  min={20}
                  placeholder={computedCouponWidthMm.toFixed(1)}
                  value={couponWidthMm}
                  onChange={(e) => setCouponWidthMm(e.target.value)}
                />
              </label>

              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Alto mm</span>
                <input
                  className={inputClass}
                  type="number"
                  min={20}
                  placeholder={computedCouponHeightMm.toFixed(1)}
                  value={couponHeightMm}
                  onChange={(e) => setCouponHeightMm(e.target.value)}
                />
              </label>

              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Color letra</span>
                <div className="flex gap-2">
                  <input
                    type="color"
                    className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-gray-700 bg-gray-950 p-1"
                    value={printTextColor}
                    onChange={(e) => setPrintTextColor(e.target.value)}
                  />
                  <input
                    className={inputClass}
                    value={printTextColor}
                    onChange={(e) => setPrintTextColor(e.target.value)}
                  />
                </div>
              </label>

              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Color fondo</span>
                <div className="flex gap-2">
                  <input
                    type="color"
                    className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-gray-700 bg-gray-950 p-1"
                    value={printBackgroundColor}
                    onChange={(e) => setPrintBackgroundColor(e.target.value)}
                  />
                  <input
                    className={inputClass}
                    value={printBackgroundColor}
                    onChange={(e) => setPrintBackgroundColor(e.target.value)}
                  />
                </div>
              </label>

              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Logo</span>
                <select
                  className={inputClass}
                  value={logoPosition}
                  onChange={(e) => setLogoPosition(e.target.value as LogoPosition)}
                >
                  <option value="none">Sin logo</option>
                  <option value="top">Arriba</option>
                  <option value="bottom">Abajo</option>
                  <option value="left">Izquierda</option>
                  <option value="right">Derecha</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Tamaño logo mm</span>
                <input
                  className={inputClass}
                  type="number"
                  min={6}
                  max={60}
                  value={logoSizeMm}
                  onChange={(e) => setLogoSizeMm(e.target.value)}
                />
              </label>

              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Ángulo logo</span>
                <input
                  className={inputClass}
                  type="number"
                  min={-180}
                  max={180}
                  value={logoAngle}
                  onChange={(e) => setLogoAngle(e.target.value)}
                />
              </label>

              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Tipografía</span>
                <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-xs text-gray-300" style={{ fontFamily: couponFontFamily }}>
                  {branding?.font_family || branding?.font_primary || getGoogleFontFamily(branding?.font_url) || "Tenant"}
                </div>
              </div>
            </div>

            <div className="mb-3 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-xs text-gray-400">
              Cupón: {computedCouponWidthMm.toFixed(1)} x {computedCouponHeightMm.toFixed(1)} mm ·
              Area útil: {printableWidthMm} x {printableHeightMm} mm
            </div>

            <div className="rounded-xl bg-gray-950 p-3">
            <div
              className="mx-auto grid rounded bg-white p-1.5 shadow-inner"
              style={{
                aspectRatio: `${printPageWidthMm} / ${printPageHeightMm}`,
                gridTemplateColumns: `repeat(${Math.max(1, Number(printColumns) || 1)}, minmax(0, 1fr))`,
                gap: `${Math.min(Math.max(printGapMm, 1), 8)}px`,
                maxHeight: printOrientation === "portrait" ? 520 : 340,
                width: "100%",
              }}
            >
              {(printCoupons.length ? printCoupons.slice(0, couponsPerSheet) : previewCodes.slice(0, couponsPerSheet).map((previewCode) => ({
                name,
                code: previewCode,
                discount_type: discountType,
                discount_value: Number(discountValue || 0),
                expires_at: expiresAt,
                print_label: printLabel,
                print_note: printNote,
              } as Coupon))).map((coupon) => (
                <div
                  key={coupon.code}
                  className="coupon-preview-card rounded border border-dashed p-2"
                  style={{
                    backgroundColor: printBackgroundColor,
                    borderColor: printTextColor,
                    color: printTextColor,
                    display: logoPosition === "left" || logoPosition === "right" ? "grid" : "flex",
                    flexDirection: "column",
                    fontFamily: couponFontFamily,
                    gap: 8,
                    gridTemplateColumns:
                      logoPosition === "left"
                        ? `${logoSizePx}px minmax(0, 1fr)`
                        : logoPosition === "right"
                          ? `minmax(0, 1fr) ${logoSizePx}px`
                          : undefined,
                    minHeight: 96,
                  }}
                >
                  {tenantLogoUrl && logoPosition === "left" && (
                    <img
                      src={tenantLogoUrl}
                      alt=""
                      className="self-center justify-self-center object-contain"
                      style={{ width: logoSizePx, height: logoSizePx, transform: `rotate(${Number(logoAngle) || 0}deg)` }}
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col justify-between">
                  {tenantLogoUrl && logoPosition === "top" && (
                    <img
                      src={tenantLogoUrl}
                      alt=""
                      className="mx-auto mb-1 object-contain"
                      style={{ width: logoSizePx, height: logoSizePx, transform: `rotate(${Number(logoAngle) || 0}deg)` }}
                    />
                  )}
                  <p className="text-[9px] font-bold uppercase tracking-wide text-gray-500">{coupon.print_label || "Cupón"}</p>
                  <p className="mt-1 text-sm font-black leading-tight">{discountLabel(coupon)}</p>
                  <p
                    className="mt-1 break-all rounded px-1.5 py-1 text-center text-[10px] font-black tracking-wide"
                    style={{
                      backgroundColor: codeBandColor,
                      color: printBackgroundColor,
                    }}
                  >
                    {coupon.code}
                  </p>
                  <p className="mt-1 text-[8px] text-gray-500">Válido hasta {formatDate(coupon.expires_at)}</p>
                  {tenantLogoUrl && logoPosition === "bottom" && (
                    <img
                      src={tenantLogoUrl}
                      alt=""
                      className="mx-auto mt-1 object-contain"
                      style={{ width: logoSizePx, height: logoSizePx, transform: `rotate(${Number(logoAngle) || 0}deg)` }}
                    />
                  )}
                  </div>
                  {tenantLogoUrl && logoPosition === "right" && (
                    <img
                      src={tenantLogoUrl}
                      alt=""
                      className="self-center justify-self-center object-contain"
                      style={{ width: logoSizePx, height: logoSizePx, transform: `rotate(${Number(logoAngle) || 0}deg)` }}
                    />
                  )}
                </div>
              ))}
            </div>
            </div>

            <p className="mt-3 text-xs text-gray-400">
              Tip: desde imprimir podés elegir “Guardar como PDF” y mandarlo directo a imprenta.
            </p>
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-4">
            {false && (
              <h2 className="mb-3 font-bold">Últimos lotes</h2>
            )}
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">Lotes generados</h2>
                <p className="text-xs text-gray-400">
                  {filteredBatches.length} de {batches.length} lotes
                </p>
              </div>
              {(batchSearch || batchStatusFilter !== "all" || batchSort !== "created_desc") && (
                <button
                  type="button"
                  onClick={() => {
                    setBatchSearch("");
                    setBatchStatusFilter("all");
                    setBatchSort("created_desc");
                  }}
                  className="rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-300 hover:bg-gray-800"
                >
                  Limpiar
                </button>
              )}
            </div>

            <div className="space-y-3">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={15} />
                <input
                  className="w-full rounded-lg border border-gray-700 bg-gray-950 py-2 pl-9 pr-3 text-sm text-gray-100 placeholder-gray-500 outline-none transition focus:border-orange-500"
                  placeholder="Buscar lote, prefijo o codigo"
                  value={batchSearch}
                  onChange={(e) => setBatchSearch(e.target.value)}
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                <select
                  className={inputClass}
                  value={batchStatusFilter}
                  onChange={(e) => setBatchStatusFilter(e.target.value as BatchStatusFilter)}
                >
                  <option value="all">Todos</option>
                  <option value="active">Activos</option>
                  <option value="inactive">Inactivos</option>
                  <option value="mixed">Mixtos</option>
                  <option value="expired">Vencidos</option>
                </select>

                <select
                  className={inputClass}
                  value={batchSort}
                  onChange={(e) => setBatchSort(e.target.value as BatchSort)}
                >
                  <option value="created_desc">Mas nuevos</option>
                  <option value="created_asc">Mas viejos</option>
                  <option value="name_asc">Nombre A-Z</option>
                  <option value="name_desc">Nombre Z-A</option>
                  <option value="count_desc">Mas cupones</option>
                  <option value="uses_desc">Mas usados</option>
                  <option value="expires_asc">Proximos a vencer</option>
                </select>
              </div>
            </div>

            <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {filteredBatches.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-700 p-4 text-center text-sm text-gray-400">
                  No hay lotes con esos filtros.
                </div>
              ) : (
                filteredBatches.map((batch) => (
                  <div
                    key={batch.id}
                    className="w-full rounded-lg border border-gray-800 bg-gray-950 p-3 text-left text-sm transition hover:border-orange-500/60 hover:bg-gray-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-gray-100">{batch.label}</span>
                        <span className="mt-1 block text-xs text-gray-500">
                          {batch.firstCode}
                          {batch.lastCode && batch.lastCode !== batch.firstCode ? ` - ${batch.lastCode}` : ""}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          batch.expired
                            ? "bg-red-500/15 text-red-300"
                            : batch.status === "active"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : batch.status === "inactive"
                                ? "bg-gray-700 text-gray-300"
                                : "bg-yellow-500/15 text-yellow-300"
                        }`}
                      >
                        {batch.expired
                          ? "Vencido"
                          : batch.status === "active"
                            ? "Activo"
                            : batch.status === "inactive"
                              ? "Inactivo"
                              : "Mixto"}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-gray-400">
                      <span>
                        <span className="block font-bold text-gray-200">{batch.count}</span>
                        cupones
                      </span>
                      <span>
                        <span className="block font-bold text-gray-200">{batch.totalUses}</span>
                        usos
                      </span>
                      <span>
                        <span className="block font-bold text-gray-200">{batch.discountLabel}</span>
                        beneficio
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-gray-500">
                      <span>Vence: {formatDate(batch.expiresAt)}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => loadBatchForPrint(batch.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-orange-500/30 px-2 py-1 font-semibold text-orange-300 hover:bg-orange-500/10"
                        >
                          <Eye size={13} />
                          Cargar A4
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteBatch(batch)}
                          className="inline-flex items-center gap-1 rounded-md border border-red-500/30 px-2 py-1 font-semibold text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 size={13} />
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            </div>
        </aside>
      </div>

      <section className="mt-6 rounded-xl border border-gray-800 bg-gray-900/70">
        <div className="flex items-center justify-between border-b border-gray-800 p-4">
          <div>
            <h2 className="font-bold">Cupones creados</h2>
            <p className="text-xs text-gray-400">{loading ? "Cargando..." : `${coupons.length} cupones`}</p>
          </div>
        </div>

        <div className="divide-y divide-gray-800">
          {coupons.slice(0, 80).map((coupon) => (
            <div key={coupon.id || coupon.code} className="grid gap-3 p-4 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{coupon.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    coupon.is_active ? "bg-emerald-500/15 text-emerald-300" : "bg-gray-700 text-gray-300"
                  }`}>
                    {coupon.is_active ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <button
                  onClick={() => copyCode(coupon.code)}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-orange-300"
                >
                  <Copy size={12} />
                  {coupon.code}
                </button>
              </div>

              <div className="text-sm text-gray-300">
                <div className="font-semibold">{discountLabel(coupon)}</div>
                <div className="text-xs text-gray-500">{coupon.requires_phone ? "Requiere WhatsApp" : "Sin WhatsApp obligatorio"}</div>
              </div>

              <div className="text-sm text-gray-300">
                <div className="flex items-center gap-1">
                  <CalendarDays size={14} className="text-gray-500" />
                  {formatDate(coupon.expires_at)}
                </div>
                <div className="text-xs text-gray-500">
                  Usos: {coupon.total_uses || 0} · {coupon.usage_type || "unlimited"}
                </div>
              </div>

              <div className="flex gap-2 md:justify-end">
                {coupon.batch_id && (
                  <button
                    onClick={() => loadBatchForPrint(coupon.batch_id)}
                    className="rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-800"
                  >
                    Ver lote
                  </button>
                )}
                <button
                  onClick={() => toggleActive(coupon.id, coupon.is_active)}
                  className="rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-800"
                >
                  {coupon.is_active ? "Desactivar" : "Activar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="coupon-print-root">
        {printablePages.map((page, pageIndex) => (
          <div key={pageIndex} className="coupon-print-sheet">
            {page.map((coupon) => (
              <article
                key={coupon.id || coupon.code}
                className="coupon-print-card"
                style={{
                  backgroundColor: printBackgroundColor,
                  color: printTextColor,
                  display: logoPosition === "left" || logoPosition === "right" ? "grid" : "flex",
                  gridTemplateColumns:
                    logoPosition === "left"
                      ? `${logoSizeMm}mm minmax(0, 1fr)`
                      : logoPosition === "right"
                        ? `minmax(0, 1fr) ${logoSizeMm}mm`
                        : undefined,
                  gap: "4mm",
                }}
              >
                {tenantLogoUrl && logoPosition === "left" && (
                  <img
                    src={tenantLogoUrl}
                    alt=""
                    style={{ alignSelf: "center", height: `${logoSizeMm}mm`, justifySelf: "center", objectFit: "contain", transform: `rotate(${Number(logoAngle) || 0}deg)`, width: `${logoSizeMm}mm` }}
                  />
                )}
                <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "space-between", minWidth: 0 }}>
                <div>
                  {tenantLogoUrl && logoPosition === "top" && (
                    <img
                      src={tenantLogoUrl}
                      alt=""
                      style={{ display: "block", height: `${logoSizeMm}mm`, margin: "0 auto 3mm", objectFit: "contain", transform: `rotate(${Number(logoAngle) || 0}deg)`, width: `${logoSizeMm}mm` }}
                    />
                  )}
                  <p style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: printTextColor, opacity: 0.7 }}>
                    {coupon.campaign || campaign || "Cupón especial"}
                  </p>
                  <h2 style={{ marginTop: "5mm", fontSize: "22px", lineHeight: 1, fontWeight: 950 }}>
                    {discountLabel(coupon)}
                  </h2>
                  <p style={{ marginTop: "3mm", fontSize: "12px", color: printTextColor, opacity: 0.82 }}>
                    {coupon.print_label || printLabel || "Beneficio exclusivo"}
                  </p>
                </div>

                <div>
                  <div style={{ borderRadius: "7px", background: codeBandColor, color: printBackgroundColor, padding: "4mm", textAlign: "center" }}>
                    <p style={{ fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#d1d5db" }}>Código</p>
                    <p style={{ marginTop: "1mm", overflowWrap: "anywhere", fontSize: "18px", fontWeight: 950, letterSpacing: "0.04em" }}>{coupon.code}</p>
                  </div>
                  <p style={{ marginTop: "3mm", fontSize: "9px", lineHeight: 1.35, color: printTextColor, opacity: 0.82 }}>
                    {coupon.print_note || printNote}
                  </p>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", gap: "4mm", fontSize: "8px", color: printTextColor, opacity: 0.7 }}>
                  <span>Vence: {formatDate(coupon.expires_at)}</span>
                  <span>{coupon.requires_phone ? "Requiere WhatsApp" : "Uso libre"}</span>
                </div>
                {tenantLogoUrl && logoPosition === "bottom" && (
                  <img
                    src={tenantLogoUrl}
                    alt=""
                    style={{ display: "block", height: `${logoSizeMm}mm`, margin: "3mm auto 0", objectFit: "contain", transform: `rotate(${Number(logoAngle) || 0}deg)`, width: `${logoSizeMm}mm` }}
                  />
                )}
                </div>
                {tenantLogoUrl && logoPosition === "right" && (
                  <img
                    src={tenantLogoUrl}
                    alt=""
                    style={{ alignSelf: "center", height: `${logoSizeMm}mm`, justifySelf: "center", objectFit: "contain", transform: `rotate(${Number(logoAngle) || 0}deg)`, width: `${logoSizeMm}mm` }}
                  />
                )}
              </article>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
