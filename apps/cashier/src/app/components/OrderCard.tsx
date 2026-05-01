"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

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
  onAssignRider,
  onNotifyRider,
  canChangeRider = true,
}: any) {
  const [rider, setRider] = useState<any>(null);
  const [riders, setRiders] = useState<any[]>([]);
  const [showRiderSelect, setShowRiderSelect] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const paid = order.paid_amount || 0;
  const remaining = order.total - paid;
  const isFullyPaid = remaining <= 0;
  const isDelivery = order.type === "delivery";
  const canChange = canChangeRider && isDelivery;

  useEffect(() => {
    if (order.rider_id) {
      loadRider(order.rider_id);
    }
    if (isDelivery) {
      loadRiders();
    }
  }, [order.rider_id, isDelivery]);

  const loadRider = async (riderId: string) => {
    const { data } = await supabase
      .from("riders")
      .select("*")
      .eq("id", riderId)
      .single();
    setRider(data);
  };

  const loadRiders = async () => {
    const { data } = await supabase
      .from("riders")
      .select("*")
      .eq("branch_id", order.branch_id)
      .eq("is_active", true)
      .order("name");
    setRiders(data || []);
  };

  const handleAssignRider = async (riderId: string) => {
    setLoading(true);
    await supabase
      .from("orders")
      .update({ rider_id: riderId })
      .eq("id", order.id);

    const selectedRider = riders.find((r) => r.id === riderId);
    setRider(selectedRider);
    setShowRiderSelect(false);
    setLoading(false);

    if (onAssignRider) onAssignRider(order.id, selectedRider);
  };

  const handleNotifyRider = async () => {
    if (!rider) return;
    setLoading(true);

    if (onNotifyRider) await onNotifyRider(order, rider);

    setLoading(false);
  };

  const canCancel = ["unconfirmed", "confirmed", "preparing"].includes(order.status);

  const handleCancel = async () => {
    if (!confirm("¿Cancelar este pedido? Esta acción no se puede deshacer.")) return;
    setCancelling(true);
    await supabase.from("orders").update({ status: "cancelled" }).eq("id", order.id);
    setCancelling(false);
  };

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
              className={`text-sm px-2 py-0.5 rounded-full ${
                isDelivery
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {order.type}
            </span>

            {rider && (
              <span className="text-sm px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                🚴 {rider.name}
              </span>
            )}
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

      {/* RIDER SELECTOR */}
      {canChange && showRiderSelect && (
        <div className="bg-gray-50 p-3 rounded-lg space-y-2">
          <select
            className="w-full border p-2 rounded text-sm"
            onChange={(e) => {
              if (e.target.value) handleAssignRider(e.target.value);
            }}
            defaultValue=""
          >
            <option value="">Seleccionar repartidor</option>
            {riders.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} - {r.phone}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowRiderSelect(false)}
            className="text-xs text-gray-500 underline"
          >
            Cancelar
          </button>
        </div>
      )}

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
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-1.5 rounded-full">
              {unread}
            </span>
          )}
        </button>

        {/* RIDER BUTTONS */}
        {isDelivery && (
          <>
            {!rider && !showRiderSelect && canChange && (
              <button
                onClick={() => setShowRiderSelect(true)}
                className="
                  px-3 py-1.5
                  text-sm font-medium
                  rounded-lg
                  bg-blue-500
                  text-white
                  hover:bg-blue-600
                  transition
                "
              >
                Asignar Rider
              </button>
            )}

            {rider && (
              <>
                {canChange && (
                  <button
                    onClick={() => setShowRiderSelect(true)}
                    className="
                      px-3 py-1.5
                      text-sm font-medium
                      rounded-lg
                      bg-gray-500
                      text-white
                      hover:bg-gray-600
                      transition
                    "
                  >
                    Cambiar Rider
                  </button>
                )}

                <button
                  onClick={handleNotifyRider}
                  disabled={loading}
                  className="
                    px-3 py-1.5
                    text-sm font-medium
                    rounded-lg
                    bg-green-500
                    text-white
                    hover:bg-green-600
                    disabled:opacity-50
                    transition
                  "
                >
                  {loading ? "Enviando..." : "Notificar Rider"}
                </button>
              </>
            )}
          </>
        )}

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

        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="
              px-3 py-1.5
              text-sm font-medium
              rounded-lg
              bg-red-500
              text-white
              hover:bg-red-600
              disabled:opacity-50
              transition
            "
          >
            {cancelling ? "..." : "Cancelar"}
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
