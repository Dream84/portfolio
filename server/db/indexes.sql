-- 支撑 DFX-PERF-006：单表 10 万行时列表与曲线查询在阈值内
CREATE UNIQUE INDEX IF NOT EXISTS uk_holding_account_symbol ON holding (account_id, symbol);
CREATE INDEX IF NOT EXISTS idx_holding_portfolio ON holding (portfolio_id);
CREATE INDEX IF NOT EXISTS idx_holding_category ON holding (category_key);
CREATE INDEX IF NOT EXISTS idx_category_parent ON category (parent_key);
CREATE UNIQUE INDEX IF NOT EXISTS uk_snapshot_account_date_dim ON snapshot (account_id, snapshot_date, dimension_type);
CREATE INDEX IF NOT EXISTS idx_snapshot_date ON snapshot (snapshot_date);
