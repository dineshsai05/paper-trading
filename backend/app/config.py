from pydantic_settings import BaseSettings
from datetime import time
from typing import Literal


class Settings(BaseSettings):
    market_open: time = time(9, 15)
    market_close: time = time(15, 30)
    tick_interval_ms: int = 1000
    max_candles_per_interval: int = 500

    # Which price feed to use
    feed_source: Literal["simulator", "yahoo"] = "simulator"

    class Config:
        env_file = ".env"


settings = Settings()