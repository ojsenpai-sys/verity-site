-- SEO サジェストキャッシュ
-- Search Console APIレスポンスをSupabaseにキャッシュし、
-- 女優名エンリッチメント・タイトル提案・適用管理を一元化する

create table if not exists seo_suggestions (
  id              uuid         primary key default gen_random_uuid(),
  batch_id        uuid         not null,
  query           text         not null,
  page            text         not null,
  clicks          integer      not null default 0,
  impressions     integer      not null default 0,
  ctr             numeric(8,6) not null default 0,
  position        numeric(6,2) not null default 0,
  actress_name    text,
  actress_id      text,
  suggested_title text,
  alt_titles      text[]       not null default '{}',
  is_treasure     boolean      not null default false,
  opportunity     integer      not null default 0,
  is_applied      boolean      not null default false,
  applied_at      timestamptz,
  fetched_at      timestamptz  not null default now()
);

create index if not exists seo_suggestions_batch_idx    on seo_suggestions(batch_id);
create index if not exists seo_suggestions_treasure_idx on seo_suggestions(is_treasure, opportunity desc)
  where is_treasure = true;
create index if not exists seo_suggestions_actress_idx  on seo_suggestions(actress_id)
  where actress_id is not null;

-- 最新バッチのメタ情報（1行のみ保持するシングルトン）
create table if not exists seo_cache_meta (
  singleton      integer     primary key default 1 check (singleton = 1),
  batch_id       uuid,
  fetched_at     timestamptz,
  row_count      integer,
  treasure_count integer,
  is_real        boolean     not null default false
);
