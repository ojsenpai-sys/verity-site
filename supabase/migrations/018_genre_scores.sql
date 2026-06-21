-- ── genre_scores: ユーザーのジャンル傾向スコア管理 ────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS genre_scores   jsonb   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS profiling_done boolean NOT NULL DEFAULT false;

-- ── update_genre_scores: ジャンルスコアをアトミックに加算 ──────────────────────
-- p_delta: {"中出し": 10, "巨乳": 5} のように増分を渡す
-- p_mark_done: true なら profiling_done を true にセット
CREATE OR REPLACE FUNCTION public.update_genre_scores(
  p_user_id   uuid,
  p_brand_id  text,
  p_delta     jsonb,
  p_mark_done boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key    text;
  v_val    numeric;
  v_scores jsonb;
BEGIN
  SELECT COALESCE(genre_scores, '{}') INTO v_scores
  FROM profiles
  WHERE user_id = p_user_id AND brand_id = p_brand_id;

  FOR v_key, v_val IN
    SELECT key, (value #>> '{}')::numeric
    FROM jsonb_each(p_delta)
  LOOP
    v_scores := jsonb_set(
      v_scores,
      ARRAY[v_key],
      to_jsonb(COALESCE((v_scores ->> v_key)::numeric, 0) + v_val)
    );
  END LOOP;

  UPDATE profiles
  SET
    genre_scores   = v_scores,
    profiling_done = CASE WHEN p_mark_done THEN true ELSE profiling_done END
  WHERE user_id = p_user_id AND brand_id = p_brand_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_genre_scores(uuid, text, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_genre_scores(uuid, text, jsonb, boolean) TO authenticated;
