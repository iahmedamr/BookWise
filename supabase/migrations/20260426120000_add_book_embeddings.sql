CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.book_embeddings (
  isbn13       TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  authors      TEXT NOT NULL DEFAULT '',
  categories   TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  embedding    vector(384) NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
