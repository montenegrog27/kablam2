"use client";

import type { CartItem } from "@/types/menu";

type Props = {
  carrito: CartItem[];
  onOpenCart: () => void;
  disabled?: boolean;
};

export default function CartBottomBar({
  carrito,
  onOpenCart,
  disabled = false,
}: Props) {
  if (!carrito.length) return null;

  const total = carrito.reduce(
    (acc, p) => acc + p.price * p.quantity,
    0
  );

  const totalItems = carrito.reduce(
    (acc, p) => acc + p.quantity,
    0
  );

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40">

      <button
        onClick={onOpenCart}
        className={`w-full rounded-2xl px-5 py-4 flex items-center justify-between shadow-xl ${
          disabled ? "bg-gray-700 text-white" : "bg-black text-white"
        }`}
      >
        {/* cantidad */}
        <div className="flex items-center gap-3">

          <div className="bg-white text-black w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold">
            {totalItems}
          </div>

          <span className="font-semibold">
            {disabled ? "Local cerrado" : "Ver carrito"}
          </span>

        </div>

        {/* total */}
        <span className="font-bold">
          ${total}
        </span>

      </button>

    </div>
  );
}
