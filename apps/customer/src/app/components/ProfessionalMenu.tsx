"use client";

import { useState, useEffect, useRef } from "react";
import type {
  Product,
  Category,
  Branding,
  Combo,
  ProductVariant,
} from "../../types/menu";
import { getBrandFontFamily } from "@/lib/fonts";

type Props = {
  productos: Product[];
  combos?: Combo[];
  onAgregar: (product: Product) => void;
  branding?: Branding;
};

export default function ProfessionalMenu({
  productos,
  combos,
  onAgregar,
  branding,
}: Props) {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(
    null,
  );
  const [scrolled, setScrolled] = useState(false);
  const [flashSales, setFlashSales] = useState<any[]>([]);
  const [allCategoriesFromApi, setAllCategoriesFromApi] = useState<any[]>([]);
  const [now, setNow] = useState(Date.now());
  const tabsRef = useRef<HTMLDivElement>(null);
  const productsRef = useRef<HTMLDivElement>(null);

  const brandColor = branding?.brand_color || "#FF6B35";
  const accentColor = branding?.accent_color || "#1A1A1A";
  const fontFamily = getBrandFontFamily(branding);

  // Build category list from products + API (to include categories without products)
  const productCategories = productos.flatMap((p) => p.categories || []);
  const comboCategories = (combos || []).flatMap((c) => c.categories || []);
  const menuCategories = [...productCategories, ...comboCategories];
  const allCategoryIds = new Set(menuCategories.map((c) => c.id));
  const sortCategories = (categories: Category[]) =>
    [...categories].sort((a, b) => {
      const posA = a.position ?? 9999;
      const posB = b.position ?? 9999;
      if (posA !== posB) return posA - posB;
      return a.name.localeCompare(b.name, "es");
    });
  
  // Merge product categories with API categories (API has the definitive order by position)
  let mergedCategories: Category[] = [];
  if (allCategoriesFromApi.length > 0) {
    // Use API order as the source of truth, but keep product-assigned categories
    mergedCategories = allCategoriesFromApi
      .filter((c: any) => allCategoryIds.has(c.id) || !c.parent_id) // Show roots + any cat linked to a product
      .map((c: any) => ({ id: c.id, name: c.name, parent_id: c.parent_id, position: c.position ?? 0 }));
    // Also add any product categories not in the API response
    menuCategories.forEach((pc) => {
      if (!mergedCategories.find((c) => c.id === pc.id)) {
        mergedCategories.push({ id: pc.id, name: pc.name, parent_id: pc.parent_id, position: pc.position });
      }
    });
  } else {
    // Fallback: just use product categories when API hasn't loaded yet
    mergedCategories = menuCategories
      .filter((cat, index, self) => self.findIndex((c) => c.id === cat.id) === index);
  }

  const uniqueCategories = sortCategories(mergedCategories);
  const rootCategories = sortCategories(uniqueCategories.filter((c) => !c.parent_id));
  console.log("[root categories]", rootCategories.map((c) => c.name));

  // Convertir combos a productos para mostrarlos en el menú
  const comboAsProducts: Product[] = (combos || []).map((combo) => {
    const comboPrice = typeof combo.price === "number" ? combo.price : 0;

    const variants: ProductVariant[] = [
      {
        id: combo.id + "-variant",
        name: "Combo",
        price: comboPrice,
        is_default: true,
        image_url: combo.image_url,
      },
    ];

    const product: Product = {
      id: combo.id,
      name: combo.name,
      description: combo.description,
      itemType: "combo",
      comboId: combo.id,
      combo_products: combo.combo_products || [],
      combo_removable_ingredients: combo.combo_removable_ingredients || [],
      allow_half: false,
      is_hero: false,
      is_featured: combo.is_featured || false,
      featured_order: combo.featured_order || 0,
      is_suggestable: false,
      show_in_menu: true,
      categories: combo.categories || [],
      product_variants: variants,
      modifier_group_products: [],
      product_ingredients_display: (combo.combo_removable_ingredients || [])
        .filter((r: any) => r.is_active)
        .map((r: any) => ({
          id: r.id,
          ingredient_id: r.ingredient_id,
          is_essential: false,
          is_visible: true,
          ingredients: r.ingredients ? { id: r.ingredients.id, name: r.ingredients.name, sale_price: undefined, cost_per_unit: undefined } : { id: "", name: "", sale_price: undefined, cost_per_unit: undefined },
        })),
      product_extras: combo.product_extras || [],
    };
    return product;
  });

  // Combinar productos normales + combos

  const allProductsInMenu = [...productos, ...comboAsProducts];

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 100);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fetch flash sales
  useEffect(() => {
    const slug = window.location.pathname.split("/")[1];
    if (!slug) return;
    fetch(`/api/flash-sales?branchSlug=${slug}`)
      .then((r) => r.json())
      .then((data) => setFlashSales(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Fetch categories in the correct order from admin
  useEffect(() => {
    const slug = window.location.pathname.split("/")[1];
    if (!slug) return;
    fetch(`/api/categories?slug=${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          console.log("[API categories]", data.map((c: any) => `${c.name}(pos:${c.position}, parent:${c.parent_id||"root"})`));
          setAllCategoriesFromApi(data);
        }
      })
      .catch((e) => console.error("[cat API err]", e));
  }, []);

  // Countdown ticker
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Todos is the default tab (null = show all categories)
  useEffect(() => {
    if (rootCategories.length > 0 && activeTab === undefined) {
      setActiveTab(null); // null = "Todos"
    }
  }, [rootCategories, activeTab]);

  const currentSubcategories = !activeTab
    ? []
    : sortCategories(uniqueCategories.filter((c) => c.parent_id === activeTab));

  // Filter products per category

  const filteredProducts = allProductsInMenu.filter((p) => {
    if (activeTab === null) return !p.id.includes("-variant"); // Todos: show all except combos
    const productCats = p.categories || [];
    if (activeSubcategory) {
      return productCats.some((c) => c.id === activeSubcategory);
    }
    return productCats.some(
      (c) => c.id === activeTab || c.parent_id === activeTab,
    );
  });

  // Deduplicate products by id
  const uniqueProducts = filteredProducts.filter(
    (product, index, self) =>
      self.findIndex((p) => p.id === product.id) === index,
  );

  // Get featured products - buscar SIEMPRE desde todos los productos, no solo los filtrados
  const heroProduct = allProductsInMenu.find((p) => p.is_hero);
  const featuredProducts = uniqueProducts
    .filter((p) => p.is_featured && !p.is_hero)
    .sort((a, b) => ((a as any).featured_order || 999) - ((b as any).featured_order || 999));
  const normalProducts = uniqueProducts.filter(
    (p) => !p.is_featured && !p.is_hero,
  );

  const getPrice = (product: Product) => {

    const variants = product.product_variants || [];
    const variant = variants.find((v) => v.is_default) || variants[0];
    const price = Number(variant?.price) || 0;
    // Fallback debug - si es 0 y viene de combo, usar 10000
    if (product.name.includes("+") && price === 0) {
      console.log("  -> FALLBACK USADO!");
      return 10000;
    }
    return price;
  };

  const handleAddProduct = (product: Product) => {
    onAgregar(product);
  };

  const getImage = (product: Product) => {
    return product.product_variants?.[0]?.image_url;
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("es-AR").format(price);
  };

  // Flash sales: build lookup by category id
  const saleCategoryIds = new Set<string>();
  const saleByCategory: Record<string, any> = {};
  flashSales.forEach((sale) => {
    (sale.flash_sale_categories || []).forEach((sc: any) => {
      saleCategoryIds.add(sc.category_id);
      saleByCategory[sc.category_id] = sale;
    });
  });

  const isProductOnSale = (product: Product) =>
    (product.categories || []).some((c) => saleCategoryIds.has(c.id));

  const getProductSale = (product: Product) => {
    const cat = (product.categories || []).find((c) => saleCategoryIds.has(c.id));
    return cat ? saleByCategory[cat.id] : null;
  };

  const formatCountdown = (endAt: string) => {
    const diff = Math.max(0, Math.floor((new Date(endAt).getTime() - now) / 1000));
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }; 

  const getProductSaleBadge = (product: Product): string | null => {
    const s = getProductSale(product);
    if (!s) return null;
    return s.display_type === "label" ? s.display_label : `-${s.discount_percentage}%`;
  };

  const scrollToTab = (tabId: string | null) => {
    setActiveTab(tabId);
    setActiveSubcategory(null);
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToSubcategory = (subId: string) => {
    setActiveSubcategory(subId);
    setTimeout(() => {
      productsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily }}>
      {/* Hero Section */}
      {heroProduct && (
        <div
          className="relative h-64 md:h-80 bg-cover bg-center"
          style={{
            backgroundImage: getImage(heroProduct)
              ? `linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.6)), url(${getImage(heroProduct)})`
              : `linear-gradient(135deg, ${brandColor}, ${accentColor})`,
          }}
        >
          <div className="absolute inset-0 flex items-end">
            <div className="w-full max-w-6xl mx-auto px-4 pb-6">
              <div className="flex items-end justify-between">
                <div>
                  <span
                    className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-2"
                    style={{ backgroundColor: brandColor, color: "white" }}
                  >
                    DESTACADO
                  </span>
                  <h2 className="text-2xl md:text-4xl font-bold text-white mb-2">
                    {heroProduct.name}
                  </h2>
                  {heroProduct.description && (
                    <p className="text-white/80 text-sm hidden md:block max-w-md">
                      {heroProduct.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onAgregar(heroProduct)}
                  className="px-6 py-3 rounded-full font-bold text-white shadow-lg hover:scale-105 transition-transform"
                  style={{ backgroundColor: brandColor }}
                >
                  <span className="flex items-center gap-2">
                    <span>Agregar</span>
                    <span className="font-bold">
                      ${formatPrice(getPrice(heroProduct))}
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Flash Sales Banner */}
      {flashSales.map((sale) => {
        const catIds = new Set((sale.flash_sale_categories || []).map((sc: any) => sc.category_id));
        const catNames = uniqueCategories.filter((c) => catIds.has(c.id)).map((c) => c.name);
        return (
          <div key={sale.id} className="bg-gradient-to-r from-red-600 to-red-500 text-white px-4 py-3">
            <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span>🔥</span>
                <span>
                  {sale.display_type === "label" ? sale.display_label : `${sale.discount_percentage}% OFF`}
                  {" en "}
                  <strong>{catNames.join(", ") || "varios productos"}</strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-sm font-bold tabular-nums">
                <span className="text-red-200 text-xs">Termina en</span>
                <span className="bg-red-800/40 px-2 py-0.5 rounded">{formatCountdown(sale.end_at)}</span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Category Tabs */}
      <div
        ref={tabsRef}
        className={`sticky top-0 z-40 transition-all duration-300 ${
          scrolled ? "shadow-lg" : ""
        }`}
        style={{ backgroundColor: "white" }}
      >
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-2 overflow-x-auto py-4 snap-x snap-mandatory scrollbar-hide -mx-4 px-4">
            {/* Todos tab */}
            <button
              onClick={() => scrollToTab(null)}
              className={`snap-start flex-shrink-0 px-5 py-2.5 rounded-full font-semibold whitespace-nowrap transition-all ${
                activeTab === null
                  ? "text-white shadow-md"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
              style={{
                fontFamily,
                ...(activeTab === null ? { backgroundColor: brandColor } : {}),
              }}
            >
              Todos
            </button>
            {rootCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => scrollToTab(cat.id)}
                className={`snap-start flex-shrink-0 px-5 py-2.5 rounded-full font-semibold whitespace-nowrap transition-all ${
                  activeTab === cat.id
                    ? "text-white shadow-md"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
                style={{
                  fontFamily,
                  ...(activeTab === cat.id
                    ? { backgroundColor: brandColor }
                    : {}),
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Subcategories - only show when a specific root category is active */}
          {activeTab && currentSubcategories.length > 0 && (
            <div className="flex gap-2 pb-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4">
              <button
                onClick={() => {
                  setActiveSubcategory(null);
                  setTimeout(() => {
                    productsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 100);
                }}
                className={`snap-start flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  !activeSubcategory
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                style={{ fontFamily }}
              >
                Todos
              </button>
              {currentSubcategories.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => scrollToSubcategory(sub.id)}
                  className={`snap-start flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    activeSubcategory === sub.id
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                  style={{ fontFamily }}
                >
                  {sub.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Featured Products Grid / Carousel */}
      {featuredProducts.length > 0 && !activeSubcategory && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h3
            className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"
            style={{ fontFamily }}
          >
            <span
              className="w-1 h-6 rounded-full"
              style={{ backgroundColor: brandColor }}
            />
            Destacados
          </h3>
          {/* Mobile: horizontal scroll carousel */}
          <div className="flex md:hidden gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4 pb-2">
            {featuredProducts.map((product) => (
              <div key={product.id} className="snap-start flex-shrink-0 w-[65vw] max-w-[280px]">
                <FeaturedCard
                  product={product}
                  onAgregar={handleAddProduct}
                  brandColor={brandColor}
                  fontFamily={fontFamily}
                  getPrice={getPrice}
                  getImage={getImage}
                  formatPrice={formatPrice}
                  saleBadge={getProductSaleBadge(product)}
                />
              </div>
            ))}
          </div>
          {/* Desktop: grid */}
          <div className="hidden md:grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {featuredProducts.map((product) => (
              <FeaturedCard
                key={product.id}
                product={product}
                onAgregar={handleAddProduct}
                brandColor={brandColor}
                fontFamily={fontFamily}
                getPrice={getPrice}
                getImage={getImage}
                formatPrice={formatPrice}
                saleBadge={getProductSaleBadge(product)}
              />
            ))}
          </div>
        </div>
      )}

      {/* All Products - Full Width Horizontal List */}
      <div ref={productsRef} className="max-w-6xl mx-auto px-4 py-6">


        <div className="space-y-8">
          {(() => {
            if (normalProducts.length === 0 && featuredProducts.length === 0) {
              return <div className="text-center py-16 text-gray-400"><div className="text-6xl mb-4">🍔</div><p>No hay productos en esta categoría</p></div>;
            }

            // "Todos" tab: iterate all root categories
            if (activeTab === null) {
              return rootCategories.map((rootCat) => {
                const rootProducts = uniqueProducts.filter((p) => (p.categories || []).some((c) => c.id === rootCat.id || c.parent_id === rootCat.id));
                if (rootProducts.length === 0) return null;
                const subs = sortCategories(uniqueCategories.filter((c) => c.parent_id === rootCat.id));
                return (
                  <div key={rootCat.id}>
                    <h4 className="text-md font-bold text-gray-700 mb-3 flex items-center gap-2">
                      <span className="w-1 h-5 rounded-full" style={{ backgroundColor: brandColor }} />
                      {rootCat.name}
                    </h4>
                    {subs.length > 0 ? subs.map((sub) => {
                      const subProducts = rootProducts.filter((p) => (p.categories || []).some((c) => c.id === sub.id));
                      if (subProducts.length === 0) return null;
                      return (
                        <div key={sub.id} id={`sub-${sub.id}`} className="mb-4 ml-4">
                          <h5 className="text-sm font-semibold text-gray-500 mb-2">{sub.name}</h5>
                          <div className="space-y-3">{subProducts.map((product) => (<NormalProductCard key={product.id} product={product} onAgregar={handleAddProduct} brandColor={brandColor} fontFamily={fontFamily} getPrice={getPrice} getImage={getImage} formatPrice={formatPrice} saleBadge={getProductSaleBadge(product)} />))}</div>
                        </div>
                      );
                    }) : (
                      <div className="space-y-3 ml-4">{rootProducts.map((product) => (<NormalProductCard key={product.id} product={product} onAgregar={handleAddProduct} brandColor={brandColor} fontFamily={fontFamily} getPrice={getPrice} getImage={getImage} formatPrice={formatPrice} saleBadge={getProductSaleBadge(product)} />))}</div>
                    )}
                  </div>
                );
              });
            }

            // Specific category: show subcategory groups
            if (!activeSubcategory && currentSubcategories.length > 0) {
              return currentSubcategories.map((sub) => {
                const subProducts = uniqueProducts.filter((p) => (p.categories || []).some((c) => c.id === sub.id));
                if (subProducts.length === 0) return null;
                return (
                  <div key={sub.id} id={`sub-${sub.id}`}>
                    <h4 className="text-md font-bold text-gray-700 mb-3 flex items-center gap-2">
                      <span className="w-1 h-5 rounded-full" style={{ backgroundColor: brandColor }} />
                      {sub.name}
                    </h4>
                    <div className="space-y-3">{subProducts.map((product) => (<NormalProductCard key={product.id} product={product} onAgregar={handleAddProduct} brandColor={brandColor} fontFamily={fontFamily} getPrice={getPrice} getImage={getImage} formatPrice={formatPrice} saleBadge={getProductSaleBadge(product)} />))}</div>
                  </div>
                );
              });
            }
            return normalProducts.map((product) => (<NormalProductCard key={product.id} product={product} onAgregar={handleAddProduct} brandColor={brandColor} fontFamily={fontFamily} getPrice={getPrice} getImage={getImage} formatPrice={formatPrice} saleBadge={getProductSaleBadge(product)} />));
          })()}
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 py-8 border-t border-gray-200 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 text-center space-y-4">
          {branding?.logo_url && (
            <div className="flex justify-center">
              <img
                src={branding.logo_url}
                alt="Logo"
                className="h-12 object-contain"
              />
            </div>
          )}
          <div className="text-sm text-gray-500" style={{ fontFamily }}>
            <p>
              Powered by{" "}
              <span className="font-semibold" style={{ color: brandColor }}>
                Kablam
              </span>
            </p>
            {branding?.website_url && (
              <p className="mt-1">
                <a
                  href={branding.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {branding.website_url.replace(/^https?:\/\//, "")}
                </a>
              </p>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

// Featured Card - Grid style
function FeaturedCard({
  product,
  onAgregar,
  brandColor,
  fontFamily,
  getPrice,
  getImage,
  formatPrice,
  saleBadge,
}: {
  product: Product;
  onAgregar: (product: Product) => void;
  brandColor: string;
  fontFamily: string;
  getPrice: (p: Product) => number;
  getImage: (p: Product) => string | undefined;
  formatPrice: (p: number) => string;
  saleBadge?: string | null;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="group relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer ring-2 ring-offset-2"
      style={{ fontFamily }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onAgregar(product)}
    >
      {/* Image */}
      <div className="relative h-36 md:h-44 overflow-hidden">
        {getImage(product) ? (
          <img
            src={getImage(product)}
            alt={product.name}
            className={`w-full h-full object-cover transition-transform duration-500 ${
              isHovered ? "scale-110" : ""
            }`}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: `${brandColor}20` }}
          >
            <span className="text-5xl" style={{ color: brandColor }}>
              🍔
            </span>
          </div>
        )}

        {/* Badge */}
        <div
          className="absolute top-2 left-2 px-2 py-1 rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: brandColor }}
        >
          ⭐ Destacado
        </div>

        {saleBadge && (
          <div className="absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-bold text-white bg-red-500 shadow-lg">
            🔥 {saleBadge}
          </div>
        )}

        {/* Quick Add Button */}
        <button
          className="absolute bottom-2 right-2 w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg hover:scale-110 transition-transform"
          style={{ backgroundColor: brandColor }}
          onClick={(e) => {
            e.stopPropagation();
            onAgregar(product);
          }}
        >
          <span className="text-xl">+</span>
        </button>
      </div>

      {/* Info */}
      <div className="p-4">
        <h4 className="font-bold text-gray-900 mb-1 line-clamp-2">
          {product.name}
        </h4>
        <p className="text-sm text-gray-500 line-clamp-2 mb-3">
          {product.description || "\u00A0"}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold" style={{ color: brandColor }}>
            ${formatPrice(getPrice(product))}
          </span>
          <span className="text-xs text-gray-400">1 porción</span>
        </div>
      </div>
    </div>
  );
}

// Normal Product Card - Full width horizontal
function NormalProductCard({
  product,
  onAgregar,
  brandColor,
  fontFamily,
  getPrice,
  getImage,
  formatPrice,
  saleBadge,
}: {
  product: Product;
  onAgregar: (product: Product) => void;
  brandColor: string;
  fontFamily: string;
  getPrice: (p: Product) => number;
  getImage: (p: Product) => string | undefined;
  formatPrice: (p: number) => string;
  saleBadge?: string | null;
}) {
  const image = getImage(product);

  return (
    <div
      className="relative grid grid-cols-12 gap-2 bg-white rounded-xl p-3 shadow-sm hover:shadow-md transition-all cursor-pointer border border-gray-100 overflow-visible"
      onClick={() => onAgregar(product)}
    >
      {/* Image - 2 cols */}
      <div className="col-span-2 aspect-square rounded-lg overflow-hidden relative">
        {image ? (
          <img
            src={image}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: `${brandColor}20` }}
          >
            <span className="text-2xl" style={{ color: brandColor }}>
              🍔
            </span>
          </div>
        )}
        {saleBadge && (
          <div className="absolute top-0 left-0 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-br-lg">
            {saleBadge}
          </div>
        )}
      </div>

      {/* Info - 8 cols */}
      <div className="col-span-8 flex flex-col justify-center min-w-0">
        <h4 className="font-bold text-gray-900 text-sm leading-tight truncate" style={{ fontFamily }}>
          {product.name}
        </h4>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
          {product.description || "\u00A0"}
        </p>
      </div>

      {/* Price - 2 cols */}
      <div className="col-span-2 flex flex-col items-end justify-center">
        <span
          className="text-sm font-bold whitespace-nowrap"
          style={{ color: brandColor }}
        >
          ${formatPrice(getPrice(product))}
        </span>
      </div>

      {/* + button overlapping bottom-right */}
      <button
        className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-white shadow-lg hover:scale-110 transition-transform z-10"
        style={{ backgroundColor: brandColor }}
        onClick={(e) => {
          e.stopPropagation();
          onAgregar(product);
        }}
      >
        <span className="text-base leading-none">+</span>
      </button>
    </div>
  );
}
