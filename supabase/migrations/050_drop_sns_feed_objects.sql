-- ═══════════════════════════════════════════════════════════════════════════════
-- 050_drop_sns_feed_objects.sql — 旧SNS Feed / マイギャラリー DBオブジェクト撤去 (Phase B)
-- ═══════════════════════════════════════════════════════════════════════════════
-- 背景: 女優X投稿をRapidAPI経由で取得しトップページ/マイギャラリーへ表示していた
--   旧SNS Feed機能は Phase A でアプリケーションコード側を完全撤去済み
--   (syncAllSocialFeeds/socialFeedSync.ts/SocialFeedSection等を削除、コード参照0件を確認済み)。
--   本migrationはその残存DBオブジェクト3件を撤去する。
--
-- Phase B事前調査で確認した実際の依存関係:
--   ・アプリコード参照: social_feeds / sn_sns_search_requests / last_gallery_checked_at
--     いずれも 0件（src/, scripts/ 全文検索済み）
--   ・他テーブルからの外部キー参照: 0件
--     （supabase/migrations 全文で REFERENCES public.social_feeds /
--       REFERENCES public.sn_sns_search_requests を検索し該当なし）
--   ・RPC/function/trigger/view からの参照: 0件
--     （create function/trigger/view を全migrationから抽出し確認、該当なし）
--   ・管理画面からの参照: 0件
--
-- 重要な発見（Phase B調査で判明・本番実データで確認）:
--   public.sn_sns_search_requests の実スキーマは 008_gallery.sql の定義
--   （id/actress_id uuid FK/brand_id/user_id FK/created_at）と一致しない。
--   本番の実列は actress_id(text, PK) と last_requested_at(timestamptz) の
--   2列のみで、外部キー制約は存在しない（PostgREST OpenAPI定義で実測確認、
--   実データの actress_id も 'dmm-actress-XXXXXXX' 形式の external_id 文字列であり
--   actresses.id(uuid) 型と一致しない）。008自体は適用済みのため書き換えない
--   （[[feedback_migration_forward_fix]] 方針）。本migrationは実スキーマに基づき、
--   FK起因のCASCADEが一切不要であることを確認したうえでの素朴な DROP のみを行う。
--
-- 実データ件数（Phase B調査時点・読み取り専用確認）:
--   social_feeds            = 2,680行（最終更新 2026-06-06、旧X投稿キャッシュ）
--   sn_sns_search_requests  = 3行
--   profiles.last_gallery_checked_at 非NULL = 1行のみ
--   → いずれも外部ソース(X/RapidAPI)由来のキャッシュ、または実質未使用のフラグ列であり、
--     VERITY独自の一次データではない。バックアップテーブルの新規作成は行わない
--     （Supabase側の自動バックアップ/PITRが復旧経路として別途存在するため）。
--
-- CASCADE不使用: 上記のとおり外部キー依存が存在しないため、CASCADEなしで安全に実行できる。
--
-- 適用方針: DDLはレビュー承認後に手動適用。本ファイル単体では本番へ反映されない。
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. sn_sns_search_requests テーブル削除 ────────────────────────────────────
-- 他テーブルからの参照なし・本テーブル自体のFKも実スキーマ上は存在しない。
DROP TABLE IF EXISTS public.sn_sns_search_requests;

-- ── 2. social_feeds テーブル削除 ──────────────────────────────────────────────
-- 他テーブルからの参照なし・FK制約なし（003_social_feeds.sql参照）。
DROP TABLE IF EXISTS public.social_feeds;

-- ── 3. profiles.last_gallery_checked_at 列削除 ────────────────────────────────
-- アプリコード参照0件（Phase A/Bで確認）。他列・他テーブルへの影響なし。
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS last_gallery_checked_at;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 撤去しないもの（意図的に対象外）:
--   ・actresses.twitter_screen_name 列（管理画面等で公式Xリンク表示に現役使用中）
--   ・sn_news.gallery_urls 等、無関係な「ギャラリー」機能一式
-- ═══════════════════════════════════════════════════════════════════════════════
