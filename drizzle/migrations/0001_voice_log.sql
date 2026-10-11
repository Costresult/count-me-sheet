CREATE TABLE IF NOT EXISTS public.count_voice_log (
  id text NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  data jsonb NOT NULL,
  updated_at bigint NOT NULL,
  PRIMARY KEY (user_id, id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.count_voice_log TO authenticated;
GRANT ALL ON public.count_voice_log TO service_role;
ALTER TABLE public.count_voice_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own select" ON public.count_voice_log FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own insert" ON public.count_voice_log FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own update" ON public.count_voice_log FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own delete" ON public.count_voice_log FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS count_voice_log_updated_idx ON public.count_voice_log (user_id, updated_at DESC);
