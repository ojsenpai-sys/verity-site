-- ═══════════════════════════════════════════════════════════════════════════════
-- 043_weekly_rankings_maker_rep_groupby_fix.sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- 041 の compute_weekly_rankings 内、メーカー代表作品を選ぶ lateral サブクエリで
-- ORDER BY art.published_at を使っているのに GROUP BY に含めておらず、
--   ERROR 42803: column "art.published_at" must appear in the GROUP BY clause
-- でメーカーに閲覧が付いた瞬間に compute 全体が失敗していた。
-- external_id は一意なので published_at を GROUP BY へ足してもグループ数は不変。
-- 方針: 適用済みの 041 は本番と一致させるため書き換えず、修正は本 043 の
-- CREATE OR REPLACE のみに集約する(041→042→043 の履歴で本番を再現)。
-- 空DBでも 041(compute作成)→042(実行権限ロックダウン)→043(compute置換) の順で
-- 最終的に修正版 compute になる。CREATE OR REPLACE は既存ACLを保持するため 042 の
-- ロックダウンは維持されるが、冪等性のため末尾で revoke/grant を再掲する。
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.compute_weekly_rankings(
  p_period_start timestamptz,
  p_period_end   timestamptz,
  p_prev_start   timestamptz,
  p_prev_end     timestamptz,
  p_week_key     text,
  p_newcomer_days integer default 180
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_result jsonb;
begin
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

  prior as (
    select ranking_type, entity_id, rank as prev_rank, consecutive_weeks_rank1 as prev_consec
    from public.weekly_rankings
    where week_key = (select max(week_key) from public.weekly_rankings where week_key < p_week_key)
  ),

  solo as (
    select a.external_id as cid, 'dmm-actress-' || (a.metadata->'actress'->0->>'id') as aext
    from public.articles a
    where a.is_active
      and jsonb_typeof(a.metadata->'actress') = 'array'
      and jsonb_array_length(a.metadata->'actress') = 1
      and (a.metadata->'actress'->0->>'id') is not null
  ),

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
      group by art.external_id, art.title, art.slug, art.image_url, art.published_at
      order by u desc, art.published_at desc nulls last, art.external_id asc
      limit 1
    ) rep on true
    where t.rnk <= 10
  ),

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
    join a_agg ag on ag.entity_id = n.ext
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

-- 冪等: 実行権限を service_role 限定に締め直す(042 と同一)
revoke all on function public.compute_weekly_rankings(timestamptz,timestamptz,timestamptz,timestamptz,text,integer) from public, anon, authenticated;
grant execute on function public.compute_weekly_rankings(timestamptz,timestamptz,timestamptz,timestamptz,text,integer) to service_role;
