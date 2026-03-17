"use client";

import { useState } from "react";
import type {
  Product,
  Category,
  MenuPageClientProps,
  CartItem,
} from "../../../types/menu";
import NavbarDelivery from "../../components/NavbarDelivery";
import MenuCategoriasDelivery from "../../components/MenuCategoriasDelivery";
import SidebarCarritoDelivery from "../../components/SidebarCarritoDelivery";
import ProductModal from "../../components/ProductModal";
import CartBottomBar from "../../components/CartBottomBar";

export default function MenuPageClient({
  initialMenu,
  branding,
  branchSlug, // 👈 AQUI
}: MenuPageClientProps) {
  const [products] = useState<Product[]>(initialMenu ?? []);

  const categories: Category[] = Array.from(
    new Map(
      products.flatMap((p) => p.categories || []).map((c) => [c.id, c]),
    ).values(),
  );

  const [carrito, setCarrito] = useState<CartItem[]>([]);
  const [sidebar, setSidebar] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modal, setModal] = useState(false);
  console.log("products", products);
  console.log("categories", categories);
  const agregarAlCarrito = (product: Product) => {
    setSelectedProduct(product);
    setModal(true);
  };

  return (
    <>
      <NavbarDelivery
        onCartClick={() => setSidebar(true)}
        totalItems={carrito.length}
        branding={branding}
      />

      <div className="p-4 max-w-6xl mx-auto">
        <MenuCategoriasDelivery
          categorias={categories}
          productos={products}
          onAgregar={agregarAlCarrito}
        />
      </div>

      <SidebarCarritoDelivery
        abierto={sidebar}
        onClose={() => setSidebar(false)}
        carrito={carrito}
        setCarrito={setCarrito}
        branchSlug={branchSlug} // 👈 AQUI
      />

      <ProductModal
        open={modal}
        product={selectedProduct}
        onClose={() => setModal(false)}
        onAddToCart={(item: any) => {
          setCarrito((prev) => [
            ...prev,
            { ...item, uid: crypto.randomUUID() },
          ]);
        }}
      />

      <CartBottomBar carrito={carrito} onOpenCart={() => setSidebar(true)} />
    </>
  );
}
