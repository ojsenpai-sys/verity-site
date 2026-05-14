-- sn_news テーブルに不足カラムとインデックスを追加（2026-05-11）
-- sn_news は既存テーブル。summary / tags / updated_at を追加し
-- パフォーマンスインデックスと RLS ポリシーを設定する。

ALTER TABLE sn_news
  ADD COLUMN IF NOT EXISTS summary    text,
  ADD COLUMN IF NOT EXISTS tags       text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_sn_news_published_at ON sn_news(published_at DESC)
  WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_sn_news_slug ON sn_news(slug);
CREATE INDEX IF NOT EXISTS idx_sn_news_actress_id ON sn_news(actress_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sn_news' AND policyname = 'sn_news_public_read'
  ) THEN
    CREATE POLICY sn_news_public_read ON sn_news
      FOR SELECT USING (is_published = true);
  END IF;
END $$;
