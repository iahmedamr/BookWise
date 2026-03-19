ALTER TABLE public.profiles DROP COLUMN IF EXISTS username;

ALTER TABLE public.reading_list
  ALTER COLUMN status SET DEFAULT 'wishlist';