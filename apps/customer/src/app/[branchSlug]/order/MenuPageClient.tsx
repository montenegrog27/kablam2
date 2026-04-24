"use client";

import { useState } from "react";
import type {
  Product,
  MenuPageClientProps,
  CartItem,
} from "../../../types/menu";
import NavbarDelivery from "../../components/NavbarDelivery";
import ProfessionalMenu from "../../components/ProfessionalMenu";
import SidebarCarritoDelivery from "../../components/SidebarCarritoDelivery";
import ProductModal from "../../components/ProductModal";
import CartBottomBar from "../../components/CartBottomBar";
import FontLoader from "../../components/FontLoader";

export default function MenuPageClient({
  initialMenu,
  branding,
  branchSlug,
  customer,
}: MenuPageClientProps) {
  const [products] = useState<Product[]>(initialMenu ?? []);
  const [carrito, setCarrito] = useState<CartItem[]>([]);
  const [sidebar, setSidebar] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modal, setModal] = useState(false);

  const agregarAlCarrito = (product: Product) => {
    setSelectedProduct(product);
    setModal(true);
  };

  return (
    <>
      <FontLoader branding={branding} />
      <NavbarDelivery
        onCartClick={() => setSidebar(true)}
        totalItems={carrito.length}
        branding={branding}
        customer={customer}
        branchSlug={branchSlug}
      />

      <div className="pb-24">
        <ProfessionalMenu
          productos={products}
          onAgregar={agregarAlCarrito}
          branding={branding}
        />
      </div>

      <SidebarCarritoDelivery
        abierto={sidebar}
        onClose={() => setSidebar(false)}
        carrito={carrito}
        setCarrito={setCarrito}
        branchSlug={branchSlug}
        branding={branding}
      />

      <ProductModal
        open={modal}
        product={selectedProduct}
        onClose={() => setModal(false)}
        onAddToCart={(item: CartItem) => {
          setCarrito((prev) => [
            ...prev,
            { ...item, uid: crypto.randomUUID() },
          ]);
        }}
        branding={branding}
      />

      <CartBottomBar carrito={carrito} onOpenCart={() => setSidebar(true)} />
    </>
  );
}
