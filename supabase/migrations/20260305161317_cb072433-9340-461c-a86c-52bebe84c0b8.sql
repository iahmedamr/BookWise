
-- Add favourites table
CREATE TABLE IF NOT EXISTS public.favourites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  book_isbn13 TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, book_isbn13)
);

ALTER TABLE public.favourites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view any favourites" ON public.favourites FOR SELECT USING (true);
CREATE POLICY "Users can insert own favourites" ON public.favourites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own favourites" ON public.favourites FOR DELETE USING (auth.uid() = user_id);

-- Add privacy/preferences columns to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS is_books_public BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accept_friend_requests BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accept_suggestions BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accept_notifications BOOLEAN NOT NULL DEFAULT true;
