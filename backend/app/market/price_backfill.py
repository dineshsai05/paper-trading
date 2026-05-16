"""Backfill historical 1m candles from Yahoo into price_history table.

Run manually:  python -m app.market.price_backfill
Idempotent — safe to re-run anytime.
"""

import asyncio
from datetime import datetime, timezone
from sqlalchemy.dialects.postgresql import insert as pg_insert
from app.db import db_session
from app.db_models import PriceHistoryDB
from app.market.instruments import INSTRUMENTS
from app.market.yahoo_feed import YahooFeed


async def backfill_recent(days: int = 7):
    """Pull last `days` of 1m candles from Yahoo for every instrument."""
    feed = YahooFeed()
    total = 0

    for inst in INSTRUMENTS:
        symbol = inst["symbol"]
        try:
            candles = await feed.load_history(symbol, "1m", days=days)
        except Exception as e:
            print(f"[backfill] {symbol} fetch error: {e}")
            continue

        if not candles:
            print(f"[backfill] {symbol}: no data")
            continue

        rows = [
            {
                "symbol": symbol,
                "ts": datetime.fromtimestamp(c["time"], tz=timezone.utc),
                "open": c["open"],
                "high": c["high"],
                "low": c["low"],
                "close": c["close"],
            }
            for c in candles
        ]

        with db_session() as s:
            stmt = pg_insert(PriceHistoryDB).values(rows)
            stmt = stmt.on_conflict_do_nothing(index_elements=["symbol", "ts"])
            s.execute(stmt)

        print(f"[backfill] {symbol}: {len(rows)} candles")
        total += len(rows)

    print(f"[backfill] done — {total} total rows processed")


if __name__ == "__main__":
    asyncio.run(backfill_recent(days=7))