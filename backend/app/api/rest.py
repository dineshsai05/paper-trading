from fastapi import APIRouter, HTTPException, Query
from app.market.instruments import INSTRUMENTS
from app.market.simulator import is_market_open
from app.state import state

router = APIRouter()


@router.get("/instruments")
def list_instruments():
    # Strip the yahoo field from the client response (internal detail)
    return [
        {"symbol": i["symbol"], "name": i["name"]}
        for i in INSTRUMENTS
    ]


@router.get("/market-status")
def market_status():
    return {"open": is_market_open()}


@router.get("/quote/{symbol}")
def quote(symbol: str):
    sym = symbol.upper()
    price = state.feed.prices.get(sym)
    if price is None:
        raise HTTPException(404, "Unknown symbol")
    return {"symbol": sym, "price": price}


@router.get("/candles/{symbol}")
async def candles(symbol: str, interval: str = "1m", limit: int = Query(500, le=500)):
    sym = symbol.upper()

    # Try loading history from the feed if it supports it (YahooFeed does)
    feed = state.feed
    if hasattr(feed, "load_history"):
        history = await feed.load_history(sym, interval)
        if history:
            # Merge with any in-memory candles that accumulated since startup
            in_mem = state.candles.get(sym, interval, limit)
            # Dedupe by time — in-memory wins (it's fresher)
            in_mem_times = {c["time"] for c in in_mem}
            merged = [c for c in history if c["time"] not in in_mem_times] + in_mem
            merged.sort(key=lambda c: c["time"])
            return merged[-limit:]

    # Fallback: in-memory only (simulator mode)
    return state.candles.get(sym, interval, limit)

@router.get("/feed-status")
def feed_status():
    feed = state.feed
    return {
        "source": getattr(feed, "source_name", "simulator"),
        "healthy": getattr(feed, "is_healthy", True),
        "last_update_ago_s": getattr(feed, "last_update_ago_s", 0),
    }