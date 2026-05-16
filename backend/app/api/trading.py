from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from app.state import state
from app.auth.deps import get_current_user_id
from app.market.hours import is_market_open
from app.trading.engine import price_at

router = APIRouter()


class PlaceOrderRequest(BaseModel):
    symbol: str
    side: str
    qty: int
    order_type: str
    limit_price: Optional[float] = None


class ModifyOrderRequest(BaseModel):
    qty: Optional[int] = None
    limit_price: Optional[float] = None


@router.post("/orders")
def place_order(req: PlaceOrderRequest,
                user_id: str = Depends(get_current_user_id)):
    if not is_market_open():
        raise HTTPException(
            status_code=409,
            detail="Market is closed. Orders can only be placed during market hours.",
        )
    if state.feed is None:
        raise HTTPException(503, "Market not ready")

    symbol = req.symbol.upper()
    current = state.feed.prices.get(symbol)
    if current is None:
        warm_symbol = getattr(state.feed, "warm_symbol", None)
        if warm_symbol is not None:
            current = warm_symbol(symbol)
    if current is None:
        raise HTTPException(404, "Price unavailable for this symbol. Wait a few seconds and try again.")
    if req.order_type == "LIMIT" and req.limit_price is None:
        raise HTTPException(400, "limit_price required for LIMIT orders")

    return state.engine.place_order(
        user_id=user_id,
        symbol=symbol,
        side=req.side,
        qty=req.qty,
        order_type=req.order_type,
        limit_price=req.limit_price,
        current_price=current,
    )


@router.get("/orders")
def list_orders(user_id: str = Depends(get_current_user_id)):
    return state.engine.get_orders(user_id)


@router.delete("/orders/{order_id}")
def cancel_order(order_id: str,
                 user_id: str = Depends(get_current_user_id)):
    o = state.engine.cancel(order_id, user_id)
    if not o:
        raise HTTPException(404, "Order not found")
    return o


@router.patch("/orders/{order_id}")
def modify_order(order_id: str,
                 req: ModifyOrderRequest,
                 user_id: str = Depends(get_current_user_id)):
    o = state.engine.modify(
        order_id=order_id, user_id=user_id,
        new_qty=req.qty, new_limit_price=req.limit_price,
    )
    if not o:
        raise HTTPException(404, "Order not found")
    return o


@router.get("/trades")
def list_trades(
    user_id: str = Depends(get_current_user_id),
    symbol: Optional[str] = None,
    side: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 500,
):
    trades = state.engine.get_trades(user_id)
    if symbol:
        sym = symbol.upper()
        trades = [t for t in trades if t["symbol"] == sym]
    if side:
        trades = [t for t in trades if t["side"] == side.upper()]
    if start:
        try:
            start_dt = datetime.fromisoformat(start)
            trades = [t for t in trades if datetime.fromisoformat(t["executed_at"]) >= start_dt]
        except ValueError:
            raise HTTPException(400, "start must be ISO format YYYY-MM-DD")
    if end:
        try:
            end_dt = datetime.fromisoformat(end)
            trades = [t for t in trades if datetime.fromisoformat(t["executed_at"]) <= end_dt]
        except ValueError:
            raise HTTPException(400, "end must be ISO format YYYY-MM-DD")
    trades.sort(key=lambda t: t["executed_at"], reverse=True)
    return trades[:limit]


@router.get("/portfolio")
def portfolio(user_id: str = Depends(get_current_user_id)):
    return state.engine.get_portfolio(
        user_id,
        price_lookup=lambda s: state.feed.prices.get(s),
    )

@router.get("/portfolio/at")
def portfolio_at(
    ts: str = Query(..., description="ISO timestamp, e.g. 2026-04-20T14:30:00"),
    user_id: str = Depends(get_current_user_id),
):
    try:
        at_ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(400, "ts must be ISO format")

    return state.engine.get_portfolio_at(
        user_id, at_ts,
        price_lookup_at=price_at,    # NEW: real historical lookup
    )
