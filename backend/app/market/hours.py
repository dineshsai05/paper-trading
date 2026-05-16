from datetime import datetime
from zoneinfo import ZoneInfo
from app.config import settings

IST = ZoneInfo("Asia/Kolkata")


def is_market_open() -> bool:
    now = datetime.now(IST)
    if now.weekday() >= 5:
        return False
    t = now.time()
    return settings.market_open <= t <= settings.market_close

print(is_market_open())