-- ══════════════════════════════════════════════════════════════════════════════
-- 048_notification_unsubscribe.sql — 配信停止RPC & bounce/complaint抑止テーブル（Phase 4）
-- ══════════════════════════════════════════════════════════════════════════════
--
-- 背景（会員登録促進 Phase 4 / メール配信基盤の本番化）:
--   ・One-Click unsubscribe（RFC 8058）・メール本文内の人間向けunsubscribeリンクの両方から
--     呼ばれる、notification_type単位の配信停止エンドポイントの実行体。
--   ・呼び出し元（GET/POST /verity/api/notifications/unsubscribe）はログイン不要（メール
--     クライアントが自動POSTするため）。認可はHMAC署名付きtoken（アプリ側で検証済み）が
--     代替するため、本関数自体はSECURITY DEFINERで「narrow scopeな1操作だけ」を許可し、
--     service_roleキーをNext.js側のpublicなAPI routeへ持ち込まずに済む設計にする。
--   ・notification_email_status は将来のResend webhook（bounced/complained）受信結果を
--     保存する最小テーブル。Phase 4時点ではwebhook受信の実装まで行うが、Resend Dashboard側の
--     Webhook URL登録はユーザーの手動操作待ちのため、実際にこのテーブルへ行が入るのは
--     登録後になる。
--
-- 注意: 既存migration（001〜047）は一切変更していない。DROPも行っていない。
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. unsubscribe_notification: notification_type単位の配信停止（SECURITY DEFINER） ──
-- p_notification_type:
--   'actress_new_release' -> favorite_notification_settings.notify_new_work = false
--   'weekly_ranking'       -> favorite_notification_settings.notify_weekly   = false
--   'all'                  -> 両方 false（メール本文の「すべてのメール通知を停止する」リンク用。
--                              Phase 4.1でメールfooter・unsubscribe成功ページの正式UIとして採用）
-- notify_sale / notify_email は対象外（Phase 4.1時点では未使用列の意味を勝手に拡張しない）。
-- 設定行が存在しないユーザーでも INSERT ... ON CONFLICT で安全に false を記録できる。
create or replace function public.unsubscribe_notification(
  p_user_id uuid,
  p_notification_type text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_notification_type not in ('actress_new_release', 'weekly_ranking', 'all') then
    raise exception 'unsubscribe_notification: invalid notification_type %', p_notification_type;
  end if;

  if p_notification_type = 'actress_new_release' or p_notification_type = 'all' then
    insert into public.favorite_notification_settings (user_id, notify_new_work)
    values (p_user_id, false)
    on conflict (user_id) do update set notify_new_work = false;
  end if;

  if p_notification_type = 'weekly_ranking' or p_notification_type = 'all' then
    insert into public.favorite_notification_settings (user_id, notify_weekly)
    values (p_user_id, false)
    on conflict (user_id) do update set notify_weekly = false;
  end if;
end;
$$;

-- ログイン不要のOne-Click unsubscribeから呼ぶため anon にも実行権限を付与する。
-- token検証（HMAC）はNext.js側で完了してから本関数を呼ぶため、p_user_idは
-- 「署名済みtokenから復元された値」のみを渡す前提（呼び出し側APIがゲートを担う）。
revoke all on function public.unsubscribe_notification(uuid, text) from public;
grant execute on function public.unsubscribe_notification(uuid, text) to anon, authenticated;

-- ── 2. notification_email_status: bounce/complaint抑止状態（Resend webhook受信用） ──
create table if not exists public.notification_email_status (
  user_id            uuid        primary key references auth.users(id) on delete cascade,
  status             text        not null default 'active',
  last_bounced_at    timestamptz,
  last_complained_at timestamptz,
  reason             text,
  updated_at         timestamptz not null default now(),

  constraint notification_email_status_status_chk
    check (status in ('active', 'bounced', 'complained', 'suppressed'))
);

create trigger notification_email_status_updated_at
  before update on public.notification_email_status
  for each row execute function extensions.moddatetime(updated_at);

-- RLS: 有効化のみ。一般ユーザーは自分の抑止状態も含め直接操作できない
-- （bounce/complaint状態はResend webhook経由でservice_roleのみが書き込む運用のため）。
alter table public.notification_email_status enable row level security;

grant select, insert, update on public.notification_email_status to service_role;

-- ── 3. find_user_id_by_email: Resend webhook（bounced/complained）が受け取る生の
-- メールアドレスから user_id を解決するための最小RPC。auth.users は PostgREST の
-- 公開スキーマ外（デフォルトで REST 経由アクセス不可）のため、SECURITY DEFINER 関数で
-- 必要な1カラムだけを返す。service_role限定（webhook route以外から呼ばれない）。
create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql security definer set search_path = public, auth stable as $$
  select id from auth.users where email = p_email limit 1;
$$;

revoke all on function public.find_user_id_by_email(text) from public;
grant execute on function public.find_user_id_by_email(text) to service_role;
