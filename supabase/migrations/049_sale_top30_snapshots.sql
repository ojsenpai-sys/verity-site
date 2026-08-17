-- ═══════════════════════════════════════════════════════════════════════════════
-- 049_sale_top30_snapshots.sql — VERITY SALE TOP30 スナップショット基盤 (DRAFT — 未適用)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Phase B 設計案。041_weekly_rankings.sql の「compute → validate → atomic replace」
-- 思想をそのまま踏襲する。DVD除外/videoa限定は取得元(scripts/sync-sale-top30.mjs)側の
-- floor=videoa 固定で担保するため、本テーブルにfloor列は持たない。
--
-- 適用方針: DDLはレビュー承認後に手動適用。本ファイル単体では本番へ反映されない。
-- Phase B時点ではDRAFTであり、Phase C実装完了までは適用しない。
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. スナップショットテーブル ──────────────────────────────────────────────
-- 「現在のTOP30だけ保持」方式（履歴無制限増加を避ける）。
-- snapshot_key で用途を区別（現状は 'fanza_sale_top30' の1本のみ想定）。
-- 更新は「同一 snapshot_key の全行を検証後に原子的に置換」で行う。履歴が必要になった場合は
-- captured_at をキーに含めた別テーブル(sale_top30_history等)を後日追加すればよく、
-- 本テーブルの構造変更は不要。
create table if not exists public.sale_top30_snapshots (
  id                uuid        primary key default gen_random_uuid(),
  snapshot_key      text        not null default 'fanza_sale_top30',
  rank              integer     not null,
  external_id       text        not null,        -- CID
  score             numeric     not null,
  discount_pct      integer,
  price             integer,
  list_price        integer,
  campaign_title    text,
  campaign_ends_at  timestamptz,
  metadata          jsonb       not null default '{}'::jsonb,  -- title/actress/maker等のキャッシュ(表示用フォールバック)
  captured_at       timestamptz not null default now(),
  constraint sale_top30_rank_chk   check (rank between 1 and 30),
  constraint sale_top30_uq_rank    unique (snapshot_key, rank),
  constraint sale_top30_uq_entity  unique (snapshot_key, external_id)
);

create index if not exists sale_top30_lookup_idx
  on public.sale_top30_snapshots (snapshot_key, rank);

-- ── 2. RLS: 匿名/認証ユーザーは読み取りのみ。書込は service_role 限定 ──────────
alter table public.sale_top30_snapshots enable row level security;

drop policy if exists sale_top30_public_read on public.sale_top30_snapshots;
create policy sale_top30_public_read on public.sale_top30_snapshots
  for select to anon, authenticated
  using (true);

grant select on public.sale_top30_snapshots to anon, authenticated;
revoke insert, update, delete on public.sale_top30_snapshots from anon, authenticated;

-- ── 3. apply_sale_top30_snapshot — 検証→全置換(all-or-nothing) ────────────────
-- weekly_rankings の apply_weekly_rankings(041) と同じ「バッチが算出したjsonbを渡し、
-- DB側で最終防衛ラインの検証をしてから原子的に置換する」設計。
-- 呼び出し側(sync-sale-top30.mjs)は算出のみ行い、DB書き込みロジックはここに集約する。
create or replace function public.apply_sale_top30_snapshot(
  p_snapshot_key text,
  p_rows         jsonb   -- [{rank, external_id, score, discount_pct, price, list_price, campaign_title, campaign_ends_at, metadata}, ...]
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cnt      integer;
  v_maxrank  integer;
  v_minrank  integer;
  v_inserted integer;
begin
  select count(*), coalesce(max((x->>'rank')::int), 0), coalesce(min((x->>'rank')::int), 0)
    into v_cnt, v_maxrank, v_minrank
    from jsonb_array_elements(p_rows) x;

  -- fail-closed: 1〜30位が完全に揃っていなければ拒否（旧snapshotを保持）
  if v_cnt <> 30 then
    raise exception 'sale_top30: expected exactly 30 rows, got % — abort (keep previous snapshot)', v_cnt;
  end if;
  if v_minrank <> 1 or v_maxrank <> 30 then
    raise exception 'sale_top30: rank range must be 1..30 (got %..%) — abort', v_minrank, v_maxrank;
  end if;
  -- rank重複が無いこと（1..30の連番であること）
  if (select count(distinct (x->>'rank')::int) from jsonb_array_elements(p_rows) x) <> 30 then
    raise exception 'sale_top30: duplicate rank detected — abort';
  end if;
  -- external_id重複が無いこと
  if (select count(distinct x->>'external_id') from jsonb_array_elements(p_rows) x) <> 30 then
    raise exception 'sale_top30: duplicate external_id detected — abort';
  end if;
  -- external_id / score が null でないこと
  if exists (select 1 from jsonb_array_elements(p_rows) x where x->>'external_id' is null or x->>'score' is null) then
    raise exception 'sale_top30: null external_id or score detected — abort';
  end if;

  -- 検証OK → 対象snapshot_keyを原子的に置換(delete→insertを1トランザクション内で実行)
  delete from public.sale_top30_snapshots where snapshot_key = p_snapshot_key;

  insert into public.sale_top30_snapshots (
    snapshot_key, rank, external_id, score, discount_pct, price, list_price,
    campaign_title, campaign_ends_at, metadata, captured_at
  )
  select
    p_snapshot_key, (r->>'rank')::int, r->>'external_id', (r->>'score')::numeric,
    nullif(r->>'discount_pct','')::int, nullif(r->>'price','')::int, nullif(r->>'list_price','')::int,
    r->>'campaign_title', nullif(r->>'campaign_ends_at','')::timestamptz,
    coalesce(r->'metadata', '{}'::jsonb), now()
  from jsonb_array_elements(p_rows) r;
  get diagnostics v_inserted = row_count;

  return jsonb_build_object('snapshot_key', p_snapshot_key, 'inserted', v_inserted, 'captured_at', now());
end;
$$;
revoke all on function public.apply_sale_top30_snapshot(text, jsonb) from public;
grant execute on function public.apply_sale_top30_snapshot(text, jsonb) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 想定運用(Phase C): scripts/sync-sale-top30.mjs が service_role で算出後、
-- 1回の apply_sale_top30_snapshot(...) 呼び出しで30行を検証・全置換する。
-- 失敗時は例外がそのままトランザクションをrollbackし、旧30行が保持される
-- (「空配列で上書きされない」「15件だけ更新される状態がない」の両方を満たす)。
-- ═══════════════════════════════════════════════════════════════════════════════
