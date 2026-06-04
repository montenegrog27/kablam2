import type { KdsOrderEventType, KdsOrderPayload } from "./kdsRealtime";
import { supabaseBrowser as supabase } from "@kablam/supabase/client";

export async function publishOrderRealtimeEvent(options: {
  tenantId?: string | null;
  branchId?: string | null;
  eventType: KdsOrderEventType;
  payload: KdsOrderPayload;
}) {
  if (!options.tenantId || !options.branchId) return;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    await fetch("/api/realtime-events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
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
