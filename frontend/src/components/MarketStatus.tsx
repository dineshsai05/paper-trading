import { useEffect, useState } from "react";
import { api } from "../lib/api";

interface FeedStatus {
  source: string;
  healthy: boolean;
  last_update_ago_s: number;
}

export function MarketStatus() {
  const [open, setOpen] = useState<boolean | null>(null);
  const [feed, setFeed] = useState<FeedStatus | null>(null);

  useEffect(() => {
    const tick = () => {
      api.marketStatus().then((s) => setOpen(s.open));
      fetch("http://localhost:8000/api/feed-status")
        .then((r) => r.json())
        .then(setFeed)
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, []);

  if (open === null) return null;

  const unhealthy = feed && !feed.healthy;

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className={`flex items-center gap-2 ${open ? "text-green-400" : "text-gray-500"}`}>
        <span className={`w-2 h-2 rounded-full ${open ? "bg-green-400" : "bg-gray-500"}`} />
        {open ? "Market Open" : "Market Closed"}
      </span>
      {feed && (
        <span
          className={`flex items-center gap-1.5 ${
            unhealthy ? "text-yellow-400" : "text-gray-500"
          }`}
          title={
            unhealthy
              ? `Last data ${feed.last_update_ago_s.toFixed(0)}s ago`
              : `Live data from ${feed.source}`
          }
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              unhealthy ? "bg-yellow-400" : "bg-gray-500"
            }`}
          />
          {feed.source}
          {unhealthy && " (stale)"}
        </span>
      )}
    </div>
  );
}