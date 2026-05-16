import type { TickMessage } from "../types";

type Listener = (msg: TickMessage) => void;
type ReconnectListener = () => void;

class MarketSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private reconnectListeners = new Set<ReconnectListener>();
  private subscribed = new Set<string>();
  private reconnectTimer: number | null = null;
  private hasConnectedOnce = false;

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const wsBase =
      import.meta.env.VITE_WS_BASE ||
      `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${
        window.location.host
      }`;
    this.ws = new WebSocket(`${wsBase}/ws/stream`);

    this.ws.onopen = () => {
      // Re-subscribe everything that was subscribed before disconnect
      if (this.subscribed.size > 0) {
        this.send({ action: "subscribe", symbols: [...this.subscribed] });
      }
      // Notify listeners only on a *re*connect (not the first connect)
      if (this.hasConnectedOnce) {
        this.reconnectListeners.forEach((l) => l());
      }
      this.hasConnectedOnce = true;
    };

    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "tick") {
        this.listeners.forEach((l) => l(msg));
      }
    };

    this.ws.onclose = () => {
      this.reconnectTimer = window.setTimeout(() => this.connect(), 2000);
    };
  }

  private send(obj: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  subscribe(symbol: string) {
    this.subscribed.add(symbol);
    this.send({ action: "subscribe", symbols: [symbol] });
  }

  unsubscribe(symbol: string) {
    this.subscribed.delete(symbol);
    this.send({ action: "unsubscribe", symbols: [symbol] });
  }

  on(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onReconnect(listener: ReconnectListener) {
    this.reconnectListeners.add(listener);
    return () => this.reconnectListeners.delete(listener);
  }
}

export const marketSocket = new MarketSocket();
