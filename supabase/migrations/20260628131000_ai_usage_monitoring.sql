-- AI usage monitoring: tracks per-call token usage, latency, cost, and fallback events.

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  was_fallback BOOLEAN DEFAULT false,
  cost_microcents INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_user_date ON ai_usage_logs(user_id, created_at DESC);
CREATE INDEX idx_ai_usage_model ON ai_usage_logs(model, created_at DESC);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own AI usage"
  ON ai_usage_logs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert AI usage"
  ON ai_usage_logs
  FOR INSERT
  WITH CHECK (true);

CREATE OR REPLACE VIEW ai_daily_costs AS
SELECT
  user_id,
  DATE(created_at) AS usage_date,
  model,
  COUNT(*) AS call_count,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(cost_microcents) AS total_cost_microcents,
  AVG(latency_ms)::INTEGER AS avg_latency_ms
FROM ai_usage_logs
GROUP BY user_id, DATE(created_at), model;
