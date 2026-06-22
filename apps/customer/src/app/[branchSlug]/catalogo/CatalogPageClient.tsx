"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, MessageCircle, Phone, Search, Send, X } from "lucide-react";
import type { QrMenuData, QrMenuProduct } from "@/lib/loadQrMenu";

type Props = {
  data: QrMenuData;
  branchSlug: string;
};

type OrderForm = {
  name: string;
  phone: string;
  address: string;
  date: string;
  note: string;
};

const emptyForm: OrderForm = {
  name: "",
  phone: "",
  address: "",
  date: "",
  note: "",
};

function money(value: number) {
  return `$${Math.round(value || 0).toLocaleString("es-AR")}`;
}

function todayInput() {
  return new Date().toISOString().split("T")[0];
}

export default function CatalogPageClient({ data, branchSlug }: Props) {
  const [selectedProduct, setSelectedProduct] = useState<QrMenuProduct | null>(null);
  const [form, setForm] = useState<OrderForm>(() => ({ ...emptyForm, date: todayInput() }));
  const [query, setQuery] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const logoUrl = data.branding?.logo_url || data.branding?.loading_icon_url;
  const background = data.branding?.background_color || "#f7f4ef";
  const brandColor = data.branding?.brand_color || data.branding?.accent_color || "#111827";
  const accentColor = data.branding?.accent_color || data.branding?.brand_color || "#ef4444";
  const depositEnabled = Boolean(data.catalogOrder?.deposit_enabled);
  const depositPercent = Number(data.catalogOrder?.deposit_percent ?? 50);
  const depositAmount = selectedProduct ? Math.round(selectedProduct.price * depositPercent) / 100 : 0;

  const filteredCategories = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return data.categories;

    return data.categories
      .map((category) => ({
        ...category,
        products: category.products.filter((product) =>
          [product.name, product.description, category.name]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(clean)),
        ),
      }))
      .filter((category) => category.products.length > 0);
  }, [data.categories, query]);

  const openProduct = (product: QrMenuProduct) => {
    setSelectedProduct(product);
    setForm((current) => ({ ...current, date: current.date || todayInput() }));
    setSent(false);
    setResultMessage("");
    setErrorMessage("");
  };

  const closeProduct = () => {
    setSelectedProduct(null);
    setSent(false);
    setSubmitting(false);
    setResultMessage("");
    setErrorMessage("");
  };

  const updateForm = (key: keyof OrderForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submitOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProduct || submitting) return;

    setSubmitting(true);
    setSent(false);
    setResultMessage("");
    setErrorMessage("");

    try {
      const response = await fetch("/api/catalog-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchSlug,
          productId: selectedProduct.id,
          customer: {
            name: form.name,
            phone: form.phone,
            address: form.address,
          },
          requestedDate: form.date,
          notes: form.note,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok && response.status !== 207) {
        const messages: Record<string, string> = {
          branch_catalog_whatsapp_not_configured:
            "La sucursal todavia no tiene WhatsApp receptor configurado.",
          catalog_transfer_alias_required:
            "La sucursal requiere sena, pero falta configurar el alias de transferencia.",
          customer_data_required:
            "Revisa nombre, WhatsApp, direccion y fecha para continuar.",
          product_without_price:
            "Este producto todavia no tiene precio configurado.",
        };
        throw new Error(messages[payload?.error] || "No pudimos registrar el encargo.");
      }

      setSent(true);
      setResultMessage(
        response.status === 207
          ? "Registramos tu encargo, pero algun WhatsApp no pudo enviarse. La sucursal lo revisa desde el panel."
          : "Encargo recibido. Te contactaremos por WhatsApp para confirmar disponibilidad y horario.",
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No pudimos registrar el encargo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-dvh text-stone-950" style={{ background }}>
      <header className="sticky top-0 z-30 border-b border-black/10 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <a
            href={`/${branchSlug}/qr`}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 shadow-sm"
            aria-label="Volver al menu QR"
          >
            <ArrowLeft size={18} />
          </a>

          <div className="min-w-0 text-center">
            {logoUrl ? (
              <img src={logoUrl} alt={data.branch.name} className="mx-auto h-12 w-auto max-w-40 object-contain" />
            ) : (
              <p className="truncate text-lg font-black">{data.branch.name}</p>
            )}
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.22em] text-stone-500">Catalogo</p>
          </div>

          <a
            href={`/${branchSlug}/order`}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 shadow-sm"
            aria-label="Ir a pedidos"
          >
            <MessageCircle size={18} />
          </a>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-4 pb-8 pt-4">
        <div className="mb-4 rounded-2xl border border-black/10 bg-white/85 p-3 shadow-sm">
          <label className="flex items-center gap-2">
            <Search size={17} className="text-stone-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar en el catalogo"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm font-semibold text-stone-900 outline-none placeholder:text-stone-400"
            />
          </label>
        </div>

        {data.categories.length > 0 && (
          <nav className="mb-5 flex gap-2 overflow-x-auto pb-1">
            {data.categories.map((category) => (
              <a
                key={category.id}
                href={`#cat-${category.id}`}
                className="whitespace-nowrap rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-black text-stone-700 shadow-sm"
              >
                {category.name}
              </a>
            ))}
          </nav>
        )}

        {filteredCategories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/15 bg-white/80 p-8 text-center">
            <p className="text-lg font-black">No encontramos productos</p>
            <p className="mt-2 text-sm text-stone-500">Proba con otra busqueda o volve a ver todas las categorias.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {filteredCategories.map((category) => (
              <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-32">
                <div className="mb-3">
                  {category.parentName && (
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-stone-500">{category.parentName}</p>
                  )}
                  <h2 className="text-2xl font-black" style={{ color: brandColor }}>
                    {category.name}
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                  {category.products.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => openProduct(product)}
                      className="group overflow-hidden rounded-2xl border border-black/10 bg-white text-left shadow-sm transition active:scale-[0.99] md:hover:-translate-y-0.5 md:hover:shadow-md"
                    >
                      <div className="aspect-[4/3] bg-stone-100">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center px-3 text-center text-xs font-black uppercase tracking-wide text-stone-400">
                            {data.branch.name}
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-black leading-tight text-stone-950">
                          {product.name}
                        </h3>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-base font-black" style={{ color: accentColor }}>
                            {money(product.price)}
                          </span>
                          <span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-black text-stone-600">
                            Ver
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-black/45 p-0 backdrop-blur-sm md:p-6">
          <div className="mx-auto flex h-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl md:h-auto md:max-h-[92dvh] md:rounded-3xl">
            <div className="relative flex-shrink-0">
              <div className="aspect-[16/10] bg-stone-100 md:aspect-[21/9]">
                {selectedProduct.imageUrl ? (
                  <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-black uppercase tracking-wide text-stone-400">
                    {data.branch.name}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={closeProduct}
                className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-stone-800 shadow"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black leading-tight text-stone-950">{selectedProduct.name}</h2>
                  {selectedProduct.description ? (
                    <p className="mt-3 text-sm leading-6 text-stone-600">{selectedProduct.description}</p>
                  ) : (
                    <p className="mt-3 text-sm leading-6 text-stone-500">Producto disponible para encargar.</p>
                  )}
                </div>
                <p className="whitespace-nowrap text-xl font-black" style={{ color: accentColor }}>
                  {money(selectedProduct.price)}
                </p>
              </div>

              <form onSubmit={submitOrder} className="mt-6 space-y-3 rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <div>
                  <h3 className="text-base font-black text-stone-950">Encargar</h3>
                  <p className="mt-1 text-xs leading-5 text-stone-500">
                    Completa tus datos. Te contactaremos por WhatsApp para confirmar disponibilidad, horario y pago.
                  </p>
                </div>

                {depositEnabled && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                    <p className="font-black">Sena para confirmar: {depositPercent}% ({money(depositAmount)})</p>
                    {data.catalogOrder?.transfer_alias && (
                      <p className="mt-1 text-xs font-semibold">Alias: {data.catalogOrder.transfer_alias}</p>
                    )}
                    <p className="mt-1 text-xs">Te enviaremos el detalle por WhatsApp cuando registres el encargo.</p>
                  </div>
                )}

                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-stone-500">Nombre</span>
                  <input
                    required
                    value={form.name}
                    onChange={(event) => updateForm("name", event.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-stone-500"
                    placeholder="Tu nombre"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-stone-500">WhatsApp</span>
                  <div className="relative">
                    <Phone size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input
                      required
                      inputMode="tel"
                      value={form.phone}
                      onChange={(event) => updateForm("phone", event.target.value)}
                      className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-stone-500"
                      placeholder="Ej: 261 555 1234"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-stone-500">Direccion de entrega</span>
                  <input
                    required
                    value={form.address}
                    onChange={(event) => updateForm("address", event.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-stone-500"
                    placeholder="Calle, numero, piso o referencia"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-stone-500">Fecha del pedido</span>
                  <div className="relative">
                    <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input
                      required
                      type="date"
                      min={todayInput()}
                      value={form.date}
                      onChange={(event) => updateForm("date", event.target.value)}
                      className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-10 pr-3 text-sm font-semibold outline-none focus:border-stone-500"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-stone-500">Nota</span>
                  <textarea
                    value={form.note}
                    onChange={(event) => updateForm("note", event.target.value)}
                    className="min-h-24 w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-stone-500"
                    placeholder="Horario aproximado, aclaraciones o detalle del pedido"
                  />
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
                  style={{ backgroundColor: accentColor }}
                >
                  <Send size={17} />
                  {submitting ? "Enviando..." : "Encargar"}
                </button>

                {sent && resultMessage && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                    {resultMessage}
                  </div>
                )}

                {errorMessage && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
                    {errorMessage}
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
