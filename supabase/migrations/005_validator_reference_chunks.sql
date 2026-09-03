-- RAG reference chunks used by the Proposal Validator.
CREATE TABLE IF NOT EXISTS validator_reference_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  category TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_hash TEXT NOT NULL UNIQUE,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_validator_reference_chunks_category
  ON validator_reference_chunks(category);

-- IVFFlat index creation needs more memory than the hosted default.
-- Reset immediately after the index so this does not affect later statements.
SET maintenance_work_mem = '64MB';

CREATE INDEX IF NOT EXISTS idx_validator_reference_chunks_embedding
  ON validator_reference_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

RESET maintenance_work_mem;

CREATE OR REPLACE FUNCTION match_validator_reference_chunks(
  query_embedding_input TEXT,
  filter_category TEXT DEFAULT NULL,
  match_count INTEGER DEFAULT 8
)
RETURNS TABLE (
  id UUID,
  file_name TEXT,
  file_path TEXT,
  category TEXT,
  chunk_index INTEGER,
  chunk_text TEXT,
  chunk_hash TEXT,
  similarity DOUBLE PRECISION
)
LANGUAGE SQL
AS $$
  SELECT
    reference.id,
    reference.file_name,
    reference.file_path,
    reference.category,
    reference.chunk_index,
    reference.chunk_text,
    reference.chunk_hash,
    1 - (reference.embedding <=> query_embedding_input::vector(1536)) AS similarity
  FROM validator_reference_chunks AS reference
  WHERE filter_category IS NULL OR reference.category = filter_category
  ORDER BY reference.embedding <=> query_embedding_input::vector(1536)
  LIMIT GREATEST(match_count, 1);
$$;