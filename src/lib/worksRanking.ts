import { createClient } from '@/lib/supabase/server'
import type { Article } from '@/lib/types'

// 人気作品ランキング（熱量×トレンドスコア / 031 RPC）の取得ヘルパー。
//
// anon は user_events を直接参照できないため SECURITY DEFINER RPC `get_top_works_ranked`
// 経由で集計値（external_id, points）を取り、articles を external_id で結合する。
// RPC 未適用 / 未集計時は空配列を返し、呼び出し側でセクション非表示にグレースフル劣化させる。
//
// ※ranking/page.tsx の getWorksRanking() と同一ロジック。将来はそちらもこのヘルパーへ
//   寄せて重複を解消できる（今回は破壊リスク回避のため ranking ページ側は変更しない）。

export type RankedWork = {
  rank:    number
  points:  number
  article: Article
}

export async function getTopRankedWorks(limit = 10): Promise<RankedWork[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_top_works_ranked', { p_limit: limit })
  if (error) { console.error('[works-ranking]', error.message); return [] }
  const rows = (data ?? []) as { external_id: string; points: number }[]
  if (rows.length === 0) return []

  const ids = rows.map(r => r.external_id)
  const { data: articles } = await supabase
    .from('articles')
    .select('id, external_id, title, image_url, slug, tags, metadata, source')
    .in('external_id', ids)
    .eq('is_active', true)

  const map = new Map(((articles ?? []) as Article[]).map(a => [a.external_id, a]))

  return rows
    .map(r => {
      const article = map.get(r.external_id)
      return article ? { points: Number(r.points), article } : null
    })
    .filter((r): r is Omit<RankedWork, 'rank'> => r !== null)
    .map((r, i) => ({ rank: i + 1, ...r }))
}
