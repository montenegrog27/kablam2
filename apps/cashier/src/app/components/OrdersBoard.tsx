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
  "delivered",
  "cancelled",
];

const STATUS_LABELS: any = {
  unconfirmed: "No Confirmados",
  confirmed: "Confirmados",
  preparing: "En preparación",
  ready: "Listos",
  sent: "Enviados",
  delivered: "Entregados",
  cancelled: "Cancelados",
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

  const markAsPaid = async (order: any) => {
    await supabase
      .from("orders")
      .update({
        paid_amount: order.total,
      })
      .eq("id", order.id);

    reloadOrders();
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

      await createSaleFromOrder(order);
    }

    await supabase
      .from("orders")
      .update({ status: nextStatus })
      .eq("id", order.id);

    setLoading(false);
    reloadOrders();
  };
const createSaleFromOrder = async (order: any) => {
  console.log("ORDER DATA:", order);
const { data: sale, error } = await supabase
  .from("sales")
  .insert({
    tenant_id: order.tenant_id,
    branch_id: order.branch_id,
    cash_session_id: order.cash_session_id,
    cash_register_id: order.cash_register_id,
    created_by: order.created_by, // 🔥 ESTA ES LA CLAVE
    subtotal: order.subtotal,
    discount: order.discount,
    total: order.total,
    status: "completed",
  })
  .select()
  .single();

  if (error) {
    console.error("ERROR CREANDO SALE:", error);
    alert(error.message);
    return;
  }

  await supabase
    .from("orders")
    .update({ sale_id: sale.id })
    .eq("id", order.id);
};

  return (
    <div className="w-3/4 h-full overflow-y-auto p-4 space-y-6">
      {STATUSES.map((status) => {
        const list = getOrdersByStatus(status);
        if (!list.length) return null;

        return (
          <div key={status}>
            <h3 className="font-bold mb-3">
              {STATUS_LABELS[status]} ({list.length})
            </h3>

            <div className="grid grid-cols-1 gap-3">
              {list.map((order: any) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onSelect={onSelect}
                  onNextStatus={() => handleNextStatus(order)}
                  onMarkAsPaid={markAsPaid}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}