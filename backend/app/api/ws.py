from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import time as time_mod
from app.state import state

router = APIRouter()


@router.websocket("/stream")
async def stream(ws: WebSocket):
    await ws.accept()
    await state.ws_hub.connect(ws)
    try:
        while True:
            msg = await ws.receive_json()
            action = msg.get("action")
            symbols = [s.upper() for s in msg.get("symbols", [])]

            if action == "subscribe":
                state.ws_hub.subscribe(ws, symbols)
                await ws.send_json({"type": "subscribed", "symbols": symbols})

                # NEW: send current prices for the newly subscribed symbols
                if state.feed is not None:
                    ts = int(time_mod.time())
                    for sym in symbols:
                        price = state.feed.prices.get(sym)
                        if price is None:
                            continue
                        # Get latest candle info for this symbol too
                        candles_by_interval = {}
                        for interval in ["1m", "5m", "15m", "1h", "1D"]:
                            latest = state.candles.get(sym, interval, 1)
                            if latest:
                                candles_by_interval[interval] = latest[0]
                        await ws.send_json({
                            "type": "tick",
                            "symbol": sym,
                            "price": price,
                            "ts": ts,
                            "candles": candles_by_interval,
                        })

            elif action == "unsubscribe":
                state.ws_hub.unsubscribe(ws, symbols)
                await ws.send_json({"type": "unsubscribed", "symbols": symbols})
    except WebSocketDisconnect:
        state.ws_hub.disconnect(ws)