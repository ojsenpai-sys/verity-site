import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { withFetchTimeout, SUPABASE_FETCH_TIMEOUT_MS } from '@/lib/supabase/timeout'
import { mergeRankedRows, clampToCacheDepth, type RankedWork } from '@/lib/worksRankingCore'
import type { Article } from '@/lib/types'

export type { RankedWork } from '@/lib/worksRankingCore'

// 人気作品ランキング（熱量×トレンドスコア）の取得ヘルパー。
//
// Phase RANK-2b: 匿名ページビュー毎に高コストな14日集計RPC（get_top_works_ranked,
// 031/053）を直接叩くことをやめ、pg_cronで定期更新される事前計算キャッシュ
// public.works_ranking_cache（054）から読むように変更した。get_top_works_ranked
// 自体は削除せず、cache のrefresh関数（refresh_works_ranking_cache）から
// 引き続き呼ばれる（詳細: supabase/migrations/054_works_ranking_cache.sql）。
// このファイルが VERITY全体で唯一の公開ランキング読み取り経路（canonical path）。
// ranking/page.tsx・HeroV21Section・HeroSection・admin-social-posts は全てここを経由する。
//
// キャッシュ深度は20（054のp_depth既定値）。limit>20を要求した場合、現状の
// 既知呼び出し元（最大10）では発生しないが、cacheの行数までしか返らない点に留意。
//
// RLS/GRANTでanonにSELECT許可済みのため、キャッシュ未populate時は空配列を返し、
// 呼び出し側でセクション非表示にグレースフル劣化させる（RPC未適用時の従来動作と同じ）。
//
// Phase 3.2.4: 全ユーザー共通の集計結果である（cookie/session/ユーザー固有情報に
// 一切依存しない）ことを確認した上で、120秒 TTL の unstable_cache で読み取り頻度を
// 削減する。unstable_cache のコールバック内では cookies() 等の dynamic API が使えないため、
// fastestReleases.ts と同様に cookie 非依存の stateless client を使う（DBキャッシュ導入後も
// 変更なし — SELECTは軽量だが、同一120秒窓内の重複読み取り自体を避ける価値は残るため維持）。

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
  const { data, error } = await supabase
    .from('works_ranking_cache')
    .select('external_id, points')
    .order('rank', { ascending: true })
    .limit(clampToCacheDepth(limit))
  if (error) throw new Error(`works_ranking_cache read error: ${error.message}`)
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
  return mergeRankedRows(rows, map)
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
