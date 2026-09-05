import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { withFetchTimeout, SUPABASE_FETCH_TIMEOUT_MS } from '@/lib/supabase/timeout'
import type { Article } from '@/lib/types'

// 人気作品ランキング（熱量×トレンドスコア / 031 RPC）の取得ヘルパー。
//
// anon は user_events を直接参照できないため SECURITY DEFINER RPC `get_top_works_ranked`
// 経由で集計値（external_id, points）を取り、articles を external_id で結合する。
// RPC 未適用 / 未集計時は空配列を返し、呼び出し側でセクション非表示にグレースフル劣化させる。
//
// ※ranking/page.tsx の getWorksRanking() と同一ロジック。将来はそちらもこのヘルパーへ
//   寄せて重複を解消できる（今回は破壊リスク回避のため ranking ページ側は変更しない）。
//
// Phase 3.2.4: get_top_works_ranked が全ユーザー共通の集計結果である（cookie/session/ユーザー
// 固有情報に一切依存しない）ことを確認した上で、120秒 TTL の unstable_cache でRPC呼び出し頻度を
// 削減する。unstable_cache のコールバック内では cookies() 等の dynamic API が使えないため、
// fastestReleases.ts と同様に cookie 非依存の stateless client を使う。

export type RankedWork = {
  rank:    number
  points:  number
  article: Article
}

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

// cache対象の生取得。エラー時は握りつぶさず throw する — unstable_cache は
// 例外を投げた呼び出しの結果をキャッシュしないため、失敗を長時間キャッシュする事故を防げる。
async function fetchTopRankedWorksRaw(limit: number): Promise<RankedWork[]> {
  const supabase = getStatelessClient()
  const { data, error } = await supabase.rpc('get_top_works_ranked', { p_limit: limit })
  if (error) throw new Error(`get_top_works_ranked rpc error: ${error.message}`)
  const rows = (data ?? []) as { external_id: string; points: number }[]
  if (rows.length === 0) return []

  const ids = rows.map(r => r.external_id)
  const { data: articles, error: articlesErr } = await supabase
    .from('articles')
    // published_at は Hero v2.1（発売日表示）が利用。v2 rail は未使用のため後方互換。
    .select('id, external_id, title, image_url, slug, tags, metadata, source, published_at')
    .in('external_id', ids)
    .eq('is_active', true)
  if (articlesErr) throw new Error(`articles lookup error: ${articlesErr.message}`)

  const map = new Map(((articles ?? []) as Article[]).map(a => [a.external_id, a]))

  return rows
    .map(r => {
      const article = map.get(r.external_id)
      return article ? { points: Number(r.points), article } : null
    })
    .filter((r): r is Omit<RankedWork, 'rank'> => r !== null)
    .map((r, i) => ({ rank: i + 1, ...r }))
}

// キャッシュキーは limit 引数から自動導出される(unstable_cacheは引数を自動的にキーへ含める)。
// user/session/cookieはこの関数の入力に一切含まれないため、全ユーザー共通のキャッシュとして安全。
const getCachedTopRankedWorks = unstable_cache(
  (limit: number) => fetchTopRankedWorksRaw(limit),
  ['top-ranked-works'],
  { revalidate: 120 },
)

export async function getTopRankedWorks(limit = 10): Promise<RankedWork[]> {
  try {
    return await getCachedTopRankedWorks(limit)
  } catch (err) {
    console.error('[works-ranking]', err instanceof Error ? err.message : err)
    return []
  }
}
