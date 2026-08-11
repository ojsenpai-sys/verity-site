-- ══════════════════════════════════════════════════════════════════════════════
-- 046_notification_deliveries.sql — 通知配信履歴（冪等性・二重送信防止の正）
-- ══════════════════════════════════════════════════════════════════════════════
--
-- 背景（会員登録促進 Phase N-1 / Phase A設計調査より）:
--   · お気に入り女優の新作メール通知・週間ランキング更新メール通知の送信履歴を記録する。
--   · notification_type ごとに group_key を定義し、UNIQUE制約だけで
--     「同一ユーザー・同一種別・同一グループへの二重送信」を構造的に防止する。
--       - actress_new_release : group_key = JST日付 (YYYY-MM-DD) → ユーザー×日で1通に集約
--       - weekly_ranking       : group_key = week_key（weekly_rankingsと同じ値）→ ユーザー×週で1通
--   · cronの再実行時も同じgroup_keyでINSERTが衝突するため、送信ロジック側は
--     「INSERT成功＝まだ誰にも送っていない」を排他制御として利用できる。
--   · statusが'failed'の行は次回バッチが拾って再送できる（retry設計）。
--
-- 注意（Phase 1時点）:
--   · 本migrationはテーブル定義のみ。アプリ／バッチからのINSERT/UPDATE処理は
--     Phase 2以降で実装する（本メール送信・通知バッチは今回のスコープ外）。
--   · 既存migration（001〜044）は一切変更していない。DROPも行っていない。
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id                 bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type  text        NOT NULL,   -- 'actress_new_release' | 'weekly_ranking'（将来拡張可）
  group_key          text        NOT NULL,   -- 冪等キー（上記コメント参照）
  entity_type        text,                    -- 'article' | 'weekly_ranking_week' 等
  payload            jsonb,                   -- 同梱した作品/女優/週の一覧（監査用）
  status             text        NOT NULL DEFAULT 'pending',
  error              text,
  sent_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notification_deliveries_status_check
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),

  UNIQUE (user_id, notification_type, group_key)
);

CREATE INDEX IF NOT EXISTS notification_deliveries_type_created_idx
  ON public.notification_deliveries (notification_type, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_deliveries_user_type_idx
  ON public.notification_deliveries (user_id, notification_type);

-- RLS: 有効化のみ行い、authenticated/anon 向けポリシーは作らない。
-- マイページに通知履歴一覧をまだ提供しないため、一般ユーザーは自分の履歴も含め
-- 一切アクセスできない設計を優先する（将来、履歴表示UIを作る際に
-- 「本人の行のみSELECT可」ポリシーをadditive migrationで追加する）。
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

-- service_role（通知ジョブ）のみが読み書きできる。Phase 2以降のバッチ実装で使用。
GRANT SELECT, INSERT, UPDATE ON public.notification_deliveries TO service_role;
