import type {
  Instrument, Candle, Interval,
  Order, PortfolioData, Side, OrderType, Trade, HistoricalPortfolio
} from "../types";
import { useAuthStore } from "../store/authStore";

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api";

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(
  path: string,
  options: RequestInit = {}
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...authHeaders(), // ✅ always attach token
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    if (res.status === 401) {
      useAuthStore.getState().logout();
      throw new Error("Unauthorized");
    }

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        detail = body.detail || detail;
      } catch {}
      throw new Error(detail);
    }

    return res.json();
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error("Request timeout");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  // ---- public ----
  instruments: (): Promise<Instrument[]> =>
    request("/instruments"),

  candles: (
    symbol: string,
    interval: Interval,
    limit = 500
  ): Promise<Candle[]> =>
    request(`/candles/${symbol}?interval=${interval}&limit=${limit}`),

  marketStatus: (): Promise<{ open: boolean }> =>
    request("/market-status"),

  // ---- auth ----
  signup: (email: string, password: string) =>
    request("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  login: async (email: string, password: string) => {
    const res = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    // ✅ handle multiple backend formats safely
    const token = res.token || res.access_token;

    if (!token) {
      throw new Error("Token missing in response");
    }

    useAuthStore.getState().setToken(token);

    return res;
  },

  // ---- protected ----
  placeOrder: (payload: {
    symbol: string;
    side: Side;
    qty: number;
    order_type: OrderType;
    limit_price?: number;
  }): Promise<Order> =>
    request("/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  orders: (): Promise<Order[]> =>
    request("/orders"),

  cancelOrder: (id: string): Promise<Order> =>
    request(`/orders/${id}`, {
      method: "DELETE",
    }),

  modifyOrder: (
    id: string,
    payload: { qty?: number; limit_price?: number }
  ): Promise<Order> =>
    request(`/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  portfolio: (): Promise<PortfolioData> =>
    request("/portfolio"),

  trades: (filters?: {
    symbol?: string;
    side?: Side;
    start?: string;
    end?: string;
    limit?: number;
  }): Promise<Trade[]> => {
    const params = new URLSearchParams();

    if (filters?.symbol) params.set("symbol", filters.symbol);
    if (filters?.side) params.set("side", filters.side);
    if (filters?.start) params.set("start", filters.start);
    if (filters?.end) params.set("end", filters.end);
    if (filters?.limit) params.set("limit", String(filters.limit));

    return request(`/trades${params.toString() ? "?" + params : ""}`);
  },

  watchlist: (): Promise<{
    symbol: string;
    yahoo_symbol: string;
    name: string;
  }[]> =>
    request("/watchlist"),

  searchSymbols: (q: string): Promise<{
    symbol: string;
    yahoo_symbol: string;
    name: string;
    exchange: string | null;
  }[]> =>
    request(`/watchlist/search?q=${encodeURIComponent(q)}`),

  addToWatchlist: (payload: {
    symbol: string;
    yahoo_symbol: string;
    name: string;
  }): Promise<any> =>
    request("/watchlist", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  removeFromWatchlist: (symbol: string): Promise<any> =>
    request(`/watchlist/${symbol}`, {
      method: "DELETE",
    }),

  portfolioAt: (ts: string): Promise<HistoricalPortfolio> =>
  request(`/portfolio/at?ts=${encodeURIComponent(ts)}`),
};