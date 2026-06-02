import type { KdsOrderEventType, KdsOrderPayload } from "./kdsRealtime";

export async function publishOrderRealtimeEvent(options: {
  tenantId?: string | null;
  branchId?: string | null;
  eventType: KdsOrderEventType;
  payload: KdsOrderPayload;
}) {
  if (!options.tenantId || !options.branchId) return;

  try {
    await fetch("/api/realtime-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: options.tenantId,
        branchId: options.branchId,
        eventType: options.eventType,
        payload: options.payload,
      }),
    });
  } catch (error) {
    console.warn("Order realtime publish failed:", error);
  }
}
