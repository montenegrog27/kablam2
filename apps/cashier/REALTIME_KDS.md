# KDS realtime

Cashier KDS uses WebSocket as the browser realtime channel and the Kablam realtime server as the MQTT/WebSocket gateway.

## Required environment

```env
NEXT_PUBLIC_REALTIME_WS_URL=ws://localhost:8080/ws
REALTIME_HTTP_URL=http://localhost:8080
REALTIME_JWT_SECRET=change-me-in-production
```

`REALTIME_JWT_SECRET` must match the `JWT_SECRET` configured in `kablam-realtime-server`.

## Flow

1. KDS loads current orders from Supabase.
2. KDS connects to `NEXT_PUBLIC_REALTIME_WS_URL` with a short-lived JWT from `/api/realtime-token`.
3. KDS subscribes to `orders.*` events for the selected tenant and branch.
4. Cashier actions publish order events through `/api/realtime-events`.
5. The realtime server broadcasts events over WebSocket and MQTT.
6. KDS refreshes immediately when an order event arrives.

Supabase Realtime remains as a fallback, and polling now runs every 60 seconds as a safety net instead of every 10 seconds.
