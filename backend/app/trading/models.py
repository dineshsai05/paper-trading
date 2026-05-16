from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional
import uuid

class Side(str, Enum):
    BUY = "BUY"
    SELL = "SELL"

class OrderType(str, Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"

class OrderStatus(str, Enum):
    OPEN = "OPEN"       # limit, waiting
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"

@dataclass
class Order:
    id: str
    user_id: str
    symbol: str
    side: Side
    qty: int
    order_type: OrderType
    limit_price: Optional[float]
    status: OrderStatus
    placed_at: datetime
    reject_reason: Optional[str] = None

    @staticmethod
    def new(user_id, symbol, side, qty, order_type, limit_price=None):
        return Order(
            id=str(uuid.uuid4()),
            user_id=user_id,
            symbol=symbol.upper(),
            side=side,
            qty=qty,
            order_type=order_type,
            limit_price=limit_price,
            status=OrderStatus.OPEN,
            placed_at=datetime.utcnow(),
        )

@dataclass
class Trade:
    id: str
    order_id: str
    user_id: str
    symbol: str
    side: Side
    qty: int
    price: float
    executed_at: datetime

@dataclass
class Holding:
    symbol: str
    qty: int = 0
    avg_price: float = 0.0

@dataclass
class Portfolio:
    user_id: str
    cash: float
    holdings: dict = field(default_factory=dict)  # symbol -> Holding