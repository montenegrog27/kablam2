"use client";

import {
  AlertTriangle,
  Bike,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  MapPin,
  PackageCheck,
  Phone,
  QrCode,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type DeliveryStatus = "queued" | "active" | "delivered";

type DeliveryOrder = {
  id: string;
  code: string;
  customerName: string;
  address: string;
  neighborhood: string;
  phone: string;
  payment: string;
  notes: string;
  quotedPrice: number;
  status: DeliveryStatus;
  scannedAt: string;
};

type BarcodeDetectorShape = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorShape;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

const demoOrders: Record<string, Omit<DeliveryOrder, "status" | "scannedAt">> =
  {
    "KBL-1542": {
      id: "ord_1542",
      code: "KBL-1542",
      customerName: "Martina G.",
      address: "Av. Siempre Viva 742, Piso 3, Depto B",
      neighborhood: "Centro",
      phone: "+54 9 3794 09-4455",
      payment: "Pagado online",
      notes: "Tocar timbre 3B. No llamar antes de llegar.",
      quotedPrice: 1800,
    },
    "KBL-1543": {
      id: "ord_1543",
      code: "KBL-1543",
      customerName: "Pablo R.",
      address: "San Martin 1180",
      neighborhood: "Camba Cua",
      phone: "+54 9 3794 18-2210",
      payment: "Cobra efectivo $12900",
      notes: "Casa con porton negro.",
      quotedPrice: 2100,
    },
    "KBL-1544": {
      id: "ord_1544",
      code: "KBL-1544",
      customerName: "Sofia L.",
      address: "Belgrano 502, Torre Norte",
      neighborhood: "La Cruz",
      phone: "+54 9 3794 55-9012",
      payment: "Pagado online",
      notes: "Dejar en recepcion si no responde.",
      quotedPrice: 2400,
    },
  };

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeToken(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    return (
      url.searchParams.get("order") ||
      url.searchParams.get("token") ||
      url.pathname.split("/").filter(Boolean).at(-1) ||
      trimmed
    ).toUpperCase();
  } catch {
    return trimmed.toUpperCase();
  }
}

function getStoredQueue(sessionToken: string) {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(`kablam:rider:${sessionToken}`);
    return raw ? (JSON.parse(raw) as DeliveryOrder[]) : [];
  } catch {
    return [];
  }
}

export default function RiderSessionClient({
  sessionToken,
}: {
  sessionToken: string;
}) {
  const [orders, setOrders] = useState<DeliveryOrder[]>(() =>
    getStoredQueue(sessionToken)
  );
  const [manualToken, setManualToken] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [scanMessage, setScanMessage] = useState(
    "Listo para escanear el QR del ticket."
  );
  const [cameraError, setCameraError] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);

  useEffect(() => {
    window.localStorage.setItem(
      `kablam:rider:${sessionToken}`,
      JSON.stringify(orders)
    );
  }, [orders, sessionToken]);

  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  const activeOrder = useMemo(
    () => orders.find((order) => order.status === "active"),
    [orders]
  );

  const queuedOrders = orders.filter((order) => order.status === "queued");
  const deliveredOrders = orders.filter((order) => order.status === "delivered");
  const totalQuoted = orders.reduce((sum, order) => sum + order.quotedPrice, 0);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  function addOrderFromToken(rawToken: string) {
    const token = normalizeToken(rawToken);
    const found = demoOrders[token];

    if (!token) {
      setScanMessage("Ingresa o escanea un codigo valido.");
      return;
    }

    if (!found) {
      setScanMessage(
        `No encontramos el pedido ${token}. En produccion se validaria contra Supabase.`
      );
      return;
    }

    if (orders.some((order) => order.code === found.code)) {
      setScanMessage(`El pedido ${found.code} ya esta en la cola.`);
      return;
    }

    const shouldBeActive = !orders.some((order) => order.status !== "delivered");
    const nextOrder: DeliveryOrder = {
      ...found,
      status: shouldBeActive ? "active" : "queued",
      scannedAt: new Date().toISOString(),
    };

    setOrders((current) => [...current, nextOrder]);
    setManualToken("");
    setScanMessage(`Pedido ${found.code} agregado a la cola.`);
  }

  function markActiveDelivered() {
    if (!activeOrder) return;

    setOrders((current) => {
      const delivered = current.map((order) =>
        order.id === activeOrder.id
          ? { ...order, status: "delivered" as const }
          : order
      );
      const nextQueued = delivered.find((order) => order.status === "queued");

      if (!nextQueued) return delivered;

      return delivered.map((order) =>
        order.id === nextQueued.id ? { ...order, status: "active" as const } : order
      );
    });
    setDeliveryNote("");
  }

  function removeOrder(orderId: string) {
    setOrders((current) => {
      const next = current.filter((order) => order.id !== orderId);

      if (next.some((order) => order.status === "active")) return next;

      const firstQueued = next.find((order) => order.status === "queued");
      if (!firstQueued) return next;

      return next.map((order) =>
        order.id === firstQueued.id
          ? { ...order, status: "active" as const }
          : order
      );
    });
  }

  function resetSession() {
    stopCamera();
    setOrders([]);
    setDeliveryNote("");
    setScanMessage("Sesion reiniciada.");
  }

  async function startCamera() {
    setCameraError("");

    if (!("BarcodeDetector" in window)) {
      setCameraError(
        "Este navegador no soporta escaneo automatico. Usa la carga manual del codigo."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      streamRef.current = stream;
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      scanLoop();
    } catch {
      setCameraError(
        "No pudimos abrir la camara. Revisa permisos o usa la carga manual."
      );
    }
  }

  async function scanLoop() {
    if (!videoRef.current || scanningRef.current) return;

    scanningRef.current = true;
    const detector = new window.BarcodeDetector!({ formats: ["qr_code"] });

    while (scanningRef.current && videoRef.current) {
      try {
        const codes = await detector.detect(videoRef.current);
        const rawValue = codes[0]?.rawValue;

        if (rawValue) {
          addOrderFromToken(rawValue);
          stopCamera();
          break;
        }
      } catch {
        setCameraError("El escaneo se interrumpio. Intenta nuevamente.");
        stopCamera();
        break;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 450));
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-4 sm:px-8 sm:py-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#66746b]">
            Sesion {sessionToken}
          </p>
          <h1 className="mt-1 text-2xl font-black text-[#171512] sm:text-3xl">
            Retiro de cadeteria
          </h1>
        </div>
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#193d3f] text-white">
          <Bike size={24} />
        </div>
      </header>

      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[#ded7ca] bg-white/80 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#747970]">
            Pedidos
          </p>
          <p className="mt-2 text-3xl font-black">{orders.length}</p>
        </div>
        <div className="rounded-lg border border-[#ded7ca] bg-white/80 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#747970]">
            Cotizado
          </p>
          <p className="mt-2 text-3xl font-black">{formatMoney(totalQuoted)}</p>
        </div>
        <div className="rounded-lg border border-[#ded7ca] bg-white/80 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#747970]">
            Estado
          </p>
          <p className="mt-2 text-lg font-black">
            {activeOrder ? "En reparto" : "Esperando tickets"}
          </p>
        </div>
      </section>

      <div className="mt-5 grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-4">
          <div className="rounded-lg border border-[#ded7ca] bg-white/85 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black">Escanear ticket</h2>
                <p className="mt-1 text-sm text-[#626761]">{scanMessage}</p>
              </div>
              <QrCode className="shrink-0 text-[#d96f32]" size={28} />
            </div>

            {cameraActive ? (
              <div className="mt-4 overflow-hidden rounded-lg bg-black">
                <video
                  ref={videoRef}
                  className="aspect-[4/3] w-full object-cover"
                  muted
                  playsInline
                />
              </div>
            ) : (
              <button
                onClick={startCamera}
                className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#193d3f] px-4 text-sm font-bold text-white transition active:scale-[0.99]"
              >
                <ScanLine size={19} />
                Abrir camara
              </button>
            )}

            {cameraActive && (
              <button
                onClick={stopCamera}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-md border border-[#cfc6b8] bg-white px-4 text-sm font-bold text-[#193d3f]"
              >
                Cerrar camara
              </button>
            )}

            {cameraError && (
              <div className="mt-3 flex items-start gap-2 rounded-md bg-[#fff2d8] p-3 text-sm text-[#7d4b10]">
                <AlertTriangle size={18} />
                <p>{cameraError}</p>
              </div>
            )}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                addOrderFromToken(manualToken);
              }}
              className="mt-4 flex gap-2"
            >
              <input
                value={manualToken}
                onChange={(event) => setManualToken(event.target.value)}
                placeholder="KBL-1542"
                className="min-h-12 min-w-0 flex-1 rounded-md border border-[#cfc6b8] bg-white px-3 text-sm font-semibold outline-none focus:border-[#193d3f]"
              />
              <button className="inline-flex min-h-12 items-center justify-center rounded-md bg-[#d96f32] px-4 text-sm font-bold text-white">
                Agregar
              </button>
            </form>
          </div>

          <div className="rounded-lg border border-[#ded7ca] bg-white/85 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black">Pedido activo</h2>
              {activeOrder ? (
                <span className="rounded-full bg-[#e4f2e7] px-3 py-1 text-xs font-bold text-[#226632]">
                  Visible
                </span>
              ) : (
                <span className="rounded-full bg-[#efe8dc] px-3 py-1 text-xs font-bold text-[#74624e]">
                  Sin pedido
                </span>
              )}
            </div>

            {activeOrder ? (
              <article className="mt-4 space-y-4">
                <div>
                  <p className="text-sm font-bold text-[#d96f32]">
                    {activeOrder.code}
                  </p>
                  <h3 className="mt-1 text-2xl font-black">
                    {activeOrder.customerName}
                  </h3>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoRow icon={MapPin} label="Direccion">
                    {activeOrder.address}
                  </InfoRow>
                  <InfoRow icon={Phone} label="Telefono">
                    {activeOrder.phone}
                  </InfoRow>
                  <InfoRow icon={PackageCheck} label="Pago">
                    {activeOrder.payment}
                  </InfoRow>
                  <InfoRow icon={ShieldCheck} label="Envio cotizado">
                    {formatMoney(activeOrder.quotedPrice)}
                  </InfoRow>
                </div>

                <div className="rounded-md bg-[#f5efe4] p-3">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#74624e]">
                    Notas
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#29241d]">
                    {activeOrder.notes}
                  </p>
                </div>

                <input
                  value={deliveryNote}
                  onChange={(event) => setDeliveryNote(event.target.value)}
                  placeholder="Nota de entrega opcional"
                  className="min-h-12 w-full rounded-md border border-[#cfc6b8] bg-white px-3 text-sm outline-none focus:border-[#193d3f]"
                />

                <button
                  onClick={markActiveDelivered}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#193d3f] px-4 text-sm font-bold text-white transition active:scale-[0.99]"
                >
                  <CheckCircle2 size={19} />
                  Marcar entregado
                </button>
              </article>
            ) : (
              <div className="mt-4 rounded-md bg-[#f5efe4] p-4 text-sm text-[#626761]">
                Escanea el QR del primer ticket para iniciar la entrega.
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-lg border border-[#ded7ca] bg-white/85 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black">Cola</h2>
              <button
                onClick={resetSession}
                className="grid h-10 w-10 place-items-center rounded-md border border-[#cfc6b8] bg-white text-[#74624e]"
                title="Reiniciar sesion"
              >
                <RotateCcw size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {orders.length === 0 && (
                <p className="rounded-md bg-[#f5efe4] p-3 text-sm text-[#626761]">
                  Prueba con codigos demo: KBL-1542, KBL-1543 o KBL-1544.
                </p>
              )}

              {orders.map((order, index) => (
                <QueueCard
                  key={order.id}
                  index={index}
                  order={order}
                  locked={order.status === "queued"}
                  onRemove={() => removeOrder(order.id)}
                />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[#ded7ca] bg-[#193d3f] p-4 text-white shadow-sm">
            <div className="flex items-center gap-2">
              <Clock3 size={19} />
              <h2 className="font-black">Cadeteria externa</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/80">
              Este link puede viajar por WhatsApp con direccion para cotizar.
              La confirmacion fuerte del retiro sigue siendo el QR fisico del
              ticket.
            </p>
            <p className="mt-4 text-sm font-bold">
              Entregados: {deliveredOrders.length}
            </p>
            <p className="mt-1 text-sm font-bold">
              Pendientes: {queuedOrders.length + (activeOrder ? 1 : 0)}
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-[#eadfce] bg-white p-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#747970]">
        <Icon size={15} />
        {label}
      </div>
      <p className="mt-2 text-sm font-bold leading-5 text-[#29241d]">
        {children}
      </p>
    </div>
  );
}

function QueueCard({
  index,
  order,
  locked,
  onRemove,
}: {
  index: number;
  order: DeliveryOrder;
  locked: boolean;
  onRemove: () => void;
}) {
  return (
    <article
      className={`rounded-md border p-3 ${
        order.status === "active"
          ? "border-[#9ec9a8] bg-[#f2fbf4]"
          : order.status === "delivered"
            ? "border-[#ded7ca] bg-white/60 opacity-75"
            : "border-[#ded7ca] bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-[#d96f32]">
            #{index + 1} · {order.code}
          </p>
          <h3 className="mt-1 truncate font-black">{order.customerName}</h3>
        </div>
        <button
          onClick={onRemove}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[#8c5b51]"
          title="Quitar pedido"
        >
          <Trash2 size={17} />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-[#626761]">
        {locked ? <EyeOff size={16} /> : <Eye size={16} />}
        <span>
          {order.status === "delivered"
            ? "Entregado"
            : locked
              ? "Direccion bloqueada hasta entregar el anterior"
              : order.address}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs font-bold uppercase tracking-[0.12em] text-[#747970]">
        <span>{order.neighborhood}</span>
        {order.status === "delivered" && (
          <span className="inline-flex items-center gap-1 text-[#226632]">
            <Check size={14} />
            OK
          </span>
        )}
      </div>
    </article>
  );
}
