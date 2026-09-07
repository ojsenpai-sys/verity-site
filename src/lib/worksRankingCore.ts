// worksRanking.ts のDB非依存な純粋ロジックのみを切り出したモジュール。
// next/cache 等フレームワーク依存importを持たないため、node --test で
// 直接importして単体テストできる（src/lib/supabase/timeout.ts と同じ方針）。
import type { Article } from '@/lib/types'

export type RankedWork = {
  rank:    number
  points:  number
  article: Article
}

// works_ranking_cache のrefresh時点のdepth（054のp_depth既定値と一致させること）。
export const WORKS_RANKING_CACHE_DEPTH = 20

// 要求limitをcache深度に収める。cache行数を超えるlimitを要求しても
// works_ranking_cacheにその行数が存在しないため、これ以上は返しようがない。
export function clampToCacheDepth(limit: number): number {
  return Math.min(limit, WORKS_RANKING_CACHE_DEPTH)
}

// cache行 + articles を突合し、articleが見つからない行(削除/非activeになった等)は
// 除外した上でrankを1から振り直す純粋関数。
export function mergeRankedRows(
  rows: { external_id: string; points: number }[],
  articlesById: Map<string, Article>,
): RankedWork[] {
  return rows
    .map(r => {
      const article = articlesById.get(r.external_id)
      return article ? { points: Number(r.points), article } : null
    })
    .filter((r): r is Omit<RankedWork, 'rank'> => r !== null)
    .map((r, i) => ({ rank: i + 1, ...r }))
}
