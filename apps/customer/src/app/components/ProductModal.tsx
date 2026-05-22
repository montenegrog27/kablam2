"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Check, Minus, Plus, X } from "lucide-react";
import type {
  IngredientDisplay,
  Modifier,
  ModifierGroup,
  ProductExtra,
  ProductModalProps,
  ProductVariant,
} from "../../types/menu";
import { getBrandFontFamily } from "@/lib/fonts";

function getDefaultVariant(product: NonNullable<ProductModalProps["product"]>) {
  return (
    product.product_variants?.find((variant) => variant.is_default) ||
    product.product_variants?.[0] ||
    null
  );
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("es-AR").format(Math.round(value || 0));
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
  const [quantity, setQuantity] = useState(1);
  const [selectedExtras, setSelectedExtras] = useState<Record<string, string[]>>({});
  const [removedIngredients, setRemovedIngredients] = useState<Array<{ id: string; name: string }>>([]);
  const [halves, setHalves] = useState<{ first: string; second: string } | null>(null);

  const fontFamily = getBrandFontFamily(branding);
  const primaryColor = branding?.primary_color || branding?.brand_color || "#111827";

  useEffect(() => {
    if (!open || !product) return;
    setVariant(getDefaultVariant(product));
    setQuantity(1);
    setSelectedExtras({});
    setRemovedIngredients([]);
    setHalves(product.allow_half ? { first: "", second: "" } : null);
  }, [open, product]);

  const isCombo = product?.itemType === "combo";

  const modifierGroups: ModifierGroup[] = useMemo(
    () =>
      product?.modifier_group_products?.map((item) => ({
        id: item.modifier_groups.id,
        name: item.modifier_groups.name,
        modifiers: item.modifier_groups.modifiers || [],
      })) || [],
    [product],
  );

  const allVisibleIngredients: IngredientDisplay[] = useMemo(
    () => product?.product_ingredients_display?.filter((item) => item.is_visible) || [],
    [product],
  );

  const removableIngredients = allVisibleIngredients.filter((item) => !item.is_essential);
  const extras: ProductExtra[] = product?.product_extras?.filter((extra) => extra.is_active) || [];

  if (!open || !product) return null;

  const selectedModifiers = modifierGroups.flatMap((group) => {
    const selectedIds = selectedExtras[group.id] || [];
    return selectedIds
      .map((id) => group.modifiers.find((modifier) => modifier.id === id))
      .filter(Boolean) as Modifier[];
  });

  const selectedProductExtras = extras
    .filter((extra) => selectedExtras.extras?.includes(extra.id))
    .map((extra) => ({
      id: extra.id,
      name: extra.ingredients?.name || extra.id,
      price: extra.ingredients?.sale_price || extra.ingredients?.cost_per_unit || 0,
    }));

  const modifiersTotal = selectedModifiers.reduce((sum, modifier) => sum + Number(modifier.price || 0), 0);
  const extrasTotal = selectedProductExtras.reduce((sum, extra) => sum + Number(extra.price || 0), 0);
  const unitTotal = Number(variant?.price || 0) + modifiersTotal + extrasTotal;
  const total = unitTotal * quantity;
  const image = variant?.image_url || product.product_variants?.[0]?.image_url || null;

  const toggleModifier = (groupId: string, modifierId: string) => {
    setSelectedExtras((current) => {
      const selected = current[groupId] || [];
      return {
        ...current,
        [groupId]: selected.includes(modifierId)
          ? selected.filter((id) => id !== modifierId)
          : [...selected, modifierId],
      };
    });
  };

  const toggleExtra = (extraId: string) => {
    setSelectedExtras((current) => {
      const selected = current.extras || [];
      return {
        ...current,
        extras: selected.includes(extraId)
          ? selected.filter((id) => id !== extraId)
          : [...selected, extraId],
      };
    });
  };

  const toggleIngredient = (ingredientId: string) => {
    const ingredient = allVisibleIngredients.find((item) => item.ingredient_id === ingredientId);
    if (!ingredient || ingredient.is_essential) return;

    setRemovedIngredients((current) => {
      const exists = current.some((item) => item.id === ingredientId);
      if (exists) return current.filter((item) => item.id !== ingredientId);
      return [
        ...current,
        {
          id: ingredientId,
          name: ingredient.ingredients?.name || ingredientId,
        },
      ];
    });
  };

  const handleAddToCart = () => {
    if (!variant) return;

    onAddToCart({
      uid: `${variant.id}-${uid}`,
      itemType: isCombo ? "combo" : "product",
      comboId: isCombo ? product.comboId || product.id : undefined,
      variantId: variant.id,
      productId: isCombo ? undefined : product.id,
      name: product.name,
      price: unitTotal,
      quantity,
      variant,
      extras: [...selectedModifiers, ...selectedProductExtras],
      allowHalf: product.allow_half,
      halves: halves || undefined,
      removedIngredients: removedIngredients.length > 0 ? removedIngredients : undefined,
      categories: product.categories,
    });
    onClose();
  };

  const addLabel = isCombo ? "Agregar combo" : product.allow_half ? "Agregar pizza" : "Agregar producto";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center">
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl"
        style={{ fontFamily }}
      >
        <div className="relative border-b border-gray-100">
          {image ? (
            <div className="h-48 overflow-hidden bg-gray-100 sm:h-56">
              <img src={image} alt={product.name} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="h-24 bg-gray-50" />
          )}

          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-gray-700 shadow-lg transition hover:bg-white"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>

          <div className="bg-white px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  {isCombo ? "Combo" : "Producto"}
                </p>
                <h2 className="mt-1 text-2xl font-black leading-tight text-gray-950">{product.name}</h2>
              </div>
              <div className="rounded-2xl bg-gray-950 px-3 py-2 text-right text-white">
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">Desde</p>
                <p className="text-lg font-black">${formatPrice(unitTotal)}</p>
              </div>
            </div>
            {product.description && (
              <p className="mt-3 text-sm leading-6 text-gray-500">{product.description}</p>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 pb-32">
          {isCombo && product.combo_products && product.combo_products.length > 0 && (
            <Section title="Incluye" hint={`${product.combo_products.length} items`}>
              <div className="space-y-2">
                {product.combo_products.map((comboProduct) => (
                  <div key={comboProduct.id} className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
                    <span className="font-semibold text-gray-800">{comboProduct.products?.name || "Producto"}</span>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-gray-500 shadow-sm">
                      x{comboProduct.quantity}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {!isCombo && product.product_variants?.length > 1 && !product.allow_half && (
            <Section title="Elegir opcion" hint={`${product.product_variants.length} disponibles`}>
              <div className="space-y-2">
                {product.product_variants.map((option) => {
                  const selected = variant?.id === option.id;
                  return (
                    <button
                      key={option.id}
                      onClick={() => setVariant(option)}
                      className="flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition"
                      style={{
                        borderColor: selected ? primaryColor : "#e5e7eb",
                        background: selected ? `${primaryColor}0D` : "#fff",
                      }}
                    >
                      <span className="font-semibold text-gray-850">{option.name}</span>
                      <span className="flex items-center gap-3">
                        <span className="font-black text-gray-900">${formatPrice(option.price)}</span>
                        <span
                          className="flex h-5 w-5 items-center justify-center rounded-full border"
                          style={{ borderColor: selected ? primaryColor : "#d1d5db", background: selected ? primaryColor : "#fff" }}
                        >
                          {selected && <Check size={13} className="text-white" />}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

          {!isCombo && product.allow_half && (
            <Section title="Arma tu pizza por mitades" hint="2 selecciones">
              <div className="grid gap-3 sm:grid-cols-2">
                <HalfSelect
                  label="Primera mitad"
                  value={halves?.first || ""}
                  options={product.product_variants || []}
                  onChange={(value) => setHalves((current) => (current ? { ...current, first: value } : null))}
                />
                <HalfSelect
                  label="Segunda mitad"
                  value={halves?.second || ""}
                  options={product.product_variants || []}
                  onChange={(value) => setHalves((current) => (current ? { ...current, second: value } : null))}
                />
              </div>
              <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
                El precio final se calcula con la opcion base seleccionada y las mitades elegidas.
              </div>
            </Section>
          )}

          {!isCombo && removableIngredients.length > 0 && (
            <Section title="Quitar ingredientes" hint="Opcional">
              <div className="flex flex-wrap gap-2">
                {removableIngredients.map((ingredient) => {
                  const selected = removedIngredients.some((item) => item.id === ingredient.ingredient_id);
                  return (
                    <button
                      key={ingredient.id}
                      onClick={() => toggleIngredient(ingredient.ingredient_id)}
                      className="rounded-full border px-4 py-2 text-sm font-bold transition"
                      style={{
                        borderColor: selected ? "#ef4444" : "#e5e7eb",
                        background: selected ? "#fef2f2" : "#fff",
                        color: selected ? "#b91c1c" : "#374151",
                        textDecoration: selected ? "line-through" : "none",
                      }}
                    >
                      Sin {ingredient.ingredients?.name}
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

          {!isCombo && extras.length > 0 && (
            <Section title="Agregar extras" hint="Opcional">
              <div className="flex flex-wrap gap-2">
                {extras.map((extra) => {
                  const selected = selectedExtras.extras?.includes(extra.id);
                  const price = extra.ingredients?.sale_price || extra.ingredients?.cost_per_unit || 0;
                  return (
                    <button
                      key={extra.id}
                      onClick={() => toggleExtra(extra.id)}
                      className="rounded-full border px-4 py-2 text-sm font-bold transition"
                      style={{
                        borderColor: selected ? primaryColor : "#e5e7eb",
                        background: selected ? primaryColor : "#fff",
                        color: selected ? "#fff" : "#374151",
                      }}
                    >
                      Extra {extra.ingredients?.name}
                      {price ? ` +$${formatPrice(price)}` : ""}
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

          {!isCombo &&
            modifierGroups.map((group) => (
              <Section
                key={group.id}
                title={group.name}
                hint={`${selectedExtras[group.id]?.length || 0} seleccionados`}
              >
                <div className="space-y-2">
                  {group.modifiers.map((modifier) => {
                    const selected = selectedExtras[group.id]?.includes(modifier.id);
                    return (
                      <button
                        key={modifier.id}
                        onClick={() => toggleModifier(group.id, modifier.id)}
                        className="flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition"
                        style={{
                          borderColor: selected ? primaryColor : "#e5e7eb",
                          background: selected ? `${primaryColor}0D` : "#fff",
                        }}
                      >
                        <span className="font-semibold text-gray-800">{modifier.name}</span>
                        <span className="flex items-center gap-3">
                          <span className="font-black text-gray-900">+${formatPrice(modifier.price)}</span>
                          <span
                            className="flex h-5 w-5 items-center justify-center rounded-md border"
                            style={{ borderColor: selected ? primaryColor : "#d1d5db", background: selected ? primaryColor : "#fff" }}
                          >
                            {selected && <Check size={13} className="text-white" />}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Section>
            ))}
        </div>

        <div className="sticky bottom-0 border-t border-gray-200 bg-white px-5 py-4 shadow-[0_-16px_40px_-28px_rgba(0,0,0,.45)]">
          {(modifiersTotal > 0 || extrasTotal > 0 || quantity > 1) && (
            <div className="mb-3 space-y-1 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
              <PriceRow label="Base" value={variant?.price || 0} />
              {modifiersTotal > 0 && <PriceRow label="Opciones" value={modifiersTotal} prefix="+" />}
              {extrasTotal > 0 && <PriceRow label="Extras" value={extrasTotal} prefix="+" />}
              {quantity > 1 && <PriceRow label={`Cantidad x${quantity}`} value={total} />}
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex h-12 items-center rounded-2xl border border-gray-200 bg-gray-50">
              <button
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                className="flex h-12 w-11 items-center justify-center text-gray-700"
                aria-label="Restar"
              >
                <Minus size={18} />
              </button>
              <span className="w-8 text-center text-lg font-black text-gray-950">{quantity}</span>
              <button
                onClick={() => setQuantity((value) => Math.min(20, value + 1))}
                className="flex h-12 w-11 items-center justify-center text-gray-700"
                aria-label="Sumar"
              >
                <Plus size={18} />
              </button>
            </div>

            <button
              onClick={handleAddToCart}
              disabled={!variant}
              className="flex min-h-12 flex-1 items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left font-black text-white transition active:scale-[0.99] disabled:opacity-40"
              style={{ backgroundColor: primaryColor }}
            >
              <span>{addLabel}</span>
              <span>${formatPrice(total)}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-black text-gray-950">{title}</h3>
        {hint && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-500">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function HalfSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ProductVariant[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 outline-none focus:border-gray-400"
      >
        <option value="" disabled>Seleccionar</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name} (+${formatPrice(option.price)})
          </option>
        ))}
      </select>
    </label>
  );
}

function PriceRow({ label, value, prefix = "" }: { label: string; value: number; prefix?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="font-bold text-gray-900">{prefix}${formatPrice(value)}</span>
    </div>
  );
}
