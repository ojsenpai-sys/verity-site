import { unstable_cache } from 'next/cache'
import { getStatelessSupabaseClient } from '@/lib/supabase/statelessClient'
import { getTopRankedWorks } from '@/lib/worksRanking'
import { isBadImageUrl, toHighResPackageUrl } from '@/lib/cidUtils'
import { actressExternalIdFromNumericId } from '@/lib/actressUrl'
import type { Article } from '@/lib/types'
import type { MetaEntry, TasteActressInfo, TasteCandidate, TasteCandidatePool } from './types'

// server専用データ取得層。src/lib/taste配下の他ファイル（candidate-selection/scoring/recommendation）
// はこのファイルに依存しない pure function のまま保つ（node --test で直接テストできる状態を維持する）。

const POOL_LIMIT = 400
const ACTRESS_LOOKUP_LIMIT = 300

function entryArray(meta: Record<string, unknown> | null | undefined, key: string): MetaEntry[] {
  const raw = meta?.[key]
  if (!Array.isArray(raw)) return []
  return (raw as Array<{ id?: unknown; name?: unknown }>)
    .filter(e => typeof e.id === 'number' && typeof e.name === 'string')
    .map(e => ({ id: e.id as number, name: e.name as string }))
}

function articleToCandidate(article: Article, isPopular: boolean): TasteCandidate | null {
  if (isBadImageUrl(article.image_url)) return null
  const meta = (article.metadata as Record<string, unknown> | null) ?? {}
  const actressEntries = entryArray(meta, 'actress')
  if (actressEntries.length === 0) return null // 出演女優が特定できない作品は診断/推薦の対象外

  return {
    id: article.id,
    externalId: article.external_id,
    title: article.title,
    slug: article.slug,
    imageUrl: toHighResPackageUrl(article.image_url),
    tags: (article.tags ?? []) as string[],
    actress: actressEntries,
    series: entryArray(meta, 'series'),
    maker: entryArray(meta, 'maker'),
    publishedAt: article.published_at,
    isPopular,
  }
}

const BASE_SELECT = 'id, external_id, title, slug, image_url, tags, metadata, published_at, is_active'

async function fetchMainPool(): Promise<Article[]> {
  const supabase = getStatelessSupabaseClient()
  const { data, error } = await supabase
    .from('articles')
    .select(BASE_SELECT)
    .eq('is_active', true)
    .not('image_url', 'is', null)
    .filter('metadata->>floor', 'eq', 'videoa')
    .not('metadata->>url', 'like', '%/dc/doujin/%')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(POOL_LIMIT)
  if (error) throw new Error(`taste pool articles read error: ${error.message}`)
  return (data ?? []) as Article[]
}

async function fetchActressIndex(candidates: readonly TasteCandidate[]): Promise<Record<string, TasteActressInfo>> {
  const ids = new Set<string>()
  for (const c of candidates) {
    for (const a of c.actress) ids.add(actressExternalIdFromNumericId(a.id))
    if (ids.size >= ACTRESS_LOOKUP_LIMIT) break
  }
  if (ids.size === 0) return {}

  const supabase = getStatelessSupabaseClient()
  const { data, error } = await supabase
    .from('actresses')
    .select('external_id, name, image_url')
    .in('external_id', [...ids])
    .eq('is_active', true)
  if (error) throw new Error(`taste pool actresses read error: ${error.message}`)

  const index: Record<string, TasteActressInfo> = {}
  for (const row of (data ?? []) as { external_id: string; name: string; image_url: string | null }[]) {
    index[row.external_id] = { externalId: row.external_id, name: row.name, imageUrl: row.image_url }
  }
  return index
}

// raw取得+マージ。unstable_cache は例外を投げた呼び出しの結果をキャッシュしないため、
// 失敗を長時間キャッシュする事故を防ぐ目的で catch せず throw する
// （RelatedWorksScored.tsx / worksRanking.ts と同じ方針）。
async function fetchTasteCandidatePoolRaw(): Promise<TasteCandidatePool> {
  const [mainRows, popularRows] = await Promise.all([
    fetchMainPool(),
    getTopRankedWorks(20),
  ])

  const candidateMap = new Map<string, TasteCandidate>()
  for (const article of mainRows) {
    const c = articleToCandidate(article, false)
    if (c) candidateMap.set(c.externalId, c)
  }
  for (const ranked of popularRows) {
    const existing = candidateMap.get(ranked.article.external_id)
    if (existing) {
      existing.isPopular = true
    } else {
      const c = articleToCandidate(ranked.article, true)
      if (c) candidateMap.set(c.externalId, c)
    }
  }

  const candidates = [...candidateMap.values()]
  const actressIndex = await fetchActressIndex(candidates)
  return { candidates, actressIndex }
}

// user/session/cookieに依存しないグローバル共通データのため、全ユーザー共通キャッシュとして安全
// （RelatedWorksScored.tsx Phase 3.2.6 と同方針）。TTLは新規出品/女優情報反映までの許容遅延として15分。
const getCachedTasteCandidatePool = unstable_cache(
  () => fetchTasteCandidatePoolRaw(),
  ['taste-candidate-pool'],
  { revalidate: 900 },
)

const EMPTY_POOL: TasteCandidatePool = { candidates: [], actressIndex: {} }

/**
 * Taste Check用の候補プールを取得する。Supabase障害時は空プールを返し、
 * 呼び出し側（page.tsx）でグレースフルに「現在ご利用いただけません」表示へ倒す
 * （Taste機能単体の失敗でVERITY全体を500にしない）。
 */
export async function getTasteCandidatePool(): Promise<TasteCandidatePool> {
  try {
    return await getCachedTasteCandidatePool()
  } catch (err) {
    console.error('[taste-pool]', err instanceof Error ? err.message : err)
    return EMPTY_POOL
  }
}
