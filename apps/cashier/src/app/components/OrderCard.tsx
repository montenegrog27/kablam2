"use client";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR").format(value || 0);
}

export default function OrderCard({
  order,
  onSelect,
  onNextStatus,
  onMarkAsPaid,
}: any) {
  const paid = order.paid_amount || 0;
  const remaining = order.total - paid;
  const isFullyPaid = remaining <= 0;

  return (
    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-3">

      {/* HEADER */}
      <div className="flex justify-between">
        <div>
          <div className="font-bold text-sm">
            #{order.id.slice(0, 4)} {order.customer_name || "Sin nombre"}
          </div>

          <div className="text-xs text-gray-400">
            {isFullyPaid
              ? "Pagado ✓"
              : `Debe $${formatCurrency(remaining)}`}{" "}
            • {order.type}
          </div>
        </div>

        <div className="text-sm font-semibold">
          ${formatCurrency(order.total)}
        </div>
      </div>

      {/* BOTONES */}
      <div className="grid grid-cols-3 gap-2 text-xs">

        <button
          onClick={() => onSelect(order)}
          className="bg-white text-black px-2 py-1 rounded"
        >
          Pedido
        </button>

        {!isFullyPaid && (
          <button
            onClick={() => onMarkAsPaid(order)}
            className="bg-yellow-500 text-black px-2 py-1 rounded"
          >
            Marcar Pagado
          </button>
        )}

        {order.status !== "delivered" &&
         order.status !== "cancelled" && (
          <button
            onClick={onNextStatus}
            disabled={
              order.status === "sent" && !isFullyPaid
            }
            className={`px-2 py-1 rounded ${
              order.status === "sent" && !isFullyPaid
                ? "bg-gray-600 cursor-not-allowed"
                : "bg-green-600"
            }`}
          >
            Siguiente →
          </button>
        )}
      </div>
    </div>
  );
}