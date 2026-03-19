ALTER TABLE public.reading_list
  ADD CONSTRAINT reading_list_status_check
  CHECK (status = ANY (ARRAY['wishlist'::text, 'currently_reading'::text, 'finished'::text]));