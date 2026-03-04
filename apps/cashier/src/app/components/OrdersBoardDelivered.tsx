"use client";

import OrderCard from "./OrderCard";

const STATUSES = ["delivered", "cancelled"];

const STATUS_META: Record<
  string,
  {
    label: string;
    header: string;
    badge: string;
    accent: string;
  }
> = {
  delivered: {
    label: "Entregados",
    header: "bg-green-900/40",
    badge: "bg-green-500/20 text-green-400",
    accent: "border-l-green-500",
  },
  cancelled: {
    label: "Cancelados",
    header: "bg-red-900/40",
    badge: "bg-red-500/20 text-red-400",
    accent: "border-l-red-500",
  },
};

export default function DeliveredBoard({
  orders,
  onSelect,
}: any) {
  const getOrdersByStatus = (status: string) =>
    orders.filter((o: any) => o.status === status);

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3 bg-gray-950">
      {STATUSES.map((status) => {
        const list = getOrdersByStatus(status);
        const meta = STATUS_META[status];

        return (
          <div
            key={status}
            className={`
              rounded-2xl
              overflow-hidden
              border border-gray-800
              bg-gray-900
              border-l-4 ${meta.accent}
            `}
          >
            {/* HEADER */}
            <div
              className={`
                flex justify-between items-center
                px-3 py-2
                ${meta.header}
              `}
            >
              <h3 className="text-sm font-semibold text-gray-200 tracking-wide uppercase">
                {meta.label}
              </h3>

              <span
                className={`
                  text-xs px-3 py-1 rounded-full font-medium
                  ${meta.badge}
                `}
              >
                {list.length}
              </span>
            </div>

            {/* CONTENT */}
            <div className="p-5 space-y-4">
              {list.length === 0 ? (
                <div className="flex items-center justify-center py-4 text-xs italic text-gray-500 border border-dashed border-gray-700 rounded-xl bg-gray-800">
                  No hay pedidos en este estado
                </div>
              ) : (
                list.map((order: any) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onSelect={onSelect}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}