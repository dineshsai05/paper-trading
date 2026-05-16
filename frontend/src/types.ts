export interface Instrument {
  symbol: string;
  name: string;
}

export interface Candle {
  time: number;  // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export type Interval = "1m" | "5m" | "15m" | "1h" | "1D";

export interface TickMessage {
  type: "tick";
  symbol: string;
  price: number;
  ts: number;
  candles: Record<Interval, Candle>;
}

export type Side = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";
export type OrderStatus = "OPEN" | "FILLED" | "CANCELLED" | "REJECTED";

export interface Order {
  id: string;
  symbol: string;
  side: Side;
  qty: number;
  order_type: OrderType;
  limit_price: number | null;
  status: OrderStatus;
  placed_at: string;
  reject_reason: string | null;
}

export interface HoldingRow {
  symbol: string; qty: number; avg_price: number; ltp: number; pnl: number;
}

export interface PortfolioData {
  cash: number;
  holdings: HoldingRow[];
}

export interface Trade {
  id: string;
  order_id: string;
  user_id: string;
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  executed_at: string;
}

export interface HistoricalPortfolio {
  cash: number;
  holdings: HoldingRow[];
  as_of: string;  // ISO timestamp
}