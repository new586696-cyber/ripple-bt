ALTER TABLE public.messages
  ADD COLUMN edited_at timestamptz,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN mentions uuid[],
  ADD COLUMN link_preview jsonb,
  ADD COLUMN forwarded boolean NOT NULL DEFAULT false;

ALTER TABLE public.chat_participants
  ADD COLUMN muted boolean NOT NULL DEFAULT false,
  ADD COLUMN archived boolean NOT NULL DEFAULT false;

CREATE TABLE public.message_reactions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.message_deletions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.message_deletions TO authenticated;
GRANT ALL ON public.message_deletions TO service_role;
ALTER TABLE public.message_deletions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.message_stars (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.message_stars TO authenticated;
GRANT ALL ON public.message_stars TO service_role;
ALTER TABLE public.message_stars ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.chat_pins (
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  pinned_by uuid NOT NULL REFERENCES public.profiles(id),
  pinned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, message_id)
);
GRANT SELECT, INSERT, DELETE ON public.chat_pins TO authenticated;
GRANT ALL ON public.chat_pins TO service_role;
ALTER TABLE public.chat_pins ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated;
GRANT ALL ON public.user_blocks TO service_role;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.message_chat_id(_message_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT chat_id FROM public.messages WHERE id = _message_id;
$$;

CREATE OR REPLACE FUNCTION public.is_blocked(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = _a AND blocked_id = _b) OR (blocker_id = _b AND blocked_id = _a)
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_has_block(_chat_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chats c
    JOIN public.chat_participants p ON p.chat_id = c.id AND p.user_id <> _user_id
    WHERE c.id = _chat_id AND c.type = 'direct' AND public.is_blocked(_user_id, p.user_id)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.message_chat_id(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.chat_has_block(uuid, uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.message_chat_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_has_block(uuid, uuid) TO authenticated;

CREATE POLICY "reactions_select_participant" ON public.message_reactions FOR SELECT TO authenticated
  USING (public.is_chat_participant(public.message_chat_id(message_id), auth.uid()));
CREATE POLICY "reactions_insert_own" ON public.message_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_chat_participant(public.message_chat_id(message_id), auth.uid()));
CREATE POLICY "reactions_update_own" ON public.message_reactions FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "reactions_delete_own" ON public.message_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "deletions_select_own" ON public.message_deletions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "deletions_insert_own" ON public.message_deletions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "deletions_delete_own" ON public.message_deletions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "stars_select_own" ON public.message_stars FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "stars_insert_own" ON public.message_stars FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_chat_participant(public.message_chat_id(message_id), auth.uid()));
CREATE POLICY "stars_delete_own" ON public.message_stars FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "pins_select_participant" ON public.chat_pins FOR SELECT TO authenticated
  USING (public.is_chat_participant(chat_id, auth.uid()));
CREATE POLICY "pins_insert_participant" ON public.chat_pins FOR INSERT TO authenticated
  WITH CHECK (pinned_by = auth.uid() AND public.is_chat_participant(chat_id, auth.uid()));
CREATE POLICY "pins_delete_participant" ON public.chat_pins FOR DELETE TO authenticated
  USING (public.is_chat_participant(chat_id, auth.uid()));

CREATE POLICY "blocks_select_own" ON public.user_blocks FOR SELECT TO authenticated
  USING (blocker_id = auth.uid() OR blocked_id = auth.uid());
CREATE POLICY "blocks_insert_own" ON public.user_blocks FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid());
CREATE POLICY "blocks_delete_own" ON public.user_blocks FOR DELETE TO authenticated
  USING (blocker_id = auth.uid());

DROP POLICY "messages_insert_own" ON public.messages;
CREATE POLICY "messages_insert_own" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_chat_participant(chat_id, auth.uid())
    AND NOT public.chat_has_block(chat_id, auth.uid())
  );

ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.chat_pins REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_pins;
