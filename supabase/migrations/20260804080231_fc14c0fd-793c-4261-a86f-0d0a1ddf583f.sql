CREATE TYPE public.chat_type AS ENUM ('direct','group');
CREATE TYPE public.message_type AS ENUM ('text','image','voice','file');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT 'New user',
  email text,
  photo_url text,
  status_message text NOT NULL DEFAULT 'Hey there! I''m using Ripple',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  show_last_seen boolean NOT NULL DEFAULT true,
  show_read_receipts boolean NOT NULL DEFAULT true
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.chat_type NOT NULL,
  direct_key text UNIQUE,
  group_name text,
  group_photo_url text,
  last_message_text text,
  last_message_sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_message_type public.message_type,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chats TO authenticated;
GRANT ALL ON public.chats TO service_role;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.chat_participants (
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_admin boolean NOT NULL DEFAULT false,
  last_read_at timestamptz NOT NULL DEFAULT 'epoch'::timestamptz,
  joined_at timestamptz NOT NULL DEFAULT now(),
  muted boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  PRIMARY KEY (chat_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_participants TO authenticated;
GRANT ALL ON public.chat_participants TO service_role;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_participants_user ON public.chat_participants(user_id);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  type public.message_type NOT NULL DEFAULT 'text',
  text text,
  media_url text,
  media_meta jsonb,
  reply_to uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  edited_at timestamptz,
  deleted_at timestamptz,
  mentions uuid[],
  link_preview jsonb,
  forwarded boolean NOT NULL DEFAULT false
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_messages_chat_created ON public.messages(chat_id, created_at);

CREATE OR REPLACE FUNCTION public.is_chat_participant(_chat_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_participants WHERE chat_id = _chat_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_chat_admin(_chat_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_participants WHERE chat_id = _chat_id AND user_id = _user_id AND is_admin);
$$;

CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "chats_select_participant" ON public.chats FOR SELECT TO authenticated
  USING (public.is_chat_participant(id, auth.uid()));
CREATE POLICY "chats_insert_own" ON public.chats FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "chats_update_admin_or_direct" ON public.chats FOR UPDATE TO authenticated
  USING (public.is_chat_participant(id, auth.uid()) AND (type = 'direct' OR public.is_chat_admin(id, auth.uid())))
  WITH CHECK (public.is_chat_participant(id, auth.uid()) AND (type = 'direct' OR public.is_chat_admin(id, auth.uid())));

CREATE POLICY "participants_select" ON public.chat_participants FOR SELECT TO authenticated
  USING (public.is_chat_participant(chat_id, auth.uid()));
CREATE POLICY "participants_insert" ON public.chat_participants FOR INSERT TO authenticated
  WITH CHECK (
    public.is_chat_admin(chat_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.chats c WHERE c.id = chat_id AND c.created_by = auth.uid())
  );
CREATE POLICY "participants_update_self_or_admin" ON public.chat_participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_chat_admin(chat_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_chat_admin(chat_id, auth.uid()));
CREATE POLICY "participants_delete_self_or_admin" ON public.chat_participants FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_chat_admin(chat_id, auth.uid()));

CREATE POLICY "messages_select_participant" ON public.messages FOR SELECT TO authenticated
  USING (public.is_chat_participant(chat_id, auth.uid()));
CREATE POLICY "messages_update_own" ON public.messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid()) WITH CHECK (sender_id = auth.uid());
CREATE POLICY "messages_delete_own" ON public.messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email, photo_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email,'user@'), '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.chats SET
    last_message_text = COALESCE(NULLIF(NEW.text, ''), CASE NEW.type WHEN 'image' THEN 'Photo' WHEN 'voice' THEN 'Voice message' WHEN 'file' THEN COALESCE(NEW.media_meta->>'fileName','File') ELSE '' END),
    last_message_sender_id = NEW.sender_id,
    last_message_type = NEW.type,
    last_message_at = NEW.created_at
  WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_message_created
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.handle_new_message();

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.chats REPLICA IDENTITY FULL;
ALTER TABLE public.chat_participants REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_participants;

CREATE POLICY "chat_media_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-media' AND public.is_chat_participant(((storage.foldername(name))[2])::uuid, auth.uid()));
CREATE POLICY "chat_media_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-media' AND public.is_chat_participant(((storage.foldername(name))[2])::uuid, auth.uid()));
CREATE POLICY "chat_media_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-media' AND public.is_chat_participant(((storage.foldername(name))[2])::uuid, auth.uid()));

CREATE POLICY "avatars_select_authenticated" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "avatars_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_deletions TO authenticated;
GRANT ALL ON public.message_deletions TO service_role;
ALTER TABLE public.message_deletions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.message_stars (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_stars TO authenticated;
GRANT ALL ON public.message_stars TO service_role;
ALTER TABLE public.message_stars ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.chat_pins (
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  pinned_by uuid NOT NULL REFERENCES public.profiles(id),
  pinned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, message_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_pins TO authenticated;
GRANT ALL ON public.chat_pins TO service_role;
ALTER TABLE public.chat_pins ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_blocks TO authenticated;
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

REVOKE EXECUTE ON FUNCTION public.is_chat_participant(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_chat_admin(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_message() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.message_chat_id(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.chat_has_block(uuid, uuid) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.is_chat_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_chat_admin(uuid, uuid) TO authenticated;
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