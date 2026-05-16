import { useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useMarketStore } from "../store/marketStore";
import type { HistoricalPortfolio as HistData } from "../types";

const fmtINR = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function HistoricalPortfolio() {
  const [tsInput, setTsInput] = useState("");
  const [data, setData] = useState<HistData | null>(null);
  const [loading, setLoading] = useState(false);

  const setSymbol = useMarketStore((s) => s.setSymbol);
  const setView = useMarketStore((s) => s.setView);

  const presets = [
    { label: "1 hour ago", offsetMs: 60 * 60 * 1000 },
    { label: "1 day ago", offsetMs: 24 * 60 * 60 * 1000 },
    { label: "1 week ago", offsetMs: 7 * 24 * 60 * 60 * 1000 },
    { label: "1 month ago", offsetMs: 30 * 24 * 60 * 60 * 1000 },
  ];

  const setPreset = (offsetMs: number) => {
    const target = new Date(Date.now() - offsetMs);
    // datetime-local input wants format: YYYY-MM-DDTHH:MM
    // Adjust for local timezone offset so the picker shows local time
    const localISO = new Date(target.getTime() - target.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setTsInput(localISO);
  };

  const fetchHistorical = async () => {
    if (!tsInput) {
      toast.error("Pick a date and time first");
      return;
    }
    setLoading(true);
    try {
      // Convert local datetime input to ISO with timezone
      const isoTs = new Date(tsInput).toISOString();
      const result = await api.portfolioAt(isoTs);
      setData(result);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load historical portfolio");
    } finally {
      setLoading(false);
    }
  };

  const openSymbol = (symbol: string) => {
    setSymbol(symbol);
    setView("chart");
  };

  // Compute summary if we have data
  const summary = data && (() => {
    const invested = data.holdings.reduce((s, h) => s + h.avg_price * h.qty, 0);
    const currentValue = data.holdings.reduce((s, h) => s + h.ltp * h.qty, 0);
    const totalPnl = currentValue - invested;
    const totalEquity = data.cash + currentValue;
    const pnlPct = invested > 0 ? (totalPnl / invested) * 100 : 0;
    return { invested, currentValue, totalPnl, totalEquity, pnlPct };
  })();

  return (
    <div className="space-y-4">
      {/* Picker */}
      <div className="bg-[#131722] border border-[#1e222d] rounded p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-sm font-semibold">Historical Portfolio</h3>
          <span className="text-xs text-gray-500">
            See what your portfolio looked like at a past moment
          </span>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => setPreset(p.offsetMs)}
              className="px-3 py-1 text-xs rounded bg-[#1e222d] hover:bg-[#262b36] text-gray-300"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs text-gray-500 mb-1">
              Date & time
            </label>
            <input
              type="datetime-local"
              value={tsInput}
              onChange={(e) => setTsInput(e.target.value)}
              className="w-full bg-[#1e222d] text-gray-200 px-3 py-2 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={fetchHistorical}
            disabled={loading || !tsInput}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Loading..." : "View"}
          </button>
          {data && (
            <button
              onClick={() => { setData(null); setTsInput(""); }}
              className="px-3 py-2 bg-[#1e222d] hover:bg-[#262b36] text-gray-300 text-sm rounded"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Result */}
      {data && summary && (
        <>
          <div className="text-xs text-gray-400">
            Snapshot as of <span className="text-gray-200 font-medium">
              {new Date(data.as_of).toLocaleString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="Total Equity" value={`₹${fmtINR(summary.totalEquity)}`} />
            <SummaryCard label="Cash" value={`₹${fmtINR(data.cash)}`} />
            <SummaryCard label="Invested" value={`₹${fmtINR(summary.invested)}`} />
            <SummaryCard
              label="P&L at That Time"
              value={`${summary.totalPnl >= 0 ? "+" : ""}₹${fmtINR(summary.totalPnl)}`}
              sub={`${summary.totalPnl >= 0 ? "+" : ""}${summary.pnlPct.toFixed(2)}%`}
              color={summary.totalPnl >= 0 ? "text-green-400" : "text-red-400"}
            />
          </div>

          <div className="bg-[#131722] border border-[#1e222d] rounded">
            <div className="px-4 py-3 border-b border-[#1e222d] text-sm font-semibold">
              Holdings ({data.holdings.length})
            </div>
            {data.holdings.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                No holdings at that time
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-gray-500 border-b border-[#1e222d]">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Symbol</th>
                      <th className="text-right px-4 py-2 font-medium">Qty</th>
                      <th className="text-right px-4 py-2 font-medium">Avg Cost</th>
                      <th className="text-right px-4 py-2 font-medium">Price Then</th>
                      <th className="text-right px-4 py-2 font-medium">Value</th>
                      <th className="text-right px-4 py-2 font-medium">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.holdings.map((h) => {
                      const value = h.ltp * h.qty;
                      const invested = h.avg_price * h.qty;
                      const pct = invested > 0 ? (h.pnl / invested) * 100 : 0;
                      const pnlColor = h.pnl >= 0 ? "text-green-400" : "text-red-400";
                      return (
                        <tr
                          key={h.symbol}
                          onClick={() => openSymbol(h.symbol)}
                          className="border-b border-[#1e222d] last:border-0 hover:bg-[#1a1f2a] cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3 font-medium">{h.symbol}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{h.qty}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-400">
                            {h.avg_price.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {h.ltp.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {fmtINR(value)}
                          </td>
                          <td className={`px-4 py-3 text-right tabular-nums ${pnlColor}`}>
                            <div>{h.pnl >= 0 ? "+" : ""}{fmtINR(h.pnl)}</div>
                            <div className="text-xs">
                              {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Empty state */}
      {!data && !loading && (
        <div className="bg-[#131722] border border-[#1e222d] rounded p-10 text-center">
          <div className="text-4xl mb-3">⏱️</div>
          <div className="text-sm text-gray-300 mb-1">
            Pick a moment in time
          </div>
          <div className="text-xs text-gray-500">
            Use a preset or pick a date manually
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label, value, sub, color = "text-gray-100",
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-[#131722] border border-[#1e222d] rounded p-4 min-w-0">
      <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">
        {label}
      </div>
      <div className={`text-lg font-semibold tabular-nums truncate ${color}`}>
        {value}
      </div>
      {sub && (
        <div className={`text-xs tabular-nums mt-0.5 ${color}`}>{sub}</div>
      )}
    </div>
  );
}