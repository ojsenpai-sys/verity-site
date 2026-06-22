-- ══════════════════════════════════════════════════════════════════════════════
-- 033_analytics_v2_audience.sql — Audience の bot 除外（analytics_v2_audience）
-- ══════════════════════════════════════════════════════════════════════════════
-- 【背景】監査で Audience MAU(~11.9k) の約95%が単発(1イベント/滞在0)セッション＝
--   crawler/bot/preview fetcher/scraper 由来と判明。会員は 10.1 ev/session で健全。
--   ※user_events はクライアントJS挿入のため、JSを実行するbot（Googlebot等）のみが
--     行を作る。それらは user_agent を出すので UA 除外が有効。
--
-- 【二段の除外】
--   (1) UserAgent 異常: 既知bot UA を is_bot_ua() で除外（user_agent NULL は通す）。
--       → 既存13kは user_agent 未取得のため UA フィルタは将来データに効く。
--   (2) 1イベント/滞在0: 各窓で events>=2 のセッションのみ人間として計上。
--       → 既存データの主たるクリーナ（単発=滞在0=botの典型シグネチャ）。
--
-- 【analytics_v2_audience】get_audience_counts_v2() が (1)(2) 適用後の
--   DAU/WAU/MAU(distinct session_id・JSTカレンダー) を返す。029 と同じ窓定義。
-- 冪等。
-- ══════════════════════════════════════════════════════════════════════════════

-- ── (A) user_agent 列追加（非破壊・NULL許容） ────────────────────────────────
ALTER TABLE public.user_events ADD COLUMN IF NOT EXISTS user_agent text;

-- ── (B) bot 判定ヘルパ（UA 文字列ベース・大文字小文字無視） ─────────────────
-- 列挙: Googlebot/Bingbot/AhrefsBot/SemrushBot/GPTBot/ClaudeBot/FacebookExternalHit/
--       Slackbot/Discordbot ＋ 一般的な bot/crawler/spider/headless/scraper シグネチャ。
CREATE OR REPLACE FUNCTION public.is_bot_ua(ua text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT ua IS NOT NULL AND ua ~* (
    'bot|crawler|spider|crawl|slurp|'
    || 'googlebot|bingbot|ahrefsbot|semrushbot|gptbot|claudebot|claude-web|anthropic|'
    || 'facebookexternalhit|slackbot|discordbot|twitterbot|telegrambot|whatsapp|'
    || 'headless|phantomjs|puppeteer|playwright|selenium|'
    || 'python-requests|python-httpx|scrapy|go-http-client|curl|wget|libwww|'
    || 'preview|fetch|monitor|uptime|lighthouse|pagespeed'
  );
$$;

-- ── (C) analytics_v2_audience: bot/単発除外後の DAU/WAU/MAU ───────────────────
CREATE OR REPLACE FUNCTION public.get_audience_counts_v2()
RETURNS TABLE(dau int, wau int, mau int)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  WITH b AS (
    SELECT
      ((( now() AT TIME ZONE 'Asia/Tokyo')::date       )::timestamp AT TIME ZONE 'Asia/Tokyo') AS d0,
      (((((now() AT TIME ZONE 'Asia/Tokyo')::date) - 6 ))::timestamp AT TIME ZONE 'Asia/Tokyo') AS d7,
      (((((now() AT TIME ZONE 'Asia/Tokyo')::date) - 29))::timestamp AT TIME ZONE 'Asia/Tokyo') AS d30
  ),
  -- (1) bot UA を除外したイベント（user_agent NULL は人間候補として残す）
  ev AS (
    SELECT session_id, created_at
    FROM public.user_events
    WHERE session_id IS NOT NULL
      AND NOT public.is_bot_ua(user_agent)
  )
  SELECT
    -- (2) 各窓で events>=2（単発=滞在0を除外）のセッションのみ計上
    (SELECT count(*) FROM (SELECT e.session_id FROM ev e, b WHERE e.created_at >= b.d0  GROUP BY e.session_id HAVING count(*) >= 2) s)::int,
    (SELECT count(*) FROM (SELECT e.session_id FROM ev e, b WHERE e.created_at >= b.d7  GROUP BY e.session_id HAVING count(*) >= 2) s)::int,
    (SELECT count(*) FROM (SELECT e.session_id FROM ev e, b WHERE e.created_at >= b.d30 GROUP BY e.session_id HAVING count(*) >= 2) s)::int;
$$;

GRANT EXECUTE ON FUNCTION public.is_bot_ua(text)              TO service_role;
GRANT EXECUTE ON FUNCTION public.get_audience_counts_v2()     TO service_role;
