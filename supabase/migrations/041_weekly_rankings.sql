-- ═══════════════════════════════════════════════════════════════════════════════
-- 041_weekly_rankings.sql — VERITY 週間ランキング基盤
-- ═══════════════════════════════════════════════════════════════════════════════
-- 「毎週日曜23:30発表」の週間ランキング(5種)をスナップショット保存する。
--   1 actress   : 今週最も読まれた女優 (actress_view + 単体作品閲覧の合算)
--   2 work      : 今週最も読まれた作品 (CID variant を作品単位へ統合)
--   3 maker     : 今週の人気メーカー (作品→metadata.maker[0].id 集約)
--   4 newcomer  : 新人女優 (debut_year → デビュー根拠作品 → 初作品日fallback)
--   5 rising    : 急上昇女優 (今週 vs 前週 absolute_growth 主軸 / current>=3)
--
-- 主指標は Human判定済みユニークセッション数。BOT除外は既存 public.is_bot_ua() を再利用。
-- 集計は締切後にバッチが事前計算し、published_at で「発表時刻」を制御する。
--
-- 適用方針: DDLはレビュー承認後に手動適用。本ファイル単体では本番へ反映されない。
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. スナップショットテーブル ──────────────────────────────────────────────
create table if not exists public.weekly_rankings (
  id                       uuid        primary key default gen_random_uuid(),
  week_key                 text        not null,      -- 集計週の月曜(JST)を 'YYYY-MM-DD'
  ranking_type             text        not null,
  rank                     integer     not null,
  entity_type              text        not null,      -- 'actress' | 'work' | 'maker'
  entity_id                text        not null,      -- 女優external_id / 作品グループkey / makerId
  entity_name              text        not null,
  score                    numeric     not null default 0,
  unique_sessions          integer     not null default 0,
  total_views              integer     not null default 0,
  previous_rank            integer,                    -- 前週(直近の確定週)の同ランキング順位
  rank_change              integer,                    -- previous_rank - rank (上昇が正)
  is_new_entry             boolean     not null default true,
  consecutive_weeks_rank1  integer     not null default 0,
  metadata                 jsonb       not null default '{}'::jsonb,
  period_start             timestamptz not null,
  period_end               timestamptz not null,
  published_at             timestamptz not null,
  created_at               timestamptz not null default now(),
  constraint weekly_rankings_type_chk
    check (ranking_type in ('actress','work','maker','newcomer','rising')),
  constraint weekly_rankings_rank_chk   check (rank between 1 and 10),
  constraint weekly_rankings_uq_rank    unique (week_key, ranking_type, rank),
  constraint weekly_rankings_uq_entity  unique (week_key, ranking_type, entity_id)
);

create index if not exists weekly_rankings_lookup_idx
  on public.weekly_rankings (ranking_type, week_key desc, rank);
create index if not exists weekly_rankings_published_idx
  on public.weekly_rankings (published_at desc, week_key desc);

-- ── 2. RLS: anon は published_at 到達済みの行のみ SELECT 可 / 書込は service_role 限定 ──
alter table public.weekly_rankings enable row level security;

drop policy if exists weekly_rankings_public_read on public.weekly_rankings;
create policy weekly_rankings_public_read on public.weekly_rankings
  for select to anon, authenticated
  using (published_at <= now());   -- 23:30 到達までは新週スナップショットを露出しない

-- INSERT/UPDATE/DELETE ポリシーは作らない → anon/authenticated には一切許可されない。
-- service_role は RLS をバイパスするためバッチのみが書き込める。
grant select on public.weekly_rankings to anon, authenticated;
revoke insert, update, delete on public.weekly_rankings from anon, authenticated;

-- ── 3. Human判定(期間境界つき) — 修正1: 開始/終了の閉区間を必須にする ──────────
-- 既存 human_sessions_since(p_since) は開始のみで締切後イベントが混入し得るため、
-- 週間ランキングでは必ず [p_start, p_end) の閉じた窓で判定する。
-- BOT除外ロジックは既存 public.is_bot_ua() を再利用(UA正規表現を複製しない)。
create or replace function public.human_sessions_between(
  p_start timestamptz,
  p_end   timestamptz
) returns table(session_id text)
language sql stable security definer set search_path = public as $$
  select e.session_id
  from public.user_events e
  where e.session_id is not null
    and not public.is_bot_ua(e.user_agent)
    and e.created_at >= p_start
    and e.created_at <  p_end
  group by e.session_id
  having count(*) >= 2;
$$;
revoke all on function public.human_sessions_between(timestamptz, timestamptz) from public;
grant execute on function public.human_sessions_between(timestamptz, timestamptz) to service_role;

-- ── 4. CID variant 統合キー — 修正5: 既存 normalizeCid / cidToProductNumber の規則を合成 ──
-- 変種(DVD/BD/数量限定/FANZA限定/末尾variant)を同一作品グループへ畳む商品識別キー。
--   normalizeCid       : 末尾小文字 variant を除去 (mkmp726v → mkmp726)
--   cidToProductNumber : 英字stem + 数値(先頭0除去)
-- これに先頭のメディア/ディスク接頭辞(1, 9, k9 …)除去を加える。
-- 誤統合防止: 'k' は直後が数字の時のみ接頭辞として除去('kawd'ラベル等を壊さない)。
-- 生成キーは label-number(DMMカタログ上グローバル一意)なので別作品衝突は起きない。
create or replace function public.weekly_cid_group(p_cid text)
returns text language sql immutable set search_path = public as $$
  with s as (
    select regexp_replace(
             regexp_replace(lower(coalesce(p_cid, '')), '^k?[0-9]+', ''),  -- 先頭 disc/media 接頭辞
             '[a-z]+$', ''                                                 -- 末尾 variant 小文字
           ) as base
  ), m as (
    select base, regexp_match(base, '^([a-z]+)([0-9]+)$') as g from s
  )
  select case when g is null then nullif(base, '') else g[1] || '-' || (g[2])::bigint::text end
  from m;
$$;

-- weekly_cid_group を作品ランキングの代表選定で全 articles に対し評価するため関数インデックス。
create index if not exists articles_cid_group_idx
  on public.articles (public.weekly_cid_group(external_id));

-- ── 5. compute_weekly_rankings — 5ランキングを1回で算出(読み取りのみ・書込なし) ──
-- 返り値: 全ランキング行を1つの jsonb 配列で返す。各要素は weekly_rankings の列に対応。
-- previous_rank / rank_change / is_new_entry / consecutive_weeks_rank1 は
-- 直近の確定週スナップショット(week_key < p_week_key の最大)と比較して算出する。
create or replace function public.compute_weekly_rankings(
  p_period_start timestamptz,
  p_period_end   timestamptz,
  p_prev_start   timestamptz,
  p_prev_end     timestamptz,
  p_week_key     text,
  p_newcomer_days integer default 180   -- NEWCOMER_WINDOW_DAYS
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  -- 入力妥当性 & 最大集計期間(修正: SECURITY DEFINER 入力チェック)
  if p_period_end <= p_period_start or p_prev_end <= p_prev_start then
    raise exception 'weekly_rankings: period_end must be after period_start';
  end if;
  if (p_period_end - p_period_start) > interval '8 days'
     or (p_prev_end - p_prev_start) > interval '8 days' then
    raise exception 'weekly_rankings: aggregation window exceeds 8 days';
  end if;
  if p_week_key !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'weekly_rankings: week_key must be YYYY-MM-DD';
  end if;
  if p_newcomer_days < 1 or p_newcomer_days > 3650 then
    raise exception 'weekly_rankings: newcomer_days out of range';
  end if;

  with
  cur_h  as (select session_id from public.human_sessions_between(p_period_start, p_period_end)),
  prev_h as (select session_id from public.human_sessions_between(p_prev_start, p_prev_end)),

  -- 直近の確定週スナップショット
  prior as (
    select ranking_type, entity_id, rank as prev_rank, consecutive_weeks_rank1 as prev_consec
    from public.weekly_rankings
    where week_key = (select max(week_key) from public.weekly_rankings where week_key < p_week_key)
  ),

  -- 単体(1名)作品 → 女優 帰属マップ
  solo as (
    select a.external_id as cid, 'dmm-actress-' || (a.metadata->'actress'->0->>'id') as aext
    from public.articles a
    where a.is_active
      and jsonb_typeof(a.metadata->'actress') = 'array'
      and jsonb_array_length(a.metadata->'actress') = 1
      and (a.metadata->'actress'->0->>'id') is not null
  ),

  -- ===== 女優: actress_view + 単体作品閲覧の合算(今週) =====
  a_attrib as (
    select e.session_id, e.target_id as aext
    from public.user_events e join cur_h h on h.session_id = e.session_id
    where e.created_at >= p_period_start and e.created_at < p_period_end
      and e.event_name = 'actress_view' and e.target_type = 'actress' and e.target_id is not null
    union all
    select e.session_id, s.aext
    from public.user_events e join cur_h h on h.session_id = e.session_id join solo s on s.cid = e.target_id
    where e.created_at >= p_period_start and e.created_at < p_period_end
      and e.target_type = 'article' and e.event_name in ('page_view','video_view')
  ),
  a_agg as (
    select aext as entity_id, count(distinct session_id) as uniq, count(*) as views
    from a_attrib where aext is not null group by aext
  ),
  -- 前週の女優合算(急上昇用)
  a_attrib_prev as (
    select e.session_id, e.target_id as aext
    from public.user_events e join prev_h h on h.session_id = e.session_id
    where e.created_at >= p_prev_start and e.created_at < p_prev_end
      and e.event_name = 'actress_view' and e.target_type = 'actress' and e.target_id is not null
    union all
    select e.session_id, s.aext
    from public.user_events e join prev_h h on h.session_id = e.session_id join solo s on s.cid = e.target_id
    where e.created_at >= p_prev_start and e.created_at < p_prev_end
      and e.target_type = 'article' and e.event_name in ('page_view','video_view')
  ),
  a_agg_prev as (
    select aext as entity_id, count(distinct session_id) as uniq
    from a_attrib_prev where aext is not null group by aext
  ),

  a_top as (
    select ag.entity_id, ag.uniq, ag.views, pr.prev_rank, pr.prev_consec,
      row_number() over (order by ag.uniq desc, ag.views desc, coalesce(pr.prev_rank, 9999) asc, ag.entity_id asc) as rnk
    from a_agg ag left join prior pr on pr.ranking_type = 'actress' and pr.entity_id = ag.entity_id
  ),
  a_rows as (
    select
      'actress' as ranking_type, t.rnk as rank, 'actress' as entity_type, t.entity_id,
      coalesce(ac.name, t.entity_id) as entity_name,
      t.uniq::numeric as score, t.uniq as unique_sessions, t.views as total_views,
      t.prev_rank, t.prev_consec,
      jsonb_strip_nulls(jsonb_build_object(
        'image_url', ac.image_url,
        'ruby', ac.ruby,
        'latest_cid', lw.external_id,
        'latest_slug', lw.slug,
        'latest_title', lw.title
      )) as metadata
    from a_top t
    left join public.actresses ac on ac.external_id = t.entity_id and ac.is_active
    left join lateral (
      select a.external_id, a.slug, a.title
      from public.articles a
      where a.is_active
        and a.metadata->'actress'->0->>'id' = replace(t.entity_id, 'dmm-actress-', '')
      order by (a.metadata->>'floor' = 'videoa') desc, a.published_at desc nulls last
      limit 1
    ) lw on true
    where t.rnk <= 10
  ),

  -- ===== 作品: video_view + page_view / CID variant 統合(今週) =====
  w_ev as (
    select e.session_id, public.weekly_cid_group(e.target_id) as gkey
    from public.user_events e join cur_h h on h.session_id = e.session_id
    join public.articles art on art.external_id = e.target_id and art.is_active
    where e.created_at >= p_period_start and e.created_at < p_period_end
      and e.target_type = 'article' and e.event_name in ('page_view','video_view')
  ),
  w_agg as (
    select gkey as entity_id, count(distinct session_id) as uniq, count(*) as views
    from w_ev where gkey is not null group by gkey
  ),
  w_top as (
    select ag.entity_id, ag.uniq, ag.views, pr.prev_rank, pr.prev_consec,
      row_number() over (order by ag.uniq desc, ag.views desc, coalesce(pr.prev_rank, 9999) asc, ag.entity_id asc) as rnk
    from w_agg ag left join prior pr on pr.ranking_type = 'work' and pr.entity_id = ag.entity_id
  ),
  w_rows as (
    select
      'work' as ranking_type, t.rnk as rank, 'work' as entity_type, t.entity_id,
      coalesce(r.title, t.entity_id) as entity_name,
      t.uniq::numeric as score, t.uniq as unique_sessions, t.views as total_views,
      t.prev_rank, t.prev_consec,
      jsonb_strip_nulls(jsonb_build_object(
        'representative_cid', r.external_id,
        'floor', r.metadata->>'floor',
        'slug', r.slug,
        'image_url', r.image_url,
        'actress_name', (
          select string_agg(x->>'name', '・')
          from jsonb_array_elements(coalesce(r.metadata->'actress', '[]'::jsonb)) x
        ),
        'maker_id', r.metadata->'maker'->0->>'id',
        'maker_name', r.metadata->'maker'->0->>'name',
        'fanza_url', coalesce(r.metadata->>'affiliate_url', r.metadata->>'url')
      )) as metadata
    from w_top t
    left join lateral (
      -- 代表作品: videoa優先 → sample_movie有 → 新しい → 安定CID順(修正5)
      select a.external_id, a.title, a.slug, a.image_url, a.metadata
      from public.articles a
      where a.is_active and public.weekly_cid_group(a.external_id) = t.entity_id
      order by (a.metadata->>'floor' = 'videoa') desc,
               (a.metadata->>'sample_movie_url' is not null) desc,
               a.published_at desc nulls last,
               a.external_id asc
      limit 1
    ) r on true
    where t.rnk <= 10
  ),

  -- ===== メーカー: 作品閲覧を metadata.maker[0].id へ集約(今週) =====
  m_ev as (
    select e.session_id, (art.metadata->'maker'->0->>'id') as mid, (art.metadata->'maker'->0->>'name') as mname
    from public.user_events e join cur_h h on h.session_id = e.session_id
    join public.articles art on art.external_id = e.target_id and art.is_active
    where e.created_at >= p_period_start and e.created_at < p_period_end
      and e.target_type = 'article' and e.event_name in ('page_view','video_view')
  ),
  m_agg as (
    select mid as entity_id, max(mname) as mname,
      count(distinct session_id) as uniq, count(*) as views, count(distinct mname) as _c
    from m_ev where mid is not null group by mid
  ),
  m_top as (
    select ag.entity_id, ag.mname, ag.uniq, ag.views, pr.prev_rank, pr.prev_consec,
      row_number() over (order by ag.uniq desc, ag.views desc, coalesce(pr.prev_rank, 9999) asc, ag.entity_id asc) as rnk
    from m_agg ag left join prior pr on pr.ranking_type = 'maker' and pr.entity_id = ag.entity_id
  ),
  m_rows as (
    select
      'maker' as ranking_type, t.rnk as rank, 'maker' as entity_type, t.entity_id,
      coalesce(t.mname, t.entity_id) as entity_name,
      t.uniq::numeric as score, t.uniq as unique_sessions, t.views as total_views,
      t.prev_rank, t.prev_consec,
      jsonb_strip_nulls(jsonb_build_object(
        'maker_id', t.entity_id,
        'rep_cid', rep.external_id,
        'rep_title', rep.title,
        'rep_slug', rep.slug,
        'rep_image_url', rep.image_url
      )) as metadata
    from m_top t
    left join lateral (
      -- 代表的に読まれた作品: そのメーカーで今週 human閲覧が最多の作品
      select art.external_id, art.title, art.slug, art.image_url, count(distinct e.session_id) as u
      from public.user_events e join cur_h h on h.session_id = e.session_id
      join public.articles art on art.external_id = e.target_id and art.is_active
      where e.created_at >= p_period_start and e.created_at < p_period_end
        and e.target_type = 'article' and e.event_name in ('page_view','video_view')
        and art.metadata->'maker'->0->>'id' = t.entity_id
      group by art.external_id, art.title, art.slug, art.image_url
      order by u desc, art.published_at desc nulls last, art.external_id asc
      limit 1
    ) rep on true
    where t.rnk <= 10
  ),

  -- ===== 新人: debut_year → デビュー根拠作品 → 初作品日fallback(修正2) =====
  firstwork as (
    select 'dmm-actress-' || (act->>'id') as ext, min(a.published_at) as fp
    from public.articles a, lateral jsonb_array_elements(coalesce(a.metadata->'actress', '[]'::jsonb)) act
    where a.is_active and a.published_at is not null and (act->>'id') is not null
    group by 1
  ),
  debut_tag as (
    select 'dmm-actress-' || (act->>'id') as ext, min(a.external_id) as evidence_cid
    from public.articles a, lateral jsonb_array_elements(coalesce(a.metadata->'actress', '[]'::jsonb)) act
    where a.is_active
      and a.published_at >= (now() - make_interval(days => p_newcomer_days))
      and (act->>'id') is not null
      and exists (select 1 from unnest(a.tags) tg where tg like '%デビュー%')
    group by 1
  ),
  newcomer as (
    select ac.external_id as ext, ac.name, ac.image_url,
      nullif(ac.metadata->>'debut_year','') as dy, fw.fp, dt.evidence_cid,
      case
        when (ac.metadata->>'debut_year') ~ '^[0-9]{4}$'
             and (ac.metadata->>'debut_year')::int in (extract(year from now())::int, extract(year from now())::int - 1)
          then 'debut_year'
        when dt.evidence_cid is not null then 'debut_work'
        when fw.fp >= (now() - make_interval(days => p_newcomer_days)) then 'first_work_fallback'
        else null
      end as basis
    from public.actresses ac
    left join firstwork fw on fw.ext = ac.external_id
    left join debut_tag dt on dt.ext = ac.external_id
    where ac.is_active
  ),
  n_top as (
    select n.ext as entity_id, n.name, n.image_url, n.dy, n.fp, n.evidence_cid, n.basis,
      ag.uniq, ag.views, pr.prev_rank, pr.prev_consec,
      row_number() over (order by ag.uniq desc, ag.views desc, coalesce(pr.prev_rank, 9999) asc, n.ext asc) as rnk
    from newcomer n
    join a_agg ag on ag.entity_id = n.ext         -- 今週エンゲージメント必須
    left join prior pr on pr.ranking_type = 'newcomer' and pr.entity_id = n.ext
    where n.basis is not null and ag.uniq >= 1
  ),
  n_rows as (
    select
      'newcomer' as ranking_type, t.rnk as rank, 'actress' as entity_type, t.entity_id,
      coalesce(t.name, t.entity_id) as entity_name,
      t.uniq::numeric as score, t.uniq as unique_sessions, t.views as total_views,
      t.prev_rank, t.prev_consec,
      jsonb_strip_nulls(jsonb_build_object(
        'image_url', t.image_url,
        'newcomer_basis', t.basis,
        'debut_year', t.dy,
        'first_work_date', to_char(t.fp, 'YYYY-MM-DD'),
        'debut_evidence_cid', t.evidence_cid,
        'latest_cid', lw.external_id,
        'latest_slug', lw.slug,
        'latest_title', lw.title
      )) as metadata
    from n_top t
    left join lateral (
      select a.external_id, a.slug, a.title
      from public.articles a
      where a.is_active and a.metadata->'actress'->0->>'id' = replace(t.entity_id, 'dmm-actress-', '')
      order by (a.metadata->>'floor' = 'videoa') desc, a.published_at desc nulls last
      limit 1
    ) lw on true
    where t.rnk <= 10
  ),

  -- ===== 急上昇: 今週 vs 前週 absolute_growth 主軸 / current>=3(修正) =====
  r_calc as (
    select ag.entity_id, ag.uniq as cur, coalesce(pg.uniq, 0) as prev,
      ag.uniq - coalesce(pg.uniq, 0) as growth
    from a_agg ag left join a_agg_prev pg on pg.entity_id = ag.entity_id
    where ag.uniq >= 3
  ),
  r_top as (
    select rc.*, (rc.prev = 0) as is_new_vs_prev, pr.prev_rank, pr.prev_consec,
      row_number() over (order by rc.growth desc, rc.cur desc, coalesce(pr.prev_rank, 9999) asc, rc.entity_id asc) as rnk
    from r_calc rc left join prior pr on pr.ranking_type = 'rising' and pr.entity_id = rc.entity_id
    where rc.growth > 0
  ),
  r_rows as (
    select
      'rising' as ranking_type, t.rnk as rank, 'actress' as entity_type, t.entity_id,
      coalesce(ac.name, t.entity_id) as entity_name,
      t.growth::numeric as score, t.cur as unique_sessions, t.cur as total_views,
      t.prev_rank, t.prev_consec,
      jsonb_strip_nulls(jsonb_build_object(
        'image_url', ac.image_url,
        'current_sessions', t.cur,
        'previous_sessions', t.prev,
        'absolute_growth', t.growth,
        'growth_rate', case when t.prev = 0 then null else round(t.cur::numeric / t.prev, 2) end,
        'is_new_vs_prev', t.is_new_vs_prev,
        'latest_cid', lw.external_id,
        'latest_slug', lw.slug
      )) as metadata
    from r_top t
    left join public.actresses ac on ac.external_id = t.entity_id and ac.is_active
    left join lateral (
      select a.external_id, a.slug
      from public.articles a
      where a.is_active and a.metadata->'actress'->0->>'id' = replace(t.entity_id, 'dmm-actress-', '')
      order by (a.metadata->>'floor' = 'videoa') desc, a.published_at desc nulls last
      limit 1
    ) lw on true
    where t.rnk <= 10
  ),

  all_rows as (
    select * from a_rows union all select * from w_rows union all
    select * from m_rows union all select * from n_rows union all select * from r_rows
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'week_key', p_week_key,
    'ranking_type', ranking_type,
    'rank', rank,
    'entity_type', entity_type,
    'entity_id', entity_id,
    'entity_name', entity_name,
    'score', score,
    'unique_sessions', unique_sessions,
    'total_views', total_views,
    'previous_rank', prev_rank,
    'rank_change', case when prev_rank is null then null else prev_rank - rank end,
    'is_new_entry', (prev_rank is null),
    'consecutive_weeks_rank1',
      case when rank = 1 and prev_rank = 1 then coalesce(prev_consec, 0) + 1
           when rank = 1 then 1 else 0 end,
    'metadata', metadata,
    'period_start', p_period_start,
    'period_end', p_period_end
  ) order by ranking_type, rank), '[]'::jsonb)
  into v_result
  from all_rows;

  return v_result;
end;
$$;
revoke all on function public.compute_weekly_rankings(timestamptz,timestamptz,timestamptz,timestamptz,text,integer) from public;
grant execute on function public.compute_weekly_rankings(timestamptz,timestamptz,timestamptz,timestamptz,text,integer) to service_role;

-- ── 6. apply_weekly_rankings — 修正3: 5種を1トランザクションで検証→全置換(all-or-nothing) ──
-- 妥当性NGなら RAISE で全rollback → 旧ランキングを保持。不完全TOP10を公開しない。
create or replace function public.apply_weekly_rankings(
  p_period_start  timestamptz,
  p_period_end    timestamptz,
  p_prev_start    timestamptz,
  p_prev_end      timestamptz,
  p_published_at  timestamptz,
  p_week_key      text,
  p_newcomer_days integer default 180
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rows      jsonb;
  v_type      text;
  v_cnt       integer;
  v_maxrank   integer;
  v_types     text[] := array['actress','work','maker','newcomer','rising'];
  v_inserted  integer;
begin
  -- 1) 算出(compute内で入力妥当性も検証)
  v_rows := public.compute_weekly_rankings(
              p_period_start, p_period_end, p_prev_start, p_prev_end, p_week_key, p_newcomer_days);

  -- 2) 最低限の妥当性検証(修正3)
  foreach v_type in array v_types loop
    select count(*), coalesce(max((x->>'rank')::int), 0)
      into v_cnt, v_maxrank
      from jsonb_array_elements(v_rows) x
      where x->>'ranking_type' = v_type;

    if v_cnt < 1 then
      raise exception 'weekly_rankings: ranking_type % has 0 rows — abort (keep previous week)', v_type;
    end if;
    -- rank が 1..N の連番であること(rank重複が無ければ max=count で連番)
    if v_maxrank <> v_cnt then
      raise exception 'weekly_rankings: ranking_type % ranks not contiguous (count=% max=%)', v_type, v_cnt, v_maxrank;
    end if;
    -- entity_id 重複が無いこと
    if (select count(*) from (
          select x->>'entity_id' eid from jsonb_array_elements(v_rows) x
          where x->>'ranking_type' = v_type group by 1 having count(*) > 1
        ) d) > 0 then
      raise exception 'weekly_rankings: ranking_type % has duplicate entity_id', v_type;
    end if;
  end loop;

  -- 3) 対象週を原子的に置換(検証後に delete → 失敗時は全rollbackで旧行維持)
  delete from public.weekly_rankings where week_key = p_week_key;

  insert into public.weekly_rankings (
    week_key, ranking_type, rank, entity_type, entity_id, entity_name,
    score, unique_sessions, total_views, previous_rank, rank_change,
    is_new_entry, consecutive_weeks_rank1, metadata, period_start, period_end, published_at
  )
  select
    r.week_key, r.ranking_type, r.rank, r.entity_type, r.entity_id, r.entity_name,
    r.score, r.unique_sessions, r.total_views, r.previous_rank, r.rank_change,
    r.is_new_entry, r.consecutive_weeks_rank1, r.metadata, r.period_start, r.period_end, p_published_at
  from jsonb_to_recordset(v_rows) as r(
    week_key text, ranking_type text, rank integer, entity_type text, entity_id text, entity_name text,
    score numeric, unique_sessions integer, total_views integer, previous_rank integer, rank_change integer,
    is_new_entry boolean, consecutive_weeks_rank1 integer, metadata jsonb, period_start timestamptz, period_end timestamptz
  );
  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'week_key', p_week_key,
    'inserted', v_inserted,
    'published_at', p_published_at,
    'types', to_jsonb(v_types)
  );
end;
$$;
revoke all on function public.apply_weekly_rankings(timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,text,integer) from public;
grant execute on function public.apply_weekly_rankings(timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,text,integer) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 適用後の想定運用:
--   バッチ(scripts/generate-weekly-rankings.mjs)が service_role で
--   apply_weekly_rankings(...) を1回呼ぶだけで5ランキングが確定・置換される。
--   フロントは weekly_rankings を anon で SELECT(published_at<=now() のみ可視)。
-- ═══════════════════════════════════════════════════════════════════════════════
