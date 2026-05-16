import { useMarketStore } from "../store/marketStore";
import type { Interval } from "../types";

const INTERVALS: Interval[] = ["1m", "5m", "15m", "1h", "1D"];

export function IntervalSwitcher() {
  const { interval, setInterval } = useMarketStore();
  return (
    <div className="flex gap-1">
      {INTERVALS.map((iv) => (
        <button
          key={iv}
          onClick={() => setInterval(iv)}
          className={`px-3 py-1 text-xs rounded ${
            interval === iv ? "bg-blue-600 text-white" : "bg-[#1e222d] text-gray-400"
          }`}
        >
          {iv}
        </button>
      ))}
    </div>
  );
}