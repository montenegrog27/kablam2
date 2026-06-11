"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from "react";
import type {
  Product,
  Combo,
  MenuPageClientProps,
  CartItem,
} from "../../../types/menu";
import NavbarDelivery from "../../components/NavbarDelivery";
import ProfessionalMenu from "../../components/ProfessionalMenu";
import SidebarCarritoDelivery from "../../components/SidebarCarritoDelivery";
import ProductModal from "../../components/ProductModal";
import CartBottomBar from "../../components/CartBottomBar";
import FontLoader from "../../components/FontLoader";
import MetaTags from "../../components/MetaTags";
import CumpleMordiscoEntry from "../../components/CumpleMordiscoEntry";
import CustomerInitialLoader from "../../components/CustomerInitialLoader";
import CustomerPopupModal from "../../components/CustomerPopupModal";

export default function MenuPageClient({
  initialMenu,
  initialCombos,
  branding,
  availability,
  branchSlug,
  customer,
}: MenuPageClientProps) {
  const [products] = useState<Product[]>(initialMenu ?? []);
  const [combos] = useState<Combo[]>(initialCombos ?? []);
  const [carrito, setCarrito] = useState<CartItem[]>([]);
  const [sidebar, setSidebar] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modal, setModal] = useState(false);
  const [closedNotice, setClosedNotice] = useState("");
  const branchIsOpen = availability?.isOpen !== false;
  const closedMessage =
    availability?.message || branding?.web_closed_message || "Estamos cerrados por el momento. Volve a intentar mas tarde.";

  useEffect(() => {
    const stored = sessionStorage.getItem(`cart_${branchSlug}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setCarrito(parsed);
        }
      } catch (e) {
        console.error("Error parsing cart:", e);
      }
    }
  }, [branchSlug]);

  useEffect(() => {
    if (carrito.length > 0) {
      sessionStorage.setItem(`cart_${branchSlug}`, JSON.stringify(carrito));
    }
  }, [carrito, branchSlug]);

  useEffect(() => {
    if (!closedNotice) return;
    const timer = window.setTimeout(() => setClosedNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [closedNotice]);

  const agregarAlCarrito = (product: Product) => {
    if (!branchIsOpen) {
      setClosedNotice(closedMessage);
      return;
    }

    setSelectedProduct(product);
    setModal(true);
  };

  return (
    <>
      <CustomerInitialLoader branding={branding} branchSlug={branchSlug} />
      <CustomerPopupModal branchSlug={branchSlug} />
      <FontLoader branding={branding} />
      <MetaTags branding={branding} />
      <NavbarDelivery
        onCartClick={() => setSidebar(true)}
        totalItems={carrito.length}
        branding={branding}
        customer={customer}
        branchSlug={branchSlug}
      />
      {/* <CumpleMordiscoEntry branchSlug={branchSlug} /> */}

      <div className="pb-24">
        {!branchIsOpen && (
          <div className="mx-auto mt-4 max-w-3xl px-4">
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 shadow-sm">
              {closedMessage}
            </div>
          </div>
        )}
        {closedNotice && (
          <div className="fixed left-4 right-4 top-20 z-50 mx-auto max-w-md rounded-2xl bg-gray-950 px-4 py-3 text-center text-sm font-semibold text-white shadow-2xl">
            {closedNotice}
          </div>
        )}
        <ProfessionalMenu
          productos={products}
          combos={combos}
          onAgregar={agregarAlCarrito}
          branding={branding}
          disabled={!branchIsOpen}
        />
      </div>

      <SidebarCarritoDelivery
        abierto={sidebar}
        onClose={() => setSidebar(false)}
        carrito={carrito}
        setCarrito={setCarrito}
        branchSlug={branchSlug}
        branding={branding}
        canCheckout={branchIsOpen}
        closedMessage={closedMessage}
      />

      <ProductModal
        open={modal}
        product={selectedProduct}
        onClose={() => setModal(false)}
        onAddToCart={(item: CartItem) => {
          if (!branchIsOpen) {
            setClosedNotice(closedMessage);
            setModal(false);
            return;
          }

          setCarrito((prev) => [
            ...prev,
            { ...item, uid: crypto.randomUUID() },
          ]);
        }}
        branding={branding}
      />

      <CartBottomBar carrito={carrito} onOpenCart={() => setSidebar(true)} disabled={!branchIsOpen} />
    </>
  );
}
