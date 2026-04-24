"use client";

import { useEffect, useState, useMemo } from "react";
import { Plus, Minus, Trash2 } from "lucide-react";
import type { CartItem, Product, Branding } from "../../types/menu";
import { getUpsellSuggestions } from "../../lib/upsell";

type UpsellSuggestionsProps = {
  branchSlug: string;
  cartItems: CartItem[];
  onAddSuggestion: (item: CartItem) => void;
  onUpdateCart: (cart: CartItem[]) => void;
  branding?: Branding;
};

type Suggestion = {
  product: Product;
  discount: number;
  reason: string;
};

export default function UpsellSuggestions({
  branchSlug,
  cartItems,
  onAddSuggestion,
  onUpdateCart,
  branding,
}: UpsellSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fontFamily =
    branding?.font_family || branding?.font_primary || "inherit";
  const primaryColor = branding?.primary_color || "#000000";

  useEffect(() => {
    async function loadSuggestions() {
      console.log(
        "UpsellSuggestions: cartItems received:",
        cartItems.length,
        "items",
      );
      console.log(
        "UpsellSuggestions: cartItems details:",
        JSON.stringify(cartItems, null, 2),
      );

      if (cartItems.length === 0) {
        setSuggestions([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const suggestionsData = await getUpsellSuggestions(
          branchSlug,
          cartItems,
        );
        setSuggestions(suggestionsData);
      } catch (err: unknown) {
        console.error("Error loading upsell suggestions:", err);
        setError("No pudimos cargar sugerencias en este momento.");
      } finally {
        setLoading(false);
      }
    }

    // Cargar sugerencias después de un pequeño delay para evitar llamadas excesivas
    const timer = setTimeout(loadSuggestions, 300);
    return () => clearTimeout(timer);
  }, [branchSlug, cartItems]);

  // Encontrar items en el carrito que corresponden a sugerencias
  const findCartItemForSuggestion = useMemo(() => {
    return (suggestion: Suggestion): CartItem | undefined => {
      const product = suggestion.product;
      const variant =
        product.product_variants?.find((v) => v.is_default) ||
        product.product_variants?.[0];

      if (!variant) return undefined;

      // Buscar item en el carrito con la misma variante y sin extras
      return cartItems.find(
        (item) =>
          item.variantId === variant.id &&
          item.extras.length === 0 &&
          item.removedIngredients?.length === 0,
      );
    };
  }, [cartItems]);

  const handleAddProduct = (suggestion: Suggestion) => {
    const product = suggestion.product;
    const variant =
      product.product_variants?.find((v) => v.is_default) ||
      product.product_variants?.[0];

    if (!variant) {
      console.error("No variant found for product", product.id);
      return;
    }

    // Verificar si ya está en el carrito
    const existingItem = findCartItemForSuggestion(suggestion);

    if (existingItem) {
      // Incrementar cantidad
      const updatedCart = cartItems.map((item) =>
        item.uid === existingItem.uid
          ? { ...item, quantity: item.quantity + 1 }
          : item,
      );
      onUpdateCart(updatedCart);
    } else {
      // Agregar nuevo item
      const cartItem: CartItem = {
        uid: `${variant.id}-${Date.now()}`,
        variantId: variant.id,
        productId: product.id,
        name: product.name,
        price: Math.max(
          Math.round((variant.price * (100 - suggestion.discount)) / 100),
          0,
        ),
        quantity: 1,
        variant,
        extras: [], // Sin extras por defecto
        allowHalf: product.allow_half,
        categories: product.categories,
      };
      onAddSuggestion(cartItem);
    }
  };

  const handleRemoveProduct = (suggestion: Suggestion) => {
    const product = suggestion.product;
    const variant =
      product.product_variants?.find((v) => v.is_default) ||
      product.product_variants?.[0];

    if (!variant) {
      console.error("No variant found for product", product.id);
      return;
    }

    const existingItem = findCartItemForSuggestion(suggestion);

    if (existingItem) {
      if (existingItem.quantity > 1) {
        // Decrementar cantidad
        const updatedCart = cartItems.map((item) =>
          item.uid === existingItem.uid
            ? { ...item, quantity: item.quantity - 1 }
            : item,
        );
        onUpdateCart(updatedCart);
      } else {
        // Eliminar item completamente
        const updatedCart = cartItems.filter(
          (item) => item.uid !== existingItem.uid,
        );
        onUpdateCart(updatedCart);
      }
    }
  };

  if (loading && suggestions.length === 0) {
    return (
      <div className="mt-6 border-t pt-6">
        <h3
          className="font-semibold text-gray-700 mb-3 text-sm"
          style={{ fontFamily }}
        >
          Cargando sugerencias...
        </h3>
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-2 border border-gray-200 rounded-lg animate-pulse bg-white"
            >
              <div className="w-10 h-10 bg-gray-200 rounded-md"></div>
              <div className="flex-1 flex items-center justify-between gap-2">
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-2/3 mb-1"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                </div>
                <div className="w-12 h-6 bg-gray-200 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 border-t pt-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700">
          {error}
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return null; // No mostrar nada si no hay sugerencias
  }

  return (
    <div className="mt-6 border-t pt-6">
      <div className="mb-3">
        <h3
          className="font-semibold text-gray-900 mb-1 text-sm"
          style={{ fontFamily }}
        >
          También te puede interesar
        </h3>
        <p className="text-xs text-gray-500">Agregá sugerencias a tu pedido</p>
      </div>

      <div className="space-y-2">
        {suggestions.map((suggestion, index) => {
          const product = suggestion.product;
          const variant =
            product.product_variants?.find((v) => v.is_default) ||
            product.product_variants?.[0];
          const originalPrice = variant?.price || 0;
          const discountedPrice = Math.max(
            Math.round((originalPrice * (100 - suggestion.discount)) / 100),
            0,
          );
          const hasDiscount = suggestion.discount > 0;
          const imageUrl =
            variant?.image_url || product.product_variants?.[0]?.image_url;

          const existingItem = findCartItemForSuggestion(suggestion);
          const itemQuantity = existingItem?.quantity || 0;

          return (
            <div
              key={`${product.id}-${index}`}
              className="flex items-center gap-3 p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-150 bg-white group"
            >
              {/* Mini imagen */}
              <div className="flex-shrink-0">
                {imageUrl ? (
                  <div className="relative w-10 h-10 rounded-md overflow-hidden">
                    <img
                      src={imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                    {hasDiscount && (
                      <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        -{suggestion.discount}%
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center">
                    <span className="text-xs text-gray-400">🛒</span>
                  </div>
                )}
              </div>

              {/* Título y precio */}
              <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4
                      className="font-medium text-gray-900 line-clamp-1 text-sm"
                      style={{ fontFamily }}
                    >
                      {product.name}
                    </h4>
                    {suggestion.reason === "Producto complementario" && (
                      <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                        Complemento
                      </span>
                    )}
                    {suggestion.reason === "Solo sugerido" && (
                      <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                        Sugerido
                      </span>
                    )}
                  </div>
                  {product.description && (
                    <p
                      className="text-xs text-gray-500 line-clamp-1"
                      style={{ fontFamily }}
                    >
                      {product.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  {/* Precio */}
                  <div className="text-right">
                    <div
                      className="font-semibold text-gray-900 text-sm"
                      style={{ fontFamily }}
                    >
                      ${discountedPrice}
                    </div>
                    {hasDiscount &&
                      suggestion.reason !== "Producto complementario" && (
                        <div
                          className="text-xs text-gray-500 line-through"
                          style={{ fontFamily }}
                        >
                          ${originalPrice}
                        </div>
                      )}
                  </div>

                  {/* Controles de cantidad */}
                  {itemQuantity > 0 ? (
                    <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
                      <button
                        onClick={() => handleRemoveProduct(suggestion)}
                        className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-red-600 transition-colors"
                        title="Quitar uno"
                      >
                        {itemQuantity > 1 ? (
                          <Minus size={12} />
                        ) : (
                          <Trash2 size={12} />
                        )}
                      </button>
                      <span className="text-sm font-medium min-w-[20px] text-center">
                        {itemQuantity}
                      </span>
                      <button
                        onClick={() => handleAddProduct(suggestion)}
                        className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-green-600 transition-colors"
                        title="Agregar uno más"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleAddProduct(suggestion)}
                      className="flex items-center justify-center w-8 h-8 rounded-md font-medium text-white transition-colors duration-200 hover:shadow-sm opacity-70 group-hover:opacity-100 flex-shrink-0"
                      style={{ backgroundColor: primaryColor }}
                      title="Agregar al pedido"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 mt-3" style={{ fontFamily }}>
        Los productos se agregarán directamente a tu pedido
      </p>
    </div>
  );
}
