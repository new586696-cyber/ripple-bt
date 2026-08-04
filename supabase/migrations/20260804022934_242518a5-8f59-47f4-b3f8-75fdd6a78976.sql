ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_last_seen boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_read_receipts boolean NOT NULL DEFAULT true;
