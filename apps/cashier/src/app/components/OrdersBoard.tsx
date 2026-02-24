// "use client";

// import { supabase } from "@kablam/supabase";
// import OrderCard from "./OrderCard";
// import { useState } from "react";

// const STATUSES = [
//   "unconfirmed",
//   "confirmed",
//   "preparing",
//   "ready",
//   "sent",
//   "delivered",
//   "cancelled",
// ];

// const STATUS_LABELS: any = {
//   unconfirmed: "No Confirmados",
//   confirmed: "Confirmados",
//   preparing: "En preparación",
//   ready: "Listos",
//   sent: "Enviados",
//   delivered: "Entregados",
//   cancelled: "Cancelados",
// };

// export default function OrdersBoard({
//   orders,
//   onSelect,
//   reloadOrders,
// }: any) {
//   const [loading, setLoading] = useState(false);

//   const getOrdersByStatus = (status: string) =>
//     orders.filter((o: any) => o.status === status);

//   const getNextStatus = (current: string) => {
//     const index = STATUSES.indexOf(current);
//     return STATUSES[index + 1] || current;
//   };

//   const markAsPaid = async (order: any) => {
//     await supabase
//       .from("orders")
//       .update({
//         paid_amount: order.total,
//       })
//       .eq("id", order.id);

//     reloadOrders();
//   };

//   const handleNextStatus = async (order: any) => {
//     if (loading) return;
//     setLoading(true);

//     const nextStatus = getNextStatus(order.status);

//     if (nextStatus === "delivered") {
//       if ((order.paid_amount || 0) < order.total) {
//         alert("No se puede entregar: pago incompleto");
//         setLoading(false);
//         return;
//       }

//       await createSaleFromOrder(order);
//     }

//     await supabase
//       .from("orders")
//       .update({ status: nextStatus })
//       .eq("id", order.id);

//     setLoading(false);
//     reloadOrders();
//   };
// const createSaleFromOrder = async (order: any) => {
//   console.log("ORDER DATA:", order);
// const { data: sale, error } = await supabase
//   .from("sales")
//   .insert({
//     tenant_id: order.tenant_id,
//     branch_id: order.branch_id,
//     cash_session_id: order.cash_session_id,
//     cash_register_id: order.cash_register_id,
//     created_by: order.created_by, // 🔥 ESTA ES LA CLAVE
//     subtotal: order.subtotal,
//     discount: order.discount,
//     total: order.total,
//     status: "completed",
//   })
//   .select()
//   .single();

//   if (error) {
//     console.error("ERROR CREANDO SALE:", error);
//     alert(error.message);
//     return;
//   }

//   await supabase
//     .from("orders")
//     .update({ sale_id: sale.id })
//     .eq("id", order.id);
// };

//   return (
//     <div className="w-3/4 h-full overflow-y-auto p-4 space-y-6">
//       {STATUSES.map((status) => {
//         const list = getOrdersByStatus(status);
//         if (!list.length) return null;

//         return (
//           <div key={status}>
//             <h3 className="font-bold mb-3">
//               {STATUS_LABELS[status]} ({list.length})
//             </h3>

//             <div className="grid grid-cols-1 gap-3">
//               {list.map((order: any) => (
//                 <OrderCard
//                   key={order.id}
//                   order={order}
//                   onSelect={onSelect}
//                   onNextStatus={() => handleNextStatus(order)}
//                   onMarkAsPaid={markAsPaid}
//                 />
//               ))}
//             </div>
//           </div>
//         );
//       })}
//     </div>
//   );
// }



"use client";

import { supabase } from "@kablam/supabase";
import OrderCard from "./OrderCard";
import { useState } from "react";

const STATUSES = [
  "unconfirmed",
  "confirmed",
  "preparing",
  "ready",
  "sent",
];

const STATUS_META: any = {
  unconfirmed: {
    label: "No Confirmados",
    header: "bg-gray-800",
    badge: "bg-gray-700 text-gray-300",
    accent: "border-l-gray-500",
  },
  confirmed: {
    label: "Confirmados",
    header: "bg-yellow-900/40",
    badge: "bg-yellow-500/20 text-yellow-400",
    accent: "border-l-yellow-500",
  },
  preparing: {
    label: "En preparación",
    header: "bg-blue-900/40",
    badge: "bg-blue-500/20 text-blue-400",
    accent: "border-l-blue-500",
  },
  ready: {
    label: "Listos",
    header: "bg-emerald-900/40",
    badge: "bg-emerald-500/20 text-emerald-400",
    accent: "border-l-emerald-500",
  },
  sent: {
    label: "Enviados",
    header: "bg-purple-900/40",
    badge: "bg-purple-500/20 text-purple-400",
    accent: "border-l-purple-500",
  },
};

export default function OrdersBoard({
  orders,
  onSelect,
  reloadOrders,
}: any) {

  const [loading, setLoading] = useState(false);

  const getOrdersByStatus = (status: string) =>
    orders.filter((o: any) => o.status === status);

  const getNextStatus = (current: string) => {
    const index = STATUSES.indexOf(current);
    return STATUSES[index + 1] || current;
  };

  const handleNextStatus = async (order: any) => {
    if (loading) return;
    setLoading(true);

    const nextStatus = getNextStatus(order.status);

    if (nextStatus === "delivered") {
      if ((order.paid_amount || 0) < order.total) {
        alert("No se puede entregar: pago incompleto");
        setLoading(false);
        return;
      }
    }

    await supabase
      .from("orders")
      .update({ status: nextStatus })
      .eq("id", order.id);

    setLoading(false);
    reloadOrders();
  };

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
                    onNextStatus={() => handleNextStatus(order)}
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