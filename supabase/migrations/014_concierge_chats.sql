-- あかりコンシェルジュ チャット履歴テーブル
CREATE TABLE IF NOT EXISTS sn_concierge_chats (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('user', 'model')),
  content    text        NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS sn_concierge_chats_user_created_idx
  ON sn_concierge_chats (user_id, created_at DESC);

ALTER TABLE sn_concierge_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own chats"
  ON sn_concierge_chats
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
