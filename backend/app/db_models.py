from sqlalchemy import (
    Column, Integer, String, Float, DateTime, ForeignKey,
    Numeric, Enum as SAEnum, Index,
)
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db import Base
from app.trading.models import Side, OrderType, OrderStatus


class UserDB(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    cash = Column(Numeric(18, 2), nullable=False, default=1_000_000)
    starting_cash = Column(Numeric(18, 2), nullable=False, default=1_000_000)  # NEW
    created_at = Column(DateTime, default=datetime.utcnow)


class InstrumentDB(Base):
    __tablename__ = "instruments"
    symbol = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    base_price = Column(Numeric(18, 2), nullable=False)


class OrderDB(Base):
    __tablename__ = "orders"
    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    symbol = Column(String, ForeignKey("instruments.symbol"), nullable=False, index=True)
    side = Column(SAEnum(Side), nullable=False)
    qty = Column(Integer, nullable=False)
    order_type = Column(SAEnum(OrderType), nullable=False)
    limit_price = Column(Numeric(18, 2), nullable=True)
    status = Column(SAEnum(OrderStatus), nullable=False, default=OrderStatus.OPEN)
    placed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    reject_reason = Column(String, nullable=True)

Index("ix_orders_open_limit", OrderDB.symbol, OrderDB.status)


class TradeDB(Base):
    __tablename__ = "trades"
    id = Column(String, primary_key=True)
    order_id = Column(String, ForeignKey("orders.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    symbol = Column(String, nullable=False)
    side = Column(SAEnum(Side), nullable=False)
    qty = Column(Integer, nullable=False)
    price = Column(Numeric(18, 2), nullable=False)
    executed_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class HoldingDB(Base):
    __tablename__ = "holdings"
    user_id = Column(String, ForeignKey("users.id"), primary_key=True)
    symbol = Column(String, ForeignKey("instruments.symbol"), primary_key=True)
    qty = Column(Integer, nullable=False, default=0)
    avg_price = Column(Numeric(18, 2), nullable=False, default=0)

class PriceHistoryDB(Base):
    __tablename__ = "price_history"
    symbol = Column(String, primary_key=True)
    ts = Column(DateTime(timezone=True), primary_key=True)
    open = Column(Numeric(18, 2), nullable=False)
    high = Column(Numeric(18, 2), nullable=False)
    low = Column(Numeric(18, 2), nullable=False)
    close = Column(Numeric(18, 2), nullable=False)


Index("ix_price_history_lookup", PriceHistoryDB.symbol, PriceHistoryDB.ts)

class WatchlistDB(Base):
    __tablename__ = "watchlist"
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    symbol = Column(String, primary_key=True)
    yahoo_symbol = Column(String, nullable=False)
    name = Column(String, nullable=False)
    added_at = Column(DateTime, default=datetime.utcnow, nullable=False)