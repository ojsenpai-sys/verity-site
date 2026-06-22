-- ══════════════════════════════════════════════════════════════════════════════
-- 034_favorite_event_emission.sql — favorite イベント収集の単一発火源化（C案 Phase1）
-- ══════════════════════════════════════════════════════════════════════════════
-- 【目的】favorite 保存と user_events 計上を経路非依存・原子的に一致させる。
--   - 作品: record_favorite_article() RPC（favorite_articles + user_events 同一tx・session_id保持）
--   - 女優: 既存 intent-aware 差分トリガ sync_favorite_actresses_from_profiles() に
--           favorite_actress/unfavorite_actress の user_events 発火を追加（session_id=NULL/server由来）
--   client trackEvent は撤廃（別途アプリ側）。既存集計（preference_weights/*_popularity/
--   refresh_user_profiles）は user_events を読むため無変更で動く。
-- 冪等（CREATE OR REPLACE）。
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 作品 RPC（単体）────────────────────────────────────────────────────────────
-- 変化があった時のみ計上（add済み再add / 対象なしremove は no-op = event無し）＝冪等。
CREATE OR REPLACE FUNCTION public.record_favorite_article(
  p_user_id    uuid,
  p_cid        text,
  p_action     text,
  p_session_id text DEFAULT NULL,
  p_source     text DEFAULT 'rpc'
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_changed boolean := false;
BEGIN
  -- 認可: 認証文脈があれば本人のみ。service_role/backfill は auth.uid()=NULL で通過。
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'forbidden: user mismatch';
  END IF;
  IF p_action NOT IN ('add','remove') THEN
    RAISE EXCEPTION 'invalid action: %', p_action;
  END IF;

  IF p_action = 'add' THEN
    INSERT INTO favorite_articles(user_id, article_external_id)
    VALUES (p_user_id, p_cid)
    ON CONFLICT (user_id, article_external_id) DO NOTHING;
    v_changed := FOUND;
    IF v_changed THEN
      INSERT INTO user_events(user_id, session_id, event_name, target_type, target_id, metadata)
      VALUES (p_user_id, p_session_id, 'favorite_work', 'article', p_cid,
              jsonb_build_object('source', p_source));
    END IF;
  ELSE
    DELETE FROM favorite_articles
    WHERE user_id = p_user_id AND article_external_id = p_cid;
    v_changed := FOUND;
    IF v_changed THEN
      INSERT INTO user_events(user_id, session_id, event_name, target_type, target_id, metadata)
      VALUES (p_user_id, p_session_id, 'unfavorite_work', 'article', p_cid,
              jsonb_build_object('source', p_source));
    END IF;
  END IF;

  RETURN v_changed;
END; $$;
GRANT EXECUTE ON FUNCTION public.record_favorite_article(uuid,text,text,text,text) TO authenticated, service_role;

-- ── 作品 RPC（bulk・sync-articles の N往復回避）──────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_favorite_articles(
  p_user_id    uuid,
  p_cids       text[],
  p_action     text,
  p_session_id text DEFAULT NULL,
  p_source     text DEFAULT 'rpc'
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c text; n int := 0;
BEGIN
  FOREACH c IN ARRAY COALESCE(p_cids, '{}') LOOP
    IF public.record_favorite_article(p_user_id, c, p_action, p_session_id, p_source) THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END; $$;
GRANT EXECUTE ON FUNCTION public.record_favorite_articles(uuid,text[],text,text,text) TO authenticated, service_role;

-- ── 女優 差分トリガに event 発火を追加（★が追加分。射影ロジックは従来どおり）────────
CREATE OR REPLACE FUNCTION public.sync_favorite_actresses_from_profiles()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_ids uuid[] := COALESCE(OLD.favorite_actress_ids, '{}');
  v_new_ids uuid[] := COALESCE(NEW.favorite_actress_ids, '{}');
  v_removed uuid[];
  v_added   uuid[];
BEGIN
  SELECT array_agg(t.id) INTO v_removed FROM unnest(v_old_ids) AS t(id) WHERE t.id != ALL(v_new_ids);
  SELECT array_agg(t.id) INTO v_added   FROM unnest(v_new_ids) AS t(id) WHERE t.id != ALL(v_old_ids);

  IF v_removed IS NOT NULL THEN
    DELETE FROM public.favorite_actresses
    WHERE user_id = NEW.user_id AND actress_id = ANY(v_removed);
    -- ★ unfavorite_actress（actress_id→external_id 解決・session_id=NULL）
    INSERT INTO public.user_events(user_id, event_name, target_type, target_id, metadata)
    SELECT NEW.user_id, 'unfavorite_actress', 'actress', a.external_id,
           jsonb_build_object('source', 'profiles_sync')
    FROM unnest(v_removed) AS t(id) JOIN public.actresses a ON a.id = t.id;
  END IF;

  IF v_added IS NOT NULL THEN
    INSERT INTO public.favorite_actresses (user_id, actress_id)
    SELECT NEW.user_id, t.id FROM unnest(v_added) AS t(id)
    ON CONFLICT DO NOTHING;
    -- ★ favorite_actress
    INSERT INTO public.user_events(user_id, event_name, target_type, target_id, metadata)
    SELECT NEW.user_id, 'favorite_actress', 'actress', a.external_id,
           jsonb_build_object('source', 'profiles_sync')
    FROM unnest(v_added) AS t(id) JOIN public.actresses a ON a.id = t.id;
  END IF;

  RETURN NEW;
END; $$;
-- トリガ定義(AFTER UPDATE OF favorite_actress_ids ON profiles)は 020 のまま・関数のみ差替。
