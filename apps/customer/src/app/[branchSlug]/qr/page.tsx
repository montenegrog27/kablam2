import { notFound } from "next/navigation";
import FontLoader from "../../components/FontLoader";
import { loadQrMenu } from "@/lib/loadQrMenu";
import { buildCustomerMetadata } from "@/lib/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ branchSlug: string }>;
}) {
  const { branchSlug } = await params;
  const data = await loadQrMenu(branchSlug);

  if (!data) {
    return buildCustomerMetadata({ fallbackTitle: "Menu QR" });
  }

  const iconUrl = data.branding?.loading_icon_url || data.branding?.logo_url;

  return buildCustomerMetadata({
    title: `Menu QR - ${data.branch.name}`,
    fallbackTitle: data.branch.name,
    faviconUrl: iconUrl,
    appIconUrl: iconUrl,
    manifestUrl: `/${branchSlug}/manifest.webmanifest`,
  });
}

function money(value: number) {
  return `$${Math.round(value || 0).toLocaleString("es-AR")}`;
}

export default async function QrMenuPage({
  params,
}: {
  params: Promise<{ branchSlug: string }>;
}) {
  const { branchSlug } = await params;
  const data = await loadQrMenu(branchSlug);

  if (!data) notFound();

  const logoUrl = data.branding?.logo_url || data.branding?.loading_icon_url;
  const background = data.branding?.background_color || "#f8fafc";
  const brandColor = data.branding?.brand_color || data.branding?.accent_color || "#111827";

  return (
    <main className="min-h-dvh text-slate-950" style={{ background }}>
      <FontLoader branding={data.branding || undefined} />

      <header className="sticky top-0 z-30 border-b border-black/5 bg-white/90 px-4 py-4 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          {logoUrl ? (
            <img src={logoUrl} alt={data.branch.name} className="h-16 w-auto max-w-48 object-contain" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-950 text-xl font-black text-white">
              {data.branch.name.slice(0, 1)}
            </div>
          )}
        </div>
      </header>

      {data.categories.length > 0 && (
        <nav className="sticky top-[121px] z-20 border-b border-black/5 bg-white/80 px-3 py-2 backdrop-blur">
          <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto">
            {data.categories.map((category) => (
              <a
                key={category.id}
                href={`#cat-${category.id}`}
                className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm"
              >
                {category.name}
              </a>
            ))}
          </div>
        </nav>
      )}

      <section className="mx-auto max-w-3xl px-4 py-5">
        {data.categories.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <p className="text-lg font-black">Menu no disponible</p>
            <p className="mt-2 text-sm text-slate-500">Todavia no hay productos visibles para QR.</p>
          </div>
        ) : (
          <div className="space-y-7">
            {data.categories.map((category) => (
              <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-44">
                <div className="mb-3">
                  {category.parentName && (
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{category.parentName}</p>
                  )}
                  <h2 className="text-2xl font-black" style={{ color: brandColor }}>
                    {category.name}
                  </h2>
                </div>

                <div className="space-y-3">
                  {category.products.map((product) => (
                    <article key={product.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
                      <div className="flex gap-3 p-3">
                        {product.imageUrl && (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="h-24 w-24 flex-shrink-0 rounded-xl object-cover"
                            loading="lazy"
                          />
                        )}
                        <div className="min-w-0 flex-1 py-1">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="text-base font-black leading-tight">{product.name}</h3>
                            <div className="text-right">
                              {product.saleBadge && (
                                <p className="mb-1 inline-flex rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white">
                                  {product.saleBadge}
                                </p>
                              )}
                              {product.originalPrice && product.originalPrice > product.price && (
                                <p className="text-xs font-bold text-slate-400 line-through">{money(product.originalPrice)}</p>
                              )}
                              <p className="whitespace-nowrap text-base font-black" style={{ color: product.originalPrice ? "#dc2626" : brandColor }}>
                                {money(product.price)}
                              </p>
                            </div>
                          </div>
                          {product.description && (
                            <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-500">{product.description}</p>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
