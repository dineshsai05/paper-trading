import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { marketSocket } from "../lib/ws";
import { useMarketStore } from "../store/marketStore";
import type { PortfolioData } from "../types";

const fmtINR = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PortfolioPage({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<PortfolioData | null>(null);
  const heldSymbols = useRef<Set<string>>(new Set());
  const setSymbol = useMarketStore((s) => s.setSymbol);
  const setView = useMarketStore((s) => s.setView);

  const reload = () => {
    api.portfolio().then((d) => {
      setData(d);
      heldSymbols.current = new Set(d.holdings.map((h) => h.symbol));
    });
  };

  useEffect(() => { reload(); }, [refreshKey]);
  useEffect(() => {
    const unsub = marketSocket.on((msg) => {
      if (heldSymbols.current.has(msg.symbol)) reload();
    });
    return () => { unsub(); };
  }, []);

  if (!data) return <div className="text-gray-500 text-sm">Loading...</div>;

  const invested = data.holdings.reduce((s, h) => s + h.avg_price * h.qty, 0);
  const currentValue = data.holdings.reduce((s, h) => s + h.ltp * h.qty, 0);
  const totalPnl = currentValue - invested;
  const totalEquity = data.cash + currentValue;
  const pnlPct = invested > 0 ? (totalPnl / invested) * 100 : 0;

  const openHolding = (symbol: string) => {
    setSymbol(symbol);
    setView("chart");
  };

  return (
    <div className="space-y-4">
      {/* Summary strip — auto-fit columns, no clipping */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Total Equity" value={`₹${fmtINR(totalEquity)}`} />
        <SummaryCard label="Cash" value={`₹${fmtINR(data.cash)}`} />
        <SummaryCard label="Invested" value={`₹${fmtINR(invested)}`} />
        <SummaryCard
          label="Total P&L"
          value={`${totalPnl >= 0 ? "+" : ""}₹${fmtINR(totalPnl)}`}
          sub={`${totalPnl >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`}
          color={totalPnl >= 0 ? "text-green-400" : "text-red-400"}
        />
      </div>

      {/* Holdings */}
      <div className="bg-[#131722] border border-[#1e222d] rounded">
        <div className="px-4 py-3 border-b border-[#1e222d] text-sm font-semibold flex justify-between items-center">
          <span>Holdings ({data.holdings.length})</span>
          {data.holdings.length > 0 && (
            <span className="text-xs text-gray-500 font-normal">
              Click a row to open chart
            </span>
          )}
        </div>

        {data.holdings.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-sm text-gray-400 mb-1">No positions yet</div>
            <div className="text-xs text-gray-500">
              Switch to Markets and place your first order
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-gray-500 border-b border-[#1e222d]">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Symbol</th>
                  <th className="text-right px-4 py-2 font-medium">Qty</th>
                  <th className="text-right px-4 py-2 font-medium">Avg Cost</th>
                  <th className="text-right px-4 py-2 font-medium">LTP</th>
                  <th className="text-right px-4 py-2 font-medium">Invested</th>
                  <th className="text-right px-4 py-2 font-medium">Current</th>
                  <th className="text-right px-4 py-2 font-medium">P&L</th>
                </tr>
              </thead>
              <tbody>
                {data.holdings.map((h) => {
                  const inv = h.avg_price * h.qty;
                  const cur = h.ltp * h.qty;
                  const pct = inv > 0 ? (h.pnl / inv) * 100 : 0;
                  const pnlColor = h.pnl >= 0 ? "text-green-400" : "text-red-400";
                  return (
                    <tr
                      key={h.symbol}
                      onClick={() => openHolding(h.symbol)}
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
                      <td className="px-4 py-3 text-right tabular-nums text-gray-400">
                        {fmtINR(inv)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmtINR(cur)}
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
    </div>
  );
}

function SummaryCard({
  label, value, sub, color = "text-gray-100",
}: {
  label: string; value: string; sub?: string; color?: string;
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