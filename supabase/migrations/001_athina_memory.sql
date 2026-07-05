-- ATHINA Memory Tables
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS athina_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_athina_memory_session ON athina_memory(session_id);

CREATE TABLE IF NOT EXISTS athina_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  plan JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_athina_plans_session ON athina_plans(session_id);

CREATE TABLE IF NOT EXISTS athina_task_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_athina_task_results_session ON athina_task_results(session_id);

CREATE TABLE IF NOT EXISTS athina_context (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, key)
);

-- Enable RLS and add permissive policies for anon (publishable key) and authenticated roles
ALTER TABLE athina_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE athina_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE athina_task_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE athina_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "athina_memory_all" ON athina_memory FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "athina_plans_all" ON athina_plans FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "athina_task_results_all" ON athina_task_results FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "athina_context_all" ON athina_context FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);