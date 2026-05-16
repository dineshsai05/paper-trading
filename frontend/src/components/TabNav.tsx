import { useMarketStore, type View } from "../store/marketStore";

const TABS: { id: View; label: string }[] = [
  { id: "chart",        label: "Markets" },
  { id: "portfolio",    label: "Portfolio" },
  { id: "historical",   label: "Time Travel" },   // NEW
  { id: "history",      label: "History" },
];

export function TabNav() {
  const { view, setView } = useMarketStore();
  return (
    <div className="flex gap-1">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setView(t.id)}
          className={`px-3 py-1.5 text-xs rounded ${
            view === t.id
              ? "bg-[#1e222d] text-gray-100"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}