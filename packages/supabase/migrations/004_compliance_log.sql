-- Append-only audit log of guardrail decisions and agent activity.
CREATE TABLE compliance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_log_type ON compliance_log(event_type);
CREATE INDEX idx_compliance_log_severity ON compliance_log(severity);
CREATE INDEX idx_compliance_log_user ON compliance_log(user_id);
CREATE INDEX idx_compliance_log_created ON compliance_log(created_at DESC);

ALTER TABLE compliance_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compliance_log_select" ON compliance_log
  FOR SELECT USING (user_id IS NULL OR user_id = auth.uid()::text);
CREATE POLICY "compliance_log_insert" ON compliance_log
  FOR INSERT WITH CHECK (true);
