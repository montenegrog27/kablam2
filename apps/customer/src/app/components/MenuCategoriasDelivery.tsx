"use client";

import type { Product } from "../../types/menu";

type Category = {
  id: string;
  name: string;
};

type Props = {
  categorias: Category[];
  productos: Product[];
  onAgregar: (product: Product) => void;
};

export default function MenuCategoriasDelivery({
  categorias,
  productos,
  onAgregar,
}: Props) {
  return (
    <div className="space-y-16">
      {categorias.map((cat) => {
        const items = productos.filter(
          (p) => p.categories?.some(c => c.id === cat.id)
        );

        if (!items.length) return null;

        return (
          <section key={cat.id} className="space-y-6">
            <h2 className="text-3xl font-bold">
              {cat.name}
            </h2>

            <div className="space-y-4">
              {items.map((product) => {
                const defaultVariant =
                  product.product_variants?.find((v) => v.is_default) ||
                  product.product_variants?.[0];

                const price = defaultVariant?.price ?? 0;
                const image = defaultVariant?.image_url;

                return (
                  <div
                    key={product.id}
                    className="flex gap-4 pb-4 border-b relative"
                  >
                    {/* Imagen */}
                    {image && (
                      <div className="aspect-square w-24">
                        <img
                          src={image}
                          className="w-full h-full object-cover rounded-md"
                        />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex flex-col justify-center flex-grow">
                      <h3 className="text-lg font-bold">
                        {product.name}
                      </h3>

                      {product.description && (
                        <p className="text-sm text-neutral-500">
                          {product.description}
                        </p>
                      )}
                    </div>

                    {/* Precio */}
                    <div className="flex flex-col justify-center items-end">
                      <span className="font-bold text-lg">
                        ${price}
                      </span>
                    </div>

                    {/* Botón agregar */}
                    <button
                      onClick={() => onAgregar(product)}
                      className="absolute bottom-0 right-0 bg-black text-white w-8 h-8 rounded-full flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}