import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Interval } from "../types";

export type View = "chart" | "portfolio" | "history" | "historical";

interface MarketState {
  selectedSymbol: string;
  interval: Interval;
  view: View;
  prices: Record<string, number>;
  setSymbol: (s: string) => void;
  setInterval: (i: Interval) => void;
  setView: (v: View) => void;
  updatePrice: (symbol: string, price: number) => void;
  setPrices: (prices: Record<string, number>) => void;
}

export const useMarketStore = create<MarketState>()(
  persist(
    (set) => ({
      selectedSymbol: "RELIANCE",
      interval: "1m",
      view: "chart",
      prices: {},
      setSymbol: (s) => set({ selectedSymbol: s }),
      setInterval: (i) => set({ interval: i }),
      setView: (v) => set({ view: v }),
      updatePrice: (symbol, price) =>
        set((s) => ({ prices: { ...s.prices, [symbol]: price } })),
      setPrices: (prices) => set({ prices }),
    }),
    {
      name: "market",
      // don't persist volatile tick prices
      partialize: (s) => ({
        selectedSymbol: s.selectedSymbol,
        interval: s.interval,
        view: s.view,
      }),
    }
  )
);