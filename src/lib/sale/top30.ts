import { createClient } from '@/lib/supabase/server'
import { FANZA_SALE_ITEMS, CHIJO_SALE_ITEMS } from '@/lib/social/saleData'

// VERITY SALE TOP30 の読み取りヘルパー。
//
// トップページは DMM API を直接呼ばない（Phase C方針）。scripts/sync-sale-top30.mjs が
// 1日1回バッチで public.sale_top30_snapshots(migration 049) を atomic 更新し、
// フロントはその最新スナップショットを読むだけ。
//
// フォールバック方針（#16）: sale_top30_snapshots は「現在のTOP30だけ保持」する設計のため、
// テーブルが読めた場合は原則そのまま使う（0件の異常系のみ緊急フォールバックへ）。
// テーブル自体が読めない場合（migration未適用・接続障害等）にのみ、
// 既存の手動キュレーション配列(saleData.ts)を緊急フォールバックとして使う。
// 「セクション空表示は禁止」の要件を満たすための最終防衛線であり、
// 通常運用ではこの分岐に入らない想定（sale-top30側は削除せず残す）。

export type SaleTop30Item = {
  rank: number
  cid: string
  score: number
  discountPct: number | null
  price: number | null
  listPrice: number | null
  campaignTitle: string | null
  campaignEndsAt: string | null
  title: string | null
  actress: string | null
  cover?: 'jp' | 'pl'
}

export type SaleTop30Result = {
  items: SaleTop30Item[]
  source: 'snapshot' | 'legacy_fallback'
}

const SNAPSHOT_KEY = 'fanza_sale_top30'

function legacyFallback(): SaleTop30Item[] {
  const merged = [...FANZA_SALE_ITEMS, ...CHIJO_SALE_ITEMS]
  const seen = new Set<string>()
  const out: SaleTop30Item[] = []
  for (const item of merged) {
    if (seen.has(item.cid)) continue
    seen.add(item.cid)
    out.push({
      rank: out.length + 1,
      cid: item.cid,
      score: 0,
      discountPct: null,
      price: null,
      listPrice: null,
      campaignTitle: null,
      campaignEndsAt: null,
      title: item.title ?? null,
      actress: item.actress ?? null,
      cover: item.cover,
    })
    if (out.length >= 30) break
  }
  return out
}

type SnapshotRow = {
  rank: number
  external_id: string
  score: number
  discount_pct: number | null
  price: number | null
  list_price: number | null
  campaign_title: string | null
  campaign_ends_at: string | null
  metadata: { title?: string; actress?: string | null; maker?: string | null } | null
}

/** VERITY SALE TOP30 の最新スナップショットを取得する。空表示は禁止のため、失敗時は必ずフォールバック配列を返す。 */
export async function getSaleTop30(): Promise<SaleTop30Result> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('sale_top30_snapshots')
      .select('rank, external_id, score, discount_pct, price, list_price, campaign_title, campaign_ends_at, metadata')
      .eq('snapshot_key', SNAPSHOT_KEY)
      .order('rank', { ascending: true })

    if (error) {
      console.error('[sale-top30] snapshot read failed, using legacy fallback:', error.message)
      return { items: legacyFallback(), source: 'legacy_fallback' }
    }
    if (!data || data.length === 0) {
      return { items: legacyFallback(), source: 'legacy_fallback' }
    }

    const rows = data as unknown as SnapshotRow[]
    const items: SaleTop30Item[] = rows.map((r) => ({
      rank: r.rank,
      cid: r.external_id,
      score: Number(r.score),
      discountPct: r.discount_pct,
      price: r.price,
      listPrice: r.list_price,
      campaignTitle: r.campaign_title,
      campaignEndsAt: r.campaign_ends_at,
      title: r.metadata?.title ?? null,
      actress: r.metadata?.actress ?? null,
    }))
    return { items, source: 'snapshot' }
  } catch (e) {
    console.error('[sale-top30] unexpected error reading snapshot, using legacy fallback:', e)
    return { items: legacyFallback(), source: 'legacy_fallback' }
  }
}
