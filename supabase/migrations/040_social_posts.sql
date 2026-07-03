-- ═══════════════════════════════════════════════════════════════════════════
-- 040_social_posts.sql  —  X投稿履歴・成果記録（social-posts Phase 2）
--
-- 【目的】
--   Phase1(admin/social-posts) で生成した投稿文を保存し、投稿後の「伸び」を記録する。
--   自動投稿はしない（X API連携は Phase4）。管理画面から過去投稿と成果を確認できる状態にする。
--
-- 【成果集計の原則（Hero v2.1 の窓ズレ教訓）】
--   成果は必ず posted_at（＝Xに実投稿した時刻＝施策開始）以降の窓で集計する。
--   施策開始前の期間を分母に混ぜない。posted_at IS NULL（下書き）は集計対象外。
--   アトリビューションは投稿URLに付与する ?vp=<track_code> を user_events.metadata->>'vp'
--   と突合して行う（下記 6 参照）。
--
-- 【権限】管理者専用。anon / authenticated には一切公開しない（service_role が RLS をバイパス）。
-- 【適用】レビュー後に手動適用（オーナー運用 / DDLは冪等）。まだ適用しないこと。
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. テーブル ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.social_posts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key         text NOT NULL DEFAULT 'verity',

  -- 生成メタ（Phase1 の GenerateInput / 結果に対応）
  post_type        text NOT NULL,                 -- ranking|new_releases|sale|actress_trending
  lang             text NOT NULL,                 -- ja|en|zh|all
  body             text NOT NULL,                 -- 実投稿本文（?vp= 付きURLを含む最終形）
  url              text,                          -- サイト内URL（?vp=track_code 付与済み）
  hashtags         text[] NOT NULL DEFAULT '{}',
  image_candidates jsonb  NOT NULL DEFAULT '[]'::jsonb,
  source_snapshot  jsonb,                         -- 生成時に載せた作品/女優等（再現・寄与分析用）

  -- 成果アトリビューションの鍵（?vp=<track_code>）。URL短縮のため10桁。
  track_code       text NOT NULL UNIQUE
                     DEFAULT lower(substr(md5(gen_random_uuid()::text), 1, 10)),

  -- 投稿ライフサイクル
  status           text NOT NULL DEFAULT 'draft', -- draft|posted|archived
  posted_at        timestamptz,                   -- 「投稿済み」確定時刻＝成果集計窓の起点
  tweet_url        text,                          -- 実際のXステータスURL（手入力・任意）
  external_tweet_id text,                         -- Phase4 API連携用（現状未使用）

  -- Xネイティブ指標（Phase2=手入力 / Phase4=API取得）
  impressions      integer,
  likes            integer,
  reposts          integer,
  replies          integer,
  bookmarks        integer,
  metrics_updated_at timestamptz,

  created_by       text,                          -- 管理者email
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz,

  CONSTRAINT social_posts_post_type_chk
    CHECK (post_type IN ('ranking','new_releases','sale','actress_trending')),
  CONSTRAINT social_posts_lang_chk
    CHECK (lang IN ('ja','en','zh','all')),
  CONSTRAINT social_posts_status_chk
    CHECK (status IN ('draft','posted','archived')),
  -- Xネイティブ指標は非負（アプリでもクランプ済みだがDBでも担保）。NULLは許容。
  CONSTRAINT social_posts_metrics_nonneg
    CHECK (coalesce(impressions,0) >= 0 AND coalesce(likes,0) >= 0 AND coalesce(reposts,0) >= 0
           AND coalesce(replies,0) >= 0 AND coalesce(bookmarks,0) >= 0),
  -- 投稿済みなら必ず posted_at を持つ（成果集計窓の起点が欠けないよう保証）。
  CONSTRAINT social_posts_posted_at_chk
    CHECK (status <> 'posted' OR posted_at IS NOT NULL)
);

-- ── 2. インデックス ──────────────────────────────────────────────────────────
-- 管理一覧（site × status × 投稿日時降順）
CREATE INDEX IF NOT EXISTS social_posts_list_idx
  ON public.social_posts (site_key, status, posted_at DESC NULLS LAST, created_at DESC);

-- タイプ×言語の伸び比較（ja/en/zh/all）
CREATE INDEX IF NOT EXISTS social_posts_type_lang_idx
  ON public.social_posts (site_key, post_type, lang);
-- track_code は UNIQUE 制約で索引済み（vp 逆引き）。

-- ── 3. RLS（管理者専用・完全遮断）────────────────────────────────────────────
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_posts FROM anon, authenticated;
GRANT  ALL ON public.social_posts TO service_role;
-- ポリシーは作らない ＝ anon/authenticated は完全遮断。
-- 管理画面の Server Action は service_role クライアント（svc()）から読み書きし RLS をバイパスする。

-- ── 4. updated_at 自動更新（任意）────────────────────────────────────────────
-- 既存に共通トリガ関数が無いため、アプリ側で updated_at = now() を渡す運用とする。
-- （将来共通トリガを導入する場合はここに CREATE TRIGGER を追加）

-- ── 5. 成果アトリビューション索引（本マイグレーションでは適用しない・後日別途）──────
--   既存の高トラフィック表 user_events への索引追加は本マイグレーションに含めない。
--   （新表作成と分離し、hot table への書き込みロックを回避するため）
--   vp タグ付きイベント（metadata.vp）が十分溜まってから、トランザクション外で
--   CONCURRENTLY で作成する:
--
--     CREATE INDEX CONCURRENTLY IF NOT EXISTS user_events_vp_idx
--       ON public.user_events ((metadata->>'vp'))
--       WHERE metadata ? 'vp';
--
--   ※CONCURRENTLY はトランザクションブロック内では実行不可。SQLエディタで単独実行すること。

-- ── 6. 成果集計の参考クエリ（適用不要・ドキュメント）─────────────────────────
--   投稿単位の成果は下記で取得する（必ず posted_at 以降の窓）。
--
--   SELECT event_name,
--          count(*)                    AS events,
--          count(DISTINCT session_id)  AS sessions
--   FROM   public.user_events
--   WHERE  metadata->>'vp' = <track_code>
--     AND  created_at    >= <posted_at>   -- 施策開始以降のみ。NULLなら集計しない。
--   GROUP  BY event_name;
--
--   指標マッピング:
--     fanza_click       → 送客（主KPI）
--     page_view         → リーチ/回遊（サイト内PV）
--     signup_complete   → 登録
--     video_view / favorite_work → エンゲージメント
--   Xネイティブ（impressions/likes/reposts）は social_posts 側の手入力列を使用。
