import asyncio
import time as time_mod
from datetime import datetime as dt, timezone as tz
from typing import Dict
import yfinance as yf
from sqlalchemy import select, func
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.market.feed import PriceFeed
from app.market.hours import is_market_open
from app.state import state
from app.db import db_session
from app.db_models import WatchlistDB, PriceHistoryDB

POLL_INTERVAL_S = 5
source_name = "yahoo"


def _fast_info_value(fast_info, *keys):
    for key in keys:
        try:
            value = getattr(fast_info, key, None)
        except Exception:
            value = None
        if value is not None:
            return value

        try:
            value = fast_info.get(key)
        except Exception:
            value = None
        if value is not None:
            return value
    return None


def fetch_latest_price(yahoo_symbol: str) -> float | None:
    """Fetch one latest Yahoo price synchronously for ad-hoc quote warming."""
    try:
        ticker = yf.Ticker(yahoo_symbol)
        price = _fast_info_value(
            ticker.fast_info,
            "last_price",
            "regular_market_price",
            "regularMarketPrice",
        )
        if price is not None:
            return float(price)

        hist = ticker.history(period="5d", interval="1d", prepost=False)
        if not hist.empty:
            close = hist["Close"].dropna()
            if not close.empty:
                return float(close.iloc[-1])
    except Exception as e:
        print(f"[yahoo] quote error {yahoo_symbol}: {type(e).__name__}: {e}")
    return None


class YahooFeed(PriceFeed):
    """Polls Yahoo Finance every POLL_INTERVAL_S for the union of all users'
    watchlist symbols. Symbol set refreshes from DB every poll cycle."""

    source_name = "yahoo"

    def __init__(self):
        self._prices: Dict[str, float] = {}     # display_symbol -> price
        self._yahoo_to_our: Dict[str, str] = {} # yahoo_symbol -> display_symbol
        self._task = None
        self._last_successful_fetch = 0.0

    @property
    def prices(self) -> Dict[str, float]:
        return self._prices

    @property
    def is_healthy(self) -> bool:
        return (time_mod.time() - self._last_successful_fetch) < 60

    @property
    def last_update_ago_s(self) -> float:
        return (
            time_mod.time() - self._last_successful_fetch
            if self._last_successful_fetch
            else -1
        )

    async def start(self):
        await self._fetch_once()
        self._task = asyncio.create_task(self._run())

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    def _refresh_symbol_map(self):
        """Read all unique symbols from the watchlist table.
        Returns dict: yahoo_symbol -> display_symbol."""
        with db_session() as s:
            rows = s.execute(
                select(WatchlistDB.symbol, WatchlistDB.yahoo_symbol).distinct()
            ).all()
        return {row.yahoo_symbol: row.symbol for row in rows}

    async def _fetch_once(self) -> bool:
        # Refresh which symbols to poll (catches new additions/removals)
        self._yahoo_to_our = self._refresh_symbol_map()
        yahoo_syms = list(self._yahoo_to_our.keys())

        if not yahoo_syms:
            # No one has anything watched yet
            self._last_successful_fetch = time_mod.time()
            return True

        def blocking_fetch():
            result = {}
            for ysym in yahoo_syms:
                try:
                    price = fetch_latest_price(ysym)
                    if price is not None:
                        result[ysym] = float(price)
                except Exception as e:
                    print(f"[yahoo] {ysym} error: {type(e).__name__}: {e}")
                    continue
            return result

        try:
            result = await asyncio.to_thread(blocking_fetch)
        except Exception as e:
            print(f"[yahoo] fetch error: {e}")
            return False

        if not result:
            return False

        ts = int(time_mod.time())
        first_fetch = self._last_successful_fetch == 0.0

        emitted = 0
        for ysym, price in result.items():
            our_sym = self._yahoo_to_our[ysym]
            old_price = self._prices.get(our_sym)
            self._prices[our_sym] = round(price, 2)

            if first_fetch or old_price != price:
                updated = state.candles.on_tick(our_sym, price, ts)
                await state.ws_hub.broadcast_tick(our_sym, price, ts, updated)
                state.engine.on_tick(our_sym, price)
                emitted += 1

        self._persist_prices(result, ts)

        print(f"[yahoo] {len(result)}/{len(yahoo_syms)} symbols, {emitted} ticks")
        self._last_successful_fetch = time_mod.time()
        return True

    def warm_symbol(
        self,
        symbol: str,
        yahoo_symbol: str | None = None,
        price: float | None = None,
    ) -> float | None:
        """Fetch and cache a quote immediately for a newly added/watchlisted symbol."""
        symbol = symbol.upper()
        ysym = yahoo_symbol
        if ysym is None:
            self._yahoo_to_our = self._refresh_symbol_map()
            for candidate, display_symbol in self._yahoo_to_our.items():
                if display_symbol == symbol:
                    ysym = candidate
                    break
        if ysym is None:
            ysym = symbol

        if price is None:
            price = fetch_latest_price(ysym)
        if price is None and "." not in ysym:
            ns_price = fetch_latest_price(f"{ysym}.NS")
            if ns_price is not None:
                ysym = f"{ysym}.NS"
                price = ns_price
        if price is None:
            return None

        self._yahoo_to_our[ysym] = symbol
        self._prices[symbol] = round(price, 2)
        self._persist_prices({ysym: price}, int(time_mod.time()))
        return self._prices[symbol]
    
    async def _run(self):
        """Main poll loop. Polls every POLL_INTERVAL_S during market hours,
        every 60s when closed."""
        while True:
            try:
                if is_market_open():
                    await self._fetch_once()
                    await asyncio.sleep(POLL_INTERVAL_S)
                else:
                    await self._fetch_once()
                    await asyncio.sleep(60)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                print(f"[yahoo] loop error: {e}")
                await asyncio.sleep(POLL_INTERVAL_S)

    def _persist_prices(self, result: dict, ts: int):
        """Upsert into price_history (1m buckets)."""
        ts_dt = dt.fromtimestamp(ts, tz=tz.utc)
        ts_minute = ts_dt.replace(second=0, microsecond=0)

        rows = [
            {
                "symbol": self._yahoo_to_our[ysym],
                "ts": ts_minute,
                "open": price,
                "high": price,
                "low": price,
                "close": price,
            }
            for ysym, price in result.items()
        ]

        if not rows:
            return

        try:
            with db_session() as s:
                stmt = pg_insert(PriceHistoryDB).values(rows)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["symbol", "ts"],
                    set_={
                        "high": func.greatest(PriceHistoryDB.high, stmt.excluded.high),
                        "low": func.least(PriceHistoryDB.low, stmt.excluded.low),
                        "close": stmt.excluded.close,
                    },
                )
                s.execute(stmt)
        except Exception as e:
            print(f"[yahoo] persist error: {e}")

    async def load_history(self, symbol: str, interval: str = "1m", days: int = 1):
        """Load history from Yahoo. Looks up yahoo_symbol from the cache;
        falls back to .NS suffix for unknown symbols."""
        ysym = None
        for y, our in self._yahoo_to_our.items():
            if our == symbol.upper():
                ysym = y
                break

        if ysym is None:
            # Symbol not in any watchlist yet (e.g. user is exploring before adding)
            # Try plain symbol — works for US stocks
            ysym = symbol.upper()

        yahoo_interval_map = {
            "1m": "1m", "5m": "5m", "15m": "15m", "1h": "60m", "1D": "1d",
        }
        yi = yahoo_interval_map.get(interval, "1m")

        period_map = {
            "1m": "5d", "5m": "60d", "15m": "60d", "1h": "730d", "1D": "5y",
        }
        period = period_map.get(interval, "1d")

        def blocking_fetch():
            ticker = yf.Ticker(ysym)
            hist = ticker.history(period=period, interval=yi, prepost=False)
            if hist.empty:
                # Try .NS as a fallback for Indian stocks
                if not ysym.endswith(".NS"):
                    hist = yf.Ticker(f"{ysym}.NS").history(period=period, interval=yi, prepost=False)
            if hist.empty:
                return []
            candles = []
            for idx, row in hist.iterrows():
                candles.append({
                    "time": int(idx.timestamp()),
                    "open": float(row["Open"]),
                    "high": float(row["High"]),
                    "low": float(row["Low"]),
                    "close": float(row["Close"]),
                })
            return candles

        try:
            return await asyncio.to_thread(blocking_fetch)
        except Exception as e:
            print(f"[yahoo] history error {symbol} {interval}: {e}")
            return []
