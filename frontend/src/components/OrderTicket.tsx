import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useMarketStore } from "../store/marketStore";
import type { Side, OrderType, PortfolioData } from "../types";

const QTY_SHORTCUTS = [1, 10, 50, 100];
const STEP_PCT = 0.5; // each "step" = 0.5%
// Each button: label and how many steps it adds to `steps` counter
const PRICE_STEPS: { label: string; delta: number; sign: "+" | "-" }[] = [
  { label: "-1%",   delta: -2, sign: "-" },
  { label: "-0.5%", delta: -1, sign: "-" },
  { label: "+0.5%", delta: +1, sign: "+" },
  { label: "+1%",   delta: +2, sign: "+" },
];

export function OrderTicket({
  onOrderPlaced,
  refreshKey,
}: {
  onOrderPlaced: () => void;
  refreshKey: number;
}) {
  const { selectedSymbol, prices } = useMarketStore();
  const [side, setSide] = useState<Side>("BUY");
  const [qty, setQty] = useState(1);
  const [type, setType] = useState<OrderType>("MARKET");
  const [limitPrice, setLimitPrice] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [marketOpen, setMarketOpen] = useState<boolean>(true);
  // Anchor = the price at the moment LIMIT mode was entered (or user typed a custom value)
  // steps = number of 0.5% increments away from anchor (can be negative)
  const [anchor, setAnchor] = useState<number | null>(null);
  const [steps, setSteps] = useState(0);

  const ltp = prices[selectedSymbol];

  // Track which (symbol, type) combination we've already anchored for
  const anchoredForRef = useRef<string | null>(null);

  useEffect(() => {
    const tick = () => api.marketStatus().then((s) => setMarketOpen(s.open));
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  // Set / reset anchor when the user enters LIMIT mode (per symbol)
  useEffect(() => {
    const key = `${selectedSymbol}:${type}`;

    if (type === "LIMIT") {
      if (anchoredForRef.current !== key && ltp) {
        // Fresh entry to LIMIT mode for this symbol: snapshot LTP as anchor
        setAnchor(ltp);
        setSteps(0);
        setLimitPrice(ltp.toFixed(2));
        anchoredForRef.current = key;
      }
    } else {
      // Switched to MARKET — forget anchor so next LIMIT re-anchors fresh
      anchoredForRef.current = null;
      setAnchor(null);
      setSteps(0);
    }
  }, [type, selectedSymbol, ltp]);

  useEffect(() => {
    api.portfolio().then(setPortfolio).catch(() => {});
  }, [refreshKey]);

  // Apply a stepper button
  const bumpSteps = (delta: number) => {
    // If user manually typed something that diverged from anchor, re-anchor from that typed value
    if (anchor === null) {
      const typed = Number(limitPrice);
      if (!typed || typed <= 0) {
        toast.error("Enter a price first");
        return;
      }
      setAnchor(typed);
      const newSteps = delta;
      setSteps(newSteps);
      setLimitPrice((typed * (1 + (newSteps * STEP_PCT) / 100)).toFixed(2));
      return;
    }
    const newSteps = steps + delta;
    setSteps(newSteps);
    setLimitPrice((anchor * (1 + (newSteps * STEP_PCT) / 100)).toFixed(2));
  };

  // Manual typing breaks anchor-tracking (user took over)
  const handleLimitChange = (val: string) => {
    setLimitPrice(val);
    setAnchor(null);
    setSteps(0);
  };

  // Derived
  const priceForEstimate =
    type === "LIMIT" && limitPrice ? Number(limitPrice) : ltp ?? 0;
  const estTotal = qty * priceForEstimate;

  const cash = portfolio?.cash ?? 0;
  const heldQty =
    portfolio?.holdings.find((h) => h.symbol === selectedSymbol)?.qty ?? 0;
  const remainingCash = side === "BUY" ? cash - estTotal : cash + estTotal;
  const cashShort = side === "BUY" && estTotal > cash;
  const sharesShort = side === "SELL" && qty > heldQty;
  const willReject = cashShort || sharesShort;

  // Side label for the price (e.g. "+1.5% from ₹2858.10")
  const deltaPct = steps * STEP_PCT;
  const deltaLabel =
    anchor !== null && steps !== 0
      ? `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}% from ₹${anchor.toFixed(2)}`
      : anchor !== null
      ? `at anchor ₹${anchor.toFixed(2)}`
      : null;

  const submit = async () => {
    if (busy) return;
    if (!marketOpen) {
      toast.error("Market is closed");
      return;
    }
    if (qty <= 0) {
      toast.error("Quantity must be positive");
      return;
    }
    if (type === "LIMIT" && (!limitPrice || Number(limitPrice) <= 0)) {
      toast.error("Enter a valid limit price");
      return;
    }

    setBusy(true);
    try {
      const res = await api.placeOrder({
        symbol: selectedSymbol,
        side,
        qty,
        order_type: type,
        limit_price: type === "LIMIT" ? Number(limitPrice) : undefined,
      });

      if (res.status === "FILLED") {
        toast.success(`${side} ${res.qty} ${res.symbol} filled`);
      } else if (res.status === "OPEN") {
        toast.info(
          `${side} ${res.qty} ${res.symbol} placed (limit ₹${res.limit_price?.toFixed(2)})`
        );
      } else if (res.status === "REJECTED") {
        toast.error(`Rejected: ${res.reject_reason ?? "Unknown reason"}`);
      }

      onOrderPlaced();
    } catch (e: any) {
      toast.error(e?.message || "Error placing order");
    } finally {
      setBusy(false);
    }
  };

  return (
    
    <div className="p-4 bg-[#131722] border border-[#1e222d] rounded">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-semibold">{selectedSymbol}</div>
        {ltp && (
          <div className="text-xs text-gray-400 tabular-nums">
            ₹{ltp.toFixed(2)}
          </div>
        )}
      </div>

      {!marketOpen && (
        <div className="mb-3 p-2 bg-yellow-900/30 border border-yellow-700/50 rounded text-xs text-yellow-300">
          Market is closed. Orders can't be placed right now.
        </div>
      )}

      {/* BUY / SELL */}
      <div className="flex gap-2 mb-3">
        {(["BUY", "SELL"] as Side[]).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
              side === s
                ? s === "BUY"
                  ? "bg-green-600 text-white"
                  : "bg-red-600 text-white"
                : "bg-[#1e222d] text-gray-400 hover:text-gray-200"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* MARKET / LIMIT */}
      <div className="flex gap-2 mb-3">
        {(["MARKET", "LIMIT"] as OrderType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`flex-1 py-1 rounded text-xs transition-colors ${
              type === t
                ? "bg-blue-600 text-white"
                : "bg-[#1e222d] text-gray-400 hover:text-gray-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Qty */}
      <label className="block text-xs text-gray-400 mb-1">Quantity</label>
      <input
        type="number"
        value={qty}
        min={1}
        onChange={(e) => setQty(parseInt(e.target.value) || 1)}
        className="w-full mb-2 bg-[#1e222d] text-gray-200 px-2 py-1 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
      />
      <div className="flex gap-1 mb-3">
        {QTY_SHORTCUTS.map((n) => (
          <button
            key={n}
            onClick={() => setQty(n)}
            className="flex-1 py-1 text-xs bg-[#1e222d] hover:bg-[#262b36] text-gray-300 rounded"
          >
            {n}
          </button>
        ))}
      </div>

      {/* Limit price */}
      {type === "LIMIT" && (
        <>
          <div className="flex justify-between items-baseline mb-1">
            <label className="text-xs text-gray-400">Limit Price</label>
            {deltaLabel && (
              <span
                className={`text-xs tabular-nums ${
                  deltaPct > 0
                    ? "text-green-400"
                    : deltaPct < 0
                    ? "text-red-400"
                    : "text-gray-500"
                }`}
              >
                {deltaLabel}
              </span>
            )}
          </div>
          <input
            type="number"
            step="0.01"
            value={limitPrice}
            onChange={(e) => handleLimitChange(e.target.value)}
            className="w-full mb-2 bg-[#1e222d] text-gray-200 px-2 py-1 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Enter price"
          />
          <div className="flex gap-1 mb-3">
            {PRICE_STEPS.map((btn) => (
              <button
                key={btn.label}
                onClick={() => bumpSteps(btn.delta)}
                className={`flex-1 py-1 text-xs rounded transition-colors ${
                  btn.sign === "-"
                    ? "bg-[#1e222d] hover:bg-red-900/40 text-red-300"
                    : "bg-[#1e222d] hover:bg-green-900/40 text-green-300"
                }`}
                title={`Adjust ${btn.label} from anchor`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Cost preview */}
      <div className="mb-3 p-2 bg-[#0b0e14] border border-[#1e222d] rounded text-xs space-y-1">
        <Row label="Estimated Total" value={`₹${estTotal.toFixed(2)}`} />
        {side === "BUY" && (
          <Row
            label="After Trade (Cash)"
            value={`₹${remainingCash.toFixed(2)}`}
            color={cashShort ? "text-red-400" : "text-gray-300"}
          />
        )}
        {side === "SELL" && (
          <Row
            label="Holdings"
            value={`${heldQty} ${heldQty === 1 ? "share" : "shares"}`}
            color={sharesShort ? "text-red-400" : "text-gray-300"}
          />
        )}
      </div>

      {willReject && (
        <div className="mb-3 text-xs text-red-400">
          {cashShort && "Insufficient cash for this order"}
          {sharesShort && `You only hold ${heldQty} shares of ${selectedSymbol}`}
        </div>
      )}

      <button
        onClick={submit}
        disabled={busy || !marketOpen}
        className={`w-full py-2 rounded text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          side === "BUY"
            ? "bg-green-600 hover:bg-green-700"
            : "bg-red-600 hover:bg-red-700"
        } text-white`}
      >
        {busy
          ? "Placing..."
          : !marketOpen
          ? "Market Closed"
          : `Place ${side} ${type}`}
      </button>
    </div>
  );
}

function Row({
  label,
  value,
  color = "text-gray-300",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={`tabular-nums ${color}`}>{value}</span>
    </div>
  );
}