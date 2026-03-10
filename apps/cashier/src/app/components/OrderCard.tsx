"use client";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR").format(value || 0);
}

export default function OrderCard({
  order,
  unread = 0,
  onSelect,
  onNextStatus,
  onMarkAsPaid,
  onMessages,
}: any) {
  const paid = order.paid_amount || 0;
  const remaining = order.total - paid;
  const isFullyPaid = remaining <= 0;

  return (
    <div
      className="
      bg-white
      border border-gray-200
      rounded-xl
      p-4
      hover:shadow-sm
      transition
      space-y-3
    "
    >
      {/* TOP ROW */}
      <div className="flex justify-start gap-12 items-center">
        <div className="space-y-1 flex flex-row items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-gray-500 tracking-wide">
              #{order.id.slice(0, 4)}
            </span>

            <span
              className="
              text-sm px-2 py-0.5 rounded-full
              bg-gray-100 text-gray-600
            "
            >
              {order.type}
            </span>
          </div>

          <div className="text-md font-semibold text-gray-900">
            {order.customer_name || "Cliente sin nombre"}
          </div>

          <div className="text-md text-gray-500">
            {isFullyPaid
              ? "Pago completo"
              : `Debe $${formatCurrency(remaining)}`}
          </div>
        </div>

        <div className="text-right">
          <div className="text-lg font-semibold text-gray-900">
            ${formatCurrency(order.total)}
          </div>
        </div>
      </div>

      {/* ACTIONS */}
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <button
          onClick={() => onSelect({ ...order, mode: "view" })}
          className="
            px-3 py-1.5
            text-sm font-medium
            border border-gray-300
            rounded-lg
            text-gray-700
            hover:bg-gray-100
            transition
          "
        >
          Ver
        </button>
 <button
  onClick={() => onMessages(order)}
  className="
    relative
    px-3 py-1.5
    text-sm font-medium
    border border-gray-300
    rounded-lg
    text-gray-700
    hover:bg-gray-100
    transition
  "
>
  Mensajes

  {unread > 0 && (
    <span
      className="
        absolute
        -top-2
        -right-2
        bg-red-500
        text-white
        text-xs
        px-1.5
        rounded-full
      "
    >
      {unread}
    </span>
  )}
</button>

        {!isFullyPaid && (
          <button
            onClick={() => onMarkAsPaid(order)}
            className="
              px-3 py-1.5
              text-sm font-medium
              rounded-lg
              bg-amber-500
              text-white
              hover:bg-amber-600
              transition
            "
          >
            Pagado
          </button>
        )}

        {order.status !== "delivered" && order.status !== "cancelled" && (
          <button
            onClick={onNextStatus}
            disabled={order.status === "sent" && !isFullyPaid}
            className="
                px-3 py-1.5
                text-sm font-medium
                rounded-lg
                bg-gray-900
                text-white
                hover:bg-black
                disabled:opacity-40
                transition
              "
          >
            Avanzar →
          </button>
        )}
      </div>
    </div>
  );
}
