import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { marketSocket } from "../lib/ws";
import type { PortfolioData } from "../types";

export function Portfolio({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<PortfolioData | null>(null);
  const heldSymbols = useRef<Set<string>>(new Set());

  const reload = () => {
    api.portfolio().then((d) => {
      setData(d);
      heldSymbols.current = new Set(d.holdings.map(h => h.symbol));
    });
  };

  useEffect(() => { reload(); }, [refreshKey]);

  useEffect(() => {
    const unsub = marketSocket.on((msg) => {
      if (heldSymbols.current.has(msg.symbol)) reload();
    });
    return () => { unsub(); };
  }, []);

  if (!data) return null;
  const totalPnl = data.holdings.reduce((s, h) => s + h.pnl, 0);

  return (
    <div className="p-4 bg-[#131722] border border-[#1e222d] rounded">
      <div className="flex justify-between text-sm mb-3">
        <span className="text-gray-400">Cash</span>
        <span className="tabular-nums">₹{data.cash.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-sm mb-3 pb-3 border-b border-[#1e222d]">
        <span className="text-gray-400">Total P&L</span>
        <span className={`tabular-nums ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
          ₹{totalPnl.toFixed(2)}
        </span>
      </div>
      <div className="text-xs uppercase text-gray-500 mb-2">Holdings</div>
      {data.holdings.length === 0 ? (
        <div className="text-xs text-gray-500">No positions</div>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-gray-500">
            <tr><th className="text-left">Sym</th><th className="text-right">Qty</th>
                <th className="text-right">Avg</th><th className="text-right">LTP</th>
                <th className="text-right">P&L</th></tr>
          </thead>
          <tbody>
            {data.holdings.map(h => (
              <tr key={h.symbol}>
                <td>{h.symbol}</td>
                <td className="text-right tabular-nums">{h.qty}</td>
                <td className="text-right tabular-nums">{h.avg_price.toFixed(2)}</td>
                <td className="text-right tabular-nums">{h.ltp.toFixed(2)}</td>
                <td className={`text-right tabular-nums ${h.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {h.pnl.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}