-- ══════════════════════════════════════════════════════════════════════════════
-- 047_notification_job_state.sql — 通知バッチ ウォーターマーク保存（最小テーブル）
-- ══════════════════════════════════════════════════════════════════════════════
--
-- 背景（会員登録促進 Phase 2 / お気に入り女優 新作通知エンジン）:
--   · 「前回成功時刻（または最後に処理した articles.fetched_at の上限）」を
--     ジョブ単位で1行だけ保持する、通知バッチ専用の状態テーブル。
--   · notification_deliveries（配信履歴・監査ログ）から逆算する方式は不採用。
--     理由: その日の対象ユーザーが0人（＝配信レコードが1件も作られない）でも
--     ウォーターマークは前進できる必要があるが、配信履歴に依存すると
--     「0件の日は前進しない」＝翌日以降も同じarticles範囲を再スキャンし続ける
--     設計になってしまう。ジョブの実行状態と配信の監査ログは別の関心事のため、
--     このための最小テーブルを新設する（notification_deliveriesへ列を足して
--     兼用する案より責務が明確なため採用）。
--   · スクリプト側の状態ファイル（VPSローカル）案は、デプロイ方式次第で消失し得る
--     こと・DB経由でないと監査できないことから不採用。
--
-- 運用:
--   · job_name='actress_new_release' の1行のみを想定（将来 weekly_ranking 等を
--     追加する場合はjob_nameを増やすだけで良い設計）。
--   · Phase 2時点では書き込み経路は実装するが、実際に呼ばれるのは
--     「test-userに限定しない・dry-runでもない」完全バッチ実行のみであり、
--     Phase 2のCLIは --send に --test-user を必須化しているため、
--     本テーブルへの書き込みは本フェーズでは発生しない（読み取りのみ）。
--
-- 注意: 既存migration（001〜046）は一切変更していない。DROPも行っていない。
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notification_job_state (
  job_name    text        PRIMARY KEY,
  watermark   timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: 有効化のみ、authenticated/anon 向けポリシーは作らない（notification_deliveriesと同方針）。
ALTER TABLE public.notification_job_state ENABLE ROW LEVEL SECURITY;

-- service_role（通知バッチ）のみが読み書きできる。
GRANT SELECT, INSERT, UPDATE ON public.notification_job_state TO service_role;
