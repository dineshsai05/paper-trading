from collections import deque
from datetime import datetime, timezone
from typing import Dict, Deque, Tuple

INTERVAL_SECONDS = {
    "1m":  60,
    "5m":  300,
    "15m": 900,
    "1h":  3600,
    "1D":  86400,
}

class Candle:
    __slots__ = ("time", "open", "high", "low", "close")
    def __init__(self, ts: int, price: float):
        self.time = ts
        self.open = price
        self.high = price
        self.low  = price
        self.close = price

    def update(self, price: float):
        self.close = price
        if price > self.high: self.high = price
        if price < self.low:  self.low  = price

    def to_dict(self):
        return {"time": self.time, "open": self.open, "high": self.high,
                "low": self.low, "close": self.close}


def bucket(ts: int, interval: str) -> int:
    return (ts // INTERVAL_SECONDS[interval]) * INTERVAL_SECONDS[interval]


class CandleStore:
    """Per-symbol, per-interval rolling OHLC."""
    def __init__(self, max_per_interval: int = 500):
        self.max = max_per_interval
        self._data: Dict[Tuple[str, str], Deque[Candle]] = {}

    def on_tick(self, symbol: str, price: float, ts: int) -> Dict[str, Candle]:
        """Returns {interval: updated_candle} for broadcasting."""
        updated = {}
        for interval in INTERVAL_SECONDS:
            key = (symbol, interval)
            dq = self._data.setdefault(key, deque(maxlen=self.max))
            b = bucket(ts, interval)
            if dq and dq[-1].time == b:
                dq[-1].update(price)
            else:
                dq.append(Candle(b, price))
            updated[interval] = dq[-1]
        return updated

    def get(self, symbol: str, interval: str, limit: int = 500):
        key = (symbol, interval)
        dq = self._data.get(key, deque())
        return [c.to_dict() for c in list(dq)[-limit:]]