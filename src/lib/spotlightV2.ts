// ─────────────────────────────────────────────────────────────────────────────
// VERITY Spotlight v2 — 汎用ヘルパー（女優特集全般で共用）
//
// pure ロジック（VR判定・未来日判定を使う分岐）は spotlightV2Selection.mjs に分離し、
// node:test で直接テストできるようにしている。本ファイルは DB 取得部分のみを持つ。
// satsuki-nao（v1）は単一特集ページに全ロジックを持たせていたが、v2以降は
// 「複数の女優特集で使い回せる部分」だけをここへ切り出す（過剰な抽象化はしない）。
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import type { Article } from '@/lib/types'
import { isVrWork, pickFirstReleased, getReservationStatus as getReservationStatusPure } from '@/lib/spotlightV2Selection.mjs'

export { isVrWork }

export type ReservationStatus = { isFuture: boolean; badge: string; ctaLabel: string }

/** published_at を基準に「予約中」か「配信中」かを判定し、バッジ/CTA文言を返す。 */
export function getReservationStatus(publishedAt: string | null): ReservationStatus {
  return getReservationStatusPure(publishedAt, new Date().toISOString())
}

/** CID 配列で記事を取得し、渡された順序を保持して返す（存在しない CID は除外）。 */
export async function getArticlesByCids(cids: string[]): Promise<Article[]> {
  if (cids.length === 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('articles')
    .select('id, external_id, title, slug, tags, summary, image_url, published_at, metadata, is_active')
    .eq('is_active', true)
    .in('external_id', cids)
  if (error) console.error('[spotlightV2] getArticlesByCids:', error.message)
  const map = new Map(((data as Article[]) ?? []).map((a) => [a.external_id, a]))
  return cids.map((c) => map.get(c)).filter(Boolean) as Article[]
}

/**
 * 候補を優先順で並べた記事配列から、現在すでに配信/発売済みの最初の1件を返す
 * （AVAILABLE NOW のフォールバック選定に使用）。該当なしなら null。
 */
export function pickAvailableNow<T extends { published_at: string | null }>(
  candidatesInPriorityOrder: T[],
): T | null {
  return pickFirstReleased(candidatesInPriorityOrder, new Date().toISOString())
}
