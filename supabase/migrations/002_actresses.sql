-- Actresses: profiles for content creators

CREATE TABLE IF NOT EXISTS public.actresses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE NOT NULL,
  name        text NOT NULL,
  ruby        text,
  image_url   text,
  metadata    jsonb,
  is_active   boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS actresses_name_idx ON public.actresses (name);

ALTER TABLE public.actresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active actresses"
  ON public.actresses FOR SELECT
  USING (is_active = true);

GRANT SELECT ON public.actresses TO anon, authenticated;
