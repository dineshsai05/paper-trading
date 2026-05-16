import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { marketSocket } from "../lib/ws";
import { useMarketStore } from "../store/marketStore";

interface WatchlistItem {
  symbol: string;
  yahoo_symbol: string;
  name: string;
}

interface SearchResult {
  symbol: string;
  yahoo_symbol: string;
  name: string;
  exchange: string | null;
}

export function Watchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const { selectedSymbol, view, prices, setSymbol, setView, updatePrice } =
    useMarketStore();

  const loadWatchlist = async () => {
    try {
      const list = await api.watchlist();
      setItems(list);
      list.forEach((i) => marketSocket.subscribe(i.symbol));
    } catch (e: any) {
      console.error("Watchlist load failed:", e);
    }
  };

  useEffect(() => {
    loadWatchlist();
    const unsub = marketSocket.on((msg) => {
      updatePrice(msg.symbol, msg.price);
    });
    return () => { unsub(); };
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query || query.length < 1) {
      setSearchResults([]);
      return;
    }
    const handler = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.searchSymbols(query);
        setSearchResults(res);
      } catch (e: any) {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(handler);
  }, [query]);

  const handleClick = (symbol: string) => {
    setSymbol(symbol);
    setView("chart");
  };

  const handleAdd = async (r: SearchResult) => {
    try {
      await api.addToWatchlist({
        symbol: r.symbol,
        yahoo_symbol: r.yahoo_symbol,
        name: r.name,
      });
      toast.success(`Added ${r.symbol}`);
      setQuery("");
      setSearchResults([]);
      setSearchOpen(false);
      marketSocket.subscribe(r.symbol);
      await loadWatchlist();
    } catch (e: any) {
      toast.error(e?.message || "Failed to add");
    }
  };

  const handleRemove = async (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.removeFromWatchlist(symbol);
      toast.info(`Removed ${symbol}`);
      marketSocket.unsubscribe(symbol);
      await loadWatchlist();
    } catch (e: any) {
      toast.error(e?.message || "Failed to remove");
    }
  };

  return (
    <div className="w-64 bg-[#131722] border-r border-[#1e222d] overflow-y-auto flex flex-col">
      <div className="p-3 flex justify-between items-center border-b border-[#1e222d]">
        <span className="text-xs uppercase tracking-wider text-gray-500">
          Watchlist
        </span>
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className="text-gray-400 hover:text-gray-100 text-lg leading-none w-5 h-5 flex items-center justify-center"
          title="Add symbol"
        >
          {searchOpen ? "×" : "+"}
        </button>
      </div>

      {searchOpen && (
        <div className="p-2 border-b border-[#1e222d]">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            placeholder="e.g. RELIANCE, TCS, AAPL"
            className="w-full bg-[#1e222d] text-gray-200 px-2 py-1 rounded text-sm outline-none focus:ring-1 focus:ring-blue-500"
          />
          {searching && (
            <div className="px-2 py-2 text-xs text-gray-500">Searching...</div>
          )}
          {!searching && query && searchResults.length === 0 && (
            <div className="px-2 py-2 text-xs text-gray-500">No matches</div>
          )}
          {searchResults.map((r) => (
            <button
              key={r.yahoo_symbol}
              onClick={() => handleAdd(r)}
              className="w-full text-left px-2 py-1.5 mt-1 hover:bg-[#1e222d] rounded text-sm"
            >
              <div className="flex justify-between">
                <span className="text-gray-200 font-medium">{r.symbol}</span>
                <span className="text-xs text-gray-500">{r.exchange ?? ""}</span>
              </div>
              <div className="text-xs text-gray-500 truncate">{r.name}</div>
            </button>
          ))}
        </div>
      )}

      {items.length === 0 && (
        <div className="p-3 text-xs text-gray-500">Loading...</div>
      )}

      {items.map((i) => (
        <div
          key={i.symbol}
          onClick={() => handleClick(i.symbol)}
          className={`group w-full flex justify-between items-center px-3 py-2 text-sm hover:bg-[#1e222d] cursor-pointer ${
            selectedSymbol === i.symbol && view === "chart" ? "bg-[#1e222d]" : ""
          }`}
        >
          <span className="text-gray-200 truncate">{i.symbol}</span>
          <div className="flex items-center gap-2">
            <span className="text-gray-400 tabular-nums">
              {prices[i.symbol]?.toFixed(2) ?? "--"}
            </span>
            <button
              onClick={(e) => handleRemove(i.symbol, e)}
              className="text-gray-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100"
              title="Remove"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}