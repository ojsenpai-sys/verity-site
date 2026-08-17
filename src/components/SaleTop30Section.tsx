import { getSaleTop30 } from '@/lib/sale/top30'
import { SaleTop30Client } from '@/components/SaleTop30Client'

// VERITY SALE TOP30 — トップページ常設セクション（Server Component）。
// データ取得は sale_top30_snapshots スナップショットのみ（DMM APIをSSRで直接叩かない）。
// 取得失敗時も getSaleTop30() 側で必ず何らかの配列を返す(legacy_fallback)ため、
// このセクション自体が空表示になることはない。
export async function SaleTop30Section() {
  const { items } = await getSaleTop30()
  return <SaleTop30Client items={items} />
}
