-- ATHINA Audit Logs
-- Durable governance records for agent requests and outcomes.

CREATE TABLE IF NOT EXISTS athina_audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id TEXT,
  session_id TEXT,
  actor_id TEXT,
  endpoint TEXT,
  event_type TEXT NOT NULL,
  status TEXT,
  latency_ms INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_athina_audit_logs_created_at ON athina_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_athina_audit_logs_request_id ON athina_audit_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_athina_audit_logs_session_id ON athina_audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_athina_audit_logs_event_type ON athina_audit_logs(event_type);

ALTER TABLE athina_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "athina_audit_logs_all"
  ON athina_audit_logs
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
