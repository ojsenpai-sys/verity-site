import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { withFetchTimeout, SUPABASE_FETCH_TIMEOUT_MS } from '@/lib/supabase/timeout'
import { fetchAllPages, jstMonthBoundsUtc, monthCacheTier } from '@/lib/sitemapCore.mjs'

// Sitemap 用データ取得（Sitemap Reliability Phase 1A–1C）。
//
// - 公開データの読み取りのみ（anon key・cookie 非依存）。unstable_cache 内で使うため
//   cookies() に依存する '@/lib/supabase/server' は使わない（worksRanking.ts と同方式）。
// - PostgREST の 1 リクエスト上限（1000 行）を超えるため、決定的順序＋一意 tie-breaker で
//   .range() ページングし全件取得する（sitemapCore.fetchAllPages）。
// - キャッシュには sitemap 生成に必要な最小列だけを置く（1 エントリ 2MB 上限対策）。
//   作品は発売月単位（最大月 ≈2,731 行）・女優/ニュースは全件でも数百 KB。
// - 取得失敗は throw する。unstable_cache は例外を投げた呼び出しをキャッシュしないため、
//   失敗結果（空・部分結果）を長時間キャッシュする事故を防げる。route 側で 503 に変換する。

let _client: SupabaseClient | null = null
function getStatelessClient(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  const timedFetch = withFetchTimeout(fetch, SUPABASE_FETCH_TIMEOUT_MS)
  _client = createSupabaseClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: (input, init = {}) => timedFetch(input, { ...init, cache: 'no-store' }) },
  })
  return _client
}

/** キャッシュ用の最小行: s = slug / external_id、m = lastmod 元の日時（無い場合は省略）。 */
export type SitemapRow = { s: string; m?: string }

// TTL（秒）。シンプルな 3 段階のみ。
const TTL_RECENT_MONTH = 3 * 3600      // 当月・前月の作品
const TTL_ARCHIVE_MONTH = 7 * 24 * 3600 // それ以前の作品（発売月は不変・追加は稀）
const TTL_ACTRESSES = 24 * 3600
const TTL_NEWS = 3600

// ── 作品（発売月 JST） ─────────────────────────────────────────────────────────
// 既存 sitemap と同一の掲載条件: is_active ・ published_at <= now ・ slug !~ mock
// （slug は NOT NULL を Phase 0 で確認済みだが、念のため not null も条件に含める）。
// 順序: published_at DESC, id ASC（id = UUID・一意 tie-breaker）。

async function fetchArticleMonthRaw(month: string): Promise<SitemapRow[]> {
  const supabase = getStatelessClient()
  const { fromIso, toIso } = jstMonthBoundsUtc(month)
  const nowIso = new Date().toISOString()
  const rows = await fetchAllPages(
    (from: number, to: number) =>
      supabase
        .from('articles')
        .select('id, slug, fetched_at, published_at')
        .eq('is_active', true)
        .not('slug', 'is', null)
        .not('slug', 'like', '%mock%')
        .gte('published_at', fromIso)
        .lt('published_at', toIso)
        .lte('published_at', nowIso)
        .order('published_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    { keyOf: (r: { id: string }) => r.id },
  ) as { slug: string; fetched_at: string | null; published_at: string | null }[]
  // lastmod は現状互換で fetched_at（無ければ published_at）。※ コンテンツ更新日としての
  // 厳密な正しさは未検証（Phase 2 backlog）。
  return rows.map((r) => ({ s: r.slug, m: r.fetched_at ?? r.published_at ?? undefined }))
}

const getRecentMonthCached = unstable_cache(fetchArticleMonthRaw, ['sitemap-articles-month-recent'], {
  revalidate: TTL_RECENT_MONTH,
})
const getArchiveMonthCached = unstable_cache(fetchArticleMonthRaw, ['sitemap-articles-month-archive'], {
  revalidate: TTL_ARCHIVE_MONTH,
})

export function getArticleMonthRows(month: string, nowMs = Date.now()): Promise<SitemapRow[]> {
  return monthCacheTier(month, nowMs) === 'recent' ? getRecentMonthCached(month) : getArchiveMonthCached(month)
}

// ── 女優 ──────────────────────────────────────────────────────────────────────
// 既存 sitemap と同一の掲載条件: is_active ・ external_id !~ mock。
// 順序: id ASC（UUID・一意）。lastmod に使える信頼できる日時列が無いため lastmod は出さない。

async function fetchActressesRaw(): Promise<SitemapRow[]> {
  const supabase = getStatelessClient()
  const rows = await fetchAllPages(
    (from: number, to: number) =>
      supabase
        .from('actresses')
        .select('id, external_id')
        .eq('is_active', true)
        .not('external_id', 'like', '%mock%')
        .order('id', { ascending: true })
        .range(from, to),
    { keyOf: (r: { id: string }) => r.id },
  ) as { external_id: string | null }[]
  return rows.filter((r) => !!r.external_id).map((r) => ({ s: r.external_id as string }))
}

export const getActressRows = unstable_cache(fetchActressesRaw, ['sitemap-actresses'], {
  revalidate: TTL_ACTRESSES,
})

// ── ニュース ──────────────────────────────────────────────────────────────────
// 既存 sitemap と同一の掲載条件: is_published。順序: published_at DESC, id ASC。

async function fetchNewsRaw(): Promise<SitemapRow[]> {
  const supabase = getStatelessClient()
  const rows = await fetchAllPages(
    (from: number, to: number) =>
      supabase
        .from('sn_news')
        .select('id, slug, updated_at')
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    { keyOf: (r: { id: string }) => r.id },
  ) as { slug: string | null; updated_at: string | null }[]
  return rows.filter((r) => !!r.slug).map((r) => ({ s: r.slug as string, m: r.updated_at ?? undefined }))
}

export const getNewsRows = unstable_cache(fetchNewsRaw, ['sitemap-news'], {
  revalidate: TTL_NEWS,
})
