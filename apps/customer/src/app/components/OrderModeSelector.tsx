type Props = {
  onSelect: (mode: "delivery" | "takeaway") => void;
};

export default function OrderModeSelector({ onSelect }: Props) {
  return (
    <div className="text-center space-y-4">
      <h2 className="text-xl font-bold">
        ¿Cómo quieres recibir tu pedido?
      </h2>

      <div className="flex gap-3 justify-center">
        <button
          onClick={() => onSelect("takeaway")}
          className="px-6 py-3 bg-black text-white rounded-full"
        >
          Retirar
        </button>

        <button
          onClick={() => onSelect("delivery")}
          className="px-6 py-3 bg-black text-white rounded-full"
        >
          Delivery
        </button>
      </div>
    </div>
  );
}