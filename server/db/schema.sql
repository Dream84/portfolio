-- MyPortfolio 数据结构（本地单机 SQLite）
CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('BROKER','BANK','FUND_PLATFORM','OTHER')),
  status TEXT NOT NULL DEFAULT 'ENABLED' CHECK (status IN ('ENABLED','DISABLED'))
);

CREATE TABLE IF NOT EXISTS cash_account (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES account(id),
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CNY' CHECK (currency IN ('CNY','USD','HKD','EUR','JPY')),
  amount_original REAL NOT NULL DEFAULT 0 CHECK (amount_original >= 0),
  fx_rate REAL NOT NULL DEFAULT 1 CHECK (fx_rate > 0),
  fx_rate_time TEXT,
  fx_overridden INTEGER NOT NULL DEFAULT 0 CHECK (fx_overridden IN (0,1))
);

CREATE TABLE IF NOT EXISTS portfolio (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portfolio_account (
  portfolio_id TEXT NOT NULL REFERENCES portfolio(id),
  account_id TEXT NOT NULL REFERENCES account(id),
  PRIMARY KEY (portfolio_id, account_id)
);

CREATE TABLE IF NOT EXISTS category (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('L1','L2')),
  parent_key TEXT REFERENCES category(key),
  preset INTEGER NOT NULL DEFAULT 0 CHECK (preset IN (0,1)),
  color_token TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  CHECK ((level = 'L2' AND parent_key IS NOT NULL) OR (level = 'L1' AND parent_key IS NULL))
);

CREATE TABLE IF NOT EXISTS holding (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL REFERENCES portfolio(id),
  account_id TEXT NOT NULL REFERENCES account(id),
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  category_key TEXT NOT NULL REFERENCES category(key),
  quantity REAL NOT NULL CHECK (quantity > 0),
  cost_price REAL NOT NULL CHECK (cost_price > 0),
  cost_overridden INTEGER NOT NULL DEFAULT 0 CHECK (cost_overridden IN (0,1)),
  UNIQUE (account_id, symbol)
);

CREATE TABLE IF NOT EXISTS quote (
  symbol TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('PRICE','NAV')),
  price REAL NOT NULL CHECK (price > 0),
  price_time TEXT NOT NULL,
  is_cache INTEGER NOT NULL DEFAULT 0 CHECK (is_cache IN (0,1))
);

CREATE TABLE IF NOT EXISTS snapshot (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  snapshot_date TEXT NOT NULL,
  dimension_type TEXT NOT NULL CHECK (dimension_type IN ('PORTFOLIO','ACCOUNT','CATEGORY')),
  total_value REAL NOT NULL,
  net_investment REAL NOT NULL,
  cumulative_return REAL NOT NULL,
  UNIQUE (account_id, snapshot_date, dimension_type)
);

CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  account_name TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','LOCKED')),
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);

CREATE TABLE IF NOT EXISTS session (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id),
  created_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  before_value TEXT,
  after_value TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backup (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS preference (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fx_rate (
  currency TEXT NOT NULL,
  rate REAL NOT NULL,
  rate_time TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trade (
  id TEXT PRIMARY KEY,
  portfolio_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  cash_account_id TEXT,
  symbol TEXT,
  name TEXT,
  trade_type TEXT NOT NULL CHECK (trade_type IN ('BUY','SELL','DIVIDEND_CASH','DIVIDEND_REINVEST','INCOME','EXPENSE','TRANSFER_OUT','TRANSFER_IN')),
  trade_date TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  quantity REAL,
  price REAL,
  fee REAL NOT NULL DEFAULT 0 CHECK (fee >= 0),
  fee_mode TEXT NOT NULL DEFAULT 'INTO_COST' CHECK (fee_mode IN ('INTO_COST','OFFSET_PNL')),
  realized_pnl REAL,
  transfer_group_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS trade_undo (
  trade_id TEXT PRIMARY KEY,
  cash_account_id TEXT,
  cash_delta REAL NOT NULL DEFAULT 0,
  symbol TEXT,
  quantity_before REAL,
  cost_before REAL,
  expires_at TEXT NOT NULL
);
