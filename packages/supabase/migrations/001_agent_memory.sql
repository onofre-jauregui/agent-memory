-- Agent Memory: persistent learning across agent sessions.
--
-- Generic schema — no foreign key to a domain-specific table. context_id
-- is a free-form string the host application populates (strategy name,
-- channel, vertical, etc.).

CREATE TABLE agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_type TEXT NOT NULL DEFAULT 'lesson'
    CHECK (memory_type IN (
      'lesson', 'pattern', 'mistake', 'success',
      'observation', 'insight', 'feedback'
    )),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'reflection'
    CHECK (source_type IN (
      'reflection', 'action_outcome', 'user_feedback',
      'external_observation', 'manual'
    )),
  related_action_ids TEXT[] DEFAULT '{}',
  context_id TEXT,
  tags TEXT[] DEFAULT '{}',
  confidence NUMERIC NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0 AND confidence <= 1),
  confirmations INTEGER NOT NULL DEFAULT 0,
  contradictions INTEGER NOT NULL DEFAULT 0,
  context JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_recalled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id TEXT
);

CREATE INDEX idx_agent_memory_type ON agent_memory(memory_type);
CREATE INDEX idx_agent_memory_context ON agent_memory(context_id);
CREATE INDEX idx_agent_memory_tags ON agent_memory USING GIN(tags);
CREATE INDEX idx_agent_memory_active ON agent_memory(is_active, confidence DESC);
CREATE INDEX idx_agent_memory_created ON agent_memory(created_at DESC);
CREATE INDEX idx_agent_memory_user ON agent_memory(user_id);

ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_memory_select" ON agent_memory
  FOR SELECT USING (user_id IS NULL OR user_id = auth.uid()::text);
CREATE POLICY "agent_memory_insert" ON agent_memory
  FOR INSERT WITH CHECK (true);
CREATE POLICY "agent_memory_update" ON agent_memory
  FOR UPDATE USING (true);
CREATE POLICY "agent_memory_delete" ON agent_memory
  FOR DELETE USING (user_id IS NULL OR user_id = auth.uid()::text);

-- Generic action reflections — replaces the original trade_reflections table.
-- An "action" is whatever your agent does: a message sent, an order placed,
-- a refund processed, an API call made.
CREATE TABLE action_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id TEXT NOT NULL,
  expected_outcome TEXT NOT NULL,
  expected_confidence NUMERIC
    CHECK (expected_confidence >= 0 AND expected_confidence <= 1),
  actual_outcome TEXT,
  outcome_score NUMERIC,
  analysis TEXT,
  root_cause TEXT,
  lesson_id UUID REFERENCES agent_memory(id) ON DELETE SET NULL,
  decision_quality TEXT
    CHECK (decision_quality IN ('good', 'acceptable', 'poor', 'unknown')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id TEXT
);

CREATE INDEX idx_action_reflections_action ON action_reflections(action_id);
CREATE INDEX idx_action_reflections_quality ON action_reflections(decision_quality);
CREATE INDEX idx_action_reflections_user ON action_reflections(user_id);

ALTER TABLE action_reflections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "action_reflections_select" ON action_reflections
  FOR SELECT USING (user_id IS NULL OR user_id = auth.uid()::text);
CREATE POLICY "action_reflections_insert" ON action_reflections
  FOR INSERT WITH CHECK (true);
CREATE POLICY "action_reflections_update" ON action_reflections
  FOR UPDATE USING (true);
CREATE POLICY "action_reflections_delete" ON action_reflections
  FOR DELETE USING (user_id IS NULL OR user_id = auth.uid()::text);
