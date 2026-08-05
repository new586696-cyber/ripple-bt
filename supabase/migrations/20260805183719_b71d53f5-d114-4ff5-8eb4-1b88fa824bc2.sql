
CREATE POLICY stickers_own_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'stickers' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'stickers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY stories_read_authenticated ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'stories');

CREATE POLICY stories_write_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'stories' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY stories_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'stories' AND (storage.foldername(name))[1] = auth.uid()::text);
