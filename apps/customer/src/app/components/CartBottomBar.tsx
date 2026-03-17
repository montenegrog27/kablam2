"use client";

type CartItem = {
  uid: string;
  name: string;
  price: number;
  quantity: number;
};

type Props = {
  carrito: CartItem[];
  onOpenCart: () => void;
};

export default function CartBottomBar({
  carrito,
  onOpenCart,
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
        className="w-full bg-black text-white rounded-2xl px-5 py-4 flex items-center justify-between shadow-xl"
      >
        {/* cantidad */}
        <div className="flex items-center gap-3">

          <div className="bg-white text-black w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold">
            {totalItems}
          </div>

          <span className="font-semibold">
            Ver carrito
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