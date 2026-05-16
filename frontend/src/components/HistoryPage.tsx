import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useMarketStore } from "../store/marketStore";
import type { Trade, Order, Side } from "../types";

type Tab = "trades" | "orders" | "rejected";

const fmtINR = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
};

export function HistoryPage() {
  const [tab, setTab] = useState<Tab>("trades");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  // filters
  const [symbolFilter, setSymbolFilter] = useState("");
  const [sideFilter, setSideFilter] = useState<"" | Side>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const setSymbol = useMarketStore((s) => s.setSymbol);
  const setView = useMarketStore((s) => s.setView);

  const loadTrades = async () => {
    setLoading(true);
    try {
      const data = await api.trades({
        symbol: symbolFilter || undefined,
        side: sideFilter || undefined,
        start: startDate || undefined,
        end: endDate || undefined,
      });
      setTrades(data);
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await api.orders();
      setOrders(data.slice().reverse()); // newest first
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "trades") loadTrades();
    else loadOrders();
  }, [tab]);

  // local filter for orders (no backend filter yet for orders; trivial client-side)
  const filteredOrders = useMemo(() => {
    let list = orders;
    if (tab === "rejected") list = list.filter((o) => o.status === "REJECTED");
    if (symbolFilter) list = list.filter((o) => o.symbol === symbolFilter.toUpperCase());
    if (sideFilter) list = list.filter((o) => o.side === sideFilter);
    return list;
  }, [orders, tab, symbolFilter, sideFilter]);

  const clearFilters = () => {
  setSymbolFilter("");
  setSideFilter("");
  setStartDate("");
  setEndDate("");
  // reload happens automatically via useEffect below
};

// Keep the simple tab-based reload:
useEffect(() => {
  if (tab === "trades") loadTrades();
  else loadOrders();
}, [tab]);

// Add a second effect that reloads when filters clear to empty:
useEffect(() => {
  const allEmpty = !symbolFilter && !sideFilter && !startDate && !endDate;
  if (allEmpty && tab === "trades") loadTrades();
}, [symbolFilter, sideFilter, startDate, endDate]);

  const openSymbol = (s: string) => {
    setSymbol(s);
    setView("chart");
  };

  const tradeStats = useMemo(() => {
    const totalBuys = trades.filter((t) => t.side === "BUY").length;
    const totalSells = trades.filter((t) => t.side === "SELL").length;
    const volume = trades.reduce((s, t) => s + t.qty * t.price, 0);
    return { totalBuys, totalSells, volume };
  }, [trades]);

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#1e222d]">
        {([
          ["trades", "Trades"],
          ["orders", "All Orders"],
          ["rejected", "Rejected"],
        ] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm transition-colors ${
              tab === id
                ? "text-gray-100 border-b-2 border-blue-500 -mb-px"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-[#131722] border border-[#1e222d] rounded p-3 flex flex-wrap items-end gap-3">
        <FilterField label="Symbol">
          <input
            type="text"
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value.toUpperCase())}
            placeholder="e.g. RELIANCE"
            className="bg-[#1e222d] text-gray-200 px-2 py-1 rounded text-sm w-36 outline-none focus:ring-1 focus:ring-blue-500"
          />
        </FilterField>
        <FilterField label="Side">
          <select
            value={sideFilter}
            onChange={(e) => setSideFilter(e.target.value as any)}
            className="bg-[#1e222d] text-gray-200 px-2 py-1 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All</option>
            <option value="BUY">Buy</option>
            <option value="SELL">Sell</option>
          </select>
        </FilterField>
        {tab === "trades" && (
          <>
            <FilterField label="From">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-[#1e222d] text-gray-200 px-2 py-1 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
              />
            </FilterField>
            <FilterField label="To">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-[#1e222d] text-gray-200 px-2 py-1 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
              />
            </FilterField>
          </>
        )}

        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => (tab === "trades" ? loadTrades() : loadOrders())}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
          >
            Apply
          </button>
          <button
            onClick={clearFilters}
            className="px-3 py-1 bg-[#1e222d] hover:bg-[#262b36] text-gray-300 rounded text-sm"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Content */}
      {tab === "trades" && (
        <TradesView
          trades={trades}
          loading={loading}
          stats={tradeStats}
          fmtDate={fmtDate}
          openSymbol={openSymbol}
        />
      )}
      {(tab === "orders" || tab === "rejected") && (
        <OrdersView
          orders={filteredOrders}
          loading={loading}
          openSymbol={openSymbol}
          fmtDate={fmtDate}
          emptyMsg={
            tab === "rejected"
              ? "No rejected orders — clean record 👏"
              : "No orders match these filters"
          }
        />
      )}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      {children}
    </div>
  );
}

function TradesView({
  trades, loading, stats, fmtDate, openSymbol,
}: {
  trades: Trade[];
  loading: boolean;
  stats: { totalBuys: number; totalSells: number; volume: number };
  fmtDate: (s: string) => string;
  openSymbol: (s: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Trades" value={String(trades.length)} />
        <StatCard
          label="Buys / Sells"
          value={`${stats.totalBuys} / ${stats.totalSells}`}
        />
        <StatCard label="Total Volume" value={`₹${fmtINR(stats.volume)}`} />
      </div>

      <div className="bg-[#131722] border border-[#1e222d] rounded">
        <div className="px-4 py-3 border-b border-[#1e222d] text-sm font-semibold">
          Executed Trades
        </div>
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-500">Loading...</div>
        ) : trades.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No trades found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-gray-500 border-b border-[#1e222d]">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Time</th>
                  <th className="text-left px-4 py-2 font-medium">Symbol</th>
                  <th className="text-left px-4 py-2 font-medium">Side</th>
                  <th className="text-right px-4 py-2 font-medium">Qty</th>
                  <th className="text-right px-4 py-2 font-medium">Price</th>
                  <th className="text-right px-4 py-2 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => openSymbol(t.symbol)}
                    className="border-b border-[#1e222d] last:border-0 hover:bg-[#1a1f2a] cursor-pointer"
                  >
                    <td className="px-4 py-2 text-gray-400">{fmtDate(t.executed_at)}</td>
                    <td className="px-4 py-2 font-medium">{t.symbol}</td>
                    <td
                      className={`px-4 py-2 ${
                        t.side === "BUY" ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {t.side}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{t.qty}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {t.price.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {fmtINR(t.qty * t.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function OrdersView({
  orders, loading, openSymbol, fmtDate, emptyMsg,
}: {
  orders: Order[];
  loading: boolean;
  openSymbol: (s: string) => void;
  fmtDate: (s: string) => string;
  emptyMsg: string;
}) {
  return (
    <div className="bg-[#131722] border border-[#1e222d] rounded">
      <div className="px-4 py-3 border-b border-[#1e222d] text-sm font-semibold">
        Orders ({orders.length})
      </div>
      {loading ? (
        <div className="p-6 text-center text-sm text-gray-500">Loading...</div>
      ) : orders.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-500">{emptyMsg}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-gray-500 border-b border-[#1e222d]">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Time</th>
                <th className="text-left px-4 py-2 font-medium">Symbol</th>
                <th className="text-left px-4 py-2 font-medium">Side</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-right px-4 py-2 font-medium">Qty</th>
                <th className="text-right px-4 py-2 font-medium">Limit</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => openSymbol(o.symbol)}
                  className="border-b border-[#1e222d] last:border-0 hover:bg-[#1a1f2a] cursor-pointer"
                >
                  <td className="px-4 py-2 text-gray-400">{fmtDate(o.placed_at)}</td>
                  <td className="px-4 py-2 font-medium">{o.symbol}</td>
                  <td
                    className={`px-4 py-2 ${
                      o.side === "BUY" ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {o.side}
                  </td>
                  <td className="px-4 py-2 text-gray-400">{o.order_type}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{o.qty}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {o.limit_price ? o.limit_price.toFixed(2) : "—"}
                  </td>
                  <td
                    className={`px-4 py-2 ${
                      o.status === "FILLED"
                        ? "text-green-400"
                        : o.status === "REJECTED"
                        ? "text-red-400"
                        : o.status === "CANCELLED"
                        ? "text-gray-500"
                        : "text-yellow-400"
                    }`}
                  >
                    {o.status}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {o.reject_reason || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#131722] border border-[#1e222d] rounded p-3">
      <div className="text-xs uppercase text-gray-500 mb-1">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}