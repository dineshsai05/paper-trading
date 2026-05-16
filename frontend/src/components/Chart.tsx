import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { api } from "../lib/api";
import { marketSocket } from "../lib/ws";
import { useMarketStore } from "../store/marketStore";

export function Chart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const { selectedSymbol, interval } = useMarketStore();

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
  layout: { background: { color: "#0b0e14" }, textColor: "#d1d4dc" },
  grid: {
    vertLines: { color: "#1e222d" },
    horzLines: { color: "#1e222d" },
  },
  timeScale: {
    timeVisible: true,
    secondsVisible: false,
    // NEW: display in browser's local timezone (IST for you)
    tickMarkFormatter: (time: number) => {
      const date = new Date(time * 1000);
      return date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    },
  },
  localization: {
    timeFormatter: (time: number) => {
      const date = new Date(time * 1000);
      return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    },
  },
  width: containerRef.current.clientWidth,
  height: 500,
    });
    const series = chart.addSeries(CandlestickSeries);
    chartRef.current = chart;
    seriesRef.current = series;

    const onResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
    };
  }, []);

  // Load history + subscribe when symbol/interval changes
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    let cancelled = false;

    api.candles(selectedSymbol, interval).then((candles) => {
      if (cancelled) return;
      series.setData(
        candles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
    });

    marketSocket.subscribe(selectedSymbol);
    const unsub = marketSocket.on((msg) => {
      if (msg.symbol !== selectedSymbol) return;
      const c = msg.candles[interval];
      if (!c) return;
      series.update({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      });
    });

    return () => {
      cancelled = true;
      marketSocket.unsubscribe(selectedSymbol);
      unsub();
    };
  }, [selectedSymbol, interval]);

  return <div ref={containerRef} className="w-full" />;
}