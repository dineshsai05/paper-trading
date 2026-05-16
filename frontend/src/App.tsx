import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { Chart } from "./components/Chart";
import { Watchlist } from "./components/Watchlist";
import { IntervalSwitcher } from "./components/IntervalSwitcher";
import { MarketStatus } from "./components/MarketStatus";
import { OrderTicket } from "./components/OrderTicket";
import { OrdersPanel } from "./components/OrdersPanel";
import { Portfolio } from "./components/Portfolio";
import { PortfolioPage } from "./components/PortfolioPage";
import { TabNav } from "./components/TabNav";
import { AuthPage } from "./components/AuthPage";
import { marketSocket } from "./lib/ws";
import { useMarketStore } from "./store/marketStore";
import { useAuthStore } from "./store/authStore";
import { HistoryPage } from "./components/HistoryPage";
import { HistoricalPortfolio } from "./components/HistoricalPortfolio";

export default function App() {
  const { selectedSymbol, view } = useMarketStore();
  const { token, email, logout } = useAuthStore();
  const [refresh, setRefresh] = useState(0);
  const bumpRefresh = () => setRefresh((r) => r + 1);

  useEffect(() => {
    if (token) marketSocket.connect();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const id = setInterval(bumpRefresh, 2000);
    return () => clearInterval(id);
  }, [token]);

  if (!token) {
    return (
      <>
        <AuthPage />
        <Toaster
          position="top-right"
          theme="dark"
          toastOptions={{
            style: { background: "#131722", border: "1px solid #1e222d", color: "#d1d4dc" },
          }}
        />
      </>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#0b0e14] text-gray-200">
      <header className="h-12 border-b border-[#1e222d] flex items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <div className="font-semibold">Paper Trading</div>
          <TabNav />
        </div>
        <div className="flex items-center gap-4">
          <MarketStatus />
          <span className="text-xs text-gray-400">{email}</span>
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-red-400"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <Watchlist />

        <main className="flex-1 p-4 overflow-auto">
          {view === "chart" && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">{selectedSymbol}</h2>
                <IntervalSwitcher />
              </div>
              <Chart />
              <div className="mt-4">
                <OrdersPanel refreshKey={refresh} />
              </div>
            </>
          )}

          {view === "portfolio" && <PortfolioPage refreshKey={refresh} />}

          {view === "history" && <HistoryPage />}

          {view === "historical" && <HistoricalPortfolio />}
        </main>

        <aside className="w-80 border-l border-[#1e222d] p-4 space-y-4 overflow-y-auto">
          <OrderTicket onOrderPlaced={bumpRefresh} refreshKey={refresh} />
          <Portfolio refreshKey={refresh} />
        </aside>
      </div>

      <Toaster
        position="top-right"
        theme="dark"
        toastOptions={{
          style: { background: "#131722", border: "1px solid #1e222d", color: "#d1d4dc" },
        }}
      />
    </div>
  );
}