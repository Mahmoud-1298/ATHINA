-- ATHINA Retrieval Memory + Proposal Validator

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE athina_memory ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE athina_plans ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE athina_task_results ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE athina_context ADD COLUMN IF NOT EXISTS user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_athina_memory_user ON athina_memory(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_athina_plans_user ON athina_plans(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_athina_task_results_user ON athina_task_results(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_athina_context_user_key ON athina_context(user_id, key);

CREATE TABLE IF NOT EXISTS athina_answer_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT,
  request_key TEXT NOT NULL,
  request_text TEXT NOT NULL,
  reply TEXT NOT NULL,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'agent',
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_athina_answer_cache_session_key ON athina_answer_cache(session_id, request_key);
CREATE INDEX IF NOT EXISTS idx_athina_answer_cache_user_key ON athina_answer_cache(user_id, request_key);

CREATE TABLE IF NOT EXISTS athina_memory_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT,
  source TEXT NOT NULL DEFAULT 'conversation',
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_athina_memory_embeddings_session ON athina_memory_embeddings(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_athina_memory_embeddings_user ON athina_memory_embeddings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_athina_memory_embeddings_vector ON athina_memory_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE OR REPLACE FUNCTION match_athina_memories(
  query_embedding_input TEXT,
  filter_user_id TEXT DEFAULT NULL,
  filter_session_id TEXT DEFAULT NULL,
  match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  session_id TEXT,
  user_id TEXT,
  source TEXT,
  content TEXT,
  metadata JSONB,
  similarity DOUBLE PRECISION
)
LANGUAGE SQL
AS $$
  SELECT
    memory.id,
    memory.session_id,
    memory.user_id,
    memory.source,
    memory.content,
    memory.metadata,
    1 - (memory.embedding <=> query_embedding_input::vector(1536)) AS similarity
  FROM athina_memory_embeddings AS memory
  WHERE (
    (filter_user_id IS NOT NULL AND memory.user_id = filter_user_id)
    OR
    (filter_user_id IS NULL AND filter_session_id IS NOT NULL AND memory.session_id = filter_session_id)
  )
  ORDER BY memory.embedding <=> query_embedding_input::vector(1536)
  LIMIT GREATEST(match_count, 1);
$$;

CREATE TABLE IF NOT EXISTS athina_validation_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT,
  proposal_name TEXT NOT NULL,
  proposal_storage_path TEXT,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_athina_validation_reports_session ON athina_validation_reports(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_athina_validation_reports_user ON athina_validation_reports(user_id, created_at DESC);

ALTER TABLE athina_answer_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE athina_memory_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE athina_validation_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "athina_answer_cache_all" ON athina_answer_cache FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "athina_memory_embeddings_all" ON athina_memory_embeddings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "athina_validation_reports_all" ON athina_validation_reports FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
SELECT 'athina-validator', 'athina-validator', false
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'athina-validator'
);