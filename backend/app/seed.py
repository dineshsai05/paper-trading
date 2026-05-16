from app.db import db_session
from app.db_models import InstrumentDB
from app.market.instruments import INSTRUMENTS


def seed():
    with db_session() as s:
        for inst in INSTRUMENTS:
            if not s.get(InstrumentDB, inst["symbol"]):
                s.add(InstrumentDB(
                    symbol=inst["symbol"],
                    name=inst["name"],
                    base_price=inst["base_price"],
                ))


if __name__ == "__main__":
    seed()
    print("Instruments seeded.")