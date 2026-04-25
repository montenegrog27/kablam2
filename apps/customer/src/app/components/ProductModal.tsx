"use client";

import { useState, useId } from "react";
import { X, Minus } from "lucide-react";
import type {
  ProductModalProps,
  ProductVariant,
  Modifier,
  ModifierGroup,
  IngredientDisplay,
  ProductExtra,
} from "../../types/menu";

function getDefaultVariant(product: NonNullable<ProductModalProps["product"]>) {
  return (
    product.product_variants?.find((v) => v.is_default) ||
    product.product_variants?.[0] ||
    null
  );
}

export default function ProductModal({
  open,
  product,
  onClose,
  onAddToCart,
  branding,
}: ProductModalProps) {
  const uid = useId();
  const [variant, setVariant] = useState<ProductVariant | null>(null);
  const [selectedExtras, setSelectedExtras] = useState<
    Record<string, string[]>
  >({});
  const [removedIngredients, setRemovedIngredients] = useState<string[]>([]);
  const [halves, setHalves] = useState<{
    first: string;
    second: string;
  } | null>(null);
  const [currentProductId, setCurrentProductId] = useState<string | null>(null);
  const fontFamily =
    branding?.font_family || branding?.font_primary || "CustomFont";
  const primaryColor =
    branding?.primary_color || branding?.brand_color || "#000000";
  const _accentColor =
    branding?.accent_color || branding?.secondary_color || "#666666";

  if (!open || !product) return null;

  if (product.id !== currentProductId) {
    setCurrentProductId(product.id);
    setVariant(getDefaultVariant(product));
    setSelectedExtras({});
    setRemovedIngredients([]);
    setHalves(product.allow_half ? { first: "", second: "" } : null);
  }

  const modifierGroups: ModifierGroup[] =
    product.modifier_group_products?.map((mgp) => ({
      id: mgp.modifier_groups.id,
      name: mgp.modifier_groups.name,
      modifiers: mgp.modifier_groups.modifiers || [],
    })) || [];

  const allVisibleIngredients: IngredientDisplay[] =
    product.product_ingredients_display?.filter((pi) => pi.is_visible) || [];

  // Separar ingredientes esenciales (no se pueden quitar) y removibles
  const essentialIngredients = allVisibleIngredients.filter(
    (ing) => ing.is_essential,
  );
  const removableIngredients = allVisibleIngredients.filter(
    (ing) => !ing.is_essential,
  );

  const extras: ProductExtra[] =
    product.product_extras?.filter((ex) => ex.is_active) || [];

  const toggleModifier = (groupId: string, modifierId: string) => {
    setSelectedExtras((prev) => {
      const group = prev[groupId] || [];
      if (group.includes(modifierId)) {
        return { ...prev, [groupId]: group.filter((id) => id !== modifierId) };
      }
      return { ...prev, [groupId]: [...group, modifierId] };
    });
  };

  const toggleExtra = (extraId: string) => {
    setSelectedExtras((prev) => {
      const group = prev["extras"] || [];
      if (group.includes(extraId)) {
        return { ...prev, extras: group.filter((id) => id !== extraId) };
      }
      return { ...prev, extras: [...group, extraId] };
    });
  };

  const toggleIngredient = (ingredientId: string) => {
    // Verificar si el ingrediente es esencial (no se puede quitar)
    const ingredient = allVisibleIngredients.find(
      (ing) => ing.ingredient_id === ingredientId,
    );
    if (ingredient?.is_essential) return;

    setRemovedIngredients((prev) => {
      if (prev.includes(ingredientId)) {
        return prev.filter((id) => id !== ingredientId);
      }
      return [...prev, ingredientId];
    });
  };

  const getAllSelectedModifiers = (): Modifier[] => {
    const all: Modifier[] = [];
    modifierGroups.forEach((group) => {
      const selectedIds = selectedExtras[group.id] || [];
      selectedIds.forEach((id) => {
        const mod = group.modifiers.find((m) => m.id === id);
        if (mod) all.push(mod);
      });
    });
    return all;
  };

  const getAllSelectedExtras = (): ProductExtra[] => {
    const selectedIds = selectedExtras["extras"] || [];
    return extras.filter((ex) => selectedIds.includes(ex.id));
  };

  const modifiersTotal = getAllSelectedModifiers().reduce(
    (sum, e) => sum + e.price,
    0,
  );

  const extrasTotal = getAllSelectedExtras().reduce((sum, ex) => {
    const price =
      ex.ingredients?.sale_price || ex.ingredients?.cost_per_unit || 0;
    return sum + price;
  }, 0);

  const total = (variant?.price || 0) + modifiersTotal + extrasTotal;
  const image =
    variant?.image_url || product.product_variants?.[0]?.image_url || null;

  const handleAddToCart = () => {
    if (!variant) return;
    console.log(
      "ProductModal: Adding to cart, product categories:",
      product.categories,
    );
    onAddToCart({
      uid: `${variant.id}-${uid}`,
      variantId: variant.id,
      productId: product.id,
      name: product.name,
      price: total,
      quantity: 1,
      variant,
      extras: getAllSelectedModifiers(),
      allowHalf: product.allow_half,
      halves: halves || undefined,
      removedIngredients:
        removedIngredients.length > 0 ? removedIngredients : undefined,
      categories: product.categories,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 duration-300 sm:scale-100"
        style={{ fontFamily }}
      >
        <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{product.name}</h2>
            {product.description && (
              <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                {product.description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors duration-200"
          >
            <X size={20} className="text-gray-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-24">
          {image && (
            <div className="relative overflow-hidden rounded-xl shadow-lg">
              <img
                src={image}
                alt={product.name}
                className="w-full h-56 object-cover"
              />
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/20 to-transparent"></div>
            </div>
          )}

          {product.product_variants?.length > 1 && !product.allow_half && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-gray-700">Elegir variante</p>
                <span className="text-xs text-gray-500">
                  {product.product_variants.length} opciones
                </span>
              </div>
              <div className="grid gap-2">
                {product.product_variants.map((v) => {
                  const isSelected = variant?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setVariant(v)}
                      className={`w-full flex justify-between items-center border-2 rounded-xl p-4 transition-all duration-200 ${
                        isSelected
                          ? `border-[${primaryColor}] bg-[${primaryColor}]/5`
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                      style={isSelected ? { borderColor: primaryColor } : {}}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            isSelected
                              ? `border-[${primaryColor}] bg-[${primaryColor}]`
                              : "border-gray-300"
                          }`}
                          style={
                            isSelected
                              ? {
                                  borderColor: primaryColor,
                                  backgroundColor: primaryColor,
                                }
                              : {}
                          }
                        >
                          {isSelected && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                          )}
                        </div>
                        <span
                          className={`font-medium ${
                            isSelected ? "text-gray-900" : "text-gray-700"
                          }`}
                        >
                          {v.name}
                        </span>
                      </div>
                      <span
                        className={`font-bold ${
                          isSelected ? "text-gray-900" : "text-gray-600"
                        }`}
                      >
                        ${v.price}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {product.allow_half && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-gray-700">
                  Armá tu pizza por mitades
                </p>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                  2 selecciones
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    <p className="text-sm font-medium text-gray-700">
                      Primera mitad
                    </p>
                  </div>
                  <select
                    value={halves?.first || ""}
                    onChange={(e) =>
                      setHalves((prev) =>
                        prev ? { ...prev, first: e.target.value } : null,
                      )
                    }
                    className="w-full border-2 border-gray-200 rounded-xl p-3 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-colors duration-200"
                  >
                    <option value="" disabled className="text-gray-400">
                      Seleccionar variante
                    </option>
                    {product.product_variants?.map((v) => (
                      <option key={v.id} value={v.id} className="text-gray-800">
                        {v.name} (+${v.price})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <p className="text-sm font-medium text-gray-700">
                      Segunda mitad
                    </p>
                  </div>
                  <select
                    value={halves?.second || ""}
                    onChange={(e) =>
                      setHalves((prev) =>
                        prev ? { ...prev, second: e.target.value } : null,
                      )
                    }
                    className="w-full border-2 border-gray-200 rounded-xl p-3 bg-white focus:border-green-500 focus:ring-2 focus:ring-green-200 transition-colors duration-200"
                  >
                    <option value="" disabled className="text-gray-400">
                      Seleccionar variante
                    </option>
                    {product.product_variants?.map((v) => (
                      <option key={v.id} value={v.id} className="text-gray-800">
                        {v.name} (+${v.price})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">
                    Precio base por mitad:
                  </span>
                  <span className="font-bold text-gray-900">
                    ${variant?.price || 0}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  El precio total será la suma de ambas mitades seleccionadas.
                </p>
              </div>
            </div>
          )}

          {/* Sección de ingredientes personalizables (se pueden quitar) - Tags "sin [ingrediente]" */}
          {removableIngredients.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-gray-700">
                  Quitar ingredientes
                </p>
                <span className="text-xs text-gray-500">
                  {removableIngredients.length} opciones
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {removableIngredients.map((ing) => {
                  const isRemoved = removedIngredients.includes(
                    ing.ingredient_id,
                  );
                  return (
                    <button
                      key={ing.id}
                      onClick={() => toggleIngredient(ing.ingredient_id)}
                      className={`px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 border ${
                        isRemoved
                          ? "bg-red-100 border-red-300 text-red-700 line-through opacity-60"
                          : "bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      sin {ing.ingredients?.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sección de extras - Tags "extra [ingrediente]" */}
          {extras.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-gray-700">Agregar extras</p>
                <span className="text-xs text-gray-500">
                  {extras.length} opciones
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {extras.map((extra) => {
                  const isSelected = selectedExtras["extras"]?.includes(
                    extra.id,
                  );
                  const price =
                    extra.ingredients?.sale_price ||
                    extra.ingredients?.cost_per_unit ||
                    0;
                  return (
                    <button
                      key={extra.id}
                      onClick={() => toggleExtra(extra.id)}
                      className={`px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 border ${
                        isSelected
                          ? "border-2 text-white"
                          : "bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200"
                      }`}
                      style={
                        isSelected
                          ? {
                              borderColor: primaryColor,
                              backgroundColor: primaryColor,
                            }
                          : {}
                      }
                    >
                      extra {extra.ingredients?.name} +${price}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {modifierGroups.map((group) => {
            const selectedCount = selectedExtras[group.id]?.length || 0;
            return (
              <div key={group.id} className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-gray-700">{group.name}</p>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    {selectedCount} de {group.modifiers.length} seleccionados
                  </span>
                </div>
                <div className="grid gap-2">
                  {group.modifiers.map((modifier) => {
                    const isSelected = selectedExtras[group.id]?.includes(
                      modifier.id,
                    );
                    return (
                      <button
                        key={modifier.id}
                        onClick={() => toggleModifier(group.id, modifier.id)}
                        className={`w-full flex justify-between items-center border-2 rounded-xl p-4 transition-all duration-200 ${
                          isSelected
                            ? `border-[${primaryColor}] bg-[${primaryColor}]/5`
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                        style={isSelected ? { borderColor: primaryColor } : {}}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                              isSelected
                                ? `border-[${primaryColor}] bg-[${primaryColor}]`
                                : "border-gray-300"
                            }`}
                            style={
                              isSelected
                                ? {
                                    borderColor: primaryColor,
                                    backgroundColor: primaryColor,
                                  }
                                : {}
                            }
                          >
                            {isSelected && (
                              <div className="w-2 h-2 rounded-full bg-white"></div>
                            )}
                          </div>
                          <div className="text-left">
                            <span
                              className={`font-medium ${
                                isSelected ? "text-gray-900" : "text-gray-700"
                              }`}
                            >
                              {modifier.name}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`font-bold ${
                            isSelected ? "text-gray-900" : "text-gray-600"
                          }`}
                        >
                          +${modifier.price}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="sticky bottom-0 border-t border-gray-200 bg-white p-6 space-y-4 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
          {/* Desglose de precios */}
          {(modifiersTotal > 0 || extrasTotal > 0) && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Precio base</span>
                <span>${variant?.price || 0}</span>
              </div>
              {modifiersTotal > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Modificadores</span>
                  <span>+${modifiersTotal}</span>
                </div>
              )}
              {extrasTotal > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>Extras</span>
                  <span>+${extrasTotal}</span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-2"></div>
            </div>
          )}

          {/* Total */}
          <div className="flex justify-between items-center">
            <div>
              <p className="font-bold text-lg text-gray-900">Total</p>
              <p className="text-xs text-gray-500">IVA incluido</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-2xl text-gray-900">${total}</p>
              {variant && (
                <p className="text-xs text-gray-500">
                  {product.allow_half ? "Precio por mitad" : "Precio unitario"}
                </p>
              )}
            </div>
          </div>

          {/* Botón agregar */}
          <button
            onClick={handleAddToCart}
            className="w-full py-4 rounded-xl font-bold text-white transition-all duration-200 hover:shadow-lg active:scale-[0.98]"
            style={{ backgroundColor: primaryColor }}
          >
            Agregar al carrito • ${total}
          </button>

        </div>
      </div>
    </div>
  );
}
