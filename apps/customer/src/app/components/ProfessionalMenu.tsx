"use client";

import { useState, useEffect, useRef } from "react";
import type { Product, Category, Branding } from "../../types/menu";

type Props = {
  productos: Product[];
  onAgregar: (product: Product) => void;
  branding?: Branding;
};

export default function ProfessionalMenu({
  productos,
  onAgregar,
  branding,
}: Props) {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(
    null,
  );
  const [scrolled, setScrolled] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  const brandColor = branding?.brand_color || "#FF6B35";
  const accentColor = branding?.accent_color || "#1A1A1A";
  const fontFamily =
    branding?.font_family || branding?.font_primary || "CustomFont";

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 100);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Get unique categories from products
  const allCategories = productos.flatMap((p) => p.categories || []);
  const uniqueCategories = allCategories.filter(
    (cat, index, self) => self.findIndex((c) => c.id === cat.id) === index,
  );
  const rootCategories = uniqueCategories.filter((c) => !c.parent_id);

  // Set first category as active
  useEffect(() => {
    if (rootCategories.length > 0 && !activeTab) {
      setActiveTab(rootCategories[0].id); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [rootCategories, activeTab]);

  const currentSubcategories = uniqueCategories.filter(
    (c) => c.parent_id === activeTab,
  );

  // Filter products by category - use Set for deduplication
  const filteredProducts = productos.filter((p) => {
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

  // Get featured products (is_hero or is_featured)
  const heroProduct = uniqueProducts.find((p) => p.is_hero);
  const featuredProducts = uniqueProducts.filter(
    (p) => p.is_featured && !p.is_hero,
  );
  const normalProducts = uniqueProducts.filter(
    (p) => !p.is_featured && !p.is_hero,
  );

  const getPrice = (product: Product) => {
    const variant =
      product.product_variants?.find((v) => v.is_default) ||
      product.product_variants?.[0];
    return variant?.price ?? 0;
  };

  const getImage = (product: Product) => {
    return product.product_variants?.[0]?.image_url;
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("es-AR").format(price);
  };

  const scrollToTab = (tabId: string) => {
    setActiveTab(tabId);
    setActiveSubcategory(null);
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily }}>
      {/* Hero Section */}
      {heroProduct && !activeSubcategory && (
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

      {/* Category Tabs */}
      <div
        ref={tabsRef}
        className={`sticky top-0 z-40 transition-all duration-300 ${
          scrolled ? "shadow-lg" : ""
        }`}
        style={{ backgroundColor: "white" }}
      >
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-2 overflow-x-auto py-4 scrollbar-hide">
            {rootCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => scrollToTab(cat.id)}
                className={`px-5 py-2.5 rounded-full font-semibold whitespace-nowrap transition-all ${
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

          {/* Subcategories */}
          {currentSubcategories.length > 0 && (
            <div className="flex gap-2 pb-3 overflow-x-auto">
              <button
                onClick={() => setActiveSubcategory(null)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
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
                  onClick={() => setActiveSubcategory(sub.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
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

      {/* Featured Products Grid */}
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {featuredProducts.map((product) => (
              <FeaturedCard
                key={product.id}
                product={product}
                onAgregar={onAgregar}
                brandColor={brandColor}
                fontFamily={fontFamily}
                getPrice={getPrice}
                getImage={getImage}
                formatPrice={formatPrice}
              />
            ))}
          </div>
        </div>
      )}

      {/* All Products - Full Width Horizontal List */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <h3
          className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"
          style={{ fontFamily }}
        >
          <span
            className="w-1 h-6 rounded-full"
            style={{ backgroundColor: brandColor }}
          />
          {activeSubcategory
            ? currentSubcategories.find((c) => c.id === activeSubcategory)?.name
            : rootCategories.find((c) => c.id === activeTab)?.name}
        </h3>

        {/* Products as horizontal list */}
        <div className="space-y-3">
          {normalProducts.map((product) => (
            <NormalProductCard
              key={product.id}
              product={product}
              onAgregar={onAgregar}
              brandColor={brandColor}
              fontFamily={fontFamily}
              getPrice={getPrice}
              getImage={getImage}
              formatPrice={formatPrice}
            />
          ))}
        </div>

        {normalProducts.length === 0 && featuredProducts.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <div className="text-6xl mb-4">🍔</div>
            <p>No hay productos en esta categoría</p>
          </div>
        )}
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
}: {
  product: Product;
  onAgregar: (product: Product) => void;
  brandColor: string;
  fontFamily: string;
  getPrice: (p: Product) => number;
  getImage: (p: Product) => string | undefined;
  formatPrice: (p: number) => string;
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
        {product.description && (
          <p className="text-sm text-gray-500 line-clamp-2 mb-3">
            {product.description}
          </p>
        )}
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
}: {
  product: Product;
  onAgregar: (product: Product) => void;
  brandColor: string;
  fontFamily: string;
  getPrice: (p: Product) => number;
  getImage: (p: Product) => string | undefined;
  formatPrice: (p: number) => string;
}) {
  const image = getImage(product);

  return (
    <div
      className="group flex items-center gap-4 bg-white rounded-xl p-3 shadow-sm hover:shadow-md transition-all cursor-pointer border border-gray-100"
      style={{ fontFamily }}
      onClick={() => onAgregar(product)}
    >
      {/* Image - Left */}
      <div className="w-20 h-20 md:w-24 md:h-24 flex-shrink-0 rounded-lg overflow-hidden">
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
            <span className="text-3xl" style={{ color: brandColor }}>
              🍔
            </span>
          </div>
        )}
      </div>

      {/* Info - Center */}
      <div className="flex-1 min-w-0">
        <h4 className="font-bold text-gray-900 mb-1 truncate">
          {product.name}
        </h4>
        {product.description && (
          <p className="text-sm text-gray-500 line-clamp-2 hidden md:block">
            {product.description}
          </p>
        )}
      </div>

      {/* Price and Button - Right */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right">
          <span
            className="text-lg md:text-xl font-bold block"
            style={{ color: brandColor }}
          >
            ${formatPrice(getPrice(product))}
          </span>
          <span className="text-xs text-gray-400 hidden md:inline">
            1 porción
          </span>
        </div>
        <button
          className="w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-white shadow-lg hover:scale-110 transition-transform flex-shrink-0"
          style={{ backgroundColor: brandColor }}
          onClick={(e) => {
            e.stopPropagation();
            onAgregar(product);
          }}
        >
          <span className="text-lg md:text-xl">+</span>
        </button>
      </div>
    </div>
  );
}
