CREATE TABLE public.count_sessions (
  id text NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text, file_name text, sheet_name text, status text,
  edit_count integer DEFAULT 0, original_path text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at bigint NOT NULL, updated_at bigint NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE TABLE public.count_aliases (id text NOT NULL, user_id uuid NOT NULL DEFAULT auth.uid(), data jsonb NOT NULL, updated_at bigint NOT NULL, PRIMARY KEY (user_id, id));
CREATE TABLE public.count_corrections (id text NOT NULL, user_id uuid NOT NULL DEFAULT auth.uid(), data jsonb NOT NULL, updated_at bigint NOT NULL, PRIMARY KEY (user_id, id));
CREATE TABLE public.count_unit_corrections (id text NOT NULL, user_id uuid NOT NULL DEFAULT auth.uid(), data jsonb NOT NULL, updated_at bigint NOT NULL, PRIMARY KEY (user_id, id));
CREATE TABLE public.count_app_state (user_id uuid PRIMARY KEY DEFAULT auth.uid(), active_id text);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['count_sessions','count_aliases','count_corrections','count_unit_corrections','count_app_state'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "own select" ON public.%I FOR SELECT TO authenticated USING (user_id = auth.uid())', t);
    EXECUTE format('CREATE POLICY "own insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())', t);
    EXECUTE format('CREATE POLICY "own update" ON public.%I FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t);
    EXECUTE format('CREATE POLICY "own delete" ON public.%I FOR DELETE TO authenticated USING (user_id = auth.uid())', t);
  END LOOP;
END $$;

CREATE POLICY "count originals read own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'count-originals' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "count originals insert own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'count-originals' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "count originals update own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'count-originals' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'count-originals' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "count originals delete own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'count-originals' AND (storage.foldername(name))[1] = auth.uid()::text);