-- ══════════════════════════════════════════════════════════════════════════════
-- 035_favorite_event_backfill.sql — 既存お気に入りの favorite イベント backfill
-- ══════════════════════════════════════════════════════════════════════════════
-- 034 適用前から存在する favorite_articles / favorite_actresses に対応する
-- favorite_work / favorite_actress イベントを 1 回だけ補填する。
--   - 既に同等イベントがあればスキップ（WHERE NOT EXISTS）＝ 再実行安全（冪等）。
--   - created_at は登録日時を踏襲。source='backfill'、session_id=NULL。
--   - 注意: unfavorite(削除)履歴は現在状態から復元不能 → 「現存お気に入り」分のみ。
-- ══════════════════════════════════════════════════════════════════════════════

-- 作品
INSERT INTO public.user_events(user_id, session_id, event_name, target_type, target_id, metadata, created_at)
SELECT fa.user_id, NULL, 'favorite_work', 'article', fa.article_external_id,
       jsonb_build_object('source','backfill'), fa.created_at
FROM public.favorite_articles fa
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_events e
  WHERE e.user_id = fa.user_id
    AND e.event_name = 'favorite_work'
    AND e.target_type = 'article'
    AND e.target_id = fa.article_external_id
);

-- 女優（actress_id → external_id 解決）
INSERT INTO public.user_events(user_id, session_id, event_name, target_type, target_id, metadata, created_at)
SELECT fc.user_id, NULL, 'favorite_actress', 'actress', a.external_id,
       jsonb_build_object('source','backfill'), fc.created_at
FROM public.favorite_actresses fc
JOIN public.actresses a ON a.id = fc.actress_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_events e
  WHERE e.user_id = fc.user_id
    AND e.event_name = 'favorite_actress'
    AND e.target_type = 'actress'
    AND e.target_id = a.external_id
);
