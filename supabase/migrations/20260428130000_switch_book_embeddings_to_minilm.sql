DROP INDEX IF EXISTS public.book_embeddings_embedding_idx;
DROP FUNCTION IF EXISTS public.match_book_embeddings(vector(768), integer);
DROP FUNCTION IF EXISTS public.match_book_embeddings(vector(384), integer);

TRUNCATE TABLE public.book_embeddings;

ALTER TABLE public.book_embeddings
  ALTER COLUMN embedding TYPE vector(384);

CREATE INDEX IF NOT EXISTS book_embeddings_embedding_idx
  ON public.book_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE OR REPLACE FUNCTION public.match_book_embeddings(
  query_embedding vector(384),
  match_count INTEGER DEFAULT 8
)
RETURNS TABLE (
  isbn13 TEXT,
  similarity DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    be.isbn13,
    1 - (be.embedding <=> query_embedding) AS similarity
  FROM public.book_embeddings AS be
  ORDER BY be.embedding <=> query_embedding
  LIMIT match_count;
$$;
