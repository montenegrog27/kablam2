"use client";

import { useState, useEffect } from "react";
import {
  Package,
  Clock,
  CheckCircle,
  Truck,
  Home,
  ChevronRight,
  Loader2,
  Calendar,
  DollarSign,
  MapPin,
} from "lucide-react";

type OrderStatus =
  | "unconfirmed"
  | "confirmed"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled";

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
  notes?: string;
}

interface Order {
  id: string;
  order_number: string;
  status: OrderStatus;
  type: "delivery" | "pickup" | "dine_in";
  total: number;
  subtotal: number;
  shipping_cost: number;
  discount: number;
  address?: string;
  customer_notes?: string;
  created_at: string;
  items: OrderItem[];
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Cargar pedidos
  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/account/orders");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al cargar pedidos");
      }

      setOrders(data.orders || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const getStatusConfig = (status: OrderStatus) => {
    switch (status) {
      case "unconfirmed":
        return {
          icon: Clock,
          color: "text-yellow-600 bg-yellow-50",
          label: "Pendiente de confirmación",
          description: "Tu pedido está siendo procesado",
        };
      case "confirmed":
        return {
          icon: CheckCircle,
          color: "text-blue-600 bg-blue-50",
          label: "Confirmado",
          description: "El restaurante aceptó tu pedido",
        };
      case "preparing":
        return {
          icon: Package,
          color: "text-purple-600 bg-purple-50",
          label: "En preparación",
          description: "Tu pedido se está cocinando",
        };
      case "ready":
        return {
          icon: Truck,
          color: "text-green-600 bg-green-50",
          label: "Listo para entregar",
          description: "Tu pedido está listo",
        };
      case "delivered":
        return {
          icon: Home,
          color: "text-gray-600 bg-gray-50",
          label: "Entregado",
          description: "Pedido completado",
        };
      case "cancelled":
        return {
          icon: Clock,
          color: "text-red-600 bg-red-50",
          label: "Cancelado",
          description: "Pedido cancelado",
        };
      default:
        return {
          icon: Clock,
          color: "text-gray-600 bg-gray-50",
          label: "Desconocido",
          description: "Estado desconocido",
        };
    }
  };

  const getOrderTypeIcon = (type: string) => {
    switch (type) {
      case "delivery":
        return Truck;
      case "pickup":
        return Package;
      case "dine_in":
        return Home;
      default:
        return Package;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mis pedidos</h1>
        <p className="text-gray-600 mt-1">Historial de todos tus pedidos</p>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Empty state */}
      {orders.length === 0 && !error && (
        <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No hay pedidos aún
          </h3>
          <p className="text-gray-600 mb-6">
            Cuando realices tu primer pedido, aparecerá aquí.
          </p>
          <a
            href="/order"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
          >
            Ver menú
            <ChevronRight size={16} />
          </a>
        </div>
      )}

      {/* Orders list */}
      <div className="space-y-4">
        {orders.map((order) => {
          const statusConfig = getStatusConfig(order.status);
          const StatusIcon = statusConfig.icon;
          const OrderTypeIcon = getOrderTypeIcon(order.type);

          return (
            <div
              key={order.id}
              className="bg-white rounded-xl shadow-sm border overflow-hidden"
            >
              {/* Order header */}
              <div className="p-6 border-b">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Pedido #
                        {order.order_number || order.id.slice(-6).toUpperCase()}
                      </h3>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}
                      >
                        <StatusIcon size={12} />
                        {statusConfig.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Calendar size={14} />
                        {formatDate(order.created_at)}
                      </div>
                      <div className="flex items-center gap-1">
                        <DollarSign size={14} />
                        {formatCurrency(order.total)}
                      </div>
                      <div className="flex items-center gap-1">
                        <OrderTypeIcon size={14} />
                        {order.type === "delivery"
                          ? "Delivery"
                          : order.type === "pickup"
                            ? "Retiro"
                            : "En local"}
                      </div>
                      {order.address && (
                        <div className="flex items-center gap-1">
                          <MapPin size={14} />
                          <span className="truncate max-w-[200px]">
                            {order.address}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <button className="text-blue-600 hover:text-blue-800">
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>

              {/* Order items */}
              <div className="p-6">
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                  Productos
                </h4>
                <div className="space-y-3">
                  {order.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex justify-between items-start"
                    >
                      <div>
                        <div className="font-medium text-gray-900">
                          {item.quantity}x {item.product_name}
                        </div>
                        {item.notes && (
                          <div className="text-sm text-gray-500 mt-1">
                            Nota: {item.notes}
                          </div>
                        )}
                      </div>
                      <div className="text-gray-900 font-medium">
                        {formatCurrency(item.total)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Order summary */}
                <div className="mt-6 pt-6 border-t">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Subtotal</span>
                      <span className="text-gray-900">
                        {formatCurrency(order.subtotal)}
                      </span>
                    </div>
                    {order.discount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Descuento</span>
                        <span className="text-green-600">
                          -{formatCurrency(order.discount)}
                        </span>
                      </div>
                    )}
                    {order.shipping_cost > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Envío</span>
                        <span className="text-gray-900">
                          {formatCurrency(order.shipping_cost)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-semibold pt-2 border-t">
                      <span className="text-gray-900">Total</span>
                      <span className="text-gray-900">
                        {formatCurrency(order.total)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Order actions */}
                <div className="mt-6 pt-6 border-t flex gap-3">
                  {order.status === "unconfirmed" && (
                    <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">
                      Cancelar pedido
                    </button>
                  )}
                  {order.status === "delivered" && (
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                      Volver a pedir
                    </button>
                  )}
                  <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">
                    Ver detalles
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination (futura implementación) */}
      {orders.length > 0 && (
        <div className="flex justify-center">
          <nav className="flex items-center gap-2">
            <button className="px-3 py-2 border rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
              Anterior
            </button>
            <span className="px-3 py-2 text-gray-600">Página 1</span>
            <button className="px-3 py-2 border rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
              Siguiente
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
