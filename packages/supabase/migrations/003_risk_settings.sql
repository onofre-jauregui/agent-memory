-- Generic risk settings + state per tenant.

CREATE TABLE risk_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  max_position_size NUMERIC NOT NULL DEFAULT 100,
  max_daily_loss NUMERIC NOT NULL DEFAULT 100,
  max_open_positions INTEGER NOT NULL DEFAULT 5,
  max_drawdown_pct NUMERIC NOT NULL DEFAULT 20,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE risk_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  date DATE NOT NULL,
  is_trading_halted BOOLEAN NOT NULL DEFAULT false,
  halt_reason TEXT,
  daily_pnl NUMERIC NOT NULL DEFAULT 0,
  open_position_count INTEGER NOT NULL DEFAULT 0,
  peak_portfolio_value NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX idx_risk_state_user_date ON risk_state(user_id, date);

ALTER TABLE risk_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "risk_settings_select" ON risk_settings
  FOR SELECT USING (user_id IS NULL OR user_id = auth.uid()::text);
CREATE POLICY "risk_settings_modify" ON risk_settings
  FOR ALL USING (true);

CREATE POLICY "risk_state_select" ON risk_state
  FOR SELECT USING (user_id IS NULL OR user_id = auth.uid()::text);
CREATE POLICY "risk_state_modify" ON risk_state
  FOR ALL USING (true);
