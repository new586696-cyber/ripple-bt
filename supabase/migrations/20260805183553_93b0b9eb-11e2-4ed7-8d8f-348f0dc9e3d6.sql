
-- ============ push_subscriptions ============
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_subs_select_own ON public.push_subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY push_subs_insert_own ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY push_subs_update_own ON public.push_subscriptions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY push_subs_delete_own ON public.push_subscriptions FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============ stories ============
CREATE TABLE public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('image','video','text')),
  media_url text,
  text_content text,
  background jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
CREATE INDEX stories_expires_idx ON public.stories (expires_at);
CREATE INDEX stories_user_idx ON public.stories (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories TO authenticated;
GRANT ALL ON public.stories TO service_role;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY stories_select_visible ON public.stories FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR NOT public.is_blocked(auth.uid(), user_id));
CREATE POLICY stories_insert_own ON public.stories FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY stories_delete_own ON public.stories FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.story_owner(_story_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id FROM public.stories WHERE id = _story_id;
$$;

-- ============ story_views ============
CREATE TABLE public.story_views (
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);
GRANT SELECT, INSERT, DELETE ON public.story_views TO authenticated;
GRANT ALL ON public.story_views TO service_role;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY story_views_insert_self ON public.story_views FOR INSERT TO authenticated WITH CHECK (viewer_id = auth.uid());
CREATE POLICY story_views_select ON public.story_views FOR SELECT TO authenticated
  USING (viewer_id = auth.uid() OR public.story_owner(story_id) = auth.uid());

-- ============ friend_streaks ============
CREATE TABLE public.friend_streaks (
  user_a uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  count integer NOT NULL DEFAULT 0,
  last_interaction_date date,
  freeze_days_remaining integer NOT NULL DEFAULT 3,
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);
GRANT SELECT, INSERT, UPDATE ON public.friend_streaks TO authenticated;
GRANT ALL ON public.friend_streaks TO service_role;
ALTER TABLE public.friend_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY streaks_select_pair ON public.friend_streaks FOR SELECT TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b);

-- ============ receipt_overrides ============
CREATE TABLE public.receipt_overrides (
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  show_read_receipts boolean NOT NULL,
  PRIMARY KEY (owner_id, target_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_overrides TO authenticated;
GRANT ALL ON public.receipt_overrides TO service_role;
ALTER TABLE public.receipt_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY receipt_overrides_all_own ON public.receipt_overrides FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ============ stickers ============
CREATE TABLE public.stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.stickers TO authenticated;
GRANT ALL ON public.stickers TO service_role;
ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;
CREATE POLICY stickers_all_own ON public.stickers FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ contact_nicknames ============
CREATE TABLE public.contact_nicknames (
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nickname text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, target_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_nicknames TO authenticated;
GRANT ALL ON public.contact_nicknames TO service_role;
ALTER TABLE public.contact_nicknames ENABLE ROW LEVEL SECURITY;
CREATE POLICY nicknames_all_own ON public.contact_nicknames FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ============ chat_participants personalisation ============
ALTER TABLE public.chat_participants
  ADD COLUMN IF NOT EXISTS wallpaper text,
  ADD COLUMN IF NOT EXISTS notification_sound text,
  ADD COLUMN IF NOT EXISTS muted_until timestamptz;

-- ============ streak maintenance ============
CREATE OR REPLACE FUNCTION public.touch_friend_streak()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  other_id uuid;
  a uuid; b uuid;
  today date := (NEW.created_at AT TIME ZONE 'UTC')::date;
  both_today boolean;
  row_streak public.friend_streaks%ROWTYPE;
  gap integer;
BEGIN
  SELECT p.user_id INTO other_id
  FROM public.chat_participants p
  JOIN public.chats c ON c.id = p.chat_id AND c.type = 'direct'
  WHERE p.chat_id = NEW.chat_id AND p.user_id <> NEW.sender_id
  LIMIT 1;

  IF other_id IS NULL THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.chat_id = NEW.chat_id AND m.sender_id = other_id
      AND (m.created_at AT TIME ZONE 'UTC')::date = today
  ) INTO both_today;

  IF NOT both_today THEN RETURN NEW; END IF;

  a := LEAST(NEW.sender_id, other_id);
  b := GREATEST(NEW.sender_id, other_id);

  SELECT * INTO row_streak FROM public.friend_streaks WHERE user_a = a AND user_b = b;

  IF NOT FOUND THEN
    INSERT INTO public.friend_streaks (user_a, user_b, count, last_interaction_date)
    VALUES (a, b, 1, today)
    ON CONFLICT (user_a, user_b) DO NOTHING;
    RETURN NEW;
  END IF;

  IF row_streak.last_interaction_date = today THEN RETURN NEW; END IF;

  gap := today - COALESCE(row_streak.last_interaction_date, today - 1) - 1;

  IF gap <= 0 THEN
    UPDATE public.friend_streaks SET count = count + 1, last_interaction_date = today
      WHERE user_a = a AND user_b = b;
  ELSIF gap <= row_streak.freeze_days_remaining THEN
    UPDATE public.friend_streaks
      SET count = count + 1, last_interaction_date = today,
          freeze_days_remaining = freeze_days_remaining - gap
      WHERE user_a = a AND user_b = b;
  ELSE
    UPDATE public.friend_streaks
      SET count = 1, last_interaction_date = today, freeze_days_remaining = 3
      WHERE user_a = a AND user_b = b;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_message_streak
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.touch_friend_streak();

-- ============ expired story purge ============
CREATE OR REPLACE FUNCTION public.purge_expired_stories()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.stories WHERE expires_at < now();
$$;
