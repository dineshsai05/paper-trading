from app.market.candles import CandleStore
from app.market.feed import PriceFeed
from app.trading.engine import TradingEngine
from typing import Optional


class WSHub:
    def __init__(self):
        self.clients = {}

    async def connect(self, ws):
        self.clients[ws] = set()

    def disconnect(self, ws):
        self.clients.pop(ws, None)

    def subscribe(self, ws, symbols):
        if ws in self.clients:
            self.clients[ws].update(symbols)

    def unsubscribe(self, ws, symbols):
        if ws in self.clients:
            self.clients[ws].difference_update(symbols)

    async def broadcast_tick(self, symbol, price, ts, candles_by_interval):
        payload = {
            "type": "tick",
            "symbol": symbol,
            "price": price,
            "ts": ts,
            "candles": {iv: c.to_dict() for iv, c in candles_by_interval.items()},
        }
        dead = []
        for ws, subs in self.clients.items():
            if symbol in subs:
                try:
                    await ws.send_json(payload)
                except Exception:
                    dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


class AppState:
    def __init__(self):
        self.candles = CandleStore(max_per_interval=500)
        self.ws_hub = WSHub()
        self.feed: Optional[PriceFeed] = None   # renamed from `simulator`
        self.engine = TradingEngine()

    # Backwards-compat shim — keep `state.simulator` working everywhere
    @property
    def simulator(self):
        return self.feed


state = AppState()