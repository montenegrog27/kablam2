"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";
import { printOrder } from "@/lib/printOrder";
import { Printer } from "lucide-react";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR").format(value || 0);
}

function getPaymentLabel(order: any) {
  const payments = order.order_payments || [];
  if (!payments.length) return "Sin metodo";

  return payments
    .map((payment: any) => payment.payment_methods?.name || "Pago")
    .filter(Boolean)
    .join(" + ");
}

function getGoogleMapsUrl(order: any) {
  const lat = Number(order.customer_lat ?? order.lat);
  const lng = Number(order.customer_lng ?? order.lng);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  const address = String(order.address || "").trim();
  if (!address) return "";

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export default function OrderCard({
  order,
  selected,
  unread = 0,
  onSelect,
  onNextStatus,
  onMarkAsPaid,
  onMessages,
  onAssignRider,
  onNotifyRider,
  canChangeRider = true,
  userRecord,
}: any) {
  const [rider, setRider] = useState<any>(null);
  const [riders, setRiders] = useState<any[]>([]);
  const [zoneName, setZoneName] = useState<string | null>(null);
  const [showRiderSelect, setShowRiderSelect] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [printing, setPrinting] = useState(false);

  const paid = order.paid_amount || 0;
  const remaining = order.total - paid;
  const isFullyPaid = remaining <= 0;
  const isDelivery = order.type === "delivery";
  const canChange = canChangeRider && isDelivery;
  const paymentLabel = getPaymentLabel(order);
  const promotionNames = Array.isArray(order.promotion_names)
    ? order.promotion_names.filter(Boolean)
    : [];
  const promotionDiscount = Number(order.discount_amount || order.discount || 0);
  const mapsUrl = isDelivery ? getGoogleMapsUrl(order) : "";

  useEffect(() => {
    if (order.rider_id) {
      loadRider(order.rider_id);
    }
    if (order.delivery_zone_id) {
      loadZone(order.delivery_zone_id);
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

  const loadZone = async (zoneId: string) => {
    const { data } = await supabase
      .from("delivery_zones")
      .select("name")
      .eq("id", zoneId)
      .single();
    if (data) setZoneName(data.name);
  };

  const loadRiders = async () => {
    const { data } = await supabase
      .from("riders")
      .select("*")
      .eq("branch_id", order.branch_id)
      .eq("is_active", true)
      .eq("is_working_today", true)
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

const handleNotifyRider = () => {
  if (!rider) return;

  const riderPhone = rider.phone.replace(/\D/g, "");
  const customerPhone = (order.customer_phone || "").replace(/\D/g, "");

  if (!customerPhone) {
    alert("El cliente no tiene teléfono cargado");
    return;
  }

  const customerMessage =
    `Hola 👋

Soy el repartidor de ${order.tenant_name || "Mordisco Burgers"} y estoy yendo a su domicilio.

Le aviso cuando estoy afuera.`;

  const customerWhatsappUrl =
    `https://wa.me/${customerPhone}?text=${encodeURIComponent(customerMessage)}`;

  const riderMessage =
    `🚴 Pedido #${order.id.slice(0, 4)}

Cliente: ${order.customer_name}

📲 Contactar cliente:
${customerWhatsappUrl}`;

  const url =
    `https://wa.me/${riderPhone}?text=${encodeURIComponent(riderMessage)}`;

  window.open(url, "_blank");
};

  const canCancel = ["unconfirmed", "confirmed", "preparing"].includes(order.status);

  const getButtonLabel = () => {
    const isDelivery = order.type === "delivery";
    switch (order.status) {
      case "unconfirmed": return "Confirmar";
      case "confirmed": return "Preparar";
      case "preparing": return isDelivery ? "Enviar" : "Entregado";
      case "ready": return isDelivery ? "Enviar" : "Entregado";
      case "sent": return "Entregado";
      default: return "Avanzar →";
    }
  };

  const getButtonColor = () => {
    switch (order.status) {
      case "unconfirmed": return "bg-amber-500 hover:bg-amber-600";
      case "confirmed": return "bg-blue-500 hover:bg-blue-600";
      case "preparing": return "bg-orange-500 hover:bg-orange-600";
      case "ready": return "bg-emerald-500 hover:bg-emerald-600";
      case "sent": return "bg-green-600 hover:bg-green-700";
      default: return "bg-gray-900 hover:bg-black";
    }
  };

  const handleCancel = async () => {
    const reason = window.prompt("Motivo de cancelacion");
    if (!reason?.trim()) return;
    setCancelling(true);
    await supabase
      .from("orders")
      .update({
        status: "cancelled",
        cancel_reason: reason.trim(),
        cancelled_at: new Date().toISOString(),
        cancelled_by: userRecord?.id || null,
      })
      .eq("id", order.id);
    setCancelling(false);
  };

  const handleDelete = async () => {
    if (!confirm("¿Eliminar este pedido permanentemente? Esta acción no se puede deshacer.")) return;
    await supabase.from("orders").delete().eq("id", order.id);
  };

  const handleReprintComanda = async () => {
    if (printing) return;
    setPrinting(true);

    try {
      await supabase
        .from("orders")
        .update({ reprint_at: new Date().toISOString() })
        .eq("id", order.id);

      const logs = await printOrder({
        orderId: order.id,
        type: "comanda",
        branchId: order.branch_id,
      });

      console.log("[REPRINT COMANDA]", logs);
      alert("Solicitud de impresion enviada.");
    } catch (error: any) {
      console.error("Reprint error:", error);
      alert(`No se pudo solicitar la impresion: ${error?.message || "error desconocido"}`);
    } finally {
      setPrinting(false);
    }
  };

  const canDelete = userRecord && ["owner", "admin"].includes(userRecord.role);

  return (
    <div
      className={`
      bg-white
      border rounded-xl
      p-4 hover:shadow-sm transition space-y-3
      ${selected ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200"}
    `}
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

            {zoneName && (
              <span className="text-sm px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                📍 {zoneName}
              </span>
            )}

            <span className="text-sm px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {paymentLabel}
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

          {isDelivery && order.shipping_cost > 0 && (
            <div className="text-lg text-gray-400">
              🚗 Envío: ${formatCurrency(order.shipping_cost)}
            </div>
          )}

          {(promotionNames.length > 0 || promotionDiscount > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {promotionNames.map((name: string) => (
                <span
                  key={name}
                  className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-bold"
                >
                  PROMO · {name}
                </span>
              ))}
              {promotionDiscount > 0 && (
                <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold">
                  Descuento ${formatCurrency(promotionDiscount)}
                </span>
              )}
            </div>
          )}
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

        {onMessages && (
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
        )}

        {/* RIDER BUTTONS */}
        {isDelivery && (
          <>
            {mapsUrl && (
              <button
                onClick={() => window.open(mapsUrl, "_blank", "noopener,noreferrer")}
                className="
                  px-3 py-1.5
                  text-sm font-medium
                  rounded-lg
                  bg-indigo-500
                  text-white
                  hover:bg-indigo-600
                  transition
                "
              >
                Ver ubicación
              </button>
            )}

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

        {order.status === "confirmed" || order.status === "preparing" || order.status === "ready" || order.status === "sent" ? (
          <button
            onClick={handleReprintComanda}
            disabled={printing}
            className="px-2 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 transition disabled:opacity-50"
            title="Reimprimir comanda"
          >
            {printing ? "..." : <Printer size={15} />}
          </button>
        ) : null}

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

        {canDelete && (
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition"
          >
            Eliminar
          </button>
        )}

        {order.status !== "delivered" && order.status !== "cancelled" && (
          <button
            onClick={onNextStatus}
            disabled={order.status === "sent" && !isFullyPaid}
            className={`
                px-3 py-1.5
                text-sm font-medium
                rounded-lg
                text-white
                disabled:opacity-40
                transition
                ${getButtonColor()}
              `}
          >
            {getButtonLabel()}
          </button>
        )}
      </div>
    </div>
  );
}
