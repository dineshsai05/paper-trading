from datetime import datetime
from decimal import Decimal
import uuid
from sqlalchemy import select, and_
from app.db import db_session
from app.trading.models import Side, OrderType, OrderStatus
from app.db_models import (
    UserDB,
    InstrumentDB,
    OrderDB,
    TradeDB,
    HoldingDB,
    PriceHistoryDB,
)


def _d(x) -> Decimal:
    """Convert any numeric to Decimal safely (via str to avoid float precision artifacts)."""
    return Decimal(str(x))


class TradingEngine:
    """DB-backed trading engine. All state lives in Postgres.

    Public API matches the Phase 4 in-memory engine so that api/trading.py
    and the frontend continue to work without any changes.
    """

    # ----------------------------------------------------------------------
    # Public API
    # ----------------------------------------------------------------------

    def place_order(self, user_id, symbol, side, qty, order_type,
                    limit_price, current_price):
        symbol = symbol.upper()

        if qty <= 0:
            return self._persist_reject(
                user_id, symbol, side, qty, order_type,
                limit_price, "Qty must be positive"
            )

        with db_session() as s:
            # Lock the user row to prevent cash race conditions on concurrent orders
            user = s.execute(
                select(UserDB).where(UserDB.id == user_id).with_for_update()
            ).scalar_one()

            if not s.get(InstrumentDB, symbol):
                s.add(InstrumentDB(
                    symbol=symbol,
                    name=symbol,
                    base_price=_d(current_price),
                ))
                s.flush()

            order = OrderDB(
                id=str(uuid.uuid4()),
                user_id=user_id,
                symbol=symbol,
                side=Side(side),
                qty=qty,
                order_type=OrderType(order_type),
                limit_price=_d(limit_price) if limit_price is not None else None,
                status=OrderStatus.OPEN,
                placed_at=datetime.utcnow(),
            )
            s.add(order)
            s.flush()

            if order.order_type == OrderType.MARKET:
                self._fill(s, order, _d(current_price), user)
            else:
                # LIMIT: validate up front but keep OPEN for the simulator to fill later
                if order.side == Side.BUY:
                    cost = _d(qty) * _d(limit_price)
                    if user.cash < cost:
                        order.status = OrderStatus.REJECTED
                        order.reject_reason = "Insufficient cash"
                    # NEW: if limit already crosses current price, fill immediately at market
                    elif _d(current_price) <= _d(limit_price):
                        self._fill(s, order, _d(current_price), user)
                elif order.side == Side.SELL:
                    h = s.get(HoldingDB, (user_id, symbol))
                    if not h or h.qty < qty:
                        order.status = OrderStatus.REJECTED
                        order.reject_reason = "Insufficient holdings"
                    # NEW: if limit already crosses, fill at market
                    elif _d(current_price) >= _d(limit_price):
                        self._fill(s, order, _d(current_price), user)

            s.flush()
            return self._order_to_dict(order)

    def cancel(self, order_id: str, user_id: str):
        with db_session() as s:
            o = s.get(OrderDB, order_id)
            if not o or o.user_id != user_id:
                return None
            if o.status == OrderStatus.OPEN:
                o.status = OrderStatus.CANCELLED
            return self._order_to_dict(o)

    def on_tick(self, symbol: str, price: float):
        """Called by the simulator on every price tick.
        Fills any OPEN limit orders for this symbol whose limit has been crossed."""
        price = _d(price)
        with db_session() as s:
            open_orders = s.execute(
                select(OrderDB).where(and_(
                    OrderDB.symbol == symbol,
                    OrderDB.status == OrderStatus.OPEN,
                    OrderDB.order_type == OrderType.LIMIT,
                )).with_for_update()
            ).scalars().all()

            if not open_orders:
                return

            # Group by user to minimize user-row locks
            users_to_lock = {o.user_id for o in open_orders}
            users = {
                u.id: u for u in s.execute(
                    select(UserDB).where(UserDB.id.in_(users_to_lock))
                                  .with_for_update()
                ).scalars().all()
            }

            for o in open_orders:
                should_fill = (
                    (o.side == Side.BUY and price <= o.limit_price) or
                    (o.side == Side.SELL and price >= o.limit_price)
                )
                if should_fill:
                    self._fill(s, o, o.limit_price, users[o.user_id])

    def get_orders(self, user_id):
        with db_session() as s:
            rows = s.execute(
                select(OrderDB)
                .where(OrderDB.user_id == user_id)
                .order_by(OrderDB.placed_at)
            ).scalars().all()
            return [self._order_to_dict(o) for o in rows]

    def get_trades(self, user_id):
        with db_session() as s:
            rows = s.execute(
                select(TradeDB)
                .where(TradeDB.user_id == user_id)
                .order_by(TradeDB.executed_at)
            ).scalars().all()
            return [self._trade_to_dict(t) for t in rows]

    def get_portfolio(self, user_id, price_lookup):
        """price_lookup: callable symbol -> latest price (from simulator)."""
        with db_session() as s:
            user = s.get(UserDB, user_id)
            if not user:
                return {"cash": 0.0, "holdings": []}

            holding_rows = s.execute(
                select(HoldingDB).where(HoldingDB.user_id == user_id)
            ).scalars().all()

            holdings = []
            for h in holding_rows:
                if h.qty == 0:
                    continue
                avg = float(h.avg_price)
                ltp_raw = price_lookup(h.symbol)
                ltp = float(ltp_raw) if ltp_raw is not None else avg
                holdings.append({
                    "symbol": h.symbol,
                    "qty": h.qty,
                    "avg_price": avg,
                    "ltp": ltp,
                    "pnl": (ltp - avg) * h.qty,
                })

            return {"cash": float(user.cash), "holdings": holdings}
        
    def get_portfolio_at(self, user_id: str, at_ts: datetime, price_lookup_at):
        with db_session() as s:
            user = s.get(UserDB, user_id)
            if not user:
                return {"cash": 0.0, "holdings": [], "as_of": at_ts.isoformat()}

            trades = s.execute(
                select(TradeDB).where(
                    TradeDB.user_id == user_id,
                    TradeDB.executed_at <= at_ts,
                ).order_by(TradeDB.executed_at)
            ).scalars().all()

            cash = float(user.starting_cash)
            positions: dict[str, dict] = {}

            for t in trades:
                qty = t.qty
                price = float(t.price)
                cost = qty * price
                if t.side == Side.BUY:
                    cash -= cost
                    p = positions.setdefault(t.symbol, {"qty": 0, "avg_price": 0.0})
                    new_qty = p["qty"] + qty
                    p["avg_price"] = (p["avg_price"] * p["qty"] + cost) / new_qty
                    p["qty"] = new_qty
                else:
                    cash += cost
                    p = positions.setdefault(t.symbol, {"qty": 0, "avg_price": 0.0})
                    p["qty"] -= qty

            holdings = []
            for symbol, p in positions.items():
                if p["qty"] <= 0:
                    continue
                ltp = price_lookup_at(symbol, at_ts) or p["avg_price"]
                holdings.append({
                    "symbol": symbol,
                    "qty": p["qty"],
                    "avg_price": p["avg_price"],
                    "ltp": ltp,
                    "pnl": (ltp - p["avg_price"]) * p["qty"],
                })

            return {"cash": cash, "holdings": holdings, "as_of": at_ts.isoformat()}

    # ----------------------------------------------------------------------
    # Internal helpers
    # ----------------------------------------------------------------------

    def _fill(self, s, order: OrderDB, price: Decimal, user: UserDB):
        """Execute the fill: update cash, update/create holding, write trade row.
        Assumes both `order` and `user` are already attached to session `s`
        and that `user` has been locked with SELECT ... FOR UPDATE."""
        qty = order.qty
        cost = _d(qty) * price

        if order.side == Side.BUY:
            if user.cash < cost:
                order.status = OrderStatus.REJECTED
                order.reject_reason = "Insufficient cash"
                return

            user.cash = user.cash - cost

            h = s.get(HoldingDB, (order.user_id, order.symbol))
            if not h:
                h = HoldingDB(
                    user_id=order.user_id,
                    symbol=order.symbol,
                    qty=0,
                    avg_price=_d(0),
                )
                s.add(h)

            new_qty = h.qty + qty
            # weighted-avg price: ((old_avg * old_qty) + new_cost) / new_qty
            h.avg_price = ((h.avg_price * _d(h.qty)) + cost) / _d(new_qty)
            h.qty = new_qty

        else:  # SELL
            h = s.get(HoldingDB, (order.user_id, order.symbol))
            if not h or h.qty < qty:
                order.status = OrderStatus.REJECTED
                order.reject_reason = "Insufficient holdings"
                return

            user.cash = user.cash + cost
            h.qty -= qty
            # Leave zero-qty rows in the table; get_portfolio filters them out.
            # Keeping them preserves the avg_price for audit / future re-entry logic.

        order.status = OrderStatus.FILLED
        s.add(TradeDB(
            id=str(uuid.uuid4()),
            order_id=order.id,
            user_id=order.user_id,
            symbol=order.symbol,
            side=order.side,
            qty=qty,
            price=price,
            executed_at=datetime.utcnow(),
        ))

    def _persist_reject(self, user_id, symbol, side, qty, order_type,
                        limit_price, reason):
        """Write a REJECTED order row for failed-at-validation orders
        (e.g. non-positive qty) so the user sees it in their order history."""
        with db_session() as s:
            o = OrderDB(
                id=str(uuid.uuid4()),
                user_id=user_id,
                symbol=symbol,
                side=Side(side),
                qty=qty,
                order_type=OrderType(order_type),
                limit_price=_d(limit_price) if limit_price is not None else None,
                status=OrderStatus.REJECTED,
                placed_at=datetime.utcnow(),
                reject_reason=reason,
            )
            s.add(o)
            s.flush()
            return self._order_to_dict(o)

    # ----------------------------------------------------------------------
    # Serialization
    # ----------------------------------------------------------------------

    @staticmethod
    def _order_to_dict(o: OrderDB):
        return {
            "id": o.id,
            "user_id": o.user_id,
            "symbol": o.symbol,
            "side": o.side.value if hasattr(o.side, "value") else o.side,
            "qty": o.qty,
            "order_type": o.order_type.value if hasattr(o.order_type, "value") else o.order_type,
            "limit_price": float(o.limit_price) if o.limit_price is not None else None,
            "status": o.status.value if hasattr(o.status, "value") else o.status,
            "placed_at": o.placed_at.isoformat() + "Z",
            "reject_reason": o.reject_reason,
        }

    @staticmethod
    def _trade_to_dict(t: TradeDB):
        return {
            "id": t.id,
            "order_id": t.order_id,
            "user_id": t.user_id,
            "symbol": t.symbol,
            "side": t.side.value if hasattr(t.side, "value") else t.side,
            "qty": t.qty,
            "price": float(t.price),
            "executed_at": t.executed_at.isoformat() + "Z",
        }
    
    def modify(self, order_id: str, user_id: str,
           new_qty: int | None = None,
           new_limit_price: float | None = None):
        """Modify an open limit order. Returns updated order dict or None if not found."""
        with db_session() as s:
            o = s.execute(
                select(OrderDB).where(OrderDB.id == order_id).with_for_update()
            ).scalar_one_or_none()

            if not o or o.user_id != user_id:
                return None
            if o.status != OrderStatus.OPEN:
                # cannot modify filled/cancelled/rejected
                return self._order_to_dict(o)
            if o.order_type != OrderType.LIMIT:
                return self._order_to_dict(o)

            # Validate new values against user state
            user = s.execute(
                select(UserDB).where(UserDB.id == user_id).with_for_update()
            ).scalar_one()

            effective_qty = new_qty if new_qty is not None else o.qty
            effective_price = _d(new_limit_price) if new_limit_price is not None else o.limit_price

            if effective_qty <= 0:
                return self._order_to_dict(o)  # silently reject change

            if o.side == Side.BUY:
                cost = _d(effective_qty) * effective_price
                if user.cash < cost:
                    # not enough cash to cover modified BUY
                    return self._order_to_dict(o)
            else:  # SELL
                h = s.get(HoldingDB, (user_id, o.symbol))
                if not h or h.qty < effective_qty:
                    return self._order_to_dict(o)

            if new_qty is not None:
                o.qty = new_qty
            if new_limit_price is not None:
                o.limit_price = _d(new_limit_price)

            return self._order_to_dict(o)
        
def price_at(symbol: str, ts: datetime) -> float | None:
    """Return the close price of the latest 1m candle ≤ ts for symbol.
    Returns None if no candle exists at or before that timestamp.
    Uses the (symbol, ts) index — sub-millisecond lookup."""
    with db_session() as s:
        row = s.execute(
            select(PriceHistoryDB.close)
            .where(
                PriceHistoryDB.symbol == symbol,
                PriceHistoryDB.ts <= ts,
            )
            .order_by(PriceHistoryDB.ts.desc())
            .limit(1)
        ).scalar_one_or_none()
        return float(row) if row is not None else None
