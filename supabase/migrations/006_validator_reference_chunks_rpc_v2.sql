-- Replace the original RPC with an unambiguous vector-typed contract.
DROP FUNCTION IF EXISTS public.match_validator_reference_chunks(text, text, integer);
DROP FUNCTION IF EXISTS public.match_validator_reference_chunks_v2(vector, text, integer);

CREATE OR REPLACE FUNCTION public.match_validator_reference_chunks_v2(
  p_query_embedding vector(1536),
  p_filter_category TEXT DEFAULT NULL,
  p_match_count INTEGER DEFAULT 8
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
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    reference.id,
    reference.file_name,
    reference.file_path,
    reference.category,
    reference.chunk_index,
    reference.chunk_text,
    reference.chunk_hash,
    1 - (reference.embedding <=> p_query_embedding) AS similarity
  FROM public.validator_reference_chunks AS reference
  WHERE p_filter_category IS NULL
     OR lower(reference.category) = lower(p_filter_category)
  ORDER BY reference.embedding <=> p_query_embedding
  LIMIT GREATEST(p_match_count, 1);
$$;

NOTIFY pgrst, 'reload schema';