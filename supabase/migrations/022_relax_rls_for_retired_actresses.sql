-- ============================================================
-- 引退女優・非アクティブ記事のパブリック読み取り制限を解除
--
-- 背景：
--   "Public can read active actresses/articles" ポリシーが
--   is_active = true を DB レベルで強制しており、
--   三上悠亜など is_active=false の引退女優が anon キーで
--   一切取得できない状態だった。
--
-- 安全ネット：
--   トップページ・マルキー・ランキング等の主要コンポーネントは
--   アプリコード側で .eq('is_active', true) を明示的に指定済みのため、
--   RLS 緩和後も引退女優が誤表示されることはない。
-- ============================================================

-- actresses テーブル: 全レコードのパブリック読み取りを許可
DROP POLICY IF EXISTS "Public can read active actresses" ON actresses;
CREATE POLICY "Public can read all actresses"
  ON actresses FOR SELECT TO public USING (true);

-- articles テーブル: 全レコードのパブリック読み取りを許可
-- アプリ側の .eq('is_active', true) フィルターが引き続き有効
DROP POLICY IF EXISTS "Public can read active articles" ON articles;
CREATE POLICY "Public can read all articles"
  ON articles FOR SELECT TO public USING (true);
