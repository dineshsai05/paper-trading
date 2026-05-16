import asyncio
import random
import time as time_mod
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Dict
from app.config import settings
from app.market.instruments import INSTRUMENTS
from app.market.feed import PriceFeed
from app.state import state
from app.market.hours import is_market_open


IST = ZoneInfo("Asia/Kolkata")


class MarketSimulator(PriceFeed):
    """Random-walk price simulator. In-memory, no external dependencies."""
    source_name = "simulator"
    is_healthy = True
    last_update_ago_s = 0

    STARTING_PRICES = {
        "RELIANCE": 2850.0, "TCS": 4100.0, "INFY": 1850.0,
        "HDFCBANK": 1680.0, "ICICIBANK": 1250.0, "SBIN": 820.0,
        "ITC": 465.0, "LT": 3650.0, "WIPRO": 560.0, "AXISBANK": 1140.0,
    }
    
    def __init__(self):
        self._prices = {
            i["symbol"]: self.STARTING_PRICES.get(i["symbol"], 100.0)
            for i in INSTRUMENTS
        }
        self._task = None

    @property
    def prices(self) -> Dict[str, float]:
        return self._prices

    def warm_symbol(self, symbol: str, yahoo_symbol: str | None = None, price: float | None = None) -> float:
        """Register an ad-hoc symbol so orders can be tested in simulator mode too."""
        symbol = symbol.upper()
        if symbol not in self._prices:
            self._prices[symbol] = round(float(price or self.STARTING_PRICES.get(symbol, 100.0)), 2)
        return self._prices[symbol]

    async def start(self):
        self._task = asyncio.create_task(self._run())

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _run(self):
        while True:
            try:
                if is_market_open():
                    ts = int(time_mod.time())
                    for sym, price in self._prices.items():
                        drift = random.gauss(0, price * 0.0008)
                        new_price = max(0.01, price + drift)
                        self._prices[sym] = round(new_price, 2)
                        updated = state.candles.on_tick(sym, new_price, ts)
                        await state.ws_hub.broadcast_tick(sym, new_price, ts, updated)
                        state.engine.on_tick(sym, new_price)
                await asyncio.sleep(settings.tick_interval_ms / 1000)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                print(f"[simulator] tick error: {e}")
                await asyncio.sleep(1)
