import { RealtimeClient, type RealtimeConnectionState, type RealtimeEvent } from "./realtimeClient";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

export const KDS_ORDER_EVENT_TYPES = [
  "orders.created",
  "orders.accepted",
  "orders.confirmed",
  "orders.preparing",
  "orders.ready",
  "orders.sent",
  "orders.delivered",
  "orders.cancelled",
] as const;

export type KdsOrderEventType = (typeof KDS_ORDER_EVENT_TYPES)[number];

export type KdsOrderPayload = {
  orderId: string;
  status?: string;
  previousStatus?: string;
  order?: Record<string, unknown>;
};

export type KdsRealtimeStatus = RealtimeConnectionState | "disabled";

export function createKdsRealtimeClient(options: {
  tenantId: string;
  branchId: string;
  url?: string;
}) {
  const url = options.url || process.env.NEXT_PUBLIC_REALTIME_WS_URL;
  if (!url) return null;

  const client = new RealtimeClient({
    url,
    tokenProvider: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const response = await fetch(`/api/realtime-token?branchId=${encodeURIComponent(options.branchId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await response.json();
      if (!response.ok || !data.token) {
        throw new Error(data.error || "realtime_token_unavailable");
      }
      return data.token;
    },
  });

  client.subscribe({
    tenantId: options.tenantId,
    branchId: options.branchId,
    eventTypes: [...KDS_ORDER_EVENT_TYPES],
  });

  return client;
}

export function isKdsOrderEvent(event: RealtimeEvent): event is RealtimeEvent<KdsOrderPayload> {
  return KDS_ORDER_EVENT_TYPES.includes(event.eventType as KdsOrderEventType);
}

export function publishKdsOrderEvent(
  client: RealtimeClient | null | undefined,
  scope: { tenantId?: string | null; branchId?: string | null },
  eventType: KdsOrderEventType,
  payload: KdsOrderPayload,
) {
  if (!client || !scope.tenantId || !scope.branchId) return;

  client.publish({
    tenantId: scope.tenantId,
    branchId: scope.branchId,
    eventType,
    payload,
  });
}
