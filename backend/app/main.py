from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import rest, ws, trading, auth, watchlist
from app.market.simulator import MarketSimulator
from app.market.yahoo_feed import YahooFeed
from app.config import settings
from app.state import state


def make_feed():
    if settings.feed_source == "yahoo":
        print("[feed] using YahooFeed")
        return YahooFeed()
    print("[feed] using MarketSimulator")
    return MarketSimulator()


@asynccontextmanager
async def lifespan(app: FastAPI):
    state.feed = make_feed()
    await state.feed.start()
    yield
    await state.feed.stop()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],

    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rest.router, prefix="/api")
app.include_router(ws.router, prefix="/ws")
app.include_router(trading.router, prefix="/api")
app.include_router(auth.router, prefix="/api/auth")
app.include_router(watchlist.router, prefix="/api")
