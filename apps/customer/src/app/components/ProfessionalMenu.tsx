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
import { getProductLoyaltyEstimate, type LoyaltyProgram } from "@/lib/loyalty";

type Props = {
  productos: Product[];
  combos?: Combo[];
  onAgregar: (product: Product) => void;
  branding?: Branding;
  disabled?: boolean;
};

type CustomerPromotion = {
  id: string;
  name: string;
  description?: string | null;
  badge?: string | null;
  image_type?: string | null;
  image_url?: string | null;
  promotion_type?: string | null;
  promotion_targets?: Array<{ target_type: string; target_id: string }>;
  promotion_rules?: Array<{
    type?: string | null;
    discount_type?: string | null;
    discount_value?: number | null;
  }>;
};

type PromotionPricing = {
  baseTotal: number;
  finalTotal: number;
  discountAmount: number;
  discountLabel: string;
};

export default function ProfessionalMenu({
  productos,
  combos,
  onAgregar,
  branding,
  disabled = false,
}: Props) {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(
    null,
  );
  const [scrolled, setScrolled] = useState(false);
  const [flashSales, setFlashSales] = useState<any[]>([]);
  const [promotions, setPromotions] = useState<CustomerPromotion[]>([]);
  const [loyalty, setLoyalty] = useState<LoyaltyProgram>({ authenticated: false, rules: [], levels: [] });
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

  // Fetch visible promotions
  useEffect(() => {
    const slug = window.location.pathname.split("/")[1];
    if (!slug) return;
    fetch(`/api/promotions?branchSlug=${slug}`)
      .then((r) => r.json())
      .then((data) => setPromotions(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const slug = window.location.pathname.split("/")[1];
    if (!slug) return;
    fetch(`/api/loyalty?branchSlug=${encodeURIComponent(slug)}`)
      .then((response) => response.json())
      .then((data) => setLoyalty({
        authenticated: Boolean(data.authenticated),
        rules: Array.isArray(data.rules) ? data.rules : [],
        levels: Array.isArray(data.levels) ? data.levels : [],
      }))
      .catch(() => setLoyalty({ authenticated: false, rules: [], levels: [] }));
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
    if (disabled) return;
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

  const getPromotionProducts = (promotion: CustomerPromotion) => {
    const targets = promotion.promotion_targets || [];
    const items = targets
      .filter((target) => target.target_type === "combo" || target.target_type === "product")
      .map((target) =>
        allProductsInMenu.find((item) =>
          target.target_type === "combo"
            ? item.comboId === target.target_id || item.id === target.target_id
            : item.id === target.target_id,
        ),
      )
      .filter(Boolean) as Product[];

    return items.filter((item, index, self) => self.findIndex((p) => p.id === item.id) === index);
  };

  const getPromotionCategoryTarget = (promotion: CustomerPromotion) => {
    const targets = promotion.promotion_targets || [];
    const categoryTarget = targets.find((target) => target.target_type === "category");
    return categoryTarget?.target_id || null;
  };

  const getPromotionImage = (promotion: CustomerPromotion) => {
    if (promotion.image_type === "custom" && promotion.image_url) return promotion.image_url;
    const product = getPromotionProducts(promotion)[0];
    return product ? getImage(product) : undefined;
  };

  const handlePromotionClick = (promotion: CustomerPromotion) => {
    if (disabled) return;
    const promotionProducts = getPromotionProducts(promotion);
    if (promotionProducts.length > 0) {
      handleAddProduct(createPromotionProduct(promotion, promotionProducts));
      return;
    }
    const categoryId = getPromotionCategoryTarget(promotion);
    if (categoryId) {
      scrollToTab(categoryId);
    }
  };

  const getPromotionPricing = (promotion: CustomerPromotion): PromotionPricing => {
    const products = getPromotionProducts(promotion);
    const baseTotal = products.reduce((sum, product) => sum + getPrice(product), 0);
    const rule = promotion.promotion_rules?.[0];
    const discountType = rule?.discount_type || rule?.type;
    const discountValue = Number(rule?.discount_value || 0);
    const percentFromBadge = Number(String(promotion.badge || "").match(/(\d+(?:[.,]\d+)?)\s*%/)?.[1]?.replace(",", ".") || 0);

    let discountAmount = 0;
    let discountLabel = promotion.badge || "PROMO";

    if (discountType === "percentage" && discountValue > 0) {
      discountAmount = baseTotal * (discountValue / 100);
      discountLabel = `${discountValue}% OFF`;
    } else if (discountType === "fixed" && discountValue > 0) {
      discountAmount = discountValue;
      discountLabel = `${formatPrice(discountValue)} OFF`;
    } else if (discountType === "free_shipping") {
      discountLabel = "ENVIO GRATIS";
    } else if (percentFromBadge > 0) {
      discountAmount = baseTotal * (percentFromBadge / 100);
      discountLabel = `${percentFromBadge}% OFF`;
    }

    discountAmount = Math.min(baseTotal, Math.max(0, Math.round(discountAmount)));

    return {
      baseTotal,
      finalTotal: Math.max(0, baseTotal - discountAmount),
      discountAmount,
      discountLabel,
    };
  };

  const createPromotionProduct = (promotion: CustomerPromotion, products: Product[]): Product => {
    const pricing = getPromotionPricing(promotion);
    const categories = products.flatMap((product) => product.categories || []);
    const image = getPromotionImage(promotion);

    return {
      id: `promotion-${promotion.id}`,
      itemType: "promotion",
      name: promotion.name,
      description: promotion.description || products.map((product) => product.name).join(" + "),
      allow_half: false,
      is_hero: false,
      is_featured: false,
      is_suggestable: false,
      show_in_menu: true,
      categories,
      product_variants: [
        {
          id: `promotion-${promotion.id}-variant`,
          name: "Promo",
          price: pricing.finalTotal,
          is_default: true,
          image_url: image,
        },
      ],
      modifier_group_products: [],
      product_ingredients_display: [],
      product_extras: [],
      promotion: {
        id: promotion.id,
        name: promotion.name,
        badge: pricing.discountLabel,
        originalPrice: pricing.baseTotal,
        discountAmount: pricing.discountAmount,
        finalPrice: pricing.finalTotal,
        items: products.map((product) => ({
          id: product.comboId || product.id,
          name: product.name,
          itemType: product.itemType === "combo" ? "combo" : "product",
          price: getPrice(product),
        })),
      },
    };
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
                  onClick={() => handleAddProduct(heroProduct)}
                  disabled={disabled}
                  className="px-6 py-3 rounded-full font-bold text-white shadow-lg transition-transform enabled:hover:scale-105 disabled:cursor-not-allowed disabled:opacity-70"
                  style={{ backgroundColor: disabled ? "#6b7280" : brandColor }}
                >
                  <span className="flex items-center gap-2">
                    <span>{disabled ? "Cerrado" : "Agregar"}</span>
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
          <div key={sale.id} className="bg-gradient-to-r from-red-100 to-red-500 text-white px-4 py-3">
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

      {/* Promotions */}
      {promotions.length > 0 && !activeSubcategory && (
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h3
            className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"
            style={{ fontFamily }}
          >
            <span
              className="w-1 h-6 rounded-full"
              style={{ backgroundColor: brandColor }}
            />
            Promociones
          </h3>
          <div className="flex md:hidden gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 px-4 pb-2">
            {promotions.map((promotion) => (
              <div key={promotion.id} className="snap-start flex-shrink-0 w-[65vw] max-w-[280px]">
                <PromotionCard
                  promotion={promotion}
                  brandColor={brandColor}
                  fontFamily={fontFamily}
                  image={getPromotionImage(promotion)}
                  pricing={getPromotionPricing(promotion)}
                  onClick={() => handlePromotionClick(promotion)}
                  disabled={disabled}
                />
              </div>
            ))}
          </div>
          <div className="hidden md:grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {promotions.map((promotion) => (
              <PromotionCard
                key={promotion.id}
                promotion={promotion}
                brandColor={brandColor}
                fontFamily={fontFamily}
                image={getPromotionImage(promotion)}
                pricing={getPromotionPricing(promotion)}
                onClick={() => handlePromotionClick(promotion)}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      )}



      {/* Featured Products Grid / Carousel */}
      {/* {featuredProducts.length > 0 && !activeSubcategory && (
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
                  disabled={disabled}
                />
              </div>
            ))}
          </div>
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
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      )} */}

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
                          <div className="space-y-3">{subProducts.map((product) => (<NormalProductCard key={product.id} product={product} onAgregar={handleAddProduct} brandColor={brandColor} fontFamily={fontFamily} getPrice={getPrice} getImage={getImage} formatPrice={formatPrice} saleBadge={getProductSaleBadge(product)} loyalty={loyalty} disabled={disabled} />))}</div>
                        </div>
                      );
                    }) : (
                      <div className="space-y-3 ml-4">{rootProducts.map((product) => (<NormalProductCard key={product.id} product={product} onAgregar={handleAddProduct} brandColor={brandColor} fontFamily={fontFamily} getPrice={getPrice} getImage={getImage} formatPrice={formatPrice} saleBadge={getProductSaleBadge(product)} loyalty={loyalty} disabled={disabled} />))}</div>
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
                    <div className="space-y-3">{subProducts.map((product) => (<NormalProductCard key={product.id} product={product} onAgregar={handleAddProduct} brandColor={brandColor} fontFamily={fontFamily} getPrice={getPrice} getImage={getImage} formatPrice={formatPrice} saleBadge={getProductSaleBadge(product)} loyalty={loyalty} disabled={disabled} />))}</div>
                  </div>
                );
              });
            }
            return normalProducts.map((product) => (<NormalProductCard key={product.id} product={product} onAgregar={handleAddProduct} brandColor={brandColor} fontFamily={fontFamily} getPrice={getPrice} getImage={getImage} formatPrice={formatPrice} saleBadge={getProductSaleBadge(product)} loyalty={loyalty} disabled={disabled} />));
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

function PromotionCard({
  promotion,
  brandColor,
  fontFamily,
  image,
  pricing,
  onClick,
  disabled = false,
}: {
  promotion: CustomerPromotion;
  brandColor: string;
  fontFamily: string;
  image?: string;
  pricing: PromotionPricing;
  onClick: () => void;
  disabled?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`group relative bg-white rounded-2xl overflow-hidden shadow-sm transition-all duration-300 ring-2 ring-offset-2 ${
        disabled ? "cursor-not-allowed opacity-75 grayscale-[0.25]" : "cursor-pointer hover:shadow-xl"
      }`}
      style={{ fontFamily }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        if (!disabled) onClick();
      }}
    >
      <div className="relative h-36 md:h-44 overflow-hidden">
        {image ? (
          <img
            src={image}
            alt={promotion.name}
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
              %
            </span>
          </div>
        )}

        <div
          className="absolute top-2 left-2 px-3 py-1.5 rounded-full text-xs font-black text-white shadow-lg"
          style={{ backgroundColor: "#ef4444" }}
        >
          {pricing.discountLabel}
        </div>

        <button
          disabled={disabled}
          className="absolute bottom-2 right-2 px-3 h-10 rounded-full flex items-center justify-center text-white shadow-lg text-xs font-bold transition-transform enabled:hover:scale-105 disabled:cursor-not-allowed disabled:opacity-80"
          style={{ backgroundColor: disabled ? "#6b7280" : brandColor }}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) onClick();
          }}
        >
          {disabled ? "Cerrado" : "Agregar"}
        </button>
      </div>

      <div className="p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-1" style={{ color: brandColor }}>
          Promo especial
        </p>
        <h4 className="font-bold text-gray-900 mb-1 line-clamp-2">
          {promotion.name}
        </h4>
        <p className="text-sm text-gray-500 line-clamp-2 mb-3">
          {promotion.description || "\u00A0"}
        </p>
        <div className="flex items-center justify-between">
          <div>
            {pricing.baseTotal > pricing.finalTotal && (
              <span className="block text-xs font-bold text-gray-400 line-through">
                ${formatPriceLocal(pricing.baseTotal)}
              </span>
            )}
            <span className="text-xl font-black" style={{ color: brandColor }}>
              ${formatPriceLocal(pricing.finalTotal || pricing.baseTotal)}
            </span>
          </div>
          {pricing.discountAmount > 0 && (
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">
              Ahorras ${formatPriceLocal(pricing.discountAmount)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function formatPriceLocal(price: number) {
  return new Intl.NumberFormat("es-AR").format(Math.round(price || 0));
}

function PromotionProductsModal({
  promotion,
  products,
  brandColor,
  fontFamily,
  getPrice,
  getImage,
  formatPrice,
  pricing,
  disabled,
  onClose,
  onSelect,
}: {
  promotion: CustomerPromotion;
  products: Product[];
  brandColor: string;
  fontFamily: string;
  getPrice: (p: Product) => number;
  getImage: (p: Product) => string | undefined;
  formatPrice: (p: number) => string;
  pricing: PromotionPricing;
  disabled: boolean;
  onClose: () => void;
  onSelect: (product: Product) => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 px-4 pb-4 pt-10 backdrop-blur-sm md:items-center md:pb-10">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl" style={{ fontFamily }}>
        <div className="relative px-5 pb-4 pt-5 text-white" style={{ backgroundColor: brandColor }}>
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/18 text-lg font-bold text-white"
            aria-label="Cerrar promocion"
          >
            x
          </button>
          <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-black text-gray-950">
            {promotion.badge || "PROMO"}
          </span>
          <h3 className="mt-3 pr-10 text-2xl font-black leading-tight">{promotion.name}</h3>
          {promotion.description && (
            <p className="mt-2 pr-8 text-sm font-medium text-white/82">{promotion.description}</p>
          )}
          <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-gray-950">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">Precio promo</p>
                {pricing.baseTotal > pricing.finalTotal && (
                  <p className="mt-1 text-sm font-bold text-gray-400 line-through">
                    ${formatPrice(pricing.baseTotal)}
                  </p>
                )}
                <p className="text-3xl font-black" style={{ color: brandColor }}>
                  ${formatPrice(pricing.finalTotal || pricing.baseTotal)}
                </p>
              </div>
              <div className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-black text-white">
                {pricing.discountLabel}
              </div>
            </div>
          </div>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-4">
          <p className="mb-3 text-sm font-bold text-gray-700">Elegí qué querés agregar</p>
          <div className="space-y-3">
            {products.map((product) => {
              const image = getImage(product);
              return (
                <button
                  key={product.id}
                  onClick={() => !disabled && onSelect(product)}
                  disabled={disabled}
                  className="grid w-full grid-cols-[72px_1fr_auto] items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 text-left shadow-sm transition enabled:hover:bg-white enabled:hover:shadow-md disabled:opacity-60"
                >
                  <div className="h-[72px] w-[72px] overflow-hidden rounded-xl" style={{ backgroundColor: `${brandColor}18` }}>
                    {image ? (
                      <img src={image} alt={product.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl" style={{ color: brandColor }}>
                        %
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-black text-gray-950">{product.name}</p>
                    {product.description && (
                      <p className="mt-1 line-clamp-1 text-xs text-gray-500">{product.description}</p>
                    )}
                    <p className="mt-2 text-sm font-black" style={{ color: brandColor }}>
                      ${formatPrice(getPrice(product))}
                    </p>
                  </div>
                  <span className="rounded-full px-3 py-2 text-xs font-black text-white" style={{ backgroundColor: disabled ? "#6b7280" : brandColor }}>
                    {disabled ? "Cerrado" : "Agregar"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
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
  disabled = false,
}: {
  product: Product;
  onAgregar: (product: Product) => void;
  brandColor: string;
  fontFamily: string;
  getPrice: (p: Product) => number;
  getImage: (p: Product) => string | undefined;
  formatPrice: (p: number) => string;
  saleBadge?: string | null;
  disabled?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`group relative bg-white rounded-2xl overflow-hidden shadow-sm transition-all duration-300 ring-2 ring-offset-2 ${
        disabled ? "cursor-not-allowed opacity-75 grayscale-[0.25]" : "cursor-pointer hover:shadow-xl"
      }`}
      style={{ fontFamily }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => {
        if (!disabled) onAgregar(product);
      }}
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
          disabled={disabled}
          className="absolute bottom-2 right-2 w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg transition-transform enabled:hover:scale-110 disabled:cursor-not-allowed disabled:opacity-80"
          style={{ backgroundColor: disabled ? "#6b7280" : brandColor }}
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) onAgregar(product);
          }}
        >
          <span className="text-xl">{disabled ? "x" : "+"}</span>
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
  loyalty,
  disabled = false,
}: {
  product: Product;
  onAgregar: (product: Product) => void;
  brandColor: string;
  fontFamily: string;
  getPrice: (p: Product) => number;
  getImage: (p: Product) => string | undefined;
  formatPrice: (p: number) => string;
  saleBadge?: string | null;
  loyalty?: LoyaltyProgram;
  disabled?: boolean;
}) {
  const image = getImage(product);
  const loyaltyEstimate = loyalty?.authenticated ? getProductLoyaltyEstimate(product, loyalty.rules) : { points: 0, extrasHint: false, extrasPointsPerExtra: 0 };

  return (
    <div
      className={`relative grid grid-cols-12 gap-2 bg-white rounded-xl p-3 shadow-sm transition-all border border-gray-100 overflow-visible ${
        disabled ? "cursor-not-allowed opacity-75 grayscale-[0.2]" : "cursor-pointer hover:shadow-md"
      }`}
      onClick={() => {
        if (!disabled) onAgregar(product);
      }}
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
        {loyalty?.authenticated && (loyaltyEstimate.points > 0 || loyaltyEstimate.extrasPointsPerExtra > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {loyaltyEstimate.points > 0 && (
              <span className="inline-flex w-fit items-center rounded-full bg-red-50 px-2 py-1 text-[10px] font-black uppercase text-red-600">
                +{loyaltyEstimate.points} pts
              </span>
            )}
            {loyaltyEstimate.extrasPointsPerExtra > 0 && (
              <span className="inline-flex w-fit items-center rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase text-gray-500">
                extras +{loyaltyEstimate.extrasPointsPerExtra} pts
              </span>
            )}
          </div>
        )}
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
        disabled={disabled}
        className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-white shadow-lg transition-transform z-10 enabled:hover:scale-110 disabled:cursor-not-allowed disabled:opacity-80"
        style={{ backgroundColor: disabled ? "#6b7280" : brandColor }}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onAgregar(product);
        }}
      >
        <span className="text-base leading-none">{disabled ? "x" : "+"}</span>
      </button>
    </div>
  );
}
