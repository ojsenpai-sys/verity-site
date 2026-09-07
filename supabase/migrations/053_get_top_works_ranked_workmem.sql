-- ══════════════════════════════════════════════════════════════════════════════
-- 053_get_top_works_ranked_workmem.sql — get_top_works_ranked に関数ローカル work_mem を付与
-- ══════════════════════════════════════════════════════════════════════════════
-- 背景（詳細: Phase RANK-1/RANK-2a 調査）:
--   get_top_works_ranked()（031）の統計timeout残存の根本原因を production の
--   pg_stat_statements / Postgres logs / EXPLAIN (ANALYZE, BUFFERS, VERBOSE,
--   SETTINGS) で実測調査した結果、以下が確定した:
--     - 直近14日 user_events（記事イベント）57,849行 → 19,663グループへの
--       HashAggregate が支配的コスト（総実行時間の約88%）。
--     - DB共通 work_mem=3500kB に対しハッシュ集計がメモリ不足で
--       Batches=5 のディスクスピル（Disk Usage=744kB）を起こしていた。
--     - anon ロールの statement_timeout=3s に対し、この関数の成功実行の
--       mean=1968ms・max=2999.5ms（=3s直下で打ち切られた分は
--       pg_stat_statements に記録されないため、実際の分布はさらに右に長い）。
--     - 同一 stats_reset ウィンドウ（約59時間）で本関数向けの
--       "canceling statement due to statement timeout" が14,500件観測された
--       （成功実行 約4,834件に対し失敗が多数を占める）。
--     - インデックスは適切に使用されており（user_events_article_scoring_idx
--       等）、不足インデックスは確認されなかった。
--
-- 本migrationの内容:
--   get_top_works_ranked() の関数本体（ロジック・スコア定義・時間減衰・
--   JOIN・LIMIT等）は031から一切変更しない。関数レベル設定として
--   SET work_mem = '16MB' を追加するのみ（DB/ロール/グローバルのwork_memは
--   変更しない — この関数の呼び出し中のみ有効なスコープ）。
--
--   Phase RANK-2a のpreflight検証（本番、EXPLAIN ANALYZE 1回のみ実行・
--   読み取り専用）で確認済み:
--     - work_mem=16MBでHashAggregateがBatches=1（ディスクスピル解消）に改善。
--     - Execution Time: 1398.555ms → 1210.173ms（約13.5%改善）。
--     - ranking結果（external_id/points/順位）は完全に同一（意味論変更なし）。
--
-- 本migrationが対応しないスコープ（意図的）:
--   - /verity/ranking の force-dynamic・非キャッシュ直接RPC呼び出し
--     （RANK-2b候補、別Phase）。
--   - works_ranking_cache 等の構造的キャッシュ化（RANK-2b候補、別Phase）。
--   - anon/authenticated の statement_timeout（変更しない）。
--   - インデックス追加（不要と判断済み）。
--   - app側のキャッシュTTL（unstable_cache 120秒、変更しない）。
--
-- ロールバック手順:
--   本migrationを取り消す場合、以下を実行して031の定義（work_mem設定なし）
--   へ戻す。本ファイル・031は両方とも残置したままでよい（forward-fixで
--   054番等として記録する）。
--
--     CREATE OR REPLACE FUNCTION public.get_top_works_ranked(p_limit int DEFAULT 10)
--     RETURNS TABLE(external_id text, points numeric)
--     LANGUAGE sql
--     STABLE
--     SECURITY DEFINER
--     SET search_path = public
--     AS $$
--       -- ...031と同一の本体... --
--     $$;
--
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_top_works_ranked(p_limit int DEFAULT 10)
RETURNS TABLE(external_id text, points numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET work_mem = '16MB'
AS $$
  WITH
  -- ① 作品個別イベント: PV=1 / サンプル視聴=5 を半減期7日で減衰加算
  ev_work AS (
    SELECT target_id AS cid,
           SUM(
             (CASE event_name WHEN 'page_view' THEN 1 WHEN 'video_view' THEN 5 ELSE 0 END)
             * power(0.5, EXTRACT(EPOCH FROM (now() - created_at)) / 604800.0)
           ) AS pts
    FROM user_events
    WHERE target_type = 'article'
      AND target_id IS NOT NULL
      AND event_name IN ('page_view', 'video_view')
      AND created_at >= now() - interval '14 days'
    GROUP BY target_id
  ),
  -- ② 出演女優お気に入り(+20)を半減期7日で減衰加算 → 女優ext単位で集約
  fav_actress AS (
    SELECT target_id AS actress_ext,
           SUM(20 * power(0.5, EXTRACT(EPOCH FROM (now() - created_at)) / 604800.0)) AS fav_pts
    FROM user_events
    WHERE target_type = 'actress'
      AND event_name  = 'favorite_actress'
      AND target_id IS NOT NULL
      AND created_at >= now() - interval '14 days'
    GROUP BY target_id
  ),
  -- ③ 女優ext → 女優名 → 出演アクティブ作品へ「比例分散」(20 ÷ 出演作品数)
  fav_work AS (
    SELECT a.external_id AS cid,
           SUM(fa.fav_pts / cnt.c) AS pts
    FROM fav_actress fa
    JOIN actresses ac ON ac.external_id = fa.actress_ext
    JOIN LATERAL (
      SELECT GREATEST(count(*), 1) AS c
      FROM articles a2
      WHERE a2.is_active AND a2.tags @> ARRAY[ac.name]
    ) cnt ON true
    JOIN articles a ON a.is_active AND a.tags @> ARRAY[ac.name]
    GROUP BY a.external_id
  ),
  -- ④ ①②③を合算
  merged AS (
    SELECT cid, SUM(pts) AS pts
    FROM (
      SELECT cid, pts FROM ev_work
      UNION ALL
      SELECT cid, pts FROM fav_work
    ) u
    GROUP BY cid
  )
  SELECT m.cid AS external_id, round(m.pts::numeric, 1) AS points
  FROM merged m
  JOIN articles a ON a.external_id = m.cid AND a.is_active = true
  WHERE m.pts > 0
  ORDER BY m.pts DESC
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_top_works_ranked(int) TO anon, authenticated, service_role;
