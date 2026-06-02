export type RealtimeConnectionState = "idle" | "connecting" | "connected" | "disconnected";

export type RealtimeEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  tenantId: string;
  branchId: string;
  eventType: string;
  timestamp: number;
  payload: TPayload;
};

type Subscription = {
  tenantId: string;
  branchId: string;
  eventTypes?: string[];
};

type Listener<T> = (value: T) => void;

type RealtimeClientOptions = {
  url: string;
  tokenProvider: () => string | Promise<string>;
  heartbeatIntervalMs?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
};

export class RealtimeClient {
  private socket?: WebSocket;
  private state: RealtimeConnectionState = "idle";
  private shouldReconnect = true;
  private reconnectAttempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private subscriptions = new Map<string, Subscription>();
  private eventListeners = new Set<Listener<RealtimeEvent>>();
  private stateListeners = new Set<Listener<RealtimeConnectionState>>();
  private errorListeners = new Set<Listener<string>>();

  constructor(private readonly options: RealtimeClientOptions) {}

  async connect() {
    this.shouldReconnect = true;
    this.setState("connecting");

    const token = await this.options.tokenProvider();
    const url = new URL(this.options.url);
    url.searchParams.set("token", token);

    this.socket = new WebSocket(url);
    this.socket.addEventListener("open", () => this.handleOpen());
    this.socket.addEventListener("message", (message) => this.handleMessage(message.data));
    this.socket.addEventListener("close", () => this.handleClose());
    this.socket.addEventListener("error", () => this.emitError("websocket_error"));
  }

  disconnect() {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    this.clearReconnect();
    this.socket?.close();
    this.socket = undefined;
    this.setState("disconnected");
  }

  subscribe(subscription: Subscription) {
    this.subscriptions.set(`${subscription.tenantId}:${subscription.branchId}`, subscription);
    this.send({ action: "subscribe", ...subscription });
  }

  publish(event: Omit<RealtimeEvent, "timestamp"> & { timestamp?: number }) {
    this.send({
      action: "publish",
      event: {
        ...event,
        timestamp: event.timestamp ?? Date.now(),
      },
    });
  }

  onEvent(listener: Listener<RealtimeEvent>) {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onStateChange(listener: Listener<RealtimeConnectionState>) {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  onError(listener: Listener<string>) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  private handleOpen() {
    this.reconnectAttempts = 0;
    this.setState("connected");
    this.startHeartbeat();

    for (const subscription of this.subscriptions.values()) {
      this.send({ action: "subscribe", ...subscription });
    }
  }

  private handleClose() {
    this.stopHeartbeat();
    this.socket = undefined;
    this.setState("disconnected");

    if (this.shouldReconnect) {
      this.scheduleReconnect();
    }
  }

  private handleMessage(raw: unknown) {
    if (typeof raw !== "string") return;

    try {
      const message = JSON.parse(raw);
      if (message.type === "event") {
        for (const listener of this.eventListeners) listener(message.event);
      }
      if (message.type === "error") {
        this.emitError(message.error);
      }
    } catch {
      this.emitError("invalid_server_message");
    }
  }

  private send(payload: unknown) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(payload));
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ action: "heartbeat" });
    }, this.options.heartbeatIntervalMs ?? 25000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private scheduleReconnect() {
    this.clearReconnect();
    const base = this.options.reconnectBaseDelayMs ?? 500;
    const max = this.options.reconnectMaxDelayMs ?? 10000;
    const delay = Math.min(max, base * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      void this.connect().catch((error) =>
        this.emitError(error instanceof Error ? error.message : "reconnect_failed"),
      );
    }, delay);
  }

  private clearReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private setState(state: RealtimeConnectionState) {
    this.state = state;
    for (const listener of this.stateListeners) listener(state);
  }

  private emitError(error: string) {
    for (const listener of this.errorListeners) listener(error);
  }
}
