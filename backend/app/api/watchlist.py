from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import select
import yfinance as yf
import asyncio

from app.db import db_session
from app.db_models import InstrumentDB, WatchlistDB
from app.auth.deps import get_current_user_id
from app.market.instruments import INSTRUMENTS
from app.market.yahoo_feed import fetch_latest_price
from app.state import state

router = APIRouter()


class SearchResult(BaseModel):
    symbol: str
    yahoo_symbol: str
    name: str
    exchange: str | None = None


class AddRequest(BaseModel):
    symbol: str
    yahoo_symbol: str
    name: str


@router.get("/watchlist")
def list_watchlist(user_id: str = Depends(get_current_user_id)):
    """Return the user's watchlist. If empty, seed with the default INSTRUMENTS."""
    with db_session() as s:
        rows = s.execute(
            select(WatchlistDB)
            .where(WatchlistDB.user_id == user_id)
            .order_by(WatchlistDB.added_at)
        ).scalars().all()

        if not rows:
            # First-time user: seed with default list
            for inst in INSTRUMENTS:
                s.add(WatchlistDB(
                    user_id=user_id,
                    symbol=inst["symbol"],
                    yahoo_symbol=inst["yahoo"],
                    name=inst["name"],
                ))
            s.flush()
            rows = s.execute(
                select(WatchlistDB)
                .where(WatchlistDB.user_id == user_id)
                .order_by(WatchlistDB.added_at)
            ).scalars().all()

        return [
            {
                "symbol": r.symbol,
                "yahoo_symbol": r.yahoo_symbol,
                "name": r.name,
            }
            for r in rows
        ]


@router.post("/watchlist", status_code=201)
def add_to_watchlist(
    req: AddRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Add a symbol to the user's watchlist."""
    symbol = req.symbol.strip().upper()
    yahoo_symbol = req.yahoo_symbol.strip()
    name = req.name.strip() or symbol

    if not symbol or not yahoo_symbol:
        raise HTTPException(400, "symbol and yahoo_symbol are required")

    base_price = fetch_latest_price(yahoo_symbol)

    with db_session() as s:
        existing = s.get(WatchlistDB, (user_id, symbol))
        if existing:
            raise HTTPException(409, "Already in watchlist")

        if not s.get(InstrumentDB, symbol):
            s.add(InstrumentDB(
                symbol=symbol,
                name=name,
                base_price=base_price if base_price is not None else 100,
            ))

        s.add(WatchlistDB(
            user_id=user_id,
            symbol=symbol,
            yahoo_symbol=yahoo_symbol,
            name=name,
        ))

    feed = state.feed
    if feed is not None and hasattr(feed, "warm_symbol"):
        try:
            feed.warm_symbol(symbol, yahoo_symbol, base_price)
        except TypeError:
            feed.warm_symbol(symbol, yahoo_symbol)
        except Exception as e:
            print(f"[watchlist] quote warm failed for {symbol}: {e}")

    return {
        "symbol": symbol,
        "yahoo_symbol": yahoo_symbol,
        "name": name,
    }


@router.delete("/watchlist/{symbol}")
def remove_from_watchlist(
    symbol: str,
    user_id: str = Depends(get_current_user_id),
):
    with db_session() as s:
        row = s.get(WatchlistDB, (user_id, symbol.upper()))
        if not row:
            raise HTTPException(404, "Not in watchlist")
        s.delete(row)
    return {"removed": symbol.upper()}


@router.get("/watchlist/search")
async def search_symbols(q: str, user_id: str = Depends(get_current_user_id)):
    """Search Yahoo for NSE/BSE-listed symbols only."""
    q = q.strip()
    if len(q) < 1:
        return []

    def blocking_search():
        try:
            search = yf.Search(q, max_results=20)
            quotes = search.quotes
        except Exception as e:
            print(f"[search] yf.Search failed for {q!r}: {e}")
            return []

        results = []
        for quote in quotes:
            ysym = quote.get("symbol", "")
            if not ysym:
                continue

            exch_raw = quote.get("exchDisp") or quote.get("exchange") or ""

            is_nse = ysym.endswith(".NS") or exch_raw == "NSI"
            is_bse = ysym.endswith(".BO") or exch_raw in ("Bombay", "BSE", "BOM")

            if not (is_nse or is_bse):
                continue

            name = (
                quote.get("longname")
                or quote.get("shortname")
                or quote.get("name")
                or ysym
            )
            exchange = "NSE" if is_nse else "BSE"
            display = ysym.rsplit(".", 1)[0] if "." in ysym else ysym

            results.append({
                "symbol": display,
                "yahoo_symbol": ysym,
                "name": name,
                "exchange": exchange,
            })
        return results

    try:
        results = await asyncio.to_thread(blocking_search)
    except Exception as e:
        raise HTTPException(500, f"Search failed: {e}")

    return results
