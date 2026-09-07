-- ══════════════════════════════════════════════════════════════════════════════
-- 054_works_ranking_cache.sql — 人気作品ランキングの事前計算キャッシュ（RANK-2b）
-- ══════════════════════════════════════════════════════════════════════════════
-- 背景（詳細: Phase RANK-1/RANK-2a/RANK-2b 調査）:
--   get_top_works_ranked()（031、RANK-2aでwork_mem=16MB付与・053）は直近14日の
--   user_events を都度フルスキャン・集計する高コストなRPCで、work_mem修正後も
--   1回の実行に約1.0〜1.1秒を要する。/verity/ranking が force-dynamic かつ
--   このRPCを非キャッシュで直接呼んでいるため、匿名ページビューの度に毎回
--   このフルスキャン集計が実行され、anon統計timeout（3秒）残存の主因になっていた。
--
-- 本migrationの内容:
--   人気女優ランキング（013 actress_ranking_cache）と同様に、人気作品ランキングも
--   事前計算キャッシュテーブルへ切り出す。ただしactress_ranking_cacheの構造を
--   そのまま踏襲はしない（Phase RANK-2b STEP1監査で判明した相違点は末尾コメント参照）。
--
--   - public.works_ranking_cache: 「現在の」ランキングのみを保持する単一世代キャッシュ
--     （actress_ranking_cacheのようなsnapshot_date別の無期限蓄積ではない。
--     本キャッシュは毎回 DELETE+INSERT で丸ごと置き換える方式のため、
--     brand_id/snapshot_date列は不要 — 複数世代を保持する要件が無いため）。
--   - public.refresh_works_ranking_cache(p_depth int DEFAULT 20): コア関数。
--     ランキングロジックを二重管理しないため、SQLを複製せず
--     get_top_works_ranked(p_depth) を呼び出して結果をそのままキャッシュへ
--     DELETE+INSERT する（RANK-2aのwork_mem=16MB関数ローカル設定も自動的に
--     適用される）。DELETE+INSERTは本関数1回の呼び出し内で完結し、
--     PL/pgSQL関数呼び出しは単一トランザクションとして実行されるため、
--     読み取り側（読み取りコミット分離レベル）が空/部分状態を観測することはない
--     （ステージングテーブルや世代IDのような追加の仕組みは、行数が最大20件の
--     小テーブルには過剰なため採用しない）。
--   - public.run_works_ranking_cache_refresh_job(): cron_status_runs 記録用
--     wrapper（052の run_snapshot_daily_kpi_job() と同一パターン）。
--   - pg_cron job "verity_refresh_works_ranking": 毎時45分（UTC）。
--     直近14日の減衰スコアであり秒単位の鮮度は不要なため、既存cronの
--     verity_refresh_analytics_4h/verity_snapshot_daily_kpi（毎時0分）・
--     verity_refresh_user_profiles（毎時15分）と重ならない毎時45分を選定。
--     作成直後は active=false（Phase RANK-2b STEP17で個別に有効化する）。
--
-- キャッシュ深度の選定（p_depth=20）:
--   既知の呼び出し元の最大 p_limit は10（worksRanking.ts既定値・Hero・
--   /verity/ranking）。admin-social-posts.ts の管理画面は3または5のみ選択可。
--   RANK-1のEXPLAIN ANALYZE実測で判明した通り、get_top_works_ranked()の
--   コストは14日分イベントの集計（GROUP BY）が支配的でLIMIT値にはほぼ依存しない
--   （LIMITは集計後のtop-N heapsortとして安価に適用される）。そのため
--   10→20への拡大はリフレッシュコストをほぼ増やさずに将来の呼び出し元
--   （例: ランキングページの表示件数拡張）に対する余裕を確保できる。
--
-- actress_ranking_cache（013）からの相違点（意図的・「盲目的コピーはしない」）:
--   1. 履歴を持たない単一世代キャッシュ（snapshot_date/brand_id列を持たない）。
--      人気作品ランキングに日次トレンド保持の要件は無いため。
--   2. リフレッシュ経路がVPS crontab→Next.js APIルート（CRON_SECRET保護）→
--      supabase-js upsertではなく、pg_cron→SQL関数→cron_status_runs記録という
--      より新しい方式（052で確立した方式）に統一。可動部品と公開APIルートの
--      攻撃面を減らせるため。
--   3. 画像URL等のapp側エンリッチメント（ranking-snapshot route内のavarticle
--      選定ロジック等）を持たない。作品ランキングは external_id をキーに
--      articles を都度JOINして表示情報を取得する既存パターン（worksRanking.ts）
--      をそのまま維持するため、キャッシュ自体はスコアデータのみで十分。
-- ══════════════════════════════════════════════════════════════════════════════

-- ── ① キャッシュテーブル ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.works_ranking_cache (
  external_id   text        PRIMARY KEY,
  points        numeric     NOT NULL,
  rank          integer     NOT NULL,
  calculated_at timestamptz NOT NULL DEFAULT now()
);

-- ORDER BY rank LIMIT N の読み取りを効率化。rankの一意性も保証する
-- （1回のrefresh内でrow_number()により1..Nが重複無く付与されるため、
--   このUNIQUE制約は不整合の早期検知としても機能する）。
CREATE UNIQUE INDEX IF NOT EXISTS works_ranking_cache_rank_idx
  ON public.works_ranking_cache (rank);

ALTER TABLE public.works_ranking_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'works_ranking_cache'
      AND policyname = 'public read works_ranking_cache'
  ) THEN
    CREATE POLICY "public read works_ranking_cache"
      ON public.works_ranking_cache FOR SELECT USING (true);
  END IF;
END $$;

GRANT SELECT ON public.works_ranking_cache TO anon, authenticated, service_role;

-- ── ② コアrefresh関数（ランキングロジックは複製せず031/053を再利用） ───────────
CREATE OR REPLACE FUNCTION public.refresh_works_ranking_cache(p_depth int DEFAULT 20)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.works_ranking_cache;
  INSERT INTO public.works_ranking_cache (external_id, points, rank, calculated_at)
  SELECT external_id, points, row_number() OVER (ORDER BY points DESC) AS rank, now()
  FROM public.get_top_works_ranked(p_depth);
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_works_ranking_cache(int) TO service_role;

-- ── ③ cron_status_runs記録用wrapper（052 run_snapshot_daily_kpi_job()と同一パターン） ──
CREATE OR REPLACE FUNCTION public.run_works_ranking_cache_refresh_job()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint; t0 timestamptz := clock_timestamp();
BEGIN
  INSERT INTO cron_status_runs(job_name) VALUES ('works_ranking_cache') RETURNING id INTO v_id;
  BEGIN
    PERFORM public.refresh_works_ranking_cache();
    UPDATE cron_status_runs SET finished_at=now(), status='ok',
      duration_ms=EXTRACT(MILLISECONDS FROM clock_timestamp()-t0)::int WHERE id=v_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE cron_status_runs SET finished_at=now(), status='error', error=SQLERRM,
      duration_ms=EXTRACT(MILLISECONDS FROM clock_timestamp()-t0)::int WHERE id=v_id;
    RAISE;  -- cron_status_runsへの記録後、pg_cron側にもfailedを残すため再送出
  END;
END; $$;
GRANT EXECUTE ON FUNCTION public.run_works_ranking_cache_refresh_job() TO service_role;

-- ── ④ pg_cron job（jobname管理・冪等・作成直後は active=false） ───────────────
-- 毎時45分（UTC）: 既存cron（毎時0分/毎時15分）と重ならない毎時スロット。
-- 14日減衰スコアのため秒単位の鮮度は不要。1時間毎で十分な鮮度と判断。
DO $$
DECLARE v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'verity_refresh_works_ranking';
  IF v_jobid IS NULL THEN
    v_jobid := cron.schedule(
      'verity_refresh_works_ranking',
      '45 * * * *',
      $cron$SET statement_timeout = '60s'; SELECT public.run_works_ranking_cache_refresh_job();$cron$
    );
    -- Phase RANK-2b STEP9で初回手動実行・検証するまでactive=falseで待機
    PERFORM cron.alter_job(job_id := v_jobid, active := false);
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 運用メモ（本migrationはファイル作成のみ・Supabase本番へは手動適用）
--
--   適用後の確認手順（Phase RANK-2b STEP9で実施）:
--     SELECT public.run_works_ranking_cache_refresh_job();
--     SELECT * FROM public.works_ranking_cache ORDER BY rank;
--     SELECT * FROM cron_status_runs WHERE job_name = 'works_ranking_cache'
--       ORDER BY started_at DESC LIMIT 1;
--
--   cron有効化（Phase RANK-2b STEP17・アプリ切替が健全であることを確認後）:
--     SELECT cron.alter_job(
--       (SELECT jobid FROM cron.job WHERE jobname='verity_refresh_works_ranking'),
--       active := true);
--
--   ロールバック手順:
--     SELECT cron.alter_job(
--       (SELECT jobid FROM cron.job WHERE jobname='verity_refresh_works_ranking'),
--       active := false);
--     -- テーブル/関数は残置のままでよい（読み取り側を031直接呼び出しへ戻せば無害）。
--     -- 完全に取り消す場合のみ:
--     -- SELECT cron.unschedule('verity_refresh_works_ranking');
--     -- DROP FUNCTION IF EXISTS public.run_works_ranking_cache_refresh_job();
--     -- DROP FUNCTION IF EXISTS public.refresh_works_ranking_cache(int);
--     -- DROP TABLE IF EXISTS public.works_ranking_cache;
-- ══════════════════════════════════════════════════════════════════════════════
