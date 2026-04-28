-- =============================================================================
-- BOOKWORM APP - COMPLETE SUPABASE SCHEMA
-- Generated from all migrations (combined & deduplicated)
-- =============================================================================


-- =============================================================================
-- SECTION 1: FUNCTIONS
-- =============================================================================

-- Utility: auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;


-- Trigger: auto-create profile on new user signup
-- (Final version: uses first_name + last_name for display_name, no username)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (
    user_id,
    display_name,
    first_name,
    last_name,
    date_of_birth,
    gender,
    avatar_url
  )
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(trim(concat_ws(' ', NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'last_name')), ''),
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    (NEW.raw_user_meta_data->>'date_of_birth')::date,
    NEW.raw_user_meta_data->>'gender',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$function$;


-- =============================================================================
-- SECTION 2: TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles (extends auth.users)
-- -----------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id              UUID      NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID      NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    TEXT,
  first_name      TEXT,
  last_name       TEXT,
  -- username was added then removed in a later migration
  date_of_birth   DATE,
  gender          TEXT,
  avatar_url      TEXT,
  bio             TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  -- Privacy / preference flags
  is_books_public       BOOLEAN NOT NULL DEFAULT true,
  accept_friend_requests BOOLEAN NOT NULL DEFAULT true,
  accept_suggestions    BOOLEAN NOT NULL DEFAULT true,
  accept_notifications  BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- user_preferences (genre selections per user)
-- -----------------------------------------------------------------------------
CREATE TABLE public.user_preferences (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  genre      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, genre)
);

-- -----------------------------------------------------------------------------
-- reading_list
-- Status values: 'wishlist' | 'currently_reading' | 'finished'
-- -----------------------------------------------------------------------------
CREATE TABLE public.reading_list (
  id           UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_isbn13  TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'wishlist',
  current_page INTEGER DEFAULT 0,
  total_pages  INTEGER,
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, book_isbn13),
  CONSTRAINT reading_list_status_check
    CHECK (status = ANY (ARRAY['wishlist'::text, 'currently_reading'::text, 'finished'::text]))
);

-- -----------------------------------------------------------------------------
-- ratings (& reviews)
-- -----------------------------------------------------------------------------
CREATE TABLE public.ratings (
  id           UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_isbn13  TEXT    NOT NULL,
  rating       INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, book_isbn13)
);

-- -----------------------------------------------------------------------------
-- search_history
-- -----------------------------------------------------------------------------
CREATE TABLE public.search_history (
  id         UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- friendships
-- Status values: 'pending' | 'accepted' | 'rejected'
-- -----------------------------------------------------------------------------
CREATE TABLE public.friendships (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(requester_id, addressee_id)
);

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------
CREATE TABLE public.notifications (
  id                   UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type                 TEXT    NOT NULL,
  title                TEXT    NOT NULL,
  message              TEXT,
  related_user_id      UUID    REFERENCES auth.users(id) ON DELETE SET NULL,
  related_book_isbn13  TEXT,
  is_read              BOOLEAN NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- book_suggestions (friend-to-friend book recommendations)
-- -----------------------------------------------------------------------------
CREATE TABLE public.book_suggestions (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_isbn13  TEXT NOT NULL,
  message      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- favourites
-- -----------------------------------------------------------------------------
CREATE TABLE public.favourites (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_isbn13  TEXT NOT NULL,
  created_at   TIMESTAMPTZ WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, book_isbn13)
);

-- -----------------------------------------------------------------------------
-- book_embeddings
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.book_embeddings (
  isbn13       TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  authors      TEXT NOT NULL DEFAULT '',
  categories   TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  embedding    vector(384) NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX book_embeddings_embedding_idx
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


-- =============================================================================
-- SECTION 3: TRIGGERS
-- =============================================================================

-- Auto-create profile when a new user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at timestamps
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_reading_list_updated_at
  BEFORE UPDATE ON public.reading_list
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ratings_updated_at
  BEFORE UPDATE ON public.ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_friendships_updated_at
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =============================================================================
-- SECTION 4: ROW LEVEL SECURITY (RLS)
-- =============================================================================

ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_list    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favourites      ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Users can view any profile"
  ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- user_preferences
CREATE POLICY "Users can view own preferences"
  ON public.user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own preferences"
  ON public.user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own preferences"
  ON public.user_preferences FOR DELETE USING (auth.uid() = user_id);

-- reading_list (public read — so friends can see each other's lists)
CREATE POLICY "Anyone can view reading lists"
  ON public.reading_list FOR SELECT USING (true);
CREATE POLICY "Users can insert own reading list"
  ON public.reading_list FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reading list"
  ON public.reading_list FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reading list"
  ON public.reading_list FOR DELETE USING (auth.uid() = user_id);

-- ratings
CREATE POLICY "Anyone can view ratings"
  ON public.ratings FOR SELECT USING (true);
CREATE POLICY "Users can insert own ratings"
  ON public.ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ratings"
  ON public.ratings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ratings"
  ON public.ratings FOR DELETE USING (auth.uid() = user_id);

-- search_history
CREATE POLICY "Users can view own search history"
  ON public.search_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own search history"
  ON public.search_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own search history"
  ON public.search_history FOR DELETE USING (auth.uid() = user_id);

-- friendships
CREATE POLICY "Users can view own friendships"
  ON public.friendships FOR SELECT
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
CREATE POLICY "Users can send friend requests"
  ON public.friendships FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Users can update friendships they're part of"
  ON public.friendships FOR UPDATE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
CREATE POLICY "Users can delete own friendships"
  ON public.friendships FOR DELETE
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can insert notifications"
  ON public.notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE USING (auth.uid() = user_id);

-- book_suggestions
CREATE POLICY "Users can view suggestions they sent or received"
  ON public.book_suggestions FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Users can send suggestions"
  ON public.book_suggestions FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users can delete own sent suggestions"
  ON public.book_suggestions FOR DELETE USING (auth.uid() = sender_id);

-- favourites
CREATE POLICY "Users can view any favourites"
  ON public.favourites FOR SELECT USING (true);
CREATE POLICY "Users can insert own favourites"
  ON public.favourites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own favourites"
  ON public.favourites FOR DELETE USING (auth.uid() = user_id);


-- =============================================================================
-- SECTION 5: STORAGE BUCKET — avatars
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies (final versions after iterative fixes)
CREATE POLICY "Anyone can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can upload avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update own avatars"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own avatars"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);


-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
