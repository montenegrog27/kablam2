"use client";

import { useEffect, useState } from "react";
import { supabase } from "@kablam/supabase";

export default function Home() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    loadMenu();
  }, []);

  const loadMenu = async () => {

    const { data: productsData } = await supabase
      .from("products")
      .select("*")
      .eq("active", true)
      .order("name");

    const { data: categoriesData } = await supabase
      .from("categories")
      .select("*")
      .order("name");

    setProducts(productsData || []);
    setCategories(categoriesData || []);
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-10">
      <h1 className="text-3xl font-bold mb-8">
        Menú
      </h1>

      {categories.map((cat:any) => {

        const items = products.filter(
          (p:any) => p.category_id === cat.id
        );

        if (!items.length) return null;

        return (
          <div key={cat.id} className="mb-10">

            <h2 className="text-xl font-semibold mb-4">
              {cat.name}
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">

              {items.map((product:any) => (
                <div
                  key={product.id}
                  className="bg-white rounded-xl p-4 shadow-sm"
                >
                  {product.image && (
                    <img
                      src={product.image}
                      className="w-full h-40 object-cover rounded-lg mb-3"
                    />
                  )}

                  <h3 className="font-semibold">
                    {product.name}
                  </h3>

                  <p className="text-sm text-gray-500">
                    {product.description}
                  </p>

                  <div className="mt-2 font-bold">
                    ${product.price}
                  </div>

                </div>
              ))}

            </div>

          </div>
        );
      })}
    </div>
  );
}