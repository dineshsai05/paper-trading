const {
  H1, H2, H3, P, PMixed, Bullet, BulletMixed, NumItem, Code, InlineCode,
  Callout, AIPrompt, QA, buildDoc, saveDoc,
} = require('./helpers');

const children = [];

// ===== TITLE =====
children.push(H1("Member 1 — Backend Core & Database"));
children.push(P("Paper Trading Platform — Viva Preparation Document", { italics: true }));
children.push(P("Your contribution to the project covers the database design, the trading engine that handles order placement and execution, and the data persistence layer. You are the person who built the foundation everyone else builds on top of."));

// ===== OVERVIEW =====
children.push(H2("1. Your Contribution at a Glance"));

children.push(P("You owned three interlocking pieces:"));
children.push(Bullet("PostgreSQL schema design — the tables, relationships, indexes, and constraints that hold all data"));
children.push(Bullet("SQLAlchemy ORM models — the Python representation of those tables"));
children.push(Bullet("Trading Engine — the core business logic for placing orders, matching limits, computing weighted-average prices, and reconstructing portfolios at any point in time"));
children.push(Bullet("Docker Compose setup for running Postgres in a reproducible container"));

children.push(P("Files you owned:"));
children.push(Bullet("docker-compose.yml"));
children.push(Bullet("backend/app/db.py"));
children.push(Bullet("backend/app/db_models.py"));
children.push(Bullet("backend/app/trading/engine.py"));
children.push(Bullet("backend/app/trading/models.py"));

// ===== PART A — DATABASE =====
children.push(H2("2. Database Design"));

children.push(H3("Why PostgreSQL"));
children.push(P("We chose PostgreSQL over alternatives like SQLite or MongoDB for three reasons. First, PostgreSQL has proper transaction isolation and row-level locking, which we needed for race-condition-safe order placement. Second, it handles concurrent writes from multiple users gracefully. Third, the SQL query layer made historical portfolio reconstruction far easier than it would have been in a NoSQL store."));

children.push(P("Postgres runs in a Docker container so any developer on the team can clone the repo and have the same environment instantly. The Docker Compose file maps port 5432 to localhost and uses a named volume so data persists across container restarts."));

children.push(H3("The Six Tables"));

children.push(QA([
  ["Table", "Purpose"],
  ["users", "Stores user authentication info, current cash balance, and starting_cash (a frozen value used for historical replay)"],
  ["orders", "Every order ever placed — market and limit, filled, open, cancelled, or rejected"],
  ["trades", "Every actual execution. A market order produces one trade row immediately; a limit order produces a trade row when it fills"],
  ["holdings", "Materialized view of current positions per user. Composite primary key (user_id, symbol). Updated on every fill"],
  ["watchlist", "Per-user list of symbols they want to see. Composite primary key (user_id, symbol)"],
  ["price_history", "1-minute OHLC candles for all watched symbols, used to look up historical prices for time-travel feature"],
]));

children.push(H3("Key Design Decisions"));

children.push(P("Composite primary keys on holdings and watchlist:"));
children.push(P("Each user can have at most one row per symbol in holdings — you don't have two RELIANCE positions, you have one with a quantity. Same for watchlist. Composite PK (user_id, symbol) enforces this at the database level rather than relying on application code to prevent duplicates."));

children.push(P("Why starting_cash exists alongside cash:"));
children.push(P("Cash is mutated on every trade — buy decreases it, sell increases it. To reconstruct what your portfolio looked like at, say, 2 PM yesterday, we need to know what your cash balance was when the account was created. Otherwise we cannot replay trades from the start. starting_cash is set on signup and never changes after."));

children.push(P("Indexes we created:"));
children.push(BulletMixed([{text: "On orders: "}, {text:"(symbol, status)", code:true}, {text: " — used by the limit-order matching loop. When a price tick comes in, we query 'all OPEN limit orders for this symbol' frequently. Without this index it would be a full table scan."}]));
children.push(BulletMixed([{text: "On price_history: "}, {text:"(symbol, ts)", code:true}, {text: " — primary key already covers this, but we lean on it heavily for the historical price lookup. Sub-millisecond per query."}]));

children.push(H3("Foreign Keys and ON DELETE CASCADE"));
children.push(P("watchlist has ON DELETE CASCADE on user_id, so if a user is deleted, their watchlist disappears with them. We did not put CASCADE on orders/trades/holdings because those are financial records — even if a user account is deleted, we'd want to preserve the history for audit purposes."));

children.push(H3("Schema Definition (SQL)"));
children.push(P("We managed schema directly via SQL rather than using Alembic migrations, which kept things simpler for a student project. Here is the users table:"));
children.push(...Code(`CREATE TABLE users (
    id VARCHAR PRIMARY KEY,
    email VARCHAR UNIQUE NOT NULL,
    password_hash VARCHAR NOT NULL,
    cash NUMERIC(18, 2) NOT NULL DEFAULT 1000000,
    starting_cash NUMERIC(18, 2) NOT NULL DEFAULT 1000000,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ix_users_email ON users(email);`));

children.push(P("And the price_history table, our most performance-sensitive one:"));
children.push(...Code(`CREATE TABLE price_history (
    symbol VARCHAR NOT NULL,
    ts TIMESTAMP WITH TIME ZONE NOT NULL,
    open NUMERIC(18, 2) NOT NULL,
    high NUMERIC(18, 2) NOT NULL,
    low NUMERIC(18, 2) NOT NULL,
    close NUMERIC(18, 2) NOT NULL,
    PRIMARY KEY (symbol, ts)
);

CREATE INDEX ix_price_history_lookup
    ON price_history (symbol, ts);`));

// ===== PART B — SQLAlchemy =====
children.push(H2("3. SQLAlchemy ORM Models"));

children.push(P("SQLAlchemy is a Python ORM (Object-Relational Mapper) that lets us work with database rows as Python objects instead of writing raw SQL strings. Each table has a corresponding Python class in db_models.py."));

children.push(H3("Why ORM Instead of Raw SQL"));
children.push(Bullet("Type safety — your IDE catches typos in column names"));
children.push(Bullet("Composability — you can build queries dynamically with .where(), .order_by()"));
children.push(Bullet("Connection pooling and transaction management built in"));
children.push(Bullet("Same codebase works across PostgreSQL, MySQL, SQLite if we ever want to switch"));

children.push(H3("Session Management Pattern"));
children.push(P("In db.py I created a context-manager helper called db_session() that every other piece of the code uses:"));
children.push(...Code(`@contextmanager
def db_session() -> Session:
    s = SessionLocal()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()`));

children.push(P("Used like this in any function that touches the DB:"));
children.push(...Code(`with db_session() as s:
    user = s.get(UserDB, user_id)
    # ... do stuff ...
# Auto-commits if no exception, auto-rolls back if any exception, always closes`));

children.push(P("This guarantees we never leak database connections and never half-commit a transaction. It's a critical pattern for any database-backed app."));

children.push(H3("Sample Model — UserDB"));
children.push(...Code(`class UserDB(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    cash = Column(Numeric(18, 2), nullable=False, default=1_000_000)
    starting_cash = Column(Numeric(18, 2), nullable=False, default=1_000_000)
    created_at = Column(DateTime, default=datetime.utcnow)`));

// ===== PART C — Trading Engine =====
children.push(H2("4. The Trading Engine — Heart of the Application"));

children.push(P("The TradingEngine class in trading/engine.py is where all business logic for orders lives. Every other component (API endpoints, market data feed) just calls into this engine. Keeping all the trading logic in one class made it testable and made the rest of the codebase simpler."));

children.push(H3("Methods I Implemented"));

children.push(QA([
  ["Method", "What it does"],
  ["place_order()", "Validates inputs, creates an OrderDB row, and either fills it immediately (MARKET) or queues it (LIMIT). Returns a dict representing the order."],
  ["_fill()", "Internal helper. Updates user's cash, updates or creates the holding row with correct weighted-average price, inserts a TradeDB row."],
  ["on_tick()", "Called by the price feed on every tick. Finds OPEN limit orders for that symbol, fills any whose limit has been crossed."],
  ["cancel()", "Marks an OPEN order as CANCELLED."],
  ["modify()", "Allows a user to change the qty or limit_price of an OPEN limit order before it fills."],
  ["get_portfolio()", "Returns current cash, current holdings, with live LTPs from the price feed."],
  ["get_portfolio_at()", "Reconstructs the portfolio at any past timestamp by replaying trades."],
]));

children.push(H3("Concurrency Safety — The Most Important Concept"));

children.push(P("Imagine a user clicks Buy twice rapidly. Two requests hit the backend at the same moment. Without protection, this could happen:"));

children.push(Bullet("Request A reads cash = ₹100,000"));
children.push(Bullet("Request B reads cash = ₹100,000"));
children.push(Bullet("Request A subtracts ₹80,000, writes cash = ₹20,000"));
children.push(Bullet("Request B subtracts ₹80,000, writes cash = ₹20,000"));

children.push(P("Result: user spent ₹160,000 but only ₹80,000 was deducted. They got two stocks for the price of one. This is called a race condition."));

children.push(P("My fix: SELECT ... FOR UPDATE row-level locking. Inside place_order:"));
children.push(...Code(`user = s.execute(
    select(UserDB).where(UserDB.id == user_id).with_for_update()
).scalar_one()`));

children.push(P("This locks the user's row in the database. The second request blocks until the first request commits its transaction. Now request B reads cash = ₹20,000 (already-updated value), sees insufficient funds, and rejects the order. No double-spend."));

children.push(H3("Order Matching Logic"));

children.push(P("Three paths an order can take:"));

children.push(P("1. MARKET order — fills immediately at current price.", {bold: true}));
children.push(...Code(`if order.order_type == OrderType.MARKET:
    self._fill(s, order, current_price, user)`));

children.push(P("2. LIMIT order whose price already crosses the market — fills immediately, but at the BETTER price (current market, not the limit).", {bold: true}));
children.push(P("Example: Market is at ₹2858. User places BUY LIMIT at ₹4000. Their intent is 'I'll pay up to ₹4000.' Since market is already cheaper, fill at ₹2858. Saves the user money. This matches real exchange behavior."));
children.push(...Code(`elif order.side == Side.BUY:
    cost = qty * limit_price
    if user.cash < cost:
        order.status = REJECTED
        order.reject_reason = "Insufficient cash"
    elif current_price <= limit_price:
        # Already crosses — fill at market for better price
        self._fill(s, order, current_price, user)`));

children.push(P("3. LIMIT order that doesn't cross yet — stays OPEN. The on_tick() method monitors all OPEN limits and fills them when prices cross.", {bold: true}));

children.push(H3("Weighted-Average Price Calculation"));
children.push(P("When a user buys 10 RELIANCE at ₹2900 then 5 more at ₹2950, what's their average cost? It's a weighted average:"));
children.push(...Code(`new_avg = (old_avg * old_qty + new_cost) / new_qty`));
children.push(P("In our case: (2900 × 10 + 2950 × 5) / 15 = ₹2916.67. This is the price line we draw on the chart."));
children.push(P("Selling does not change avg_price — it just decreases qty. This matches how brokers compute cost basis."));

children.push(H3("Historical Portfolio Reconstruction"));
children.push(P("This is the time-travel feature. The user picks a timestamp T, and we tell them what their portfolio looked like then."));

children.push(P("My approach: replay trades from the beginning."));
children.push(P("Why replay instead of storing snapshots? Two reasons. First, trades are already an immutable log — the source of truth. Second, storing snapshots every minute would balloon the database. Replay is fast enough."));

children.push(P("Algorithm:"));
children.push(NumItem("Start with cash = user.starting_cash, holdings = {}"));
children.push(NumItem("Query all trades where executed_at <= T, ordered by executed_at"));
children.push(NumItem("For each trade: if BUY, decrease cash by qty×price, increase holding qty (weighted avg); if SELL, increase cash, decrease holding"));
children.push(NumItem("After replay, you have cash and holdings as of T"));
children.push(NumItem("For each holding, look up the historical close price at time T from price_history (separate function price_at())"));
children.push(NumItem("Compute P&L = (price_at_T - avg_cost) × qty"));

children.push(P("Code excerpt:"));
children.push(...Code(`def get_portfolio_at(self, user_id, at_ts, price_lookup_at):
    with db_session() as s:
        user = s.get(UserDB, user_id)
        trades = s.execute(
            select(TradeDB).where(
                TradeDB.user_id == user_id,
                TradeDB.executed_at <= at_ts,
            ).order_by(TradeDB.executed_at)
        ).scalars().all()

        cash = float(user.starting_cash)
        positions = {}

        for t in trades:
            cost = t.qty * float(t.price)
            if t.side == Side.BUY:
                cash -= cost
                p = positions.setdefault(t.symbol, {"qty": 0, "avg_price": 0.0})
                new_qty = p["qty"] + t.qty
                p["avg_price"] = (p["avg_price"] * p["qty"] + cost) / new_qty
                p["qty"] = new_qty
            else:
                cash += cost
                positions[t.symbol]["qty"] -= t.qty

        # ... build response with historical LTPs ...`));

children.push(H3("Companion Function — price_at()"));
children.push(P("To value historical positions, we need the historical price. price_at() looks it up from the price_history table — uses an indexed query that returns in sub-millisecond time:"));

children.push(...Code(`def price_at(symbol, ts):
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
        return float(row) if row is not None else None`));

children.push(P("Returns the close price of the latest 1-minute candle at or before the given timestamp. If no candle exists (timestamp predates our data), returns None and the caller falls back to avg_price."));

// ===== PART D — VIVA PREP =====
children.push(H2("5. Viva Questions You Should Be Ready For"));

children.push(QA([
  ["Question", "Your Answer"],
  ["Why PostgreSQL?", "Proper transaction isolation, row-level locking for concurrency, mature SQL layer for complex queries like historical portfolio reconstruction. SQLite would have struggled with multi-user write concurrency."],
  ["What does SELECT FOR UPDATE do?", "Acquires a row-level lock for the duration of the transaction. Other transactions trying to read the same row with FOR UPDATE will block until this one commits. Prevents the double-spend race condition on user cash balance."],
  ["Why a separate starting_cash column?", "Current cash changes with every trade. To replay history we need the original balance from account creation. starting_cash is set once at signup and never modified."],
  ["Why composite PK on holdings?", "A user can have at most one row per symbol — they hold qty=N of RELIANCE, not multiple rows for it. The (user_id, symbol) PK enforces this at the database level."],
  ["How is weighted-average price computed?", "(old_avg × old_qty + new_cost) / new_qty. Only on buys. Sells don't change avg_price."],
  ["Why no Alembic migrations?", "For a student project of this scope, direct SQL is simpler and faster. In production we'd use Alembic for safe evolution. For our schema with a known final shape, the overhead wasn't worth it."],
  ["Why replay trades instead of snapshots?", "Trades are immutable — they're already the source of truth. Snapshots every minute would bloat the DB. Replay is fast: ~50ms even with hundreds of trades thanks to indexed queries."],
  ["What if an order has 0 quantity?", "Validated at place_order entry — it's rejected with reason 'Qty must be positive' before any DB transaction starts."],
  ["What is _persist_reject?", "When an order fails validation upfront (like negative qty), we still write a REJECTED order row so users can see the rejection in their order history."],
  ["What happens when a limit fills?", "The on_tick method sees the price has crossed the limit. It calls _fill() which updates cash, updates holding, inserts a trade, marks the order FILLED. All in one DB transaction."],
]));

// ===== AI USAGE =====
children.push(H2("6. AI Tool Usage Disclosure"));

children.push(P("I used AI as a programming assistant for specific syntax help, while owning all the architectural and design decisions. Here's the honest disclosure:"));

children.push(H3("What I Used AI For"));
children.push(P("SQLAlchemy 2.0 syntax for row locking — the with_for_update() API and how to combine it with select() statements. The pattern is correct but easy to get wrong."));
children.push(...AIPrompt("In SQLAlchemy 2.0, how do I do a SELECT ... FOR UPDATE inside a session.execute() call? I want to lock a single row by primary key for the duration of my transaction to prevent race conditions on a 'cash' field."));

children.push(P("PostgreSQL upsert syntax for the price_history table — specifically the on_conflict_do_update pattern from sqlalchemy.dialects.postgresql.insert."));
children.push(...AIPrompt("In SQLAlchemy with PostgreSQL, what's the cleanest way to upsert? I want to insert a row, but if (symbol, ts) already exists, update high to the max of existing and new high, low to the min, and close to the new value."));

children.push(P("Decimal arithmetic in Python for financial precision — I knew floats are unsafe for money but needed the exact pattern for converting between Decimal and float in our context."));
children.push(...AIPrompt("Best practices for handling money values in Python with SQLAlchemy when the column is NUMERIC(18,2)? When do I convert to Decimal vs float?"));

children.push(H3("What I Did Not Use AI For"));
children.push(Bullet("Schema design — choosing which tables, which columns, which keys — based on understanding the domain"));
children.push(Bullet("The decision to replay trades vs store snapshots for historical portfolio"));
children.push(Bullet("The choice to use composite primary keys on holdings/watchlist"));
children.push(Bullet("The decision to keep the engine separate from API endpoints (the 'thin controllers, fat models' pattern)"));
children.push(Bullet("Identifying the race condition on user cash and reasoning about how SELECT FOR UPDATE solves it"));

// ===== INTEGRATION =====
children.push(H2("7. How Your Code Integrates with Other Members"));

children.push(P("Member 2 (Market Data) calls into your code:"));
children.push(BulletMixed([{text: "On every price tick, they call "}, {text:"state.engine.on_tick(symbol, price)", code:true}, {text: " — your engine then checks if any open limit orders should fill"}]));
children.push(BulletMixed([{text: "They write to your "}, {text:"price_history", code:true}, {text: " table. You consume from it in price_at() for historical lookups"}]));

children.push(P("Member 3 (API Layer) calls into your code:"));
children.push(BulletMixed([{text: "Their /api/orders endpoint calls "}, {text:"state.engine.place_order(...)", code:true}]));
children.push(BulletMixed([{text: "Their /api/portfolio calls "}, {text:"state.engine.get_portfolio(...)", code:true}]));
children.push(BulletMixed([{text: "Their /api/portfolio/at calls "}, {text:"state.engine.get_portfolio_at(...)", code:true}]));

children.push(P("Member 4 (Frontend) doesn't talk to your code directly — they go through Member 3's API layer. So your DB schema affects the JSON shape they consume."));

// ===== A BUG YOU FIXED =====
children.push(H2("8. A Specific Bug You Personally Fixed (talk about this if asked)"));

children.push(P("During testing, we noticed users could place limit BUY orders at prices way above market. Example: market is ₹2858, user places BUY LIMIT at ₹4000. The order would mark as FILLED but cost ₹4000 per share — the user overpaid by ~₹1140 per share."));

children.push(P("Root cause: in our initial logic, an immediately-crossing limit was filling at the limit price, not the market price. Real exchanges always fill at the better price for the trader."));

children.push(P("Fix: in place_order(), when a LIMIT order is placed and current price already crosses the limit, route it through _fill() with current_price (not limit_price). The order_type stays LIMIT in the DB record (for audit), but the fill price is at-market."));

children.push(P("After fix: BUY LIMIT at ₹4000 when market is ₹2858 fills at ₹2858. BUY LIMIT at ₹2800 when market is ₹2858 stays OPEN (doesn't cross), correct. SELL LIMIT at ₹2900 when market is ₹2858 stays OPEN (doesn't cross), correct."));

children.push(P("This required understanding both the database transaction flow and the conceptual difference between 'order intent' and 'fill price' — a real-world finance concept that the code now handles correctly."));

const doc = buildDoc(children);
saveDoc(doc, 'member1.docx');