"use client";

import { useState } from "react";
import type { Product } from "../../types/menu";

type Props = {
  productos: Product[];
  onAgregar: (product: Product) => void;
};

export default function MenuCategoriasDelivery({
  productos,
  onAgregar,
}: Props) {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(
    null,
  );

  const allCategories = productos.flatMap((p) => p.categories || []);
  const rootCategories = allCategories.filter((c) => !c.parent_id);

  if (rootCategories.length > 0 && !activeTab) {
    setActiveTab(rootCategories[0].id);
  }

  const currentSubcategories = allCategories.filter(
    (c) => c.parent_id === activeTab,
  );

  const filteredProducts = productos.filter((p) => {
    const productCats = p.categories || [];
    if (activeSubcategory) {
      return productCats.some((c) => c.id === activeSubcategory);
    }
    return productCats.some(
      (c) => c.id === activeTab || c.parent_id === activeTab,
    );
  });

  const getPrice = (product: Product) => {
    const variant =
      product.product_variants?.find((v) => v.is_default) ||
      product.product_variants?.[0];
    return variant?.price ?? 0;
  };

  const getImage = (product: Product) => {
    return product.product_variants?.[0]?.image_url;
  };

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-4 mb-6">
        {rootCategories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setActiveTab(cat.id);
              setActiveSubcategory(null);
            }}
            className={`px-4 py-2 rounded-full whitespace-nowrap ${
              activeTab === cat.id ? "bg-black text-white" : "bg-gray-100"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {currentSubcategories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-4 mb-6">
          <button
            onClick={() => setActiveSubcategory(null)}
            className={`px-3 py-1 rounded text-sm ${
              !activeSubcategory ? "bg-gray-800 text-white" : "bg-gray-200"
            }`}
          >
            Todos
          </button>
          {currentSubcategories.map((sub) => (
            <button
              key={sub.id}
              onClick={() => setActiveSubcategory(sub.id)}
              className={`px-3 py-1 rounded text-sm ${
                activeSubcategory === sub.id
                  ? "bg-gray-800 text-white"
                  : "bg-gray-200"
              }`}
            >
              {sub.name}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {filteredProducts.map((product) => {
          const price = getPrice(product);
          const image = getImage(product);

          return (
            <div
              key={product.id}
              className="flex gap-4 p-4 bg-white rounded-lg shadow-sm"
            >
              {image && (
                <div className="w-20 h-20 flex-shrink-0">
                  <img
                    src={image}
                    alt={product.name}
                    className="w-full h-full object-cover rounded-lg"
                  />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold">{product.name}</h3>
                {product.description && (
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                    {product.description}
                  </p>
                )}
              </div>

              <div className="flex flex-col justify-between items-end">
                <span className="font-bold">${price}</span>
                <button
                  onClick={() => onAgregar(product)}
                  className="bg-black text-white w-8 h-8 rounded-full flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
