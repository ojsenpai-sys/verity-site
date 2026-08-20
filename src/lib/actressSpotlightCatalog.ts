// ─────────────────────────────────────────────────────────────────────────────
// VERITY Spotlight v2 — 女優カタログ（「MORE MIYU」等の動的作品一覧）汎用ヘルパー
//
// 逢沢みゆ特集の「MORE MIYU」用に作るが、女優名タグさえ渡せば他特集
// （将来の彩月七緒「MORE NAO」等）でも再利用できるよう actressTag をパラメータ化する。
//
// 設計方針（Phase B指示に準拠）:
//   - DBクエリは「女優タグ一致・is_active・配信/発売済み」の1回のみ（N+1にしない）。
//   - フィルタ切替・ページング（もっと見る）は取得済みプールに対してJS側で行う
//     （フィルタ毎に別クエリを発行しない）。
//   - dedupe/フィルタ判定の pure ロジックは spotlightCatalogSelection.mjs に分離し
//     node:test で直接テストできるようにしている。
//   - プール取得は unstable_cache で5分キャッシュする。新作即時反映よりDB負荷軽減を
//     優先する判断（既存 fastestReleases.ts の運用と同じ考え方）。
// ─────────────────────────────────────────────────────────────────────────────

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { dedupeCatalog, isSingleActress, matchesFilter, compareRecency, paginate } from '@/lib/spotlightCatalogSelection.mjs'

export type CatalogItem = {
  external_id: string
  title: string
  slug: string | null
  image_url: string | null
  published_at: string | null
  metadata: Record<string, unknown> | null
  tags: string[] | null
}

export type CatalogFilter = 'all' | 'bishoujo' | 'kyonyu' | 'chijo' | 'joshikosei' | 'vr' | 'best'

export const CATALOG_FILTERS: { key: CatalogFilter; label: string }[] = [
  { key: 'all', label: '新しい順' },
  { key: 'bishoujo', label: '美少女' },
  { key: 'kyonyu', label: '巨乳' },
  { key: 'chijo', label: '痴女' },
  { key: 'joshikosei', label: '女子校生' },
  { key: 'vr', label: 'VR' },
  { key: 'best', label: 'BEST/総集編' },
]

// unstable_cache は cookies() に依存できないため、既存 fastestReleases.ts と同じく
// cookie非依存の専用クライアントを使う（公開データの読み取り専用）。
let _client: SupabaseClient | null = null
function getStatelessClient(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  _client = createSupabaseClient(url, key, { auth: { persistSession: false } })
  return _client
}

type RawRow = {
  external_id: string
  title: string
  slug: string | null
  image_url: string | null
  published_at: string | null
  fetched_at: string
  metadata: Record<string, unknown> | null
  tags: string[] | null
}

/**
 * actressTag に一致する「単独主演・公開中・配信/発売済み」作品プールを1回のクエリで取得し、
 * canonical dedupeまで済ませたうえで返す（フィルタ適用前の共通プール）。5分キャッシュ。
 */
async function fetchDedupedPool(actressTag: string): Promise<RawRow[]> {
  const supabase = getStatelessClient()
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('articles')
    .select('external_id, title, slug, image_url, published_at, fetched_at, metadata, tags')
    .eq('is_active', true)
    .contains('tags', [actressTag])
    .lte('published_at', nowIso)
  if (error) {
    console.error('[actressSpotlightCatalog] fetchDedupedPool:', error.message)
    return []
  }
  const rows = ((data ?? []) as RawRow[]).filter(isSingleActress)
  return dedupeCatalog(rows) as RawRow[]
}

const getCachedPool = unstable_cache(
  (actressTag: string) => fetchDedupedPool(actressTag),
  ['actress-spotlight-catalog-pool'],
  { revalidate: 300 },
)

function toItem(r: RawRow): CatalogItem {
  return {
    external_id: r.external_id,
    title: r.title,
    slug: r.slug,
    image_url: r.image_url,
    published_at: r.published_at,
    metadata: r.metadata,
    tags: r.tags,
  }
}

/**
 * フィルタ適用後の1ページ分を返す。BEST/総集編は「best」フィルタのときだけ
 * 対象に含める（通常フィルタは除外＝通常カタログに紛れ込ませない）。
 */
export async function getActressCatalogPage(opts: {
  actressTag: string
  filter: CatalogFilter
  offset: number
  limit: number
}): Promise<{ items: CatalogItem[]; total: number; hasMore: boolean }> {
  const pool = await getCachedPool(opts.actressTag)

  const filtered = (pool as RawRow[]).filter((r) => matchesFilter(r, opts.filter))
  filtered.sort(compareRecency)

  const { page, total, hasMore } = paginate(filtered, opts.offset, opts.limit)
  return { items: page.map(toItem), total, hasMore }
}
